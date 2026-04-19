/**
 * ExportWizard — multi-step modal for advanced data export.
 *
 * Features:
 *   - Format selection: CSV, XLSX, PDF, JSON, ODS
 *   - Scope: all data, current page, selected rows, filtered data
 *   - Encoding choice (CSV only)
 *   - Column selection with drag-to-reorder
 *   - Column header rename overrides
 *   - Computed columns: concat, lookup/replace, date formatting
 *   - Override sort order for export
 *   - Date range filtering
 *   - Live preview of first N rows
 *   - Estimated file size + total row count
 */
import { useState, useMemo, useCallback } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import {
  Download, FileSpreadsheet, FileText, FileJson, Table2, Settings2,
  Eye, GripVertical, Plus, X, Check, ArrowUpDown, Filter,
  ChevronRight, ChevronLeft, Loader2, Trash2,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { DateRangePicker } from '@/components/shared/DateRangePicker'

// ── Types ─────────────────────────────────────────────────────

export interface ExportWizardProps {
  open: boolean
  onClose: () => void
  data: Record<string, unknown>[]
  columns: { id: string; header: string }[]
  filenamePrefix?: string
  selectedRowIds?: Set<string>
  getRowId?: (row: Record<string, unknown>) => string
}

type ExportFormatType = 'csv' | 'xlsx' | 'pdf' | 'json' | 'ods'
type ExportScope = 'all' | 'page' | 'selected' | 'filtered'
type Step = 0 | 1 | 2 | 3

type ComputedType = 'concat' | 'lookup' | 'date_format'

interface ComputedColumnDef {
  id: string
  name: string
  type: ComputedType
  /** concat: field ids to join */
  concatFields?: string[]
  concatSeparator?: string
  /** lookup: mapping from source value to display value */
  lookupSourceField?: string
  lookupMap?: Record<string, string>
  /** date_format: source field and output format */
  dateSourceField?: string
  dateOutputFormat?: string
}

interface ColumnConfig {
  id: string
  header: string
  enabled: boolean
  /** Custom header override (user-defined label for export) */
  headerOverride?: string
  isComputed?: boolean
}

interface SortOverride {
  columnId: string
  direction: 'asc' | 'desc'
}

// ── Constants ─────────────────────────────────────────────────

const FORMAT_OPTIONS: { value: ExportFormatType; label: string; icon: typeof Download }[] = [
  { value: 'csv', label: 'CSV', icon: Download },
  { value: 'xlsx', label: 'Excel (.xlsx)', icon: FileSpreadsheet },
  { value: 'pdf', label: 'PDF', icon: FileText },
  { value: 'json', label: 'JSON', icon: FileJson },
  { value: 'ods', label: 'ODS', icon: Table2 },
]

const ENCODINGS = [
  { value: 'utf-8', label: 'UTF-8' },
  { value: 'iso-8859-1', label: 'Latin-1 (ISO-8859-1)' },
  { value: 'windows-1252', label: 'Windows-1252' },
] as const

const STEP_KEYS = ['format_scope', 'columns', 'filters_sort', 'preview'] as const

const DATE_OUTPUT_FORMATS = [
  'DD/MM/YYYY',
  'MM/DD/YYYY',
  'YYYY-MM-DD',
  'DD-MM-YYYY',
  'DD.MM.YYYY',
  'DD MMM YYYY',
  'YYYY/MM/DD',
]

// ── Helpers ───────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDateValue(value: unknown, format: string): string {
  if (!value) return ''
  const d = new Date(String(value))
  if (isNaN(d.getTime())) return String(value)

  const day = String(d.getDate()).padStart(2, '0')
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const year = d.getFullYear()
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const mon = monthNames[d.getMonth()]

  switch (format) {
    case 'DD/MM/YYYY': return `${day}/${month}/${year}`
    case 'MM/DD/YYYY': return `${month}/${day}/${year}`
    case 'YYYY-MM-DD': return `${year}-${month}-${day}`
    case 'DD-MM-YYYY': return `${day}-${month}-${year}`
    case 'DD.MM.YYYY': return `${day}.${month}.${year}`
    case 'DD MMM YYYY': return `${day} ${mon} ${year}`
    case 'YYYY/MM/DD': return `${year}/${month}/${day}`
    default: return String(value)
  }
}

function computeColumnValue(
  row: Record<string, unknown>,
  computed: ComputedColumnDef,
): string {
  switch (computed.type) {
    case 'concat': {
      const fields = computed.concatFields ?? []
      const sep = computed.concatSeparator ?? ' '
      return fields.map((f) => String(row[f] ?? '')).join(sep)
    }
    case 'lookup': {
      const sourceVal = String(row[computed.lookupSourceField ?? ''] ?? '')
      const map = computed.lookupMap ?? {}
      return map[sourceVal] ?? sourceVal
    }
    case 'date_format': {
      const val = row[computed.dateSourceField ?? '']
      return formatDateValue(val, computed.dateOutputFormat ?? 'YYYY-MM-DD')
    }
    default:
      return ''
  }
}

function generateId(): string {
  return `comp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
}

// ── Main Component ────────────────────────────────────────────

export function ExportWizard({
  open,
  onClose,
  data,
  columns,
  filenamePrefix = 'export',
  selectedRowIds,
  getRowId = (row) => String(row.id ?? ''),
}: ExportWizardProps) {
  const { t } = useTranslation()

  // ── Step state ──
  const [step, setStep] = useState<Step>(0)
  const [exporting, setExporting] = useState(false)

  // ── Step 1: Format & Scope ──
  const [format, setFormat] = useState<ExportFormatType>('xlsx')
  const [scope, setScope] = useState<ExportScope>('all')
  const [encoding, setEncoding] = useState('utf-8')

  // ── Step 2: Column config ──
  const [columnConfigs, setColumnConfigs] = useState<ColumnConfig[]>(() =>
    columns.map((c) => ({ id: c.id, header: c.header, enabled: true }))
  )
  const [computedColumns, setComputedColumns] = useState<ComputedColumnDef[]>([])
  const [editingComputed, setEditingComputed] = useState<string | null>(null)

  // ── Step 3: Filters & Sort ──
  const [sortOverrides, setSortOverrides] = useState<SortOverride[]>([])
  const [dateFilterField, setDateFilterField] = useState('')
  const [dateFilterFrom, setDateFilterFrom] = useState('')
  const [dateFilterTo, setDateFilterTo] = useState('')

  // ── Drag state ──
  const [dragIdx, setDragIdx] = useState<number | null>(null)

  // ── Reset on close ──
  const handleClose = useCallback(() => {
    setStep(0)
    setExporting(false)
    setFormat('xlsx')
    setScope('all')
    setEncoding('utf-8')
    setColumnConfigs(columns.map((c) => ({ id: c.id, header: c.header, enabled: true })))
    setComputedColumns([])
    setEditingComputed(null)
    setSortOverrides([])
    setDateFilterField('')
    setDateFilterFrom('')
    setDateFilterTo('')
    setDragIdx(null)
    onClose()
  }, [columns, onClose])

  // ── Scoped data ──
  const scopedData = useMemo(() => {
    let rows = data
    if (scope === 'selected' && selectedRowIds && selectedRowIds.size > 0) {
      rows = data.filter((row) => selectedRowIds.has(getRowId(row)))
    }
    // Apply date filter
    if (dateFilterField && (dateFilterFrom || dateFilterTo)) {
      rows = rows.filter((row) => {
        const val = row[dateFilterField]
        if (!val) return false
        const d = new Date(String(val))
        if (isNaN(d.getTime())) return false
        if (dateFilterFrom && d < new Date(dateFilterFrom)) return false
        if (dateFilterTo && d > new Date(dateFilterTo + 'T23:59:59')) return false
        return true
      })
    }
    // Apply sort overrides
    if (sortOverrides.length > 0) {
      rows = [...rows].sort((a, b) => {
        for (const s of sortOverrides) {
          const aVal = String(a[s.columnId] ?? '')
          const bVal = String(b[s.columnId] ?? '')
          const cmp = aVal.localeCompare(bVal, undefined, { numeric: true })
          if (cmp !== 0) return s.direction === 'asc' ? cmp : -cmp
        }
        return 0
      })
    }
    return rows
  }, [data, scope, selectedRowIds, getRowId, dateFilterField, dateFilterFrom, dateFilterTo, sortOverrides])

  // ── Enabled columns (with computed) ──
  const enabledColumns = useMemo(() => {
    const regular = columnConfigs.filter((c) => c.enabled)
    const computed: ColumnConfig[] = computedColumns.map((c) => ({
      id: c.id,
      header: c.name,
      enabled: true,
      isComputed: true,
    }))
    return [...regular, ...computed]
  }, [columnConfigs, computedColumns])

  // ── Build export rows ──
  const buildExportRows = useCallback((): Record<string, unknown>[] => {
    return scopedData.map((row) => {
      const out: Record<string, unknown> = {}
      for (const col of enabledColumns) {
        const label = col.headerOverride || col.header
        if (col.isComputed) {
          const def = computedColumns.find((c) => c.id === col.id)
          out[label] = def ? computeColumnValue(row, def) : ''
        } else {
          out[label] = row[col.id] ?? ''
        }
      }
      return out
    })
  }, [scopedData, enabledColumns, computedColumns])

  // ── Preview data (first 10 rows) ──
  const previewRows = useMemo(() => {
    const rows = buildExportRows()
    return rows.slice(0, 10)
  }, [buildExportRows])

  const previewHeaders = useMemo(() => {
    return enabledColumns.map((c) => c.headerOverride || c.header)
  }, [enabledColumns])

  // ── Estimated file size ──
  const estimatedSize = useMemo(() => {
    const totalRows = scopedData.length
    const colCount = enabledColumns.length
    // Rough estimate: ~30 bytes per cell for CSV, ~50 for XLSX
    const bytesPerCell = format === 'csv' ? 30 : format === 'json' ? 40 : 50
    return totalRows * colCount * bytesPerCell
  }, [scopedData.length, enabledColumns.length, format])

  // ── Export execution ──
  const handleExport = useCallback(async () => {
    setExporting(true)
    try {
      const rows = buildExportRows()
      const headers = previewHeaders
      const fname = `${filenamePrefix}_${new Date().toISOString().slice(0, 10)}`

      if (format === 'csv') {
        const Papa = await import('papaparse')
        const { saveAs } = await import('file-saver')
        const csv = Papa.unparse({
          fields: headers,
          data: rows.map((r) => headers.map((h) => String(r[h] ?? ''))),
        })
        const bom = encoding === 'utf-8' ? '\uFEFF' : ''
        const blob = new Blob([bom + csv], { type: `text/csv;charset=${encoding};` })
        saveAs(blob, `${fname}.csv`)
      }

      if (format === 'xlsx' || format === 'ods') {
        const XLSX = await import('xlsx')
        const wsData = [headers, ...rows.map((r) => headers.map((h) => r[h] ?? ''))]
        const ws = XLSX.utils.aoa_to_sheet(wsData)
        ws['!cols'] = headers.map((h, i) => ({
          wch: Math.max(h.length, ...rows.slice(0, 50).map((r) => String(r[headers[i]] ?? '').length)) + 2,
        }))
        const wb = XLSX.utils.book_new()
        XLSX.utils.book_append_sheet(wb, ws, 'Data')
        const ext = format === 'ods' ? 'ods' : 'xlsx'
        XLSX.writeFile(wb, `${fname}.${ext}`, { bookType: format === 'ods' ? 'ods' : 'xlsx' })
      }

      if (format === 'pdf') {
        const { default: jsPDF } = await import('jspdf')
        const { default: autoTable } = await import('jspdf-autotable')
        const doc = new jsPDF({ orientation: headers.length > 5 ? 'landscape' : 'portrait' })
        autoTable(doc, {
          head: [headers],
          body: rows.map((r) => headers.map((h) => String(r[h] ?? ''))),
          styles: { fontSize: 8, cellPadding: 2 },
          headStyles: { fillColor: [55, 65, 81] },
          margin: { top: 10 },
        })
        doc.save(`${fname}.pdf`)
      }

      if (format === 'json') {
        const { saveAs } = await import('file-saver')
        const json = JSON.stringify(rows, null, 2)
        const blob = new Blob([json], { type: 'application/json;charset=utf-8;' })
        saveAs(blob, `${fname}.json`)
      }

      handleClose()
    } finally {
      setExporting(false)
    }
  }, [buildExportRows, previewHeaders, filenamePrefix, format, encoding, handleClose])

  // ── Column drag & drop ──
  const handleDragStart = useCallback((idx: number) => {
    setDragIdx(idx)
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent, idx: number) => {
    e.preventDefault()
    if (dragIdx === null || dragIdx === idx) return
    setColumnConfigs((prev) => {
      const next = [...prev]
      const [moved] = next.splice(dragIdx, 1)
      next.splice(idx, 0, moved)
      return next
    })
    setDragIdx(idx)
  }, [dragIdx])

  const handleDragEnd = useCallback(() => {
    setDragIdx(null)
  }, [])

  // ── Toggle all columns ──
  const handleToggleAll = useCallback((enabled: boolean) => {
    setColumnConfigs((prev) => prev.map((c) => ({ ...c, enabled })))
  }, [])

  // ── Add computed column ──
  const handleAddComputed = useCallback(() => {
    const id = generateId()
    const newCol: ComputedColumnDef = {
      id,
      name: t('export.computed_column') || 'Computed',
      type: 'concat',
      concatFields: [],
      concatSeparator: ' ',
    }
    setComputedColumns((prev) => [...prev, newCol])
    setEditingComputed(id)
  }, [t])

  const handleRemoveComputed = useCallback((id: string) => {
    setComputedColumns((prev) => prev.filter((c) => c.id !== id))
    if (editingComputed === id) setEditingComputed(null)
  }, [editingComputed])

  const handleUpdateComputed = useCallback((id: string, updates: Partial<ComputedColumnDef>) => {
    setComputedColumns((prev) =>
      prev.map((c) => (c.id === id ? { ...c, ...updates } : c))
    )
  }, [])

  // ── Sort override helpers ──
  const handleAddSort = useCallback(() => {
    if (columns.length === 0) return
    setSortOverrides((prev) => [...prev, { columnId: columns[0].id, direction: 'asc' }])
  }, [columns])

  const handleRemoveSort = useCallback((idx: number) => {
    setSortOverrides((prev) => prev.filter((_, i) => i !== idx))
  }, [])

  // ── Date columns for filter ──
  const dateColumns = useMemo(() => {
    // Heuristic: columns with 'date', 'created', 'updated', 'at' in the name
    return columns.filter((c) =>
      /date|created|updated|_at$|starts?_|ends?_|expires?/i.test(c.id)
    )
  }, [columns])

  // ── Step labels ──
  const stepLabels = [
    t('export.format'),
    t('export.columns'),
    t('export.filters_sort') || 'Filters & Sort',
    t('export.preview'),
  ]

  // ── Can proceed ──
  const canNext = step < 3
  const canPrev = step > 0

  // ── Currently-edited computed column ──
  const currentComputed = editingComputed
    ? computedColumns.find((c) => c.id === editingComputed)
    : null

  // ── Render ──
  return (
    <Dialog.Root open={open} onOpenChange={(o) => { if (!o) handleClose() }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[var(--z-modal)] bg-black/40 backdrop-blur-sm animate-in fade-in" />
        <Dialog.Content className={cn(
          'fixed left-1/2 top-1/2 z-[var(--z-modal)] -translate-x-1/2 -translate-y-1/2 rounded-lg border bg-card shadow-xl animate-in fade-in slide-in-from-bottom-4 max-h-[90vh] flex flex-col',
          editingComputed && step === 1 ? 'w-[95vw] max-w-6xl' : 'w-[95vw] max-w-4xl',
        )}>
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b shrink-0">
            <div className="flex items-center gap-3">
              <Download size={18} className="text-primary" />
              <Dialog.Title className="text-sm font-semibold">{t('export.wizard_title')}</Dialog.Title>
            </div>
            <Dialog.Close asChild>
              <button className="gl-button gl-button-default"><X size={16} /></button>
            </Dialog.Close>
          </div>

          {/* Stepper */}
          <div className="flex items-center gap-1 px-6 py-3 border-b bg-muted/30 shrink-0">
            {STEP_KEYS.map((sk, i) => (
              <div key={sk} className="flex items-center gap-1">
                <div className={cn(
                  'flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium transition-colors',
                  i === step ? 'bg-primary/10 text-primary' :
                  i < step ? 'text-primary/60' : 'text-muted-foreground',
                )}>
                  <span className={cn(
                    'flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-semibold',
                    i === step ? 'bg-primary text-white' :
                    i < step ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground',
                  )}>
                    {i < step ? <Check size={10} /> : i + 1}
                  </span>
                  <span className="hidden sm:inline">{stepLabels[i]}</span>
                </div>
                {i < STEP_KEYS.length - 1 && (
                  <ChevronRight size={12} className="text-muted-foreground/40" />
                )}
              </div>
            ))}
          </div>

          {/* Body */}
          <div className="flex-1 overflow-auto px-6 py-5 min-h-[350px]">
            {/* ── Step 0: Format & Scope ── */}
            {step === 0 && (
              <div className="space-y-6">
                {/* Format */}
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                    {t('export.format')}
                  </label>
                  <div className="grid grid-cols-5 gap-2">
                    {FORMAT_OPTIONS.map((opt) => {
                      const Icon = opt.icon
                      return (
                        <button
                          key={opt.value}
                          onClick={() => setFormat(opt.value)}
                          className={cn(
                            'flex flex-col items-center gap-1.5 px-3 py-3 rounded-md border text-xs font-medium transition-colors',
                            format === opt.value
                              ? 'border-primary bg-primary/5 text-primary'
                              : 'border-border hover:border-border-hover hover:bg-accent/40 text-foreground',
                          )}
                        >
                          <Icon size={16} />
                          <span>{opt.label}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* Scope */}
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                    {t('export.scope')}
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {([
                      { value: 'all' as ExportScope, label: t('export.scope_all'), count: data.length },
                      { value: 'selected' as ExportScope, label: t('export.scope_selected'), count: selectedRowIds?.size ?? 0 },
                      { value: 'filtered' as ExportScope, label: t('export.scope_filtered'), count: data.length },
                    ]).map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() => setScope(opt.value)}
                        disabled={opt.value === 'selected' && (!selectedRowIds || selectedRowIds.size === 0)}
                        className={cn(
                          'flex items-center gap-2 px-3 py-2 rounded-md border text-xs font-medium transition-colors text-left',
                          scope === opt.value
                            ? 'border-primary bg-primary/5 text-primary'
                            : 'border-border hover:border-border-hover hover:bg-accent/40 text-foreground',
                          opt.value === 'selected' && (!selectedRowIds || selectedRowIds.size === 0) && 'opacity-40 cursor-not-allowed',
                        )}
                      >
                        <span className="flex-1">{opt.label}</span>
                        <span className="gl-badge text-[10px]">{opt.count.toLocaleString()}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Encoding (CSV only) */}
                {format === 'csv' && (
                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                      {t('export.encoding')}
                    </label>
                    <select
                      value={encoding}
                      onChange={(e) => setEncoding(e.target.value)}
                      className="gl-form-input text-xs w-full max-w-xs"
                    >
                      {ENCODINGS.map((enc) => (
                        <option key={enc.value} value={enc.value}>{enc.label}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            )}

            {/* ── Step 1: Column Selection & Configuration ── */}
            {step === 1 && (
              <div className="flex gap-4">
                {/* Main column list */}
                <div className={cn('flex-1 min-w-0', editingComputed ? 'max-w-[55%]' : '')}>
                  {/* Toggle all */}
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      {t('export.columns')}
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleToggleAll(true)}
                        className="text-[11px] text-primary hover:underline"
                      >
                        {t('export.select_all')}
                      </button>
                      <span className="text-muted-foreground/30">|</span>
                      <button
                        onClick={() => handleToggleAll(false)}
                        className="text-[11px] text-muted-foreground hover:text-foreground hover:underline"
                      >
                        {t('export.deselect_all')}
                      </button>
                    </div>
                  </div>

                  {/* Column list */}
                  <div className="space-y-0.5 max-h-[45vh] overflow-auto pr-1">
                    {columnConfigs.map((col, idx) => (
                      <div
                        key={col.id}
                        draggable
                        onDragStart={() => handleDragStart(idx)}
                        onDragOver={(e) => handleDragOver(e, idx)}
                        onDragEnd={handleDragEnd}
                        className={cn(
                          'flex items-center gap-2 px-2 py-1.5 rounded border border-transparent transition-colors group',
                          dragIdx === idx ? 'bg-primary/10 border-primary/30' : 'hover:bg-accent/40',
                        )}
                      >
                        <GripVertical size={12} className="text-muted-foreground/30 cursor-grab shrink-0" />
                        <button
                          onClick={() => setColumnConfigs((prev) =>
                            prev.map((c, i) => i === idx ? { ...c, enabled: !c.enabled } : c)
                          )}
                          className="shrink-0"
                        >
                          <span className={cn(
                            'flex items-center justify-center w-4 h-4 rounded-sm border',
                            col.enabled ? 'bg-primary border-primary' : 'border-border',
                          )}>
                            {col.enabled && <Check size={10} className="text-white" />}
                          </span>
                        </button>
                        <span className="text-xs text-foreground flex-1 min-w-0 truncate">
                          {col.header}
                        </span>
                        {/* Rename override */}
                        <input
                          type="text"
                          placeholder={col.header}
                          value={col.headerOverride ?? ''}
                          onChange={(e) => setColumnConfigs((prev) =>
                            prev.map((c, i) => i === idx ? { ...c, headerOverride: e.target.value || undefined } : c)
                          )}
                          className="w-28 text-[11px] bg-transparent border-b border-transparent focus:border-primary/40 outline-none text-muted-foreground placeholder:text-muted-foreground/30 px-1"
                          title={t('export.column_name') || 'Rename'}
                        />
                      </div>
                    ))}
                  </div>

                  {/* Computed columns */}
                  {computedColumns.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-border/50">
                      <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                        {t('export.computed_columns') || 'Computed columns'}
                      </span>
                      <div className="space-y-0.5 mt-1">
                        {computedColumns.map((cc) => (
                          <div
                            key={cc.id}
                            className={cn(
                              'flex items-center gap-2 px-2 py-1.5 rounded transition-colors',
                              editingComputed === cc.id ? 'bg-primary/10' : 'hover:bg-accent/40',
                            )}
                          >
                            <Settings2 size={12} className="text-primary/60 shrink-0" />
                            <span className="text-xs text-foreground flex-1 min-w-0 truncate">{cc.name}</span>
                            <span className="text-[10px] text-muted-foreground/60 bg-muted px-1 rounded">
                              {cc.type}
                            </span>
                            <button
                              onClick={() => setEditingComputed(editingComputed === cc.id ? null : cc.id)}
                              className="text-muted-foreground hover:text-primary"
                              title={t('common.edit')}
                            >
                              <Settings2 size={11} />
                            </button>
                            <button
                              onClick={() => handleRemoveComputed(cc.id)}
                              className="text-muted-foreground hover:text-destructive"
                              title={t('common.remove')}
                            >
                              <Trash2 size={11} />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Add computed button */}
                  <button
                    onClick={handleAddComputed}
                    className="mt-3 flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 font-medium"
                  >
                    <Plus size={12} />
                    {t('export.add_computed')}
                  </button>
                </div>

                {/* Computed column editor panel */}
                {editingComputed && currentComputed && (
                  <div className="w-[45%] border-l border-border pl-4 space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-foreground">
                        {t('export.computed_column_editor') || 'Configure computed column'}
                      </span>
                      <button
                        onClick={() => setEditingComputed(null)}
                        className="p-0.5 rounded hover:bg-accent text-muted-foreground"
                      >
                        <X size={14} />
                      </button>
                    </div>

                    {/* Name */}
                    <div>
                      <label className="text-[11px] text-muted-foreground font-medium block mb-1">
                        {t('export.column_name')}
                      </label>
                      <input
                        type="text"
                        value={currentComputed.name}
                        onChange={(e) => handleUpdateComputed(currentComputed.id, { name: e.target.value })}
                        className="gl-form-input text-xs w-full"
                      />
                    </div>

                    {/* Type */}
                    <div>
                      <label className="text-[11px] text-muted-foreground font-medium block mb-1">
                        {t('export.formula')}
                      </label>
                      <select
                        value={currentComputed.type}
                        onChange={(e) => handleUpdateComputed(currentComputed.id, { type: e.target.value as ComputedType })}
                        className="gl-form-input text-xs w-full"
                      >
                        <option value="concat">{t('export.concat')}</option>
                        <option value="lookup">{t('export.lookup')}</option>
                        <option value="date_format">{t('export.date_format')}</option>
                      </select>
                    </div>

                    {/* Concat config */}
                    {currentComputed.type === 'concat' && (
                      <>
                        <div>
                          <label className="text-[11px] text-muted-foreground font-medium block mb-1">
                            {t('export.concat_fields') || 'Fields to concatenate'}
                          </label>
                          <div className="space-y-1">
                            {(currentComputed.concatFields ?? []).map((fid, i) => (
                              <div key={i} className="flex items-center gap-1">
                                <select
                                  value={fid}
                                  onChange={(e) => {
                                    const fields = [...(currentComputed.concatFields ?? [])]
                                    fields[i] = e.target.value
                                    handleUpdateComputed(currentComputed.id, { concatFields: fields })
                                  }}
                                  className="gl-form-input text-xs flex-1"
                                >
                                  {columns.map((c) => (
                                    <option key={c.id} value={c.id}>{c.header}</option>
                                  ))}
                                </select>
                                <button
                                  onClick={() => {
                                    const fields = (currentComputed.concatFields ?? []).filter((_, j) => j !== i)
                                    handleUpdateComputed(currentComputed.id, { concatFields: fields })
                                  }}
                                  className="text-muted-foreground hover:text-destructive"
                                >
                                  <X size={11} />
                                </button>
                              </div>
                            ))}
                          </div>
                          <button
                            onClick={() => {
                              const fields = [...(currentComputed.concatFields ?? []), columns[0]?.id ?? '']
                              handleUpdateComputed(currentComputed.id, { concatFields: fields })
                            }}
                            className="mt-1 text-[11px] text-primary hover:underline"
                          >
                            + {t('export.add_field') || 'Add field'}
                          </button>
                        </div>
                        <div>
                          <label className="text-[11px] text-muted-foreground font-medium block mb-1">
                            {t('export.separator') || 'Separator'}
                          </label>
                          <input
                            type="text"
                            value={currentComputed.concatSeparator ?? ' '}
                            onChange={(e) => handleUpdateComputed(currentComputed.id, { concatSeparator: e.target.value })}
                            className="gl-form-input text-xs w-20"
                          />
                        </div>
                      </>
                    )}

                    {/* Lookup config */}
                    {currentComputed.type === 'lookup' && (
                      <>
                        <div>
                          <label className="text-[11px] text-muted-foreground font-medium block mb-1">
                            {t('export.lookup_source') || 'Source field'}
                          </label>
                          <select
                            value={currentComputed.lookupSourceField ?? ''}
                            onChange={(e) => handleUpdateComputed(currentComputed.id, { lookupSourceField: e.target.value })}
                            className="gl-form-input text-xs w-full"
                          >
                            <option value="">--</option>
                            {columns.map((c) => (
                              <option key={c.id} value={c.id}>{c.header}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="text-[11px] text-muted-foreground font-medium block mb-1">
                            {t('export.lookup_mappings') || 'Value mappings'}
                          </label>
                          <div className="space-y-1">
                            {Object.entries(currentComputed.lookupMap ?? {}).map(([k, v], i) => (
                              <div key={i} className="flex items-center gap-1">
                                <input
                                  type="text"
                                  value={k}
                                  onChange={(e) => {
                                    const map = { ...(currentComputed.lookupMap ?? {}) }
                                    const oldVal = map[k]
                                    delete map[k]
                                    map[e.target.value] = oldVal
                                    handleUpdateComputed(currentComputed.id, { lookupMap: map })
                                  }}
                                  className="gl-form-input text-xs flex-1"
                                  placeholder={t('export.lookup_from') || 'From'}
                                />
                                <span className="text-muted-foreground text-xs">&rarr;</span>
                                <input
                                  type="text"
                                  value={v}
                                  onChange={(e) => {
                                    const map = { ...(currentComputed.lookupMap ?? {}) }
                                    map[k] = e.target.value
                                    handleUpdateComputed(currentComputed.id, { lookupMap: map })
                                  }}
                                  className="gl-form-input text-xs flex-1"
                                  placeholder={t('export.lookup_to') || 'To'}
                                />
                                <button
                                  onClick={() => {
                                    const map = { ...(currentComputed.lookupMap ?? {}) }
                                    delete map[k]
                                    handleUpdateComputed(currentComputed.id, { lookupMap: map })
                                  }}
                                  className="text-muted-foreground hover:text-destructive"
                                >
                                  <X size={11} />
                                </button>
                              </div>
                            ))}
                          </div>
                          <button
                            onClick={() => {
                              const map = { ...(currentComputed.lookupMap ?? {}), '': '' }
                              handleUpdateComputed(currentComputed.id, { lookupMap: map })
                            }}
                            className="mt-1 text-[11px] text-primary hover:underline"
                          >
                            + {t('export.add_mapping') || 'Add mapping'}
                          </button>
                        </div>
                      </>
                    )}

                    {/* Date format config */}
                    {currentComputed.type === 'date_format' && (
                      <>
                        <div>
                          <label className="text-[11px] text-muted-foreground font-medium block mb-1">
                            {t('export.date_source_field') || 'Source date field'}
                          </label>
                          <select
                            value={currentComputed.dateSourceField ?? ''}
                            onChange={(e) => handleUpdateComputed(currentComputed.id, { dateSourceField: e.target.value })}
                            className="gl-form-input text-xs w-full"
                          >
                            <option value="">--</option>
                            {columns.map((c) => (
                              <option key={c.id} value={c.id}>{c.header}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="text-[11px] text-muted-foreground font-medium block mb-1">
                            {t('export.output_format') || 'Output format'}
                          </label>
                          <select
                            value={currentComputed.dateOutputFormat ?? 'YYYY-MM-DD'}
                            onChange={(e) => handleUpdateComputed(currentComputed.id, { dateOutputFormat: e.target.value })}
                            className="gl-form-input text-xs w-full"
                          >
                            {DATE_OUTPUT_FORMATS.map((f) => (
                              <option key={f} value={f}>{f}</option>
                            ))}
                          </select>
                        </div>
                      </>
                    )}

                    {/* Preview of computed column (first row) */}
                    {data.length > 0 && (
                      <div className="mt-2 p-2 bg-muted/50 rounded text-xs">
                        <span className="text-muted-foreground">{t('export.preview')}: </span>
                        <span className="text-foreground font-medium">
                          {computeColumnValue(data[0], currentComputed) || '(empty)'}
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* ── Step 2: Filters & Sort ── */}
            {step === 2 && (
              <div className="space-y-6">
                {/* Sort overrides */}
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                    <ArrowUpDown size={12} className="inline mr-1" />
                    {t('export.sort_override') || 'Sort order'}
                  </label>
                  <div className="space-y-1.5">
                    {sortOverrides.map((so, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <select
                          value={so.columnId}
                          onChange={(e) => setSortOverrides((prev) =>
                            prev.map((s, i) => i === idx ? { ...s, columnId: e.target.value } : s)
                          )}
                          className="gl-form-input text-xs flex-1"
                        >
                          {columns.map((c) => (
                            <option key={c.id} value={c.id}>{c.header}</option>
                          ))}
                        </select>
                        <select
                          value={so.direction}
                          onChange={(e) => setSortOverrides((prev) =>
                            prev.map((s, i) => i === idx ? { ...s, direction: e.target.value as 'asc' | 'desc' } : s)
                          )}
                          className="gl-form-input text-xs w-28"
                        >
                          <option value="asc">A &rarr; Z</option>
                          <option value="desc">Z &rarr; A</option>
                        </select>
                        <button
                          onClick={() => handleRemoveSort(idx)}
                          className="text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={handleAddSort}
                    className="mt-2 flex items-center gap-1 text-xs text-primary hover:text-primary/80 font-medium"
                  >
                    <Plus size={12} />
                    {t('export.add_sort') || 'Add sort rule'}
                  </button>
                </div>

                {/* Date range filter */}
                {dateColumns.length > 0 && (
                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                      <Filter size={12} className="inline mr-1" />
                      {t('export.date_range') || 'Date range filter'}
                    </label>
                    <div className="flex items-center gap-2 flex-wrap">
                      <select
                        value={dateFilterField}
                        onChange={(e) => setDateFilterField(e.target.value)}
                        className="gl-form-input text-xs"
                      >
                        <option value="">--</option>
                        {dateColumns.map((c) => (
                          <option key={c.id} value={c.id}>{c.header}</option>
                        ))}
                      </select>
                      {dateFilterField && (
                        <DateRangePicker
                          startDate={dateFilterFrom || null}
                          endDate={dateFilterTo || null}
                          onStartChange={setDateFilterFrom}
                          onEndChange={setDateFilterTo}
                          startLabel="Du"
                          endLabel="Au"
                        />
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── Step 3: Preview & Export ── */}
            {step === 3 && (
              <div className="space-y-4">
                {/* Stats bar */}
                <div className="flex items-center gap-4 text-xs">
                  <span className="flex items-center gap-1 text-foreground font-medium">
                    <Eye size={12} className="text-primary" />
                    {t('export.preview_rows', { count: Math.min(10, scopedData.length) })}
                  </span>
                  <span className="text-muted-foreground">
                    {t('export.total_rows', { count: scopedData.length })}
                  </span>
                  <span className="text-muted-foreground/60">
                    ~{formatBytes(estimatedSize)}
                  </span>
                  <span className="gl-badge text-[10px]">{format.toUpperCase()}</span>
                </div>

                {/* Preview table */}
                <div className="overflow-auto max-h-[50vh] border rounded-md">
                  <table className="text-xs w-full">
                    <thead className="sticky top-0 bg-muted/80">
                      <tr>
                        {previewHeaders.map((h) => (
                          <th key={h} className="px-3 py-1.5 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap border-b">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {previewRows.map((row, i) => (
                        <tr key={i} className="border-b border-border/40 hover:bg-accent/20">
                          {previewHeaders.map((h) => (
                            <td key={h} className="px-3 py-1 whitespace-nowrap max-w-[200px] truncate">
                              {String(row[h] ?? '')}
                            </td>
                          ))}
                        </tr>
                      ))}
                      {previewRows.length === 0 && (
                        <tr>
                          <td colSpan={previewHeaders.length} className="px-3 py-6 text-center text-muted-foreground">
                            {t('common.no_results')}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-6 py-3 border-t shrink-0 bg-muted/20">
            <div className="flex items-center gap-2">
              {canPrev && (
                <button
                  onClick={() => setStep((step - 1) as Step)}
                  className="gl-button-sm gl-button-default flex items-center gap-1"
                >
                  <ChevronLeft size={12} />
                  {t('common.back')}
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleClose}
                className="gl-button-sm gl-button-default"
              >
                {t('common.cancel')}
              </button>

              {canNext && (
                <button
                  onClick={() => setStep((step + 1) as Step)}
                  className="gl-button-sm gl-button-confirm flex items-center gap-1"
                >
                  {t('common.next')}
                  <ChevronRight size={12} />
                </button>
              )}

              {step === 3 && (
                <button
                  onClick={handleExport}
                  disabled={exporting || enabledColumns.length === 0}
                  className="gl-button-sm gl-button-confirm flex items-center gap-1"
                >
                  {exporting ? (
                    <>
                      <Loader2 size={12} className="animate-spin" />
                      {t('export.exporting')}
                    </>
                  ) : (
                    <>
                      <Download size={12} />
                      {t('export.export_btn')}
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
