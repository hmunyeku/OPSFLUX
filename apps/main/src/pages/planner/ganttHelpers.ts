/**
 * Pure helpers + constants used by GanttView.
 *
 * Extracted from GanttView.tsx so the main 2k-line file focuses on
 * rendering. No React state here — all functions are pure.
 */
import { buildCells } from '@/components/shared/gantt/ganttEngine'
import type {
  GanttActivity, CapacityHeatmapConfig,
} from '@/types/api'

// ── Type colors for Planner activity types ──────────────────────

export const TYPE_COLORS: Record<string, string> = {
  project: '#3b82f6', workover: '#f59e0b', drilling: '#ef4444',
  integrity: '#8b5cf6', maintenance: '#06b6d4', permanent_ops: '#6b7280',
  inspection: '#22c55e', event: '#ec4899',
}

export const TYPE_LABELS_FR: Record<string, string> = {
  project: 'Projet', workover: 'Workover', drilling: 'Forage',
  integrity: 'Intégrité', maintenance: 'Maintenance', permanent_ops: 'Ops perm.',
  inspection: 'Inspection', event: 'Événement',
}

// Default heatmap thresholds + colors — MUST stay in sync with the backend's
// CapacityHeatmapConfig default (app/services/modules/planner_service.py) so
// the legend matches the cell colors even before heatmapData.config arrives.
export const DEFAULT_HEATMAP_CONFIG: CapacityHeatmapConfig = {
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

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  try { return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }) } catch { return '—' }
}

export function fmtPax(act: { pax_quota?: number; pax_quota_mode?: 'constant' | 'variable'; pax_quota_daily?: Record<string, number> | null; has_children?: boolean; children_pob_total?: number | null; children_pob_daily?: Record<string, number> | null }): string {
  // §2.5 — Parent activities display sum of children POB
  if (act.has_children) {
    if (act.children_pob_daily && Object.keys(act.children_pob_daily).length > 0) {
      const values = Object.values(act.children_pob_daily).filter((v) => typeof v === 'number') as number[]
      if (values.length > 0) {
        const min = Math.min(...values)
        const max = Math.max(...values)
        return min === max ? `Σ${min}` : `Σ${min}–${max}`
      }
    }
    return `Σ${act.children_pob_total ?? 0}`
  }
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

export function colorForSaturation(pct: number, cfg: CapacityHeatmapConfig): string {
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
export function computeActivityProgress(act: GanttActivity): number {
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
export function utcDateKey(ts: number): string {
  const d = new Date(ts)
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Parse a YYYY-MM-DD ISO string as UTC midnight ms (no TZ offset drift). */
export function parseISODateUTC(iso: string): number {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return Date.UTC(y, (m ?? 1) - 1, d ?? 1)
}

export const MS_PER_DAY = 86400000

/**
 * Compute one PAX label per timeline cell that the activity overlaps.
 * - Constant POB → the activity's pax_quota for every cell
 * - Variable POB schedule → daily values (in day mode) or per-day average
 *   in week/month/quarter/semester modes. Days with no entry fall back to
 *   pax_quota.
 * All date arithmetic is done in UTC so a non-UTC user TZ never shifts the
 * lookup key by ±1 day.
 */
export function buildBarCellLabels(
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

  cells.forEach((cell: { startDate: Date; endDate: Date }, idx: number) => {
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
export function sumActivityPaxForCell(
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
