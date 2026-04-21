/**
 * Activities tab — PlannerPage.
 *
 * Extracted from the monolithic PlannerPage.tsx. Behavior preserved 1:1.
 */
import { useState, useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import {
  CalendarRange, ListTodo, Clock, Users, CheckCircle2, XCircle, Send, Ban,
} from 'lucide-react'
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
  PRIORITY_CLASS_MAP,
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
    return { submitted, inProgress, validated, totalPax }
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
      cell: ({ row }) => <span className={cn('text-xs font-medium', PRIORITY_CLASS_MAP[row.original.priority] || 'text-muted-foreground')}>{priorityLabels[row.original.priority] || row.original.priority}</span>,
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
      accessorKey: 'status',
      header: t('planner.columns.status'),
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
                className="gl-button gl-button-confirm"
                onClick={(e) => handleAction(e, () => submitActivity.mutate(row.original.id, {
                  onSuccess: () => toast({ title: t('planner.toast.activity_submitted'), variant: 'success' }),
                  onError: (err) => toast({
                    title: t('planner.toast.submission_refused'),
                    description: extractApiError(err),
                    variant: 'error',
                  }),
                }))}
                title="Soumettre"
              >
                <Send size={12} />
              </button>
            )}
            {s === 'submitted' && (
              <>
                <button
                  className="p-1 rounded hover:bg-emerald-500/10 text-muted-foreground hover:text-emerald-600"
                  onClick={(e) => handleAction(e, () => validateActivity.mutate(row.original.id, {
                    onSuccess: () => toast({ title: t('planner.toast.activity_validated'), variant: 'success' }),
                    onError: (err) => toast({
                      title: t('planner.toast.validation_refused'),
                      description: extractApiError(err),
                      variant: 'error',
                    }),
                  }))}
                  title="Valider"
                >
                  <CheckCircle2 size={12} />
                </button>
                <button
                  className="gl-button gl-button-danger"
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
                  title="Rejeter"
                >
                  <XCircle size={12} />
                </button>
              </>
            )}
            {!['completed', 'cancelled'].includes(s) && (
              <button
                className="gl-button gl-button-danger"
                onClick={(e) => handleAction(e, async () => {
                  const ok = await confirmDialog({ title: 'Annuler ?', message: 'Annuler cette activité ?', confirmLabel: 'Annuler', variant: 'warning' })
                  if (ok) cancelActivity.mutate(row.original.id)
                })}
                title={t('common.cancel')}
              >
                <Ban size={12} />
              </button>
            )}
            {canDelete && (
              <button
                className="gl-button gl-button-danger"
                onClick={(e) => handleAction(e, async () => {
                  const ok = await confirmDialog({ title: 'Supprimer ?', message: 'Supprimer cette activité ?', confirmLabel: 'Supprimer', variant: 'danger' })
                  if (ok) deleteActivity.mutate(row.original.id)
                })}
                title={t('common.delete')}
              >
                <span className="text-xs">&times;</span>
              </button>
            )}
          </div>
        )
      },
    },
  ], [activityStatusLabels, activityTypeLabels, canDelete, cancelActivity, deleteActivity, handleAction, priorityLabels, rejectActivity, submitActivity, validateActivity, toast, confirmDialog, promptInput, t])

  return (
    <>
      {/* Stats grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 px-4 py-3 border-b border-border">
        <StatCard label={t('planner.stats.total')} value={total} icon={ListTodo} />
        <StatCard label={t('planner.stats.pending_validation')} value={stats.submitted} icon={Clock} accent="text-blue-600 dark:text-blue-400" />
        <StatCard label={t('planner.stats.in_progress')} value={stats.inProgress} icon={CalendarRange} accent="text-amber-600 dark:text-amber-400" />
        <StatCard label={t('planner.stats.pax_planned')} value={stats.totalPax} icon={Users} />
      </div>

      {/* Filter bar — wraps on narrow viewports so status chips +
          type/priority selects don't squash each other. */}
      <div className="flex flex-wrap items-center gap-2 gap-y-1.5 border-b border-border px-3.5 py-1.5 sm:h-9 sm:py-0 sm:flex-nowrap shrink-0">
        <div className="flex items-center gap-1 overflow-x-auto scrollbar-none">
          {activityStatusOptions.map((opt) => (
            <button
              key={opt.value}
              onClick={() => updateFilter('statusFilter', opt.value)}
              className={cn(
                'px-2 py-0.5 rounded text-xs font-medium transition-colors whitespace-nowrap',
                filters.statusFilter === opt.value ? 'bg-primary/[0.16] text-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <select
          value={filters.typeFilter}
          onChange={(e) => updateFilter('typeFilter', e.target.value)}
          className="h-6 px-1.5 text-xs border border-border rounded bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary ml-1"
        >
          <option value="">{t('planner.filters.all_types')}</option>
          {activityTypeOptions.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
        <select
          value={filters.priorityFilter}
          onChange={(e) => updateFilter('priorityFilter', e.target.value)}
          className="h-6 px-1.5 text-xs border border-border rounded bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
        >
          <option value="">{t('planner.filters.all_priorities')}</option>
          {priorityOptions.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
        {hasAdvancedFilters && (
          <button
            type="button"
            onClick={resetFilters}
            className="gl-button gl-button-sm gl-button-default h-6 text-[10px]"
            title="Réinitialiser tous les filtres"
          >
            Réinitialiser
          </button>
        )}
        {data && <span className="text-xs text-muted-foreground ml-auto shrink-0">{total} activites</span>}
      </div>

      {/* Advanced filter row (asset, project, date range) — wraps
          to 2 rows on mobile so each picker has room to breathe. */}
      <div className="flex flex-wrap items-center gap-2 gap-y-1.5 border-b border-border px-3.5 py-1.5 sm:h-10 sm:py-0 sm:flex-nowrap shrink-0 bg-background-subtle">
        <div className="flex-1 min-w-[180px] max-w-[260px]">
          <AssetPicker
            value={filters.assetId}
            onChange={(id) => updateFilter('assetId', id)}
            placeholder="Tous assets"
            clearable
          />
        </div>
        <div className="flex-1 min-w-[180px] max-w-[260px]">
          <ProjectPicker
            value={filters.projectId}
            onChange={(id) => updateFilter('projectId', id)}
            placeholder="Tous projets"
            clearable
          />
        </div>
        <div className="flex items-center gap-1.5 sm:ml-auto shrink-0">
          <span className="text-[10px] uppercase text-muted-foreground tracking-wide hidden sm:inline">Période</span>
          <input
            type="date"
            className="gl-form-input text-xs h-7 w-[125px] sm:w-[130px]"
            value={filters.startDate ?? ''}
            onChange={(e) => updateFilter('startDate', e.target.value || null)}
            title="Début"
          />
          <span className="text-muted-foreground text-xs">→</span>
          <input
            type="date"
            className="gl-form-input text-xs h-7 w-[125px] sm:w-[130px]"
            value={filters.endDate ?? ''}
            onChange={(e) => updateFilter('endDate', e.target.value || null)}
            min={filters.startDate ?? undefined}
            title="Fin"
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
          searchPlaceholder="Rechercher par titre..."
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
          } : undefined}
          storageKey="planner-activities"
        />
      </PanelContent>
    </>
  )
}
