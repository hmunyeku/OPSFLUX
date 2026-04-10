/**
 * GanttView — Planner Gantt chart using the shared GanttCore component.
 *
 * Thin wrapper that:
 * 1. Fetches planner gantt data (assets + activities)
 * 2. Transforms into GanttCore's generic row/bar format
 * 3. Handles planner-specific interactions (click → detail panel, drag → PATCH)
 */
import { useState, useMemo, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useUIStore } from '@/stores/uiStore'
import { useGanttData, useRevisionDecisionRequests } from '@/hooks/usePlanner'
import { plannerService } from '@/services/plannerService'
import { useToast } from '@/components/ui/Toast'
import { GanttCore } from '@/components/shared/gantt/GanttCore'
import { getDefaultDateRange, toISO } from '@/components/shared/gantt/ganttEngine'
import type { GanttRow, GanttBarData, GanttColumn } from '@/components/shared/gantt/GanttCore'
import type { TimeScale } from '@/components/shared/gantt/ganttEngine'
// ganttEngine utilities available via GanttCore

// ── Type colors for Planner activity types ──────────────────────

const TYPE_COLORS: Record<string, string> = {
  project: '#3b82f6', workover: '#f59e0b', drilling: '#ef4444',
  integrity: '#8b5cf6', maintenance: '#06b6d4', permanent_ops: '#6b7280',
  inspection: '#22c55e', event: '#ec4899',
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  try { return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }) } catch { return '—' }
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
    { id: 'pax', label: t('planner.gantt.columns.pax'), width: 44, align: 'right' },
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
  const { data: ganttData, isLoading } = useGanttData(startDate, endDate, {
    types: typeFilter,
    statuses: statusFilter,
    show_permanent_ops: true,
  })
  const { data: pendingRevisionRequests } = useRevisionDecisionRequests({
    status: 'pending',
    page: 1,
    page_size: 200,
  })

  // ── Expand/collapse state for assets ──
  const [expandedAssets, setExpandedAssets] = useState<Set<string>>(new Set())
  const toggleAsset = useCallback((id: string) => {
    setExpandedAssets(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }, [])

  // ── Transform planner data → GanttCore format ──
  const { rows, bars } = useMemo(() => {
    const assets = ganttData?.assets ?? []
    const pendingRequests = pendingRevisionRequests?.items ?? []
    const requestsByActivity = new Map<string, typeof pendingRequests>()
    for (const request of pendingRequests) {
      for (const activityId of request.planner_activity_ids ?? []) {
        const existing = requestsByActivity.get(activityId) ?? []
        existing.push(request)
        requestsByActivity.set(activityId, existing)
      }
    }
    const rowList: GanttRow[] = []
    const barList: GanttBarData[] = []

    for (const asset of assets) {
      const assetId = asset.id || 'unassigned'
      const activityCount = asset.activities?.length || 0
      const hasChildren = activityCount > 0
      const activityStarts = (asset.activities ?? [])
        .filter(a => a.start_date)
        .map(a => a.start_date!.slice(0, 10))
      const activityEnds = (asset.activities ?? [])
        .filter(a => a.end_date)
        .map(a => a.end_date!.slice(0, 10))
      const totalPax = (asset.activities ?? []).reduce((sum, a) => sum + (a.pax_quota ?? 0), 0)
      const minStart = activityStarts.length > 0 ? activityStarts.sort()[0] : undefined
      const maxEnd = activityEnds.length > 0 ? activityEnds.sort().reverse()[0] : undefined

      // Asset row (parent)
      rowList.push({
        id: assetId,
        label: asset.name || t('planner.gantt.unassigned_asset'),
        sublabel: activityCount > 0 ? t('planner.gantt.activity_count', { count: activityCount }) : undefined,
        level: 0,
        hasChildren,
        columns: hasChildren ? {
          type: t('planner.gantt.columns.aggregate'),
          pax: totalPax,
          start: fmtDate(minStart),
          end: fmtDate(maxEnd),
        } : undefined,
      })

      // If expanded, add activity rows
      if (hasChildren && expandedAssets.has(assetId)) {
        for (const act of asset.activities) {
          const actRowId = `act-${act.id}`
          rowList.push({
            id: actRowId,
            label: act.title,
            sublabel: statusLabels[act.status] || act.status,
            level: 1,
            hasChildren: false,
            columns: {
              type: act.type,
              pax: act.pax_quota ?? 0,
              start: fmtDate(act.start_date),
              end: fmtDate(act.end_date),
            },
            color: TYPE_COLORS[act.type] || '#3b82f6',
          })

          if (act.start_date && act.end_date) {
            barList.push({
              id: act.id,
              rowId: actRowId,
              title: act.title,
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
                  [t('planner.gantt.tooltip.pax'), String(act.pax_quota ?? 0)],
                  [t('planner.gantt.tooltip.priority'), act.priority || '—'],
                  ...(act.well_reference ? [[t('planner.gantt.tooltip.well'), act.well_reference] as [string, string]] : []),
                  ...('rig_name' in act && act.rig_name ? [[t('planner.gantt.tooltip.rig'), String(act.rig_name)] as [string, string]] : []),
                  ...(act.work_order_ref ? [[t('planner.gantt.tooltip.work_order'), act.work_order_ref] as [string, string]] : []),
                ],
              })

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
                  [t('planner.gantt.tooltip.current_pax'), String(act.pax_quota ?? 0)],
                  [t('planner.gantt.tooltip.proposed_pax'), String(request.proposed_pax_quota ?? act.pax_quota ?? 0)],
                  [t('planner.gantt.tooltip.current_start'), fmtDate(act.start_date)],
                  [t('planner.gantt.tooltip.current_end'), fmtDate(act.end_date)],
                  [t('planner.gantt.tooltip.proposed_start'), fmtDate(request.proposed_start_date)],
                  [t('planner.gantt.tooltip.proposed_end'), fmtDate(request.proposed_end_date)],
                  ...(request.note ? [[t('planner.gantt.tooltip.note'), request.note] as [string, string]] : []),
                ],
                meta: {
                  requestId: request.id,
                  proposal: true,
                },
              })
            }
          }
        }
      }

      // Also render a summary bar for the asset row (spanning all its activities)
      if (hasChildren && asset.activities.length > 0) {
        if (minStart && maxEnd) {
          barList.push({
            id: `summary-${assetId}`,
            rowId: assetId,
            title: `${asset.name} (${activityCount})`,
            startDate: minStart,
            endDate: maxEnd,
            color: '#64748b',
            isDraft: false,
            tooltipLines: [
              [t('planner.gantt.tooltip.site'), asset.name || '—'],
              [t('planner.gantt.tooltip.activities'), String(activityCount)],
              [t('planner.gantt.tooltip.max_pax_capacity'), String(asset.capacity?.max_pax ?? '—')],
            ],
          })
        }
      }
    }

    // Auto-expand all assets if fewer than 10
    if (expandedAssets.size === 0 && assets.length <= 10 && assets.length > 0) {
      const all = new Set(assets.map(a => a.id || 'unassigned'))
      setExpandedAssets(all)
    }

    return { rows: rowList, bars: barList }
  }, [ganttData, expandedAssets, pendingRevisionRequests, statusLabels, t])

  // ── Drag to reschedule ──
  const handleBarDrag = useCallback(async (barId: string, newStart: string, newEnd: string) => {
    if (barId.startsWith('summary-')) return // can't drag summary bars
    try {
      await plannerService.updateActivity(barId, { start_date: newStart, end_date: newEnd })
      toast({ title: t('planner.gantt.toasts.rescheduled'), variant: 'success' })
    } catch {
      toast({ title: t('planner.gantt.toasts.drag_error'), variant: 'error' })
    }
  }, [t, toast])

  // ── Click on bar → open detail panel ──
  const handleBarClick = useCallback((barId: string) => {
    if (barId.startsWith('summary-')) return
    openDynamicPanel({ type: 'detail', module: 'planner', id: barId })
  }, [openDynamicPanel])

  return (
    <div className="flex-1 min-h-[400px]">
      <div className="mb-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        <span>{t('planner.gantt.legend_label')}</span>
        <span className="inline-flex items-center gap-2">
          <span className="h-2.5 w-8 rounded bg-primary" />
          <span>{t('planner.gantt.legend_confirmed')}</span>
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-2.5 w-8 rounded bg-primary opacity-45" />
          <span>{t('planner.gantt.legend_pending_proposal')}</span>
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
        initialSettings={{ barHeight: 20, rowHeight: 32, showProgress: false }}
        onBarClick={handleBarClick}
        onBarDrag={handleBarDrag}
        onViewChange={handleViewChange}
        expandedRows={expandedAssets}
        onToggleRow={toggleAsset}
        isLoading={isLoading}
        emptyMessage={t('planner.gantt.empty_message')}
      />
    </div>
  )
}

export default GanttView
