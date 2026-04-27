/**
 * Capacity tab — PlannerPage.
 *
 * Unified capacity & forecast surface. Replaces the old split between
 * "Capacité" (instant heatmap) and "Prévisions" (cumulative trend) —
 * they were always the same data read at two horizons, the user just
 * had to pick one or the other from a tab bar that hid the connection.
 *
 * Layout (matches Activities / Conflicts conventions):
 *   1. STAT STRIP — clickable KPI cards (sites at risk, peak load,
 *      saturated days, average saturation).
 *   2. TOOLBAR — site picker, project picker, horizon shortcuts,
 *      activity-type filter, and a sub-view segmented control:
 *        Carte (asset × time heatmap)
 *        Tendance (ECharts cumulative line + area)
 *        Calendrier (month-grid heatmap)
 *   3. BODY — the picked sub-view.
 *   4. HISTORIQUE DES CAPACITÉS — collapsible table of past capacity
 *      adjustments (only when a single asset is picked).
 *
 * All filters + sub-view are persisted via useUserPref so the
 * Production Manager keeps her layout across machines.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  AlertTriangle,
  BarChart3,
  CalendarRange,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Gauge,
  Loader2,
  Pencil,
  TrendingUp,
} from 'lucide-react'
import ReactECharts from 'echarts-for-react'
import { cn } from '@/lib/utils'
import { PanelContent } from '@/components/layout/PanelHeader'
import { panelInputClass } from '@/components/layout/DynamicPanel'
import { AssetPicker } from '@/components/shared/AssetPicker'
import { ProjectPicker } from '@/components/shared/ProjectPicker'
import { DateRangePicker } from '@/components/shared/DateRangePicker'
import { useToast } from '@/components/ui/Toast'
import {
  buildCells,
  buildHeaderGroups,
  getDefaultDateRange,
} from '@/components/shared/gantt/ganttEngine'
import type { TimeScale } from '@/components/shared/gantt/ganttEngine'
import { useDictionaryLabels } from '@/hooks/useDictionary'
import { useUserPref } from '@/hooks/useFilterPersistence'
import { useAssetHierarchy } from '@/hooks/useAssetRegistry'
import {
  useAssetCapacities,
  useCapacityHeatmap,
  useCreateAssetCapacity,
  useForecast,
} from '@/hooks/usePlanner'
import type { AssetCapacity, ForecastDay } from '@/types/api'
import type { HierarchyFieldNode } from '@/types/assetRegistry'
import {
  ACTIVITY_TYPE_LABELS_FALLBACK,
  PLANNER_ACTIVITY_TYPE_VALUES,
  StatCard,
  buildDictionaryOptions,
  formatDateShort,
  shiftTimelineRange,
} from '../shared'

type SubView = 'heatmap' | 'trend' | 'calendar'

const SUB_VIEWS: { id: SubView; labelKey: string; icon: typeof BarChart3 }[] = [
  { id: 'heatmap', labelKey: 'planner.capacity.subview.heatmap', icon: BarChart3 },
  { id: 'trend', labelKey: 'planner.capacity.subview.trend', icon: TrendingUp },
  { id: 'calendar', labelKey: 'planner.capacity.subview.calendar', icon: CalendarRange },
]

const HORIZON_PRESETS = [30, 60, 90, 180, 365] as const

// ──────────────────────────────────────────────────────────────────
// Component
// ──────────────────────────────────────────────────────────────────

export function CapacityTab({
  timelineScale,
  timelineStartDate,
  timelineEndDate,
  onTimelineScaleChange,
  onTimelineRangeChange,
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
  const { toast } = useToast()

  // ── Persisted filters ───────────────────────────────────────────
  const [subView, setSubView] = useUserPref<SubView>('planner.capacity.subview', 'heatmap')
  const [assetId, setAssetId] = useUserPref<string>('planner.capacity.assetId', '')
  const [projectId, setProjectId] = useUserPref<string | null>('planner.capacity.projectId', null)
  const [horizon, setHorizon] = useUserPref<number>('planner.capacity.horizon', 90)
  const [typeFilter, setTypeFilter] = useUserPref<string>('planner.capacity.typeFilter', '')
  const [showHistory, setShowHistory] = useUserPref<boolean>('planner.capacity.showHistory', false)

  // Hierarchy expand state — kept in component memory only (not worth
  // a DB roundtrip per branch).
  const [expandedFieldIds, setExpandedFieldIds] = useState<Set<string>>(new Set())
  const [expandedSiteIds, setExpandedSiteIds] = useState<Set<string>>(new Set())

  // Mobile filters popover open state — DOM-local, not persisted.
  const [showMobileFilters, setShowMobileFilters] = useState(false)

  // Day-cell drill-down: clicking a heatmap bucket opens a modal with
  // the bucket's saturation breakdown plus a shortcut to view the
  // matching activities. Bucket shape is the same as HeatmapBucket
  // declared at the bottom of this file — repeated inline here because
  // TS hoists types but linters trip on cross-reference order.
  const [drillDown, setDrillDown] = useState<{
    assetName: string
    assetId: string
    bucket: {
      key: string
      label: string
      forecast_pax: number
      real_pob: number
      capacity_limit: number
      remaining_capacity: number
      saturation_pct: number
      start_date: string
      end_date: string
    }
  } | null>(null)

  // How many of the secondary filters are currently set — drives the
  // badge on the mobile "Filtres" button so the user knows at a glance
  // that filters are active even when the popover is closed.
  const filtersActiveCount = useMemo(() => {
    let n = 0
    if (assetId) n++
    if (projectId) n++
    if (typeFilter) n++
    return n
  }, [assetId, projectId, typeFilter])

  const dateRange = useMemo(
    () => ({ from: timelineStartDate, to: timelineEndDate }),
    [timelineStartDate, timelineEndDate],
  )

  // ── Data sources ────────────────────────────────────────────────
  const { data: heatmapData, isLoading: heatmapLoading } = useCapacityHeatmap(
    dateRange.from,
    dateRange.to,
    assetId || undefined,
    scenarioId,
  )
  const { data: forecastData, isLoading: forecastLoading } = useForecast(
    assetId || undefined,
    horizon,
    typeFilter || undefined,
    projectId || undefined,
  )
  const { data: assetHierarchy = [] } = useAssetHierarchy()
  const { data: capacityHistory } = useAssetCapacities(assetId || undefined)

  const activityTypeLabels = useDictionaryLabels(
    'planner_activity_type',
    ACTIVITY_TYPE_LABELS_FALLBACK,
  )
  const activityTypeOptions = useMemo(
    () => buildDictionaryOptions(activityTypeLabels, PLANNER_ACTIVITY_TYPE_VALUES),
    [activityTypeLabels],
  )

  // ── Capacity edit modal ────────────────────────────────────────
  const [showCapModal, setShowCapModal] = useState(false)
  const [capForm, setCapForm] = useState({
    max_pax_total: 0,
    permanent_ops_quota: 0,
    reason: '',
  })
  const createAssetCapacity = useCreateAssetCapacity()
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
        onError: () =>
          toast({ title: t('planner.toast.update_error'), variant: 'error' }),
      },
    )
  }, [assetId, capForm, createAssetCapacity, toast, t])

  // ── Heatmap shaping ────────────────────────────────────────────
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
    () => buildCells(timelineScale, new Date(dateRange.from), new Date(dateRange.to)),
    [timelineScale, dateRange.from, dateRange.to],
  )
  const capacityHeaderGroups = useMemo(
    () => buildHeaderGroups(timelineScale, capacityCells),
    [timelineScale, capacityCells],
  )
  const capacityCellWidthClass =
    timelineScale === 'day'
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

  const heatmapSections = useMemo(() => {
    const byAsset = new Map<string, { assetName: string; days: typeof heatmapDays }>()
    for (const day of heatmapDays) {
      const key = day.asset_id || 'unknown'
      const existing = byAsset.get(key)
      if (existing) existing.days.push(day)
      else
        byAsset.set(key, {
          assetName: day.asset_name || t('planner.capacity.unknown_site'),
          days: [day],
        })
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
            forecast_pax: Math.max(...bucketDays.map((d) => d.forecast_pax)),
            real_pob: Math.max(...bucketDays.map((d) => d.real_pob)),
            capacity_limit: Math.max(...bucketDays.map((d) => d.capacity_limit)),
            remaining_capacity: Math.min(...bucketDays.map((d) => d.remaining_capacity)),
            saturation_pct: Math.max(...bucketDays.map((d) => d.saturation_pct)),
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
    const sectionMap = new Map(heatmapSections.map((s) => [s.assetId, s]))
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
            .map((inst) => {
              const section = sectionMap.get(inst.id)
              if (section) assignedAssetIds.add(inst.id)
              return section ?? null
            })
            .filter((s): s is (typeof heatmapSections)[number] => Boolean(s))
          if (sections.length === 0) return null
          return { key: site.id, label: site.name, sections }
        })
        .filter(Boolean) as Array<{ key: string; label: string; sections: typeof heatmapSections }>
      if (sites.length > 0) fields.push({ key: field.id, label: field.name, sites })
    }
    const unassignedSections = heatmapSections.filter((s) => !assignedAssetIds.has(s.assetId))
    if (unassignedSections.length > 0) {
      fields.push({
        key: 'unassigned',
        label: t('planner.capacity.unassigned_field'),
        sites: [
          {
            key: 'unassigned-site',
            label: t('planner.capacity.unassigned_site'),
            sections: unassignedSections,
          },
        ],
      })
    }
    return fields
  }, [assetHierarchy, assetId, heatmapSections, t])

  useEffect(() => {
    if (assetId || heatmapHierarchy.length === 0) return
    setExpandedFieldIds((prev) => (prev.size > 0 ? prev : new Set(heatmapHierarchy.map((f) => f.key))))
    setExpandedSiteIds((prev) =>
      prev.size > 0
        ? prev
        : new Set(
            heatmapHierarchy.flatMap((f) => f.sites.map((s) => `${f.key}:${s.key}`)),
          ),
    )
  }, [assetId, heatmapHierarchy])

  const toggleField = useCallback((k: string) => {
    setExpandedFieldIds((prev) => {
      const n = new Set(prev)
      if (n.has(k)) n.delete(k)
      else n.add(k)
      return n
    })
  }, [])
  const toggleSite = useCallback((k: string) => {
    setExpandedSiteIds((prev) => {
      const n = new Set(prev)
      if (n.has(k)) n.delete(k)
      else n.add(k)
      return n
    })
  }, [])

  const goToday = useCallback(() => {
    const range = getDefaultDateRange(timelineScale)
    onTimelineRangeChange(range.start, range.end)
  }, [onTimelineRangeChange, timelineScale])

  const shiftRange = useCallback(
    (direction: -1 | 1) => {
      const next = shiftTimelineRange(timelineScale, dateRange.from, dateRange.to, direction)
      onTimelineRangeChange(next.start, next.end)
    },
    [dateRange.from, dateRange.to, onTimelineRangeChange, timelineScale],
  )

  // ── KPIs (driven by forecast.summary, falls back to heatmap days
  //   when no asset is picked yet) ───────────────────────────────────
  const kpis = useMemo(() => {
    if (forecastData?.summary) {
      const s = forecastData.summary
      return {
        atRiskDays: s.at_risk_days,
        avgLoad: s.avg_projected_load,
        avgRealPob: s.avg_real_pob,
        peakLoad: s.peak_load,
        peakDate: s.peak_date,
        maxCapacity: s.max_capacity,
        avgSaturation:
          s.max_capacity > 0
            ? Math.round((s.avg_projected_load / s.max_capacity) * 100)
            : 0,
        overflowDays: (forecastData.forecast || []).filter(
          (d: ForecastDay) => d.max_capacity > 0 && d.combined_load > d.max_capacity,
        ).length,
      }
    }
    // Fallback aggregates from the heatmap days (multi-site mode).
    const overflow = heatmapDays.filter((d) => d.saturation_pct > 100).length
    const atRisk = heatmapDays.filter((d) => d.saturation_pct > 80).length
    const peak = heatmapDays.reduce(
      (m, d) => (d.saturation_pct > (m?.saturation_pct ?? -1) ? d : m),
      undefined as (typeof heatmapDays)[number] | undefined,
    )
    const avgLoad =
      heatmapDays.length === 0
        ? 0
        : Math.round(
            heatmapDays.reduce((s, d) => s + d.forecast_pax, 0) / heatmapDays.length,
          )
    const avgSat =
      heatmapDays.length === 0
        ? 0
        : Math.round(
            heatmapDays.reduce((s, d) => s + d.saturation_pct, 0) / heatmapDays.length,
          )
    return {
      atRiskDays: atRisk,
      avgLoad,
      avgRealPob: 0,
      peakLoad: peak?.forecast_pax ?? 0,
      peakDate: peak?.date ?? null,
      maxCapacity: peak?.capacity_limit ?? 0,
      avgSaturation: avgSat,
      overflowDays: overflow,
    }
  }, [forecastData, heatmapDays])

  // ── KPI sparklines — daily series sampled from the forecast so
  //   each stat card shows the trend it represents (saturation curve,
  //   load curve, threshold-crossings count). When no asset is picked,
  //   we sample from the heatmap days. Always returns ≥2 numbers so
  //   StatCard's sparkline doesn't bail out. ──────────────────────────
  const sparklines = useMemo(() => {
    if (forecastData?.forecast && forecastData.forecast.length > 0) {
      const fc = forecastData.forecast as ForecastDay[]
      const sat = fc.map((d) =>
        d.max_capacity > 0 ? Math.round((d.combined_load / d.max_capacity) * 100) : 0,
      )
      const atRisk: number[] = []
      const overflow: number[] = []
      let satRunning = 0
      let overRunning = 0
      for (const pct of sat) {
        if (pct > 80) satRunning++
        if (pct > 100) overRunning++
        atRisk.push(satRunning)
        overflow.push(overRunning)
      }
      return {
        atRisk,
        overflow,
        peak: fc.map((d) => d.combined_load),
        avgSat: sat,
      }
    }
    if (heatmapDays.length > 0) {
      const sat = heatmapDays.map((d) => Math.round(d.saturation_pct))
      return {
        atRisk: sat.map((p) => (p > 80 ? 1 : 0)),
        overflow: sat.map((p) => (p > 100 ? 1 : 0)),
        peak: heatmapDays.map((d) => d.forecast_pax),
        avgSat: sat,
      }
    }
    return { atRisk: [], overflow: [], peak: [], avgSat: [] }
  }, [forecastData, heatmapDays])

  const isLoading = heatmapLoading || (subView === 'trend' && forecastLoading)

  // ──────────────────────────────────────────────────────────────
  // Render
  // ──────────────────────────────────────────────────────────────

  return (
    <>
      {/* ── KPI strip ──────────────────────────────────────────── */}
      <div className="@container/stats border-b border-border">
        <div className="flex gap-2 overflow-x-auto px-4 py-3 snap-x snap-mandatory @md/stats:grid @md/stats:grid-cols-4 @md/stats:gap-3 @md/stats:overflow-visible @md/stats:snap-none">
          <StatCard
            label={t('planner.capacity.kpi.at_risk_days', 'Jours à risque (>80%)')}
            value={kpis.atRiskDays}
            icon={AlertTriangle}
            accent={kpis.atRiskDays > 0 ? 'text-amber-600 dark:text-amber-400' : undefined}
            sparkline={sparklines.atRisk}
          />
          <StatCard
            label={t('planner.capacity.kpi.overflow_days', 'Jours en surcapacité')}
            value={kpis.overflowDays}
            icon={AlertTriangle}
            accent={kpis.overflowDays > 0 ? 'text-rose-600 dark:text-rose-400' : undefined}
            sparkline={sparklines.overflow}
          />
          <StatCard
            label={t('planner.capacity.kpi.peak_load', 'Pic de charge')}
            value={
              kpis.peakDate
                ? `${kpis.peakLoad} · ${formatDateShort(kpis.peakDate)}`
                : kpis.peakLoad
            }
            icon={TrendingUp}
            sparkline={sparklines.peak}
          />
          <StatCard
            label={t('planner.capacity.kpi.avg_saturation', 'Saturation moyenne')}
            value={`${kpis.avgSaturation}%`}
            icon={Gauge}
            accent={
              kpis.avgSaturation > 80
                ? 'text-rose-600 dark:text-rose-400'
                : kpis.avgSaturation > 60
                  ? 'text-amber-600 dark:text-amber-400'
                  : 'text-emerald-600 dark:text-emerald-400'
            }
            sparkline={sparklines.avgSat}
          />
        </div>
      </div>

      {/* ── Toolbar ────────────────────────────────────────────────
          Two-row responsive toolbar:
            Row 1 (always visible): sub-view segmented control + the
                  active filter "chips" (Site, Projet, Type) on
                  desktop / a single "Filtres" button on mobile.
            Row 2 (heatmap only): horizon for trend/calendar, OR
                  date range nav for heatmap.
          The pattern matches Activities/Conflits — secondary filters
          collapse behind a popover on narrow viewports so the
          toolbar never wraps into a 4-row monstrosity. */}
      <div className="border-b border-border bg-background sticky top-0 z-10">
        <div className="px-3 sm:px-4 py-2 flex items-center gap-2 flex-wrap">
          {/* Sub-view picker — always inline, icon-only on mobile */}
          <div className="inline-flex rounded-md border border-border bg-muted/20 p-0.5 shrink-0">
            {SUB_VIEWS.map((v) => {
              const Icon = v.icon
              return (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => setSubView(v.id)}
                  className={cn(
                    'px-2 py-1 rounded text-[11px] font-medium inline-flex items-center gap-1.5 transition-colors',
                    subView === v.id
                      ? 'bg-background shadow-sm text-foreground'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                  title={t(v.labelKey)}
                  aria-label={t(v.labelKey)}
                >
                  <Icon size={12} />
                  <span className="hidden sm:inline">{t(v.labelKey)}</span>
                </button>
              )
            })}
          </div>

          {/* Desktop filters — inline */}
          <div className="hidden md:flex items-center gap-1.5 flex-wrap min-w-0">
            <div className="w-[180px]">
              <AssetPicker
                value={assetId || null}
                onChange={(id) => setAssetId(id || '')}
                placeholder={t('planner.filters.all_assets', 'Tous assets')}
                clearable
              />
            </div>
            <div className="w-[160px]">
              <ProjectPicker
                value={projectId}
                onChange={(id) => setProjectId(id)}
                placeholder={t('planner.filters.all_projects', 'Tous projets')}
                clearable
              />
            </div>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className={cn(panelInputClass, 'h-7 text-xs w-[140px]')}
            >
              <option value="">{t('planner.filters.all_types', 'Tous types')}</option>
              {activityTypeOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Mobile filter popover trigger */}
          <button
            type="button"
            onClick={() => setShowMobileFilters((v) => !v)}
            className="md:hidden h-7 px-2 text-[11px] border border-border rounded inline-flex items-center gap-1 hover:bg-muted/50"
          >
            {filtersActiveCount > 0 && (
              <span className="inline-flex items-center justify-center h-4 min-w-4 px-1 rounded-full bg-primary text-primary-foreground text-[9px] font-bold">
                {filtersActiveCount}
              </span>
            )}
            {t('common.filter', 'Filtres')}
            {showMobileFilters ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
          </button>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Horizon segmented control — only meaningful for trend / calendar.
              Hidden on heatmap where date-range below drives the period. */}
          {subView !== 'heatmap' && (
            <div className="inline-flex rounded-md border border-border bg-muted/20 p-0.5 shrink-0">
              {HORIZON_PRESETS.map((h) => (
                <button
                  key={h}
                  type="button"
                  onClick={() => setHorizon(h)}
                  className={cn(
                    'px-1.5 sm:px-2 py-1 rounded text-[10px] sm:text-[11px] font-medium transition-colors',
                    horizon === h
                      ? 'bg-background shadow-sm text-foreground'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                  title={
                    h >= 365 ? t('planner.capacity.horizon_year', '1 an') : `${h} jours`
                  }
                >
                  {h >= 365 ? '1 an' : `${h}j`}
                </button>
              ))}
            </div>
          )}

          {assetId && (
            <button
              className="gl-button-sm gl-button-default inline-flex items-center gap-1 shrink-0"
              onClick={() => setShowCapModal(true)}
              title={t('planner.edit_capacity', 'Modifier capacité')}
            >
              <Pencil size={11} />
              <span className="hidden lg:inline">
                {t('planner.edit_capacity', 'Modifier capacité')}
              </span>
            </button>
          )}
        </div>

        {/* Row 2 — heatmap-only date-range navigator. Hidden when
            sub-view is trend/calendar (those use horizon instead). */}
        {subView === 'heatmap' && (
          <div className="px-3 sm:px-4 pb-2 flex items-center gap-2 flex-wrap border-t border-border/40 pt-2">
            <div className="hidden sm:block">
              <DateRangePicker
                startDate={dateRange.from || null}
                endDate={dateRange.to || null}
                onStartChange={(v) =>
                  onTimelineRangeChange(v || dateRange.from, dateRange.to)
                }
                onEndChange={(v) => onTimelineRangeChange(dateRange.from, v || dateRange.to)}
                startLabel={t('planner.capacity.range_start', 'Du')}
                endLabel={t('planner.capacity.range_end', 'Au')}
              />
            </div>
            <div className="flex items-center gap-1 sm:ml-auto">
              <button
                type="button"
                className="gl-button-sm gl-button-default inline-flex items-center"
                onClick={() => shiftRange(-1)}
                aria-label={t('planner.capacity.previous_period')}
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
                className="gl-button-sm gl-button-default inline-flex items-center"
                onClick={() => shiftRange(1)}
                aria-label={t('planner.capacity.next_period')}
              >
                <ChevronRight size={12} />
              </button>
            </div>
            {/* Scale picker on mobile only — desktop has it inside the
                heatmap header. Folded here on mobile to save a row. */}
            <div className="sm:hidden flex items-center gap-1 overflow-x-auto">
              {(['day', 'week', 'month', 'quarter'] as TimeScale[]).map((sc) => (
                <button
                  key={sc}
                  type="button"
                  onClick={() => onTimelineScaleChange(sc)}
                  className={cn(
                    'px-2 py-1 rounded text-[10px] font-medium shrink-0',
                    timelineScale === sc
                      ? 'bg-primary/15 text-foreground'
                      : 'text-muted-foreground hover:bg-muted/40',
                  )}
                >
                  {t(`planner.capacity.scale.${sc}`)}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Mobile filters popover */}
        {showMobileFilters && (
          <>
            <div
              className="fixed inset-0 z-40 bg-foreground/10 md:hidden"
              onClick={() => setShowMobileFilters(false)}
            />
            <div className="fixed inset-x-3 top-[7rem] z-50 max-w-md mx-auto rounded-md border bg-popover shadow-xl p-3 space-y-2.5 md:hidden">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-foreground">
                  {t('common.filter', 'Filtres')}
                </span>
                <button
                  type="button"
                  onClick={() => setShowMobileFilters(false)}
                  className="text-muted-foreground hover:text-foreground p-0.5"
                  aria-label={t('common.close', 'Fermer')}
                >
                  <ChevronUp size={14} />
                </button>
              </div>
              <div>
                <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground block mb-1">
                  {t('planner.columns.site', 'Site')}
                </label>
                <AssetPicker
                  value={assetId || null}
                  onChange={(id) => setAssetId(id || '')}
                  placeholder={t('planner.filters.all_assets', 'Tous assets')}
                  clearable
                />
              </div>
              <div>
                <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground block mb-1">
                  {t('common.project', 'Projet')}
                </label>
                <ProjectPicker
                  value={projectId}
                  onChange={(id) => setProjectId(id)}
                  placeholder={t('planner.filters.all_projects', 'Tous projets')}
                  clearable
                />
              </div>
              <div>
                <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground block mb-1">
                  {t('planner.capacity.activity_type', "Type d'activité")}
                </label>
                <select
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value)}
                  className={cn(panelInputClass, 'h-8 text-xs w-full')}
                >
                  <option value="">
                    {t('planner.filters.all_types', 'Tous types')}
                  </option>
                  {activityTypeOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
              {filtersActiveCount > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setAssetId('')
                    setProjectId(null)
                    setTypeFilter('')
                  }}
                  className="w-full text-xs text-primary hover:underline pt-1"
                >
                  {t('common.reset', 'Réinitialiser')}
                </button>
              )}
            </div>
          </>
        )}
      </div>

      {/* ── Body — sub-view ────────────────────────────────────── */}
      <PanelContent>
        {isLoading ? (
          <div className="flex items-center justify-center h-[200px]">
            <Loader2 size={16} className="animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="p-4 space-y-6">
            {subView === 'heatmap' && (
              <HeatmapView
                heatmapDays={heatmapDays}
                heatmapHierarchy={heatmapHierarchy}
                capacityCells={capacityCells}
                capacityHeaderGroups={capacityHeaderGroups}
                capacityCellWidthClass={capacityCellWidthClass}
                heatmapConfig={heatmapConfig}
                saturationColor={saturationColor}
                expandedFieldIds={expandedFieldIds}
                expandedSiteIds={expandedSiteIds}
                toggleField={toggleField}
                toggleSite={toggleSite}
                assetId={assetId}
                timelineScale={timelineScale}
                onTimelineScaleChange={onTimelineScaleChange}
                onCellClick={(section, bucket) =>
                  setDrillDown({
                    assetName: section.assetName,
                    assetId: section.assetId,
                    bucket,
                  })
                }
              />
            )}

            {subView === 'trend' && (
              <TrendView
                assetId={assetId}
                forecast={forecastData?.forecast as ForecastDay[] | undefined}
                isEmpty={!forecastData?.forecast?.length}
              />
            )}

            {subView === 'calendar' && (
              <CalendarView
                assetId={assetId}
                forecast={forecastData?.forecast as ForecastDay[] | undefined}
                horizon={horizon}
                isEmpty={!forecastData?.forecast?.length}
              />
            )}

            {/* Capacity history — collapsible, only when a single
                asset is picked (multi-asset doesn't have history). */}
            {assetId && (capacityHistory ?? []).length > 0 && (
              <div className="border border-border rounded-lg overflow-hidden">
                <button
                  type="button"
                  onClick={() => setShowHistory(!showHistory)}
                  className="w-full flex items-center justify-between px-3 py-2 bg-muted/30 hover:bg-muted/50 transition-colors"
                >
                  <span className="text-xs font-semibold text-foreground">
                    {t('planner.capacity.history_title', 'Historique des capacités')}{' '}
                    <span className="text-muted-foreground">
                      ({(capacityHistory ?? []).length})
                    </span>
                  </span>
                  <ChevronDown
                    size={14}
                    className={cn(
                      'text-muted-foreground transition-transform',
                      showHistory && 'rotate-180',
                    )}
                  />
                </button>
                {showHistory && (
                  <CapacityHistoryTable items={capacityHistory ?? []} />
                )}
              </div>
            )}
          </div>
        )}
      </PanelContent>

      {/* ── Day drill-down modal ──────────────────────────────────
          Opens when the user clicks any heatmap cell. Surfaces the
          numbers behind the color (forecast PAX / real POB / capacity
          / remaining / saturation %) and gives a one-click route to
          the activities-for-that-day list. */}
      {drillDown && (
        <div className="gl-modal-backdrop" onClick={() => setDrillDown(null)}>
          <div
            className={cn('gl-modal-card max-w-md', '!overflow-visible')}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-foreground truncate">
                  {drillDown.assetName} · {drillDown.bucket.label}
                </h3>
                <p className="text-[11px] text-muted-foreground tabular-nums">
                  {drillDown.bucket.start_date}
                  {drillDown.bucket.end_date !== drillDown.bucket.start_date &&
                    ` → ${drillDown.bucket.end_date}`}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDrillDown(null)}
                className="text-muted-foreground hover:text-foreground p-0.5 -m-0.5 shrink-0"
                aria-label={t('common.close', 'Fermer')}
              >
                <ChevronUp size={14} />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="rounded border border-border px-2 py-1.5">
                <div className="text-[10px] uppercase text-muted-foreground">
                  {t('planner.capacity.drill.forecast', 'Charge prévue')}
                </div>
                <div className="text-foreground font-semibold tabular-nums">
                  {drillDown.bucket.forecast_pax} PAX
                </div>
              </div>
              <div className="rounded border border-border px-2 py-1.5">
                <div className="text-[10px] uppercase text-muted-foreground">
                  {t('planner.capacity.drill.real_pob', 'POB réel')}
                </div>
                <div className="text-foreground font-semibold tabular-nums">
                  {drillDown.bucket.real_pob} PAX
                </div>
              </div>
              <div className="rounded border border-border px-2 py-1.5">
                <div className="text-[10px] uppercase text-muted-foreground">
                  {t('planner.capacity.drill.capacity', 'Capacité')}
                </div>
                <div className="text-foreground font-semibold tabular-nums">
                  {drillDown.bucket.capacity_limit} PAX
                </div>
              </div>
              <div
                className={cn(
                  'rounded border px-2 py-1.5',
                  drillDown.bucket.remaining_capacity < 0
                    ? 'border-rose-500/40 bg-rose-500/5'
                    : 'border-emerald-500/40 bg-emerald-500/5',
                )}
              >
                <div className="text-[10px] uppercase text-muted-foreground">
                  {drillDown.bucket.remaining_capacity < 0
                    ? t('planner.capacity.drill.deficit', 'Dépassement')
                    : t('planner.capacity.drill.remaining', 'Marge restante')}
                </div>
                <div
                  className={cn(
                    'font-semibold tabular-nums',
                    drillDown.bucket.remaining_capacity < 0
                      ? 'text-rose-700 dark:text-rose-300'
                      : 'text-emerald-700 dark:text-emerald-300',
                  )}
                >
                  {Math.abs(drillDown.bucket.remaining_capacity)} PAX
                </div>
              </div>
            </div>
            {/* Saturation gauge */}
            <div>
              <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1">
                <span>{t('planner.capacity.drill.saturation', 'Saturation')}</span>
                <span className="tabular-nums font-semibold text-foreground">
                  {drillDown.bucket.saturation_pct.toFixed(0)}%
                </span>
              </div>
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full transition-all"
                  style={{
                    width: `${Math.min(100, drillDown.bucket.saturation_pct)}%`,
                    backgroundColor: saturationColor(drillDown.bucket.saturation_pct).backgroundColor,
                  }}
                />
              </div>
            </div>
            <div className="flex items-center gap-2 justify-end pt-2 border-t border-border">
              <button
                className="gl-button-sm gl-button-default"
                onClick={() => setDrillDown(null)}
              >
                {t('common.close', 'Fermer')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit capacity modal ────────────────────────────────── */}
      {showCapModal && (
        <div className="gl-modal-backdrop" onClick={() => setShowCapModal(false)}>
          <div className="gl-modal-card" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-foreground">
              {t('planner.edit_capacity', 'Modifier la capacité')}
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">
                  {t('planner.capacity.max_pax', 'Max PAX total')}
                </label>
                <input
                  type="number"
                  value={capForm.max_pax_total}
                  onChange={(e) =>
                    setCapForm({ ...capForm, max_pax_total: parseInt(e.target.value) || 0 })
                  }
                  className={cn(panelInputClass, 'h-8')}
                  min={0}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">
                  {t('planner.capacity.permanent_ops_quota', 'Quota ops permanentes')}
                </label>
                <input
                  type="number"
                  value={capForm.permanent_ops_quota}
                  onChange={(e) =>
                    setCapForm({
                      ...capForm,
                      permanent_ops_quota: parseInt(e.target.value) || 0,
                    })
                  }
                  className={cn(panelInputClass, 'h-8')}
                  min={0}
                />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">
                {t('planner.capacity.reason', 'Motif')}{' '}
                <span className="text-rose-500">*</span>
              </label>
              <textarea
                value={capForm.reason}
                onChange={(e) => setCapForm({ ...capForm, reason: e.target.value })}
                className={cn(panelInputClass, 'min-h-[60px] resize-y')}
                placeholder={t('planner.capacity.reason_placeholder', 'Raison de la modification…')}
              />
            </div>
            <div className="flex items-center gap-2 justify-end">
              <button
                className="gl-button-sm gl-button-default"
                onClick={() => setShowCapModal(false)}
              >
                {t('common.cancel')}
              </button>
              <button
                className="gl-button-sm gl-button-confirm"
                onClick={handleCreateCapacity}
                disabled={!capForm.reason || createAssetCapacity.isPending}
              >
                {createAssetCapacity.isPending ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  t('common.save', 'Enregistrer')
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// ──────────────────────────────────────────────────────────────────
// Sub-views
// ──────────────────────────────────────────────────────────────────

interface HeatmapBucket {
  key: string
  label: string
  forecast_pax: number
  real_pob: number
  capacity_limit: number
  remaining_capacity: number
  saturation_pct: number
  start_date: string
  end_date: string
}

interface HeatmapSection {
  assetId: string
  assetName: string
  days: unknown[]
  buckets: HeatmapBucket[]
}

interface HeatmapHierarchyNode {
  key: string
  label: string | null
  sites: Array<{
    key: string
    label: string | null
    sections: HeatmapSection[]
  }>
}

interface HeatmapViewProps {
  heatmapDays: unknown[]
  heatmapHierarchy: HeatmapHierarchyNode[]
  capacityCells: ReturnType<typeof buildCells>
  capacityHeaderGroups: ReturnType<typeof buildHeaderGroups>
  capacityCellWidthClass: string
  heatmapConfig: {
    threshold_low: number
    threshold_medium: number
    threshold_high: number
    threshold_critical: number
    color_low: string
    color_medium: string
    color_high: string
    color_critical: string
    color_overflow: string
  }
  saturationColor: (pct: number) => { backgroundColor: string; color: string }
  expandedFieldIds: Set<string>
  expandedSiteIds: Set<string>
  toggleField: (k: string) => void
  toggleSite: (k: string) => void
  assetId: string
  timelineScale: TimeScale
  onTimelineScaleChange: (s: TimeScale) => void
  onCellClick?: (section: HeatmapSection, bucket: HeatmapBucket) => void
}

function HeatmapView({
  heatmapDays,
  heatmapHierarchy,
  capacityCells,
  capacityHeaderGroups,
  capacityCellWidthClass,
  heatmapConfig,
  saturationColor,
  expandedFieldIds,
  expandedSiteIds,
  toggleField,
  toggleSite,
  assetId,
  timelineScale,
  onTimelineScaleChange,
  onCellClick,
}: HeatmapViewProps) {
  const { t } = useTranslation()

  if (heatmapDays.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-10 text-muted-foreground/50 min-h-[300px]">
        <BarChart3 size={32} strokeWidth={1.5} />
        <span className="text-sm">
          {assetId
            ? t('planner.capacity.empty_title')
            : t('planner.capacity.empty_idle_title')}
        </span>
      </div>
    )
  }

  return (
    <>
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-1">
          {t('planner.capacity.heatmap_title')}
        </h3>
        <p className="text-xs text-muted-foreground mb-3">
          {t('planner.capacity.heatmap_description')}
        </p>
        {/* Desktop-only scale picker — mobile gets it on the
            sticky toolbar's row 2 so we don't duplicate. */}
        <div className="hidden sm:flex items-center gap-2 flex-wrap">
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
                    style={{
                      width: `${
                        group.spanCells *
                        (timelineScale === 'day'
                          ? 56
                          : timelineScale === 'week'
                            ? 64
                            : timelineScale === 'month'
                              ? 80
                              : 96)
                      }px`,
                    }}
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
                  <div
                    key={cell.key}
                    className={cn(
                      'shrink-0 border-r border-border/20 px-1 py-2 text-center text-[10px] text-muted-foreground',
                      capacityCellWidthClass,
                    )}
                  >
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
          {!assetId && fieldGroup.label && (
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
          {(assetId || expandedFieldIds.has(fieldGroup.key)) &&
            fieldGroup.sites.map((siteGroup) => {
              const k = `${fieldGroup.key}:${siteGroup.key}`
              const open = assetId ? true : expandedSiteIds.has(k)
              return (
                <div key={siteGroup.key} className="space-y-3">
                  {!assetId && siteGroup.label && (
                    <button
                      type="button"
                      onClick={() => toggleSite(k)}
                      className="flex w-full items-center gap-2 px-1 text-left"
                    >
                      {open ? (
                        <ChevronDown size={12} className="text-muted-foreground" />
                      ) : (
                        <ChevronRight size={12} className="text-muted-foreground" />
                      )}
                      <h5 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        {siteGroup.label}
                      </h5>
                    </button>
                  )}
                  {open &&
                    siteGroup.sections.map((section) => (
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
                            {section.buckets.map((b) => (
                              <button
                                key={`${section.assetId}-${b.key}`}
                                type="button"
                                onClick={() => onCellClick?.(section, b)}
                                className={cn(
                                  'h-12 rounded flex shrink-0 flex-col items-center justify-center px-1 transition-all',
                                  'hover:ring-2 hover:ring-primary/50 hover:scale-[1.04] focus:outline-none focus:ring-2 focus:ring-primary',
                                  capacityCellWidthClass,
                                  onCellClick ? 'cursor-pointer' : 'cursor-default',
                                )}
                                style={saturationColor(b.saturation_pct)}
                                title={t('planner.capacity.heatmap_day_tooltip', {
                                  date: `${b.start_date} → ${b.end_date}`,
                                  forecast: b.forecast_pax,
                                  real: b.real_pob,
                                  capacity: b.capacity_limit,
                                  saturation: b.saturation_pct.toFixed(0),
                                })}
                                aria-label={`${section.assetName} ${b.label} — ${b.saturation_pct.toFixed(0)}%`}
                              >
                                <span className="text-[9px] font-medium leading-none">{b.label}</span>
                                <span className="text-[8px] leading-none mt-0.5">
                                  {b.forecast_pax}/{b.real_pob}
                                </span>
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    ))}
                </div>
              )
            })}
        </div>
      ))}

      <div className="text-[10px] text-muted-foreground">
        {t('planner.capacity.heatmap_cell_legend')}
      </div>
      <div className="flex items-center gap-3 mt-1 flex-wrap">
        <span className="text-[10px] text-muted-foreground">
          {t('planner.capacity.legend_label')}
        </span>
        {[
          { c: heatmapConfig.color_low, lbl: `≤${heatmapConfig.threshold_low}%` },
          {
            c: heatmapConfig.color_medium,
            lbl: `${heatmapConfig.threshold_low}-${heatmapConfig.threshold_medium}%`,
          },
          {
            c: heatmapConfig.color_high,
            lbl: `${heatmapConfig.threshold_medium}-${heatmapConfig.threshold_high}%`,
          },
          {
            c: heatmapConfig.color_critical,
            lbl: `${heatmapConfig.threshold_high}-${heatmapConfig.threshold_critical}%`,
          },
          { c: heatmapConfig.color_overflow, lbl: `>${heatmapConfig.threshold_critical}%` },
        ].map((entry, i) => (
          <div key={i} className="flex items-center gap-1">
            <div className="w-3 h-3 rounded" style={{ backgroundColor: entry.c }} />
            <span className="text-[10px] text-muted-foreground">{entry.lbl}</span>
          </div>
        ))}
      </div>
    </>
  )
}

// ── Trend (ECharts cumulative line) ───────────────────────────────

function TrendView({
  assetId,
  forecast,
  isEmpty,
}: {
  assetId: string
  forecast?: ForecastDay[]
  isEmpty: boolean
}) {
  const { t } = useTranslation()
  if (!assetId) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-10 text-muted-foreground/50 min-h-[300px]">
        <TrendingUp size={32} strokeWidth={1.5} />
        <span className="text-sm">
          {t('planner.capacity.trend_pick_asset', 'Sélectionnez un site pour voir la projection.')}
        </span>
      </div>
    )
  }
  if (isEmpty || !forecast) {
    return (
      <div className="text-center py-8 text-xs text-muted-foreground italic">
        {t('common.no_data', 'Aucune donnée')}
      </div>
    )
  }

  return (
    <div className="border border-border rounded-lg p-4 bg-card">
      <div className="text-xs font-semibold mb-3 flex items-center gap-1.5">
        <TrendingUp size={13} className="text-primary" />{' '}
        {t('planner.forecast.cumulative_title', 'Charge projetée — tendance cumulée')}
      </div>
      <ReactECharts
        style={{ height: 320, touchAction: 'pan-y' }}
        option={{
          tooltip: { trigger: 'axis', axisPointer: { type: 'line', lineStyle: { color: '#94a3b8' } } },
          legend: {
            data: [
              t('planner.forecast.projected_load', 'Charge projetée'),
              t('planner.forecast.real_pob', 'POB réel'),
              t('planner.forecast.capacity_max', 'Capacité max'),
            ],
            bottom: 0,
            textStyle: { fontSize: 11 },
            icon: 'roundRect',
            itemWidth: 14,
            itemHeight: 8,
          },
          grid: { left: 50, right: 20, top: 16, bottom: 70, containLabel: false },
          xAxis: {
            type: 'category',
            data: forecast.map((d) => d.date),
            axisLabel: {
              fontSize: 10,
              interval: Math.max(0, Math.floor(forecast.length / 8) - 1),
              formatter: (v: string) => {
                const d = new Date(v)
                return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`
              },
            },
            axisLine: { lineStyle: { color: '#cbd5e1' } },
            boundaryGap: false,
          },
          yAxis: {
            type: 'value',
            axisLabel: { fontSize: 10 },
            splitLine: { lineStyle: { opacity: 0.15 } },
            axisLine: { show: false },
            axisTick: { show: false },
          },
          series: [
            {
              name: t('planner.forecast.projected_load', 'Charge projetée'),
              type: 'line',
              data: forecast.map((d) => d.combined_load),
              smooth: true,
              lineStyle: { width: 2.5 },
              areaStyle: { opacity: 0.12 },
              itemStyle: { color: '#3b82f6' },
              showSymbol: false,
            },
            {
              name: t('planner.forecast.real_pob', 'POB réel'),
              type: 'line',
              data: forecast.map((d) => d.real_pob),
              smooth: true,
              lineStyle: { width: 1.75, type: 'dashed' },
              itemStyle: { color: '#10b981' },
              showSymbol: false,
            },
            {
              name: t('planner.forecast.capacity_max', 'Capacité max'),
              type: 'line',
              data: forecast.map((d) => d.max_capacity),
              lineStyle: { width: 1.5, type: 'dotted', color: '#ef4444' },
              itemStyle: { color: '#ef4444' },
              showSymbol: false,
            },
          ],
        }}
      />
    </div>
  )
}

// ── Calendar (month-grid heatmap) ─────────────────────────────────

function CalendarView({
  assetId,
  forecast,
  horizon,
  isEmpty,
}: {
  assetId: string
  forecast?: ForecastDay[]
  horizon: number
  isEmpty: boolean
}) {
  const { t, i18n } = useTranslation()
  if (!assetId) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-10 text-muted-foreground/50 min-h-[300px]">
        <CalendarRange size={32} strokeWidth={1.5} />
        <span className="text-sm">
          {t('planner.capacity.trend_pick_asset', 'Sélectionnez un site pour voir le calendrier.')}
        </span>
      </div>
    )
  }
  if (isEmpty || !forecast) {
    return (
      <div className="text-center py-8 text-xs text-muted-foreground italic">
        {t('common.no_data', 'Aucune donnée')}
      </div>
    )
  }

  const monthCount = Math.max(1, Math.ceil(horizon / 30))
  const monthFmt = new Intl.DateTimeFormat(i18n.language || 'fr', {
    month: 'long',
    year: 'numeric',
  })
  const dayNames = i18n.language?.startsWith('en')
    ? ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']
    : ['Lu', 'Ma', 'Me', 'Je', 'Ve', 'Sa', 'Di']

  const dayMap = new Map<string, ForecastDay>()
  forecast.forEach((d) => dayMap.set(d.date, d))

  const getSatColor = (pct: number): string => {
    if (pct <= 0) return '#f0fdf4'
    if (pct < 60) {
      const k = pct / 60
      const r = Math.round(220 + (250 - 220) * k)
      const g = Math.round(252 + (204 - 252) * k)
      const b = Math.round(231 + (21 - 231) * k)
      return `rgb(${r},${g},${b})`
    }
    const k = (pct - 60) / 40
    const r = Math.round(250 + (239 - 250) * k)
    const g = Math.round(204 + (68 - 204) * k)
    const b = Math.round(21 + (68 - 21) * k)
    return `rgb(${r},${g},${b})`
  }

  const startDate = new Date(forecast[0]?.date || new Date())

  return (
    <div className="border border-border rounded-lg p-4 bg-card">
      <div className="text-xs font-semibold mb-3 flex items-center gap-1.5">
        <CalendarRange size={13} className="text-primary" />{' '}
        {t('planner.capacity.calendar_title', 'Calendrier de saturation')}
      </div>
      <div className="space-y-5">
        {Array.from({ length: monthCount }, (_, mi) => {
          const firstDay = new Date(startDate.getFullYear(), startDate.getMonth() + mi, 1)
          const daysInMonth = new Date(firstDay.getFullYear(), firstDay.getMonth() + 1, 0).getDate()
          const rawDow = firstDay.getDay()
          const startOffset = rawDow === 0 ? 6 : rawDow - 1
          const cells: Array<{ date: string | null; day: number | null }> = []
          for (let i = 0; i < startOffset; i++) cells.push({ date: null, day: null })
          for (let d = 1; d <= daysInMonth; d++) {
            const dateStr = `${firstDay.getFullYear()}-${String(firstDay.getMonth() + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
            cells.push({ date: dateStr, day: d })
          }
          return (
            <div key={mi}>
              <div className="text-[11px] font-semibold text-foreground mb-1.5 tracking-wide uppercase">
                {monthFmt.format(firstDay)}
              </div>
              <div className="grid grid-cols-7 gap-0.5">
                {dayNames.map((dn) => (
                  <div
                    key={dn}
                    className="text-center text-[9px] text-muted-foreground font-medium py-0.5 select-none"
                  >
                    {dn}
                  </div>
                ))}
                {cells.map((cell, ci) => {
                  if (!cell.date || !cell.day) {
                    return <div key={ci} className="h-7 rounded" />
                  }
                  const fd = dayMap.get(cell.date)
                  const pct =
                    fd && fd.max_capacity > 0
                      ? Math.round((fd.combined_load / fd.max_capacity) * 100)
                      : 0
                  const bg = getSatColor(pct)
                  const textColor = pct > 65 ? '#ffffff' : '#334155'
                  const title = fd
                    ? `${cell.date}\n${t('planner.forecast.projected_load', 'Charge')}: ${fd.combined_load} / ${fd.max_capacity}\nSaturation: ${pct}%\n${t('planner.forecast.real_pob', 'POB réel')}: ${fd.real_pob}`
                    : cell.date
                  return (
                    <div
                      key={ci}
                      title={title}
                      className="h-7 flex items-center justify-center text-[10px] font-medium rounded cursor-default select-none transition-opacity hover:opacity-80"
                      style={{ backgroundColor: bg, color: textColor }}
                    >
                      {cell.day}
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
        <div className="flex items-center gap-2 pt-1">
          <span className="text-[10px] text-muted-foreground shrink-0">0%</span>
          <div className="flex flex-1 max-w-[200px] h-3 rounded overflow-hidden gap-px">
            {[0, 10, 20, 35, 50, 65, 80, 100].map((p) => (
              <div key={p} className="flex-1" style={{ backgroundColor: getSatColor(p) }} />
            ))}
          </div>
          <span className="text-[10px] text-muted-foreground shrink-0">100%</span>
          <span className="text-[10px] text-muted-foreground ml-2 shrink-0">
            — {t('planner.capacity.saturation', 'Saturation')}
          </span>
        </div>
      </div>
    </div>
  )
}

// ── Capacity history table ────────────────────────────────────────

function CapacityHistoryTable({ items }: { items: AssetCapacity[] }) {
  const { t } = useTranslation()
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[640px]">
        <div className="grid grid-cols-5 gap-2 px-3 py-2 bg-muted/20 text-[10px] font-medium uppercase tracking-wide text-muted-foreground border-b border-border">
          <span>{t('planner.capacity.history.effective_date', 'Date effective')}</span>
          <span className="text-right">{t('planner.capacity.history.max_pax', 'Max PAX')}</span>
          <span className="text-right">{t('planner.capacity.history.permanent_quota', 'Quota ops perm.')}</span>
          <span>{t('planner.capacity.history.reason', 'Motif')}</span>
          <span>{t('planner.capacity.history.changed_by', 'Modifié par')}</span>
        </div>
        {items.map((cap) => (
          <div
            key={cap.id}
            className="grid grid-cols-5 gap-2 px-3 py-2 border-b border-border/50 last:border-0"
          >
            <span className="text-xs text-foreground tabular-nums">
              {formatDateShort(cap.effective_date)}
            </span>
            <span className="text-xs text-foreground tabular-nums text-right">
              {cap.max_pax_total}
            </span>
            <span className="text-xs text-foreground tabular-nums text-right">
              {cap.permanent_ops_quota}
            </span>
            <span className="text-xs text-muted-foreground truncate">{cap.reason}</span>
            <span className="text-xs text-muted-foreground truncate">{cap.changed_by}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
