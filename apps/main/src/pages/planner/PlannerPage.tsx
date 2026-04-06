/**
 * Planner page — Gantt, Activites, Conflits, Capacite.
 *
 * Static Panel: tab bar + content per tab.
 * Dynamic Panel: create/detail forms per entity.
 */
import { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import {
  CalendarRange, ListTodo, AlertTriangle, BarChart3, Plus,
  Calendar, Clock, Users, CheckCircle2, XCircle, Send, Ban,
  Wrench, HardHat, Gauge, Shield, Drill, Pencil, Trash2, Link2, Loader2,
  ChevronLeft, ChevronRight, GanttChart, Eye, Repeat, ArrowUpDown,
  FlaskConical, TrendingUp,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { normalizeNames } from '@/lib/normalize'
import { DataTable } from '@/components/ui/DataTable/DataTable'
import type { ColumnDef } from '@tanstack/react-table'
import { useDebounce } from '@/hooks/useDebounce'
import { usePageSize } from '@/hooks/usePageSize'
import { PanelHeader, PanelContent, ToolbarButton } from '@/components/layout/PanelHeader'
import { useUIStore } from '@/stores/uiStore'
import {
  DynamicPanelShell,
  PanelContentLayout,
  FormSection,
  FormGrid,
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
import { TagManager } from '@/components/shared/TagManager'
import { NoteManager } from '@/components/shared/NoteManager'
import { AttachmentManager } from '@/components/shared/AttachmentManager'
import { CrossModuleLink } from '@/components/shared/CrossModuleLink'
import { AssetPicker } from '@/components/shared/AssetPicker'
import { ProjectPicker } from '@/components/shared/ProjectPicker'
import { DateRangePicker } from '@/components/shared/DateRangePicker'
import { useToast } from '@/components/ui/Toast'
import { useConfirm, usePromptInput } from '@/components/ui/ConfirmDialog'
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
  useResolveConflict,
  // useBulkResolveConflicts — available, wired into ConflitsTab in a future pass
  // useConflictAudit — available, wired into conflict detail panel in a future pass
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
  GanttActivity, GanttAsset,
  AssetCapacity,
  ProposedActivity, ScenarioResult, ForecastDay,
} from '@/types/api'

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

const ACTIVITY_STATUS_OPTIONS = [
  { value: '', label: 'Tous' },
  { value: 'draft', label: 'Brouillon' },
  { value: 'submitted', label: 'Soumis' },
  { value: 'validated', label: 'Valide' },
  { value: 'in_progress', label: 'En cours' },
  { value: 'completed', label: 'Terminé' },
  { value: 'rejected', label: 'Rejete' },
  { value: 'cancelled', label: 'Annulé' },
]

const ACTIVITY_STATUS_MAP: Record<string, { label: string; badge: string }> = {
  draft: { label: 'Brouillon', badge: 'gl-badge-neutral' },
  submitted: { label: 'Soumis', badge: 'gl-badge-info' },
  validated: { label: 'Valide', badge: 'gl-badge-success' },
  rejected: { label: 'Rejete', badge: 'gl-badge-danger' },
  in_progress: { label: 'En cours', badge: 'gl-badge-warning' },
  completed: { label: 'Terminé', badge: 'gl-badge-success' },
  cancelled: { label: 'Annulé', badge: 'gl-badge-neutral' },
}

const ACTIVITY_TYPE_MAP: Record<string, { label: string; badge: string; icon: typeof Wrench }> = {
  project: { label: 'Projet', badge: 'gl-badge-info', icon: ListTodo },
  workover: { label: 'Workover', badge: 'gl-badge-warning', icon: Wrench },
  drilling: { label: 'Forage', badge: 'gl-badge-danger', icon: Drill },
  integrity: { label: 'Integrite', badge: 'gl-badge-success', icon: Shield },
  maintenance: { label: 'Maintenance', badge: 'gl-badge-warning', icon: HardHat },
  permanent_ops: { label: 'Ops permanentes', badge: 'gl-badge-neutral', icon: Gauge },
  inspection: { label: 'Inspection', badge: 'gl-badge-info', icon: Eye },
  event: { label: 'Evenement', badge: 'gl-badge-neutral', icon: Calendar },
}

const PRIORITY_MAP: Record<string, { label: string; cls: string }> = {
  low: { label: 'Basse', cls: 'text-muted-foreground' },
  medium: { label: 'Moyenne', cls: 'text-foreground' },
  high: { label: 'Haute', cls: 'text-amber-600 dark:text-amber-400' },
  critical: { label: 'Critique', cls: 'text-destructive font-semibold' },
}

const CONFLICT_STATUS_MAP: Record<string, { label: string; badge: string }> = {
  open: { label: 'Ouvert', badge: 'gl-badge-danger' },
  resolved: { label: 'Resolu', badge: 'gl-badge-success' },
  deferred: { label: 'Differe', badge: 'gl-badge-warning' },
}

const RESOLUTION_OPTIONS = [
  { value: 'approve_both', label: 'Approuver les deux' },
  { value: 'reschedule', label: 'Replanifier' },
  { value: 'reduce_pax', label: 'Reduire PAX' },
  { value: 'cancel', label: 'Annuler une activite' },
  { value: 'deferred', label: 'Reporter la decision' },
]

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

function StatusBadge({ status, map }: { status: string; map: Record<string, { label: string; badge: string }> }) {
  const entry = map[status]
  return (
    <span className={cn('gl-badge', entry?.badge || 'gl-badge-neutral')}>
      {entry?.label || status.replace(/_/g, ' ')}
    </span>
  )
}

function formatDateShort(d: string | null | undefined) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
}

function formatDateOnly(d: string | null | undefined) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })
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

// ── Gantt Tab ─────────────────────────────────────────────────

type TimeUnit = 'week' | 'month' | 'quarter'

/* Legacy GanttTab — replaced by GanttView.tsx */
/* @ts-expect-error keeping code for reference */
function _GanttTabLegacy() { // eslint-disable-line
  const openDynamicPanel = useUIStore((s) => s.openDynamicPanel)

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
          {Object.entries(ACTIVITY_TYPE_MAP).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="h-6 px-1.5 text-xs border border-border rounded bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
        >
          {ACTIVITY_STATUS_OPTIONS.map((o) => (
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
        const t = ACTIVITY_TYPE_MAP[row.original.type]
        const TIcon = t?.icon || ListTodo
        return (
          <span className={cn('gl-badge inline-flex items-center gap-1', t?.badge || 'gl-badge-neutral')}>
            <TIcon size={10} />
            {t?.label || row.original.type}
          </span>
        )
      },
    },
    {
      accessorKey: 'priority',
      header: 'Priorité',
      size: 90,
      cell: ({ row }) => {
        const p = PRIORITY_MAP[row.original.priority]
        return (
          <span className={cn('text-xs font-medium', p?.cls || 'text-muted-foreground')}>
            {p?.label || row.original.priority}
          </span>
        )
      },
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
      cell: ({ row }) => <StatusBadge status={row.original.status} map={ACTIVITY_STATUS_MAP} />,
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
  ], [deleteActivity, submitActivity, validateActivity, rejectActivity, cancelActivity, handleAction, canDelete])

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
          {ACTIVITY_STATUS_OPTIONS.map((opt) => (
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
          {Object.entries(ACTIVITY_TYPE_MAP).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
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
  const [page, setPage] = useState(1)
  const { pageSize } = usePageSize()
  const [statusFilter, setStatusFilter] = useState('')
  const resolveConflict = useResolveConflict()

  const { data, isLoading } = useConflicts({
    page,
    page_size: pageSize,
    status: statusFilter || undefined,
  })

  const items: PlannerConflict[] = data?.items ?? []
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

  const handleResolve = useCallback(() => {
    if (!resolveModal || !resolution) return
    resolveConflict.mutate(
      { id: resolveModal, payload: { resolution, resolution_note: resolutionNote || undefined } },
      { onSuccess: () => { setResolveModal(null); setResolution(''); setResolutionNote('') } },
    )
  }, [resolveModal, resolution, resolutionNote, resolveConflict])

  const CONFLICT_STATUS_OPTIONS = [
    { value: '', label: 'Tous' },
    { value: 'open', label: 'Ouverts' },
    { value: 'resolved', label: 'Resolus' },
    { value: 'deferred', label: 'Differes' },
  ]

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
        const opt = RESOLUTION_OPTIONS.find((o) => o.value === row.original.resolution)
        return <span className="text-xs text-muted-foreground">{opt?.label || row.original.resolution}</span>
      },
    },
    {
      accessorKey: 'status',
      header: 'Statut',
      size: 100,
      cell: ({ row }) => <StatusBadge status={row.original.status} map={CONFLICT_STATUS_MAP} />,
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
            Resoudre
          </button>
        )
      },
    },
  ], [resolveConflict.isPending])

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
          {CONFLICT_STATUS_OPTIONS.map((opt) => (
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

      <PanelContent>
        <DataTable<PlannerConflict>
          columns={columns}
          data={items}
          isLoading={isLoading}
          pagination={data ? { page: data.page, pageSize, total: data.total, pages: data.pages } : undefined}
          onPaginationChange={(p) => setPage(p)}
          emptyIcon={AlertTriangle}
          emptyTitle="Aucun conflit"
          storageKey="planner-conflicts"
        />
      </PanelContent>

      {/* Resolve conflict modal */}
      {resolveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setResolveModal(null)}>
          <div className="bg-background rounded-lg border border-border shadow-lg w-full max-w-md p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-foreground">Resoudre le conflit</h3>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Resolution</label>
              <select
                value={resolution}
                onChange={(e) => setResolution(e.target.value)}
                className="w-full h-8 px-2 text-sm border border-border rounded bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="">Choisir...</option>
                {RESOLUTION_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Note (optionnel)</label>
              <textarea
                value={resolutionNote}
                onChange={(e) => setResolutionNote(e.target.value)}
                className="w-full min-h-[60px] px-2 py-1.5 text-sm border border-border rounded bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                placeholder="Commentaire de resolution..."
              />
            </div>
            <div className="flex items-center gap-2 justify-end">
              <button className="gl-button-sm gl-button-default" onClick={() => setResolveModal(null)}>Annuler</button>
              <button
                className="gl-button-sm gl-button-confirm"
                onClick={handleResolve}
                disabled={!resolution || resolveConflict.isPending}
              >
                {resolveConflict.isPending ? <Loader2 size={12} className="animate-spin" /> : 'Confirmer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// ── Capacity Tab ──────────────────────────────────────────────

function CapacityTab() {
  const [assetId, setAssetId] = useState('')
  const [dateRange_, setDateRange_] = useState(() => {
    const today = new Date()
    const from = toISODate(today)
    const to = toISODate(new Date(today.getTime() + 30 * 86400000))
    return { from, to }
  })

  // Heatmap data
  const { data: heatmapData, isLoading: heatmapLoading } = useCapacityHeatmap(
    dateRange_.from,
    dateRange_.to,
    assetId || undefined,
  )

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

  // Group heatmap by week for calendar layout
  const weeks = useMemo(() => {
    if (heatmapDays.length === 0) return []
    const grouped: typeof heatmapDays[] = []
    let currentWeek: typeof heatmapDays = []
    for (const day of heatmapDays) {
      const d = new Date(day.date)
      if (currentWeek.length > 0 && d.getDay() === 1) {
        grouped.push(currentWeek)
        currentWeek = []
      }
      currentWeek.push(day)
    }
    if (currentWeek.length > 0) grouped.push(currentWeek)
    return grouped
  }, [heatmapDays])

  function saturationColor(pct: number): string {
    if (pct > 100) return 'bg-destructive text-destructive-foreground'
    if (pct > 90) return 'bg-red-500/80 text-white'
    if (pct > 70) return 'bg-amber-500/70 text-foreground'
    if (pct > 40) return 'bg-emerald-500/40 text-foreground'
    return 'bg-emerald-500/20 text-foreground'
  }

  const capacityItems: AssetCapacity[] = capacityHistory ?? []

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
          onStartChange={(v) => setDateRange_((prev) => ({ ...prev, from: v }))}
          onEndChange={(v) => setDateRange_((prev) => ({ ...prev, to: v }))}
          startLabel="Du"
          endLabel="Au"
        />
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
              {assetId ? 'Aucune donnee' : 'Consulter la capacite'}
            </h3>
            <p className="text-sm text-muted-foreground max-w-sm">
              {assetId
                ? 'Aucune donnee de capacite trouvee pour ce site et cette periode.'
                : "Saisissez l'identifiant du site et la plage de dates pour visualiser la carte de chaleur."}
            </p>
          </div>
        ) : (
          <div className="space-y-6 p-4">
            {/* Heatmap calendar */}
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-3">Carte de chaleur — Saturation journaliere</h3>
              <div className="space-y-1">
                {/* Day-of-week header */}
                <div className="flex gap-1 pl-0">
                  {['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'].map((d) => (
                    <div key={d} className="w-10 text-center text-[9px] text-muted-foreground font-medium">{d}</div>
                  ))}
                </div>
                {weeks.map((week, wi) => (
                  <div key={wi} className="flex gap-1">
                    {/* Pad start of first week */}
                    {wi === 0 && Array.from({ length: (new Date(week[0].date).getDay() + 6) % 7 }).map((_, i) => (
                      <div key={`pad-${i}`} className="w-10 h-10" />
                    ))}
                    {week.map((day) => (
                      <div
                        key={day.date}
                        className={cn(
                          'w-10 h-10 rounded flex flex-col items-center justify-center cursor-default',
                          saturationColor(day.saturation_pct),
                        )}
                        title={`${day.date}: ${day.used}/${day.max} (${day.saturation_pct.toFixed(0)}%)`}
                      >
                        <span className="text-[9px] font-medium leading-none">{new Date(day.date).getDate()}</span>
                        <span className="text-[8px] leading-none mt-0.5">{day.saturation_pct.toFixed(0)}%</span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
              {/* Legend */}
              <div className="flex items-center gap-3 mt-3">
                <span className="text-[10px] text-muted-foreground">Legende:</span>
                <div className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-emerald-500/20" /><span className="text-[10px] text-muted-foreground">&lt;40%</span></div>
                <div className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-emerald-500/40" /><span className="text-[10px] text-muted-foreground">40-70%</span></div>
                <div className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-amber-500/70" /><span className="text-[10px] text-muted-foreground">70-90%</span></div>
                <div className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-red-500/80" /><span className="text-[10px] text-muted-foreground">90-100%</span></div>
                <div className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-destructive" /><span className="text-[10px] text-muted-foreground">&gt;100%</span></div>
              </div>
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
  const [assetId, setAssetId] = useState('')
  const [horizon, setHorizon] = useState(90)
  const { data, isLoading } = useForecast(assetId || undefined, horizon)

  return (
    <div className="p-4 space-y-4 overflow-y-auto">
      <div className="text-xs text-muted-foreground mb-2">
        <TrendingUp size={12} className="inline mr-1 text-primary" />
        Prévision de charge basée sur les 90 derniers jours + activités planifiées.
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
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className={cn('border rounded p-2 text-center', data.summary.at_risk_days > 0 ? 'border-orange-500/30 bg-orange-500/5' : '')}>
              <div className="text-[9px] uppercase text-muted-foreground">Jours à risque (&gt;80%)</div>
              <div className={cn('text-lg font-semibold tabular-nums', data.summary.at_risk_days > 0 && 'text-orange-600')}>{data.summary.at_risk_days}</div>
            </div>
            <div className="border rounded p-2 text-center">
              <div className="text-[9px] uppercase text-muted-foreground">Charge moy. projetée</div>
              <div className="text-lg font-semibold tabular-nums">{data.summary.avg_projected_load}</div>
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

export function PlannerPage() {
  const [activeTab, setActiveTab] = useState<PlannerTab>('gantt')
  const dynamicPanel = useUIStore((s) => s.dynamicPanel)
  const openDynamicPanel = useUIStore((s) => s.openDynamicPanel)
  const panelMode = useUIStore((s) => s.dynamicPanelMode)

  const isFullPanel = panelMode === 'full' && dynamicPanel !== null && dynamicPanel.module === 'planner'

  const { hasPermission } = usePermission()
  const canCreate = hasPermission('planner.activity.create')

  const handleCreate = useCallback(() => {
    openDynamicPanel({ type: 'create', module: 'planner', meta: { subtype: 'activity' } })
  }, [openDynamicPanel])

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

          {activeTab === 'gantt' && <GanttView />}
          {activeTab === 'activities' && <ActivitiesTab />}
          {activeTab === 'conflicts' && <ConflitsTab />}
          {activeTab === 'capacity' && <CapacityTab />}
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

const ACTIVITY_TYPE_OPTIONS = [
  { value: 'project', label: 'Projet' },
  { value: 'workover', label: 'Workover' },
  { value: 'drilling', label: 'Forage' },
  { value: 'integrity', label: 'Integrite' },
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'permanent_ops', label: 'Ops permanentes' },
  { value: 'inspection', label: 'Inspection' },
  { value: 'event', label: 'Evenement' },
]

const PRIORITY_OPTIONS = [
  { value: 'low', label: 'Basse' },
  { value: 'medium', label: 'Moyenne' },
  { value: 'high', label: 'Haute' },
  { value: 'critical', label: 'Critique' },
]

const DEP_TYPE_OPTIONS = [
  { value: 'FS', label: 'Fin-Debut (FS)' },
  { value: 'SS', label: 'Debut-Debut (SS)' },
  { value: 'FF', label: 'Fin-Fin (FF)' },
]

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

  const [editing, setEditing] = useState(false)
  const [editForm, setEditForm] = useState<Record<string, unknown>>({})

  // Dependency add form
  const [depForm, setDepForm] = useState({ predecessor_id: '', dependency_type: 'FS', lag_days: 0 })
  const [showDepAdd, setShowDepAdd] = useState(false)

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

  const typeEntry = ACTIVITY_TYPE_MAP[tp]
  const priorityEntry = PRIORITY_MAP[activity.priority]
  const statusEntry = ACTIVITY_STATUS_MAP[st]

  return (
    <DynamicPanelShell
      title={activity.title}
      subtitle={typeEntry?.label || tp}
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
                    {ACTIVITY_TYPE_OPTIONS.map((o) => (
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
                    {PRIORITY_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </DynamicPanelField>
                <DynamicPanelField label="Quota PAX">
                  <input
                    type="number"
                    value={editForm.pax_quota as number}
                    onChange={(e) => setEditForm({ ...editForm, pax_quota: parseInt(e.target.value) || 0 })}
                    className={panelInputClass}
                    min={0}
                  />
                </DynamicPanelField>
              </FormGrid>
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
                  <InlineEditableRow label="Titre" value={activity.title} onSave={(v) => handleInlineSave('title', v)} />
                  <DetailRow
                    label="Type"
                    value={
                      <span className={cn('gl-badge inline-flex items-center gap-1', typeEntry?.badge || 'gl-badge-neutral')}>
                        {typeEntry?.label || tp}
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
                </FormSection>

                {/* Planning */}
                <FormSection title="Planning">
                  <DetailRow label="Date debut" value={formatDateShort(activity.start_date)} />
                  <DetailRow label="Date fin" value={formatDateShort(activity.end_date)} />
                  <DetailRow label="Debut reel" value={formatDateShort(activity.actual_start)} />
                  <DetailRow label="Fin reelle" value={formatDateShort(activity.actual_end)} />
                  <DetailRow
                    label="Quota PAX"
                    value={
                      <span className="inline-flex items-center gap-1">
                        <Users size={12} className="text-muted-foreground" />
                        {activity.pax_quota}
                      </span>
                    }
                  />
                </FormSection>

                {/* Rattachement */}
                <FormSection title="Rattachement">
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
                    {activity.well_reference && <DetailRow label="Reference puits" value={activity.well_reference} />}
                    {activity.rig_name && <DetailRow label="Nom du rig" value={activity.rig_name} />}
                  </FormSection>
                )}

                {tp === 'drilling' && (activity.spud_date || activity.target_depth || activity.drilling_program_ref) && (
                  <FormSection title="Details specialises">
                    {activity.spud_date && <DetailRow label="Date spud" value={formatDateShort(activity.spud_date)} />}
                    {activity.target_depth != null && <DetailRow label="Profondeur cible" value={`${activity.target_depth} m`} />}
                    {activity.drilling_program_ref && <DetailRow label="Ref. programme forage" value={activity.drilling_program_ref} />}
                  </FormSection>
                )}

                {(tp === 'maintenance' || tp === 'integrity') && (activity.regulatory_ref || activity.work_order_ref) && (
                  <FormSection title="Details specialises">
                    {activity.regulatory_ref && <DetailRow label="Reference reglementaire" value={activity.regulatory_ref} />}
                    {activity.work_order_ref && <DetailRow label="Bon de travail" value={activity.work_order_ref} />}
                  </FormSection>
                )}

                {/* Workflow */}
                <FormSection title="Workflow">
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
                </FormSection>
              </div>
            </SectionColumns>

            {/* Dependencies */}
            <FormSection title="Dependances">
              {dependencies && dependencies.length > 0 ? (
                <div className="space-y-1.5">
                  {dependencies.map((dep: PlannerDependency) => (
                    <div key={dep.id} className="flex items-center gap-2 py-1.5 px-2 rounded border border-border/50 text-xs">
                      <Link2 size={11} className="text-muted-foreground shrink-0" />
                      <span className="text-muted-foreground truncate flex-1">
                        {dep.predecessor_id === id ? `Successeur: ${dep.successor_id}` : `Predecesseur: ${dep.predecessor_id}`}
                      </span>
                      <span className="gl-badge gl-badge-neutral text-[10px]">{dep.dependency_type}</span>
                      {dep.lag_days !== 0 && (
                        <span className="text-muted-foreground text-[10px]">+{dep.lag_days}j</span>
                      )}
                      <button
                        onClick={() => handleRemoveDep(dep.id)}
                        className="p-0.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                        title="Supprimer"
                      >
                        <XCircle size={11} />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">Aucune dependance</p>
              )}

              {showDepAdd ? (
                <div className="mt-3 space-y-2 p-2.5 rounded-lg border border-border bg-background-subtle">
                  <div className="grid grid-cols-1 gap-2">
                    <div>
                      <label className="text-xs font-medium text-muted-foreground">ID predecesseur</label>
                      <input
                        type="text"
                        value={depForm.predecessor_id}
                        onChange={(e) => setDepForm({ ...depForm, predecessor_id: e.target.value })}
                        className={panelInputClass}
                        placeholder="UUID de l'activite..."
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-xs font-medium text-muted-foreground">Type</label>
                        <select
                          value={depForm.dependency_type}
                          onChange={(e) => setDepForm({ ...depForm, dependency_type: e.target.value })}
                          className={panelInputClass}
                        >
                          {DEP_TYPE_OPTIONS.map((o) => (
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
                        {PRIORITY_OPTIONS.map((o) => (
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

  const [form, setForm] = useState<PlannerActivityCreate>({
    asset_id: '',
    project_id: null,
    type: 'project',
    subtype: null,
    title: '',
    description: null,
    priority: 'medium',
    pax_quota: 0,
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
                  {ACTIVITY_TYPE_OPTIONS.map((o) => (
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
                  {PRIORITY_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </DynamicPanelField>
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
            </FormGrid>
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
