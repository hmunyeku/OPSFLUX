/**
 * GanttView — Planner Gantt chart using the shared GanttCore component.
 *
 * Thin wrapper that:
 * 1. Fetches planner gantt data (assets + activities)
 * 2. Transforms into GanttCore's generic row/bar format
 * 3. Handles planner-specific interactions (click → detail panel, drag → PATCH)
 */
import { useState, useMemo, useCallback } from 'react'
import { useUIStore } from '@/stores/uiStore'
import { useGanttData } from '@/hooks/usePlanner'
import { plannerService } from '@/services/plannerService'
import { useToast } from '@/components/ui/Toast'
import { GanttCore } from '@/components/shared/gantt/GanttCore'
import { toISO } from '@/components/shared/gantt/ganttEngine'
import type { GanttRow, GanttBarData } from '@/components/shared/gantt/GanttCore'
import type { TimeScale } from '@/components/shared/gantt/ganttEngine'

// ── Type colors for Planner activity types ──────────────────────

const TYPE_COLORS: Record<string, string> = {
  project: '#3b82f6', workover: '#f59e0b', drilling: '#ef4444',
  integrity: '#8b5cf6', maintenance: '#06b6d4', permanent_ops: '#6b7280',
  inspection: '#22c55e', event: '#ec4899',
}

const STATUS_LABELS: Record<string, string> = {
  draft: 'Brouillon', submitted: 'Soumis', validated: 'Validé',
  in_progress: 'En cours', completed: 'Terminé', rejected: 'Rejeté', cancelled: 'Annulé',
}

// ── Component ───────────────────────────────────────────────────

interface GanttViewProps {
  typeFilter?: string
  statusFilter?: string
}

export function GanttView({ typeFilter, statusFilter }: GanttViewProps = {}) {
  const { toast } = useToast()
  const openDynamicPanel = useUIStore((s) => s.openDynamicPanel)

  // ── Date range state ──
  const [scale] = useState<TimeScale>('month')
  const now = new Date()
  const startDate = toISO(new Date(now.getFullYear(), now.getMonth() - 1, 1))
  const endDate = toISO(new Date(now.getFullYear(), now.getMonth() + 4, 0))

  // ── Fetch data ──
  const { data: ganttData, isLoading } = useGanttData(startDate, endDate, {
    types: typeFilter,
    statuses: statusFilter,
    show_permanent_ops: true,
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
    const rowList: GanttRow[] = []
    const barList: GanttBarData[] = []

    for (const asset of assets) {
      const assetId = asset.id || 'unassigned'
      const activityCount = asset.activities?.length || 0
      const hasChildren = activityCount > 0

      // Asset row (parent)
      rowList.push({
        id: assetId,
        label: asset.name || 'Non affecté',
        sublabel: activityCount > 0 ? `${activityCount} activité${activityCount > 1 ? 's' : ''}` : undefined,
        level: 0,
        hasChildren,
      })

      // If expanded, add activity rows
      if (hasChildren && expandedAssets.has(assetId)) {
        for (const act of asset.activities) {
          const actRowId = `act-${act.id}`
          rowList.push({
            id: actRowId,
            label: act.title,
            sublabel: STATUS_LABELS[act.status] || act.status,
            level: 1,
            hasChildren: false,
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
                ['Type', act.type],
                ['Statut', STATUS_LABELS[act.status] || act.status],
                ['PAX', String(act.pax_quota ?? 0)],
                ['Priorité', act.priority || '—'],
                ...(act.well_reference ? [['Puits', act.well_reference] as [string, string]] : []),
                ...('rig_name' in act && act.rig_name ? [['Rig', String(act.rig_name)] as [string, string]] : []),
                ...(act.work_order_ref ? [['WO', act.work_order_ref] as [string, string]] : []),
              ],
            })
          }
        }
      }

      // Also render a summary bar for the asset row (spanning all its activities)
      if (hasChildren && asset.activities.length > 0) {
        const starts = asset.activities
          .filter(a => a.start_date)
          .map(a => a.start_date!.slice(0, 10))
        const ends = asset.activities
          .filter(a => a.end_date)
          .map(a => a.end_date!.slice(0, 10))
        if (starts.length > 0 && ends.length > 0) {
          const minStart = starts.sort()[0]
          const maxEnd = ends.sort().reverse()[0]
          barList.push({
            id: `summary-${assetId}`,
            rowId: assetId,
            title: `${asset.name} (${activityCount})`,
            startDate: minStart,
            endDate: maxEnd,
            color: '#64748b',
            isDraft: false,
            tooltipLines: [
              ['Site', asset.name || '—'],
              ['Activités', String(activityCount)],
              ['Capacité max PAX', String(asset.capacity?.max_pax ?? '—')],
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
  }, [ganttData, expandedAssets])

  // ── Drag to reschedule ──
  const handleBarDrag = useCallback(async (barId: string, newStart: string, newEnd: string) => {
    if (barId.startsWith('summary-')) return // can't drag summary bars
    try {
      await plannerService.updateActivity(barId, { start_date: newStart, end_date: newEnd })
      toast({ title: 'Activité replanifiée', variant: 'success' })
    } catch {
      toast({ title: 'Erreur lors du déplacement', variant: 'error' })
    }
  }, [toast])

  // ── Click on bar → open detail panel ──
  const handleBarClick = useCallback((barId: string) => {
    if (barId.startsWith('summary-')) return
    openDynamicPanel({ type: 'detail', module: 'planner', id: barId })
  }, [openDynamicPanel])

  return (
    <div className="flex-1 min-h-[400px]">
      <GanttCore
        rows={rows}
        bars={bars}
        initialScale={scale}
        initialStart={startDate}
        initialEnd={endDate}
        initialSettings={{ barHeight: 20, rowHeight: 32, showProgress: false }}
        onBarClick={handleBarClick}
        onBarDrag={handleBarDrag}
        expandedRows={expandedAssets}
        onToggleRow={toggleAsset}
        isLoading={isLoading}
        emptyMessage="Aucune activité dans cette période. Ajustez les filtres ou la plage de dates."
      />
    </div>
  )
}

export default GanttView
