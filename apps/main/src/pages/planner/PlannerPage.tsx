/**
 * Planner page — Gantt, Activites, Conflits, Capacite.
 *
 * Static Panel: tab bar + content per tab.
 * Dynamic Panel: create/detail forms per entity.
 */
import { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import {
  CalendarRange, ListTodo, AlertTriangle, BarChart3, Plus,
  Calendar, Clock, Users, CheckCircle2, XCircle, Send, Ban,
  Wrench, HardHat, Gauge, Shield, Drill, Pencil, Trash2, Link2, Loader2,
  ChevronLeft, ChevronRight, ChevronDown, GanttChart, Eye, Repeat, ArrowUpDown,
  FlaskConical, TrendingUp,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { normalizeNames } from '@/lib/normalize'
import { DataTable } from '@/components/ui/DataTable/DataTable'
import type { ColumnDef } from '@tanstack/react-table'
import { useDebounce } from '@/hooks/useDebounce'
import { usePageSize } from '@/hooks/usePageSize'
import { useDictionaryLabels } from '@/hooks/useDictionary'
import { PanelHeader, PanelContent, ToolbarButton } from '@/components/layout/PanelHeader'
import { useUIStore } from '@/stores/uiStore'
import {
  DynamicPanelShell,
  PanelContentLayout,
  FormSection,
  FormGrid,
  DetailFieldGrid,
  DynamicPanelField,
  PanelActionButton,
  DangerConfirmButton,
  DetailRow,
  InlineEditableRow,
  SectionColumns,
  panelInputClass,
} from '@/components/layout/DynamicPanel'
import { registerPanelRenderer } from '@/components/layout/DetachedPanelRenderer'
import { GanttView } from './GanttView'
import { buildCells, buildHeaderGroups, getDefaultDateRange } from '@/components/shared/gantt/ganttEngine'
import type { TimeScale } from '@/components/shared/gantt/ganttEngine'
import { useUserPreferences } from '@/hooks/useUserPreferences'
import {
  DEFAULT_PLANNER_GANTT_VIEW,
  validatePlannerGanttPrefs,
  type PlannerGanttViewPrefs,
} from './PlannerCustomizationModal'
import { VariablePobEditor } from './VariablePobEditor'
import { TagManager } from '@/components/shared/TagManager'
import { NoteManager } from '@/components/shared/NoteManager'
import { AttachmentManager } from '@/components/shared/AttachmentManager'
import { CrossModuleLink } from '@/components/shared/CrossModuleLink'
import { AssetPicker } from '@/components/shared/AssetPicker'
import { ActivityPicker } from '@/components/shared/ActivityPicker'
import { ProjectPicker } from '@/components/shared/ProjectPicker'
import { DateRangePicker } from '@/components/shared/DateRangePicker'
import { useToast } from '@/components/ui/Toast'
import { useConfirm, usePromptInput } from '@/components/ui/ConfirmDialog'
import { useAssetHierarchy } from '@/hooks/useAssetRegistry'
import {
  useActivities,
  useActivity,
  useCreateActivity,
  useUpdateActivity,
  useDeleteActivity,
  useSubmitActivity,
  useValidateActivity,
  useRejectActivity,
  useCancelActivity,
  useActivityDependencies,
  useAddDependency,
  useRemoveDependency,
  useConflicts,
  useRevisionSignals,
  useRevisionSignalImpactSummary,
  useAcknowledgeRevisionSignal,
  useRevisionDecisionRequests,
  useRequestRevisionDecision,
  useRespondRevisionDecisionRequest,
  useForceRevisionDecisionRequest,
  useResolveConflict,
  useConflictAudit,
  // useBulkResolveConflicts — available, wired into ConflitsTab in a future pass
  useGanttData,
  useCapacityHeatmap,
  useAssetCapacities,
  useCreateAssetCapacity,
  useImpactPreview,
  useOverridePriority,
  useSetRecurrence,
  useDeleteRecurrence,
  useSimulateScenario,
  useForecast,
} from '@/hooks/usePlanner'
import { usePermission } from '@/hooks/usePermission'
import type {
  PlannerActivity, PlannerActivityCreate,
  PlannerConflict, PlannerDependency,
  PlannerRevisionSignal,
  PlannerRevisionDecisionRequest,
  GanttActivity, GanttAsset,
  AssetCapacity,
  ProposedActivity, ScenarioResult, ForecastDay,
} from '@/types/api'
import type { HierarchyFieldNode } from '@/types/assetRegistry'

// ── Tab definitions ───────────────────────────────────────────

type PlannerTab = 'gantt' | 'activities' | 'conflicts' | 'capacity' | 'scenarios' | 'forecast'

const TABS: { id: PlannerTab; label: string; icon: typeof CalendarRange }[] = [
  { id: 'gantt', label: 'Gantt', icon: GanttChart },
  { id: 'activities', label: 'Activites', icon: ListTodo },
  { id: 'conflicts', label: 'Conflits', icon: AlertTriangle },
  { id: 'capacity', label: 'Capacite', icon: BarChart3 },
  { id: 'scenarios', label: 'Scénarios', icon: FlaskConical },
  { id: 'forecast', label: 'Prévisions', icon: TrendingUp },
]

// ── Constants ─────────────────────────────────────────────────

const PLANNER_ACTIVITY_STATUS_VALUES = ['draft', 'submitted', 'validated', 'in_progress', 'completed', 'rejected', 'cancelled'] as const
const PLANNER_ACTIVITY_TYPE_VALUES = ['project', 'workover', 'drilling', 'integrity', 'maintenance', 'permanent_ops', 'inspection', 'event'] as const
const PLANNER_PRIORITY_VALUES = ['low', 'medium', 'high', 'critical'] as const
const PLANNER_CONFLICT_STATUS_VALUES = ['open', 'resolved', 'deferred'] as const
const PLANNER_RESOLUTION_VALUES = ['approve_both', 'reschedule', 'reduce_pax', 'cancel', 'deferred'] as const
const PLANNER_DEP_TYPE_VALUES = ['FS', 'SS', 'FF'] as const

const ACTIVITY_STATUS_LABELS_FALLBACK: Record<string, string> = {
  draft: 'Brouillon',
  submitted: 'Soumis',
  validated: 'Validé',
  in_progress: 'En cours',
  completed: 'Terminé',
  rejected: 'Rejeté',
  cancelled: 'Annulé',
}

const ACTIVITY_STATUS_BADGES: Record<string, string> = {
  draft: 'gl-badge-neutral',
  submitted: 'gl-badge-info',
  validated: 'gl-badge-success',
  rejected: 'gl-badge-danger',
  in_progress: 'gl-badge-warning',
  completed: 'gl-badge-success',
  cancelled: 'gl-badge-neutral',
}

const ACTIVITY_TYPE_LABELS_FALLBACK: Record<string, string> = {
  project: 'Projet',
  workover: 'Workover',
  drilling: 'Forage',
  integrity: 'Intégrité',
  maintenance: 'Maintenance',
  permanent_ops: 'Ops permanentes',
  inspection: 'Inspection',
  event: 'Événement',
}

const ACTIVITY_TYPE_META: Record<string, { badge: string; icon: typeof Wrench }> = {
  project: { badge: 'gl-badge-info', icon: ListTodo },
  workover: { badge: 'gl-badge-warning', icon: Wrench },
  drilling: { badge: 'gl-badge-danger', icon: Drill },
  integrity: { badge: 'gl-badge-success', icon: Shield },
  maintenance: { badge: 'gl-badge-warning', icon: HardHat },
  permanent_ops: { badge: 'gl-badge-neutral', icon: Gauge },
  inspection: { badge: 'gl-badge-info', icon: Eye },
  event: { badge: 'gl-badge-neutral', icon: Calendar },
}

const PRIORITY_LABELS_FALLBACK: Record<string, string> = {
  low: 'Basse',
  medium: 'Moyenne',
  high: 'Haute',
  critical: 'Critique',
}

const PRIORITY_CLASS_MAP: Record<string, string> = {
  low: 'text-muted-foreground',
  medium: 'text-foreground',
  high: 'text-amber-600 dark:text-amber-400',
  critical: 'text-destructive font-semibold',
}

const CONFLICT_STATUS_LABELS_FALLBACK: Record<string, string> = {
  open: 'Ouvert',
  resolved: 'Résolu',
  deferred: 'Différé',
}

const CONFLICT_STATUS_BADGES: Record<string, string> = {
  open: 'gl-badge-danger',
  resolved: 'gl-badge-success',
  deferred: 'gl-badge-warning',
}

const RESOLUTION_LABELS_FALLBACK: Record<string, string> = {
  approve_both: 'Approuver les deux',
  reschedule: 'Replanifier',
  reduce_pax: 'Réduire PAX',
  cancel: 'Annuler une activité',
  deferred: 'Reporter la décision',
}

const DEP_TYPE_LABELS_FALLBACK: Record<string, string> = {
  FS: 'Fin-Début (FS)',
  SS: 'Début-Début (SS)',
  FF: 'Fin-Fin (FF)',
}

const ACTIVITY_TYPE_COLORS: Record<string, string> = {
  project: '#3b82f6',
  workover: '#16a34a',
  drilling: '#dc2626',
  integrity: '#0d9488',
  maintenance: '#f97316',
  permanent_ops: '#9ca3af',
  inspection: '#9333ea',
  event: '#d1d5db',
}

// ── Helpers ───────────────────────────────────────────────────

function StatusBadge({ status, labels, badges }: { status: string; labels: Record<string, string>; badges: Record<string, string> }) {
  return (
    <span className={cn('gl-badge', badges[status] || 'gl-badge-neutral')}>
      {labels[status] || status.replace(/_/g, ' ')}
    </span>
  )
}

function buildDictionaryOptions(labels: Record<string, string>, values: readonly string[], allLabel?: string) {
  return [
    ...(allLabel ? [{ value: '', label: allLabel }] : []),
    ...values.map((value) => ({ value, label: labels[value] ?? value })),
  ]
}

function formatDateShort(d: string | null | undefined) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
}

function formatDateOnly(d: string | null | undefined) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })
}

/** Display 'min–max' for a variable POB schedule, or the constant if all equal */
function formatVariablePaxRange(daily: Record<string, number> | null | undefined, fallback: number): string {
  if (!daily || Object.keys(daily).length === 0) return String(fallback)
  const values = Object.values(daily).filter((v): v is number => typeof v === 'number')
  if (values.length === 0) return String(fallback)
  const min = Math.min(...values)
  const max = Math.max(...values)
  return min === max ? String(min) : `${min}–${max}`
}

function StatCard({ label, value, icon: Icon, accent }: {
  label: string
  value: string | number
  icon: typeof CalendarRange
  accent?: string
}) {
  return (
    <div className="rounded-lg border border-border bg-background p-3">
      <div className="flex items-center gap-2 text-muted-foreground mb-1">
        <Icon size={13} />
        <span className="text-[10px] font-medium uppercase tracking-wide">{label}</span>
      </div>
      <p className={cn('text-lg font-semibold tabular-nums', accent || 'text-foreground')}>{value}</p>
    </div>
  )
}

/** Days between two ISO date strings, inclusive */
function daysBetween(a: string, b: string): number {
  const d1 = new Date(a)
  const d2 = new Date(b)
  return Math.max(1, Math.round((d2.getTime() - d1.getTime()) / 86400000) + 1)
}

/** Day offset from a base date */
function dayOffset(base: string, target: string): number {
  const d1 = new Date(base)
  const d2 = new Date(target)
  return Math.round((d2.getTime() - d1.getTime()) / 86400000)
}

/** Generate array of dates between two ISO date strings */
function dateRange(start: string, end: string): string[] {
  const dates: string[] = []
  const d = new Date(start)
  const dEnd = new Date(end)
  while (d <= dEnd) {
    dates.push(d.toISOString().split('T')[0])
    d.setDate(d.getDate() + 1)
  }
  return dates
}

function addDays(d: string, n: number): string {
  const dt = new Date(d)
  dt.setDate(dt.getDate() + n)
  return dt.toISOString().split('T')[0]
}

function toISODate(d: Date): string {
  return d.toISOString().split('T')[0]
}

function shiftTimelineRange(scale: TimeScale, start: string, end: string, direction: -1 | 1): { start: string; end: string } {
  const startDate = new Date(start)
  const endDate = new Date(end)
  if (scale === 'day') {
    startDate.setDate(startDate.getDate() + direction)
    endDate.setDate(endDate.getDate() + direction)
  } else if (scale === 'week') {
    startDate.setDate(startDate.getDate() + 7 * direction)
    endDate.setDate(endDate.getDate() + 7 * direction)
  } else if (scale === 'month') {
    startDate.setMonth(startDate.getMonth() + direction)
    endDate.setMonth(endDate.getMonth() + direction)
  } else if (scale === 'quarter') {
    startDate.setMonth(startDate.getMonth() + 3 * direction)
    endDate.setMonth(endDate.getMonth() + 3 * direction)
  } else {
    startDate.setMonth(startDate.getMonth() + 6 * direction)
    endDate.setMonth(endDate.getMonth() + 6 * direction)
  }
  return { start: toISODate(startDate), end: toISODate(endDate) }
}

// ── Gantt Tab ─────────────────────────────────────────────────

type TimeUnit = 'week' | 'month' | 'quarter'

/* Legacy GanttTab — replaced by GanttView.tsx */
/* @ts-expect-error keeping code for reference */
function _GanttTabLegacy() { // eslint-disable-line
  const openDynamicPanel = useUIStore((s) => s.openDynamicPanel)
  const activityTypeLabels = useDictionaryLabels('planner_activity_type', ACTIVITY_TYPE_LABELS_FALLBACK)
  const activityStatusLabels = useDictionaryLabels('planner_activity_status', ACTIVITY_STATUS_LABELS_FALLBACK)
  const activityTypeOptions = useMemo(() => buildDictionaryOptions(activityTypeLabels, PLANNER_ACTIVITY_TYPE_VALUES), [activityTypeLabels])
  const activityStatusOptions = useMemo(() => buildDictionaryOptions(activityStatusLabels, PLANNER_ACTIVITY_STATUS_VALUES, 'Tous'), [activityStatusLabels])

  const [timeUnit, setTimeUnit] = useState<TimeUnit>('month')
  const [typeFilter, setTypeFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)

  // Compute date range based on unit
  const { startDate, endDate } = useMemo(() => {
    const today = new Date()
    let start: Date
    let end: Date
    if (timeUnit === 'week') {
      const day = today.getDay()
      start = new Date(today)
      start.setDate(today.getDate() - (day === 0 ? 6 : day - 1))
      end = new Date(start)
      end.setDate(start.getDate() + 6 * 7 - 1) // 6 weeks
    } else if (timeUnit === 'month') {
      start = new Date(today.getFullYear(), today.getMonth(), 1)
      end = new Date(today.getFullYear(), today.getMonth() + 3, 0) // 3 months
    } else {
      const q = Math.floor(today.getMonth() / 3)
      start = new Date(today.getFullYear(), q * 3, 1)
      end = new Date(today.getFullYear(), q * 3 + 12, 0) // 4 quarters
    }
    return { startDate: toISODate(start), endDate: toISODate(end) }
  }, [timeUnit])

  const [viewStart, setViewStart] = useState(startDate)
  const [viewEnd, setViewEnd] = useState(endDate)

  // Sync when timeUnit changes
  useEffect(() => {
    setViewStart(startDate)
    setViewEnd(endDate)
  }, [startDate, endDate])

  const { data: ganttData, isLoading } = useGanttData(viewStart, viewEnd, {
    types: typeFilter || undefined,
    statuses: statusFilter || undefined,
    show_permanent_ops: true,
  })

  const assets: GanttAsset[] = ganttData?.assets ?? []
  const totalDays = daysBetween(viewStart, viewEnd)
  const dayWidth = timeUnit === 'week' ? 40 : timeUnit === 'month' ? 18 : 6
  const dates = useMemo(() => dateRange(viewStart, viewEnd), [viewStart, viewEnd])

  const navigate = useCallback((dir: -1 | 1) => {
    const shift = timeUnit === 'week' ? 7 : timeUnit === 'month' ? 30 : 90
    setViewStart(addDays(viewStart, dir * shift))
    setViewEnd(addDays(viewEnd, dir * shift))
  }, [viewStart, viewEnd, timeUnit])

  // Today line position
  const todayStr = toISODate(new Date())
  const todayOffset = dayOffset(viewStart, todayStr)
  const showTodayLine = todayOffset >= 0 && todayOffset < totalDays

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Toolbar */}
      <div className="flex items-center gap-2 border-b border-border px-3.5 h-9 shrink-0">
        {/* Time unit switcher */}
        <div className="flex items-center gap-0.5 mr-2">
          {(['week', 'month', 'quarter'] as TimeUnit[]).map((u) => (
            <button
              key={u}
              onClick={() => setTimeUnit(u)}
              className={cn(
                'px-2 py-0.5 rounded text-xs font-medium transition-colors whitespace-nowrap',
                timeUnit === u ? 'bg-primary/[0.16] text-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {u === 'week' ? 'Semaine' : u === 'month' ? 'Mois' : 'Trimestre'}
            </button>
          ))}
        </div>

        {/* Navigation */}
        <button onClick={() => navigate(-1)} className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground">
          <ChevronLeft size={14} />
        </button>
        <span className="text-xs text-muted-foreground tabular-nums whitespace-nowrap">
          {formatDateOnly(viewStart)} — {formatDateOnly(viewEnd)}
        </span>
        <button onClick={() => navigate(1)} className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground">
          <ChevronRight size={14} />
        </button>

        {/* Filters */}
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="h-6 px-1.5 text-xs border border-border rounded bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
        >
          <option value="">Tous types</option>
          {activityTypeOptions.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="h-6 px-1.5 text-xs border border-border rounded bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
        >
          {activityStatusOptions.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>

        <span className="text-xs text-muted-foreground ml-auto shrink-0">
          {assets.length} site(s)
        </span>
      </div>

      {/* Gantt chart */}
      {isLoading ? (
        <div className="flex items-center justify-center flex-1">
          <Loader2 size={16} className="animate-spin text-muted-foreground" />
        </div>
      ) : assets.length === 0 ? (
        <div className="flex flex-col items-center justify-center flex-1 text-center px-6">
          <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
            <GanttChart size={24} className="text-primary" />
          </div>
          <h3 className="text-base font-semibold text-foreground mb-1">Aucune activite</h3>
          <p className="text-sm text-muted-foreground max-w-sm">
            Aucune activite trouvee pour cette periode. Ajustez les filtres ou la plage de dates.
          </p>
        </div>
      ) : (
        <div ref={scrollRef} className="flex-1 overflow-auto relative">
          {/* Timeline header */}
          <div className="sticky top-0 z-10 flex border-b border-border bg-background">
            <div className="w-52 flex-shrink-0 border-r border-border px-2 py-1.5">
              <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Site</span>
            </div>
            <div className="flex" style={{ minWidth: totalDays * dayWidth }}>
              {dates.map((d) => {
                const dt = new Date(d)
                const isMonday = dt.getDay() === 1
                const isFirstOfMonth = dt.getDate() === 1
                const showLabel = timeUnit === 'week'
                  ? isMonday
                  : timeUnit === 'month'
                    ? (dt.getDate() === 1 || dt.getDate() === 15)
                    : isFirstOfMonth

                return (
                  <div
                    key={d}
                    className={cn(
                      'flex-shrink-0 border-r border-border/30 text-center',
                      d === todayStr && 'bg-primary/5',
                      dt.getDay() === 0 && 'bg-muted/30',
                      dt.getDay() === 6 && 'bg-muted/20',
                    )}
                    style={{ width: dayWidth }}
                  >
                    {showLabel && (
                      <span className="text-[8px] text-muted-foreground leading-none block pt-0.5">
                        {dt.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Today line */}
          {showTodayLine && (
            <div
              className="absolute top-0 bottom-0 w-px bg-primary/60 z-20 pointer-events-none"
              style={{ left: 208 + todayOffset * dayWidth + dayWidth / 2 }}
            />
          )}

          {/* Asset rows */}
          {assets.map((asset) => {
            // Compute total used pax for a rough capacity bar
            const usedPax = asset.activities.reduce((s, a) => s + (a.pax_quota ?? 0), 0)
            const maxPax = asset.capacity?.max_pax ?? 0

            return (
              <div key={asset.id} className="flex border-b border-border hover:bg-accent/20 group">
                {/* Asset label + capacity bar */}
                <div className="w-52 flex-shrink-0 p-2 border-r border-border flex flex-col justify-center gap-1">
                  <span className="text-xs font-medium text-foreground truncate" title={asset.name}>{asset.name}</span>
                  {maxPax > 0 && (
                    <CapacityBar current={usedPax} max={maxPax} />
                  )}
                </div>

                {/* Activity bars */}
                <div className="relative flex-1 min-h-[36px]" style={{ minWidth: totalDays * dayWidth }}>
                  {asset.activities.map((act) => (
                    <ActivityBar
                      key={act.id}
                      activity={act}
                      viewStart={viewStart}
                      viewEnd={viewEnd}
                      dayWidth={dayWidth}
                      onClick={() => openDynamicPanel({ type: 'detail', module: 'planner', id: act.id, meta: { subtype: 'activity' } })}
                    />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Gantt sub-components ─────────────────────────────────────

function CapacityBar({ current, max }: { current: number; max: number }) {
  const pct = max > 0 ? Math.min(100, Math.round((current / max) * 100)) : 0
  const colorClass = pct > 90 ? 'bg-destructive' : pct > 70 ? 'bg-amber-500' : 'bg-emerald-500'
  return (
    <div className="flex items-center gap-1.5">
      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
        <div className={cn('h-full rounded-full transition-all', colorClass)} style={{ width: `${pct}%` }} />
      </div>
      <span className={cn(
        'text-[9px] tabular-nums font-medium',
        pct > 90 ? 'text-destructive' : pct > 70 ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground',
      )}>
        {current}/{max}
      </span>
    </div>
  )
}

function ActivityBar({ activity, viewStart, viewEnd, dayWidth, onClick }: {
  activity: GanttActivity
  viewStart: string
  viewEnd: string
  dayWidth: number
  onClick: () => void
}) {
  if (!activity.start_date || !activity.end_date) return null

  const barStart = Math.max(0, dayOffset(viewStart, activity.start_date))
  const barEnd = Math.min(daysBetween(viewStart, viewEnd) - 1, dayOffset(viewStart, activity.end_date))
  if (barEnd < barStart) return null

  const left = barStart * dayWidth
  const width = Math.max(dayWidth, (barEnd - barStart + 1) * dayWidth)
  const color = ACTIVITY_TYPE_COLORS[activity.type] || '#94a3b8'
  const status = activity.status

  // Status overlay styles
  const opacity = status === 'draft' ? 0.5 : 1
  const borderStyle = status === 'submitted' ? '2px dashed' : '2px solid'
  const showProgress = status === 'in_progress'

  return (
    <button
      onClick={onClick}
      className="absolute top-1 h-[calc(100%-8px)] rounded-sm cursor-pointer text-white text-[9px] font-medium truncate px-1 flex items-center gap-0.5 hover:brightness-110 transition-all z-10"
      style={{
        left,
        width,
        backgroundColor: color,
        opacity,
        border: borderStyle,
        borderColor: color,
      }}
      title={`${activity.title} (${activity.pax_quota} PAX)`}
    >
      {showProgress && (
        <div className="absolute inset-0 rounded-sm overflow-hidden">
          <div className="h-full bg-white/20 animate-pulse" style={{ width: '40%' }} />
        </div>
      )}
      <span className="relative z-10 truncate">{activity.title}</span>
      <span className="relative z-10 shrink-0 text-[8px] opacity-80">{activity.pax_quota}</span>
    </button>
  )
}

// ── Activities Tab ────────────────────────────────────────────

function ActivitiesTab() {
  const [page, setPage] = useState(1)
  const { pageSize } = usePageSize()
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search, 300)
  const [statusFilter, setStatusFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const openDynamicPanel = useUIStore((s) => s.openDynamicPanel)
  const confirmDialog = useConfirm()
  const promptInput = usePromptInput()
  const deleteActivity = useDeleteActivity()
  const submitActivity = useSubmitActivity()
  const validateActivity = useValidateActivity()
  const rejectActivity = useRejectActivity()
  const cancelActivity = useCancelActivity()
  const { hasPermission } = usePermission()
  const canDelete = hasPermission('planner.activity.delete')
  const canExport = hasPermission('planner.activity.read')
  const activityStatusLabels = useDictionaryLabels('planner_activity_status', ACTIVITY_STATUS_LABELS_FALLBACK)
  const activityTypeLabels = useDictionaryLabels('planner_activity_type', ACTIVITY_TYPE_LABELS_FALLBACK)
  const priorityLabels = useDictionaryLabels('planner_activity_priority', PRIORITY_LABELS_FALLBACK)
  const activityStatusOptions = useMemo(() => buildDictionaryOptions(activityStatusLabels, PLANNER_ACTIVITY_STATUS_VALUES, 'Tous'), [activityStatusLabels])
  const activityTypeOptions = useMemo(() => buildDictionaryOptions(activityTypeLabels, PLANNER_ACTIVITY_TYPE_VALUES), [activityTypeLabels])

  const { data, isLoading } = useActivities({
    page,
    page_size: pageSize,
    search: debouncedSearch || undefined,
    status: statusFilter || undefined,
    type: typeFilter || undefined,
  })

  const items: PlannerActivity[] = data?.items ?? []
  const total = data?.total ?? 0

  const stats = useMemo(() => {
    const submitted = items.filter((a) => a.status === 'submitted').length
    const inProgress = items.filter((a) => a.status === 'in_progress').length
    const validated = items.filter((a) => a.status === 'validated').length
    const totalPax = items.reduce((sum, a) => sum + (a.pax_quota ?? 0), 0)
    return { submitted, inProgress, validated, totalPax }
  }, [items])

  const handleAction = useCallback((e: React.MouseEvent, action: () => void) => {
    e.stopPropagation()
    action()
  }, [])

  const columns = useMemo<ColumnDef<PlannerActivity, unknown>[]>(() => [
    {
      accessorKey: 'title',
      header: 'Titre',
      cell: ({ row }) => (
        <div className="min-w-0">
          <span className="font-medium text-foreground block truncate max-w-[220px]">{row.original.title}</span>
          {row.original.asset_name && row.original.asset_id && (
            <CrossModuleLink module="assets" id={row.original.asset_id} label={row.original.asset_name} showIcon={false} className="text-[10px] block truncate" />
          )}
          {row.original.asset_name && !row.original.asset_id && (
            <span className="text-[10px] text-muted-foreground block truncate">{row.original.asset_name}</span>
          )}
        </div>
      ),
    },
    {
      accessorKey: 'type',
      header: 'Type',
      size: 130,
      cell: ({ row }) => {
        const t = ACTIVITY_TYPE_META[row.original.type]
        const TIcon = t?.icon || ListTodo
        return (
          <span className={cn('gl-badge inline-flex items-center gap-1', t?.badge || 'gl-badge-neutral')}>
            <TIcon size={10} />
            {activityTypeLabels[row.original.type] || row.original.type}
          </span>
        )
      },
    },
    {
      accessorKey: 'priority',
      header: 'Priorité',
      size: 90,
      cell: ({ row }) => <span className={cn('text-xs font-medium', PRIORITY_CLASS_MAP[row.original.priority] || 'text-muted-foreground')}>{priorityLabels[row.original.priority] || row.original.priority}</span>,
    },
    {
      accessorKey: 'pax_quota',
      header: 'PAX',
      size: 60,
      cell: ({ row }) => (
        <span className="inline-flex items-center gap-1 text-xs">
          <Users size={11} className="text-muted-foreground" />
          {row.original.pax_quota}
        </span>
      ),
    },
    {
      accessorKey: 'start_date',
      header: 'Debut',
      size: 100,
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground tabular-nums whitespace-nowrap">
          {formatDateShort(row.original.start_date)}
        </span>
      ),
    },
    {
      accessorKey: 'end_date',
      header: 'Fin',
      size: 100,
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground tabular-nums whitespace-nowrap">
          {formatDateShort(row.original.end_date)}
        </span>
      ),
    },
    {
      accessorKey: 'status',
      header: 'Statut',
      size: 110,
      cell: ({ row }) => <StatusBadge status={row.original.status} labels={activityStatusLabels} badges={ACTIVITY_STATUS_BADGES} />,
    },
    {
      id: 'actions',
      header: '',
      size: 120,
      cell: ({ row }) => {
        const s = row.original.status
        return (
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            {s === 'draft' && (
              <button
                className="p-1 rounded hover:bg-primary/10 text-muted-foreground hover:text-primary"
                onClick={(e) => handleAction(e, () => submitActivity.mutate(row.original.id))}
                title="Soumettre"
              >
                <Send size={12} />
              </button>
            )}
            {s === 'submitted' && (
              <>
                <button
                  className="p-1 rounded hover:bg-emerald-500/10 text-muted-foreground hover:text-emerald-600"
                  onClick={(e) => handleAction(e, () => validateActivity.mutate(row.original.id))}
                  title="Valider"
                >
                  <CheckCircle2 size={12} />
                </button>
                <button
                  className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                  onClick={(e) => handleAction(e, async () => {
                    const reason = await promptInput({ title: 'Rejeter l\'activité', placeholder: 'Motif du rejet...' })
                    if (reason !== null) rejectActivity.mutate({ id: row.original.id, reason })
                  })}
                  title="Rejeter"
                >
                  <XCircle size={12} />
                </button>
              </>
            )}
            {!['completed', 'cancelled'].includes(s) && (
              <button
                className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                onClick={(e) => handleAction(e, async () => {
                  const ok = await confirmDialog({ title: 'Annuler ?', message: 'Annuler cette activité ?', confirmLabel: 'Annuler', variant: 'warning' })
                  if (ok) cancelActivity.mutate(row.original.id)
                })}
                title="Annuler"
              >
                <Ban size={12} />
              </button>
            )}
            {canDelete && (
              <button
                className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                onClick={(e) => handleAction(e, async () => {
                  const ok = await confirmDialog({ title: 'Supprimer ?', message: 'Supprimer cette activité ?', confirmLabel: 'Supprimer', variant: 'danger' })
                  if (ok) deleteActivity.mutate(row.original.id)
                })}
                title="Supprimer"
              >
                <span className="text-xs">&times;</span>
              </button>
            )}
          </div>
        )
      },
    },
  ], [activityStatusLabels, activityTypeLabels, canDelete, cancelActivity, deleteActivity, handleAction, priorityLabels, rejectActivity, submitActivity, validateActivity])

  return (
    <>
      {/* Stats grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 px-4 py-3 border-b border-border">
        <StatCard label="Total" value={total} icon={ListTodo} />
        <StatCard label="En attente validation" value={stats.submitted} icon={Clock} accent="text-blue-600 dark:text-blue-400" />
        <StatCard label="En cours" value={stats.inProgress} icon={CalendarRange} accent="text-amber-600 dark:text-amber-400" />
        <StatCard label="PAX planifies" value={stats.totalPax} icon={Users} />
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-2 border-b border-border px-3.5 h-9 shrink-0">
        <div className="flex items-center gap-1 overflow-x-auto">
          {activityStatusOptions.map((opt) => (
            <button
              key={opt.value}
              onClick={() => { setStatusFilter(opt.value); setPage(1) }}
              className={cn(
                'px-2 py-0.5 rounded text-xs font-medium transition-colors whitespace-nowrap',
                statusFilter === opt.value ? 'bg-primary/[0.16] text-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <select
          value={typeFilter}
          onChange={(e) => { setTypeFilter(e.target.value); setPage(1) }}
          className="h-6 px-1.5 text-xs border border-border rounded bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary ml-1"
        >
          <option value="">Tous types</option>
          {activityTypeOptions.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
        {data && <span className="text-xs text-muted-foreground ml-auto shrink-0">{total} activites</span>}
      </div>

      <PanelContent>
        <DataTable<PlannerActivity>
          columns={columns}
          data={items}
          isLoading={isLoading}
          pagination={data ? { page: data.page, pageSize, total: data.total, pages: data.pages } : undefined}
          onPaginationChange={(p) => setPage(p)}
          searchValue={search}
          onSearchChange={(v) => { setSearch(v); setPage(1) }}
          searchPlaceholder="Rechercher par titre..."
          onRowClick={(row) => openDynamicPanel({ type: 'detail', module: 'planner', id: row.id, meta: { subtype: 'activity' } })}
          emptyIcon={ListTodo}
          emptyTitle="Aucune activite"
          importExport={canExport ? {
            exportFormats: ['csv', 'xlsx'],
            advancedExport: true,
            filenamePrefix: 'planning',
            exportHeaders: {
              title: 'Titre',
              type: 'Type',
              priority: 'Priorité',
              pax_quota: 'PAX',
              start_date: 'Debut',
              end_date: 'Fin',
              status: 'Statut',
            },
          } : undefined}
          storageKey="planner-activities"
        />
      </PanelContent>
    </>
  )
}

// ── Conflicts Tab ─────────────────────────────────────────────

function ConflitsTab() {
  const { t } = useTranslation()
  const [page, setPage] = useState(1)
  const { pageSize } = usePageSize()
  const [statusFilter, setStatusFilter] = useState('')
  const [expandedRevisionSignalId, setExpandedRevisionSignalId] = useState<string | null>(null)
  const [requestDecisionModal, setRequestDecisionModal] = useState<PlannerRevisionSignal | null>(null)
  const [requestDecisionNote, setRequestDecisionNote] = useState('')
  const [requestDecisionDueAt, setRequestDecisionDueAt] = useState('')
  const [requestDecisionPaxQuota, setRequestDecisionPaxQuota] = useState('')
  const [requestDecisionStartDate, setRequestDecisionStartDate] = useState('')
  const [requestDecisionEndDate, setRequestDecisionEndDate] = useState('')
  const [requestDecisionStatus, setRequestDecisionStatus] = useState('')
  const [respondDecisionModal, setRespondDecisionModal] = useState<PlannerRevisionDecisionRequest | null>(null)
  const [respondDecisionMode, setRespondDecisionMode] = useState<'accepted' | 'counter_proposed'>('accepted')
  const [respondDecisionNote, setRespondDecisionNote] = useState('')
  const [respondDecisionPaxQuota, setRespondDecisionPaxQuota] = useState('')
  const [respondDecisionStartDate, setRespondDecisionStartDate] = useState('')
  const [respondDecisionEndDate, setRespondDecisionEndDate] = useState('')
  const [respondDecisionStatus, setRespondDecisionStatus] = useState('')
  const resolveConflict = useResolveConflict()
  const acknowledgeRevisionSignal = useAcknowledgeRevisionSignal()
  const requestRevisionDecision = useRequestRevisionDecision()
  const respondRevisionDecisionRequest = useRespondRevisionDecisionRequest()
  const forceRevisionDecisionRequest = useForceRevisionDecisionRequest()
  const { data: revisionSignalsData, isLoading: revisionSignalsLoading } = useRevisionSignals({ page: 1, page_size: 6 })
  const { data: incomingRevisionRequestsData, isLoading: incomingRevisionRequestsLoading } = useRevisionDecisionRequests({ page: 1, page_size: 6, direction: 'incoming', status: 'pending' })
  const { data: outgoingRevisionRequestsData, isLoading: outgoingRevisionRequestsLoading } = useRevisionDecisionRequests({ page: 1, page_size: 6, direction: 'outgoing', status: 'all' })
  const { data: revisionImpactSummary, isLoading: revisionImpactLoading } = useRevisionSignalImpactSummary(expandedRevisionSignalId ?? undefined)
  const conflictStatusLabels = useDictionaryLabels('planner_conflict_status', CONFLICT_STATUS_LABELS_FALLBACK)
  const resolutionLabels = useDictionaryLabels('planner_conflict_resolution', RESOLUTION_LABELS_FALLBACK)
  const conflictStatusOptions = useMemo(() => buildDictionaryOptions(conflictStatusLabels, PLANNER_CONFLICT_STATUS_VALUES, 'Tous'), [conflictStatusLabels])
  const resolutionOptions = useMemo(() => buildDictionaryOptions(resolutionLabels, PLANNER_RESOLUTION_VALUES), [resolutionLabels])

  const { data, isLoading } = useConflicts({
    page,
    page_size: pageSize,
    status: statusFilter || undefined,
  })

  const items: PlannerConflict[] = data?.items ?? []
  const revisionSignals: PlannerRevisionSignal[] = revisionSignalsData?.items ?? []
  const incomingRevisionRequests: PlannerRevisionDecisionRequest[] = incomingRevisionRequestsData?.items ?? []
  const outgoingRevisionRequests: PlannerRevisionDecisionRequest[] = outgoingRevisionRequestsData?.items ?? []
  const total = data?.total ?? 0

  const stats = useMemo(() => {
    const open = items.filter((c) => c.status === 'open').length
    const resolved = items.filter((c) => c.status === 'resolved').length
    const deferred = items.filter((c) => c.status === 'deferred').length
    return { open, resolved, deferred }
  }, [items])

  const [resolveModal, setResolveModal] = useState<string | null>(null)
  const [resolution, setResolution] = useState('')
  const [resolutionNote, setResolutionNote] = useState('')
  const { data: conflictAudit, isLoading: conflictAuditLoading } = useConflictAudit(resolveModal ?? undefined)

  const handleResolve = useCallback(() => {
    if (!resolveModal || !resolution) return
    resolveConflict.mutate(
      { id: resolveModal, payload: { resolution, resolution_note: resolutionNote || undefined } },
      { onSuccess: () => { setResolveModal(null); setResolution(''); setResolutionNote('') } },
    )
  }, [resolveModal, resolution, resolutionNote, resolveConflict])

  const handleRequestDecision = useCallback(() => {
    if (!requestDecisionModal) return
    requestRevisionDecision.mutate(
      {
        signalId: requestDecisionModal.id,
        payload: {
          note: requestDecisionNote || undefined,
          due_at: requestDecisionDueAt ? new Date(requestDecisionDueAt).toISOString() : undefined,
          proposed_pax_quota: requestDecisionPaxQuota ? Number(requestDecisionPaxQuota) : undefined,
          proposed_start_date: requestDecisionStartDate ? new Date(requestDecisionStartDate).toISOString() : undefined,
          proposed_end_date: requestDecisionEndDate ? new Date(requestDecisionEndDate).toISOString() : undefined,
          proposed_status: requestDecisionStatus || undefined,
        },
      },
      {
        onSuccess: () => {
          setRequestDecisionModal(null)
          setRequestDecisionNote('')
          setRequestDecisionDueAt('')
          setRequestDecisionPaxQuota('')
          setRequestDecisionStartDate('')
          setRequestDecisionEndDate('')
          setRequestDecisionStatus('')
        },
      },
    )
  }, [requestDecisionDueAt, requestDecisionEndDate, requestDecisionModal, requestDecisionNote, requestDecisionPaxQuota, requestDecisionStartDate, requestDecisionStatus, requestRevisionDecision])

  const handleRespondDecision = useCallback(() => {
    if (!respondDecisionModal) return
    respondRevisionDecisionRequest.mutate(
      {
        requestId: respondDecisionModal.id,
        payload: {
          response: respondDecisionMode,
          response_note: respondDecisionNote || undefined,
          counter_pax_quota: respondDecisionMode === 'counter_proposed' && respondDecisionPaxQuota
            ? Number(respondDecisionPaxQuota)
            : undefined,
          counter_start_date: respondDecisionMode === 'counter_proposed' && respondDecisionStartDate
            ? new Date(respondDecisionStartDate).toISOString()
            : undefined,
          counter_end_date: respondDecisionMode === 'counter_proposed' && respondDecisionEndDate
            ? new Date(respondDecisionEndDate).toISOString()
            : undefined,
          counter_status: respondDecisionMode === 'counter_proposed'
            ? (respondDecisionStatus || undefined)
            : undefined,
        },
      },
      {
        onSuccess: () => {
          setRespondDecisionModal(null)
          setRespondDecisionMode('accepted')
          setRespondDecisionNote('')
          setRespondDecisionPaxQuota('')
          setRespondDecisionStartDate('')
          setRespondDecisionEndDate('')
          setRespondDecisionStatus('')
        },
      },
    )
  }, [respondDecisionEndDate, respondDecisionMode, respondDecisionModal, respondDecisionNote, respondDecisionPaxQuota, respondDecisionStartDate, respondDecisionStatus, respondRevisionDecisionRequest])

  const columns = useMemo<ColumnDef<PlannerConflict, unknown>[]>(() => [
    {
      accessorKey: 'asset_name',
      header: 'Site',
      cell: ({ row }) => row.original.asset_id
        ? <CrossModuleLink module="assets" id={row.original.asset_id} label={row.original.asset_name || row.original.asset_id} showIcon={false} className="font-medium" />
        : <span className="font-medium text-foreground">{row.original.asset_name || '—'}</span>,
    },
    {
      accessorKey: 'conflict_date',
      header: 'Date conflit',
      size: 120,
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground tabular-nums whitespace-nowrap">
          {formatDateShort(row.original.conflict_date)}
        </span>
      ),
    },
    {
      id: 'activities',
      header: 'Activites impliquees',
      cell: ({ row }) => (
        <div className="flex flex-col gap-0.5 max-w-[250px]">
          {row.original.activity_titles.length > 0 ? (
            row.original.activity_titles.map((title, i) => (
              <span key={i} className="text-xs text-muted-foreground truncate block">{title}</span>
            ))
          ) : (
            <span className="text-xs text-muted-foreground">{row.original.activity_ids.length} activite(s)</span>
          )}
        </div>
      ),
    },
    {
      accessorKey: 'resolution',
      header: 'Resolution',
      size: 140,
      cell: ({ row }) => {
        if (!row.original.resolution) return <span className="text-xs text-muted-foreground">{'—'}</span>
        return <span className="text-xs text-muted-foreground">{resolutionLabels[row.original.resolution] || row.original.resolution}</span>
      },
    },
    {
      accessorKey: 'status',
      header: 'Statut',
      size: 100,
      cell: ({ row }) => <StatusBadge status={row.original.status} labels={conflictStatusLabels} badges={CONFLICT_STATUS_BADGES} />,
    },
    {
      id: 'actions',
      header: '',
      size: 80,
          cell: ({ row }) => {
        if (row.original.status !== 'open') return null
        return (
          <button
            className="gl-button-sm gl-button-default text-xs"
            onClick={(e) => {
              e.stopPropagation()
              setResolveModal(row.original.id)
            }}
            disabled={resolveConflict.isPending}
          >
            {t('planner.resolve_conflict_action')}
          </button>
        )
      },
    },
  ], [conflictStatusLabels, resolutionLabels, resolveConflict.isPending, t])

  return (
    <>
      {/* Stats grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 px-4 py-3 border-b border-border">
        <StatCard label="Total conflits" value={total} icon={AlertTriangle} />
        <StatCard label="Ouverts" value={stats.open} icon={AlertTriangle} accent="text-destructive" />
        <StatCard label="Resolus" value={stats.resolved} icon={CheckCircle2} accent="text-emerald-600 dark:text-emerald-400" />
        <StatCard label="Differes" value={stats.deferred} icon={Clock} accent="text-amber-600 dark:text-amber-400" />
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-2 border-b border-border px-3.5 h-9 shrink-0">
        <div className="flex items-center gap-1 overflow-x-auto">
          {conflictStatusOptions.map((opt) => (
            <button
              key={opt.value}
              onClick={() => { setStatusFilter(opt.value); setPage(1) }}
              className={cn(
                'px-2 py-0.5 rounded text-xs font-medium transition-colors whitespace-nowrap',
                statusFilter === opt.value ? 'bg-primary/[0.16] text-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
        {data && <span className="text-xs text-muted-foreground ml-auto shrink-0">{total} conflits</span>}
      </div>

      <div className="border-b border-border px-4 py-3">
        <div className="rounded-lg border border-border bg-background p-3">
          <div className="mb-2 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('planner.revision_signals.title')}</p>
              <p className="text-xs text-muted-foreground">{t('planner.revision_signals.description')}</p>
            </div>
            <span className="gl-badge gl-badge-info">{revisionSignals.length}</span>
          </div>
          <div className="space-y-2">
            {revisionSignalsLoading && <p className="text-xs text-muted-foreground">{t('common.loading')}</p>}
            {!revisionSignalsLoading && revisionSignals.length === 0 && (
              <p className="text-xs italic text-muted-foreground">{t('planner.revision_signals.empty')}</p>
            )}
            {revisionSignals.map((signal) => (
              <div key={signal.id} className="rounded-md border border-border bg-muted/30 px-3 py-2">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">
                      {signal.project_code || t('planner.revision_signals.project_fallback')} · {signal.task_title || t('planner.revision_signals.task_fallback')}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {t('planner.revision_signals.summary', {
                        fields: (signal.changed_fields ?? []).join(', ') || t('planner.revision_signals.critical_fields'),
                        count: signal.planner_activity_count,
                      })}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {signal.actor_name || t('planner.revision_signals.actor_fallback')} · {formatDateShort(signal.created_at)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      className="gl-button-sm gl-button-default text-xs"
                      onClick={() => setRequestDecisionModal(signal)}
                    >
                      {t('planner.revision_signals.request_decision')}
                    </button>
                    <button
                      type="button"
                      className="gl-button-sm gl-button-default text-xs"
                      onClick={() => setExpandedRevisionSignalId((prev) => prev === signal.id ? null : signal.id)}
                    >
                      {expandedRevisionSignalId === signal.id
                        ? t('planner.revision_signals.hide_impact')
                        : t('planner.revision_signals.show_impact')}
                    </button>
                    {signal.project_id && (
                      <CrossModuleLink
                        module="projets"
                        id={signal.project_id}
                        label={signal.project_code || t('planner.revision_signals.open_project')}
                        className="text-xs"
                      />
                    )}
                    <button
                      type="button"
                      className="gl-button-sm gl-button-default text-xs"
                      onClick={() => acknowledgeRevisionSignal.mutate(signal.id)}
                      disabled={acknowledgeRevisionSignal.isPending}
                    >
                      {t('planner.revision_signals.acknowledge')}
                    </button>
                  </div>
                </div>
                {expandedRevisionSignalId === signal.id && (
                  <div className="mt-3 rounded-md border border-border bg-background/80 p-3">
                    {revisionImpactLoading && (
                      <p className="text-xs text-muted-foreground">{t('common.loading')}</p>
                    )}
                    {!revisionImpactLoading && revisionImpactSummary && (
                      <div className="space-y-2">
                        <div className="grid gap-2 md:grid-cols-3">
                          <div className="rounded border border-border px-2 py-1.5 text-xs">
                            <span className="text-muted-foreground">{t('planner.revision_signals.ads_affected')}</span>
                            <div className="font-semibold tabular-nums">{revisionImpactSummary.total_ads_affected}</div>
                          </div>
                          <div className="rounded border border-border px-2 py-1.5 text-xs">
                            <span className="text-muted-foreground">{t('planner.revision_signals.manifests_affected')}</span>
                            <div className="font-semibold tabular-nums">{revisionImpactSummary.total_manifests_affected}</div>
                          </div>
                          <div className="rounded border border-border px-2 py-1.5 text-xs">
                            <span className="text-muted-foreground">{t('planner.revision_signals.open_conflict_days')}</span>
                            <div className="font-semibold tabular-nums">{revisionImpactSummary.total_open_conflict_days}</div>
                          </div>
                        </div>
                        <div className="space-y-1">
                          {revisionImpactSummary.activities.map((activity) => (
                            <div key={activity.activity_id} className="rounded border border-border px-2 py-1.5 text-xs">
                              <p className="font-medium text-foreground">{activity.activity_title || activity.activity_id}</p>
                              <p className="text-muted-foreground">
                                {t('planner.revision_signals.impact_activity_summary', {
                                  ads: activity.ads_affected,
                                  manifests: activity.manifests_affected,
                                  conflicts: activity.open_conflict_days,
                                })}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="border-b border-border px-4 py-3">
        <div className="grid gap-3 lg:grid-cols-2">
          <div className="rounded-lg border border-border bg-background p-3">
            <div className="mb-2 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('planner.revision_requests.incoming_title')}</p>
                <p className="text-xs text-muted-foreground">{t('planner.revision_requests.incoming_description')}</p>
              </div>
              <span className="gl-badge gl-badge-info">{incomingRevisionRequests.length}</span>
            </div>
            <div className="space-y-2">
              {incomingRevisionRequestsLoading && <p className="text-xs text-muted-foreground">{t('common.loading')}</p>}
              {!incomingRevisionRequestsLoading && incomingRevisionRequests.length === 0 && (
                <p className="text-xs italic text-muted-foreground">{t('planner.revision_requests.empty_incoming')}</p>
              )}
              {incomingRevisionRequests.map((item) => (
                <div key={item.id} className="rounded border border-border bg-muted/20 px-3 py-2">
                  <p className="text-sm font-medium text-foreground">{item.project_code || t('planner.revision_signals.project_fallback')} · {item.task_title || t('planner.revision_signals.task_fallback')}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {item.requester_user_name || t('planner.revision_signals.actor_fallback')}
                    {item.due_at ? ` · ${t('planner.revision_requests.due_at')} ${formatDateShort(item.due_at)}` : ''}
                  </p>
                  {(item.proposed_start_date || item.proposed_end_date || item.proposed_pax_quota != null || item.proposed_status) && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t('planner.revision_requests.proposed_summary', {
                        start: item.proposed_start_date ? formatDateShort(item.proposed_start_date) : '—',
                        end: item.proposed_end_date ? formatDateShort(item.proposed_end_date) : '—',
                        pax: item.proposed_pax_quota ?? '—',
                        status: item.proposed_status || '—',
                      })}
                    </p>
                  )}
                  {item.note && <p className="mt-1 text-xs text-muted-foreground">{item.note}</p>}
                  <div className="mt-2 flex items-center gap-2">
                    <button
                      type="button"
                      className="gl-button-sm gl-button-confirm text-xs"
                      onClick={() => {
                        setRespondDecisionModal(item)
                        setRespondDecisionMode('accepted')
                        setRespondDecisionNote('')
                        setRespondDecisionPaxQuota('')
                        setRespondDecisionStartDate('')
                        setRespondDecisionEndDate('')
                        setRespondDecisionStatus('')
                      }}
                    >
                      {t('planner.revision_requests.accept')}
                    </button>
                    <button
                      type="button"
                      className="gl-button-sm gl-button-default text-xs"
                      onClick={() => {
                        setRespondDecisionModal(item)
                        setRespondDecisionMode('counter_proposed')
                        setRespondDecisionNote(item.response_note || '')
                        setRespondDecisionPaxQuota(item.counter_pax_quota != null ? String(item.counter_pax_quota) : '')
                        setRespondDecisionStartDate(item.counter_start_date ? item.counter_start_date.slice(0, 16) : '')
                        setRespondDecisionEndDate(item.counter_end_date ? item.counter_end_date.slice(0, 16) : '')
                        setRespondDecisionStatus(item.counter_status || item.proposed_status || '')
                      }}
                    >
                      {t('planner.revision_requests.counter_propose')}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-border bg-background p-3">
            <div className="mb-2 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('planner.revision_requests.outgoing_title')}</p>
                <p className="text-xs text-muted-foreground">{t('planner.revision_requests.outgoing_description')}</p>
              </div>
              <span className="gl-badge gl-badge-info">{outgoingRevisionRequests.length}</span>
            </div>
            <div className="space-y-2">
              {outgoingRevisionRequestsLoading && <p className="text-xs text-muted-foreground">{t('common.loading')}</p>}
              {!outgoingRevisionRequestsLoading && outgoingRevisionRequests.length === 0 && (
                <p className="text-xs italic text-muted-foreground">{t('planner.revision_requests.empty_outgoing')}</p>
              )}
              {outgoingRevisionRequests.map((item) => (
                <div key={item.id} className="rounded border border-border bg-muted/20 px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">{item.project_code || t('planner.revision_signals.project_fallback')} · {item.task_title || t('planner.revision_signals.task_fallback')}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {item.target_user_name || t('planner.revision_signals.actor_fallback')}
                        {item.due_at ? ` · ${t('planner.revision_requests.due_at')} ${formatDateShort(item.due_at)}` : ''}
                      </p>
                    </div>
                    <span className="gl-badge gl-badge-default">{t(`planner.revision_requests.status_${item.status}`)}</span>
                  </div>
                  {(item.response_note || item.forced_reason) && (
                    <p className="mt-1 text-xs text-muted-foreground">{item.response_note || item.forced_reason}</p>
                  )}
                  {item.application_result && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {item.application_result.task_requires_manual_breakdown
                        ? t('planner.revision_requests.application_manual_breakdown')
                        : t('planner.revision_requests.application_summary', {
                          task: item.application_result.applied_to_task ? t('common.yes') : t('common.no'),
                          activities: item.application_result.applied_activity_count ?? 0,
                        })}
                    </p>
                  )}
                  {(item.counter_start_date || item.counter_end_date || item.counter_pax_quota != null || item.counter_status) && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t('planner.revision_requests.counter_summary', {
                        start: item.counter_start_date ? formatDateShort(item.counter_start_date) : '—',
                        end: item.counter_end_date ? formatDateShort(item.counter_end_date) : '—',
                        pax: item.counter_pax_quota ?? '—',
                        status: item.counter_status || '—',
                      })}
                    </p>
                  )}
                  {item.status === 'pending' && (
                    <div className="mt-2">
                      <button
                        type="button"
                        className="gl-button-sm gl-button-default text-xs"
                        onClick={() => forceRevisionDecisionRequest.mutate({ requestId: item.id })}
                        disabled={forceRevisionDecisionRequest.isPending}
                      >
                        {t('planner.revision_requests.force')}
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <PanelContent>
        <DataTable<PlannerConflict>
          columns={columns}
          data={items}
          isLoading={isLoading}
          pagination={data ? { page: data.page, pageSize, total: data.total, pages: data.pages } : undefined}
          onPaginationChange={(p) => setPage(p)}
          emptyIcon={AlertTriangle}
          emptyTitle={t('planner.no_conflict')}
          storageKey="planner-conflicts"
        />
      </PanelContent>

      {/* Resolve conflict modal */}
      {resolveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setResolveModal(null)}>
          <div className="bg-background rounded-lg border border-border shadow-lg w-full max-w-md p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-foreground">{t('planner.resolve_conflict_title')}</h3>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">{t('planner.resolve_conflict_field')}</label>
              <select
                value={resolution}
                onChange={(e) => setResolution(e.target.value)}
                className="w-full h-8 px-2 text-sm border border-border rounded bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="">{t('planner.resolve_conflict_placeholder')}</option>
                {resolutionOptions.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div>
              <div className="mb-1 flex items-center justify-between gap-2">
                <label className="text-xs font-medium text-muted-foreground">{t('planner.resolve_conflict_history')}</label>
                {conflictAuditLoading && <span className="text-[11px] text-muted-foreground">{t('common.loading')}</span>}
              </div>
              <div className="max-h-40 space-y-2 overflow-y-auto rounded border border-border bg-muted/20 p-2">
                {!conflictAuditLoading && (!conflictAudit || conflictAudit.length === 0) && (
                  <p className="text-xs italic text-muted-foreground">{t('planner.resolve_conflict_history_empty')}</p>
                )}
                {(conflictAudit ?? []).map((entry) => (
                  <div key={entry.id} className="rounded border border-border bg-background px-2 py-1.5 text-xs">
                    <p className="font-medium text-foreground">
                      {(entry.actor_name || t('planner.revision_signals.actor_fallback'))} · {formatDateShort(entry.created_at)}
                    </p>
                    <p className="text-muted-foreground">
                      {entry.new_resolution
                        ? `${resolutionLabels[entry.new_resolution] || entry.new_resolution}`
                        : (entry.action || '—')}
                    </p>
                    {entry.resolution_note && (
                      <p className="mt-1 text-muted-foreground">{entry.resolution_note}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">{t('planner.resolve_conflict_note')}</label>
              <textarea
                value={resolutionNote}
                onChange={(e) => setResolutionNote(e.target.value)}
                className="w-full min-h-[60px] px-2 py-1.5 text-sm border border-border rounded bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                placeholder={t('planner.resolve_conflict_note_placeholder')}
              />
            </div>
            <div className="flex items-center gap-2 justify-end">
              <button className="gl-button-sm gl-button-default" onClick={() => setResolveModal(null)}>{t('common.cancel')}</button>
              <button
                className="gl-button-sm gl-button-confirm"
                onClick={handleResolve}
                disabled={!resolution || resolveConflict.isPending}
              >
                {resolveConflict.isPending ? <Loader2 size={12} className="animate-spin" /> : t('planner.confirm_resolution')}
              </button>
            </div>
          </div>
        </div>
      )}

      {requestDecisionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setRequestDecisionModal(null)}>
          <div className="bg-background rounded-lg border border-border shadow-lg w-full max-w-md p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-foreground">{t('planner.revision_requests.request_title')}</h3>
            <p className="text-xs text-muted-foreground">
              {requestDecisionModal.project_code || t('planner.revision_signals.project_fallback')} · {requestDecisionModal.task_title || t('planner.revision_signals.task_fallback')}
            </p>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">{t('planner.revision_requests.note')}</label>
              <textarea
                value={requestDecisionNote}
                onChange={(e) => setRequestDecisionNote(e.target.value)}
                className="w-full min-h-[72px] px-2 py-1.5 text-sm border border-border rounded bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                placeholder={t('planner.revision_requests.note_placeholder')}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">{t('planner.revision_requests.due_at_label')}</label>
                <input
                  type="datetime-local"
                  value={requestDecisionDueAt}
                  onChange={(e) => setRequestDecisionDueAt(e.target.value)}
                  className={panelInputClass}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">{t('planner.revision_requests.proposed_pax')}</label>
                <input
                  type="number"
                  min={0}
                  value={requestDecisionPaxQuota}
                  onChange={(e) => setRequestDecisionPaxQuota(e.target.value)}
                  className={panelInputClass}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">{t('planner.revision_requests.proposed_start')}</label>
                <input
                  type="datetime-local"
                  value={requestDecisionStartDate}
                  onChange={(e) => setRequestDecisionStartDate(e.target.value)}
                  className={panelInputClass}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">{t('planner.revision_requests.proposed_end')}</label>
                <input
                  type="datetime-local"
                  value={requestDecisionEndDate}
                  onChange={(e) => setRequestDecisionEndDate(e.target.value)}
                  className={panelInputClass}
                />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">{t('planner.revision_requests.proposed_status')}</label>
              <select
                value={requestDecisionStatus}
                onChange={(e) => setRequestDecisionStatus(e.target.value)}
                className="w-full h-8 px-2 text-sm border border-border rounded bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="">{t('planner.resolve_conflict_placeholder')}</option>
                {PLANNER_ACTIVITY_STATUS_VALUES.map((status) => (
                  <option key={status} value={status}>{status}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2 justify-end">
              <button className="gl-button-sm gl-button-default" onClick={() => setRequestDecisionModal(null)}>{t('common.cancel')}</button>
              <button
                className="gl-button-sm gl-button-confirm"
                onClick={handleRequestDecision}
                disabled={requestRevisionDecision.isPending}
              >
                {requestRevisionDecision.isPending ? <Loader2 size={12} className="animate-spin" /> : t('planner.revision_requests.send_request')}
              </button>
            </div>
          </div>
        </div>
      )}

      {respondDecisionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setRespondDecisionModal(null)}>
          <div className="bg-background rounded-lg border border-border shadow-lg w-full max-w-md p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-foreground">{t('planner.revision_requests.respond_title')}</h3>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">{t('planner.revision_requests.response')}</label>
              <select
                value={respondDecisionMode}
                onChange={(e) => setRespondDecisionMode(e.target.value as 'accepted' | 'counter_proposed')}
                className="w-full h-8 px-2 text-sm border border-border rounded bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="accepted">{t('planner.revision_requests.accept')}</option>
                <option value="counter_proposed">{t('planner.revision_requests.counter_propose')}</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">{t('planner.revision_requests.note')}</label>
              <textarea
                value={respondDecisionNote}
                onChange={(e) => setRespondDecisionNote(e.target.value)}
                className="w-full min-h-[72px] px-2 py-1.5 text-sm border border-border rounded bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                placeholder={t('planner.revision_requests.response_note_placeholder')}
              />
            </div>
            {respondDecisionMode === 'counter_proposed' && (
              <>
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1">{t('planner.revision_requests.counter_pax')}</label>
                  <input
                    type="number"
                    min={0}
                    value={respondDecisionPaxQuota}
                    onChange={(e) => setRespondDecisionPaxQuota(e.target.value)}
                    className={panelInputClass}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground block mb-1">{t('planner.revision_requests.counter_start')}</label>
                    <input
                      type="datetime-local"
                      value={respondDecisionStartDate}
                      onChange={(e) => setRespondDecisionStartDate(e.target.value)}
                      className={panelInputClass}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground block mb-1">{t('planner.revision_requests.counter_end')}</label>
                    <input
                      type="datetime-local"
                      value={respondDecisionEndDate}
                      onChange={(e) => setRespondDecisionEndDate(e.target.value)}
                      className={panelInputClass}
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1">{t('planner.revision_requests.counter_status')}</label>
                  <select
                    value={respondDecisionStatus}
                    onChange={(e) => setRespondDecisionStatus(e.target.value)}
                    className="w-full h-8 px-2 text-sm border border-border rounded bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    <option value="">{t('planner.resolve_conflict_placeholder')}</option>
                    {PLANNER_ACTIVITY_STATUS_VALUES.map((status) => (
                      <option key={status} value={status}>{status}</option>
                    ))}
                  </select>
                </div>
              </>
            )}
            <div className="flex items-center gap-2 justify-end">
              <button className="gl-button-sm gl-button-default" onClick={() => setRespondDecisionModal(null)}>{t('common.cancel')}</button>
              <button
                className="gl-button-sm gl-button-confirm"
                onClick={handleRespondDecision}
                disabled={respondRevisionDecisionRequest.isPending}
              >
                {respondRevisionDecisionRequest.isPending ? <Loader2 size={12} className="animate-spin" /> : t('planner.confirm_resolution')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// ── Capacity Tab ──────────────────────────────────────────────

function CapacityTab({
  timelineScale,
  timelineStartDate,
  timelineEndDate,
  onTimelineScaleChange,
  onTimelineRangeChange,
  compact: _compact = false,
}: {
  timelineScale: TimeScale
  timelineStartDate: string
  timelineEndDate: string
  onTimelineScaleChange: (scale: TimeScale) => void
  onTimelineRangeChange: (from: string, to: string) => void
  compact?: boolean
}) {
  const { t } = useTranslation()
  const [assetId, setAssetId] = useState('')
  const [expandedFieldIds, setExpandedFieldIds] = useState<Set<string>>(new Set())
  const [expandedSiteIds, setExpandedSiteIds] = useState<Set<string>>(new Set())
  const dateRange_ = useMemo(() => ({ from: timelineStartDate, to: timelineEndDate }), [timelineEndDate, timelineStartDate])

  // Heatmap data
  const { data: heatmapData, isLoading: heatmapLoading } = useCapacityHeatmap(
    dateRange_.from,
    dateRange_.to,
    assetId || undefined,
  )
  const { data: assetHierarchy = [] } = useAssetHierarchy()

  // Asset capacity history
  const { data: capacityHistory } = useAssetCapacities(assetId || undefined)

  // Modify capacity modal
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
          toast({ title: 'Capacite mise a jour', variant: 'success' })
          setShowCapModal(false)
          setCapForm({ max_pax_total: 0, permanent_ops_quota: 0, reason: '' })
        },
        onError: () => toast({ title: 'Erreur lors de la mise a jour', variant: 'error' }),
      },
    )
  }, [assetId, capForm, createAssetCapacity, toast])

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
              Modifier capacite
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
          <div className="flex flex-col items-center justify-center h-full min-h-[300px] text-center px-6">
            <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
              <BarChart3 size={24} className="text-primary" />
            </div>
            <h3 className="text-base font-semibold text-foreground mb-1">
              {assetId ? t('planner.capacity.empty_title') : t('planner.capacity.empty_idle_title')}
            </h3>
            <p className="text-sm text-muted-foreground max-w-sm">
              {assetId
                ? t('planner.capacity.empty_description')
                : t('planner.capacity.empty_idle_description')}
            </p>
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
                    <span>Modifie par</span>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowCapModal(false)}>
          <div className="bg-background rounded-lg border border-border shadow-lg w-full max-w-md p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-foreground">Modifier la capacite</h3>
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
              <button className="gl-button-sm gl-button-default" onClick={() => setShowCapModal(false)}>Annuler</button>
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

// ── Main page component ───────────────────────────────────────

// ── Scenarios Tab (what-if simulation) ──────────────────────────────────

function ScenariosTab() {
  const simulate = useSimulateScenario()
  const { toast } = useToast()
  const [proposed, setProposed] = useState<ProposedActivity[]>([])
  const [result, setResult] = useState<ScenarioResult | null>(null)
  const [form, setForm] = useState({ asset_id: '', pax_quota: '', start_date: '', end_date: '', title: '' })

  const handleAdd = () => {
    if (!form.asset_id || !form.pax_quota || !form.start_date || !form.end_date) return
    setProposed(prev => [...prev, {
      asset_id: form.asset_id,
      pax_quota: Number(form.pax_quota),
      start_date: form.start_date,
      end_date: form.end_date,
      title: form.title || undefined,
    }])
    setForm(f => ({ ...f, pax_quota: '', start_date: '', end_date: '', title: '' }))
  }

  const handleSimulate = async () => {
    if (proposed.length === 0) return
    const dates = proposed.flatMap(p => [p.start_date, p.end_date]).sort()
    try {
      const res = await simulate.mutateAsync({
        proposed_activities: proposed,
        start_date: dates[0],
        end_date: dates[dates.length - 1],
      })
      setResult(res)
    } catch (err) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? 'Erreur'
      toast({ title: 'Simulation échouée', description: String(msg), variant: 'error' })
    }
  }

  return (
    <div className="p-4 space-y-4 overflow-y-auto">
      <div className="text-xs text-muted-foreground mb-2">
        <FlaskConical size={12} className="inline mr-1 text-primary" />
        Testez l'impact de nouvelles activités sur la capacité sans rien enregistrer.
      </div>

      <FormSection title="Activités proposées" collapsible defaultExpanded storageKey="planner-scenario-proposed">
        <div className="grid grid-cols-[1fr_80px_120px_120px_auto] gap-2 text-xs items-end">
          <AssetPicker value={form.asset_id} onChange={v => setForm(f => ({ ...f, asset_id: v || '' }))} label="Site" />
          <div>
            <label className="text-[10px] text-muted-foreground block mb-0.5">PAX</label>
            <input type="number" min="1" value={form.pax_quota} onChange={e => setForm(f => ({ ...f, pax_quota: e.target.value }))} className={`${panelInputClass} w-full text-xs`} placeholder="PAX" />
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground block mb-0.5">Début</label>
            <input type="date" value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} className={`${panelInputClass} w-full text-xs`} />
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground block mb-0.5">Fin</label>
            <input type="date" value={form.end_date} onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))} className={`${panelInputClass} w-full text-xs`} />
          </div>
          <button onClick={handleAdd} disabled={!form.asset_id || !form.pax_quota || !form.start_date || !form.end_date} className="px-2 py-1 rounded bg-primary text-primary-foreground text-xs disabled:opacity-40 self-end">
            <Plus size={12} />
          </button>
        </div>
        {proposed.length > 0 && (
          <div className="mt-2 space-y-1">
            {proposed.map((p, i) => (
              <div key={i} className="flex items-center gap-2 text-[11px] px-2 py-1 rounded bg-muted/40">
                <span className="font-mono text-muted-foreground">{p.asset_id.slice(0, 8)}…</span>
                <span className="font-medium">{p.title || 'Sans titre'}</span>
                <span>{p.pax_quota} PAX</span>
                <span className="text-muted-foreground">{p.start_date} → {p.end_date}</span>
                <button onClick={() => setProposed(prev => prev.filter((_, j) => j !== i))} className="ml-auto text-muted-foreground hover:text-red-500"><Trash2 size={10} /></button>
              </div>
            ))}
          </div>
        )}
        <button
          onClick={handleSimulate}
          disabled={proposed.length === 0 || simulate.isPending}
          className="mt-2 px-3 py-1 rounded bg-primary text-primary-foreground text-xs disabled:opacity-40 flex items-center gap-1.5"
        >
          {simulate.isPending ? <Loader2 size={11} className="animate-spin" /> : <FlaskConical size={11} />}
          Simuler ({proposed.length} activité{proposed.length > 1 ? 's' : ''})
        </button>
      </FormSection>

      {result && (
        <FormSection title="Résultats de la simulation" collapsible defaultExpanded storageKey="planner-scenario-results">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
            <div className="border rounded p-2 text-center">
              <div className="text-[9px] uppercase text-muted-foreground">Jours analysés</div>
              <div className="text-lg font-semibold tabular-nums">{result.summary.total_days}</div>
            </div>
            <div className={cn('border rounded p-2 text-center', result.summary.conflict_days > 0 ? 'border-red-500/30 bg-red-500/5' : '')}>
              <div className="text-[9px] uppercase text-muted-foreground">Jours en conflit</div>
              <div className={cn('text-lg font-semibold tabular-nums', result.summary.conflict_days > 0 && 'text-red-600')}>{result.summary.conflict_days}</div>
            </div>
            <div className={cn('border rounded p-2 text-center', result.summary.worst_overflow > 0 ? 'border-red-500/30 bg-red-500/5' : '')}>
              <div className="text-[9px] uppercase text-muted-foreground">Pire dépassement</div>
              <div className="text-lg font-semibold tabular-nums">{result.summary.worst_overflow} PAX</div>
            </div>
            <div className="border rounded p-2 text-center">
              <div className="text-[9px] uppercase text-muted-foreground">Activités proposées</div>
              <div className="text-lg font-semibold tabular-nums">{result.summary.proposed_count}</div>
            </div>
          </div>

          {result.projected_conflicts.length > 0 && (
            <div className="border border-red-500/30 rounded p-2 mb-3">
              <div className="text-xs font-semibold text-red-600 mb-1 flex items-center gap-1">
                <AlertTriangle size={12} /> Conflits projetés
              </div>
              <div className="space-y-0.5 max-h-[120px] overflow-y-auto">
                {result.projected_conflicts.map((c, i) => (
                  <div key={i} className="text-[10px] flex items-center gap-2">
                    <span className="text-muted-foreground tabular-nums">{c.date}</span>
                    <span className="font-mono text-[9px]">{c.asset_id.slice(0, 8)}</span>
                    <span className="text-red-600 font-medium">+{c.overflow} PAX</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {result.projected_conflicts.length === 0 && (
            <div className="text-[11px] text-green-600 flex items-center gap-1.5 p-2 rounded bg-green-500/5 border border-green-500/30">
              <CheckCircle2 size={12} /> Aucun conflit projeté — la capacité est suffisante.
            </div>
          )}
        </FormSection>
      )}
    </div>
  )
}

// ── Forecast Tab (capacity trends) ─────────────────────────────────────

function ForecastTab() {
  const { t } = useTranslation()
  const [assetId, setAssetId] = useState('')
  const [horizon, setHorizon] = useState(90)
  const { data, isLoading } = useForecast(assetId || undefined, horizon)

  return (
    <div className="p-4 space-y-4 overflow-y-auto">
      <div className="text-xs text-muted-foreground mb-2">
        <TrendingUp size={12} className="inline mr-1 text-primary" />
        {t('planner.forecast.description')}
      </div>

      <div className="flex items-end gap-3">
        <AssetPicker value={assetId} onChange={v => setAssetId(v || '')} label="Site" />
        <div>
          <label className="text-[10px] text-muted-foreground block mb-0.5">Horizon (jours)</label>
          <select value={horizon} onChange={e => setHorizon(Number(e.target.value))} className={`${panelInputClass} text-xs`}>
            <option value={30}>30 jours</option>
            <option value={60}>60 jours</option>
            <option value={90}>90 jours</option>
            <option value={180}>6 mois</option>
            <option value={365}>1 an</option>
          </select>
        </div>
      </div>

      {!assetId && (
        <div className="text-center py-8 text-xs text-muted-foreground italic">
          Sélectionnez un site pour voir les prévisions de capacité.
        </div>
      )}

      {isLoading && assetId && (
        <div className="flex items-center justify-center py-8">
          <Loader2 size={16} className="animate-spin text-muted-foreground" />
        </div>
      )}

      {data && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div className={cn('border rounded p-2 text-center', data.summary.at_risk_days > 0 ? 'border-orange-500/30 bg-orange-500/5' : '')}>
              <div className="text-[9px] uppercase text-muted-foreground">Jours à risque (&gt;80%)</div>
              <div className={cn('text-lg font-semibold tabular-nums', data.summary.at_risk_days > 0 && 'text-orange-600')}>{data.summary.at_risk_days}</div>
            </div>
            <div className="border rounded p-2 text-center">
              <div className="text-[9px] uppercase text-muted-foreground">Charge moy. projetée</div>
              <div className="text-lg font-semibold tabular-nums">{data.summary.avg_projected_load}</div>
            </div>
            <div className="border rounded p-2 text-center">
              <div className="text-[9px] uppercase text-muted-foreground">{t('planner.forecast.avg_real_pob')}</div>
              <div className="text-lg font-semibold tabular-nums">{data.summary.avg_real_pob}</div>
            </div>
            <div className="border rounded p-2 text-center">
              <div className="text-[9px] uppercase text-muted-foreground">Pic de charge</div>
              <div className="text-lg font-semibold tabular-nums">{data.summary.peak_load}</div>
              {data.summary.peak_date && <div className="text-[9px] text-muted-foreground">{data.summary.peak_date}</div>}
            </div>
            <div className="border rounded p-2 text-center">
              <div className="text-[9px] uppercase text-muted-foreground">Capacité max</div>
              <div className="text-lg font-semibold tabular-nums">{data.summary.max_capacity}</div>
            </div>
          </div>

          <div className="border border-border rounded p-3">
            <div className="text-xs font-semibold mb-2 flex items-center gap-1">
              <TrendingUp size={12} className="text-primary" /> Charge jour par jour
            </div>
            <div className="max-h-[400px] overflow-y-auto space-y-0.5">
              {data.forecast.map((day: ForecastDay) => {
                const pct = day.max_capacity > 0 ? (day.combined_load / day.max_capacity) * 100 : 0
                const barColor = day.at_risk ? 'bg-orange-500' : pct > 50 ? 'bg-yellow-400' : 'bg-green-500'
                return (
                  <div key={day.date} className={cn('flex items-center gap-2 text-[10px] py-0.5', day.at_risk && 'bg-orange-500/5 rounded')}>
                    <span className="w-[80px] text-muted-foreground tabular-nums shrink-0">{day.date}</span>
                    <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                      <div className={cn('h-full rounded-full', barColor)} style={{ width: `${Math.min(100, pct)}%` }} />
                    </div>
                    <span className="w-[40px] text-right tabular-nums">{Math.round(day.combined_load)}</span>
                    <span className="w-[30px] text-right tabular-nums text-muted-foreground">/{day.max_capacity}</span>
                    <span className="w-[52px] text-right tabular-nums text-muted-foreground">
                      {t('planner.forecast.real_pob_short', { count: day.real_pob })}
                    </span>
                    {day.at_risk && <AlertTriangle size={9} className="text-orange-500 shrink-0" />}
                  </div>
                )
              })}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// Persisted under prefs.planner.timeline = { scale, start, end }
interface PlannerTimelinePref {
  scale: TimeScale
  start: string
  end: string
}

const VALID_SCALES: ReadonlySet<TimeScale> = new Set<TimeScale>(['day', 'week', 'month', 'quarter', 'semester'])

export function PlannerPage() {
  const [activeTab, setActiveTab] = useState<PlannerTab>('gantt')

  // Load persisted timeline pref (loaded from localStorage instantly, then API)
  const { getPref, setPref } = useUserPreferences()
  const persistedTimeline = getPref<PlannerTimelinePref | null>('planner.timeline', null)

  // Initial state — fall back to month default if nothing persisted yet
  const initialScale: TimeScale =
    persistedTimeline && VALID_SCALES.has(persistedTimeline.scale)
      ? persistedTimeline.scale
      : 'month'
  const initialRange = persistedTimeline?.start && persistedTimeline?.end
    ? { start: persistedTimeline.start, end: persistedTimeline.end }
    : getDefaultDateRange(initialScale)

  const [sharedTimelineScale, setSharedTimelineScale] = useState<TimeScale>(initialScale)
  const [sharedTimelineRange, setSharedTimelineRange] = useState(initialRange)

  // If persisted prefs arrive AFTER mount (first load before localStorage cache)
  // sync once into local state so the user sees their saved scale.
  const hydratedFromPrefsRef = useRef(false)
  useEffect(() => {
    if (hydratedFromPrefsRef.current) return
    if (!persistedTimeline) return
    if (!VALID_SCALES.has(persistedTimeline.scale)) return
    hydratedFromPrefsRef.current = true
    setSharedTimelineScale(persistedTimeline.scale)
    if (persistedTimeline.start && persistedTimeline.end) {
      setSharedTimelineRange({ start: persistedTimeline.start, end: persistedTimeline.end })
    }
  }, [persistedTimeline])

  // Persist helper — debounced inside useUserPreferences (300 ms)
  const persistTimeline = useCallback((scale: TimeScale, range: { start: string; end: string }) => {
    setPref('planner.timeline', { scale, start: range.start, end: range.end })
  }, [setPref])

  // ── Gantt+Heatmap view customization preferences ──
  const ganttViewPrefs = getPref<PlannerGanttViewPrefs>(
    'planner.gantt_view',
    DEFAULT_PLANNER_GANTT_VIEW,
  )
  const handleGanttViewPrefsChange = useCallback((prefs: PlannerGanttViewPrefs) => {
    setPref('planner.gantt_view', validatePlannerGanttPrefs(prefs))
  }, [setPref])

  const dynamicPanel = useUIStore((s) => s.dynamicPanel)
  const openDynamicPanel = useUIStore((s) => s.openDynamicPanel)
  const panelMode = useUIStore((s) => s.dynamicPanelMode)

  const isFullPanel = panelMode === 'full' && dynamicPanel !== null && dynamicPanel.module === 'planner'

  const { hasPermission } = usePermission()
  const canCreate = hasPermission('planner.activity.create')

  const handleCreate = useCallback(() => {
    openDynamicPanel({ type: 'create', module: 'planner', meta: { subtype: 'activity' } })
  }, [openDynamicPanel])

  const handleTimelineScaleChange = useCallback((scale: TimeScale) => {
    const range = getDefaultDateRange(scale)
    setSharedTimelineScale(scale)
    setSharedTimelineRange(range)
    persistTimeline(scale, range)
  }, [persistTimeline])

  const handleTimelineRangeChange = useCallback((from: string, to: string) => {
    const range = { start: from, end: to }
    setSharedTimelineRange(range)
    persistTimeline(sharedTimelineScale, range)
  }, [persistTimeline, sharedTimelineScale])

  const handleGanttViewChange = useCallback((scale: TimeScale, start: string, end: string) => {
    const range = { start, end }
    setSharedTimelineScale(scale)
    setSharedTimelineRange(range)
    persistTimeline(scale, range)
  }, [persistTimeline])

  return (
    <div className="flex h-full">
      {!isFullPanel && (
        <div className="flex flex-1 flex-col min-w-0 overflow-hidden">
          <PanelHeader icon={CalendarRange} title="Planner" subtitle="Planification des activites">
            {canCreate && (activeTab === 'activities' || activeTab === 'gantt') && (
              <ToolbarButton icon={Plus} label="Nouvelle activite" variant="primary" onClick={handleCreate} />
            )}
          </PanelHeader>

          {/* Tab bar */}
          <div className="flex items-center gap-1 border-b border-border px-3.5 h-9 shrink-0">
            {TABS.map((tab) => {
              const Icon = tab.icon
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors',
                    activeTab === tab.id
                      ? 'bg-primary/[0.16] text-foreground'
                      : 'text-muted-foreground hover:text-foreground hover:bg-accent',
                  )}
                >
                  <Icon size={12} />
                  {tab.label}
                </button>
              )
            })}
          </div>

          {activeTab === 'gantt' && (
            <div className="flex-1 min-h-0 flex flex-col p-3">
              {/* Unified Gantt + heatmap — single shared timeline */}
              <GanttView
                scale={sharedTimelineScale}
                startDate={sharedTimelineRange.start}
                endDate={sharedTimelineRange.end}
                onViewChange={handleGanttViewChange}
                viewPrefs={ganttViewPrefs}
                onViewPrefsChange={handleGanttViewPrefsChange}
              />
            </div>
          )}
          {activeTab === 'activities' && <ActivitiesTab />}
          {activeTab === 'conflicts' && <ConflitsTab />}
          {activeTab === 'capacity' && (
            <CapacityTab
              timelineScale={sharedTimelineScale}
              timelineStartDate={sharedTimelineRange.start}
              timelineEndDate={sharedTimelineRange.end}
              onTimelineScaleChange={handleTimelineScaleChange}
              onTimelineRangeChange={handleTimelineRangeChange}
            />
          )}
          {activeTab === 'scenarios' && <ScenariosTab />}
          {activeTab === 'forecast' && <ForecastTab />}
        </div>
      )}

      {dynamicPanel?.module === 'planner' && dynamicPanel.type === 'create' && <CreateActivityPanel />}
      {dynamicPanel?.module === 'planner' && dynamicPanel.type === 'detail' && 'id' in dynamicPanel && <ActivityDetailPanel id={dynamicPanel.id} />}
    </div>
  )
}

// ── Activity Detail Panel ──────────────────────────────────────

// ── Inline-editable dependency row ─────────────────────────────────
// Lag is stored as days in the backend; the UI lets the user pick a unit
// (jours / semaines / mois) and converts on the fly. 1 month = 30 days for
// scheduling purposes.

type LagUnit = 'd' | 'w' | 'm'
const LAG_UNIT_DAYS: Record<LagUnit, number> = { d: 1, w: 7, m: 30 }
const LAG_UNIT_LABELS: Record<LagUnit, string> = { d: 'jours', w: 'semaines', m: 'mois' }

/** Pick the most natural unit for an existing day count (e.g. 14 → "2 semaines") */
function pickLagUnit(days: number): { unit: LagUnit; value: number } {
  const abs = Math.abs(days)
  if (abs > 0 && abs % 30 === 0) return { unit: 'm', value: days / 30 }
  if (abs > 0 && abs % 7 === 0) return { unit: 'w', value: days / 7 }
  return { unit: 'd', value: days }
}

interface DependencyRowProps {
  dep: PlannerDependency
  currentActivityId: string
  dependencyTypeOptions: { value: string; label: string }[]
  onDelete: (depId: string) => void
  onUpdate: (
    depId: string,
    payload: { predecessor_id: string; successor_id: string; dependency_type: string; lag_days: number },
  ) => void
  isPending?: boolean
}

function DependencyRow({ dep, currentActivityId, dependencyTypeOptions, onDelete, onUpdate, isPending }: DependencyRowProps) {
  const [editing, setEditing] = useState(false)

  // Identify the "other" activity (not the current one) — that's what the user
  // actually cares about and might want to change.
  const isCurrentPredecessor = dep.predecessor_id === currentActivityId
  const otherActivityId = isCurrentPredecessor ? dep.successor_id : dep.predecessor_id
  const otherActivityTitle = isCurrentPredecessor ? dep.successor_title : dep.predecessor_title
  const role = isCurrentPredecessor ? 'Successeur' : 'Prédécesseur'

  // ── Edit state ──
  const initialLag = pickLagUnit(dep.lag_days)
  const [draftOtherId, setDraftOtherId] = useState<string>(otherActivityId)
  const [draftType, setDraftType] = useState<string>(dep.dependency_type)
  const [draftLagValue, setDraftLagValue] = useState<number>(initialLag.value)
  const [draftLagUnit, setDraftLagUnit] = useState<LagUnit>(initialLag.unit)

  const startEdit = () => {
    const fresh = pickLagUnit(dep.lag_days)
    setDraftOtherId(otherActivityId)
    setDraftType(dep.dependency_type)
    setDraftLagValue(fresh.value)
    setDraftLagUnit(fresh.unit)
    setEditing(true)
  }

  const save = () => {
    const lagDays = Math.round(draftLagValue * LAG_UNIT_DAYS[draftLagUnit])
    // Re-compute predecessor/successor IDs depending on the role of the
    // current activity. The "other" side is editable; the current activity
    // stays fixed on its own side.
    const newPredecessor = isCurrentPredecessor ? currentActivityId : draftOtherId
    const newSuccessor = isCurrentPredecessor ? draftOtherId : currentActivityId
    const changed =
      newPredecessor !== dep.predecessor_id ||
      newSuccessor !== dep.successor_id ||
      draftType !== dep.dependency_type ||
      lagDays !== dep.lag_days
    if (changed) {
      onUpdate(dep.id, {
        predecessor_id: newPredecessor,
        successor_id: newSuccessor,
        dependency_type: draftType,
        lag_days: lagDays,
      })
    }
    setEditing(false)
  }

  // Display label (lag) — shown next to the type badge in read mode
  const lagDisplay = (() => {
    if (dep.lag_days === 0) return null
    const { unit, value } = pickLagUnit(dep.lag_days)
    const sign = value > 0 ? '+' : ''
    const u = unit === 'd' ? 'j' : unit === 'w' ? 'sem' : 'mois'
    return `${sign}${value} ${u}`
  })()

  if (editing) {
    return (
      <div className="space-y-2 p-2 rounded border border-primary/50 bg-primary/5 text-xs">
        <div className="flex items-center gap-2">
          <Link2 size={11} className="text-primary shrink-0" />
          <span className="text-[10px] uppercase font-semibold text-primary tracking-wide">{role}</span>
          <span className="text-[10px] text-muted-foreground">— activité liée</span>
        </div>
        <ActivityPicker
          value={draftOtherId || null}
          onChange={(actId) => setDraftOtherId(actId || '')}
          excludeId={currentActivityId}
          label={undefined}
        />
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex flex-col">
            <label className="text-[9px] uppercase text-muted-foreground tracking-wide">Type</label>
            <select
              value={draftType}
              onChange={(e) => setDraftType(e.target.value)}
              className="h-7 px-1.5 text-xs border border-border rounded bg-background"
              disabled={isPending}
            >
              {dependencyTypeOptions.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col">
            <label className="text-[9px] uppercase text-muted-foreground tracking-wide">Délai</label>
            <input
              type="number"
              value={draftLagValue}
              onChange={(e) => setDraftLagValue(parseInt(e.target.value) || 0)}
              className="w-20 h-7 px-1.5 text-xs border border-border rounded bg-background tabular-nums"
              placeholder="0"
              disabled={isPending}
            />
          </div>
          <div className="flex flex-col">
            <label className="text-[9px] uppercase text-muted-foreground tracking-wide">Unité</label>
            <select
              value={draftLagUnit}
              onChange={(e) => setDraftLagUnit(e.target.value as LagUnit)}
              className="h-7 px-1.5 text-xs border border-border rounded bg-background"
              disabled={isPending}
            >
              {(Object.keys(LAG_UNIT_LABELS) as LagUnit[]).map((u) => (
                <option key={u} value={u}>{LAG_UNIT_LABELS[u]}</option>
              ))}
            </select>
          </div>
          <div className="ml-auto flex items-center gap-1 self-end">
            <button
              onClick={save}
              disabled={isPending || !draftOtherId}
              className="px-2 py-1 text-[11px] rounded bg-primary text-primary-foreground disabled:opacity-50"
            >
              Enregistrer
            </button>
            <button
              onClick={() => setEditing(false)}
              disabled={isPending}
              className="px-2 py-1 text-[11px] rounded border border-border"
            >
              Annuler
            </button>
          </div>
        </div>
        <p className="text-[9px] text-muted-foreground">
          Délai positif = retard sur le lien · négatif = chevauchement. La valeur est convertie en jours côté serveur.
        </p>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2 py-1.5 px-2 rounded border border-border/50 text-xs hover:bg-muted/30 transition-colors">
      <Link2 size={11} className="text-muted-foreground shrink-0" />
      <span className="text-[10px] uppercase text-muted-foreground tracking-wide w-[78px] shrink-0">{role}</span>
      <span className="font-medium text-foreground truncate flex-1" title={otherActivityTitle || otherActivityId}>
        {otherActivityTitle || otherActivityId.slice(0, 8) + '…'}
      </span>
      <span className="gl-badge gl-badge-neutral text-[10px]" title="Type de dépendance">{dep.dependency_type}</span>
      {lagDisplay && (
        <span className="text-muted-foreground text-[10px] tabular-nums" title="Délai (lag)">{lagDisplay}</span>
      )}
      <button
        onClick={startEdit}
        className="p-0.5 rounded hover:bg-primary/10 text-muted-foreground hover:text-primary"
        title="Modifier"
      >
        <Pencil size={11} />
      </button>
      <button
        onClick={() => onDelete(dep.id)}
        className="p-0.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
        title="Supprimer"
      >
        <XCircle size={11} />
      </button>
    </div>
  )
}

function ActivityDetailPanel({ id }: { id: string }) {
  const { toast } = useToast()
  const promptInput = usePromptInput()
  const closeDynamicPanel = useUIStore((s) => s.closeDynamicPanel)
  const { data: activity, isLoading } = useActivity(id)
  const updateActivity = useUpdateActivity()
  const deleteActivity = useDeleteActivity()
  const submitActivity = useSubmitActivity()
  const validateActivity = useValidateActivity()
  const rejectActivity = useRejectActivity()
  const cancelActivity = useCancelActivity()
  const { data: dependencies } = useActivityDependencies(id)
  const addDependency = useAddDependency()
  const removeDependency = useRemoveDependency()
  const impactPreview = useImpactPreview()
  const overridePriority = useOverridePriority()
  const setRecurrence = useSetRecurrence()
  const deleteRecurrence = useDeleteRecurrence()
  const { hasPermission } = usePermission()
  const canUpdate = hasPermission('planner.activity.update')
  const canDelete = hasPermission('planner.activity.delete')
  const activityTypeLabels = useDictionaryLabels('planner_activity_type', ACTIVITY_TYPE_LABELS_FALLBACK)
  const priorityLabels = useDictionaryLabels('planner_activity_priority', PRIORITY_LABELS_FALLBACK)
  const activityStatusLabels = useDictionaryLabels('planner_activity_status', ACTIVITY_STATUS_LABELS_FALLBACK)
  const dependencyTypeLabels = useDictionaryLabels('planner_dependency_type', DEP_TYPE_LABELS_FALLBACK)
  const activityTypeOptions = useMemo(() => buildDictionaryOptions(activityTypeLabels, PLANNER_ACTIVITY_TYPE_VALUES), [activityTypeLabels])
  const priorityOptions = useMemo(() => buildDictionaryOptions(priorityLabels, PLANNER_PRIORITY_VALUES), [priorityLabels])
  const dependencyTypeOptions = useMemo(() => buildDictionaryOptions(dependencyTypeLabels, PLANNER_DEP_TYPE_VALUES), [dependencyTypeLabels])

  const [editing, setEditing] = useState(false)
  const [editForm, setEditForm] = useState<Record<string, unknown>>({})

  // Dependency add form
  const [depForm, setDepForm] = useState({ predecessor_id: '', dependency_type: 'FS', lag_days: 0 })
  const [showDepAdd, setShowDepAdd] = useState(false)
  // (ActivityPicker handles search/dropdown internally)

  // Impact modal
  const [showImpact, setShowImpact] = useState(false)

  // Recurrence form
  const [showRecurrence, setShowRecurrence] = useState(false)
  const [recForm, setRecForm] = useState({ frequency: 'weekly', interval_value: 1, day_of_week: 1, end_date: '' })

  // Priority override
  const [showPriorityOverride, setShowPriorityOverride] = useState(false)
  const [priorityOverrideForm, setPriorityOverrideForm] = useState({ priority: 'high', reason: '' })

  // Inline field save (used by InlineEditableRow in read mode)
  const handleInlineSave = useCallback((field: string, value: string) => {
    updateActivity.mutate(
      { id, payload: normalizeNames({ [field]: value }) },
      {
        onSuccess: () => toast({ title: 'Champ mis a jour', variant: 'success' }),
        onError: () => toast({ title: 'Erreur lors de la mise a jour', variant: 'error' }),
      },
    )
  }, [id, updateActivity, toast])

  const startEdit = useCallback(() => {
    if (!activity) return
    setEditForm({
      title: activity.title,
      type: activity.type,
      subtype: activity.subtype ?? '',
      priority: activity.priority,
      pax_quota: activity.pax_quota,
      pax_quota_mode: activity.pax_quota_mode ?? 'constant',
      pax_quota_daily: activity.pax_quota_daily ?? null,
      start_date: activity.start_date ?? '',
      end_date: activity.end_date ?? '',
      description: activity.description ?? '',
      well_reference: activity.well_reference ?? '',
      rig_name: activity.rig_name ?? '',
      spud_date: activity.spud_date ?? '',
      target_depth: activity.target_depth ?? '',
      drilling_program_ref: activity.drilling_program_ref ?? '',
      regulatory_ref: activity.regulatory_ref ?? '',
      work_order_ref: activity.work_order_ref ?? '',
    })
    setEditing(true)
  }, [activity])

  const handleSave = useCallback(() => {
    // If activity is approved, show impact preview first
    if (activity && ['validated', 'in_progress'].includes(activity.status) && !showImpact) {
      impactPreview.mutate(
        {
          activityId: id,
          params: {
            new_start: editForm.start_date as string || undefined,
            new_end: editForm.end_date as string || undefined,
            new_pax_quota: editForm.pax_quota as number || undefined,
          },
        },
        {
          onSuccess: () => setShowImpact(true),
          onError: () => {
            // If impact preview fails, proceed with save anyway
            doSave()
          },
        },
      )
      return
    }
    doSave()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, editForm, activity, showImpact])

  const doSave = useCallback(() => {
    updateActivity.mutate(
      { id, payload: normalizeNames(editForm as Record<string, string | number | null>) },
      {
        onSuccess: () => {
          toast({ title: 'Activite mise a jour', variant: 'success' })
          setEditing(false)
          setShowImpact(false)
        },
        onError: () => toast({ title: 'Erreur lors de la mise a jour', variant: 'error' }),
      },
    )
  }, [id, editForm, updateActivity, toast])

  const handleDelete = useCallback(() => {
    deleteActivity.mutate(id, {
      onSuccess: () => {
        toast({ title: 'Activite supprimee', variant: 'success' })
        closeDynamicPanel()
      },
      onError: () => toast({ title: 'Erreur lors de la suppression', variant: 'error' }),
    })
  }, [id, deleteActivity, toast, closeDynamicPanel])

  const handleSubmit = useCallback(() => {
    submitActivity.mutate(id, {
      onSuccess: () => toast({ title: 'Activite soumise', variant: 'success' }),
      onError: () => toast({ title: 'Erreur lors de la soumission', variant: 'error' }),
    })
  }, [id, submitActivity, toast])

  const handleValidate = useCallback(() => {
    validateActivity.mutate(id, {
      onSuccess: () => toast({ title: 'Activite validee', variant: 'success' }),
      onError: () => toast({ title: 'Erreur lors de la validation', variant: 'error' }),
    })
  }, [id, validateActivity, toast])

  const handleReject = useCallback(async () => {
    const reason = await promptInput({ title: 'Rejeter l\'activité', placeholder: 'Motif du rejet...' })
    if (reason === null) return
    rejectActivity.mutate(
      { id, reason },
      {
        onSuccess: () => toast({ title: 'Activite rejetee', variant: 'success' }),
        onError: () => toast({ title: 'Erreur lors du rejet', variant: 'error' }),
      },
    )
  }, [id, rejectActivity, toast])

  const handleCancel = useCallback(() => {
    cancelActivity.mutate(id, {
      onSuccess: () => toast({ title: 'Activite annulee', variant: 'success' }),
      onError: () => toast({ title: "Erreur lors de l'annulation", variant: 'error' }),
    })
  }, [id, cancelActivity, toast])

  const handleAddDep = useCallback(() => {
    if (!depForm.predecessor_id.trim()) return
    addDependency.mutate(
      {
        activityId: id,
        payload: {
          predecessor_id: depForm.predecessor_id.trim(),
          successor_id: id,
          dependency_type: depForm.dependency_type,
          lag_days: depForm.lag_days,
        },
      },
      {
        onSuccess: () => {
          toast({ title: 'Dependance ajoutee', variant: 'success' })
          setDepForm({ predecessor_id: '', dependency_type: 'FS', lag_days: 0 })
          setShowDepAdd(false)
        },
        onError: () => toast({ title: "Erreur lors de l'ajout de la dependance", variant: 'error' }),
      },
    )
  }, [id, depForm, addDependency, toast])

  const handleRemoveDep = useCallback((depId: string) => {
    removeDependency.mutate(
      { activityId: id, dependencyId: depId },
      {
        onSuccess: () => toast({ title: 'Dependance supprimee', variant: 'success' }),
        onError: () => toast({ title: 'Erreur lors de la suppression', variant: 'error' }),
      },
    )
  }, [id, removeDependency, toast])

  /**
   * Inline-edit a dependency = remove + re-add. The backend has no PATCH
   * endpoint for dependencies; this two-step approach keeps the UI simple.
   * The optimistic remove handler in useRemoveDependency makes the swap feel
   * instant. The whole payload (predecessor / successor / type / lag) can
   * change in one save.
   */
  const handleUpdateDep = useCallback((depId: string, payload: {
    predecessor_id: string
    successor_id: string
    dependency_type: string
    lag_days: number
  }) => {
    removeDependency.mutate(
      { activityId: id, dependencyId: depId },
      {
        onSuccess: () => {
          addDependency.mutate(
            {
              activityId: id,
              payload: {
                predecessor_id: payload.predecessor_id,
                successor_id: payload.successor_id,
                dependency_type: payload.dependency_type,
                lag_days: payload.lag_days,
              },
            },
            {
              onSuccess: () => toast({ title: 'Dependance modifiee', variant: 'success' }),
              onError: () => toast({ title: 'Erreur lors de la modification', variant: 'error' }),
            },
          )
        },
        onError: () => toast({ title: 'Erreur lors de la modification', variant: 'error' }),
      },
    )
  }, [id, removeDependency, addDependency, toast])

  const handleSetRecurrence = useCallback(() => {
    setRecurrence.mutate(
      {
        activityId: id,
        payload: {
          frequency: recForm.frequency,
          interval_value: recForm.interval_value,
          day_of_week: recForm.day_of_week,
          end_date: recForm.end_date || undefined,
        },
      },
      {
        onSuccess: () => {
          toast({ title: 'Recurrence configuree', variant: 'success' })
          setShowRecurrence(false)
        },
        onError: () => toast({ title: 'Erreur', variant: 'error' }),
      },
    )
  }, [id, recForm, setRecurrence, toast])

  const handleOverridePriority = useCallback(() => {
    if (!priorityOverrideForm.reason) return
    overridePriority.mutate(
      { activityId: id, priority: priorityOverrideForm.priority, reason: priorityOverrideForm.reason },
      {
        onSuccess: () => {
          toast({ title: 'Priorité modifiee', variant: 'success' })
          setShowPriorityOverride(false)
        },
        onError: () => toast({ title: 'Erreur', variant: 'error' }),
      },
    )
  }, [id, priorityOverrideForm, overridePriority, toast])

  if (isLoading || !activity) {
    return (
      <DynamicPanelShell title="Chargement..." icon={<CalendarRange size={14} className="text-primary" />}>
        <div className="flex items-center justify-center py-16">
          <Loader2 size={16} className="animate-spin text-muted-foreground" />
        </div>
      </DynamicPanelShell>
    )
  }

  const st = activity.status
  const tp = activity.type

  // Build action buttons based on status
  const actionButtons = (
    <>
      {editing ? (
        <>
          <PanelActionButton onClick={() => { setEditing(false); setShowImpact(false) }}>Annuler</PanelActionButton>
          <PanelActionButton variant="primary" disabled={updateActivity.isPending} onClick={handleSave}>
            {updateActivity.isPending ? <Loader2 size={12} className="animate-spin" /> : 'Enregistrer'}
          </PanelActionButton>
        </>
      ) : (
        <>
          {canUpdate && (
            <button
              onClick={startEdit}
              className="gl-button-sm gl-button-default flex items-center gap-1"
              title="Modifier"
            >
              <Pencil size={12} />
              Modifier
            </button>
          )}
          {canUpdate && st === 'draft' && (
            <PanelActionButton variant="primary" onClick={handleSubmit} disabled={submitActivity.isPending}>
              <Send size={12} /> Soumettre
            </PanelActionButton>
          )}
          {canUpdate && st === 'submitted' && (
            <>
              <PanelActionButton variant="primary" onClick={handleValidate} disabled={validateActivity.isPending}>
                <CheckCircle2 size={12} /> Valider
              </PanelActionButton>
              <PanelActionButton onClick={handleReject} disabled={rejectActivity.isPending}>
                <XCircle size={12} /> Rejeter
              </PanelActionButton>
            </>
          )}
          {canUpdate && !['completed', 'cancelled'].includes(st) && (
            <PanelActionButton onClick={handleCancel} disabled={cancelActivity.isPending}>
              <Ban size={12} /> Annuler
            </PanelActionButton>
          )}
          {canDelete && (
            <DangerConfirmButton
              icon={<Trash2 size={12} />}
              onConfirm={handleDelete}
              confirmLabel="Confirmer ?"
            >
              Supprimer
            </DangerConfirmButton>
          )}
        </>
      )}
    </>
  )

  const typeEntry = ACTIVITY_TYPE_META[tp]
  const priorityEntry = { label: priorityLabels[activity.priority] ?? activity.priority, cls: PRIORITY_CLASS_MAP[activity.priority] || 'text-muted-foreground' }
  const statusEntry = { label: activityStatusLabels[st] ?? st, badge: ACTIVITY_STATUS_BADGES[st] || 'gl-badge-neutral' }

  return (
    <DynamicPanelShell
      title={activity.title}
      subtitle={activityTypeLabels[tp] || tp}
      icon={<CalendarRange size={14} className="text-primary" />}
      actions={actionButtons}
    >
      <PanelContentLayout>
        {editing ? (
          /* ── EDIT MODE ── */
          <>
            <FormSection title="Informations">
              <FormGrid>
                <DynamicPanelField label="Titre" required>
                  <input
                    type="text"
                    value={editForm.title as string}
                    onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                    className={panelInputClass}
                  />
                </DynamicPanelField>
                <DynamicPanelField label="Type" required>
                  <select
                    value={editForm.type as string}
                    onChange={(e) => setEditForm({ ...editForm, type: e.target.value })}
                    className={panelInputClass}
                  >
                    {activityTypeOptions.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </DynamicPanelField>
                <DynamicPanelField label="Sous-type">
                  <input
                    type="text"
                    value={editForm.subtype as string}
                    onChange={(e) => setEditForm({ ...editForm, subtype: e.target.value || null })}
                    className={panelInputClass}
                  />
                </DynamicPanelField>
                <DynamicPanelField label="Priorité">
                  <select
                    value={editForm.priority as string}
                    onChange={(e) => setEditForm({ ...editForm, priority: e.target.value })}
                    className={panelInputClass}
                  >
                    {priorityOptions.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </DynamicPanelField>
                <DynamicPanelField label="Mode POB">
                  <select
                    value={(editForm.pax_quota_mode as string) || 'constant'}
                    onChange={(e) => setEditForm({ ...editForm, pax_quota_mode: e.target.value })}
                    className={panelInputClass}
                  >
                    <option value="constant">Constant</option>
                    <option value="variable">Variable (par jour)</option>
                  </select>
                </DynamicPanelField>
                {editForm.pax_quota_mode !== 'variable' && (
                  <DynamicPanelField label="Quota PAX">
                    <input
                      type="number"
                      value={editForm.pax_quota as number}
                      onChange={(e) => setEditForm({ ...editForm, pax_quota: parseInt(e.target.value) || 0 })}
                      className={panelInputClass}
                      min={0}
                    />
                  </DynamicPanelField>
                )}
              </FormGrid>
              {((editForm.pax_quota_mode as string) === 'variable' && editForm.start_date && editForm.end_date) ? (
                <div className="mt-3">
                  <p className="text-xs text-muted-foreground mb-2">Plan POB jour par jour :</p>
                  <VariablePobEditor
                    startDate={editForm.start_date as string}
                    endDate={editForm.end_date as string}
                    value={(editForm.pax_quota_daily ?? null) as Record<string, number> | null}
                    onChange={(daily) => setEditForm({ ...editForm, pax_quota_daily: daily })}
                    defaultValue={(editForm.pax_quota as number) || 1}
                    compact
                  />
                </div>
              ) : null}
            </FormSection>

            <FormSection title="Planning">
              <DateRangePicker
                startDate={(editForm.start_date as string) || null}
                endDate={(editForm.end_date as string) || null}
                onStartChange={(v) => setEditForm({ ...editForm, start_date: v || null })}
                onEndChange={(v) => setEditForm({ ...editForm, end_date: v || null })}
              />
            </FormSection>

            <FormSection title="Description">
              <DynamicPanelField label="Description" span="full">
                <textarea
                  value={editForm.description as string}
                  onChange={(e) => setEditForm({ ...editForm, description: e.target.value || null })}
                  className={cn(panelInputClass, 'min-h-[80px] py-2')}
                />
              </DynamicPanelField>
            </FormSection>

            {/* Conditional specialized fields in edit mode */}
            {(editForm.type === 'workover') && (
              <FormSection title="Details Workover">
                <FormGrid>
                  <DynamicPanelField label="Reference puits">
                    <input
                      type="text"
                      value={editForm.well_reference as string}
                      onChange={(e) => setEditForm({ ...editForm, well_reference: e.target.value || null })}
                      className={panelInputClass}
                    />
                  </DynamicPanelField>
                  <DynamicPanelField label="Nom du rig">
                    <input
                      type="text"
                      value={editForm.rig_name as string}
                      onChange={(e) => setEditForm({ ...editForm, rig_name: e.target.value || null })}
                      className={panelInputClass}
                    />
                  </DynamicPanelField>
                </FormGrid>
              </FormSection>
            )}

            {(editForm.type === 'drilling') && (
              <FormSection title="Details Forage">
                <FormGrid>
                  <DynamicPanelField label="Date spud">
                    <input
                      type="date"
                      value={editForm.spud_date as string}
                      onChange={(e) => setEditForm({ ...editForm, spud_date: e.target.value || null })}
                      className={panelInputClass}
                    />
                  </DynamicPanelField>
                  <DynamicPanelField label="Profondeur cible (m)">
                    <input
                      type="number"
                      value={editForm.target_depth as string}
                      onChange={(e) => setEditForm({ ...editForm, target_depth: parseFloat(e.target.value) || null })}
                      className={panelInputClass}
                    />
                  </DynamicPanelField>
                  <DynamicPanelField label="Ref. programme forage">
                    <input
                      type="text"
                      value={editForm.drilling_program_ref as string}
                      onChange={(e) => setEditForm({ ...editForm, drilling_program_ref: e.target.value || null })}
                      className={panelInputClass}
                    />
                  </DynamicPanelField>
                </FormGrid>
              </FormSection>
            )}

            {(editForm.type === 'maintenance' || editForm.type === 'integrity') && (
              <FormSection title="Details Maintenance / Integrite">
                <FormGrid>
                  <DynamicPanelField label="Reference reglementaire">
                    <input
                      type="text"
                      value={editForm.regulatory_ref as string}
                      onChange={(e) => setEditForm({ ...editForm, regulatory_ref: e.target.value || null })}
                      className={panelInputClass}
                    />
                  </DynamicPanelField>
                  <DynamicPanelField label="Bon de travail">
                    <input
                      type="text"
                      value={editForm.work_order_ref as string}
                      onChange={(e) => setEditForm({ ...editForm, work_order_ref: e.target.value || null })}
                      className={panelInputClass}
                    />
                  </DynamicPanelField>
                </FormGrid>
              </FormSection>
            )}
          </>
        ) : (
          /* ── READ MODE ── */
          <>
            <SectionColumns>
              <div className="@container space-y-5">
                {/* Informations */}
                <FormSection title="Informations">
                  <DetailFieldGrid>
                    <InlineEditableRow label="Titre" value={activity.title} onSave={(v) => handleInlineSave('title', v)} />
                    <DetailRow
                      label="Type"
                      value={
                        <span className={cn('gl-badge inline-flex items-center gap-1', typeEntry?.badge || 'gl-badge-neutral')}>
                          {activityTypeLabels[tp] || tp}
                        </span>
                      }
                    />
                    {activity.subtype && <DetailRow label="Sous-type" value={activity.subtype} />}
                    <DetailRow
                      label="Statut"
                      value={
                        <span className={cn('gl-badge', statusEntry?.badge || 'gl-badge-neutral')}>
                          {statusEntry?.label || st}
                        </span>
                      }
                    />
                    <DetailRow
                      label="Priorité"
                      value={
                        <span className={cn('text-sm font-medium', priorityEntry?.cls || 'text-muted-foreground')}>
                          {priorityEntry?.label || activity.priority}
                        </span>
                      }
                    />
                  </DetailFieldGrid>
                </FormSection>

                {/* Planning */}
                <FormSection title="Planning">
                  <DetailFieldGrid>
                    <InlineEditableRow
                      label="Date debut"
                      value={activity.start_date ? activity.start_date.slice(0, 10) : ''}
                      onSave={(v) => handleInlineSave('start_date', v)}
                      type="date"
                    />
                    <InlineEditableRow
                      label="Date fin"
                      value={activity.end_date ? activity.end_date.slice(0, 10) : ''}
                      onSave={(v) => handleInlineSave('end_date', v)}
                      type="date"
                    />
                    <InlineEditableRow
                      label="Debut reel"
                      value={activity.actual_start ? activity.actual_start.slice(0, 10) : ''}
                      onSave={(v) => handleInlineSave('actual_start', v)}
                      type="date"
                    />
                    <InlineEditableRow
                      label="Fin reelle"
                      value={activity.actual_end ? activity.actual_end.slice(0, 10) : ''}
                      onSave={(v) => handleInlineSave('actual_end', v)}
                      type="date"
                    />
                    <DetailRow
                      label="Mode POB"
                      value={activity.pax_quota_mode === 'variable' ? 'Variable (par jour)' : 'Constant'}
                    />
                    {activity.pax_quota_mode !== 'variable' ? (
                      <InlineEditableRow
                        label="Quota PAX"
                        value={String(activity.pax_quota ?? 0)}
                        onSave={(v) => handleInlineSave('pax_quota', v)}
                        type="number"
                      />
                    ) : (
                      <DetailRow
                        label="Quota PAX"
                        value={
                          <span className="inline-flex items-center gap-1">
                            <Users size={12} className="text-muted-foreground" />
                            {formatVariablePaxRange(activity.pax_quota_daily, activity.pax_quota)}
                            <span className="text-[10px] text-muted-foreground ml-1">(min–max journalier)</span>
                          </span>
                        }
                      />
                    )}
                  </DetailFieldGrid>
                </FormSection>

                {/* Rattachement */}
                <FormSection title="Rattachement">
                  <DetailFieldGrid>
                    <DetailRow label="Site" value={
                      activity.asset_id ? (
                        <CrossModuleLink module="assets" id={activity.asset_id} label={activity.asset_name || activity.asset_id} mode="navigate" />
                      ) : (activity.asset_name || '—')
                    } />
                    <DetailRow label="Projet" value={
                      activity.project_id ? (
                        <CrossModuleLink module="projets" id={activity.project_id} label={activity.project_name || activity.project_id} mode="navigate" />
                      ) : (activity.project_name || '—')
                    } />
                  </DetailFieldGrid>
                </FormSection>

                {/* Description */}
                <FormSection title="Description">
                  <InlineEditableRow label="Description" value={activity.description ?? ''} onSave={(v) => handleInlineSave('description', v)} />
                </FormSection>
              </div>

              <div className="@container space-y-5">
                {/* Details specialises (conditionnel) */}
                {tp === 'workover' && (activity.well_reference || activity.rig_name) && (
                  <FormSection title="Details specialises">
                    <DetailFieldGrid>
                      {activity.well_reference && <DetailRow label="Reference puits" value={activity.well_reference} />}
                      {activity.rig_name && <DetailRow label="Nom du rig" value={activity.rig_name} />}
                    </DetailFieldGrid>
                  </FormSection>
                )}

                {tp === 'drilling' && (activity.spud_date || activity.target_depth || activity.drilling_program_ref) && (
                  <FormSection title="Details specialises">
                    <DetailFieldGrid>
                      {activity.spud_date && <DetailRow label="Date spud" value={formatDateShort(activity.spud_date)} />}
                      {activity.target_depth != null && <DetailRow label="Profondeur cible" value={`${activity.target_depth} m`} />}
                      {activity.drilling_program_ref && <DetailRow label="Ref. programme forage" value={activity.drilling_program_ref} />}
                    </DetailFieldGrid>
                  </FormSection>
                )}

                {(tp === 'maintenance' || tp === 'integrity') && (activity.regulatory_ref || activity.work_order_ref) && (
                  <FormSection title="Details specialises">
                    <DetailFieldGrid>
                      {activity.regulatory_ref && <DetailRow label="Reference reglementaire" value={activity.regulatory_ref} />}
                      {activity.work_order_ref && <DetailRow label="Bon de travail" value={activity.work_order_ref} />}
                    </DetailFieldGrid>
                  </FormSection>
                )}

                {/* Workflow */}
                <FormSection title="Workflow">
                  <DetailFieldGrid>
                    <DetailRow label="Cree par" value={activity.created_by_name || '—'} />
                    {activity.submitted_by_name && (
                      <DetailRow
                        label="Soumis par"
                        value={`${activity.submitted_by_name}${activity.submitted_at ? ` — ${formatDateShort(activity.submitted_at)}` : ''}`}
                      />
                    )}
                    {activity.validated_by_name && (
                      <DetailRow
                        label="Valide par"
                        value={`${activity.validated_by_name}${activity.validated_at ? ` — ${formatDateShort(activity.validated_at)}` : ''}`}
                      />
                    )}
                    {st === 'rejected' && activity.rejection_reason && (
                      <DetailRow
                        label="Motif du rejet"
                        value={<span className="text-destructive">{activity.rejection_reason}</span>}
                      />
                    )}
                  </DetailFieldGrid>
                </FormSection>
              </div>
            </SectionColumns>

            {/* Dependencies */}
            <FormSection title="Dependances">
              {dependencies && dependencies.length > 0 ? (
                <div className="space-y-1.5">
                  {dependencies.map((dep: PlannerDependency) => (
                    <DependencyRow
                      key={dep.id}
                      dep={dep}
                      currentActivityId={id}
                      dependencyTypeOptions={dependencyTypeOptions}
                      onDelete={handleRemoveDep}
                      onUpdate={handleUpdateDep}
                      isPending={removeDependency.isPending || addDependency.isPending}
                    />
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">Aucune dependance</p>
              )}

              {showDepAdd ? (
                <div className="mt-3 space-y-2 p-2.5 rounded-lg border border-border bg-background-subtle">
                  <div className="grid grid-cols-1 gap-2">
                    <ActivityPicker
                      value={depForm.predecessor_id || null}
                      onChange={(actId) => setDepForm({ ...depForm, predecessor_id: actId || '' })}
                      excludeId={id}
                      label="Activité prédécesseur"
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-xs font-medium text-muted-foreground">Type</label>
                        <select
                          value={depForm.dependency_type}
                          onChange={(e) => setDepForm({ ...depForm, dependency_type: e.target.value })}
                          className={panelInputClass}
                        >
                          {dependencyTypeOptions.map((o) => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="text-xs font-medium text-muted-foreground">Delai (jours)</label>
                        <input
                          type="number"
                          value={depForm.lag_days}
                          onChange={(e) => setDepForm({ ...depForm, lag_days: parseInt(e.target.value) || 0 })}
                          className={panelInputClass}
                          min={0}
                        />
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button className="gl-button-sm gl-button-confirm" onClick={handleAddDep} disabled={addDependency.isPending}>
                      Ajouter
                    </button>
                    <button className="gl-button-sm gl-button-default" onClick={() => setShowDepAdd(false)}>
                      Annuler
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  className="mt-2 text-xs text-primary hover:underline inline-flex items-center gap-1"
                  onClick={() => setShowDepAdd(true)}
                >
                  <Plus size={11} /> Ajouter une dependance
                </button>
              )}
            </FormSection>

            {/* Recurrence (maintenance only) */}
            {tp === 'maintenance' && (
              <FormSection title="Recurrence">
                {showRecurrence ? (
                  <div className="space-y-2 p-2.5 rounded-lg border border-border bg-background-subtle">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-xs font-medium text-muted-foreground">Frequence</label>
                        <select
                          value={recForm.frequency}
                          onChange={(e) => setRecForm({ ...recForm, frequency: e.target.value })}
                          className={panelInputClass}
                        >
                          <option value="daily">Quotidien</option>
                          <option value="weekly">Hebdomadaire</option>
                          <option value="monthly">Mensuel</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-xs font-medium text-muted-foreground">Intervalle</label>
                        <input
                          type="number"
                          value={recForm.interval_value}
                          onChange={(e) => setRecForm({ ...recForm, interval_value: parseInt(e.target.value) || 1 })}
                          className={panelInputClass}
                          min={1}
                        />
                      </div>
                    </div>
                    {recForm.frequency === 'weekly' && (
                      <div>
                        <label className="text-xs font-medium text-muted-foreground">Jour de la semaine</label>
                        <select
                          value={recForm.day_of_week}
                          onChange={(e) => setRecForm({ ...recForm, day_of_week: parseInt(e.target.value) })}
                          className={panelInputClass}
                        >
                          {['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'].map((d, i) => (
                            <option key={i} value={i + 1}>{d}</option>
                          ))}
                        </select>
                      </div>
                    )}
                    <div>
                      <label className="text-xs font-medium text-muted-foreground">Date fin recurrence</label>
                      <input
                        type="date"
                        value={recForm.end_date}
                        onChange={(e) => setRecForm({ ...recForm, end_date: e.target.value })}
                        className={panelInputClass}
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <button className="gl-button-sm gl-button-confirm" onClick={handleSetRecurrence} disabled={setRecurrence.isPending}>
                        Configurer
                      </button>
                      <button className="gl-button-sm gl-button-default" onClick={() => setShowRecurrence(false)}>
                        Annuler
                      </button>
                      <button
                        className="gl-button-sm text-xs text-destructive hover:text-destructive/80 ml-auto"
                        onClick={() => deleteRecurrence.mutate(id, {
                          onSuccess: () => { toast({ title: 'Recurrence supprimee', variant: 'success' }); setShowRecurrence(false) },
                        })}
                        disabled={deleteRecurrence.isPending}
                      >
                        Supprimer recurrence
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    className="text-xs text-primary hover:underline inline-flex items-center gap-1"
                    onClick={() => setShowRecurrence(true)}
                  >
                    <Repeat size={11} /> Configurer la recurrence
                  </button>
                )}
              </FormSection>
            )}

            {/* Priority Override (DO-level action) */}
            <FormSection title="Actions avancees">
              {showPriorityOverride ? (
                <div className="space-y-2 p-2.5 rounded-lg border border-border bg-background-subtle">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs font-medium text-muted-foreground">Nouvelle priorite</label>
                      <select
                        value={priorityOverrideForm.priority}
                        onChange={(e) => setPriorityOverrideForm({ ...priorityOverrideForm, priority: e.target.value })}
                        className={panelInputClass}
                      >
                        {priorityOptions.map((o) => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Motif *</label>
                    <textarea
                      value={priorityOverrideForm.reason}
                      onChange={(e) => setPriorityOverrideForm({ ...priorityOverrideForm, reason: e.target.value })}
                      className={cn(panelInputClass, 'min-h-[50px] py-1.5')}
                      placeholder="Justification du changement de priorite..."
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      className="gl-button-sm gl-button-confirm"
                      onClick={handleOverridePriority}
                      disabled={!priorityOverrideForm.reason || overridePriority.isPending}
                    >
                      Appliquer
                    </button>
                    <button className="gl-button-sm gl-button-default" onClick={() => setShowPriorityOverride(false)}>
                      Annuler
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  className="text-xs text-primary hover:underline inline-flex items-center gap-1"
                  onClick={() => setShowPriorityOverride(true)}
                >
                  <ArrowUpDown size={11} /> Forcer la priorite (DO)
                </button>
              )}
            </FormSection>

            {/* Tags, Notes & Attachments */}
            <FormSection title="Tags, notes & fichiers" collapsible defaultExpanded={false}>
              <div className="space-y-3">
                <TagManager ownerType="planner_activity" ownerId={activity.id} compact />
                <AttachmentManager ownerType="planner_activity" ownerId={activity.id} compact />
                <NoteManager ownerType="planner_activity" ownerId={activity.id} compact />
              </div>
            </FormSection>
          </>
        )}
      </PanelContentLayout>

      {/* Impact Preview Modal */}
      {showImpact && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowImpact(false)}>
          <div className="bg-background rounded-lg border border-border shadow-lg w-full max-w-lg p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <AlertTriangle size={14} className="text-amber-500" />
              Impact de la modification
            </h3>
            {impactPreview.data ? (
              <div className="space-y-2 text-sm">
                <p className="text-muted-foreground">
                  Activite: <span className="text-foreground font-medium">{impactPreview.data.activity_title}</span>
                </p>
                {impactPreview.data.ads_affected > 0 && (
                  <p className="text-amber-600">AdS impactes: {impactPreview.data.ads_affected}</p>
                )}
                {impactPreview.data.manifests_affected > 0 && (
                  <p className="text-amber-600">Manifestes impactes: {impactPreview.data.manifests_affected}</p>
                )}
                {impactPreview.data.potential_conflict_days.length > 0 && (
                  <p className="text-destructive">
                    Jours de conflit potentiel: {impactPreview.data.potential_conflict_days.join(', ')}
                  </p>
                )}
                {impactPreview.data.changes.length > 0 && (
                  <div className="space-y-1">
                    <p className="font-medium">Modifications:</p>
                    {impactPreview.data.changes.map((c, i) => (
                      <div key={i} className="text-xs text-muted-foreground">
                        {c.field}: {c.old_value || '—'} &rarr; {c.new_value || '—'}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : impactPreview.isPending ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 size={16} className="animate-spin text-muted-foreground" />
              </div>
            ) : null}
            <div className="flex items-center gap-2 justify-end">
              <button className="gl-button-sm gl-button-default" onClick={() => { setShowImpact(false) }}>Annuler</button>
              <button
                className="gl-button-sm gl-button-confirm"
                onClick={doSave}
                disabled={updateActivity.isPending}
              >
                {updateActivity.isPending ? <Loader2 size={12} className="animate-spin" /> : 'Confirmer la modification'}
              </button>
            </div>
          </div>
        </div>
      )}
    </DynamicPanelShell>
  )
}

// ── Create Activity Panel ──────────────────────────────────────

function CreateActivityPanel() {
  const { toast } = useToast()
  const closeDynamicPanel = useUIStore((s) => s.closeDynamicPanel)
  const createActivity = useCreateActivity()
  const activityTypeLabels = useDictionaryLabels('planner_activity_type', ACTIVITY_TYPE_LABELS_FALLBACK)
  const priorityLabels = useDictionaryLabels('planner_activity_priority', PRIORITY_LABELS_FALLBACK)
  const activityTypeOptions = useMemo(() => buildDictionaryOptions(activityTypeLabels, PLANNER_ACTIVITY_TYPE_VALUES), [activityTypeLabels])
  const priorityOptions = useMemo(() => buildDictionaryOptions(priorityLabels, PLANNER_PRIORITY_VALUES), [priorityLabels])

  const [form, setForm] = useState<PlannerActivityCreate>({
    asset_id: '',
    project_id: null,
    parent_id: null,
    type: 'project',
    subtype: null,
    title: '',
    description: null,
    priority: 'medium',
    pax_quota: 0,
    pax_quota_mode: 'constant',
    pax_quota_daily: null,
    start_date: null,
    end_date: null,
    well_reference: null,
    rig_name: null,
    spud_date: null,
    target_depth: null,
    drilling_program_ref: null,
    regulatory_ref: null,
    work_order_ref: null,
  })

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault()
    createActivity.mutate(normalizeNames(form), {
      onSuccess: () => {
        toast({ title: 'Activite creee avec succes', variant: 'success' })
        closeDynamicPanel()
      },
      onError: () => toast({ title: "Erreur lors de la creation de l'activite", variant: 'error' }),
    })
  }, [form, createActivity, toast, closeDynamicPanel])

  return (
    <DynamicPanelShell
      title="Nouvelle activite"
      subtitle="Planner"
      icon={<CalendarRange size={14} className="text-primary" />}
      actions={
        <>
          <PanelActionButton onClick={closeDynamicPanel}>
            Annuler
          </PanelActionButton>
          <PanelActionButton
            variant="primary"
            disabled={createActivity.isPending}
            onClick={() => (document.getElementById('create-activity-form') as HTMLFormElement)?.requestSubmit()}
          >
            {createActivity.isPending ? <Loader2 size={12} className="animate-spin" /> : 'Creer'}
          </PanelActionButton>
        </>
      }
    >
      <form id="create-activity-form" onSubmit={handleSubmit}>
        <PanelContentLayout>
          <FormSection title="Informations generales">
            <FormGrid>
              <DynamicPanelField label="Titre" required>
                <input
                  type="text"
                  required
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  className={panelInputClass}
                  placeholder="Titre de l'activite"
                />
              </DynamicPanelField>
              <DynamicPanelField label="Site" required>
                <AssetPicker
                  value={form.asset_id || null}
                  onChange={(id) => setForm({ ...form, asset_id: id || '' })}
                  label="Site"
                />
              </DynamicPanelField>
              <DynamicPanelField label="Projet">
                <ProjectPicker
                  value={form.project_id || null}
                  onChange={(id) => setForm({ ...form, project_id: id })}
                  filterStatus={['draft', 'active', 'on_hold']}
                />
              </DynamicPanelField>
            </FormGrid>
          </FormSection>

          <FormSection title="Type et priorite">
            <FormGrid>
              <DynamicPanelField label="Type" required>
                <select
                  value={form.type}
                  onChange={(e) => setForm({ ...form, type: e.target.value })}
                  className={panelInputClass}
                >
                  {activityTypeOptions.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </DynamicPanelField>
              <DynamicPanelField label="Sous-type">
                <input
                  type="text"
                  value={form.subtype ?? ''}
                  onChange={(e) => setForm({ ...form, subtype: e.target.value || null })}
                  className={panelInputClass}
                  placeholder="Sous-type (optionnel)"
                />
              </DynamicPanelField>
              <DynamicPanelField label="Priorité">
                <select
                  value={form.priority || 'medium'}
                  onChange={(e) => setForm({ ...form, priority: e.target.value })}
                  className={panelInputClass}
                >
                  {priorityOptions.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </DynamicPanelField>
              <DynamicPanelField label="Mode POB">
                <select
                  value={form.pax_quota_mode || 'constant'}
                  onChange={(e) => setForm({ ...form, pax_quota_mode: e.target.value as 'constant' | 'variable' })}
                  className={panelInputClass}
                >
                  <option value="constant">Constant (meme valeur tous les jours)</option>
                  <option value="variable">Variable (par jour)</option>
                </select>
              </DynamicPanelField>
              {form.pax_quota_mode !== 'variable' && (
                <DynamicPanelField label="Quota PAX">
                  <input
                    type="number"
                    value={form.pax_quota ?? 0}
                    onChange={(e) => setForm({ ...form, pax_quota: parseInt(e.target.value) || 0 })}
                    className={panelInputClass}
                    min={0}
                    placeholder="0"
                  />
                </DynamicPanelField>
              )}
            </FormGrid>
            {form.pax_quota_mode === 'variable' && form.start_date && form.end_date && (
              <div className="mt-3">
                <p className="text-xs text-muted-foreground mb-2">Plan POB jour par jour :</p>
                <VariablePobEditor
                  startDate={form.start_date}
                  endDate={form.end_date}
                  value={(form.pax_quota_daily ?? null) as Record<string, number> | null}
                  onChange={(daily) => setForm({ ...form, pax_quota_daily: daily })}
                  defaultValue={form.pax_quota || 1}
                  compact
                />
              </div>
            )}
          </FormSection>

          <FormSection title="Planning">
            <DateRangePicker
              startDate={form.start_date ?? null}
              endDate={form.end_date ?? null}
              onStartChange={(v) => setForm({ ...form, start_date: v || null })}
              onEndChange={(v) => setForm({ ...form, end_date: v || null })}
            />
          </FormSection>

          <FormSection title="Description">
            <DynamicPanelField label="Description" span="full">
              <textarea
                value={form.description ?? ''}
                onChange={(e) => setForm({ ...form, description: e.target.value || null })}
                className={cn(panelInputClass, 'min-h-[80px] py-2')}
                placeholder="Description de l'activite..."
              />
            </DynamicPanelField>
          </FormSection>

          {/* Conditional fields: Workover */}
          {form.type === 'workover' && (
            <FormSection title="Details Workover">
              <FormGrid>
                <DynamicPanelField label="Reference puits">
                  <input
                    type="text"
                    value={form.well_reference ?? ''}
                    onChange={(e) => setForm({ ...form, well_reference: e.target.value || null })}
                    className={panelInputClass}
                    placeholder="Ref. puits"
                  />
                </DynamicPanelField>
                <DynamicPanelField label="Nom du rig">
                  <input
                    type="text"
                    value={form.rig_name ?? ''}
                    onChange={(e) => setForm({ ...form, rig_name: e.target.value || null })}
                    className={panelInputClass}
                    placeholder="Nom du rig"
                  />
                </DynamicPanelField>
              </FormGrid>
            </FormSection>
          )}

          {/* Conditional fields: Drilling */}
          {form.type === 'drilling' && (
            <FormSection title="Details Forage">
              <FormGrid>
                <DynamicPanelField label="Date spud">
                  <input
                    type="date"
                    value={form.spud_date ?? ''}
                    onChange={(e) => setForm({ ...form, spud_date: e.target.value || null })}
                    className={panelInputClass}
                  />
                </DynamicPanelField>
                <DynamicPanelField label="Profondeur cible (m)">
                  <input
                    type="number"
                    value={form.target_depth ?? ''}
                    onChange={(e) => setForm({ ...form, target_depth: parseFloat(e.target.value) || null })}
                    className={panelInputClass}
                    placeholder="Profondeur en metres"
                  />
                </DynamicPanelField>
                <DynamicPanelField label="Ref. programme forage">
                  <input
                    type="text"
                    value={form.drilling_program_ref ?? ''}
                    onChange={(e) => setForm({ ...form, drilling_program_ref: e.target.value || null })}
                    className={panelInputClass}
                    placeholder="Reference programme"
                  />
                </DynamicPanelField>
              </FormGrid>
            </FormSection>
          )}

          {/* Conditional fields: Maintenance / Integrity */}
          {(form.type === 'maintenance' || form.type === 'integrity') && (
            <FormSection title="Details Maintenance / Integrite">
              <FormGrid>
                <DynamicPanelField label="Reference reglementaire">
                  <input
                    type="text"
                    value={form.regulatory_ref ?? ''}
                    onChange={(e) => setForm({ ...form, regulatory_ref: e.target.value || null })}
                    className={panelInputClass}
                    placeholder="Ref. reglementaire"
                  />
                </DynamicPanelField>
                <DynamicPanelField label="Bon de travail">
                  <input
                    type="text"
                    value={form.work_order_ref ?? ''}
                    onChange={(e) => setForm({ ...form, work_order_ref: e.target.value || null })}
                    className={panelInputClass}
                    placeholder="No. bon de travail"
                  />
                </DynamicPanelField>
              </FormGrid>
            </FormSection>
          )}
        </PanelContentLayout>
      </form>
    </DynamicPanelShell>
  )
}

// -- Module-level renderer registration --
registerPanelRenderer('planner', (view) => {
  if (view.type === 'create') return <CreateActivityPanel />
  if (view.type === 'detail' && 'id' in view) return <ActivityDetailPanel id={view.id} />
  return null
})
