import { useState, useMemo, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Loader2, Check, Grid3X3, List, Download, Scale } from 'lucide-react'
import { cn } from '@/lib/utils'
import { DataTableToolbar } from '@/components/ui/DataTable/Toolbar'
import type { DataTableFilterDef } from '@/components/ui/DataTable/types'
import { ExportWizard } from '@/components/shared/ExportWizard'
import { SubTabBar } from '@/components/ui/Tabs'
import { useDictionaryOptions } from '@/hooks/useDictionary'
import type { ComplianceRule, ComplianceType, JobPosition } from '@/types/api'
import {
  useConformiteDictionaryState,
  CATEGORY_COLORS_MAP,
  CATEGORY_ORDER,
  PRIORITY_COLORS,
} from '../shared'
import { formatDate } from '@/lib/i18n'

type TargetTab = 'job_position' | 'department' | 'asset' | 'packlog_cargo' | 'all'

export function RulesMatrixView({
  rules,
  types,
  jobPositions,
  isLoading,
  onCreateRule,
  onDeleteRule,
  onEditRule,
  onCreateRulePanel,
}: {
  rules: ComplianceRule[]
  types: ComplianceType[]
  jobPositions: JobPosition[] | undefined
  isLoading: boolean
  onCreateRule: (payload: { compliance_type_id: string; target_type: string; target_value?: string }) => void
  onDeleteRule: (id: string) => void
  onEditRule?: (rule: ComplianceRule) => void
  onCreateRulePanel?: (prefill: { type_id: string; target_type: string; target_value?: string }) => void
}) {
  const { t } = useTranslation()
  const [searchFilter, setSearchFilter] = useState('')
  const [activeRuleFilters, setActiveRuleFilters] = useState<Record<string, unknown>>({})
  const selectedCategory = (activeRuleFilters.category as string) || 'all'
  const [activeTargetTab, setActiveTargetTab] = useState<TargetTab>('job_position')
  const [viewMode, setViewMode] = useState<'matrix' | 'list'>('matrix')
  const [exportOpen, setExportOpen] = useState(false)
  const [hoveredCol, setHoveredCol] = useState<string | null>(null)
  const [hoveredRow, setHoveredRow] = useState<string | null>(null)
  const [listGroupBy, setListGroupBy] = useState<'target_type' | 'category' | 'applicability' | 'none'>('target_type')
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())
  const {
    categoryLabels,
    ruleTargetOptions,
    ruleTargetLabels,
    rulePriorityOptions,
    rulePriorityLabels,
    ruleApplicabilityOptions,
    ruleApplicabilityLabels,
  } = useConformiteDictionaryState()
  const packlogCargoTypeOptions = useDictionaryOptions('packlog_cargo_type')
  const targetTabs = useMemo<{ id: TargetTab; label: string }[]>(() => [
    { id: 'job_position', label: t('conformite.rules.target_tabs.job_position') },
    { id: 'all', label: t('conformite.rules.target_tabs.all') },
    { id: 'packlog_cargo', label: t('conformite.rules.target_tabs.packlog_cargo') },
    { id: 'department', label: t('conformite.rules.target_tabs.department') },
    { id: 'asset', label: t('conformite.rules.target_tabs.asset') },
  ], [t])
  const groupByOptions = useMemo(() => ([
    ['target_type', t('conformite.rules.group_by.target_type')],
    ['category', t('conformite.rules.group_by.category')],
    ['applicability', t('conformite.rules.group_by.applicability')],
    ['none', t('conformite.rules.group_by.none')],
  ] as const), [t])
  const categoryGroupLabels: Record<string, string> = {
    formation: categoryLabels.formation ?? t('conformite.types.formation'),
    certification: categoryLabels.certification ?? t('conformite.types.certification'),
    habilitation: categoryLabels.habilitation ?? t('conformite.types.habilitation'),
    audit: categoryLabels.audit ?? t('conformite.types.audit'),
    medical: categoryLabels.medical ?? t('conformite.types.medical'),
    epi: categoryLabels.epi ?? t('conformite.types.epi'),
  }

  const handleRuleFilterChange = useCallback((filterId: string, value: unknown) => {
    setActiveRuleFilters(prev => {
      const next = { ...prev }
      if (value === undefined || value === null) delete next[filterId]
      else next[filterId] = value
      return next
    })
  }, [])

  const availableCategories = useMemo(() => {
    const cats = new Set<string>(types.filter(t => t.active).map(t => t.category))
    return CATEGORY_ORDER.filter(c => cats.has(c))
  }, [types])

  const ruleFilterDefs = useMemo<DataTableFilterDef[]>(() => [
    { id: 'category', label: 'Catégorie', type: 'select', options: availableCategories.map(cat => ({ value: cat, label: categoryGroupLabels[cat] ?? cat })) },
    { id: 'target_type', label: 'Cible', type: 'select', options: ruleTargetOptions.map(o => ({ value: o.value, label: o.label })) },
    { id: 'applicability', label: 'Applicabilité', type: 'select', options: ruleApplicabilityOptions.map(o => ({ value: o.value, label: o.label })) },
    { id: 'priority', label: 'Priorité', type: 'select', options: rulePriorityOptions.map(o => ({ value: o.value, label: o.label })) },
  ], [availableCategories, categoryGroupLabels, ruleApplicabilityOptions, rulePriorityOptions, ruleTargetOptions])

  const filteredTypes = useMemo(() => {
    return types
      .filter(t => t.active && (selectedCategory === 'all' || t.category === selectedCategory))
      .sort((a, b) => a.code.localeCompare(b.code))
  }, [types, selectedCategory])

  const ruleMap = useMemo(() => {
    const map = new Map<string, ComplianceRule>()
    for (const r of rules) {
      if (r.target_type === 'all') {
        map.set(`${r.compliance_type_id}::all::__all__`, r)
      } else if (r.target_value?.includes(',')) {
        for (const v of r.target_value.split(',')) {
          map.set(`${r.compliance_type_id}::${r.target_type}::${v.trim()}`, r)
        }
      } else {
        map.set(`${r.compliance_type_id}::${r.target_type}::${r.target_value}`, r)
      }
    }
    return map
  }, [rules])

  const rows = useMemo(() => {
    if (activeTargetTab === 'all') return [{ id: '__all__', label: 'Tous les employés', sub: '' }]
    if (activeTargetTab === 'job_position') {
      const allJps = jobPositions ?? []
      const filtered = searchFilter
        ? allJps.filter(jp =>
            jp.code.toLowerCase().includes(searchFilter.toLowerCase()) ||
            jp.name.toLowerCase().includes(searchFilter.toLowerCase()) ||
            (jp.department ?? '').toLowerCase().includes(searchFilter.toLowerCase())
          )
        : allJps
      return filtered.map(jp => ({ id: jp.id, label: `${jp.code}`, sub: `${jp.name}${jp.department ? ` (${jp.department})` : ''}` }))
    }
    if (activeTargetTab === 'packlog_cargo') {
      return packlogCargoTypeOptions.map(option => ({ id: option.value, label: option.label, sub: '' }))
    }
    const vals = new Set<string>()
    for (const r of rules) {
      if (r.target_type === activeTargetTab && r.target_value) vals.add(r.target_value)
    }
    const items = Array.from(vals).sort()
    const filtered = searchFilter
      ? items.filter(v => v.toLowerCase().includes(searchFilter.toLowerCase()))
      : items
    return filtered.map(v => ({ id: v, label: v, sub: '' }))
  }, [activeTargetTab, jobPositions, rules, searchFilter, packlogCargoTypeOptions])

  const tabCounts = useMemo(() => {
    const counts: Record<string, number> = { job_position: 0, all: 0, department: 0, asset: 0, packlog_cargo: 0 }
    for (const r of rules) {
      if (r.target_type in counts) counts[r.target_type]++
    }
    return counts
  }, [rules])

  const handleCellClick = useCallback((typeId: string, rowId: string) => {
    const targetType = activeTargetTab === 'all' ? 'all' : activeTargetTab
    const targetValue = activeTargetTab === 'all' ? undefined : rowId
    const key = activeTargetTab === 'all'
      ? `${typeId}::all::__all__`
      : `${typeId}::${activeTargetTab}::${rowId}`
    const existing = ruleMap.get(key)
    if (existing && onEditRule) {
      onEditRule(existing)
    } else if (existing) {
      onDeleteRule(existing.id)
    } else if (onCreateRulePanel) {
      onCreateRulePanel({ type_id: typeId, target_type: targetType, target_value: targetValue })
    } else {
      onCreateRule({ compliance_type_id: typeId, target_type: targetType, target_value: targetValue })
    }
  }, [ruleMap, onCreateRule, onDeleteRule, onEditRule, onCreateRulePanel, activeTargetTab])

  const filteredRulesForList = useMemo(() => {
    let filtered = rules

    const catFilter = activeRuleFilters.category as string | undefined
    if (catFilter) {
      const typeIds = new Set(types.filter(t => t.category === catFilter).map(t => t.id))
      filtered = filtered.filter(r => typeIds.has(r.compliance_type_id))
    } else if (selectedCategory !== 'all') {
      const typeIds = new Set(types.filter(t => t.category === selectedCategory).map(t => t.id))
      filtered = filtered.filter(r => typeIds.has(r.compliance_type_id))
    }
    const targetFilter = activeRuleFilters.target_type as string | undefined
    if (targetFilter) filtered = filtered.filter(r => r.target_type === targetFilter)
    const appFilter = activeRuleFilters.applicability as string | undefined
    if (appFilter) filtered = filtered.filter(r => r.applicability === appFilter)
    const prioFilter = activeRuleFilters.priority as string | undefined
    if (prioFilter) filtered = filtered.filter(r => r.priority === prioFilter)

    if (searchFilter) {
      const q = searchFilter.toLowerCase()
      filtered = filtered.filter(r => {
        const ct = types.find(t => t.id === r.compliance_type_id)
        const jp = r.target_type === 'job_position' && r.target_value ? jobPositions?.find(p => p.id === r.target_value) : null
        return (ct?.code.toLowerCase().includes(q) || ct?.name.toLowerCase().includes(q) ||
          r.target_value?.toLowerCase().includes(q) || jp?.name.toLowerCase().includes(q) ||
          r.description?.toLowerCase().includes(q))
      })
    }
    return filtered
  }, [rules, types, selectedCategory, searchFilter, jobPositions, activeRuleFilters])

  if (isLoading) {
    return <div className="flex items-center justify-center py-16"><Loader2 size={20} className="animate-spin text-muted-foreground" /></div>
  }

  return (
    <div className="p-2 sm:p-4 space-y-3 sm:space-y-4">
      <DataTableToolbar
        searchValue={searchFilter}
        onSearchChange={setSearchFilter}
        searchPlaceholder={t('conformite.rules.search')}
        filters={ruleFilterDefs}
        activeFilters={activeRuleFilters}
        onFilterChange={handleRuleFilterChange}
        currentViewMode="table"
        onViewModeChange={() => {}}
        toolbarRight={
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-0.5 bg-accent rounded-lg p-0.5">
              <button
                onClick={() => setViewMode('matrix')}
                className={cn('gl-button-sm gl-button-default', viewMode === 'matrix' ? 'shadow-sm' : 'opacity-60 hover:opacity-100')}
                title={t('conformite.rules.view.matrix')}
              >
                <Grid3X3 size={14} />
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={cn('gl-button-sm gl-button-default', viewMode === 'list' ? 'shadow-sm' : 'opacity-60 hover:opacity-100')}
                title={t('conformite.rules.view.list')}
              >
                <List size={14} />
              </button>
            </div>
            <button
              onClick={() => setExportOpen(true)}
              className="gl-button-sm gl-button-default"
              title={t('conformite.rules.export')}
            >
              <Download size={14} />
            </button>
            <span className="text-[11px] text-muted-foreground whitespace-nowrap hidden sm:inline">
              {filteredRulesForList.length}/{rules.length} règle(s)
            </span>
          </div>
        }
      />

      {viewMode === 'list' ? (
        <div className="space-y-2">
          <div className="flex items-center gap-1.5 sm:gap-2 text-xs overflow-x-auto scrollbar-none">
            <span className="text-muted-foreground shrink-0">{t('conformite.rules.group_by.label')}</span>
            {groupByOptions.map(([val, label]) => (
              <button
                key={val}
                onClick={() => { setListGroupBy(val); setCollapsedGroups(new Set()) }}
                className={cn('px-2 py-1 sm:py-0.5 rounded text-xs transition-colors whitespace-nowrap', listGroupBy === val ? 'bg-primary/10 text-primary font-medium' : 'text-muted-foreground hover:bg-accent')}
              >
                {label}
              </button>
            ))}
          </div>

          {(() => {
            const groupedRules = new Map<string, typeof filteredRulesForList>()
            for (const rule of filteredRulesForList) {
              const ct = types.find(t => t.id === rule.compliance_type_id)
              let groupKey: string
              if (listGroupBy === 'target_type') {
                groupKey = ruleTargetLabels[rule.target_type] ?? rule.target_type
              } else if (listGroupBy === 'category') {
                groupKey = categoryGroupLabels[ct?.category ?? ''] ?? ct?.category ?? t('common.other')
              } else if (listGroupBy === 'applicability') {
                groupKey = ruleApplicabilityLabels[rule.applicability] ?? rule.applicability
              } else {
                groupKey = '__all__'
              }
              if (!groupedRules.has(groupKey)) groupedRules.set(groupKey, [])
              groupedRules.get(groupKey)!.push(rule)
            }

            const groups = listGroupBy === 'none' ? [['__all__', filteredRulesForList] as const] : [...groupedRules.entries()].sort((a, b) => a[0].localeCompare(b[0]))

            const toggleGroup = (key: string) => {
              setCollapsedGroups(prev => {
                const next = new Set(prev)
                next.has(key) ? next.delete(key) : next.add(key)
                return next
              })
            }

            return groups.map(([groupKey, groupRules]) => (
              <div key={groupKey} className="border border-border rounded-lg overflow-hidden">
                {listGroupBy !== 'none' && (
                  <button
                    onClick={() => toggleGroup(groupKey)}
                    className="w-full flex items-center gap-2 px-3 py-2 bg-accent/50 border-b border-border text-xs font-semibold text-foreground hover:bg-accent/70 transition-colors"
                  >
                    <svg className={cn('w-3 h-3 transition-transform', collapsedGroups.has(groupKey) ? '' : 'rotate-90')} viewBox="0 0 12 12"><path d="M4 2l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.5" /></svg>
                    {groupKey}
                    <span className="text-[10px] text-muted-foreground font-normal ml-1">({groupRules.length})</span>
                  </button>
                )}
                {!collapsedGroups.has(groupKey) && (
                  <>
                    <table className="text-xs w-full hidden sm:table">
                      <thead>
                        <tr className="bg-muted/30 border-b border-border/50">
                          <th className="px-3 py-1.5 text-left font-medium text-muted-foreground">Type</th>
                          <th className="px-3 py-1.5 text-left font-medium text-muted-foreground">{t('conformite.types.category')}</th>
                          <th className="px-3 py-1.5 text-left font-medium text-muted-foreground">{t('conformite.rules.target_type')}</th>
                          <th className="px-3 py-1.5 text-left font-medium text-muted-foreground">Valeur</th>
                          <th className="px-3 py-1.5 text-left font-medium text-muted-foreground">{t('common.priority')}</th>
                          <th className="px-3 py-1.5 text-left font-medium text-muted-foreground">{t('conformite.rules.applicability_label')}</th>
                          <th className="px-3 py-1.5 text-left font-medium text-muted-foreground">Description</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/30">
                        {groupRules.map(rule => {
                          const ct = types.find(t => t.id === rule.compliance_type_id)
                          const jpNames = rule.target_type === 'job_position' && rule.target_value
                            ? rule.target_value.split(',').map(v => jobPositions?.find(p => p.id === v.trim())).filter(Boolean).map((p: any) => p.name)
                            : []
                          return (
                            <tr
                              key={rule.id}
                              className="hover:bg-accent/30 transition-colors cursor-pointer group"
                              onClick={() => onEditRule?.(rule)}
                            >
                              <td className="px-3 py-2 font-medium text-foreground">{ct ? `${ct.code} — ${ct.name}` : '?'}</td>
                              <td className="px-3 py-2">
                                <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold text-white ${CATEGORY_COLORS_MAP[ct?.category ?? ''] ?? 'bg-zinc-500'}`}>
                                  {categoryGroupLabels[ct?.category ?? ''] ?? ct?.category}
                                </span>
                              </td>
                              <td className="px-3 py-2 text-muted-foreground">
                                {ruleTargetLabels[rule.target_type] ?? rule.target_type}
                              </td>
                              <td className="px-3 py-2 text-foreground">
                                {rule.target_type === 'all' ? '—' : jpNames.length > 0 ? jpNames.join(', ') : rule.target_value ?? '—'}
                              </td>
                              <td className="px-3 py-2">
                                <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold text-white ${PRIORITY_COLORS[rule.priority] ?? 'bg-zinc-500'}`}>
                                  {rulePriorityLabels[rule.priority] ?? rule.priority}
                                </span>
                              </td>
                              <td className="px-3 py-2">
                                <span className={cn('text-[10px] font-medium', rule.applicability === 'contextual' ? 'text-blue-500' : 'text-emerald-600')}>
                                  {ruleApplicabilityLabels[rule.applicability] ?? rule.applicability}
                                </span>
                              </td>
                              <td className="px-3 py-2 text-muted-foreground truncate max-w-[200px]">{rule.description || '—'}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                    <div className="sm:hidden divide-y divide-border/30">
                      {groupRules.map(rule => {
                        const ct = types.find(t => t.id === rule.compliance_type_id)
                        const jpNames = rule.target_type === 'job_position' && rule.target_value
                          ? rule.target_value.split(',').map(v => jobPositions?.find(p => p.id === v.trim())).filter(Boolean).map((p: any) => p.name)
                          : []
                        return (
                          <div
                            key={rule.id}
                            className="p-3 active:bg-accent/30 transition-colors cursor-pointer"
                            onClick={() => onEditRule?.(rule)}
                          >
                            <div className="flex items-start gap-2 mb-1.5">
                              <span className="text-xs font-medium text-foreground flex-1 leading-snug">
                                {ct ? `${ct.code} — ${ct.name}` : '?'}
                              </span>
                              <span className={`shrink-0 inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold text-white ${PRIORITY_COLORS[rule.priority] ?? 'bg-zinc-500'}`}>
                                {rulePriorityLabels[rule.priority] ?? rule.priority}
                              </span>
                            </div>
                            <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
                              <span className={`inline-block px-1.5 py-0.5 rounded font-semibold text-white ${CATEGORY_COLORS_MAP[ct?.category ?? ''] ?? 'bg-zinc-500'}`}>
                                {categoryGroupLabels[ct?.category ?? ''] ?? ct?.category}
                              </span>
                              <span className="text-muted-foreground">
                                {ruleTargetLabels[rule.target_type] ?? rule.target_type}
                                {rule.target_type !== 'all' && (
                                  <> : <span className="text-foreground">{jpNames.length > 0 ? jpNames.join(', ') : rule.target_value ?? '—'}</span></>
                                )}
                              </span>
                              <span className={cn('font-medium', rule.applicability === 'contextual' ? 'text-blue-500' : 'text-emerald-600')}>
                                {ruleApplicabilityLabels[rule.applicability] ?? rule.applicability}
                              </span>
                            </div>
                            {rule.description && (
                              <p className="text-[10px] text-muted-foreground mt-1 line-clamp-2">{rule.description}</p>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </>
                )}
              </div>
            ))
          })()}
          {filteredRulesForList.length === 0 && (
            <div className="text-center py-8 text-muted-foreground text-xs border border-border rounded-lg">{t('conformite.no_rule')}</div>
          )}
        </div>
      ) : (
        <>
          <SubTabBar
            items={targetTabs.map((tab) => ({ ...tab, icon: Scale }))}
            activeId={activeTargetTab}
            onTabChange={setActiveTargetTab}
            counts={tabCounts}
          />

          {filteredTypes.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-xs">
              {t('conformite.rules.no_reference_for_category')}
            </div>
          ) : (
            <div className="border border-border rounded-lg overflow-auto max-h-[calc(100vh-340px)] -mx-2 sm:mx-0 touch-pan-x touch-pan-y">
              <table className="text-xs w-full border-collapse">
                <thead className="sticky top-0 z-20">
                  <tr className="bg-chrome">
                    <th className="sticky left-0 z-30 bg-chrome border-b border-r border-border px-2 sm:px-3 py-2 text-left font-semibold text-muted-foreground min-w-[120px] sm:min-w-[200px]">
                      {activeTargetTab === 'all'
                        ? t('conformite.rules.matrix.scope')
                        : activeTargetTab === 'job_position'
                          ? t('conformite.rules.targets.job_position')
                          : activeTargetTab === 'department'
                            ? t('conformite.rules.targets.department')
                            : activeTargetTab === 'packlog_cargo'
                              ? t('conformite.rules.targets.packlog_cargo')
                              : t('conformite.rules.targets.asset')}
                    </th>
                    {filteredTypes.map((type) => (
                      <th
                        key={type.id}
                        // Vertical rotated headers — fit 24+ columns
                        // in the visible width without horizontal
                        // scroll. 32px data columns + 90px header
                        // height = readable labels, compact grid.
                        className={cn(
                          'border-b border-r border-border text-center font-medium cursor-help transition-colors align-bottom',
                          'p-0',
                          hoveredCol === type.id ? 'bg-primary/10 text-primary' : 'text-foreground',
                        )}
                        style={{ width: 32, minWidth: 32, maxWidth: 32, height: 90 }}
                        title={`${type.name}\n${categoryGroupLabels[type.category] ?? type.category} · ${type.validity_days ? `${type.validity_days}j` : 'Permanent'}${type.is_mandatory ? ' · Obligatoire' : ''}`}
                      >
                        <div className="flex flex-col items-center justify-end gap-1 h-full pb-1">
                          {selectedCategory === 'all' && (
                            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${CATEGORY_COLORS_MAP[type.category] ?? 'bg-zinc-500'}`} title={categoryGroupLabels[type.category] ?? type.category} />
                          )}
                          <span
                            className="text-[10px] leading-none whitespace-nowrap font-semibold tabular-nums"
                            style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
                          >
                            {type.code}
                          </span>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, idx) => {
                    const isRowHovered = hoveredRow === row.id
                    // Zebra stripe base for the row. Hovered row gets
                    // a stronger tint that covers even the non-sticky
                    // cells — handled via the <tr> background so the
                    // underlying zebra shows through ticked cells.
                    const zebraClass = idx % 2 === 0 ? 'bg-card' : 'bg-accent/20'
                    return (
                      <tr
                        key={row.id}
                        className={cn(
                          'transition-colors',
                          isRowHovered ? 'bg-primary/5' : zebraClass,
                        )}
                        onMouseLeave={() => { setHoveredCol(null); setHoveredRow(null) }}
                      >
                        <td className={cn(
                          'sticky left-0 z-10 border-r border-border px-2 sm:px-3 py-1.5 transition-colors min-w-[120px] sm:min-w-[200px]',
                          isRowHovered ? 'bg-primary/10' : zebraClass,
                        )}>
                          <span className={cn('font-medium text-[11px] sm:text-xs', isRowHovered ? 'text-primary' : 'text-foreground')}>{row.label}</span>
                          {row.sub && <span className="text-muted-foreground ml-1 sm:ml-1.5 text-[9px] sm:text-[10px] hidden sm:inline">{row.sub}</span>}
                        </td>
                        {filteredTypes.map((type) => {
                          const key = activeTargetTab === 'all'
                            ? `${type.id}::all::__all__`
                            : `${type.id}::${activeTargetTab}::${row.id}`
                          const rule = ruleMap.get(key)
                          const checked = Boolean(rule)
                          return (
                            <td
                              key={type.id}
                              className={cn(
                                'border-r border-border/30 text-center cursor-pointer transition-colors p-0',
                                // Checked cells get a green tint so
                                // the matrix pattern jumps out. Hover
                                // (col or row) shifts to primary tint.
                                checked
                                  ? 'bg-emerald-500/10 hover:bg-emerald-500/20'
                                  : 'hover:bg-primary/10 active:bg-primary/15',
                                (hoveredCol === type.id && !checked) ? 'bg-primary/5' : '',
                              )}
                              style={{ width: 32, minWidth: 32, maxWidth: 32, height: 28 }}
                              onMouseEnter={() => { setHoveredCol(type.id); setHoveredRow(row.id) }}
                              onClick={() => handleCellClick(type.id, row.id === '__all__' ? '__all__' : row.id)}
                              title={rule
                                ? `${type.name} (${type.category})\n${t('conformite.rules.matrix.validity_days')}: ${rule.override_validity_days ?? type.validity_days ?? '∞'}j${rule.grace_period_days ? ` · ${t('conformite.rules.matrix.grace')}: ${rule.grace_period_days}j` : ''}${rule.renewal_reminder_days ? ` · ${t('conformite.rules.matrix.reminder')}: ${rule.renewal_reminder_days}j` : ''}\n${t('common.priority')}: ${rulePriorityLabels[rule.priority] ?? rule.priority}${rule.effective_from ? `\n${t('conformite.rules.matrix.effective_from')}: ${formatDate(rule.effective_from)}` : ''}\n${t('conformite.rules.matrix.edit_rule')}`
                                : `${t('conformite.rules.matrix.create_rule')} ${type.name}`
                              }
                            >
                              {rule ? (
                                <Check size={12} className={cn('mx-auto', rule.applicability === 'contextual' ? 'text-blue-600 dark:text-blue-400' : 'text-emerald-600 dark:text-emerald-400')} />
                              ) : null}
                            </td>
                          )
                        })}
                      </tr>
                    )
                  })}
                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={filteredTypes.length + 1} className="text-center py-8 text-muted-foreground text-xs">
                        {searchFilter ? t('common.no_results') : activeTargetTab === 'job_position' ? `${t('conformite.no_job_position')}.` : t('conformite.rules.empty_matrix')}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      <ExportWizard
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        data={filteredRulesForList.map(rule => {
          const ct = types.find(t => t.id === rule.compliance_type_id)
          const jpVals = rule.target_type === 'job_position' && rule.target_value
            ? rule.target_value.split(',').map(v => jobPositions?.find(p => p.id === v.trim())).filter(Boolean)
            : []
          return {
            type_code: ct?.code ?? '',
            type_name: ct?.name ?? '',
            category: categoryGroupLabels[ct?.category ?? ''] ?? ct?.category ?? '',
            target_type: ruleTargetLabels[rule.target_type] ?? rule.target_type,
            target_value_display: rule.target_type === 'all' ? (ruleTargetLabels.all ?? 'Tous') : jpVals.length > 0 ? jpVals.map((p: any) => `${p.code} - ${p.name}`).join(', ') : rule.target_value ?? '',
            priority: rulePriorityLabels[rule.priority] ?? rule.priority,
            applicability: ruleApplicabilityLabels[rule.applicability] ?? rule.applicability,
            description: rule.description ?? '',
            effective_from: rule.effective_from ?? '',
            effective_to: rule.effective_to ?? '',
          }
        })}
        columns={[
          { id: 'type_code', header: t('conformite.columns.type_code') },
          { id: 'type_name', header: t('conformite.columns.type_name') },
          { id: 'category', header: t('conformite.columns.category') },
          { id: 'target_type', header: t('conformite.columns.target') },
          { id: 'target_value_display', header: t('conformite.columns.target_value') },
          { id: 'priority', header: t('conformite.columns.priority') },
          { id: 'applicability', header: t('conformite.columns.applicability') },
          { id: 'description', header: t('conformite.columns.description') },
          { id: 'effective_from', header: t('conformite.columns.effective_from') },
          { id: 'effective_to', header: t('conformite.columns.effective_to') },
        ]}
        filenamePrefix="conformite-regles"
      />
    </div>
  )
}
