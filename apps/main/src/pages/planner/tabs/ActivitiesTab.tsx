/**
 * Activities tab — PlannerPage.
 *
 * Extracted from the monolithic PlannerPage.tsx. Behavior preserved 1:1.
 */
import { useState, useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import {
  CalendarRange, ListTodo, Clock, Users, CheckCircle2, XCircle, Send, Ban, ChevronDown, ChevronUp, BarChart3,
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
                  title={t('common.reject')}
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

        {/* Stats grid — hidden by default on mobile, always shown on desktop */}
        <div className={cn(
          "grid grid-cols-2 sm:grid-cols-4 gap-3 px-4 py-3",
          showStats ? "block" : "hidden md:grid"
        )}>
          <StatCard label={t('planner.stats.total')} value={total} icon={ListTodo} />
          <StatCard label={t('planner.stats.pending_validation')} value={stats.submitted} icon={Clock} accent="text-blue-600 dark:text-blue-400" />
          <StatCard label={t('planner.stats.in_progress')} value={stats.inProgress} icon={CalendarRange} accent="text-amber-600 dark:text-amber-400" />
          <StatCard label={t('planner.stats.pax_planned')} value={stats.totalPax} icon={Users} />
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
