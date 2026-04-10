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
 */
import { useState, useMemo, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useUIStore } from '@/stores/uiStore'
import {
  useGanttData,
  useRevisionDecisionRequests,
  useCapacityHeatmap,
} from '@/hooks/usePlanner'
import { useAssetHierarchy } from '@/hooks/useAssetRegistry'
import { plannerService } from '@/services/plannerService'
import { useToast } from '@/components/ui/Toast'
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
} from '@/components/shared/gantt/ganttTypes'
import type { GanttActivity, CapacityHeatmapDay, CapacityHeatmapConfig } from '@/types/api'
import type { HierarchyFieldNode } from '@/types/assetRegistry'

// ── Type colors for Planner activity types ──────────────────────

const TYPE_COLORS: Record<string, string> = {
  project: '#3b82f6', workover: '#f59e0b', drilling: '#ef4444',
  integrity: '#8b5cf6', maintenance: '#06b6d4', permanent_ops: '#6b7280',
  inspection: '#22c55e', event: '#ec4899',
}

// Default heatmap thresholds + colors (overridden by backend config when present)
const DEFAULT_HEATMAP_CONFIG: CapacityHeatmapConfig = {
  threshold_low: 40,
  threshold_medium: 70,
  threshold_high: 90,
  threshold_critical: 100,
  color_low: '#dcfce7',       // emerald-100
  color_medium: '#86efac',     // emerald-300
  color_high: '#fde68a',       // amber-200
  color_critical: '#fca5a5',   // red-300
  color_overflow: '#dc2626',   // red-600
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  try { return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }) } catch { return '—' }
}

/**
 * Compact PAX descriptor for an activity (constant or variable POB schedule).
 */
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

/** Pick a heatmap color for a saturation % using the active config */
function colorForSaturation(pct: number, cfg: CapacityHeatmapConfig): string {
  if (pct >= cfg.threshold_critical) return cfg.color_overflow
  if (pct >= cfg.threshold_high) return cfg.color_critical
  if (pct >= cfg.threshold_medium) return cfg.color_high
  if (pct >= cfg.threshold_low) return cfg.color_medium
  return cfg.color_low
}

// ── Component ───────────────────────────────────────────────────

interface GanttViewProps {
  typeFilter?: string
  statusFilter?: string
  scale?: TimeScale
  startDate?: string
  endDate?: string
  onViewChange?: (scale: TimeScale, start: string, end: string) => void
}

export function GanttView({
  typeFilter,
  statusFilter,
  scale: externalScale,
  startDate: externalStartDate,
  endDate: externalEndDate,
  onViewChange,
}: GanttViewProps = {}) {
  const { t } = useTranslation()
  const { toast } = useToast()
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

  // ── Date range state ──
  const [scale] = useState<TimeScale>(externalScale ?? 'month')
  const now = new Date()
  const defaultRange = getDefaultDateRange(scale)
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
  // GanttCore takes an `expandedRows` set + `onToggleRow` callback. We invert
  // collapsed → expanded each render to feed it.
  const expandedRows = useMemo(() => {
    const exp = new Set<string>()
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
  const { rows, bars } = useMemo(() => {
    const cells = buildCells(scale, new Date(startDate), new Date(endDate))
    const cfg = heatmapData?.config ?? DEFAULT_HEATMAP_CONFIG

    // Index activities by asset_id (from GanttData)
    const activitiesByAsset = new Map<string, GanttActivity[]>()
    for (const asset of ganttData?.assets ?? []) {
      if (asset.id) activitiesByAsset.set(asset.id, asset.activities)
    }

    // Index heatmap days by asset_id → date(ms) → day
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

    /** Aggregate cells for a set of contributing installation asset_ids */
    function buildHeatmapCells(contributingAssetIds: string[]): GanttHeatmapCell[] {
      const result: GanttHeatmapCell[] = []
      cells.forEach((cell, idx) => {
        const cellStart = cell.startDate.getTime()
        const cellEnd = cell.endDate.getTime() + 86399999
        let maxSat = 0
        let totalForecast = 0
        let totalReal = 0
        let totalCap = 0
        let count = 0
        for (const aid of contributingAssetIds) {
          const inner = daysByAsset.get(aid)
          if (!inner) continue
          for (const [ts, day] of inner) {
            if (ts >= cellStart && ts <= cellEnd) {
              if (day.saturation_pct > maxSat) maxSat = day.saturation_pct
              totalForecast += day.forecast_pax
              totalReal += day.real_pob
              totalCap += day.capacity_limit
              count++
            }
          }
        }
        if (count === 0) return
        const sat = Math.round(maxSat)
        result.push({
          cellIdx: idx,
          color: colorForSaturation(sat, cfg),
          value: sat,
          label: `${sat}%`,
          tooltipHTML: `${sat}% · prév. ${totalForecast} · pob ${totalReal} · cap ${totalCap}`,
        })
      })
      return result
    }

    const rowList: GanttRow[] = []
    const barList: GanttBarData[] = []

    // Walk the asset hierarchy
    for (const field of hierarchyData as HierarchyFieldNode[]) {
      const fieldAssetIds: string[] = []
      const fieldSitesAssetCounts = field.sites.map((s) => s.installations.length).reduce((a, b) => a + b, 0)
      if (fieldSitesAssetCounts === 0) continue
      for (const s of field.sites) for (const i of s.installations) fieldAssetIds.push(i.id)

      const fieldId = `f:${field.id}`
      rowList.push({
        id: fieldId,
        label: field.name,
        sublabel: `${field.sites.length} site${field.sites.length > 1 ? 's' : ''}`,
        level: 0,
        hasChildren: true,
        heatmapCells: buildHeatmapCells(fieldAssetIds),
      })

      if (!expandedRows.has(fieldId)) continue

      for (const site of field.sites) {
        const siteAssetIds = site.installations.map((i) => i.id)
        if (siteAssetIds.length === 0) continue

        const siteId = `s:${site.id}`
        rowList.push({
          id: siteId,
          label: site.name,
          sublabel: `${site.installations.length} install.`,
          level: 1,
          hasChildren: true,
          heatmapCells: buildHeatmapCells(siteAssetIds),
        })

        if (!expandedRows.has(siteId)) continue

        for (const inst of site.installations) {
          const installId = `i:${inst.id}`
          const activities = activitiesByAsset.get(inst.id) ?? []
          rowList.push({
            id: installId,
            label: inst.name,
            sublabel: activities.length > 0
              ? `${activities.length} activité${activities.length > 1 ? 's' : ''}`
              : '—',
            level: 2,
            hasChildren: activities.length > 0,
            heatmapCells: buildHeatmapCells([inst.id]),
          })

          if (!expandedRows.has(installId)) continue

          // Activity rows (level 3) — bars only, no heatmap
          for (const act of activities) {
            const actRowId = `a:${act.id}`
            const paxLabel = fmtPax(act)
            const isVariable = act.pax_quota_mode === 'variable'

            rowList.push({
              id: actRowId,
              label: act.title,
              sublabel: statusLabels[act.status] || act.status,
              level: 3,
              hasChildren: false,
              columns: {
                pax: isVariable ? `${paxLabel}*` : paxLabel,
                start: fmtDate(act.start_date),
                end: fmtDate(act.end_date),
              },
              color: TYPE_COLORS[act.type] || '#3b82f6',
            })

            if (act.start_date && act.end_date) {
              barList.push({
                id: act.id,
                rowId: actRowId,
                title: `${paxLabel}${isVariable ? '*' : ''} · ${act.title}`,
                startDate: act.start_date.slice(0, 10),
                endDate: act.end_date.slice(0, 10),
                status: act.status,
                type: act.type,
                priority: act.priority,
                color: TYPE_COLORS[act.type] || '#3b82f6',
                isDraft: act.status === 'draft',
                isCritical: act.priority === 'critical',
                tooltipLines: [
                  [t('planner.gantt.tooltip.type'), act.type],
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

    // Fallback: assets present in capacity data but missing from the hierarchy
    // (e.g. legacy installations not yet linked) — show them as orphan rows.
    const assignedAssetIds = new Set<string>()
    for (const f of hierarchyData as HierarchyFieldNode[]) {
      for (const s of f.sites) for (const i of s.installations) assignedAssetIds.add(i.id)
    }
    const orphans = new Set<string>()
    for (const day of heatmapData?.days ?? []) {
      if (!assignedAssetIds.has(day.asset_id)) orphans.add(day.asset_id)
    }
    if (orphans.size > 0) {
      rowList.push({
        id: 'orphan-group',
        label: 'Non rattachés',
        sublabel: `${orphans.size}`,
        level: 0,
        hasChildren: true,
        heatmapCells: buildHeatmapCells(Array.from(orphans)),
      })
      if (expandedRows.has('orphan-group')) {
        for (const aid of orphans) {
          // Find a name from any day entry
          const sample = (heatmapData?.days ?? []).find((d) => d.asset_id === aid)
          rowList.push({
            id: `i:${aid}`,
            label: sample?.asset_name || aid,
            level: 2,
            hasChildren: false,
            heatmapCells: buildHeatmapCells([aid]),
          })
        }
      }
    }

    return { rows: rowList, bars: barList }
  }, [
    scale, startDate, endDate, ganttData, heatmapData, hierarchyData,
    expandedRows, pendingRevisionRequests, statusLabels, t,
  ])

  // ── Drag to reschedule ──
  const handleBarDrag = useCallback(async (barId: string, newStart: string, newEnd: string) => {
    if (barId.startsWith('proposal-')) return
    try {
      await plannerService.updateActivity(barId, { start_date: newStart, end_date: newEnd })
      toast({ title: t('planner.gantt.toasts.rescheduled'), variant: 'success' })
    } catch {
      toast({ title: t('planner.gantt.toasts.drag_error'), variant: 'error' })
    }
  }, [t, toast])

  // ── Click on bar → open detail panel ──
  const handleBarClick = useCallback((barId: string) => {
    if (barId.startsWith('proposal-')) return
    openDynamicPanel({ type: 'detail', module: 'planner', id: barId })
  }, [openDynamicPanel])

  return (
    <div className="flex-1 min-h-[400px] flex flex-col">
      {/* Compact legend */}
      <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground px-1">
        <span className="font-semibold uppercase tracking-wide text-[10px]">Saturation</span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-5 rounded-sm" style={{ backgroundColor: DEFAULT_HEATMAP_CONFIG.color_low }} />
          <span>&lt;{DEFAULT_HEATMAP_CONFIG.threshold_low}%</span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-5 rounded-sm" style={{ backgroundColor: DEFAULT_HEATMAP_CONFIG.color_medium }} />
          <span>{DEFAULT_HEATMAP_CONFIG.threshold_low}–{DEFAULT_HEATMAP_CONFIG.threshold_medium}%</span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-5 rounded-sm" style={{ backgroundColor: DEFAULT_HEATMAP_CONFIG.color_high }} />
          <span>{DEFAULT_HEATMAP_CONFIG.threshold_medium}–{DEFAULT_HEATMAP_CONFIG.threshold_high}%</span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-5 rounded-sm" style={{ backgroundColor: DEFAULT_HEATMAP_CONFIG.color_critical }} />
          <span>{DEFAULT_HEATMAP_CONFIG.threshold_high}–{DEFAULT_HEATMAP_CONFIG.threshold_critical}%</span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-5 rounded-sm" style={{ backgroundColor: DEFAULT_HEATMAP_CONFIG.color_overflow }} />
          <span>≥{DEFAULT_HEATMAP_CONFIG.threshold_critical}% (saturé)</span>
        </span>
        <span className="ml-auto inline-flex items-center gap-1">
          <span className="font-mono text-foreground">*</span>
          <span>POB variable</span>
        </span>
      </div>

      <GanttCore
        key={`${scale}:${startDate}:${endDate}`}
        rows={rows}
        bars={bars}
        initialScale={scale}
        initialStart={startDate}
        initialEnd={endDate}
        columns={plannerColumns}
        initialSettings={{ barHeight: 18, rowHeight: 30, showProgress: false }}
        onBarClick={handleBarClick}
        onBarDrag={handleBarDrag}
        onViewChange={handleViewChange}
        expandedRows={expandedRows}
        onToggleRow={toggleRow}
        isLoading={isLoadingGantt}
        emptyMessage={t('planner.gantt.empty_message')}
      />
    </div>
  )
}

export default GanttView
