/**
 * DataTable — GitLab Pajamas visual query search bar.
 *
 * Single unified bar that combines search + filter tokens.
 * Supports:
 *  - Token-based filters with operators (is, is not, contains…)
 *  - Multi-select (OR within a filter): "Statut est Actifs ou Archivés"
 *  - Multiple tokens combined with AND logic
 *  - Free text search
 *
 * Flow: click bar → categories → operator (if multiple) → values → done
 * Ref: https://design.gitlab.com/patterns/filtering
 */
import { useState, useRef, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Search, LayoutList, LayoutGrid, CreditCard, Zap,
  Columns3, Download, Upload,
  X, Check, FileSpreadsheet, FileText,
  SlidersHorizontal, FileDown, Settings2,
  CheckCheck, ChevronDown,
} from 'lucide-react'
import type { DataTableBatchAction } from './types'
import { cn } from '@/lib/utils'
import type {
  ViewMode, DataTableFilterDef, ImportExportConfig, ExportFormat,
  FilterOperator, FilterCombinator,
} from './types'
import { FILTER_OPERATOR_LABELS, FILTER_COMBINATOR_LABELS } from './types'

interface ToolbarProps {
  // Search
  searchValue?: string
  onSearchChange?: (value: string) => void
  searchPlaceholder?: string

  // Filters (token-based)
  filters?: DataTableFilterDef[]
  activeFilters?: Record<string, unknown>
  onFilterChange?: (filterId: string, value: unknown) => void
  // Combinators between tokens (AND/OR)
  filterCombinators?: FilterCombinator[]
  onFilterCombinatorChange?: (index: number, value: FilterCombinator) => void

  // View mode
  viewModes?: ViewMode[]
  currentViewMode: ViewMode
  onViewModeChange: (mode: ViewMode) => void

  // Column visibility
  columnVisibility?: boolean
  allColumns?: { id: string; header: string; isVisible: boolean }[]
  onToggleColumn?: (columnId: string) => void

  // Import/Export
  importExport?: ImportExportConfig
  onExport?: (format: ExportFormat) => void
  onAdvancedExport?: () => void
  onImportClick?: () => void
  onDownloadTemplate?: () => void

  // Selection
  selectable?: boolean
  selectionMode?: boolean
  onToggleSelectionMode?: () => void
  selectedCount?: number
  totalCount?: number
  onClearSelection?: () => void

  // Batch actions (as data, rendered as dropdown)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  batchActions?: DataTableBatchAction<any>[] | null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  selectedRows?: any[]

  // Extra slots
  toolbarLeft?: React.ReactNode
  toolbarRight?: React.ReactNode
}

const VIEW_MODE_ICONS: Record<ViewMode, typeof LayoutList> = {
  table: LayoutList,
  grid: LayoutGrid,
  cards: CreditCard,
  performance: Zap,
}

const VIEW_MODE_LABELS: Record<ViewMode, string> = {
  table: 'Liste',
  grid: 'Grille',
  cards: 'Cartes',
  performance: 'Performance',
}

const EXPORT_FORMAT_CONFIG: Record<ExportFormat, { icon: typeof Download; label: string }> = {
  csv: { icon: Download, label: 'CSV' },
  xlsx: { icon: FileSpreadsheet, label: 'Excel (.xlsx)' },
  pdf: { icon: FileText, label: 'PDF' },
}

// ── Dropdown state machine ──────────────────────────────────
type DropdownState =
  | { type: 'closed' }
  | { type: 'categories' }
  | { type: 'operators'; filterId: string }
  | { type: 'values'; filterId: string; operator: FilterOperator }
  | { type: 'action'; id: string }

// ── Token helpers ───────────────────────────────────────────
interface ResolvedToken {
  filterId: string
  label: string
  operator: FilterOperator
  /** Display label(s) for the value(s). */
  valueLabels: string[]
  /** Raw value (single or array). */
  rawValue: unknown
}

function resolveTokens(
  filters: DataTableFilterDef[],
  activeFilters: Record<string, unknown>,
): ResolvedToken[] {
  const tokens: ResolvedToken[] = []
  for (const filter of filters) {
    const raw = activeFilters[filter.id]
    if (raw === undefined || raw === null || raw === '') continue

    // Structured value: { operator, value } or { operator, values }
    if (typeof raw === 'object' && raw !== null && !Array.isArray(raw) && 'operator' in raw) {
      const structured = raw as { operator: FilterOperator; value?: unknown; values?: unknown[]; from?: string; to?: string }
      const op = structured.operator

      // Date-range: chip shows the date(s) literally (no options lookup).
      if (filter.type === 'date-range') {
        const fmt = (s: string) => {
          if (!s) return ''
          const [y, m, d] = s.split('-')
          return d && m && y ? `${d}/${m}/${y.slice(2)}` : s
        }
        let labels: string[] = []
        if (op === 'between') {
          const f = fmt(structured.from ?? '')
          const t = fmt(structured.to ?? '')
          if (f && t) labels = [`${f} → ${t}`]
          else if (f) labels = [`≥ ${f}`]
          else if (t) labels = [`≤ ${t}`]
        } else if (op === 'gt' && structured.value) {
          labels = [fmt(String(structured.value))]
        } else if (op === 'lt' && structured.value) {
          labels = [fmt(String(structured.value))]
        }
        if (labels.length > 0) {
          tokens.push({ filterId: filter.id, label: filter.label, operator: op, valueLabels: labels, rawValue: raw })
        }
        continue
      }

      const vals = structured.values ?? (structured.value !== undefined ? [structured.value] : [])
      const labels = vals.map((v) => filter.options?.find((o) => o.value === v)?.label ?? String(v))
      if (labels.length > 0) {
        tokens.push({ filterId: filter.id, label: filter.label, operator: op, valueLabels: labels, rawValue: raw })
      }
      continue
    }

    // Array value (multi-select, OR logic, implied operator = 'is')
    if (Array.isArray(raw)) {
      const labels = (raw as string[]).map((v) => filter.options?.find((o) => o.value === v)?.label ?? String(v))
      if (labels.length > 0) {
        tokens.push({ filterId: filter.id, label: filter.label, operator: 'is' as FilterOperator, valueLabels: labels, rawValue: raw })
      }
      continue
    }

    // Simple value (select, implied operator = 'is')
    const opt = filter.options?.find((o) => o.value === raw)
    if (opt) {
      tokens.push({ filterId: filter.id, label: filter.label, operator: 'is' as FilterOperator, valueLabels: [opt.label], rawValue: raw })
    }
  }
  return tokens
}

export function DataTableToolbar({
  searchValue,
  onSearchChange,
  searchPlaceholder = 'Filtrer les résultats…',
  filters,
  activeFilters,
  onFilterChange,
  filterCombinators,
  onFilterCombinatorChange,
  viewModes,
  currentViewMode,
  onViewModeChange,
  columnVisibility,
  allColumns,
  onToggleColumn,
  importExport,
  onExport,
  onAdvancedExport,
  onImportClick,
  onDownloadTemplate,
  selectable = false,
  selectionMode = false,
  onToggleSelectionMode,
  selectedCount = 0,
  totalCount = 0,
  onClearSelection,
  batchActions,
  selectedRows = [],
  toolbarLeft,
  toolbarRight,
}: ToolbarProps) {
  const { t } = useTranslation()
  const [dropdown, setDropdown] = useState<DropdownState>({ type: 'closed' })
  const [filterSearch, setFilterSearch] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Close dropdown on outside click
  useEffect(() => {
    if (dropdown.type === 'closed') return
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setDropdown({ type: 'closed' })
        setFilterSearch('')
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [dropdown.type])

  const hasExport = importExport?.exportFormats && importExport.exportFormats.length > 0
  const hasFilters = filters && filters.length > 0

  // Resolve active tokens
  const activeTokens = resolveTokens(filters ?? [], activeFilters ?? {})
  const hasActiveContent = activeTokens.length > 0 || (searchValue && searchValue.length > 0)

  // ── Handlers ──────────────────────────────────────────────

  const handleBarClick = useCallback(() => {
    if (dropdown.type === 'closed' && hasFilters) {
      setDropdown({ type: 'categories' })
      setFilterSearch('')
    }
    inputRef.current?.focus()
  }, [dropdown.type, hasFilters])

  const handleSelectCategory = useCallback((filterId: string) => {
    const filter = filters?.find((f) => f.id === filterId)
    // Default operator set: date-range gets a between/gt/lt set,
    // everything else defaults to ['is'] so the values step shows up.
    const defaultOps: FilterOperator[] = filter?.type === 'date-range'
      ? ['between', 'gt', 'lt']
      : ['is']
    const ops = filter?.operators ?? defaultOps
    // Skip operator step if only one operator
    if (ops.length <= 1) {
      setDropdown({ type: 'values', filterId, operator: ops[0] ?? 'is' })
    } else {
      setDropdown({ type: 'operators', filterId })
    }
    setFilterSearch('')
  }, [filters])

  const handleSelectOperator = useCallback((filterId: string, operator: FilterOperator) => {
    setDropdown({ type: 'values', filterId, operator })
    setFilterSearch('')
  }, [])

  const handleSelectValue = useCallback((filterId: string, value: string, operator: FilterOperator, isMultiSelect: boolean) => {
    if (isMultiSelect) {
      // Toggle value in array
      const current = activeFilters?.[filterId]
      let currentValues: string[] = []

      if (Array.isArray(current)) {
        currentValues = [...current]
      } else if (typeof current === 'object' && current !== null && 'values' in current) {
        currentValues = [...((current as { values: string[] }).values ?? [])]
      } else if (typeof current === 'string') {
        currentValues = [current]
      }

      const idx = currentValues.indexOf(value)
      if (idx >= 0) {
        currentValues.splice(idx, 1)
      } else {
        currentValues.push(value)
      }

      if (currentValues.length === 0) {
        onFilterChange?.(filterId, undefined)
      } else if (operator === 'is' && currentValues.length === 1) {
        // Simplify single-value back to simple format
        onFilterChange?.(filterId, currentValues[0])
      } else if (operator === 'is') {
        onFilterChange?.(filterId, currentValues)
      } else {
        onFilterChange?.(filterId, { operator, values: currentValues })
      }
      // Keep dropdown open for multi-select
      return
    }

    // Single select
    const currentVal = activeFilters?.[filterId]
    const isSame = currentVal === value || (
      typeof currentVal === 'object' && currentVal !== null && 'value' in currentVal && (currentVal as { value: string }).value === value
    )

    if (isSame) {
      onFilterChange?.(filterId, undefined)
    } else if (operator === 'is') {
      onFilterChange?.(filterId, value)
    } else {
      onFilterChange?.(filterId, { operator, value })
    }

    setDropdown({ type: 'closed' })
    setFilterSearch('')
    inputRef.current?.focus()
  }, [activeFilters, onFilterChange])

  const handleRemoveToken = useCallback((filterId: string) => {
    onFilterChange?.(filterId, undefined)
  }, [onFilterChange])

  const handleClearAll = useCallback(() => {
    activeTokens.forEach((t) => onFilterChange?.(t.filterId, undefined))
    onSearchChange?.('')
    setDropdown({ type: 'closed' })
    setFilterSearch('')
  }, [activeTokens, onFilterChange, onSearchChange])

  const handleInputChange = useCallback((value: string) => {
    if (dropdown.type === 'categories' || dropdown.type === 'values' || dropdown.type === 'operators') {
      setFilterSearch(value)
    } else {
      onSearchChange?.(value)
    }
  }, [dropdown.type, onSearchChange])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setDropdown({ type: 'closed' })
      setFilterSearch('')
      inputRef.current?.blur()
    }
    if (e.key === 'Backspace' && !searchValue && !filterSearch && activeTokens.length > 0) {
      const lastToken = activeTokens[activeTokens.length - 1]
      handleRemoveToken(lastToken.filterId)
    }
  }, [searchValue, filterSearch, activeTokens, handleRemoveToken])

  // ── Computed display values ───────────────────────────────

  const inputValue = dropdown.type !== 'closed' && dropdown.type !== 'action'
    ? filterSearch
    : searchValue ?? ''

  const placeholder = (() => {
    if (dropdown.type === 'operators') {
      const filter = filters?.find((f) => f.id === (dropdown as { filterId: string }).filterId)
      return `Opérateur pour ${filter?.label?.toLowerCase() ?? ''}…`
    }
    if (dropdown.type === 'values') {
      const filter = filters?.find((f) => f.id === (dropdown as { filterId: string }).filterId)
      return `Chercher ${filter?.label?.toLowerCase() ?? ''}…`
    }
    if (dropdown.type === 'categories') return 'Sélectionner un filtre ou rechercher…'
    if (activeTokens.length > 0) return 'Rechercher…'
    return searchPlaceholder
  })()

  const filteredCategories = (filters ?? []).filter((f) =>
    !filterSearch || f.label.toLowerCase().includes(filterSearch.toLowerCase())
  )

  const currentFilterId = (dropdown.type === 'values' || dropdown.type === 'operators')
    ? (dropdown as { filterId: string }).filterId
    : null
  const currentFilter = currentFilterId ? filters?.find((f) => f.id === currentFilterId) : null
  const currentOperator = dropdown.type === 'values' ? (dropdown as { operator: FilterOperator }).operator : null

  const filteredValues = currentFilter?.options?.filter((o) =>
    !filterSearch || o.label.toLowerCase().includes(filterSearch.toLowerCase())
  ) ?? []

  const defaultOpsForFilter: FilterOperator[] = currentFilter?.type === 'date-range'
    ? ['between', 'gt', 'lt']
    : ['is', 'is_not']
  const filteredOperators = (currentFilter?.operators ?? defaultOpsForFilter).filter((op) =>
    !filterSearch || FILTER_OPERATOR_LABELS[op].toLowerCase().includes(filterSearch.toLowerCase())
  )

  // For multi-select: get currently selected values as array
  const getSelectedValues = (filterId: string): string[] => {
    const raw = activeFilters?.[filterId]
    if (!raw) return []
    if (Array.isArray(raw)) return raw
    if (typeof raw === 'object' && raw !== null && 'values' in raw) return (raw as { values: string[] }).values ?? []
    if (typeof raw === 'string') return [raw]
    return []
  }

  const isMultiSelectFilter = currentFilter?.type === 'multi-select'

  return (
    <div className="@container/dt-toolbar border-b border-border shrink-0" ref={containerRef}>
      {/* Layout reflows on the toolbar's actual container width (not
          the viewport) — the panel-detail view shrinks the toolbar
          to ~50% of the viewport, so viewport breakpoints alone make
          the right-side cluster overlap the search. Container queries
          fix that. */}
      <div className="flex flex-wrap @md/dt-toolbar:flex-nowrap items-center min-h-9 @md/dt-toolbar:h-9 px-2 @md/dt-toolbar:px-3 py-1 @md/dt-toolbar:py-0 gap-1.5 @md/dt-toolbar:gap-2">

        {/* ── Visual query search bar ── */}
        <div
          className={cn(
            'relative flex items-center flex-1 min-w-0 h-7 gap-1 px-2 rounded-md border transition-colors cursor-text',
            dropdown.type !== 'closed' && dropdown.type !== 'action'
              ? 'border-primary/50 ring-1 ring-primary/20'
              : 'border-border hover:border-border-hover',
          )}
          onClick={handleBarClick}
        >
          <Search size={13} className="text-muted-foreground shrink-0" />

          {/* Active filter tokens */}
          {activeTokens.map((token, i) => (
            <span key={token.filterId} className="inline-flex items-center shrink-0 gap-0.5">
              {/* Combinator between tokens (AND/OR) — clickable to toggle */}
              {i > 0 && (
                onFilterCombinatorChange ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      const current = filterCombinators?.[i - 1] ?? 'and'
                      onFilterCombinatorChange(i - 1, current === 'and' ? 'or' : 'and')
                    }}
                    className={cn(
                      'text-[9px] font-semibold uppercase mx-0.5 px-1 py-px rounded cursor-pointer transition-colors select-none',
                      (filterCombinators?.[i - 1] ?? 'and') === 'or'
                        ? 'bg-primary/15 text-primary hover:bg-primary/25'
                        : 'text-primary/60 hover:bg-accent hover:text-primary/80',
                    )}
                    title={t('ui.cliquer_pour_basculer_et_ou')}
                  >
                    {FILTER_COMBINATOR_LABELS[filterCombinators?.[i - 1] ?? 'and']}
                  </button>
                ) : (
                  <span className="text-[9px] text-primary/60 font-semibold uppercase mx-0.5">et</span>
                )
              )}
              <span className="inline-flex items-center h-[20px] rounded overflow-hidden text-[11px] font-medium border border-border/60">
                {/* Filter name */}
                <span className="px-1.5 bg-accent/80 text-muted-foreground border-r border-border/60">
                  {token.label}
                </span>
                {/* Operator */}
                <span className="px-1 bg-accent/40 text-muted-foreground/70 text-[10px] border-r border-border/60">
                  {FILTER_OPERATOR_LABELS[token.operator]}
                </span>
                {/* Value(s) — joined with "ou" for multi-select */}
                <span className="px-1.5 text-foreground">
                  {token.valueLabels.length > 1
                    ? token.valueLabels.map((v, j) => (
                        <span key={j}>
                          {j > 0 && <span className="text-primary/60 text-[9px] mx-0.5">ou</span>}
                          {v}
                        </span>
                      ))
                    : token.valueLabels[0]
                  }
                </span>
                {/* Remove button */}
                <button
                  onClick={(e) => { e.stopPropagation(); handleRemoveToken(token.filterId) }}
                  className="px-0.5 hover:bg-destructive/10 hover:text-destructive transition-colors h-full flex items-center"
                >
                  <X size={10} />
                </button>
              </span>
            </span>
          ))}

          {/* Text input */}
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={(e) => handleInputChange(e.target.value)}
            onFocus={() => {
              if (dropdown.type === 'closed' && hasFilters) {
                setDropdown({ type: 'categories' })
                setFilterSearch('')
              }
            }}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            className="flex-1 min-w-[60px] bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground/50"
          />

          {/* Clear all */}
          {hasActiveContent && (
            <button
              onClick={(e) => { e.stopPropagation(); handleClearAll() }}
              className="shrink-0 text-muted-foreground/60 hover:text-foreground transition-colors"
              title={t('ui.effacer_tout')}
            >
              <X size={13} />
            </button>
          )}

          {/* ── Dropdown: filter categories ── */}
          {dropdown.type === 'categories' && filteredCategories.length > 0 && (
            <div className="absolute left-0 top-full mt-1 z-50 min-w-[220px] max-w-[280px] rounded-md border bg-popover shadow-lg py-1">
              <p className="px-3 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                Filtres disponibles
              </p>
              {filteredCategories.map((filter) => {
                const isActive = activeFilters?.[filter.id] !== undefined && activeFilters?.[filter.id] !== null
                return (
                  <button
                    key={filter.id}
                    onClick={(e) => { e.stopPropagation(); handleSelectCategory(filter.id) }}
                    className={cn(
                      'flex items-center gap-2 w-full px-3 py-1.5 text-xs hover:bg-accent text-left transition-colors',
                      isActive && 'text-primary',
                    )}
                  >
                    <SlidersHorizontal size={12} className="text-muted-foreground shrink-0" />
                    <span className="flex-1 text-foreground">{filter.label}</span>
                    {filter.type === 'multi-select' && (
                      <span className="text-[9px] text-muted-foreground/50 bg-accent/60 px-1 rounded">multi</span>
                    )}
                    {isActive && (
                      <span className="text-[10px] text-primary/70">actif</span>
                    )}
                  </button>
                )
              })}
            </div>
          )}

          {/* ── Dropdown: operator selection ── */}
          {dropdown.type === 'operators' && currentFilter && (
            <div className="absolute left-0 top-full mt-1 z-50 min-w-[200px] max-w-[260px] rounded-md border bg-popover shadow-lg py-1">
              <p className="px-3 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                {currentFilter.label} — opérateur
              </p>
              {filteredOperators.map((op) => (
                <button
                  key={op}
                  onClick={(e) => { e.stopPropagation(); handleSelectOperator(currentFilter.id, op) }}
                  className="flex items-center gap-2 w-full px-3 py-1.5 text-xs hover:bg-accent text-left transition-colors"
                >
                  <span className="text-foreground font-medium">{FILTER_OPERATOR_LABELS[op]}</span>
                  <span className="text-muted-foreground/50 text-[10px]">({op})</span>
                </button>
              ))}
            </div>
          )}

          {/* ── Dropdown: filter values ── */}
          {dropdown.type === 'values' && currentFilter && currentOperator && currentFilter.type === 'date-range' && (
            <DateRangeValuePicker
              filter={currentFilter}
              operator={currentOperator}
              currentValue={activeFilters?.[currentFilter.id]}
              onApply={(value) => {
                onFilterChange?.(currentFilter.id, value)
                setDropdown({ type: 'closed' })
                setFilterSearch('')
                inputRef.current?.focus()
              }}
              onClear={() => {
                onFilterChange?.(currentFilter.id, undefined)
                setDropdown({ type: 'closed' })
                setFilterSearch('')
                inputRef.current?.focus()
              }}
            />
          )}
          {dropdown.type === 'values' && currentFilter && currentOperator && currentFilter.type !== 'date-range' && (
            <div className="absolute left-0 top-full mt-1 z-50 min-w-[220px] max-w-[280px] rounded-md border bg-popover shadow-lg py-1">
              <p className="px-3 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                {currentFilter.label} {FILTER_OPERATOR_LABELS[currentOperator]}
              </p>
              {filteredValues.map((opt) => {
                const selectedVals = getSelectedValues(currentFilter.id)
                const isSelected = selectedVals.includes(opt.value)
                  || activeFilters?.[currentFilter.id] === opt.value
                return (
                  <button
                    key={opt.value}
                    onClick={(e) => {
                      e.stopPropagation()
                      handleSelectValue(currentFilter.id, opt.value, currentOperator, isMultiSelectFilter)
                    }}
                    className="flex items-center gap-2 w-full px-3 py-1.5 text-xs hover:bg-accent text-left transition-colors"
                  >
                    <span className={cn(
                      'h-3.5 w-3.5 rounded-sm border flex items-center justify-center shrink-0',
                      isSelected ? 'bg-primary border-primary' : 'border-border',
                    )}>
                      {isSelected && <Check size={9} className="text-white" />}
                    </span>
                    {opt.icon}
                    <span className="flex-1 text-foreground">{opt.label}</span>
                    {opt.count != null && (
                      <span className="text-muted-foreground/50 tabular-nums text-[11px]">{opt.count}</span>
                    )}
                  </button>
                )
              })}
              {/* Done button for multi-select */}
              {isMultiSelectFilter && (
                <div className="border-t border-border/50 mt-1 pt-1 px-3 pb-1">
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      setDropdown({ type: 'closed' })
                      setFilterSearch('')
                      inputRef.current?.focus()
                    }}
                    className="w-full text-center text-xs text-primary font-medium py-1 hover:bg-accent rounded transition-colors"
                  >
                    Terminé
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Right side actions ── */}

        {/* Selection mode toggle + info + batch actions dropdown */}
        {selectable && (
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={onToggleSelectionMode}
              className={cn(
                'p-1 rounded transition-colors',
                selectionMode
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground',
              )}
              title={selectionMode ? 'Quitter la sélection' : 'Sélection multiple'}
            >
              <CheckCheck size={14} />
            </button>
            {selectionMode && selectedCount > 0 && (
              <>
                <span className="text-[11px] text-primary font-medium whitespace-nowrap">
                  {selectedCount}
                </span>
                {/* Batch actions dropdown */}
                {batchActions && batchActions.length > 0 && (
                  <div className="relative">
                    <button
                      onClick={() => setDropdown(
                        dropdown.type === 'action' && dropdown.id === '_batch'
                          ? { type: 'closed' }
                          : { type: 'action', id: '_batch' }
                      )}
                      className="gl-button-sm gl-button-confirm items-center gap-1 text-[11px] px-2 py-0.5"
                    >
                      Actions <ChevronDown size={10} />
                    </button>
                    {dropdown.type === 'action' && dropdown.id === '_batch' && (
                      <div className="absolute right-0 top-full mt-1 z-50 min-w-[200px] max-w-[calc(100vw-1.5rem)] max-h-[min(65vh,30rem)] overflow-y-auto rounded-md border bg-popover shadow-lg py-1">
                        {batchActions.map((action) => {
                          const Icon = typeof action.icon === 'function' ? action.icon : null
                          return (
                          <button
                            key={action.id}
                            onClick={() => {
                              action.onAction(selectedRows)
                              setDropdown({ type: 'closed' })
                            }}
                            className={cn(
                              'flex items-center gap-2 w-full px-3 py-1.5 text-xs text-left hover:bg-accent transition-colors',
                              action.variant === 'danger' && 'text-destructive hover:bg-destructive/10',
                            )}
                          >
                            {Icon ? <Icon className="h-3.5 w-3.5" /> : (action.icon as React.ReactNode)}
                            {action.label}
                          </button>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )}
                <button
                  className="text-[11px] text-muted-foreground hover:text-foreground whitespace-nowrap"
                  onClick={onClearSelection}
                >
                  Effacer
                </button>
              </>
            )}
            <div className="w-px h-4 bg-border" />
          </div>
        )}

        {toolbarLeft}

        <span className="text-[11px] text-muted-foreground tabular-nums shrink-0 whitespace-nowrap hidden @md/dt-toolbar:inline">
          {totalCount.toLocaleString('fr-FR')} résultat{totalCount !== 1 ? 's' : ''}
        </span>

        <div className="w-px h-4 bg-border shrink-0 hidden @md/dt-toolbar:block" />

        {/* View mode toggle */}
        {viewModes && viewModes.length > 1 && (
          <div className="flex items-center rounded overflow-hidden border border-border/50 shrink-0">
            {viewModes.map((mode) => {
              const Icon = VIEW_MODE_ICONS[mode]
              return (
                <button
                  key={mode}
                  title={VIEW_MODE_LABELS[mode]}
                  onClick={() => onViewModeChange(mode)}
                  className={cn(
                    'p-1 transition-colors',
                    currentViewMode === mode
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                  )}
                >
                  <Icon size={13} />
                </button>
              )
            })}
          </div>
        )}

        {/* Column visibility */}
        {columnVisibility && allColumns && (
          <div className="relative shrink-0">
            <button
              onClick={() => setDropdown(
                dropdown.type === 'action' && dropdown.id === '_columns'
                  ? { type: 'closed' }
                  : { type: 'action', id: '_columns' }
              )}
              className="p-1 rounded text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
              title="Colonnes visibles"
            >
              <Columns3 size={13} />
            </button>
            {dropdown.type === 'action' && dropdown.id === '_columns' && (
              <div className="absolute right-0 top-full mt-1 z-50 min-w-[170px] max-w-[calc(100vw-1.5rem)] max-h-[min(65vh,30rem)] overflow-y-auto rounded-md border bg-popover shadow-lg py-1">
                <p className="px-3 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide border-b border-border/50 mb-0.5">
                  Colonnes visibles
                </p>
                {allColumns.map((col) => (
                  <button
                    key={col.id}
                    onClick={() => onToggleColumn?.(col.id)}
                    className="flex items-center gap-2 w-full px-3 py-1.5 text-xs hover:bg-accent text-left"
                  >
                    <span className={cn(
                      'h-3.5 w-3.5 rounded-sm border flex items-center justify-center',
                      col.isVisible ? 'bg-primary border-primary' : 'border-border',
                    )}>
                      {col.isVisible && <Check size={9} className="text-white" />}
                    </span>
                    <span>{col.header}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Export */}
        {hasExport && (
          <div className="relative shrink-0">
            <button
              onClick={() => setDropdown(
                dropdown.type === 'action' && dropdown.id === '_export'
                  ? { type: 'closed' }
                  : { type: 'action', id: '_export' }
              )}
              className="p-1 rounded text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
              title="Exporter"
            >
              <Download size={13} />
            </button>
            {dropdown.type === 'action' && dropdown.id === '_export' && (
              <div className="absolute right-0 top-full mt-1 z-50 min-w-[150px] max-w-[calc(100vw-1.5rem)] max-h-[min(65vh,30rem)] overflow-y-auto rounded-md border bg-popover shadow-lg py-1">
                <p className="px-3 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide border-b border-border/50 mb-0.5">
                  Exporter en
                </p>
                {importExport!.exportFormats!.map((fmt) => {
                  const config = EXPORT_FORMAT_CONFIG[fmt]
                  const Icon = config.icon
                  return (
                    <button
                      key={fmt}
                      onClick={() => { onExport?.(fmt); setDropdown({ type: 'closed' }) }}
                      className="flex items-center gap-2 w-full px-3 py-1.5 text-xs hover:bg-accent text-left text-foreground"
                    >
                      <Icon size={12} className="text-muted-foreground" />
                      <span>{config.label}</span>
                    </button>
                  )
                })}
                {onAdvancedExport && (
                  <>
                    <div className="border-t border-border/50 my-0.5" />
                    <button
                      onClick={() => { onAdvancedExport(); setDropdown({ type: 'closed' }) }}
                      className="flex items-center gap-2 w-full px-3 py-1.5 text-xs hover:bg-accent text-left text-primary font-medium"
                    >
                      <Settings2 size={12} />
                      <span>{t('ui.export_avance')}</span>
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {/* Import */}
        {(importExport?.importCsv || importExport?.importWizardTarget) && (
          <div className="relative shrink-0">
            <button
              onClick={() => {
                if (importExport?.importWizardTarget) {
                  // Directly open the wizard, no dropdown needed
                  onImportClick?.()
                } else {
                  setDropdown(
                    dropdown.type === 'action' && dropdown.id === '_import'
                      ? { type: 'closed' }
                      : { type: 'action', id: '_import' }
                  )
                }
              }}
              className="p-1 rounded text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
              title={importExport?.importWizardTarget ? "Assistant d'import" : 'Importer'}
            >
              <Upload size={13} />
            </button>
            {!importExport?.importWizardTarget && dropdown.type === 'action' && dropdown.id === '_import' && (
              <div className="absolute right-0 top-full mt-1 z-50 min-w-[180px] max-w-[calc(100vw-1.5rem)] max-h-[min(65vh,30rem)] overflow-y-auto rounded-md border bg-popover shadow-lg py-1">
                <p className="px-3 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide border-b border-border/50 mb-0.5">
                  Importer
                </p>
                <button
                  onClick={() => { onImportClick?.(); setDropdown({ type: 'closed' }) }}
                  className="flex items-center gap-2 w-full px-3 py-1.5 text-xs hover:bg-accent text-left text-foreground"
                >
                  <Upload size={12} className="text-muted-foreground" />
                  <span>{t('ui.importer_un_fichier_csv')}</span>
                </button>
                {importExport?.importTemplate && (
                  <button
                    onClick={() => { onDownloadTemplate?.(); setDropdown({ type: 'closed' }) }}
                    className="flex items-center gap-2 w-full px-3 py-1.5 text-xs hover:bg-accent text-left text-foreground"
                  >
                    <FileDown size={12} className="text-muted-foreground" />
                    <span>{t('ui.telecharger_le_modele')}</span>
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {toolbarRight}
      </div>
    </div>
  )
}

// ── Date range value picker ─────────────────────────────────
// Shown in the values dropdown when the filter type is 'date-range'.
// Supports 'between' (two dates), 'gt' (after), and 'lt' (before).
interface DateRangeValuePickerProps {
  filter: DataTableFilterDef
  operator: FilterOperator
  currentValue: unknown
  onApply: (value: unknown) => void
  onClear: () => void
}
function DateRangeValuePicker({ filter, operator, currentValue, onApply, onClear }: DateRangeValuePickerProps) {
  // Pull existing dates out of the current filter value, regardless of shape.
  const initial = (() => {
    if (currentValue && typeof currentValue === 'object' && currentValue !== null) {
      const v = currentValue as { value?: unknown; values?: unknown[]; from?: string; to?: string; start?: string; end?: string }
      if (v.from || v.to) return { from: v.from ?? '', to: v.to ?? '' }
      if (v.start || v.end) return { from: v.start ?? '', to: v.end ?? '' }
      if (Array.isArray(v.values) && v.values.length === 2) return { from: String(v.values[0] ?? ''), to: String(v.values[1] ?? '') }
      if (typeof v.value === 'string') return operator === 'lt' ? { from: '', to: v.value } : { from: v.value, to: '' }
    }
    return { from: '', to: '' }
  })()
  const [from, setFrom] = useState(initial.from)
  const [to, setTo] = useState(initial.to)

  const isBetween = operator === 'between'
  const apply = () => {
    if (isBetween) {
      if (!from && !to) return onClear()
      onApply({ operator: 'between', from, to })
    } else if (operator === 'gt') {
      if (!from) return onClear()
      onApply({ operator: 'gt', value: from })
    } else if (operator === 'lt') {
      if (!to) return onClear()
      onApply({ operator: 'lt', value: to })
    }
  }

  // Quick presets — applied immediately so the user gets a one-click flow.
  const setPreset = (preset: 'today' | 'last_7' | 'last_30' | 'this_month' | 'this_year') => {
    const now = new Date()
    const iso = (d: Date) => d.toISOString().slice(0, 10)
    let f = '', t = ''
    if (preset === 'today') { f = t = iso(now) }
    else if (preset === 'last_7') { const d = new Date(now); d.setDate(d.getDate() - 6); f = iso(d); t = iso(now) }
    else if (preset === 'last_30') { const d = new Date(now); d.setDate(d.getDate() - 29); f = iso(d); t = iso(now) }
    else if (preset === 'this_month') { f = iso(new Date(now.getFullYear(), now.getMonth(), 1)); t = iso(new Date(now.getFullYear(), now.getMonth() + 1, 0)) }
    else if (preset === 'this_year') { f = iso(new Date(now.getFullYear(), 0, 1)); t = iso(new Date(now.getFullYear(), 11, 31)) }
    setFrom(f); setTo(t)
    onApply({ operator: 'between', from: f, to: t })
  }

  return (
    <div className="absolute left-0 top-full mt-1 z-50 w-[280px] rounded-md border bg-popover shadow-lg p-2">
      <p className="px-1 pb-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
        {filter.label} {FILTER_OPERATOR_LABELS[operator]}
      </p>
      {isBetween ? (
        <div className="flex items-center gap-1.5">
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="flex-1 h-7 px-1.5 text-xs border border-border rounded bg-background"
          />
          <span className="text-muted-foreground text-xs">→</span>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="flex-1 h-7 px-1.5 text-xs border border-border rounded bg-background"
          />
        </div>
      ) : operator === 'gt' ? (
        <input
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          className="w-full h-7 px-1.5 text-xs border border-border rounded bg-background"
        />
      ) : (
        <input
          type="date"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          className="w-full h-7 px-1.5 text-xs border border-border rounded bg-background"
        />
      )}
      {isBetween && (
        <div className="flex flex-wrap gap-1 mt-2">
          {[
            { id: 'today', label: "Aujourd'hui" },
            { id: 'last_7', label: '7 derniers j.' },
            { id: 'last_30', label: '30 derniers j.' },
            { id: 'this_month', label: 'Ce mois' },
            { id: 'this_year', label: 'Cette année' },
          ].map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setPreset(p.id as 'today' | 'last_7' | 'last_30' | 'this_month' | 'this_year')}
              className="text-[10px] px-1.5 py-0.5 rounded border border-border hover:bg-accent text-muted-foreground hover:text-foreground"
            >
              {p.label}
            </button>
          ))}
        </div>
      )}
      <div className="flex items-center justify-between mt-2 pt-2 border-t border-border/50">
        <button
          type="button"
          onClick={onClear}
          className="text-[11px] text-muted-foreground hover:text-destructive px-1"
        >
          Effacer
        </button>
        <button
          type="button"
          onClick={apply}
          className="gl-button-sm bg-primary text-primary-foreground hover:bg-primary/90 h-6 px-2 text-[11px]"
        >
          Appliquer
        </button>
      </div>
    </div>
  )
}
