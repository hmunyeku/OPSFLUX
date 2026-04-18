/**
 * Capacity tab — PlannerPage.
 *
 * Extracted from the monolithic PlannerPage.tsx. Behavior preserved 1:1.
 */
import { useState, useCallback, useMemo, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import {
  BarChart3, Pencil, Loader2, ChevronLeft, ChevronRight, ChevronDown,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { PanelContent } from '@/components/layout/PanelHeader'
import { AssetPicker } from '@/components/shared/AssetPicker'
import { DateRangePicker } from '@/components/shared/DateRangePicker'
import { useToast } from '@/components/ui/Toast'
import { buildCells, buildHeaderGroups, getDefaultDateRange } from '@/components/shared/gantt/ganttEngine'
import type { TimeScale } from '@/components/shared/gantt/ganttEngine'
import { useAssetHierarchy } from '@/hooks/useAssetRegistry'
import {
  useCapacityHeatmap,
  useAssetCapacities,
  useCreateAssetCapacity,
} from '@/hooks/usePlanner'
import type { AssetCapacity } from '@/types/api'
import type { HierarchyFieldNode } from '@/types/assetRegistry'
import { formatDateShort, shiftTimelineRange } from '../shared'

export function CapacityTab({
  timelineScale,
  timelineStartDate,
  timelineEndDate,
  onTimelineScaleChange,
  onTimelineRangeChange,
  compact: _compact = false,
  scenarioId,
}: {
  timelineScale: TimeScale
  timelineStartDate: string
  timelineEndDate: string
  onTimelineScaleChange: (scale: TimeScale) => void
  onTimelineRangeChange: (from: string, to: string) => void
  compact?: boolean
  scenarioId?: string
}) {
  const { t } = useTranslation()
  const [assetId, setAssetId] = useState('')
  const [expandedFieldIds, setExpandedFieldIds] = useState<Set<string>>(new Set())
  const [expandedSiteIds, setExpandedSiteIds] = useState<Set<string>>(new Set())
  const dateRange_ = useMemo(() => ({ from: timelineStartDate, to: timelineEndDate }), [timelineEndDate, timelineStartDate])

  const { data: heatmapData, isLoading: heatmapLoading } = useCapacityHeatmap(
    dateRange_.from,
    dateRange_.to,
    assetId || undefined,
    scenarioId,
  )
  const { data: assetHierarchy = [] } = useAssetHierarchy()

  const { data: capacityHistory } = useAssetCapacities(assetId || undefined)

  const [showCapModal, setShowCapModal] = useState(false)
  const [capForm, setCapForm] = useState({ max_pax_total: 0, permanent_ops_quota: 0, reason: '' })
  const createAssetCapacity = useCreateAssetCapacity()
  const { toast } = useToast()

  const handleCreateCapacity = useCallback(() => {
    if (!assetId || !capForm.reason) return
    createAssetCapacity.mutate(
      { assetId, payload: capForm },
      {
        onSuccess: () => {
          toast({ title: t('planner.toast.capacity_updated'), variant: 'success' })
          setShowCapModal(false)
          setCapForm({ max_pax_total: 0, permanent_ops_quota: 0, reason: '' })
        },
        onError: () => toast({ title: t('planner.toast.update_error'), variant: 'error' }),
      },
    )
  }, [assetId, capForm, createAssetCapacity, toast, t])

  const heatmapDays = heatmapData?.days ?? []
  const heatmapConfig = heatmapData?.config ?? {
    threshold_low: 40,
    threshold_medium: 70,
    threshold_high: 90,
    threshold_critical: 100,
    color_low: '#86efac',
    color_medium: '#4ade80',
    color_high: '#fbbf24',
    color_critical: '#ef4444',
    color_overflow: '#991b1b',
  }
  const capacityCells = useMemo(
    () => buildCells(timelineScale, new Date(dateRange_.from), new Date(dateRange_.to)),
    [timelineScale, dateRange_.from, dateRange_.to],
  )
  const capacityHeaderGroups = useMemo(
    () => buildHeaderGroups(timelineScale, capacityCells),
    [timelineScale, capacityCells],
  )
  const capacityCellWidthClass = timelineScale === 'day'
    ? 'w-14'
    : timelineScale === 'week'
      ? 'w-16'
      : timelineScale === 'month'
        ? 'w-20'
        : 'w-24'

  function saturationColor(pct: number): { backgroundColor: string; color: string } {
    if (pct > heatmapConfig.threshold_critical) {
      return { backgroundColor: heatmapConfig.color_overflow, color: '#ffffff' }
    }
    if (pct > heatmapConfig.threshold_high) {
      return { backgroundColor: heatmapConfig.color_critical, color: '#ffffff' }
    }
    if (pct > heatmapConfig.threshold_medium) {
      return { backgroundColor: heatmapConfig.color_high, color: '#111827' }
    }
    if (pct > heatmapConfig.threshold_low) {
      return { backgroundColor: heatmapConfig.color_medium, color: '#111827' }
    }
    return { backgroundColor: heatmapConfig.color_low, color: '#111827' }
  }

  const capacityItems: AssetCapacity[] = capacityHistory ?? []
  const heatmapSections = useMemo(() => {
    const byAsset = new Map<string, { assetName: string; days: typeof heatmapDays }>()
    for (const day of heatmapDays) {
      const key = day.asset_id || 'unknown'
      const existing = byAsset.get(key)
      if (existing) {
        existing.days.push(day)
      } else {
        byAsset.set(key, {
          assetName: day.asset_name || t('planner.capacity.unknown_site'),
          days: [day],
        })
      }
    }

    return Array.from(byAsset.entries())
      .map(([assetIdKey, section]) => ({
        assetId: assetIdKey,
        assetName: section.assetName,
        days: section.days.sort((a, b) => a.date.localeCompare(b.date)),
        buckets: capacityCells.map((cell) => {
          const bucketDays = section.days.filter((day) => {
            const value = new Date(day.date).getTime()
            return value >= cell.startDate.getTime() && value <= cell.endDate.getTime()
          })
          if (bucketDays.length === 0) {
            return {
              key: cell.key,
              label: cell.label,
              forecast_pax: 0,
              real_pob: 0,
              capacity_limit: 0,
              remaining_capacity: 0,
              saturation_pct: 0,
              start_date: cell.startDate.toISOString().slice(0, 10),
              end_date: cell.endDate.toISOString().slice(0, 10),
            }
          }
          return {
            key: cell.key,
            label: cell.label,
            forecast_pax: Math.max(...bucketDays.map((day) => day.forecast_pax)),
            real_pob: Math.max(...bucketDays.map((day) => day.real_pob)),
            capacity_limit: Math.max(...bucketDays.map((day) => day.capacity_limit)),
            remaining_capacity: Math.min(...bucketDays.map((day) => day.remaining_capacity)),
            saturation_pct: Math.max(...bucketDays.map((day) => day.saturation_pct)),
            start_date: cell.startDate.toISOString().slice(0, 10),
            end_date: cell.endDate.toISOString().slice(0, 10),
          }
        }),
      }))
      .sort((a, b) => a.assetName.localeCompare(b.assetName))
  }, [capacityCells, heatmapDays, t])
  const heatmapHierarchy = useMemo(() => {
    if (assetId) {
      return [{ key: assetId, label: null, sites: [{ key: assetId, label: null, sections: heatmapSections }] }]
    }

    const sectionMap = new Map(heatmapSections.map((section) => [section.assetId, section]))
    const fields: Array<{
      key: string
      label: string
      sites: Array<{ key: string; label: string; sections: typeof heatmapSections }>
    }> = []
    const assignedAssetIds = new Set<string>()

    for (const field of assetHierarchy as HierarchyFieldNode[]) {
      const sites = field.sites
        .map((site) => {
          const sections = site.installations
            .map((installation) => {
              const section = sectionMap.get(installation.id)
              if (section) assignedAssetIds.add(installation.id)
              return section ?? null
            })
            .filter((section): section is (typeof heatmapSections)[number] => Boolean(section))
          if (sections.length === 0) return null
          return {
            key: site.id,
            label: site.name,
            sections,
          }
        })
        .filter(Boolean) as Array<{ key: string; label: string; sections: typeof heatmapSections }>

      if (sites.length > 0) {
        fields.push({
          key: field.id,
          label: field.name,
          sites,
        })
      }
    }

    const unassignedSections = heatmapSections.filter((section) => !assignedAssetIds.has(section.assetId))
    if (unassignedSections.length > 0) {
      fields.push({
        key: 'unassigned',
        label: t('planner.capacity.unassigned_field'),
        sites: [{
          key: 'unassigned-site',
          label: t('planner.capacity.unassigned_site'),
          sections: unassignedSections,
        }],
      })
    }

    return fields
  }, [assetHierarchy, assetId, heatmapSections, t])

  useEffect(() => {
    if (assetId || heatmapHierarchy.length === 0) return
    setExpandedFieldIds((prev) => {
      if (prev.size > 0) return prev
      return new Set(heatmapHierarchy.map((fieldGroup) => fieldGroup.key))
    })
    setExpandedSiteIds((prev) => {
      if (prev.size > 0) return prev
      return new Set(
        heatmapHierarchy.flatMap((fieldGroup) =>
          fieldGroup.sites.map((siteGroup) => `${fieldGroup.key}:${siteGroup.key}`),
        ),
      )
    })
  }, [assetId, heatmapHierarchy])

  const toggleField = useCallback((fieldKey: string) => {
    setExpandedFieldIds((prev) => {
      const next = new Set(prev)
      if (next.has(fieldKey)) next.delete(fieldKey)
      else next.add(fieldKey)
      return next
    })
  }, [])

  const toggleSite = useCallback((siteCompositeKey: string) => {
    setExpandedSiteIds((prev) => {
      const next = new Set(prev)
      if (next.has(siteCompositeKey)) next.delete(siteCompositeKey)
      else next.add(siteCompositeKey)
      return next
    })
  }, [])

  const goToday = useCallback(() => {
    const range = getDefaultDateRange(timelineScale)
    onTimelineRangeChange(range.start, range.end)
  }, [onTimelineRangeChange, timelineScale])

  const shiftRange = useCallback((direction: -1 | 1) => {
    const next = shiftTimelineRange(timelineScale, dateRange_.from, dateRange_.to, direction)
    onTimelineRangeChange(next.start, next.end)
  }, [dateRange_.from, dateRange_.to, onTimelineRangeChange, timelineScale])

  return (
    <>
      {/* Input bar */}
      <div className="flex items-center gap-3 border-b border-border px-4 py-3 flex-wrap">
        <div className="flex flex-col gap-1 w-[280px]">
          <AssetPicker
            value={assetId || null}
            onChange={(id) => setAssetId(id || '')}
            label="Site"
          />
        </div>
        <DateRangePicker
          startDate={dateRange_.from || null}
          endDate={dateRange_.to || null}
          onStartChange={(v) => onTimelineRangeChange(v || dateRange_.from, dateRange_.to)}
          onEndChange={(v) => onTimelineRangeChange(dateRange_.from, v || dateRange_.to)}
          startLabel="Du"
          endLabel="Au"
        />
        <div className="flex items-end gap-1">
          <button
            type="button"
            className="gl-button-sm gl-button-default inline-flex items-center gap-1"
            onClick={() => shiftRange(-1)}
            title={t('planner.capacity.previous_period')}
          >
            <ChevronLeft size={12} />
          </button>
          <button
            type="button"
            className="gl-button-sm gl-button-default"
            onClick={goToday}
          >
            {t('planner.capacity.today')}
          </button>
          <button
            type="button"
            className="gl-button-sm gl-button-default inline-flex items-center gap-1"
            onClick={() => shiftRange(1)}
            title={t('planner.capacity.next_period')}
          >
            <ChevronRight size={12} />
          </button>
        </div>
        {assetId && (
          <div className="flex flex-col gap-1 ml-auto">
            <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">&nbsp;</label>
            <button
              className="gl-button-sm gl-button-default inline-flex items-center gap-1"
              onClick={() => setShowCapModal(true)}
            >
              <Pencil size={11} />
              Modifier capacité
            </button>
          </div>
        )}
      </div>

      <PanelContent>
        {heatmapLoading ? (
          <div className="flex items-center justify-center h-[200px]">
            <Loader2 size={16} className="animate-spin text-muted-foreground" />
          </div>
        ) : heatmapDays.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-10 text-muted-foreground/50 min-h-[300px]">
            <BarChart3 size={32} strokeWidth={1.5} />
            <span className="text-sm">
              {assetId ? t('planner.capacity.empty_title') : t('planner.capacity.empty_idle_title')}
            </span>
          </div>
        ) : (
          <div className="space-y-6 p-4">
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-1">{t('planner.capacity.heatmap_title')}</h3>
              <p className="text-xs text-muted-foreground mb-3">{t('planner.capacity.heatmap_description')}</p>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  {t('planner.capacity.scale_label')}
                </span>
                {(['day', 'week', 'month', 'quarter', 'semester'] as TimeScale[]).map((scale) => (
                  <button
                    key={scale}
                    type="button"
                    onClick={() => onTimelineScaleChange(scale)}
                    className={cn(
                      'px-2 py-1 rounded text-xs font-medium transition-colors',
                      timelineScale === scale
                        ? 'bg-primary/[0.16] text-foreground'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted/40',
                    )}
                  >
                    {t(`planner.capacity.scale.${scale}`)}
                  </button>
                ))}
              </div>
              {timelineScale !== 'day' && (
                <p className="mt-2 text-[10px] text-muted-foreground">
                  {t('planner.capacity.scale_aggregation_note')}
                </p>
              )}
            </div>

            <div className="overflow-x-auto rounded-lg border border-border/50">
              <div className="min-w-max">
                <div className="border-b border-border/50 bg-muted/20">
                  <div className="flex">
                    <div className="w-40 shrink-0 border-r border-border/50 px-3 py-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                      {t('planner.capacity.axis_asset')}
                    </div>
                    <div className="flex">
                      {capacityHeaderGroups.map((group) => (
                        <div
                          key={group.key}
                          className="border-r border-border/30 px-2 py-2 text-center text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
                          style={{ width: `${group.spanCells * (timelineScale === 'day' ? 56 : timelineScale === 'week' ? 64 : timelineScale === 'month' ? 80 : 96)}px` }}
                        >
                          {group.label}
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="flex">
                    <div className="w-40 shrink-0 border-r border-border/50 px-3 py-2 text-[10px] text-muted-foreground">
                      {t('planner.capacity.axis_value_hint')}
                    </div>
                    <div className="flex">
                      {capacityCells.map((cell) => (
                        <div key={cell.key} className={cn('shrink-0 border-r border-border/20 px-1 py-2 text-center text-[10px] text-muted-foreground', capacityCellWidthClass)}>
                          {cell.label}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {heatmapHierarchy.map((fieldGroup) => (
              <div key={fieldGroup.key} className="space-y-3">
                {!assetId && (
                  <button
                    type="button"
                    onClick={() => toggleField(fieldGroup.key)}
                    className="flex w-full items-center gap-2 px-1 text-left"
                  >
                    {expandedFieldIds.has(fieldGroup.key) ? (
                      <ChevronDown size={14} className="text-muted-foreground" />
                    ) : (
                      <ChevronRight size={14} className="text-muted-foreground" />
                    )}
                    <h4 className="text-sm font-semibold text-foreground">{fieldGroup.label}</h4>
                  </button>
                )}
                {(assetId || expandedFieldIds.has(fieldGroup.key)) && fieldGroup.sites.map((siteGroup) => {
                  const siteCompositeKey = `${fieldGroup.key}:${siteGroup.key}`
                  const siteExpanded = assetId ? true : expandedSiteIds.has(siteCompositeKey)
                  return (
                  <div key={siteGroup.key} className="space-y-3">
                    {!assetId && (
                      <button
                        type="button"
                        onClick={() => toggleSite(siteCompositeKey)}
                        className="flex w-full items-center gap-2 px-1 text-left"
                      >
                        {siteExpanded ? (
                          <ChevronDown size={12} className="text-muted-foreground" />
                        ) : (
                          <ChevronRight size={12} className="text-muted-foreground" />
                        )}
                        <h5 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{siteGroup.label}</h5>
                      </button>
                    )}
                    {siteExpanded && siteGroup.sections.map((section) => (
                      <div key={section.assetId} className="rounded-lg border border-border/60 p-3">
                        {!assetId && (
                          <div className="mb-3 flex items-center justify-between gap-3">
                            <h6 className="text-sm font-medium text-foreground">{section.assetName}</h6>
                            <span className="text-[10px] text-muted-foreground">
                              {section.days.length} {t('planner.capacity.days_suffix')}
                            </span>
                          </div>
                        )}
                        <div className="overflow-x-auto">
                          <div className="flex min-w-max gap-1">
                            {section.buckets.map((bucket) => (
                              <div
                                key={`${section.assetId}-${bucket.key}`}
                                className={cn(
                                  'h-12 rounded flex shrink-0 flex-col items-center justify-center cursor-default px-1',
                                  capacityCellWidthClass,
                                )}
                                style={saturationColor(bucket.saturation_pct)}
                                title={t('planner.capacity.heatmap_day_tooltip', {
                                  date: `${bucket.start_date} → ${bucket.end_date}`,
                                  forecast: bucket.forecast_pax,
                                  real: bucket.real_pob,
                                  capacity: bucket.capacity_limit,
                                  saturation: bucket.saturation_pct.toFixed(0),
                                })}
                              >
                                <span className="text-[9px] font-medium leading-none">{bucket.label}</span>
                                <span className="text-[8px] leading-none mt-0.5">
                                  {bucket.forecast_pax}/{bucket.real_pob}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )})}
              </div>
            ))}

            <div className="mt-2 text-[10px] text-muted-foreground">
              {t('planner.capacity.heatmap_cell_legend')}
            </div>
            <div className="flex items-center gap-3 mt-3">
              <span className="text-[10px] text-muted-foreground">{t('planner.capacity.legend_label')}</span>
              <div className="flex items-center gap-1"><div className="w-3 h-3 rounded" style={{ backgroundColor: heatmapConfig.color_low }} /><span className="text-[10px] text-muted-foreground">{`≤${heatmapConfig.threshold_low}%`}</span></div>
              <div className="flex items-center gap-1"><div className="w-3 h-3 rounded" style={{ backgroundColor: heatmapConfig.color_medium }} /><span className="text-[10px] text-muted-foreground">{`${heatmapConfig.threshold_low}-${heatmapConfig.threshold_medium}%`}</span></div>
              <div className="flex items-center gap-1"><div className="w-3 h-3 rounded" style={{ backgroundColor: heatmapConfig.color_high }} /><span className="text-[10px] text-muted-foreground">{`${heatmapConfig.threshold_medium}-${heatmapConfig.threshold_high}%`}</span></div>
              <div className="flex items-center gap-1"><div className="w-3 h-3 rounded" style={{ backgroundColor: heatmapConfig.color_critical }} /><span className="text-[10px] text-muted-foreground">{`${heatmapConfig.threshold_high}-${heatmapConfig.threshold_critical}%`}</span></div>
              <div className="flex items-center gap-1"><div className="w-3 h-3 rounded" style={{ backgroundColor: heatmapConfig.color_overflow }} /><span className="text-[10px] text-muted-foreground">{`>${heatmapConfig.threshold_critical}%`}</span></div>
            </div>

            {/* Capacity history table */}
            {capacityItems.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-foreground mb-3">Historique des capacites</h3>
                <div className="border border-border rounded-lg overflow-hidden">
                  <div className="grid grid-cols-5 gap-2 px-3 py-2 bg-muted/30 text-[10px] font-medium uppercase tracking-wide text-muted-foreground border-b border-border">
                    <span>Date effective</span>
                    <span className="text-right">Max PAX</span>
                    <span className="text-right">Quota ops perm.</span>
                    <span>Motif</span>
                    <span>Modifié par</span>
                  </div>
                  {capacityItems.map((cap) => (
                    <div key={cap.id} className="grid grid-cols-5 gap-2 px-3 py-2 border-b border-border/50 last:border-0">
                      <span className="text-xs text-foreground tabular-nums">{formatDateShort(cap.effective_date)}</span>
                      <span className="text-xs text-foreground tabular-nums text-right">{cap.max_pax_total}</span>
                      <span className="text-xs text-foreground tabular-nums text-right">{cap.permanent_ops_quota}</span>
                      <span className="text-xs text-muted-foreground truncate">{cap.reason}</span>
                      <span className="text-xs text-muted-foreground truncate">{cap.changed_by}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </PanelContent>

      {/* Modify capacity modal */}
      {showCapModal && (
        <div className="gl-modal-backdrop" onClick={() => setShowCapModal(false)}>
          <div className="gl-modal-card" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-foreground">Modifier la capacité</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">Max PAX total</label>
                <input
                  type="number"
                  value={capForm.max_pax_total}
                  onChange={(e) => setCapForm({ ...capForm, max_pax_total: parseInt(e.target.value) || 0 })}
                  className="w-full h-8 px-2 text-sm border border-border rounded bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  min={0}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">Quota ops permanentes</label>
                <input
                  type="number"
                  value={capForm.permanent_ops_quota}
                  onChange={(e) => setCapForm({ ...capForm, permanent_ops_quota: parseInt(e.target.value) || 0 })}
                  className="w-full h-8 px-2 text-sm border border-border rounded bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  min={0}
                />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Motif *</label>
              <textarea
                value={capForm.reason}
                onChange={(e) => setCapForm({ ...capForm, reason: e.target.value })}
                className="w-full min-h-[60px] px-2 py-1.5 text-sm border border-border rounded bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                placeholder="Raison de la modification..."
              />
            </div>
            <div className="flex items-center gap-2 justify-end">
              <button className="gl-button-sm gl-button-default" onClick={() => setShowCapModal(false)}>{t('common.cancel')}</button>
              <button
                className="gl-button-sm gl-button-confirm"
                onClick={handleCreateCapacity}
                disabled={!capForm.reason || createAssetCapacity.isPending}
              >
                {createAssetCapacity.isPending ? <Loader2 size={12} className="animate-spin" /> : 'Enregistrer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
