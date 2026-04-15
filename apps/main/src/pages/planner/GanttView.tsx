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

function fmtPax(act: { pax_quota?: number; pax_quota_mode?: 'constant' | 'variable'; pax_quota_daily?: Record<string, number> | null; has_children?: boolean; children_pob_total?: number | null; children_pob_daily?: Record<string, number> | null }): string {
  // §2.5 — Parent activities display sum of children POB
  if (act.has_children) {
    if (act.children_pob_daily && Object.keys(act.children_pob_daily).length > 0) {
      const values = Object.values(act.children_pob_daily).filter((v) => typeof v === 'number') as number[]
      if (values.length > 0) {
        const min = Math.min(...values)
        const max = Math.max(...values)
        return min === max ? `\u03A3${min}` : `\u03A3${min}\u2013${max}`
      }
    }
    return `\u03A3${act.children_pob_total ?? 0}`
  }
  const mode = act.pax_quota_mode ?? 'constant'
  if (mode === 'variable' && act.pax_quota_daily && Object.keys(act.pax_quota_daily).length > 0) {
    const values = Object.values(act.pax_quota_daily).filter((v) => typeof v === 'number') as number[]
    if (values.length > 0) {
      const min = Math.min(...values)
      const max = Math.max(...values)
      return min === max ? `${min}` : `${min}\u2013${max}`
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
  // §2.5 — For parent activities, use children POB sum instead of own pax_quota
  const useChildrenPob = act.has_children && (act.children_pob_total != null || act.children_pob_daily != null)
  const constantQuota = useChildrenPob ? (act.children_pob_total ?? 0) : (act.pax_quota ?? 0)
  const isVariable = useChildrenPob
    ? (act.children_pob_daily != null && Object.keys(act.children_pob_daily).length > 0)
    : (act.pax_quota_mode === 'variable')
  const dailyMap = useChildrenPob ? (act.children_pob_daily || {}) : (act.pax_quota_daily || {})
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
  /** When set, the gantt displays the scenario overlay instead of the live plan */
  scenarioId?: string
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
  scenarioId,
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
    scenario_id: scenarioId,
  })
  const { data: heatmapData } = useCapacityHeatmap(startDate, endDate, undefined, scenarioId)
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
  const { rows, bars, deps, footerRow: workloadFooter } = useMemo(() => {
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
      opts: { colorless?: boolean } = {},
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

        // Cell span in whole days (at least 1). We need this to convert
        // totalPax (which is a sum of pax-days) into an average "people
        // physically on site on any given day in this cell" — i.e. the
        // daily headcount rolled up to the current display granularity.
        const cellDays = Math.max(
          1,
          Math.round((cellEndUTC - cellStartUTC + 1) / MS_PER_DAY),
        )

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

        // Nothing at all to draw — no activity AND no capacity entries.
        if (daysCovered === 0 && backendDayCount === 0) return

        // Determine the visual mode for this cell:
        //   - "capacity-aware" (backendDayCount > 0): normal saturation
        //     color based on totalPax / totalCap.
        //   - "neutral"        (backendDayCount === 0): the asset has
        //     no configured capacity, so we can't compute a meaningful
        //     saturation. Show a neutral gray background with the pax
        //     label (if any) instead of painting the row red — that
        //     was the "chaotique" behaviour the user flagged for rows
        //     like Rio Del Rey East / West where capacity has never
        //     been set up in the admin.
        const capacityAware = backendDayCount > 0

        // ── Cell color = AGGREGATE saturation over the cell period ──
        // (Only relevant in capacity-aware mode. In neutral mode we
        // force a muted gray background instead.)
        const satForColor =
          totalCap > 0 ? Math.round((totalPax / totalCap) * 100) : 0
        const peakSatForTooltip = Math.round(peakDaySat)
        // "Total" rows (global pax rollup across all assets) pass
        // `colorless: true` because there is no meaningful fleet-wide
        // saturation constraint to color against — the user explicitly
        // asked for the total row to show just the number without any
        // background tint. For everything else, capacity-aware cells
        // get their saturation color and uncapped cells get the
        // muted neutral gray introduced above.
        const color = opts.colorless
          ? 'transparent'
          : capacityAware
            ? colorForSaturation(satForColor, cfg)
            : 'rgba(148, 163, 184, 0.18)' // slate-400 @ 18% — quiet neutral

        // ── PAX count label: always a PER-DAY average ──
        // Spec clarification (2026-04-11): the number inside each heatmap
        // cell is "people per day", rolled up to the current display scale.
        // For day scale the cell is 1 day and avg === totalPax. For week /
        // month / quarter / semester scales we show `totalPax / cellDays`,
        // i.e. the average daily headcount over the cell's span. Summing
        // pax-days (the old behaviour) was misleading — a 10-pax × 10-day
        // activity in January rendered "100" in the month cell, which the
        // user read as "100 people on site in January" instead of "about 3
        // people per day on average".
        //
        // The average always reflects the TOTAL people on site (all
        // contributing assets combined per day), which is what the ops
        // team actually cares about when arbitrating capacity. It is
        // intentionally the same for `sum` and `peak` aggregation modes
        // at this display-layer level — aggregation still changes the
        // row COLOR semantics (peakDaySat is computed from the worst
        // per-asset day) but the headcount label itself is unambiguous.
        const avgDailyPax = totalPax / cellDays
        const avgLabel =
          cellDays === 1 || Number.isInteger(avgDailyPax)
            ? String(Math.round(avgDailyPax))
            : avgDailyPax.toFixed(1)

        // Value stored on the cell (used by callers that still read the
        // raw number). Keep the mode distinction so `sum` callers get the
        // pax-day total (for rollups) and `peak` callers get the worst
        // per-day pax. The LABEL is always the average.
        const value = aggregation === 'sum' ? totalPax : peakPax

        let label: string
        if (viewPrefs.heatmap_text_mode === 'pax_count') label = avgLabel
        else if (viewPrefs.heatmap_text_mode === 'percentage') label = `${satForColor}%`
        else label = ''

        // Tooltip: adapt text depending on whether we have capacity
        // data. Capacity-aware cells get the full breakdown (avg sat,
        // peak day, totals). Neutral cells drop the sat % (there isn't
        // one) and explicitly flag the missing configuration.
        let tooltipHTML: string
        if (capacityAware) {
          const peakSuffix = peakSatForTooltip > satForColor
            ? ` · pic quotidien ${peakSatForTooltip}%`
            : ''
          tooltipHTML =
            `~${avgLabel} pax/jour (moy. ${cellDays}j, ${satForColor}% cap)` +
            peakSuffix +
            ` · Σ prév. ${totalPax} pax·jours · pob réel ${totalReal} · cap ${totalCap}`
        } else {
          tooltipHTML =
            `~${avgLabel} pax/jour (moy. ${cellDays}j)` +
            ` · Σ prév. ${totalPax} pax·jours` +
            ` · capacité non configurée`
        }

        // Secondary label: POB réel (confirmed on-site headcount).
        // Computed as the average daily real POB over the cell span,
        // mirroring the primary forecast label's per-day semantics.
        const avgDailyReal = totalReal / cellDays
        const secondaryLabel = totalReal > 0
          ? 'R:' + (cellDays === 1 || Number.isInteger(avgDailyReal)
            ? String(Math.round(avgDailyReal))
            : avgDailyReal.toFixed(1))
          : undefined

        result.push({ cellIdx: idx, color, value, label, tooltipHTML, secondaryLabel })
      })

      return result
    }

    /**
     * Build the "Plan de charge" row — a single series of heatmap cells
     * where each cell is a STACKED BAR broken down by activity type.
     *
     * Each type contributes UP TO TWO segments per cell:
     *   - a fully-opaque segment for pax coming from VALIDATED activities
     *     (status ∈ {validated, in_progress, completed})
     *   - a semi-transparent segment (opacity 0.45) stacked on top for
     *     pax coming from DRAFT / submitted / rejected / cancelled
     *     activities
     *
     * So a user can tell the confirmed base load from the uncertain
     * overflow at a glance while still seeing the type colors from the
     * legend.
     *
     * All filters that already apply to the hierarchy rows are inherited
     * automatically because we iterate the same `activitiesByAsset` map
     * through `passesActivityFilters`.
     *
     * Cumulative values (running sum of pax-days) are precomputed and
     * attached to each cell so the GanttCore renderer can overlay a
     * trend line when the user toggles `show_workload_cumulative`.
     */
    function buildWorkloadCells(contributingAssetIds: string[]): GanttHeatmapCell[] {
      // Per-cell, per-type, split validated vs draft.
      type TypeSplit = { validated: number; draft: number }
      const perCell: Array<Record<string, TypeSplit>> = cells.map(() => ({}))

      for (const assetId of contributingAssetIds) {
        const acts = activitiesByAsset.get(assetId) ?? []
        for (const act of acts) {
          if (!act.start_date || !act.end_date) continue
          if (!passesActivityFilters(act)) continue
          const status = (act.status ?? '').toLowerCase()
          const isValidated = VALIDATED_STATUSES.has(status)

          const actStartUTC = parseISODateUTC(act.start_date)
          const actEndUTC = parseISODateUTC(act.end_date) + MS_PER_DAY - 1
          const constantQuota = act.pax_quota ?? 0
          const isVariable = act.pax_quota_mode === 'variable'
          const dailyMap = act.pax_quota_daily || {}

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
            if (cellEndUTC < actStartUTC || cellStartUTC > actEndUTC) return

            const from = Math.max(cellStartUTC, actStartUTC)
            const to = Math.min(cellEndUTC, actEndUTC)
            let cur = Math.floor(from / MS_PER_DAY) * MS_PER_DAY
            const bucket = perCell[idx]
            if (!bucket[act.type]) bucket[act.type] = { validated: 0, draft: 0 }
            let safety = 0
            while (cur <= to) {
              const iso = utcDateKey(cur)
              const v = isVariable
                ? (typeof dailyMap[iso] === 'number' ? dailyMap[iso] : constantQuota)
                : constantQuota
              if (isValidated) bucket[act.type].validated += v
              else bucket[act.type].draft += v
              cur += MS_PER_DAY
              if (++safety > 10000) break
            }
          })
        }
      }

      // Global max total (validated + draft) — shared normalizer so
      // stacks compare visually across the timeline.
      let maxTotal = 0
      for (let i = 0; i < perCell.length; i++) {
        let sum = 0
        for (const t in perCell[i]) sum += perCell[i][t].validated + perCell[i][t].draft
        if (sum > maxTotal) maxTotal = sum
      }
      if (maxTotal === 0) return []

      // Emit one GanttHeatmapCell per non-empty cell. Within each, the
      // stacks are ordered:
      //   1. VALIDATED segments first (bottom), sorted by value desc
      //   2. DRAFT segments on top, sorted by value desc
      // so the confirmed load sits at the base and the uncertain load
      // visually "floats" above it.
      const cellsOut: GanttHeatmapCell[] = []
      let cumul = 0
      cells.forEach((cell, idx) => {
        const bucket = perCell[idx]
        const cellDays = Math.max(
          1,
          Math.round(
            ((cell.endDate.getTime() + MS_PER_DAY - 1 - cell.startDate.getTime()) / MS_PER_DAY),
          ),
        )
        const typeEntries = Object.entries(bucket).filter(
          ([, split]) => split.validated + split.draft > 0,
        )
        const cellTotal = typeEntries.reduce(
          (s, [, split]) => s + split.validated + split.draft,
          0,
        )
        cumul += cellTotal
        if (typeEntries.length === 0) return

        // Build the stack bottom-up: validated segments first.
        const validatedEntries = typeEntries
          .filter(([, split]) => split.validated > 0)
          .sort((a, b) => b[1].validated - a[1].validated)
        const draftEntries = typeEntries
          .filter(([, split]) => split.draft > 0)
          .sort((a, b) => b[1].draft - a[1].draft)

        const stacks: NonNullable<GanttHeatmapCell['stacks']> = []
        for (const [type, split] of validatedEntries) {
          stacks.push({
            color: TYPE_COLORS[type] || '#94a3b8',
            value: split.validated,
            opacity: 1,
            label: `${TYPE_LABELS_FR[type] || type} (validé): ${(split.validated / cellDays).toFixed(1)} pax/j`,
          })
        }
        for (const [type, split] of draftEntries) {
          stacks.push({
            color: TYPE_COLORS[type] || '#94a3b8',
            value: split.draft,
            opacity: 0.45,
            label: `${TYPE_LABELS_FR[type] || type} (brouillon): ${(split.draft / cellDays).toFixed(1)} pax/j`,
          })
        }

        const avgDaily = cellTotal / cellDays
        const tooltipLines: string[] = [
          `Plan de charge — ${avgDaily.toFixed(1)} pax/jour (moy. ${cellDays}j)`,
        ]
        for (const [type, split] of typeEntries) {
          const parts: string[] = []
          if (split.validated > 0)
            parts.push(`validé ${(split.validated / cellDays).toFixed(1)}`)
          if (split.draft > 0)
            parts.push(`brouillon ${(split.draft / cellDays).toFixed(1)}`)
          tooltipLines.push(`${TYPE_LABELS_FR[type] || type}: ${parts.join(' + ')}`)
        }

        cellsOut.push({
          cellIdx: idx,
          color: 'transparent',
          value: Math.round(avgDaily),
          // Column total label — shown above the stack in GanttCore.
          label: avgDaily >= 0.5 ? String(Math.round(avgDaily)) : '',
          tooltipHTML: tooltipLines.join(' · '),
          stacks,
          stackMax: maxTotal,
          cumulative: cumul,
        })
      })
      return cellsOut
    }

    // ── Apply scope filters: filter the hierarchy down ──
    function passesScope(fieldId: string, siteId?: string, installationId?: string) {
      if (viewPrefs.field_filter && fieldId !== viewPrefs.field_filter) return false
      if (viewPrefs.site_filter && siteId && siteId !== viewPrefs.site_filter) return false
      if (viewPrefs.installation_filter && installationId && installationId !== viewPrefs.installation_filter) return false
      return true
    }

    // ── Max concurrent POB capacity helpers ──
    // For a single installation, "max POB" is the peak of its daily
    // `capacity_limit` values over the current range — the highest
    // headcount the installation was configured to hold on any day in
    // the window. For rollup rows (site / field / total) we SUM the
    // children's max POBs because installations host people
    // independently — the site can physically hold as many people as
    // all of its installations combined.
    //
    // Reading from `daysByAsset` (the heatmap payload) lets us surface
    // the value the user already configured via the capacity editor,
    // without requiring a new field on the hierarchy endpoint.
    const maxCapForInst = (instId: string): number => {
      const days = daysByAsset.get(instId)
      if (!days) return 0
      let max = 0
      for (const [, day] of days) {
        if (day.capacity_limit > max) max = day.capacity_limit
      }
      return max
    }
    const maxCapForAssets = (assetIds: string[]): number => {
      let total = 0
      for (const id of assetIds) total += maxCapForInst(id)
      return total
    }
    // Format "[N]" suffix if the max is non-zero; empty string otherwise
    // so rows without configured capacity don't sprout empty brackets.
    // The returned string is rendered by GanttCore as `row.labelSuffix`
    // in a muted color alongside the asset name.
    const capSuffix = (n: number): string => (n > 0 ? `[${n}]` : '')

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
    // These aggregate ACROSS all assets in scope, so there is no
    // meaningful fleet-wide saturation to color against. Pass
    // `colorless: true` so the cells render as transparent rectangles
    // with just the number — the "Total" row is a counting view, not
    // a safety view.
    if (viewPrefs.show_total_peak) {
      rowList.push({
        id: 'total-peak',
        label: 'Total — pic',
        sublabel: 'Pax/jour (max)',
        level: 0,
        hasChildren: false,
        rowHeight: heatmapRowH,
        heatmapCells: buildHeatmapCells(allInstIdsInScope, 'peak', { colorless: true }),
      })
    }
    if (viewPrefs.show_total_sum) {
      rowList.push({
        id: 'total-sum',
        label: 'Total — somme',
        sublabel: 'Pax/jour (moy.)',
        level: 0,
        hasChildren: false,
        rowHeight: heatmapRowH,
        heatmapCells: buildHeatmapCells(allInstIdsInScope, 'sum', { colorless: true }),
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
          labelSuffix: capSuffix(maxCapForAssets(fieldAssetIds)),
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
            labelSuffix: capSuffix(maxCapForAssets(siteAssetIds)),
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
              labelSuffix: capSuffix(maxCapForInst(inst.id)),
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
              // §2.5 — For parent activities with children_pob_daily, show as variable
              const isVariable = act.has_children
                ? (act.children_pob_daily != null && Object.keys(act.children_pob_daily).length > 0)
                : act.pax_quota_mode === 'variable'

              rowList.push({
                id: actRowId,
                label: act.title,
                sublabel: statusLabels[act.status] || act.status,
                level: actLevel,
                hasChildren: act.has_children ?? false,
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

    // ── Plan de charge row ──
    // This row is NOT pushed into rowList — it's handed off separately
    // as a "footerRow" to GanttCore so it can render as a sticky
    // element pinned to the bottom of the gantt body (both panel and
    // grid sides). Keeping it outside the main rows list means the
    // activity list scrolls normally while the workload summary
    // stays visible at all times.
    let workloadFooterRow: import('@/components/shared/gantt/ganttTypes').GanttRow | undefined
    if (viewPrefs.show_workload_chart) {
      const workloadCells = buildWorkloadCells(allInstIdsInScope)
      if (workloadCells.length > 0) {
        workloadFooterRow = {
          id: 'workload-chart',
          label: 'Plan de charge',
          sublabel: 'par type d\u2019activit\u00e9',
          level: 0,
          hasChildren: false,
          // Tall enough for labels + stack + cumulative curve.
          rowHeight: 120,
          heatmapCells: workloadCells,
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

    return { rows: finalRows, bars: barList, deps: depList, footerRow: workloadFooterRow }
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

    // ── Date sanity check ──
    // Reject drags where end < start (bar inverted). This can happen when
    // the user drags a very short bar past its own boundary. The backend
    // would reject it with a 400 anyway, but catching it here gives a
    // cleaner UX with no network roundtrip.
    if (newEnd < newStart) {
      toast({
        title: t('planner.gantt.toasts.dates_invalid'),
        description: t('planner.gantt.toasts.dates_invalid_desc'),
        variant: 'error',
      })
      return
    }

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

    // Index deps by predecessor (downstream) and by successor (upstream)
    const depsByPredecessor = new Map<string, typeof allDeps>()
    const depsBySuccessor = new Map<string, typeof allDeps>()
    for (const dep of allDeps) {
      const outList = depsByPredecessor.get(dep.predecessor_id) ?? []
      outList.push(dep)
      depsByPredecessor.set(dep.predecessor_id, outList)
      const inList = depsBySuccessor.get(dep.successor_id) ?? []
      inList.push(dep)
      depsBySuccessor.set(dep.successor_id, inList)
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

    // ── Pass 1: INCOMING constraints on the dragged bar itself ──
    // If the user drags B earlier in an A→B (FS) constraint, B's new start
    // may fall before A's end + lag → violation of the incoming dep. We
    // need to detect that too, not just the outgoing deps.
    const draggedIncoming = depsBySuccessor.get(barId) ?? []
    for (const dep of draggedIncoming) {
      const pred = allActsById.get(dep.predecessor_id)
      if (!pred) continue
      const predSlot = slotOf(dep.predecessor_id)
      const draggedSlot = slotOf(barId)
      if (!predSlot || !draggedSlot) continue
      const lag = (dep.lag_days ?? 0) * MS

      let okStart = true
      let okEnd = true
      let label = ''
      if (dep.dependency_type === 'FS') {
        if (draggedSlot.start < predSlot.end + lag) okStart = false
        label = `${pred.title} → ${draggedSlot.title} (FS${(dep.lag_days ?? 0) >= 0 ? '+' : ''}${dep.lag_days ?? 0}j)`
      } else if (dep.dependency_type === 'SS') {
        if (draggedSlot.start < predSlot.start + lag) okStart = false
        label = `${pred.title} → ${draggedSlot.title} (SS${(dep.lag_days ?? 0) >= 0 ? '+' : ''}${dep.lag_days ?? 0}j)`
      } else if (dep.dependency_type === 'FF') {
        if (draggedSlot.end < predSlot.end + lag) okEnd = false
        label = `${pred.title} → ${draggedSlot.title} (FF${(dep.lag_days ?? 0) >= 0 ? '+' : ''}${dep.lag_days ?? 0}j)`
      } else if (dep.dependency_type === 'SF') {
        if (draggedSlot.end < predSlot.start + lag) okEnd = false
        label = `${pred.title} → ${draggedSlot.title} (SF${(dep.lag_days ?? 0) >= 0 ? '+' : ''}${dep.lag_days ?? 0}j)`
      }
      if (!okStart || !okEnd) violations.push(label)
    }

    // ── Pass 2: OUTGOING BFS walk — propagate shifts downstream ──
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
          label = `${currentSlot.title} → ${succ.title} (FS${(dep.lag_days ?? 0) >= 0 ? '+' : ''}${dep.lag_days ?? 0}j)`
        } else if (dep.dependency_type === 'SS') {
          const minStart = currentSlot.start + lag
          if (succSlot.start < minStart) {
            const delta = minStart - succSlot.start
            requiredStart = succSlot.start + delta
            requiredEnd = succSlot.end + delta
          }
          label = `${currentSlot.title} → ${succ.title} (SS${(dep.lag_days ?? 0) >= 0 ? '+' : ''}${dep.lag_days ?? 0}j)`
        } else if (dep.dependency_type === 'FF') {
          const minEnd = currentSlot.end + lag
          if (succSlot.end < minEnd) {
            const delta = minEnd - succSlot.end
            requiredStart = succSlot.start + delta
            requiredEnd = succSlot.end + delta
          }
          label = `${currentSlot.title} → ${succ.title} (FF${(dep.lag_days ?? 0) >= 0 ? '+' : ''}${dep.lag_days ?? 0}j)`
        } else if (dep.dependency_type === 'SF') {
          const minEnd = currentSlot.start + lag
          if (succSlot.end < minEnd) {
            const delta = minEnd - succSlot.end
            requiredStart = succSlot.start + delta
            requiredEnd = succSlot.end + delta
          }
          label = `${currentSlot.title} → ${succ.title} (SF${(dep.lag_days ?? 0) >= 0 ? '+' : ''}${dep.lag_days ?? 0}j)`
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

    // ── Diagnostic for cases where the user expected a cascade/warn but
    // nothing was detected. Helps surface missing deps or scope filters.
    if (violations.length === 0 && cascadeShifts.length === 0 && allDeps.length === 0) {
      // No deps at all on the visible scope — silently no-op
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
      toast({ title: t('planner.gantt.toasts.duration_invalid'), variant: 'warning' })
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

  // ── Double-click on an activity row label (left panel) → open detail ──
  // Previously only double-clicking the bar opened the panel, which was
  // surprising: users who click on the activity name in the label column
  // expected the same behaviour as clicking the bar itself. Activity rows
  // carry the id "a:<activityId>"; hierarchy/total rows use other prefixes
  // (f:, s:, i:, total-*) and are ignored here so double-clicking a Field
  // or Site row doesn't accidentally fire a planner detail lookup.
  const handleRowDoubleClick = useCallback((rowId: string) => {
    if (!rowId.startsWith('a:')) return
    const activityId = rowId.slice(2)
    if (!activityId) return
    openDynamicPanel({ type: 'detail', module: 'planner', id: activityId })
  }, [openDynamicPanel])

  // ── Export Gantt as A3 PDF via the system PDF template ──
  // Server-side rendering: we build a JSON payload from the local
  // rows/bars/cells and POST it to /export/gantt-pdf. The backend's
  // Jinja2 template renders an HTML table that WeasyPrint converts to
  // a vector PDF. No html2canvas screenshot involved → crisp text,
  // proper typography, full A3 utilisation.
  const handleExportPdf = useCallback(
    async () => {
      try {
        const cells = buildCells(scale, new Date(startDate), new Date(endDate))
        const todayISO = toISO(new Date())

        // Map a date string into the index of the cell that contains it.
        // For day scale → exact match. For week/month/etc → find the cell
        // whose [startDate, endDate] range covers the date.
        const dateToCol = (iso: string): number => {
          const t = new Date(iso).getTime()
          for (let i = 0; i < cells.length; i++) {
            const cs = cells[i].startDate.getTime()
            const ce = cells[i].endDate.getTime() + 86_400_000 - 1
            if (t >= cs && t <= ce) return i
          }
          if (t < cells[0].startDate.getTime()) return 0
          return cells.length - 1
        }

        const monthFmt = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' })
        const pdfColumns = cells.map((c) => ({
          key: c.key,
          label: c.label,
          group_label: monthFmt.format(c.startDate),
          is_today: scale === 'day' && c.startDate.toISOString().slice(0, 10) === todayISO,
          is_weekend: scale === 'day' && (c.startDate.getDay() === 0 || c.startDate.getDay() === 6),
          is_dim: scale === 'day' && (c.startDate.getDay() === 0 || c.startDate.getDay() === 6),
        }))

        // Build the row payload. Heatmap rows emit value+bg per cell.
        // Activity rows emit a bar with start_col/end_col.
        const barsByRow = new Map<string, typeof bars[number][]>()
        for (const b of bars) {
          const list = barsByRow.get(b.rowId) ?? []
          list.push(b)
          barsByRow.set(b.rowId, list)
        }

        const pdfRows: import('@/services/plannerService').GanttPdfRow[] = []
        for (const row of rows) {
          if (row.heatmapCells && row.heatmapCells.length > 0) {
            // heatmapCells is a sparse list keyed by cellIdx — index it
            // first then emit one entry per timeline column.
            const byIdx = new Map<number, typeof row.heatmapCells[number]>()
            for (const hc of row.heatmapCells) byIdx.set(hc.cellIdx, hc)
            const heatmap_cells = cells.map((_c, idx) => {
              const hc = byIdx.get(idx)
              return {
                value: hc?.label ?? (hc ? String(hc.value) : ''),
                bg: hc?.color ?? null,
                fg: null,
              }
            })
            pdfRows.push({
              id: row.id,
              label: row.label,
              sublabel: row.sublabel ?? null,
              level: row.level ?? 0,
              is_heatmap: true,
              heatmap_cells,
            })
            continue
          }
          // Activity row(s): one row per bar (usually a single bar)
          const rowBars = barsByRow.get(row.id) ?? []
          if (rowBars.length === 0) {
            pdfRows.push({
              id: row.id,
              label: row.label,
              sublabel: row.sublabel ?? null,
              level: row.level ?? 0,
              is_heatmap: false,
            })
            continue
          }
          for (const b of rowBars) {
            const startCol = dateToCol(b.startDate)
            const endCol = dateToCol(b.endDate)
            // cellLabels in the GanttBar use cell-index relative to the
            // global cells array. Map them into a dense per-bar array.
            const labels: string[] = []
            for (let i = startCol; i <= endCol; i++) {
              const cl = b.cellLabels?.find((x) => x.cellIdx === i)
              labels.push(cl?.label ?? '')
            }
            pdfRows.push({
              id: `${row.id}::${b.id}`,
              label: row.label,
              sublabel: row.sublabel ?? null,
              level: row.level ?? 0,
              is_heatmap: false,
              bar: {
                start_col: startCol,
                end_col: endCol,
                color: b.color || '#3b82f6',
                text_color: '#ffffff',
                label: b.title || null,
                is_draft: !!b.isDraft,
                is_critical: !!b.isCritical,
                progress: typeof b.progress === 'number' ? b.progress : null,
                cell_labels: labels,
              },
            })
          }
        }

        // ── Plan de charge row in the PDF ──
        // The workloadFooter is NOT in the `rows` list (it lives in a
        // separate prop for sticky-bottom rendering), so we append it
        // manually here when the feature is enabled. We export it as a
        // single heatmap row whose per-cell value is the column total
        // (average daily pax) — the PDF template doesn't understand
        // stacked bars, but a row of totals is enough to read the
        // workload at a glance.
        if (workloadFooter && workloadFooter.heatmapCells && workloadFooter.heatmapCells.length > 0) {
          const byIdx = new Map<number, typeof workloadFooter.heatmapCells[number]>()
          for (const hc of workloadFooter.heatmapCells) byIdx.set(hc.cellIdx, hc)
          const heatmap_cells = cells.map((_c, idx) => {
            const hc = byIdx.get(idx)
            return {
              value: hc?.label ?? '',
              // Transparent cells map to null so the PDF template
              // renders them without a fill — matches the "no
              // coloriage" semantic of the total rows.
              bg: hc && hc.color !== 'transparent' ? hc.color : null,
              fg: null,
            }
          })
          pdfRows.push({
            id: workloadFooter.id,
            label: workloadFooter.label,
            sublabel: workloadFooter.sublabel ?? null,
            level: 0,
            is_heatmap: true,
            heatmap_cells,
          })
        }

        const dateRangeLabel = `${startDate ?? ''} → ${endDate ?? ''}`
        const scaleLabel = (scale ?? 'month').toString()
        const blob = await plannerService.exportGanttPdf({
          title: 'Planner — Gantt',
          date_range: dateRangeLabel,
          scale: scaleLabel,
          columns: pdfColumns,
          rows: pdfRows,
          task_col_label: 'Tâche',
        })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `planner-gantt-${toISO(new Date())}.pdf`
        a.click()
        URL.revokeObjectURL(url)
        toast({ title: t('planner.gantt.toasts.pdf_generated'), variant: 'success' })
      } catch {
        toast({ title: t('planner.gantt.toasts.pdf_error'), variant: 'error' })
      }
    },
    [startDate, endDate, scale, toast, rows, bars, workloadFooter],
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
      toast({ title: t('planner.gantt.toasts.dependency_modified'), variant: 'success' })
      setEditingDep(null)
      qc.invalidateQueries({ queryKey: ['planner', 'gantt'] })
    } catch {
      toast({ title: t('planner.gantt.toasts.dependency_modification_error'), variant: 'error' })
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
        toast({ title: t('planner.gantt.toasts.dependency_deleted'), variant: 'success' })
        qc.invalidateQueries({ queryKey: ['planner', 'gantt'] })
      } catch {
        toast({ title: t('planner.gantt.toasts.dependency_deletion_error'), variant: 'error' })
      }
    },
    [ganttData, toast, qc],
  )

  // ── Customization sections injected into the GanttCore settings panel ──
  // We use a render-prop so the sections receive the LIVE GanttCore settings
  // (not the stale persisted snapshot). That lets the heatmap row height
  // slider cap at the current barHeight — if the user drags the bar height
  // slider above the current value in the same panel, the heatmap slider's
  // ceiling moves with it in real time.
  const customizationSections = useCallback(
    (liveSettings: import('@/components/shared/gantt/ganttTypes').GanttSettings) => (
      <PlannerCustomizationSections
        prefs={viewPrefs}
        onChange={(p) => onViewPrefsChange?.(p)}
        barHeight={liveSettings.barHeight}
      />
    ),
    [viewPrefs, onViewPrefsChange],
  )

  // The legend and the cells must share the SAME config — otherwise the
  // swatches in the legend don't match what the user sees on the grid.
  const liveHeatmapConfig = heatmapData?.config ?? DEFAULT_HEATMAP_CONFIG

  // User pref: when false, the saturation/activity-type/validity legend
  // area at the top of the gantt is hidden to free vertical space.
  // Toggled via the customization modal (`Niveaux affichés` section).
  const showLegend = viewPrefs.show_legend !== false

  return (
    <div className="flex-1 min-h-[400px] flex flex-col">
      {/* ── Legends (saturation + activity types + validity) ── */}
      {showLegend && <>
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
      </>}

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
        onRowClick={handleRowDoubleClick}
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
        footerRow={workloadFooter}
        workloadShowCumulative={viewPrefs.show_workload_cumulative}
        workloadBarWidthPct={viewPrefs.workload_bar_width_pct}
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
