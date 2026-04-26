/**
 * Activities tab — PlannerPage.
 *
 * Extracted from the monolithic PlannerPage.tsx. Behavior preserved 1:1.
 */
import { useState, useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import {
  CalendarRange, ListTodo, Clock, Users, CheckCircle2, Send, Ban, ChevronDown, ChevronUp, BarChart3,
  AlertTriangle, Check, X, Trash2,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { DataTable } from '@/components/ui/DataTable/DataTable'
import type { ColumnDef } from '@tanstack/react-table'
import { useDebounce } from '@/hooks/useDebounce'
import { usePageSize } from '@/hooks/usePageSize'
import { useFilterPersistence } from '@/hooks/useFilterPersistence'
import { useDictionaryLabels } from '@/hooks/useDictionary'
import { PanelContent } from '@/components/layout/PanelHeader'
import { useUIStore } from '@/stores/uiStore'
import { CrossModuleLink } from '@/components/shared/CrossModuleLink'
import { AssetPicker } from '@/components/shared/AssetPicker'
import { ProjectPicker } from '@/components/shared/ProjectPicker'
import { useToast } from '@/components/ui/Toast'
import { useConfirm, usePromptInput } from '@/components/ui/ConfirmDialog'
import {
  useActivities,
  useDeleteActivity,
  useSubmitActivity,
  useValidateActivity,
  useRejectActivity,
  useCancelActivity,
} from '@/hooks/usePlanner'
import { usePermission } from '@/hooks/usePermission'
import type { PlannerActivity } from '@/types/api'
import {
  ACTIVITY_STATUS_LABELS_FALLBACK,
  ACTIVITY_STATUS_BADGES,
  ACTIVITY_TYPE_LABELS_FALLBACK,
  ACTIVITY_TYPE_META,
  PRIORITY_LABELS_FALLBACK,
  PRIORITY_BADGE_MAP,
  PLANNER_ACTIVITY_STATUS_VALUES,
  PLANNER_ACTIVITY_TYPE_VALUES,
  StatusBadge,
  StatCard,
  buildDictionaryOptions,
  formatDateShort,
  extractApiError,
} from '../shared'

interface ActivitiesTabFilters {
  search: string
  statusFilter: string
  typeFilter: string
  priorityFilter: string
  assetId: string | null
  projectId: string | null
  startDate: string | null
  endDate: string | null
}

const DEFAULT_ACTIVITIES_FILTERS: ActivitiesTabFilters = {
  search: '',
  statusFilter: '',
  typeFilter: '',
  priorityFilter: '',
  assetId: null,
  projectId: null,
  startDate: null,
  endDate: null,
}

export function ActivitiesTab({ scenarioId }: { scenarioId?: string }) {
  const { t } = useTranslation()
  const [page, setPage] = useState(1)
  const { pageSize } = usePageSize()
  const [showStats, setShowStats] = useState(false)
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false)
  const [filters, setFilters] = useFilterPersistence<ActivitiesTabFilters>(
    'planner.activities.filters',
    DEFAULT_ACTIVITIES_FILTERS,
  )
  const debouncedSearch = useDebounce(filters.search, 300)
  const openDynamicPanel = useUIStore((s) => s.openDynamicPanel)
  const confirmDialog = useConfirm()
  const promptInput = usePromptInput()
  const { toast } = useToast()
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
  const priorityOptions = useMemo(() => buildDictionaryOptions(priorityLabels, ['low', 'medium', 'high', 'critical']), [priorityLabels])

  const updateFilter = useCallback(
    <K extends keyof ActivitiesTabFilters>(key: K, value: ActivitiesTabFilters[K]) => {
      setFilters((prev) => ({ ...prev, [key]: value }))
      setPage(1)
    },
    [setFilters],
  )

  const hasAdvancedFilters =
    !!filters.priorityFilter || !!filters.assetId || !!filters.projectId || !!filters.startDate || !!filters.endDate

  const resetFilters = useCallback(() => {
    setFilters(DEFAULT_ACTIVITIES_FILTERS)
    setPage(1)
  }, [setFilters])

  const { data, isLoading } = useActivities({
    page,
    page_size: pageSize,
    search: debouncedSearch || undefined,
    status: filters.statusFilter || undefined,
    type: filters.typeFilter || undefined,
    priority: filters.priorityFilter || undefined,
    asset_id: filters.assetId || undefined,
    project_id: filters.projectId || undefined,
    start_date: filters.startDate || undefined,
    end_date: filters.endDate || undefined,
    scenario_id: scenarioId,
  })

  const items: PlannerActivity[] = data?.items ?? []
  const total = data?.total ?? 0

  const stats = useMemo(() => {
    const submitted = items.filter((a) => a.status === 'submitted').length
    const inProgress = items.filter((a) => a.status === 'in_progress').length
    const validated = items.filter((a) => a.status === 'validated').length
    const totalPax = items.reduce((sum, a) => sum + (a.pax_quota ?? 0), 0)
    // En retard: end_date past + status not completed/cancelled.
    const today = Date.now()
    const overdue = items.filter((a) => {
      if (!a.end_date) return false
      if (a.status === 'completed' || a.status === 'cancelled') return false
      return new Date(a.end_date).getTime() < today
    }).length
    return { submitted, inProgress, validated, totalPax, overdue }
  }, [items])

  // ── Sparklines ──
  // Per-stat: 8-week trailing distribution computed from the loaded
  // items' start_date. Gives a cheap "activity load over time"
  // visual without needing a backend stats history endpoint (which
  // would be the proper V2 source).
  const sparklines = useMemo(() => {
    const buckets = 8
    const weekMs = 7 * 86_400_000
    const now = Date.now()
    const bucketStart = now - buckets * weekMs
    const init = () => Array.from({ length: buckets }, () => 0)
    const total = init()
    const submitted = init()
    const inProgress = init()
    const validated = init()
    const overdue = init()
    const pax = init()
    for (const a of items) {
      const t = a.start_date ? new Date(a.start_date).getTime() : null
      if (!t || t < bucketStart || t > now) continue
      const idx = Math.min(buckets - 1, Math.max(0, Math.floor((t - bucketStart) / weekMs)))
      total[idx]++
      if (a.status === 'submitted') submitted[idx]++
      if (a.status === 'in_progress') inProgress[idx]++
      if (a.status === 'validated') validated[idx]++
      if (a.end_date) {
        const e = new Date(a.end_date).getTime()
        if (e < now && a.status !== 'completed' && a.status !== 'cancelled') overdue[idx]++
      }
      pax[idx] += a.pax_quota ?? 0
    }
    return { total, submitted, inProgress, validated, overdue, pax }
  }, [items])

  const handleAction = useCallback((e: React.MouseEvent, action: () => void) => {
    e.stopPropagation()
    action()
  }, [])

  const columns = useMemo<ColumnDef<PlannerActivity, unknown>[]>(() => [
    {
      accessorKey: 'title',
      header: t('planner.columns.title'),
      cell: ({ row }) => (
        <span className="font-medium text-foreground truncate block max-w-[280px]" title={row.original.title}>{row.original.title}</span>
      ),
    },
    {
      accessorKey: 'asset_name',
      header: t('planner.columns.asset', 'Installation'),
      size: 160,
      cell: ({ row }) => {
        if (!row.original.asset_name) return <span className="text-muted-foreground text-xs">—</span>
        if (row.original.asset_id) {
          return <CrossModuleLink module="assets" id={row.original.asset_id} label={row.original.asset_name} showIcon={false} className="text-xs truncate block max-w-[150px]" />
        }
        return <span className="text-xs text-muted-foreground truncate block max-w-[150px]" title={row.original.asset_name}>{row.original.asset_name}</span>
      },
    },
    {
      accessorKey: 'type',
      header: t('planner.columns.type'),
      size: 130,
      cell: ({ row }) => {
        const meta = ACTIVITY_TYPE_META[row.original.type]
        const TIcon = meta?.icon || ListTodo
        return (
          <span className={cn('gl-badge inline-flex items-center gap-1', meta?.badge || 'gl-badge-neutral')}>
            <TIcon size={10} />
            {activityTypeLabels[row.original.type] || row.original.type}
          </span>
        )
      },
    },
    {
      accessorKey: 'priority',
      header: t('planner.columns.priority'),
      size: 90,
      cell: ({ row }) => (
        <span className={cn(
          'inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ring-1 ring-inset',
          PRIORITY_BADGE_MAP[row.original.priority] || 'bg-muted text-muted-foreground ring-border',
        )}>
          {priorityLabels[row.original.priority] || row.original.priority}
        </span>
      ),
    },
    {
      accessorKey: 'pax_quota',
      header: t('planner.columns.pax'),
      size: 60,
      cell: ({ row }) => {
        const act = row.original
        const displayPob = act.has_children && act.children_pob_total != null
          ? `\u03A3${act.children_pob_total}`
          : String(act.pax_quota)
        return (
          <span className="inline-flex items-center gap-1 text-xs" title={act.has_children ? 'Somme POB enfants' : undefined}>
            <Users size={11} className="text-muted-foreground" />
            {displayPob}
          </span>
        )
      },
    },
    {
      accessorKey: 'start_date',
      header: t('planner.columns.start_date'),
      size: 100,
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground tabular-nums whitespace-nowrap">
          {formatDateShort(row.original.start_date)}
        </span>
      ),
    },
    {
      accessorKey: 'end_date',
      header: t('planner.columns.end_date'),
      size: 100,
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground tabular-nums whitespace-nowrap">
          {formatDateShort(row.original.end_date)}
        </span>
      ),
    },
    {
      id: 'duration_bar',
      header: 'Avancement',
      size: 130,
      cell: ({ row }) => <ActivityDurationBar activity={row.original} />,
    },
    {
      accessorKey: 'status',
      header: t('planner.columns.status'),
      size: 110,
      cell: ({ row }) => <StatusBadge status={row.original.status} labels={activityStatusLabels} badges={ACTIVITY_STATUS_BADGES} />,
    },
    {
      id: 'actions',
      header: '',
      size: 130,
      cell: ({ row }) => {
        const s = row.original.status
        return (
          <div className="flex items-center gap-0.5 justify-end">
            {s === 'draft' && (
              <RowIconBtn
                icon={Send}
                tone="primary"
                title="Soumettre pour validation"
                onClick={(e) => handleAction(e, () => submitActivity.mutate(row.original.id, {
                  onSuccess: () => toast({ title: t('planner.toast.activity_submitted'), variant: 'success' }),
                  onError: (err) => toast({
                    title: t('planner.toast.submission_refused'),
                    description: extractApiError(err),
                    variant: 'error',
                  }),
                }))}
              />
            )}
            {s === 'submitted' && (
              <>
                <RowIconBtn
                  icon={Check}
                  tone="emerald"
                  title="Valider"
                  onClick={(e) => handleAction(e, () => validateActivity.mutate(row.original.id, {
                    onSuccess: () => toast({ title: t('planner.toast.activity_validated'), variant: 'success' }),
                    onError: (err) => toast({
                      title: t('planner.toast.validation_refused'),
                      description: extractApiError(err),
                      variant: 'error',
                    }),
                  }))}
                />
                <RowIconBtn
                  icon={X}
                  tone="rose"
                  title={t('common.reject')}
                  onClick={(e) => handleAction(e, async () => {
                    const reason = await promptInput({ title: t('planner.toast.reject_activity_title'), placeholder: 'Motif du rejet...' })
                    if (reason !== null) rejectActivity.mutate({ id: row.original.id, reason }, {
                      onSuccess: () => toast({ title: t('planner.toast.activity_rejected'), variant: 'success' }),
                      onError: (err) => toast({
                        title: t('planner.toast.rejection_refused'),
                        description: extractApiError(err),
                        variant: 'error',
                      }),
                    })
                  })}
                />
              </>
            )}
            {!['completed', 'cancelled'].includes(s) && (
              <RowIconBtn
                icon={Ban}
                tone="amber"
                title={t('common.cancel')}
                onClick={(e) => handleAction(e, async () => {
                  const ok = await confirmDialog({ title: 'Annuler ?', message: 'Annuler cette activité ?', confirmLabel: 'Annuler', variant: 'warning' })
                  if (ok) cancelActivity.mutate(row.original.id)
                })}
              />
            )}
            {canDelete && (
              <RowIconBtn
                icon={Trash2}
                tone="rose"
                title={t('common.delete')}
                onClick={(e) => handleAction(e, async () => {
                  const ok = await confirmDialog({ title: 'Supprimer ?', message: 'Supprimer cette activité ?', confirmLabel: 'Supprimer', variant: 'danger' })
                  if (ok) deleteActivity.mutate(row.original.id)
                })}
              />
            )}
          </div>
        )
      },
    },
  ], [activityStatusLabels, activityTypeLabels, canDelete, cancelActivity, deleteActivity, handleAction, priorityLabels, rejectActivity, submitActivity, validateActivity, toast, confirmDialog, promptInput, t])

  return (
    <>
      {/* Stats grid — collapsible on mobile, always visible on desktop */}
      <div className="border-b border-border">
        {/* Mobile toggle button */}
        <button
          type="button"
          onClick={() => setShowStats(!showStats)}
          className="md:hidden w-full flex items-center justify-between px-4 py-2 text-sm font-medium text-foreground hover:bg-accent/5 transition-colors"
        >
          <span className="flex items-center gap-2">
            <BarChart3 size={14} className="text-muted-foreground" />
            Statistiques
          </span>
          {showStats ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>

        {/* Stats grid — clickable cards that drive the status filter.
            Active card highlights when its filter is set; click again
            to clear (TOTAL = clear all status filter). */}
        <div className={cn(
          "grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 px-4 py-3",
          showStats ? "block" : "hidden md:grid"
        )}>
          <StatCard
            label={t('planner.stats.total')}
            value={total}
            icon={ListTodo}
            sparkline={sparklines.total}
            onClick={() => updateFilter('statusFilter', '')}
            active={!filters.statusFilter}
          />
          <StatCard
            label="En retard"
            value={stats.overdue}
            icon={AlertTriangle}
            accent="text-red-600 dark:text-red-400"
            sparkline={sparklines.overdue}
          />
          <StatCard
            label={t('planner.stats.pending_validation')}
            value={stats.submitted}
            icon={Clock}
            accent="text-blue-600 dark:text-blue-400"
            sparkline={sparklines.submitted}
            onClick={() => updateFilter('statusFilter', filters.statusFilter === 'submitted' ? '' : 'submitted')}
            active={filters.statusFilter === 'submitted'}
          />
          <StatCard
            label="Validées"
            value={stats.validated}
            icon={CheckCircle2}
            accent="text-emerald-600 dark:text-emerald-400"
            sparkline={sparklines.validated}
            onClick={() => updateFilter('statusFilter', filters.statusFilter === 'validated' ? '' : 'validated')}
            active={filters.statusFilter === 'validated'}
          />
          <StatCard
            label={t('planner.stats.in_progress')}
            value={stats.inProgress}
            icon={CalendarRange}
            accent="text-amber-600 dark:text-amber-400"
            sparkline={sparklines.inProgress}
            onClick={() => updateFilter('statusFilter', filters.statusFilter === 'in_progress' ? '' : 'in_progress')}
            active={filters.statusFilter === 'in_progress'}
          />
          <StatCard
            label={t('planner.stats.pax_planned')}
            value={stats.totalPax}
            icon={Users}
            sparkline={sparklines.pax}
          />
        </div>
      </div>

      <PanelContent scroll={false}>
        <DataTable<PlannerActivity>
          columns={columns}
          data={items}
          isLoading={isLoading}
          pagination={data ? { page: data.page, pageSize, total: data.total, pages: data.pages } : undefined}
          onPaginationChange={(p) => setPage(p)}
          searchValue={filters.search}
          onSearchChange={(v) => updateFilter('search', v)}
          searchPlaceholder="Rechercher…"
          toolbarLeft={
            // Asset + Projet remain as inline async pickers — they're
            // entity pickers (200+ options each, async load + search)
            // which the DataTable's static-options filter system
            // can't host natively. Type / Priorité / Période moved
            // INTO the visual search bar as filter tokens (see the
            // `filters` prop below).
            <div className="flex items-center gap-1.5 min-w-0">
              <div className="hidden md:flex items-center gap-1.5 min-w-0">
                <div className="w-[160px] min-w-0">
                  <AssetPicker
                    value={filters.assetId}
                    onChange={(id) => updateFilter('assetId', id)}
                    placeholder="Asset"
                    clearable
                  />
                </div>
                <div className="w-[160px] min-w-0">
                  <ProjectPicker
                    value={filters.projectId}
                    onChange={(id) => updateFilter('projectId', id)}
                    placeholder="Projet"
                    clearable
                  />
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
                className="md:hidden h-7 px-2 text-[10px] border border-border rounded inline-flex items-center gap-1 hover:bg-muted/50"
                title="Asset / Projet"
              >
                {(filters.assetId || filters.projectId) && (
                  <span className="inline-flex items-center justify-center h-3.5 w-3.5 rounded-full bg-primary text-primary-foreground text-[9px] font-bold">
                    {[filters.assetId, filters.projectId].filter(Boolean).length}
                  </span>
                )}
                Filtres
                {showAdvancedFilters ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
              </button>
              {hasAdvancedFilters && (
                <button
                  type="button"
                  onClick={resetFilters}
                  className="h-7 px-2 text-[10px] border border-border rounded hover:bg-muted/50 shrink-0"
                  title="Réinitialiser tous les filtres"
                >
                  Réinitialiser
                </button>
              )}
            </div>
          }
          filters={[
            {
              id: 'status',
              label: t('common.status'),
              type: 'multi-select',
              operators: ['is', 'is_not'],
              options: activityStatusOptions.filter((o) => o.value).map((o) => ({ value: o.value, label: o.label })),
            },
            {
              id: 'type',
              label: t('planner.filters.all_types'),
              type: 'select',
              operators: ['is'],
              options: activityTypeOptions.filter((o) => o.value).map((o) => ({ value: o.value, label: o.label })),
            },
            {
              id: 'priority',
              label: t('planner.filters.all_priorities'),
              type: 'select',
              operators: ['is'],
              options: priorityOptions.filter((o) => o.value).map((o) => ({ value: o.value, label: o.label })),
            },
            {
              id: 'period',
              label: 'Période',
              type: 'date-range',
            },
          ]}
          activeFilters={{
            ...(filters.statusFilter ? { status: [filters.statusFilter] } : {}),
            ...(filters.typeFilter ? { type: filters.typeFilter } : {}),
            ...(filters.priorityFilter ? { priority: filters.priorityFilter } : {}),
            ...((filters.startDate || filters.endDate) ? { period: [filters.startDate, filters.endDate] } : {}),
          }}
          onFilterChange={(id, v) => {
            if (id === 'status') {
              const arr = Array.isArray(v) ? v : v != null ? [v] : []
              updateFilter('statusFilter', arr.length > 0 ? String(arr[0]) : '')
              return
            }
            if (id === 'type') {
              updateFilter('typeFilter', v ? String(v) : '')
              return
            }
            if (id === 'priority') {
              updateFilter('priorityFilter', v ? String(v) : '')
              return
            }
            if (id === 'period') {
              const arr = Array.isArray(v) ? v : []
              updateFilter('startDate', (arr[0] as string | null) || null)
              updateFilter('endDate', (arr[1] as string | null) || null)
              return
            }
          }}
          onRowClick={(row) => openDynamicPanel({ type: 'detail', module: 'planner', id: row.id, meta: { subtype: 'activity' } })}
          emptyIcon={ListTodo}
          emptyTitle="Aucune activité"
          importExport={canExport ? {
            exportFormats: ['csv', 'xlsx'],
            advancedExport: true,
            filenamePrefix: 'planning',
            exportHeaders: {
              title: 'Titre',
              asset_name: 'Installation',
              type: 'Type',
              priority: 'Priorité',
              pax_quota: 'PAX',
              start_date: 'Début',
              end_date: 'Fin',
              status: 'Statut',
            },
            // Full Import Wizard wired to the backend
            // PlannerActivityHandler — supports column mapping,
            // transforms, validation preview, and duplicate strategy.
            importWizardTarget: 'planner_activity',
          } : undefined}
          storageKey="planner-activities"
        />
        {/* Mobile collapsible — only Asset + Projet pickers since
            type/priorité/période are now filter tokens inside the
            visual search bar (which works on mobile too). */}
        {showAdvancedFilters && (
          <div className="md:hidden flex flex-wrap items-center gap-2 px-3 py-2 border-b border-border bg-background-subtle">
            <div className="flex-1 min-w-[150px]">
              <AssetPicker
                value={filters.assetId}
                onChange={(id) => updateFilter('assetId', id)}
                placeholder="Asset"
                clearable
              />
            </div>
            <div className="flex-1 min-w-[150px]">
              <ProjectPicker
                value={filters.projectId}
                onChange={(id) => updateFilter('projectId', id)}
                placeholder="Projet"
                clearable
              />
            </div>
          </div>
        )}
      </PanelContent>
    </>
  )
}

// ──────────────────────────────────────────────────────────────────────
// RowIconBtn — uniform compact icon button used by the row actions.
// All actions share the same 24×24 footprint, muted at rest, tinted
// on hover according to their semantic tone.
// ──────────────────────────────────────────────────────────────────────
function RowIconBtn({
  icon: Icon, tone, title, onClick,
}: {
  icon: LucideIcon
  tone: 'primary' | 'emerald' | 'rose' | 'amber'
  title: string
  onClick: (e: React.MouseEvent) => void
}) {
  const toneClass =
    tone === 'primary' ? 'hover:bg-primary/10 hover:text-primary'
    : tone === 'emerald' ? 'hover:bg-emerald-500/10 hover:text-emerald-600 dark:hover:text-emerald-400'
    : tone === 'rose' ? 'hover:bg-rose-500/10 hover:text-rose-600 dark:hover:text-rose-400'
    : 'hover:bg-amber-500/10 hover:text-amber-600 dark:hover:text-amber-400'
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      className={cn(
        'inline-flex items-center justify-center w-6 h-6 rounded text-muted-foreground transition-colors',
        toneClass,
      )}
    >
      <Icon size={13} strokeWidth={2.25} />
    </button>
  )
}

// ──────────────────────────────────────────────────────────────────────
// ActivityDurationBar — per-row mini POB sparkline.
//   - When the activity has `pax_quota_daily` (a daily POB map), we
//     plot the actual curve over the activity's date range.
//   - Otherwise we synthesise a flat curve at `pax_quota` so the user
//     still sees the duration + today position.
//   - Vertical 'today' line is drawn only when the activity is in
//     progress (today between start_date and end_date). Past and
//     future activities show only the curve, no today marker.
//   - The curve is filled below for visual weight; tone tracks the
//     activity status (emerald done, red overdue, primary live,
//     muted future, zinc cancelled).
// ──────────────────────────────────────────────────────────────────────
function ActivityDurationBar({ activity }: { activity: PlannerActivity }) {
  const start = activity.start_date ? new Date(activity.start_date).getTime() : null
  const end = activity.end_date ? new Date(activity.end_date).getTime() : null
  if (!start || !end || end <= start) {
    return <span className="text-[10px] text-muted-foreground/60">—</span>
  }
  const now = Date.now()
  const totalMs = end - start
  const totalDays = Math.max(1, Math.round(totalMs / 86_400_000))
  const isPast = now > end
  const isFuture = now < start
  const isLive = !isPast && !isFuture
  const elapsedPct = isPast ? 100 : isFuture ? 0 : ((now - start) / totalMs) * 100

  // Build POB curve. Sample ~24 points across the activity duration.
  // If `pax_quota_daily` is provided we read it day by day; otherwise
  // we plot a flat line at `pax_quota` (still useful — shows the
  // duration + today position).
  const sampleCount = Math.min(48, Math.max(8, totalDays))
  const dayMs = 86_400_000
  const daily = activity.pax_quota_daily
  const baseQuota = activity.pax_quota ?? 0
  const samples: number[] = []
  for (let i = 0; i < sampleCount; i++) {
    const t = start + (i / (sampleCount - 1)) * totalMs
    if (daily) {
      const key = new Date(Math.floor(t / dayMs) * dayMs).toISOString().slice(0, 10)
      samples.push(daily[key] ?? baseQuota)
    } else {
      samples.push(baseQuota)
    }
  }
  const max = Math.max(...samples, 1)
  const min = 0

  // Geometry — width fills, fixed compact height.
  const W = 100, H = 22
  const pts = samples.map((v, i) => {
    const x = (i / (sampleCount - 1)) * W
    const y = H - 2 - ((v - min) / (max - min || 1)) * (H - 4)
    return [x, y] as const
  })
  const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ')
  const area = `${line} L${W},${H} L0,${H} Z`

  const tone = activity.status === 'completed' ? '#10b981'
    : activity.status === 'cancelled' ? '#a1a1aa'
    : isPast ? '#ef4444'
    : isLive ? 'hsl(var(--primary))'
    : '#94a3b8'

  // Display % — the schedule progress (calendar-elapsed % of duration).
  const pctLabel = `${Math.round(elapsedPct)}%`

  return (
    <div className="flex items-center gap-1.5 min-w-0">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        height={H}
        preserveAspectRatio="none"
        className="flex-1 min-w-[60px]"
        aria-label={`POB ${activity.pax_quota} sur ${totalDays}j`}
      >
        {/* Filled area + line */}
        <path d={area} fill={tone} fillOpacity={0.18} />
        <path d={line} fill="none" stroke={tone} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
        {/* Today vertical line — only for in-progress activities. */}
        {isLive && (
          <line
            x1={(elapsedPct / 100) * W} x2={(elapsedPct / 100) * W}
            y1={1} y2={H - 1}
            stroke="hsl(var(--foreground))"
            strokeWidth={1.2}
            strokeDasharray="2,2"
            opacity={0.85}
          />
        )}
      </svg>
      <span className="text-[10px] tabular-nums text-muted-foreground shrink-0 min-w-[28px] text-right">{pctLabel}</span>
    </div>
  )
}
