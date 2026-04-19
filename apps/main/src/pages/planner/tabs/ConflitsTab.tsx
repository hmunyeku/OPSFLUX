/**
 * Conflicts tab — PlannerPage.
 *
 * Extracted from the monolithic PlannerPage.tsx. Behavior preserved 1:1.
 */
import { useState, useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, Clock, CheckCircle2, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { DataTable } from '@/components/ui/DataTable/DataTable'
import type { ColumnDef } from '@tanstack/react-table'
import { usePageSize } from '@/hooks/usePageSize'
import { useFilterPersistence } from '@/hooks/useFilterPersistence'
import { useDictionaryLabels } from '@/hooks/useDictionary'
import { PanelContent } from '@/components/layout/PanelHeader'
import { panelInputClass } from '@/components/layout/DynamicPanel'
import { CrossModuleLink } from '@/components/shared/CrossModuleLink'
import { AssetPicker } from '@/components/shared/AssetPicker'
import { useToast } from '@/components/ui/Toast'
import {
  useConflicts,
  useRevisionSignals,
  useRevisionSignalImpactSummary,
  useAcknowledgeRevisionSignal,
  useRevisionDecisionRequests,
  useRequestRevisionDecision,
  useRespondRevisionDecisionRequest,
  useForceRevisionDecisionRequest,
  useAcceptCounterRevisionDecision,
  useResolveConflict,
  useConflictAudit,
  useBulkResolveConflicts,
} from '@/hooks/usePlanner'
import type {
  PlannerConflict,
  PlannerRevisionSignal,
  PlannerRevisionDecisionRequest,
} from '@/types/api'
import {
  CONFLICT_STATUS_LABELS_FALLBACK,
  CONFLICT_STATUS_BADGES,
  RESOLUTION_LABELS_FALLBACK,
  PLANNER_CONFLICT_STATUS_VALUES,
  PLANNER_RESOLUTION_VALUES,
  PLANNER_ACTIVITY_STATUS_VALUES,
  StatusBadge,
  StatCard,
  buildDictionaryOptions,
  formatDateShort,
  extractApiError,
} from '../shared'

interface ConflitsTabFilters {
  statusFilter: string
  conflictTypeFilter: string
  assetId: string | null
  dateFrom: string | null
  dateTo: string | null
}

const DEFAULT_CONFLITS_FILTERS: ConflitsTabFilters = {
  statusFilter: '',
  conflictTypeFilter: '',
  assetId: null,
  dateFrom: null,
  dateTo: null,
}

export function ConflitsTab() {
  const { t } = useTranslation()
  const [page, setPage] = useState(1)
  const { pageSize } = usePageSize()
  const [conflictFilters, setConflictFilters] = useFilterPersistence<ConflitsTabFilters>(
    'planner.conflicts.filters',
    DEFAULT_CONFLITS_FILTERS,
  )
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
  const { toast } = useToast()
  const resolveConflict = useResolveConflict()
  const acknowledgeRevisionSignal = useAcknowledgeRevisionSignal()
  const requestRevisionDecision = useRequestRevisionDecision()
  const respondRevisionDecisionRequest = useRespondRevisionDecisionRequest()
  const forceRevisionDecisionRequest = useForceRevisionDecisionRequest()
  const acceptCounterRevision = useAcceptCounterRevisionDecision()
  const [forceReasonModal, setForceReasonModal] = useState<PlannerRevisionDecisionRequest | null>(null)
  const [forceReasonText, setForceReasonText] = useState('')
  const { data: revisionSignalsData, isLoading: revisionSignalsLoading } = useRevisionSignals({ page: 1, page_size: 6 })
  const { data: incomingRevisionRequestsData, isLoading: incomingRevisionRequestsLoading } = useRevisionDecisionRequests({ page: 1, page_size: 6, direction: 'incoming', status: 'pending' })
  const { data: outgoingRevisionRequestsData, isLoading: outgoingRevisionRequestsLoading } = useRevisionDecisionRequests({ page: 1, page_size: 6, direction: 'outgoing', status: 'all' })
  const { data: revisionImpactSummary, isLoading: revisionImpactLoading } = useRevisionSignalImpactSummary(expandedRevisionSignalId ?? undefined)
  const conflictStatusLabels = useDictionaryLabels('planner_conflict_status', CONFLICT_STATUS_LABELS_FALLBACK)
  const resolutionLabels = useDictionaryLabels('planner_conflict_resolution', RESOLUTION_LABELS_FALLBACK)
  const conflictStatusOptions = useMemo(() => buildDictionaryOptions(conflictStatusLabels, PLANNER_CONFLICT_STATUS_VALUES, 'Tous'), [conflictStatusLabels])
  const resolutionOptions = useMemo(() => buildDictionaryOptions(resolutionLabels, PLANNER_RESOLUTION_VALUES), [resolutionLabels])

  const updateConflictFilter = useCallback(
    <K extends keyof ConflitsTabFilters>(key: K, value: ConflitsTabFilters[K]) => {
      setConflictFilters((prev) => ({ ...prev, [key]: value }))
      setPage(1)
    },
    [setConflictFilters],
  )

  const hasAdvancedConflictFilters =
    !!conflictFilters.conflictTypeFilter ||
    !!conflictFilters.assetId ||
    !!conflictFilters.dateFrom ||
    !!conflictFilters.dateTo

  const resetConflictFilters = useCallback(() => {
    setConflictFilters(DEFAULT_CONFLITS_FILTERS)
    setPage(1)
  }, [setConflictFilters])

  const { data, isLoading } = useConflicts({
    page,
    page_size: pageSize,
    status: conflictFilters.statusFilter || undefined,
    asset_id: conflictFilters.assetId || undefined,
    conflict_date_from: conflictFilters.dateFrom || undefined,
    conflict_date_to: conflictFilters.dateTo || undefined,
    conflict_type: conflictFilters.conflictTypeFilter || undefined,
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

  const [bulkSelection, setBulkSelection] = useState<PlannerConflict[]>([])
  const [bulkResolveOpen, setBulkResolveOpen] = useState(false)
  const [bulkResolution, setBulkResolution] = useState('')
  const [bulkResolutionNote, setBulkResolutionNote] = useState('')
  const bulkResolveConflicts = useBulkResolveConflicts()

  const handleResolve = useCallback(() => {
    if (!resolveModal || !resolution) return
    resolveConflict.mutate(
      { id: resolveModal, payload: { resolution, resolution_note: resolutionNote || undefined } },
      { onSuccess: () => { setResolveModal(null); setResolution(''); setResolutionNote('') } },
    )
  }, [resolveModal, resolution, resolutionNote, resolveConflict])

  const handleBulkResolve = useCallback(() => {
    if (!bulkResolution) return
    const openOnly = bulkSelection.filter((c) => c.status === 'open')
    if (openOnly.length === 0) {
      setBulkResolveOpen(false)
      return
    }
    bulkResolveConflicts.mutate(
      openOnly.map((c) => ({
        conflict_id: c.id,
        resolution: bulkResolution,
        resolution_note: bulkResolutionNote || undefined,
      })),
      {
        onSuccess: (result) => {
          setBulkResolveOpen(false)
          setBulkResolution('')
          setBulkResolutionNote('')
          setBulkSelection([])
          const errCount = result.errors?.length ?? 0
          toast({
            title: t('planner.toast.conflicts_resolved', { count: result.resolved }),
            description: errCount > 0
              ? t('planner.toast.errors_count', { count: errCount, skipped: result.skipped })
              : result.skipped > 0 ? t('planner.toast.skipped_count', { count: result.skipped }) : undefined,
            variant: errCount > 0 ? 'error' : 'success',
          })
        },
        onError: (err) => toast({
          title: t('planner.toast.bulk_resolve_failed'),
          description: extractApiError(err),
          variant: 'error',
        }),
      },
    )
  }, [bulkResolution, bulkResolutionNote, bulkSelection, bulkResolveConflicts, toast, t])

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
      header: t('planner.columns.site'),
      cell: ({ row }) => row.original.asset_id
        ? <CrossModuleLink module="assets" id={row.original.asset_id} label={row.original.asset_name || row.original.asset_id} showIcon={false} className="font-medium" />
        : <span className="font-medium text-foreground">{row.original.asset_name || '—'}</span>,
    },
    {
      accessorKey: 'conflict_date',
      header: t('planner.columns.conflict_date'),
      size: 120,
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground tabular-nums whitespace-nowrap">
          {formatDateShort(row.original.conflict_date)}
        </span>
      ),
    },
    {
      accessorKey: 'conflict_type',
      header: t('planner.columns.type'),
      size: 130,
      cell: ({ row }) => {
        const ct = row.original.conflict_type
        const overflow = row.original.overflow_amount
        const isPriority = ct === 'priority_clash'
        return (
          <span
            className={cn(
              'gl-badge inline-flex items-center gap-1',
              isPriority ? 'gl-badge-purple' : 'gl-badge-warning',
            )}
            title={isPriority ? 'Conflit de priorité' : `Dépassement POB${overflow != null ? ` (+${overflow})` : ''}`}
          >
            {isPriority ? 'Priorité' : 'POB'}
            {!isPriority && overflow != null && overflow > 0 && (
              <span className="tabular-nums">+{overflow}</span>
            )}
          </span>
        )
      },
    },
    {
      id: 'activities',
      header: t('planner.columns.activities_involved'),
      cell: ({ row }) => (
        <div className="flex flex-col gap-0.5 max-w-[250px]">
          {row.original.activity_titles.length > 0 ? (
            row.original.activity_titles.map((title, i) => (
              <span key={i} className="text-xs text-muted-foreground truncate block">{title}</span>
            ))
          ) : (
            <span className="text-xs text-muted-foreground">{row.original.activity_ids.length} activité(s)</span>
          )}
        </div>
      ),
    },
    {
      accessorKey: 'resolution',
      header: t('planner.columns.resolution'),
      size: 140,
      cell: ({ row }) => {
        if (!row.original.resolution) return <span className="text-xs text-muted-foreground">{'—'}</span>
        return <span className="text-xs text-muted-foreground">{resolutionLabels[row.original.resolution] || row.original.resolution}</span>
      },
    },
    {
      accessorKey: 'status',
      header: t('planner.columns.status'),
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
        <StatCard label={t('planner.stats.total_conflicts')} value={total} icon={AlertTriangle} />
        <StatCard label={t('planner.stats.open')} value={stats.open} icon={AlertTriangle} accent="text-destructive" />
        <StatCard label={t('planner.stats.resolved')} value={stats.resolved} icon={CheckCircle2} accent="text-emerald-600 dark:text-emerald-400" />
        <StatCard label={t('planner.stats.deferred')} value={stats.deferred} icon={Clock} accent="text-amber-600 dark:text-amber-400" />
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-2 border-b border-border px-3.5 h-9 shrink-0">
        <div className="flex items-center gap-1 overflow-x-auto">
          {conflictStatusOptions.map((opt) => (
            <button
              key={opt.value}
              onClick={() => updateConflictFilter('statusFilter', opt.value)}
              className={cn(
                'px-2 py-0.5 rounded text-xs font-medium transition-colors whitespace-nowrap',
                conflictFilters.statusFilter === opt.value ? 'bg-primary/[0.16] text-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <select
          value={conflictFilters.conflictTypeFilter}
          onChange={(e) => updateConflictFilter('conflictTypeFilter', e.target.value)}
          className="h-6 px-1.5 text-xs border border-border rounded bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          title="Filtrer par type de conflit"
        >
          <option value="">{t('planner.filters.all_types')}</option>
          <option value="pax_overflow">Dépassement POB</option>
          <option value="priority_clash">Conflit priorité</option>
        </select>
        {hasAdvancedConflictFilters && (
          <button
            type="button"
            onClick={resetConflictFilters}
            className="gl-button gl-button-sm gl-button-default h-6 text-[10px]"
            title="Réinitialiser tous les filtres"
          >
            Réinitialiser
          </button>
        )}
        {data && <span className="text-xs text-muted-foreground ml-auto shrink-0">{total} conflits</span>}
      </div>

      {/* Advanced filter row (asset, date range) */}
      <div className="flex items-center gap-2 border-b border-border px-3.5 h-10 shrink-0 bg-background-subtle">
        <div className="flex-1 min-w-0 max-w-[300px]">
          <AssetPicker
            value={conflictFilters.assetId}
            onChange={(id) => updateConflictFilter('assetId', id)}
            placeholder="Tous assets"
            clearable
          />
        </div>
        <div className="flex items-center gap-1.5 ml-auto shrink-0">
          <span className="text-[10px] uppercase text-muted-foreground tracking-wide hidden sm:inline">Période</span>
          <input
            type="date"
            className="gl-form-input text-xs h-7 w-[130px]"
            value={conflictFilters.dateFrom ?? ''}
            onChange={(e) => updateConflictFilter('dateFrom', e.target.value || null)}
            title="Début"
          />
          <span className="text-muted-foreground text-xs">→</span>
          <input
            type="date"
            className="gl-form-input text-xs h-7 w-[130px]"
            value={conflictFilters.dateTo ?? ''}
            onChange={(e) => updateConflictFilter('dateTo', e.target.value || null)}
            min={conflictFilters.dateFrom ?? undefined}
            title="Fin"
          />
        </div>
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
                  {item.status === 'responded' && item.response === 'counter_proposed' && (
                    <div className="mt-2 flex items-center gap-2">
                      <button
                        type="button"
                        className="gl-button-sm gl-button-confirm text-xs"
                        onClick={() => acceptCounterRevision.mutate(item.id, {
                          onSuccess: () => toast({ title: t('planner.revision_requests.counter_accepted_success'), variant: 'success' }),
                          onError: (err) => toast({ title: extractApiError(err) ?? t('common.error'), variant: 'error' }),
                        })}
                        disabled={acceptCounterRevision.isPending}
                      >
                        {acceptCounterRevision.isPending ? <Loader2 size={12} className="animate-spin" /> : t('planner.revision_requests.accept_counter')}
                      </button>
                    </div>
                  )}
                  {item.status === 'pending' && (() => {
                    const dueAt = item.due_at ? new Date(item.due_at) : null
                    const isOverdue = !dueAt || dueAt <= new Date()
                    return (
                      <div className="mt-2 flex items-center gap-2">
                        <button
                          type="button"
                          className="gl-button-sm gl-button-default text-xs"
                          onClick={() => { setForceReasonModal(item); setForceReasonText('') }}
                          disabled={!isOverdue || forceRevisionDecisionRequest.isPending}
                          title={!isOverdue && dueAt ? `Disponible le ${formatDateShort(dueAt.toISOString())}` : undefined}
                        >
                          {t('planner.revision_requests.force')}
                        </button>
                        {!isOverdue && dueAt && (
                          <span className="text-[11px] text-muted-foreground">
                            {t('planner.revision_requests.force_available_at', { date: formatDateShort(dueAt.toISOString()) })}
                          </span>
                        )}
                      </div>
                    )
                  })()}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <PanelContent scroll={false}>
        <DataTable<PlannerConflict>
          columns={columns}
          data={items}
          isLoading={isLoading}
          pagination={data ? { page: data.page, pageSize, total: data.total, pages: data.pages } : undefined}
          onPaginationChange={(p) => setPage(p)}
          emptyIcon={AlertTriangle}
          emptyTitle={t('planner.no_conflict')}
          storageKey="planner-conflicts"
          selectable
          onSelectionChange={(rows) => setBulkSelection(rows)}
          batchActions={[
            {
              id: 'bulk-resolve',
              label: 'Résoudre en masse',
              variant: 'default',
              onAction: (rows) => {
                const openRows = rows.filter((r) => r.status === 'open')
                if (openRows.length === 0) {
                  toast({
                    title: t('planner.toast.no_open_conflict'),
                    description: t('planner.toast.no_open_conflict_desc'),
                    variant: 'warning',
                  })
                  return
                }
                setBulkSelection(openRows)
                setBulkResolveOpen(true)
              },
            },
          ]}
        />
      </PanelContent>

      {/* Resolve conflict modal */}
      {resolveModal && (
        <div className="gl-modal-backdrop" onClick={() => setResolveModal(null)}>
          <div className="gl-modal-card" onClick={(e) => e.stopPropagation()}>
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

      {/* Bulk resolve conflicts modal */}
      {bulkResolveOpen && (
        <div
          className="gl-modal-backdrop"
          onClick={() => !bulkResolveConflicts.isPending && setBulkResolveOpen(false)}
        >
          <div
            className="gl-modal-card"
            onClick={(e) => e.stopPropagation()}
          >
            <div>
              <h3 className="text-sm font-semibold text-foreground">Résolution en masse</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                {bulkSelection.filter((c) => c.status === 'open').length} conflit(s) ouvert(s) sélectionné(s) — la même résolution sera appliquée à tous.
              </p>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">{t('planner.resolve_conflict_field')}</label>
              <select
                value={bulkResolution}
                onChange={(e) => setBulkResolution(e.target.value)}
                className="w-full h-8 px-2 text-sm border border-border rounded bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="">{t('planner.resolve_conflict_placeholder')}</option>
                {resolutionOptions.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">{t('planner.resolve_conflict_note')}</label>
              <textarea
                value={bulkResolutionNote}
                onChange={(e) => setBulkResolutionNote(e.target.value)}
                className="w-full min-h-[60px] px-2 py-1.5 text-sm border border-border rounded bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                placeholder={t('planner.resolve_conflict_note_placeholder')}
              />
            </div>
            <div className="flex items-center gap-2 justify-end">
              <button
                className="gl-button-sm gl-button-default"
                onClick={() => setBulkResolveOpen(false)}
                disabled={bulkResolveConflicts.isPending}
              >
                {t('common.cancel')}
              </button>
              <button
                className="gl-button-sm gl-button-confirm"
                onClick={handleBulkResolve}
                disabled={!bulkResolution || bulkResolveConflicts.isPending}
              >
                {bulkResolveConflicts.isPending
                  ? <Loader2 size={12} className="animate-spin" />
                  : `Appliquer à ${bulkSelection.filter((c) => c.status === 'open').length}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {requestDecisionModal && (
        <div className="gl-modal-backdrop" onClick={() => setRequestDecisionModal(null)}>
          <div className="gl-modal-card" onClick={(e) => e.stopPropagation()}>
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

      {forceReasonModal && (
        <div className="gl-modal-backdrop" onClick={() => setForceReasonModal(null)}>
          <div className="gl-modal-card" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-foreground">{t('planner.revision_requests.force_title')}</h3>
            <p className="text-xs text-muted-foreground">{t('planner.revision_requests.force_description')}</p>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">{t('planner.revision_requests.force_reason')}</label>
              <textarea
                value={forceReasonText}
                onChange={(e) => setForceReasonText(e.target.value)}
                className="w-full min-h-[72px] px-2 py-1.5 text-sm border border-border rounded bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                placeholder={t('planner.revision_requests.force_reason_placeholder')}
              />
            </div>
            <div className="flex items-center gap-2 justify-end">
              <button className="gl-button-sm gl-button-default" onClick={() => setForceReasonModal(null)}>{t('common.cancel')}</button>
              <button
                className="gl-button-sm gl-button-danger text-xs"
                disabled={forceRevisionDecisionRequest.isPending}
                onClick={() => {
                  forceRevisionDecisionRequest.mutate(
                    { requestId: forceReasonModal.id, reason: forceReasonText || undefined },
                    {
                      onSuccess: () => { setForceReasonModal(null); setForceReasonText(''); toast({ title: t('planner.revision_requests.forced_success'), variant: 'success' }) },
                      onError: (err) => toast({ title: extractApiError(err) ?? t('common.error'), variant: 'error' }),
                    }
                  )
                }}
              >
                {forceRevisionDecisionRequest.isPending ? <Loader2 size={12} className="animate-spin" /> : t('planner.revision_requests.force_confirm')}
              </button>
            </div>
          </div>
        </div>
      )}

      {respondDecisionModal && (
        <div className="gl-modal-backdrop" onClick={() => setRespondDecisionModal(null)}>
          <div className="gl-modal-card" onClick={(e) => e.stopPropagation()}>
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
