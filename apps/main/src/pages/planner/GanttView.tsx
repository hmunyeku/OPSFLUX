/**
 * GanttView — Unified Planner timeline.
 *
 * Single shared timeline for both the capacity heatmap and the activity Gantt:
 *   Field (level 0)        → heatmap row, max-aggregated saturation
 *     Site (level 1)       → heatmap row, max-aggregated saturation
 *       Installation (2)   → heatmap row, real per-day saturation
 *         Activity (3)     → bar(s) on the timeline, no heatmap
 *
 * Tree expand/collapse, scroll, zoom and timeline header are all handled by
 * GanttCore. Heatmap cells are injected via GanttRow.heatmapCells (a feature
 * added to GanttCore for this view), so alignment with the bars is exact and
 * scroll is shared by construction.
 *
 * The shape of the tree is fully driven by `viewPrefs` from the customization
 * modal: hierarchy levels can be hidden, scope can be narrowed to a single
 * field/site/installation, totals can be added, etc.
 */
import { useMemo, useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { useUIStore } from '@/stores/uiStore'
import {
  useGanttData,
  useRevisionDecisionRequests,
  useCapacityHeatmap,
} from '@/hooks/usePlanner'
import { useAssetHierarchy } from '@/hooks/useAssetRegistry'
import { plannerService } from '@/services/plannerService'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { GanttCore } from '@/components/shared/gantt/GanttCore'
import {
  buildCells,
  getDefaultDateRange,
  toISO,
  type TimeScale,
} from '@/components/shared/gantt/ganttEngine'
import type {
  GanttRow,
  GanttBarData,
  GanttColumn,
  GanttHeatmapCell,
  GanttDependencyData,
} from '@/components/shared/gantt/ganttTypes'
import type { GanttActivity, CapacityHeatmapDay, CapacityHeatmapConfig } from '@/types/api'
import type { HierarchyFieldNode } from '@/types/assetRegistry'
import { cn } from '@/lib/utils'
import {
  PlannerCustomizationSections,
  DEFAULT_PLANNER_GANTT_VIEW,
  type PlannerGanttViewPrefs,
} from './PlannerCustomizationModal'

// ── Type colors for Planner activity types ──────────────────────

const TYPE_COLORS: Record<string, string> = {
  project: '#3b82f6', workover: '#f59e0b', drilling: '#ef4444',
  integrity: '#8b5cf6', maintenance: '#06b6d4', permanent_ops: '#6b7280',
  inspection: '#22c55e', event: '#ec4899',
}

const TYPE_LABELS_FR: Record<string, string> = {
  project: 'Projet', workover: 'Workover', drilling: 'Forage',
  integrity: 'Intégrité', maintenance: 'Maintenance', permanent_ops: 'Ops perm.',
  inspection: 'Inspection', event: 'Événement',
}

// Default heatmap thresholds + colors — MUST stay in sync with the backend's
// CapacityHeatmapConfig default (app/services/modules/planner_service.py) so
// the legend matches the cell colors even before heatmapData.config arrives.
const DEFAULT_HEATMAP_CONFIG: CapacityHeatmapConfig = {
  threshold_low: 40,
  threshold_medium: 70,
  threshold_high: 90,
  threshold_critical: 100,
  color_low: '#86efac',       // emerald-300 — <40%  (faible)
  color_medium: '#4ade80',     // emerald-400 — 40-70%
  color_high: '#fbbf24',       // amber-400   — 70-90%
  color_critical: '#ef4444',   // red-500     — 90-100%
  color_overflow: '#991b1b',   // red-900     — ≥100% (saturé, rouge foncé)
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  try { return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }) } catch { return '—' }
}

function fmtPax(act: { pax_quota?: number; pax_quota_mode?: 'constant' | 'variable'; pax_quota_daily?: Record<string, number> | null }): string {
  const mode = act.pax_quota_mode ?? 'constant'
  if (mode === 'variable' && act.pax_quota_daily && Object.keys(act.pax_quota_daily).length > 0) {
    const values = Object.values(act.pax_quota_daily).filter((v) => typeof v === 'number') as number[]
    if (values.length > 0) {
      const min = Math.min(...values)
      const max = Math.max(...values)
      return min === max ? `${min}` : `${min}–${max}`
    }
  }
  return String(act.pax_quota ?? 0)
}

function colorForSaturation(pct: number, cfg: CapacityHeatmapConfig): string {
  if (pct >= cfg.threshold_critical) return cfg.color_overflow
  if (pct >= cfg.threshold_high) return cfg.color_critical
  if (pct >= cfg.threshold_medium) return cfg.color_high
  if (pct >= cfg.threshold_low) return cfg.color_medium
  return cfg.color_low
}

/**
 * Derive a 0-100 progression for an activity based on status + elapsed time.
 *  - completed → 100
 *  - cancelled / rejected → 0
 *  - draft / submitted (not yet validated) → 0
 *  - validated / in_progress → time-based: clamp((today - start) / (end - start) * 100, 0..100)
 * Returns 0 when dates are missing.
 */
function computeActivityProgress(act: GanttActivity): number {
  if (!act.start_date || !act.end_date) return 0
  if (act.status === 'completed') return 100
  if (act.status === 'cancelled' || act.status === 'rejected') return 0
  if (act.status === 'draft' || act.status === 'submitted') return 0
  const start = new Date(act.start_date).getTime()
  const end = new Date(act.end_date).getTime()
  if (end <= start) return 0
  const now = Date.now()
  if (now <= start) return 0
  if (now >= end) return 100
  return Math.round(((now - start) / (end - start)) * 100)
}

/**
 * Build a YYYY-MM-DD key from a Date in UTC. The pax_quota_daily JSONB
 * is stored with UTC ISO keys (the create form uses toISOString().slice(0,10))
 * so we must look up with the same key shape regardless of the user's TZ.
 */
function utcDateKey(ts: number): string {
  const d = new Date(ts)
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Parse a YYYY-MM-DD ISO string as UTC midnight ms (no TZ offset drift). */
function parseISODateUTC(iso: string): number {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return Date.UTC(y, (m ?? 1) - 1, d ?? 1)
}

const MS_PER_DAY = 86400000

/**
 * Compute one PAX label per timeline cell that the activity overlaps.
 * - Constant POB → the activity's pax_quota for every cell
 * - Variable POB schedule → daily values (in day mode) or per-day average
 *   in week/month/quarter/semester modes. Days with no entry fall back to
 *   pax_quota.
 * All date arithmetic is done in UTC so a non-UTC user TZ never shifts the
 * lookup key by ±1 day.
 */
function buildBarCellLabels(
  act: GanttActivity,
  cells: ReturnType<typeof buildCells>,
): Array<{ cellIdx: number; label: string }> {
  if (!act.start_date || !act.end_date) return []
  const actStartUTC = parseISODateUTC(act.start_date)
  const actEndUTC = parseISODateUTC(act.end_date) + MS_PER_DAY - 1
  const constantQuota = act.pax_quota ?? 0
  const isVariable = act.pax_quota_mode === 'variable'
  const dailyMap = act.pax_quota_daily || {}
  const result: Array<{ cellIdx: number; label: string }> = []

  cells.forEach((cell, idx) => {
    // Re-anchor cell range to UTC midnight using its calendar date
    const cellStartUTC = Date.UTC(
      cell.startDate.getFullYear(),
      cell.startDate.getMonth(),
      cell.startDate.getDate(),
    )
    const cellEndUTC = Date.UTC(
      cell.endDate.getFullYear(),
      cell.endDate.getMonth(),
      cell.endDate.getDate(),
    ) + MS_PER_DAY - 1

    if (cellEndUTC < actStartUTC || cellStartUTC > actEndUTC) return

    const fromTs = Math.max(cellStartUTC, actStartUTC)
    const toTs = Math.min(cellEndUTC, actEndUTC)
    let sum = 0
    let count = 0
    let curUTC = Math.floor(fromTs / MS_PER_DAY) * MS_PER_DAY
    while (curUTC <= toTs) {
      const iso = utcDateKey(curUTC)
      const v = isVariable
        ? (typeof dailyMap[iso] === 'number' ? dailyMap[iso] : constantQuota)
        : constantQuota
      sum += v
      count++
      curUTC += MS_PER_DAY
      if (count > 10000) break
    }
    if (count === 0) return
    const avg = sum / count
    // count===1 → exact day value. >1 → mean across bucket (decimal allowed).
    let label: string
    if (count === 1 || Number.isInteger(avg)) {
      label = String(avg)
    } else {
      label = avg.toFixed(1)
    }
    result.push({ cellIdx: idx, label })
  })

  return result
}

/**
 * Aggregate activity PAX + saturation for a set of installation IDs over a
 * cell range. Walks each day × each installation × each overlapping activity
 * and computes:
 *   - totalPax       : sum of all per-day PAX values across all assets/days
 *   - peakPax        : max per-(asset,day) PAX value
 *   - peakDaySat     : max per-(asset,day) saturation = dailyPax / dailyCap * 100
 *                      This is the worst single-day-single-asset saturation in
 *                      the cell range, which is the right value to use for the
 *                      row background color. Averaging dilutes bursts away.
 *   - daysCovered    : number of (asset,day) tuples that had activity coverage
 *
 * `capacityByAssetDay` is the per-day capacity_limit returned by the backend
 * heatmap endpoint: Map<assetId, Map<dayTs, capacityLimit>>.
 */
function sumActivityPaxForCell(
  contributingAssetIds: string[],
  cellStartUTC: number,
  cellEndUTC: number,
  activitiesByAsset: Map<string, GanttActivity[]>,
  capacityByAssetDay: Map<string, Map<number, number>>,
): { totalPax: number; peakPax: number; peakDaySat: number; daysCovered: number } {
  let totalPax = 0
  let peakPax = 0
  let peakDaySat = 0
  let daysCovered = 0

  // First: build a per-(asset,day) PAX map so we can correctly sum multiple
  // activities on the same day AND divide by the capacity for that day.
  const paxByAssetDay = new Map<string, Map<number, number>>()

  for (const aid of contributingAssetIds) {
    const acts = activitiesByAsset.get(aid)
    if (!acts) continue
    for (const act of acts) {
      if (!act.start_date || !act.end_date) continue
      const aStart = parseISODateUTC(act.start_date)
      const aEnd = parseISODateUTC(act.end_date) + MS_PER_DAY - 1
      const overlapFrom = Math.max(aStart, cellStartUTC)
      const overlapTo = Math.min(aEnd, cellEndUTC)
      if (overlapTo < overlapFrom) continue

      const constantQuota = act.pax_quota ?? 0
      const isVariable = act.pax_quota_mode === 'variable'
      const dailyMap = act.pax_quota_daily || {}

      let cur = Math.floor(overlapFrom / MS_PER_DAY) * MS_PER_DAY
      let safety = 0
      while (cur <= overlapTo) {
        const iso = utcDateKey(cur)
        const v = isVariable
          ? (typeof dailyMap[iso] === 'number' ? dailyMap[iso] : constantQuota)
          : constantQuota
        // Accumulate PAX per (asset, day)
        let assetDays = paxByAssetDay.get(aid)
        if (!assetDays) {
          assetDays = new Map()
          paxByAssetDay.set(aid, assetDays)
        }
        assetDays.set(cur, (assetDays.get(cur) ?? 0) + v)
        totalPax += v
        daysCovered++
        cur += MS_PER_DAY
        if (++safety > 10000) break
      }
    }
  }

  // Second: compute per-(asset,day) saturation and find the peak
  for (const [aid, days] of paxByAssetDay) {
    const capDays = capacityByAssetDay.get(aid)
    for (const [dayTs, dayPax] of days) {
      if (dayPax > peakPax) peakPax = dayPax
      const dayCap = capDays?.get(dayTs) ?? 0
      if (dayCap > 0) {
        const sat = (dayPax / dayCap) * 100
        if (sat > peakDaySat) peakDaySat = sat
      } else if (dayPax > 0) {
        // Capacity not configured but PAX exist → treat as overflow
        peakDaySat = Math.max(peakDaySat, 101)
      }
    }
  }

  return { totalPax, peakPax, peakDaySat, daysCovered }
}

// ── Component ───────────────────────────────────────────────────

interface GanttViewProps {
  typeFilter?: string
  statusFilter?: string
  scale?: TimeScale
  startDate?: string
  endDate?: string
  onViewChange?: (scale: TimeScale, start: string, end: string) => void
  /** User customization preferences (level toggles, scope filters, total rows, ...) */
  viewPrefs?: PlannerGanttViewPrefs
  /** Update preferences (passed up to parent which persists via useUserPreferences) */
  onViewPrefsChange?: (prefs: PlannerGanttViewPrefs) => void
  /** Persisted GanttCore settings (column widths, visible columns, filters, ...) */
  ganttSettings?: Partial<import('@/components/shared/gantt/ganttTypes').GanttSettings>
  /** Called when GanttCore mutates its internal settings — parent persists them */
  onGanttSettingsChange?: (settings: import('@/components/shared/gantt/ganttTypes').GanttSettings) => void
}

export function GanttView({
  typeFilter,
  statusFilter,
  scale: externalScale,
  startDate: externalStartDate,
  endDate: externalEndDate,
  onViewChange,
  viewPrefs = DEFAULT_PLANNER_GANTT_VIEW,
  onViewPrefsChange,
  ganttSettings,
  onGanttSettingsChange,
}: GanttViewProps = {}) {
  const { t } = useTranslation()
  const { toast } = useToast()
  const confirm = useConfirm()
  const qc = useQueryClient()
  const openDynamicPanel = useUIStore((s) => s.openDynamicPanel)

  const statusLabels = useMemo<Record<string, string>>(() => ({
    draft: t('planner.gantt.status.draft'),
    submitted: t('planner.gantt.status.submitted'),
    validated: t('planner.gantt.status.validated'),
    in_progress: t('planner.gantt.status.in_progress'),
    completed: t('planner.gantt.status.completed'),
    rejected: t('planner.gantt.status.rejected'),
    cancelled: t('planner.gantt.status.cancelled'),
  }), [t])

  const plannerColumns = useMemo<GanttColumn[]>(() => ([
    { id: 'pax', label: 'PAX', width: 56, align: 'right' },
    { id: 'start', label: t('planner.gantt.columns.start'), width: 80, align: 'center', editable: true, editType: 'date' },
    { id: 'end', label: t('planner.gantt.columns.end'), width: 80, align: 'center', editable: true, editType: 'date' },
  ]), [t])

  const handleViewChange = useCallback((nextScale: string, start: string, end: string) => {
    if (nextScale === 'day' || nextScale === 'week' || nextScale === 'month' || nextScale === 'quarter' || nextScale === 'semester') {
      onViewChange?.(nextScale, start, end)
    }
  }, [onViewChange])

  // ── Date range — read directly from props (PlannerPage owns the source of truth)
  const scale: TimeScale = externalScale ?? 'month'
  const now = new Date()
  const defaultRange = useMemo(() => getDefaultDateRange(scale), [scale])
  const startDate = externalStartDate ?? defaultRange.start ?? toISO(new Date(now.getFullYear(), now.getMonth() - 1, 1))
  const endDate = externalEndDate ?? defaultRange.end ?? toISO(new Date(now.getFullYear(), now.getMonth() + 4, 0))

  // ── Fetch data ──
  const { data: ganttData, isLoading: isLoadingGantt } = useGanttData(startDate, endDate, {
    types: typeFilter,
    statuses: statusFilter,
    show_permanent_ops: true,
  })
  const { data: heatmapData } = useCapacityHeatmap(startDate, endDate)
  const { data: hierarchyData = [] } = useAssetHierarchy()
  const { data: pendingRevisionRequests } = useRevisionDecisionRequests({
    status: 'pending',
    page: 1,
    page_size: 200,
  })

  // ── Expand/collapse: collapsed-only set so async hierarchy works ──
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set())
  const toggleRow = useCallback((id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }, [])
  const expandedRows = useMemo(() => {
    const exp = new Set<string>()
    exp.add('total-peak')
    exp.add('total-sum')
    for (const f of hierarchyData as HierarchyFieldNode[]) {
      if (!collapsed.has(`f:${f.id}`)) exp.add(`f:${f.id}`)
      for (const s of f.sites) {
        if (!collapsed.has(`s:${s.id}`)) exp.add(`s:${s.id}`)
        for (const i of s.installations) {
          if (!collapsed.has(`i:${i.id}`)) exp.add(`i:${i.id}`)
        }
      }
    }
    return exp
  }, [hierarchyData, collapsed])

  // ── Build the unified tree (rows + bars) ──
  const { rows, bars, deps } = useMemo(() => {
    const cells = buildCells(scale, new Date(startDate), new Date(endDate))
    const cfg = heatmapData?.config ?? DEFAULT_HEATMAP_CONFIG

    // Index activities by asset_id
    const activitiesByAsset = new Map<string, GanttActivity[]>()
    for (const asset of ganttData?.assets ?? []) {
      if (asset.id) activitiesByAsset.set(asset.id, asset.activities)
    }

    // Index heatmap days
    const daysByAsset = new Map<string, Map<number, CapacityHeatmapDay>>()
    for (const d of heatmapData?.days ?? []) {
      let inner = daysByAsset.get(d.asset_id)
      if (!inner) { inner = new Map(); daysByAsset.set(d.asset_id, inner) }
      inner.set(new Date(d.date).getTime(), d)
    }

    // Pending revision requests
    const pendingRequests = pendingRevisionRequests?.items ?? []
    const requestsByActivity = new Map<string, typeof pendingRequests>()
    for (const request of pendingRequests) {
      for (const activityId of request.planner_activity_ids ?? []) {
        const existing = requestsByActivity.get(activityId) ?? []
        existing.push(request)
        requestsByActivity.set(activityId, existing)
      }
    }

    /**
     * Aggregate heatmap cells for a set of contributing installation asset IDs.
     * - PAX values are computed from the FRONTEND ganttData (sum of activity
     *   pax for the cell range) so they always reflect the latest local edits
     *   AND include draft/submitted activities, unlike the backend heatmap
     *   endpoint which only counts validated activities.
     * - Capacity comes from heatmapData.days when available (set per-installation
     *   in admin settings) and is used to compute the saturation %.
     * - Mode 'peak' uses MAX per-day pax → saturation based on peak / capacity.
     * - Mode 'sum'  uses SUM of all daily pax over the cell → density indicator.
     */
    // Index capacity_limit per (assetId, dayTs) for fast lookup in sumActivity
    const capacityByAssetDay = new Map<string, Map<number, number>>()
    for (const [assetId, inner] of daysByAsset) {
      const per: Map<number, number> = new Map()
      for (const [ts, day] of inner) {
        // Normalize to UTC midnight of the day
        const dayMidnight = Math.floor(ts / MS_PER_DAY) * MS_PER_DAY
        per.set(dayMidnight, day.capacity_limit)
      }
      capacityByAssetDay.set(assetId, per)
    }

    function buildHeatmapCells(
      contributingAssetIds: string[],
      aggregation: 'peak' | 'sum' = 'peak',
    ): GanttHeatmapCell[] {
      const result: GanttHeatmapCell[] = []

      cells.forEach((cell, idx) => {
        const cellStartUTC = Date.UTC(
          cell.startDate.getFullYear(),
          cell.startDate.getMonth(),
          cell.startDate.getDate(),
        )
        const cellEndUTC = Date.UTC(
          cell.endDate.getFullYear(),
          cell.endDate.getMonth(),
          cell.endDate.getDate(),
        ) + MS_PER_DAY - 1

        // ── Frontend computation: sum + peak per-day saturation ──
        const { totalPax, peakPax, peakDaySat, daysCovered } = sumActivityPaxForCell(
          contributingAssetIds,
          cellStartUTC,
          cellEndUTC,
          activitiesByAsset,
          capacityByAssetDay,
        )

        // ── Capacity totals across the cell for the tooltip + sum display ──
        let totalCap = 0
        let totalReal = 0
        let backendDayCount = 0
        for (const aid of contributingAssetIds) {
          const inner = daysByAsset.get(aid)
          if (!inner) continue
          for (const [ts, day] of inner) {
            if (ts >= cellStartUTC && ts <= cellEndUTC) {
              totalCap += day.capacity_limit
              totalReal += day.real_pob
              backendDayCount++
            }
          }
        }

        // No data at all (no activities AND no capacity) → skip the cell
        if (daysCovered === 0 && backendDayCount === 0) return

        // The COLOR always reflects the worst per-day-per-asset saturation
        // in the cell (peakDaySat). This prevents dilution when aggregating
        // across many days or many assets with uneven workload distribution.
        const satForColor = Math.round(peakDaySat)
        const color = colorForSaturation(satForColor, cfg)

        let value: number
        let label: string
        let tooltipHTML: string

        if (aggregation === 'sum') {
          value = totalPax
          if (viewPrefs.heatmap_text_mode === 'pax_count') label = `${totalPax}`
          else if (viewPrefs.heatmap_text_mode === 'percentage') label = `${satForColor}%`
          else label = ''
          tooltipHTML = `Σ prév. ${totalPax} · cap ${totalCap} · pic ${satForColor}%`
        } else {
          value = peakPax
          if (viewPrefs.heatmap_text_mode === 'percentage') label = `${satForColor}%`
          else if (viewPrefs.heatmap_text_mode === 'pax_count') label = `${peakPax}`
          else label = ''
          tooltipHTML = `Pic ${peakPax} PAX (${satForColor}%) · prév. tot. ${totalPax} · pob réel ${totalReal} · cap ${totalCap}`
        }

        result.push({ cellIdx: idx, color, value, label, tooltipHTML })
      })

      return result
    }

    // ── Apply scope filters: filter the hierarchy down ──
    function passesScope(fieldId: string, siteId?: string, installationId?: string) {
      if (viewPrefs.field_filter && fieldId !== viewPrefs.field_filter) return false
      if (viewPrefs.site_filter && siteId && siteId !== viewPrefs.site_filter) return false
      if (viewPrefs.installation_filter && installationId && installationId !== viewPrefs.installation_filter) return false
      return true
    }

    const rowList: GanttRow[] = []
    const barList: GanttBarData[] = []
    const heatmapRowH = viewPrefs.heatmap_row_height

    // Pre-compute which fields/sites/installations actually contain activities
    // (so we can hide empty branches when hide_empty_rows is on).
    // IMPORTANT: the activity-type filter (legend chip toggle) must also
    // propagate to the hierarchy visibility, otherwise a field/site/install
    // whose only activities were filtered out still renders with an empty
    // bar area. We compute a filtered view here and use it everywhere the
    // "is there any activity" check is done, so typing affects parents too.
    const activityTypeFilter = viewPrefs.activity_type_filter ?? []
    const hasTypeFilter = activityTypeFilter.length > 0
    const activityValidityFilter = viewPrefs.activity_validity_filter ?? []
    const hasValidityFilter = activityValidityFilter.length > 0

    const VALIDATED_STATUSES = new Set(['validated', 'in_progress', 'completed'])
    const DRAFT_STATUSES = new Set(['draft', 'submitted', 'rejected', 'cancelled'])
    const passesValidityFilter = (a: GanttActivity): boolean => {
      if (!hasValidityFilter) return true
      const isValidated = VALIDATED_STATUSES.has((a.status ?? '').toLowerCase())
      const isDraft = DRAFT_STATUSES.has((a.status ?? '').toLowerCase())
      if (activityValidityFilter.includes('validated') && isValidated) return true
      if (activityValidityFilter.includes('draft') && isDraft) return true
      return false
    }
    const passesActivityFilters = (a: GanttActivity): boolean => {
      if (hasTypeFilter && !activityTypeFilter.includes(a.type)) return false
      if (!passesValidityFilter(a)) return false
      return true
    }
    const countAfterFilters = (instId: string): number => {
      const acts = activitiesByAsset.get(instId) ?? []
      if (!hasTypeFilter && !hasValidityFilter) return acts.length
      return acts.reduce((n, a) => n + (passesActivityFilters(a) ? 1 : 0), 0)
    }
    const installationHasActivity = (instId: string) => countAfterFilters(instId) > 0
    const siteHasActivity = (site: HierarchyFieldNode['sites'][number]) =>
      site.installations.some((i) => installationHasActivity(i.id))
    const fieldHasActivity = (field: HierarchyFieldNode) =>
      field.sites.some((s) => siteHasActivity(s))

    // When a type or validity filter is active, auto-hide empty branches
    // even if the user hasn't ticked "hide empty rows" — otherwise the
    // filter feels broken (parents with zero matching activities remain).
    const autoHideEmpty = viewPrefs.hide_empty_rows || hasTypeFilter || hasValidityFilter

    // Collect all installation IDs in scope (used for total rows)
    const allInstIdsInScope: string[] = []
    for (const field of hierarchyData as HierarchyFieldNode[]) {
      if (!passesScope(field.id)) continue
      for (const site of field.sites) {
        if (!passesScope(field.id, site.id)) continue
        for (const inst of site.installations) {
          if (!passesScope(field.id, site.id, inst.id)) continue
          allInstIdsInScope.push(inst.id)
        }
      }
    }

    // ── TOTAL rows (top of the table) ──
    if (viewPrefs.show_total_peak) {
      rowList.push({
        id: 'total-peak',
        label: 'Total — pic',
        sublabel: 'Saturation max',
        level: 0,
        hasChildren: false,
        rowHeight: heatmapRowH,
        heatmapCells: buildHeatmapCells(allInstIdsInScope, 'peak'),
      })
    }
    if (viewPrefs.show_total_sum) {
      rowList.push({
        id: 'total-sum',
        label: 'Total — somme',
        sublabel: 'PAX prévus globaux',
        level: 0,
        hasChildren: false,
        rowHeight: heatmapRowH,
        heatmapCells: buildHeatmapCells(allInstIdsInScope, 'sum'),
      })
    }

    // ── Walk the asset hierarchy with level filters ──
    for (const field of hierarchyData as HierarchyFieldNode[]) {
      if (!passesScope(field.id)) continue
      const fieldAssetIds: string[] = []
      for (const s of field.sites) for (const i of s.installations) fieldAssetIds.push(i.id)
      if (fieldAssetIds.length === 0) continue
      if (autoHideEmpty && !fieldHasActivity(field)) continue

      const fieldId = `f:${field.id}`

      if (viewPrefs.show_field_rows) {
        rowList.push({
          id: fieldId,
          label: field.name,
          sublabel: `${field.sites.length} site${field.sites.length > 1 ? 's' : ''}`,
          level: 0,
          hasChildren: viewPrefs.show_site_rows || viewPrefs.show_installation_rows || viewPrefs.show_activity_rows,
          rowHeight: heatmapRowH,
          heatmapCells: buildHeatmapCells(fieldAssetIds, viewPrefs.parent_rows_aggregation),
        })
        if (!expandedRows.has(fieldId)) continue
      }

      for (const site of field.sites) {
        if (!passesScope(field.id, site.id)) continue
        const siteAssetIds = site.installations.map((i) => i.id)
        if (siteAssetIds.length === 0) continue
        if (autoHideEmpty && !siteHasActivity(site)) continue

        const siteId = `s:${site.id}`

        if (viewPrefs.show_site_rows) {
          rowList.push({
            id: siteId,
            label: site.name,
            sublabel: `${site.installations.length} install.`,
            level: viewPrefs.show_field_rows ? 1 : 0,
            hasChildren: viewPrefs.show_installation_rows || viewPrefs.show_activity_rows,
            rowHeight: heatmapRowH,
            heatmapCells: buildHeatmapCells(siteAssetIds, viewPrefs.parent_rows_aggregation),
          })
          if (!expandedRows.has(siteId)) continue
        }

        for (const inst of site.installations) {
          if (!passesScope(field.id, site.id, inst.id)) continue
          const installId = `i:${inst.id}`
          const activities = activitiesByAsset.get(inst.id) ?? []
          // Apply both type + validity filters to the count check —
          // otherwise an installation whose only activities were filtered
          // out would still appear with an empty activity area.
          const matchingCount = (hasTypeFilter || hasValidityFilter)
            ? activities.filter(passesActivityFilters).length
            : activities.length
          if (autoHideEmpty && matchingCount === 0) continue

          if (viewPrefs.show_installation_rows) {
            // Compute the row level based on which parent levels are visible
            let lvl: 0 | 1 | 2 = 2
            if (!viewPrefs.show_field_rows && !viewPrefs.show_site_rows) lvl = 0
            else if (!viewPrefs.show_field_rows || !viewPrefs.show_site_rows) lvl = 1
            rowList.push({
              id: installId,
              label: inst.name,
              sublabel: matchingCount > 0
                ? `${matchingCount} activité${matchingCount > 1 ? 's' : ''}`
                : '—',
              level: lvl,
              hasChildren: matchingCount > 0 && viewPrefs.show_activity_rows,
              rowHeight: heatmapRowH,
              heatmapCells: buildHeatmapCells([inst.id], viewPrefs.parent_rows_aggregation),
            })
            if (!expandedRows.has(installId)) continue
          }

          // Activity rows
          if (viewPrefs.show_activity_rows) {
            // Activity row level = installation row level + 1 if installation visible,
            // otherwise depth based on visible ancestors
            let actLevel: 0 | 1 | 2 | 3 = 3
            if (viewPrefs.show_installation_rows) actLevel = 3
            else if (viewPrefs.show_site_rows) actLevel = 2
            else if (viewPrefs.show_field_rows) actLevel = 1
            else actLevel = 0

            // Clamp to GanttCore-supported max
            if (actLevel > 3) actLevel = 3 as const

            // Apply activity type + validity filters (legend chip toggles)
            const filteredActivities = (hasTypeFilter || hasValidityFilter)
              ? activities.filter(passesActivityFilters)
              : activities

            for (const act of filteredActivities) {
              const actRowId = `a:${act.id}`
              const paxLabel = fmtPax(act)
              const isVariable = act.pax_quota_mode === 'variable'

              rowList.push({
                id: actRowId,
                label: act.title,
                sublabel: statusLabels[act.status] || act.status,
                level: actLevel,
                hasChildren: false,
                columns: {
                  pax: isVariable ? `${paxLabel}*` : paxLabel,
                  start: fmtDate(act.start_date),
                  end: fmtDate(act.end_date),
                },
                color: TYPE_COLORS[act.type] || '#3b82f6',
              })

              if (act.start_date && act.end_date) {
                // PAX-per-cell labels rendered INSIDE the bar.
                const cellLabels = buildBarCellLabels(act, cells)
                // Title rendered OUTSIDE the bar (none / before / after).
                const externalTitle = viewPrefs.bar_title_position === 'none'
                  ? undefined
                  : `${act.title}${isVariable ? ' *' : ''}`
                const externalTitlePosition = viewPrefs.bar_title_position === 'none'
                  ? undefined
                  : viewPrefs.bar_title_position
                barList.push({
                  id: act.id,
                  rowId: actRowId,
                  // Keep the real activity name on the bar so the dependency
                  // arrow tooltip (which looks up bar.title via barTitlesMap)
                  // can display a human name. The in-bar rendering ignores
                  // this field when cellLabels are present, so setting it
                  // has no visual side-effect on the bar itself.
                  title: act.title,
                  startDate: act.start_date.slice(0, 10),
                  endDate: act.end_date.slice(0, 10),
                  status: act.status,
                  type: act.type,
                  priority: act.priority,
                  color: TYPE_COLORS[act.type] || '#3b82f6',
                  isDraft: act.status === 'draft' || act.status === 'submitted',
                  isCritical: act.priority === 'critical',
                  progress: typeof act.progress === 'number' ? act.progress : computeActivityProgress(act),
                  // Enable drag-to-reschedule and edge resize on activity bars.
                  // The GanttBar component short-circuits drag/resize when these
                  // flags are false, which is why the previous version couldn't
                  // be moved or resized at all.
                  draggable: true,
                  resizable: true,
                  cellLabels,
                  externalTitle,
                  externalTitlePosition,
                  tooltipLines: [
                    [t('planner.gantt.tooltip.type'), TYPE_LABELS_FR[act.type] || act.type],
                    [t('planner.gantt.tooltip.status'), statusLabels[act.status] || act.status],
                    [t('planner.gantt.tooltip.pax'), isVariable ? `${paxLabel} (variable)` : paxLabel],
                    [t('planner.gantt.tooltip.priority'), act.priority || '—'],
                    ...(act.well_reference ? [[t('planner.gantt.tooltip.well'), act.well_reference] as [string, string]] : []),
                    ...(act.work_order_ref ? [[t('planner.gantt.tooltip.work_order'), act.work_order_ref] as [string, string]] : []),
                  ],
                })

                // Pending revision proposal (ghost bar)
                const relatedRequests = requestsByActivity.get(act.id) ?? []
                for (const request of relatedRequests) {
                  const proposedStart = request.proposed_start_date?.slice(0, 10) ?? act.start_date.slice(0, 10)
                  const proposedEnd = request.proposed_end_date?.slice(0, 10) ?? act.end_date.slice(0, 10)
                  const hasDateShift =
                    proposedStart !== act.start_date.slice(0, 10) ||
                    proposedEnd !== act.end_date.slice(0, 10)
                  const hasOtherShift =
                    request.proposed_pax_quota != null ||
                    request.proposed_status != null
                  if (!hasDateShift && !hasOtherShift) continue

                  barList.push({
                    id: `proposal-${request.id}-${act.id}`,
                    rowId: actRowId,
                    title: t('planner.gantt.proposal_title', { title: act.title }),
                    startDate: proposedStart,
                    endDate: proposedEnd,
                    status: request.proposed_status ?? act.status,
                    type: act.type,
                    priority: act.priority,
                    color: TYPE_COLORS[act.type] || '#3b82f6',
                    isDraft: true,
                    tooltipLines: [
                      [t('planner.gantt.tooltip.revision'), t('planner.gantt.tooltip.pending_proposal')],
                      [t('planner.gantt.tooltip.current_status'), statusLabels[act.status] || act.status],
                      [t('planner.gantt.tooltip.proposed_status'), statusLabels[request.proposed_status || act.status] || request.proposed_status || act.status],
                      [t('planner.gantt.tooltip.proposed_pax'), String(request.proposed_pax_quota ?? act.pax_quota ?? 0)],
                      [t('planner.gantt.tooltip.proposed_start'), fmtDate(request.proposed_start_date)],
                      [t('planner.gantt.tooltip.proposed_end'), fmtDate(request.proposed_end_date)],
                      ...(request.note ? [[t('planner.gantt.tooltip.note'), request.note] as [string, string]] : []),
                    ],
                    meta: { requestId: request.id, proposal: true },
                  })
                }
              }
            }
          }
        }
      }
    }

    // Strip secondary labels globally if the user opted out
    const finalRows = viewPrefs.show_row_sublabels
      ? rowList
      : rowList.map((r) => ({ ...r, sublabel: undefined }))

    // Map backend dependencies to GanttCore's expected shape
    const depList: GanttDependencyData[] = (ganttData?.dependencies ?? []).map((d) => ({
      fromId: d.predecessor_id,
      toId: d.successor_id,
      type: (d.dependency_type === 'SS' || d.dependency_type === 'FF' || d.dependency_type === 'SF'
        ? d.dependency_type
        : 'FS') as 'FS' | 'SS' | 'FF' | 'SF',
      lag: d.lag_days,
    }))

    return { rows: finalRows, bars: barList, deps: depList }
  }, [
    scale, startDate, endDate, ganttData, heatmapData, hierarchyData,
    expandedRows, pendingRevisionRequests, statusLabels, t, viewPrefs,
  ])

  // ── Drag to reschedule with cascade / warn / strict modes ──
  //
  // When the user drags a bar, three strategies are available (controlled via
  // viewPrefs.drag_cascade_mode):
  //
  //  1. 'warn'    — the default. Compute all FS/SS/FF/SF constraint violations
  //                 the new dates would cause and show a confirmation dialog.
  //                 The user decides whether to accept a broken schedule.
  //  2. 'cascade' — act like MS-Project's "push successors" mode. Walk the
  //                 dependency graph downstream (BFS) from the dragged bar,
  //                 compute the minimum shift each successor needs to keep
  //                 its incoming constraint satisfied, and apply all shifts
  //                 as a single batch of PATCH requests after confirmation.
  //                 Cycle detection prevents infinite loops.
  //  3. 'strict'  — reject the drag outright if any constraint would break.
  const handleBarDrag = useCallback(async (barId: string, newStart: string, newEnd: string) => {
    if (barId.startsWith('proposal-')) return

    const allDeps = ganttData?.dependencies ?? []
    const allActsById = new Map<string, GanttActivity>()
    for (const asset of ganttData?.assets ?? []) {
      for (const a of asset.activities) allActsById.set(a.id, a)
    }

    // ── Workflow guard: block direct drag on validated activities ──
    // A validated / in_progress / completed activity should not be moved
    // without going through the revision workflow. The backend exposes
    // request_revision_decision only for signal-based flows (Projet → task
    // edit), so for now we block the drag and point the user to the detail
    // panel where they can Cancel then Re-submit.
    const draggedAct = allActsById.get(barId)
    if (draggedAct && ['validated', 'in_progress', 'completed'].includes(draggedAct.status)) {
      const statusLabel = draggedAct.status === 'completed'
        ? 'terminée'
        : draggedAct.status === 'in_progress' ? 'en cours' : 'validée'
      await confirm({
        title: 'Activité verrouillée',
        message:
          `L'activité « ${draggedAct.title} » est ${statusLabel}.\n\n` +
          `Pour modifier ses dates, ouvrez le panneau de détail et :\n` +
          `  1. Cliquez « Annuler » pour la repasser en brouillon\n` +
          `  2. Modifiez les dates dans l'éditeur\n` +
          `  3. Re-soumettez l'activité pour validation`,
        confirmLabel: 'Compris',
        cancelLabel: '',
        variant: 'warning',
      })
      return
    }
    const MS = 86400000

    // Proposed state of each activity we're about to modify. Seed with the
    // dragged bar's new dates. We work in ms-since-epoch internally.
    type Slot = { start: number; end: number; title: string }
    const proposed = new Map<string, Slot>()
    const seed = allActsById.get(barId)
    if (seed) {
      proposed.set(barId, {
        start: new Date(newStart).getTime(),
        end: new Date(newEnd).getTime(),
        title: seed.title,
      })
    }

    // Helper: get an activity's current slot, falling back to its stored dates.
    const slotOf = (actId: string): Slot | null => {
      const p = proposed.get(actId)
      if (p) return p
      const a = allActsById.get(actId)
      if (!a || !a.start_date || !a.end_date) return null
      return {
        start: new Date(a.start_date).getTime(),
        end: new Date(a.end_date).getTime(),
        title: a.title,
      }
    }

    // Index deps by predecessor for the BFS walk (downstream propagation)
    const depsByPredecessor = new Map<string, typeof allDeps>()
    for (const dep of allDeps) {
      const list = depsByPredecessor.get(dep.predecessor_id) ?? []
      list.push(dep)
      depsByPredecessor.set(dep.predecessor_id, list)
    }

    // Violations collected in 'warn' / 'strict' mode
    const violations: string[] = []
    const MAX_STEPS = 500
    const visited = new Set<string>()
    const queue: string[] = [barId]
    let cycleDetected = false
    let steps = 0

    // Track the shifts we propose (activityId → {old, new}) for cascade mode
    const cascadeShifts: Array<{ id: string; title: string; oldStart: string; oldEnd: string; newStart: string; newEnd: string }> = []

    while (queue.length > 0 && steps < MAX_STEPS) {
      steps++
      const currentId = queue.shift()!
      if (visited.has(currentId)) {
        // Cycle — already processed this node. Skip but flag.
        if (currentId !== barId) cycleDetected = true
        continue
      }
      visited.add(currentId)

      const currentSlot = slotOf(currentId)
      if (!currentSlot) continue

      // Walk every dep where currentId is the predecessor
      const outgoing = depsByPredecessor.get(currentId) ?? []
      for (const dep of outgoing) {
        const succ = allActsById.get(dep.successor_id)
        if (!succ) continue
        const succSlot = slotOf(dep.successor_id)
        if (!succSlot) continue

        const lag = (dep.lag_days ?? 0) * MS
        // Required minimum based on dep type (ms-since-epoch)
        let requiredStart = succSlot.start
        let requiredEnd = succSlot.end
        let label = ''
        if (dep.dependency_type === 'FS') {
          // succ.start >= pred.end + lag
          const minStart = currentSlot.end + lag
          if (succSlot.start < minStart) {
            const delta = minStart - succSlot.start
            requiredStart = succSlot.start + delta
            requiredEnd = succSlot.end + delta
          }
          label = `${currentSlot.title} → ${succ.title} (FS${dep.lag_days >= 0 ? '+' : ''}${dep.lag_days}j)`
        } else if (dep.dependency_type === 'SS') {
          const minStart = currentSlot.start + lag
          if (succSlot.start < minStart) {
            const delta = minStart - succSlot.start
            requiredStart = succSlot.start + delta
            requiredEnd = succSlot.end + delta
          }
          label = `${currentSlot.title} → ${succ.title} (SS${dep.lag_days >= 0 ? '+' : ''}${dep.lag_days}j)`
        } else if (dep.dependency_type === 'FF') {
          const minEnd = currentSlot.end + lag
          if (succSlot.end < minEnd) {
            const delta = minEnd - succSlot.end
            requiredStart = succSlot.start + delta
            requiredEnd = succSlot.end + delta
          }
          label = `${currentSlot.title} → ${succ.title} (FF${dep.lag_days >= 0 ? '+' : ''}${dep.lag_days}j)`
        } else if (dep.dependency_type === 'SF') {
          const minEnd = currentSlot.start + lag
          if (succSlot.end < minEnd) {
            const delta = minEnd - succSlot.end
            requiredStart = succSlot.start + delta
            requiredEnd = succSlot.end + delta
          }
          label = `${currentSlot.title} → ${succ.title} (SF${dep.lag_days >= 0 ? '+' : ''}${dep.lag_days}j)`
        }

        const needsShift = requiredStart !== succSlot.start || requiredEnd !== succSlot.end
        if (!needsShift) continue

        // Record the violation
        violations.push(label)

        // In cascade mode, persist the proposed new dates and enqueue the
        // successor so its own successors propagate further down the chain.
        if (viewPrefs.drag_cascade_mode === 'cascade') {
          proposed.set(dep.successor_id, {
            start: requiredStart,
            end: requiredEnd,
            title: succ.title,
          })
          queue.push(dep.successor_id)
        }
      }
    }

    if (steps >= MAX_STEPS) {
      cycleDetected = true
    }

    // Build the cascade list from proposed map (excluding the bar we dragged —
    // it's always committed via its original path below)
    if (viewPrefs.drag_cascade_mode === 'cascade') {
      for (const [actId, slot] of proposed) {
        if (actId === barId) continue
        const orig = allActsById.get(actId)
        if (!orig?.start_date || !orig?.end_date) continue
        cascadeShifts.push({
          id: actId,
          title: slot.title,
          oldStart: orig.start_date.slice(0, 10),
          oldEnd: orig.end_date.slice(0, 10),
          newStart: new Date(slot.start).toISOString().slice(0, 10),
          newEnd: new Date(slot.end).toISOString().slice(0, 10),
        })
      }
    }

    // ── Apply strategy ──
    if (viewPrefs.drag_cascade_mode === 'strict' && violations.length > 0) {
      await confirm({
        title: 'Déplacement refusé',
        message:
          `Ce déplacement viole ${violations.length} contrainte(s) :\n\n` +
          violations.map((v) => `• ${v}`).join('\n') +
          `\n\nAjustez manuellement les activités liées ou passez en mode « cascade » dans les paramètres.`,
        confirmLabel: 'Compris',
        cancelLabel: '',
        variant: 'danger',
      })
      return
    }

    if (viewPrefs.drag_cascade_mode === 'warn' && violations.length > 0) {
      const proceed = await confirm({
        title: `${violations.length} contrainte(s) violée(s)`,
        message:
          violations.map((v) => `• ${v}`).join('\n') +
          `\n\nVoulez-vous quand même appliquer le déplacement ?`,
        confirmLabel: 'Appliquer quand même',
        cancelLabel: 'Annuler',
        variant: 'warning',
      })
      if (!proceed) return
    }

    if (viewPrefs.drag_cascade_mode === 'cascade' && cascadeShifts.length > 0) {
      const maxShown = 10
      const shownShifts = cascadeShifts.slice(0, maxShown)
      const more = cascadeShifts.length > maxShown
        ? `\n… et ${cascadeShifts.length - maxShown} de plus`
        : ''
      const cycleNote = cycleDetected
        ? '\n\n⚠️ Cycle ou chaîne trop longue détecté(e). Certains décalages peuvent être incomplets.'
        : ''
      const proceed = await confirm({
        title: `Cascade : ${cascadeShifts.length} successeur(s) décalé(s)`,
        message:
          shownShifts.map((s) => `• ${s.title} : ${s.oldStart} → ${s.newStart}`).join('\n') +
          more +
          cycleNote,
        confirmLabel: 'Appliquer',
        cancelLabel: 'Annuler',
        variant: 'warning',
      })
      if (!proceed) return
    }

    // ── Commit all shifts (dragged bar + cascade if any) in parallel ──
    try {
      const patchOps: Promise<unknown>[] = [
        plannerService.updateActivity(barId, { start_date: newStart, end_date: newEnd }),
      ]
      for (const shift of cascadeShifts) {
        patchOps.push(
          plannerService.updateActivity(shift.id, {
            start_date: shift.newStart,
            end_date: shift.newEnd,
          }),
        )
      }
      await Promise.all(patchOps)
      // Invalidate ALL gantt-related queries so the view refetches with the
      // new dates. Without this the toast fires, but React Query keeps
      // serving the stale cache and the bars don't move.
      qc.invalidateQueries({ queryKey: ['planner', 'gantt'] })
      qc.invalidateQueries({ queryKey: ['planner', 'capacity-heatmap'] })
      qc.invalidateQueries({ queryKey: ['planner', 'activities'] })
      const cascadeMsg = cascadeShifts.length > 0
        ? ` (+${cascadeShifts.length} en cascade)`
        : ''
      toast({
        title: `${t('planner.gantt.toasts.rescheduled')}${cascadeMsg}`,
        variant: 'success',
      })
    } catch {
      toast({ title: t('planner.gantt.toasts.drag_error'), variant: 'error' })
    }
  }, [t, toast, ganttData, viewPrefs.drag_cascade_mode, qc, confirm])

  // ── Resize handler (drag left/right edge of a bar) ──
  // Partial date update: only start_date or only end_date changes. The
  // cascade / warn / strict logic is simpler here because the resize only
  // affects a single end of the activity. We still run a constraint check
  // against the OTHER end's existing value.
  const handleBarResize = useCallback(async (barId: string, edge: 'left' | 'right', newDate: string) => {
    if (barId.startsWith('proposal-')) return
    const acts = new Map<string, GanttActivity>()
    for (const asset of ganttData?.assets ?? []) {
      for (const a of asset.activities) acts.set(a.id, a)
    }
    const current = acts.get(barId)
    if (!current || !current.start_date || !current.end_date) return

    const newStart = edge === 'left' ? newDate : current.start_date.slice(0, 10)
    const newEnd = edge === 'right' ? newDate : current.end_date.slice(0, 10)

    // Refuse zero or negative duration resizes
    if (new Date(newEnd).getTime() < new Date(newStart).getTime()) {
      toast({ title: 'Durée invalide', variant: 'warning' })
      return
    }

    // Delegate constraint check to the drag handler by calling it with the
    // partial update. This lets the user benefit from the same warn / cascade
    // / strict behaviour on resize.
    await handleBarDrag(barId, newStart, newEnd)
  }, [ganttData, toast, handleBarDrag])

  // ── Double-click on bar → open detail panel ──
  // A single click must NOT open the panel, because the user uses single
  // clicks for drag/resize operations. Only an explicit dblclick opens it.
  const handleBarDoubleClick = useCallback((barId: string) => {
    if (barId.startsWith('proposal-')) return
    openDynamicPanel({ type: 'detail', module: 'planner', id: barId })
  }, [openDynamicPanel])

  // ── Export Gantt as A3 PDF via the system PDF template ──
  const handleExportPdf = useCallback(
    async (imageDataUri: string) => {
      try {
        const dateRangeLabel = `${startDate ?? ''} → ${endDate ?? ''}`
        const scaleLabel = (scale ?? 'month').toString()
        const blob = await plannerService.exportGanttPdf({
          image_data_uri: imageDataUri,
          title: 'Planner — Gantt',
          subtitle: undefined,
          date_range: dateRangeLabel,
          scale: scaleLabel,
        })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `planner-gantt-${toISO(new Date())}.pdf`
        a.click()
        URL.revokeObjectURL(url)
        toast({ title: 'PDF généré', variant: 'success' })
      } catch {
        toast({ title: "Erreur lors de la génération du PDF", variant: 'error' })
      }
    },
    [startDate, endDate, scale, toast],
  )

  // ── Dependency edit modal state (triggered by double-click on arrow) ──
  const [editingDep, setEditingDep] = useState<{
    id: string
    predecessor_id: string
    successor_id: string
    dependency_type: 'FS' | 'SS' | 'FF' | 'SF'
    lag_days: number
  } | null>(null)
  const [editDepForm, setEditDepForm] = useState<{
    dependency_type: 'FS' | 'SS' | 'FF' | 'SF'
    lag_days: number
  }>({ dependency_type: 'FS', lag_days: 0 })

  const handleEditDependency = useCallback(
    (fromId: string, toId: string, type: 'FS' | 'SS' | 'FF' | 'SF') => {
      const dep = (ganttData?.dependencies ?? []).find(
        (d) => d.predecessor_id === fromId && d.successor_id === toId && d.dependency_type === type,
      )
      if (!dep) return
      setEditingDep({
        id: dep.id,
        predecessor_id: dep.predecessor_id,
        successor_id: dep.successor_id,
        dependency_type: dep.dependency_type as 'FS' | 'SS' | 'FF' | 'SF',
        lag_days: dep.lag_days ?? 0,
      })
      setEditDepForm({
        dependency_type: dep.dependency_type as 'FS' | 'SS' | 'FF' | 'SF',
        lag_days: dep.lag_days ?? 0,
      })
    },
    [ganttData],
  )

  // Activity title lookup for the modal label
  const activityTitleById = useMemo(() => {
    const map = new Map<string, string>()
    for (const asset of ganttData?.assets ?? []) {
      for (const a of asset.activities) map.set(a.id, a.title || a.id.slice(0, 8))
    }
    return map
  }, [ganttData])

  const handleSaveDep = useCallback(async () => {
    if (!editingDep) return
    // Backend has no PATCH → remove + re-add (same pattern as PlannerPage.handleUpdateDep)
    try {
      await plannerService.removeDependency(editingDep.predecessor_id, editingDep.id)
      await plannerService.addDependency(editingDep.predecessor_id, {
        predecessor_id: editingDep.predecessor_id,
        successor_id: editingDep.successor_id,
        dependency_type: editDepForm.dependency_type,
        lag_days: editDepForm.lag_days,
      })
      toast({ title: 'Dépendance modifiée', variant: 'success' })
      setEditingDep(null)
      qc.invalidateQueries({ queryKey: ['planner', 'gantt'] })
    } catch {
      toast({ title: 'Erreur lors de la modification', variant: 'error' })
    }
  }, [editingDep, editDepForm, toast, qc])

  // ── Delete a dependency arrow (selected via click + Delete key) ──
  const handleDeleteDependency = useCallback(
    async (fromId: string, toId: string, type: 'FS' | 'SS' | 'FF' | 'SF') => {
      const dep = (ganttData?.dependencies ?? []).find(
        (d) => d.predecessor_id === fromId && d.successor_id === toId && d.dependency_type === type,
      )
      if (!dep) return
      try {
        // The backend endpoint wants the 'activity' context — any of the two
        // activities involved is valid (predecessor OR successor). Pass the
        // predecessor for consistency with the UI model.
        await plannerService.removeDependency(fromId, dep.id)
        toast({ title: 'Dépendance supprimée', variant: 'success' })
        qc.invalidateQueries({ queryKey: ['planner', 'gantt'] })
      } catch {
        toast({ title: 'Erreur lors de la suppression', variant: 'error' })
      }
    },
    [ganttData, toast, qc],
  )

  // ── Customization sections injected into the GanttCore settings panel ──
  const customizationSections = useMemo(
    () => (
      <PlannerCustomizationSections
        prefs={viewPrefs}
        onChange={(p) => onViewPrefsChange?.(p)}
      />
    ),
    [viewPrefs, onViewPrefsChange],
  )

  // The legend and the cells must share the SAME config — otherwise the
  // swatches in the legend don't match what the user sees on the grid.
  const liveHeatmapConfig = heatmapData?.config ?? DEFAULT_HEATMAP_CONFIG

  return (
    <div className="flex-1 min-h-[400px] flex flex-col">
      {/* ── Legends (saturation + activity types + validity) ── */}
      <div className="mb-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground px-1">
        <span className="font-semibold uppercase tracking-wide text-[10px]">Saturation</span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-5 rounded-sm" style={{ backgroundColor: liveHeatmapConfig.color_low }} />
          <span>&lt;{liveHeatmapConfig.threshold_low}%</span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-5 rounded-sm" style={{ backgroundColor: liveHeatmapConfig.color_medium }} />
          <span>{liveHeatmapConfig.threshold_low}–{liveHeatmapConfig.threshold_medium}%</span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-5 rounded-sm" style={{ backgroundColor: liveHeatmapConfig.color_high }} />
          <span>{liveHeatmapConfig.threshold_medium}–{liveHeatmapConfig.threshold_high}%</span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-5 rounded-sm" style={{ backgroundColor: liveHeatmapConfig.color_critical }} />
          <span>{liveHeatmapConfig.threshold_high}–{liveHeatmapConfig.threshold_critical}%</span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-5 rounded-sm" style={{ backgroundColor: liveHeatmapConfig.color_overflow }} />
          <span>≥{liveHeatmapConfig.threshold_critical}% (saturé)</span>
        </span>
        <span className="ml-auto inline-flex items-center gap-1">
          <span className="font-mono text-foreground">*</span>
          <span>POB variable</span>
        </span>
      </div>

      <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground px-1">
        <span className="font-semibold uppercase tracking-wide text-[10px]">Activités</span>
        {Object.entries(TYPE_LABELS_FR).map(([key, label]) => {
          const typeFilter = viewPrefs.activity_type_filter ?? []
          const hasFilter = typeFilter.length > 0
          const isActive = !hasFilter || typeFilter.includes(key)
          return (
            <button
              key={key}
              type="button"
              onClick={() => {
                const current = viewPrefs.activity_type_filter ?? []
                let next: string[]
                if (current.includes(key)) {
                  next = current.filter((t) => t !== key)
                } else {
                  next = [...current, key]
                }
                // If every type is selected, reset to empty (== show all)
                if (next.length === Object.keys(TYPE_LABELS_FR).length) next = []
                onViewPrefsChange?.({ ...viewPrefs, activity_type_filter: next })
              }}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-1.5 py-0.5 transition-all cursor-pointer select-none',
                isActive
                  ? 'border-border hover:border-primary/40 hover:bg-primary/5'
                  : 'border-transparent opacity-35 hover:opacity-60',
              )}
              title={isActive ? `Filtrer hors ${label}` : `Afficher ${label}`}
            >
              <span className="h-3 w-5 rounded-sm shrink-0" style={{ backgroundColor: TYPE_COLORS[key] }} />
              <span>{label}</span>
            </button>
          )
        })}
        {(viewPrefs.activity_type_filter ?? []).length > 0 && (
          <button
            type="button"
            onClick={() => onViewPrefsChange?.({ ...viewPrefs, activity_type_filter: [] })}
            className="text-[10px] text-primary hover:underline"
            title="Réinitialiser le filtre de type"
          >
            Réinitialiser
          </button>
        )}
        <span className="ml-auto inline-flex items-center gap-1">
          {(['validated', 'draft'] as const).map((v) => {
            const filter = viewPrefs.activity_validity_filter ?? []
            const hasFilter = filter.length > 0
            const isActive = !hasFilter || filter.includes(v)
            const label = v === 'validated' ? 'Validé' : 'Brouillon / soumis'
            const swatchClass = v === 'validated' ? 'bg-primary' : 'bg-primary opacity-45'
            return (
              <button
                key={v}
                type="button"
                onClick={() => {
                  const current = viewPrefs.activity_validity_filter ?? []
                  let next: ('validated' | 'draft')[]
                  if (current.includes(v)) {
                    next = current.filter((x) => x !== v)
                  } else {
                    next = [...current, v]
                  }
                  // Both selected = show all → reset
                  if (next.length === 2) next = []
                  onViewPrefsChange?.({ ...viewPrefs, activity_validity_filter: next })
                }}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full border px-1.5 py-0.5 transition-all cursor-pointer select-none',
                  isActive
                    ? 'border-border hover:border-primary/40 hover:bg-primary/5'
                    : 'border-transparent opacity-35 hover:opacity-60',
                )}
                title={isActive ? `Filtrer hors ${label}` : `Afficher ${label}`}
              >
                <span className={cn('h-3 w-5 rounded-sm shrink-0', swatchClass)} />
                <span>{label}</span>
              </button>
            )
          })}
          {(viewPrefs.activity_validity_filter ?? []).length > 0 && (
            <button
              type="button"
              onClick={() => onViewPrefsChange?.({ ...viewPrefs, activity_validity_filter: [] })}
              className="text-[10px] text-primary hover:underline ml-1"
              title="Réinitialiser le filtre de validité"
            >
              Réinitialiser
            </button>
          )}
        </span>
      </div>

      <GanttCore
        key={`${scale}:${startDate}:${endDate}`}
        rows={rows}
        bars={bars}
        dependencies={deps}
        initialScale={scale}
        initialStart={startDate}
        initialEnd={endDate}
        columns={plannerColumns}
        initialSettings={{ barHeight: 18, rowHeight: 30, showProgress: true, ...ganttSettings }}
        onSettingsChange={onGanttSettingsChange}
        onBarDoubleClick={handleBarDoubleClick}
        onDeleteDependency={handleDeleteDependency}
        onEditDependency={handleEditDependency}
        onExportPdf={handleExportPdf}
        onBarDrag={handleBarDrag}
        onBarResize={handleBarResize}
        onViewChange={handleViewChange}
        expandedRows={expandedRows}
        onToggleRow={toggleRow}
        isLoading={isLoadingGantt}
        emptyMessage={t('planner.gantt.empty_message')}
        extraSettingsContent={customizationSections}
      />

      {/* ── Dependency edit modal ── */}
      {editingDep && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm"
          onClick={() => setEditingDep(null)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-sm mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 pt-4 pb-2 border-b border-border">
              <h3 className="text-sm font-semibold text-foreground">Modifier la dépendance</h3>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                <span className="font-medium text-foreground">{activityTitleById.get(editingDep.predecessor_id) ?? '—'}</span>
                {' → '}
                <span className="font-medium text-foreground">{activityTitleById.get(editingDep.successor_id) ?? '—'}</span>
              </p>
            </div>
            <div className="px-4 py-3 space-y-3">
              <div>
                <label className="block text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Type</label>
                <div className="grid grid-cols-4 gap-1">
                  {(['FS', 'SS', 'FF', 'SF'] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setEditDepForm((f) => ({ ...f, dependency_type: t }))}
                      className={cn(
                        'py-1 text-[11px] rounded border transition-colors',
                        editDepForm.dependency_type === t
                          ? 'border-primary bg-primary/10 text-primary font-semibold'
                          : 'border-border text-muted-foreground hover:bg-muted',
                      )}
                    >
                      {t}
                    </button>
                  ))}
                </div>
                <p className="text-[9px] text-muted-foreground mt-1">
                  FS = Finish-to-Start · SS = Start-to-Start · FF = Finish-to-Finish · SF = Start-to-Finish
                </p>
              </div>
              <div>
                <label className="block text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
                  Lag (jours)
                </label>
                <input
                  type="number"
                  value={editDepForm.lag_days}
                  onChange={(e) => setEditDepForm((f) => ({ ...f, lag_days: Number(e.target.value) || 0 }))}
                  className="w-full px-2 py-1 text-sm border border-border rounded bg-background"
                />
                <p className="text-[9px] text-muted-foreground mt-1">
                  Négatif = anticiper le successeur · Positif = retarder le successeur.
                </p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-border bg-muted/30 rounded-b-xl">
              <button
                type="button"
                onClick={() => setEditingDep(null)}
                className="gl-button-sm gl-button-default"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleSaveDep}
                className="gl-button-sm bg-primary text-primary-foreground hover:bg-primary/90"
              >
                Enregistrer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default GanttView
