/**
 * React Query hooks for the Planner module (activities, conflicts, capacity, gantt).
 */
import { useQuery, useMutation, useQueries, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { plannerService } from '@/services/plannerService'
import type {
  PlannerActivityCreate, PlannerActivityUpdate,
  PlannerConflictResolve,
  PlannerDependency,
  PlannerDependencyCreate,
  PaginationParams,
  AssetCapacityCreate,
  RecurrenceCreate,
  BulkConflictResolveItem,
  PlannerRevisionDecisionRequestCreate,
  PlannerRevisionDecisionRespond,
  ScenarioRequest,
} from '@/types/api'

// ── Activities ──

export function useActivities(params: PaginationParams & {
  asset_id?: string
  type?: string
  status?: string
  priority?: string
  project_id?: string
  start_date?: string
  end_date?: string
  search?: string
  scenario_id?: string
} = {}) {
  return useQuery({
    queryKey: ['planner', 'activities', params],
    queryFn: () => plannerService.listActivities(params),
    placeholderData: keepPreviousData,
  })
}

// ── POB (Persons On Board) per asset for today ──
// Used by the Activités table to display "POB prévu / POB réel"
// inline next to the Installation. Refetched every 60s so the
// real POB stays in sync with confirmed mobilisations.
export function useAssetPobToday(assetIds: string[]) {
  const ids = assetIds.filter(Boolean).sort().join(',')
  return useQuery({
    queryKey: ['planner', 'asset-pob-today', ids],
    queryFn: () => plannerService.getAssetPobToday(ids),
    enabled: assetIds.length > 0,
    staleTime: 60_000,
    refetchInterval: 60_000,
  })
}

/** Fetch a small batch of activities by id in parallel. Used by the
 *  Conflict resolution modal to display the involved activities'
 *  current dates / quotas inside the action panel. */
export function useActivitiesByIds(ids: string[]) {
  const results = useQueries({
    queries: ids.map((id) => ({
      queryKey: ['planner', 'activities', id],
      queryFn: () => plannerService.getActivity(id),
      enabled: !!id,
      staleTime: 30_000,
    })),
  })
  const map = new Map<string, NonNullable<typeof results[number]['data']>>()
  results.forEach((r, i) => {
    if (r.data) map.set(ids[i], r.data)
  })
  const isLoading = results.some((r) => r.isLoading)
  return { byId: map, isLoading }
}

export function useActivity(id: string | undefined) {
  return useQuery({
    queryKey: ['planner', 'activities', id],
    queryFn: () => plannerService.getActivity(id!),
    enabled: !!id,
    retry: (failureCount, error) => {
      // Don't retry on 404 (deleted/missing activity)
      if (error && typeof error === 'object' && 'response' in error) {
        const status = (error as { response?: { status?: number } }).response?.status
        if (status === 404 || status === 403) return false
      }
      return failureCount < 2
    },
  })
}

/**
 * Invalidate every Planner view that depends on activity data.
 *
 * Used by CRUD activity mutations (create / update / delete) — anything
 * that may shift dates, PAX quotas, or activity existence and therefore
 * potentially invalidates the gantt, heatmap, and conflict detection.
 */
function invalidatePlannerViews(qc: ReturnType<typeof useQueryClient>) {
  // Use predicate-based invalidation so per-activity caches like
  // ['planner', 'activities', '<uuid>'] also refetch. The previous
  // exact-key invalidation only matched ['planner', 'activities'] (the
  // LIST query), so the detail panel's useActivity(id) hook kept
  // serving the stale single-activity cache and the user saw their
  // saved POB mode revert to the previous value.
  qc.invalidateQueries({
    predicate: (q) => Array.isArray(q.queryKey)
      && q.queryKey[0] === 'planner'
      && q.queryKey[1] === 'activities',
  })
  qc.invalidateQueries({ queryKey: ['planner', 'gantt'] })
  qc.invalidateQueries({ queryKey: ['planner', 'capacity-heatmap'] })
  qc.invalidateQueries({ queryKey: ['planner', 'capacity'] })
  qc.invalidateQueries({ queryKey: ['planner', 'conflicts'] })
}

/**
 * Slim invalidation for FSM transitions (submit / validate / reject /
 * cancel). These mutations only flip the activity's `status` — they
 * don't change `start_date`, `end_date`, `pax_quota`, dependencies, or
 * activity existence. So the heatmap (saturation), capacity views, and
 * conflict graph remain mathematically identical: invalidating them is
 * pure waste of network + DB.
 *
 * What DOES need to refetch:
 *   - The activities list (the new status changes the row badge)
 *   - The detail cache for the affected activity
 *   - The gantt (the bar's color depends on status)
 *
 * Past incident: every status click was triggering 4–5 simultaneous
 * heatmap recomputations on a 12-month range, each taking ~600 ms.
 * Multiplied by bulk validate flows this dragged the page to a halt.
 */
function invalidatePlannerViewsForTransition(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({
    predicate: (q) => Array.isArray(q.queryKey)
      && q.queryKey[0] === 'planner'
      && q.queryKey[1] === 'activities',
  })
  qc.invalidateQueries({ queryKey: ['planner', 'gantt'] })
}

export function useCreateActivity() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: PlannerActivityCreate) => plannerService.createActivity(payload),
    onSuccess: () => invalidatePlannerViews(qc),
  })
}

export function useUpdateActivity() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: PlannerActivityUpdate }) =>
      plannerService.updateActivity(id, payload),
    onSuccess: () => invalidatePlannerViews(qc),
  })
}

export function useDeleteActivity() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => plannerService.deleteActivity(id),
    onSuccess: () => invalidatePlannerViews(qc),
  })
}

export function useSubmitActivity() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => plannerService.submitActivity(id),
    // Transition only — see invalidatePlannerViewsForTransition for rationale.
    onSuccess: () => invalidatePlannerViewsForTransition(qc),
  })
}

export function useValidateActivity() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => plannerService.validateActivity(id),
    onSuccess: () => invalidatePlannerViewsForTransition(qc),
  })
}

export function useRejectActivity() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string | null }) =>
      plannerService.rejectActivity(id, reason),
    onSuccess: () => invalidatePlannerViewsForTransition(qc),
  })
}

export function useCancelActivity() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => plannerService.cancelActivity(id),
    // Cancellation IS a structural change (the activity disappears from
    // capacity calculations), so we use the full invalidation.
    onSuccess: () => invalidatePlannerViews(qc),
  })
}

export function useCreateActivityFromTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (params: { project_id: string; task_id: string; pax_quota: number; priority?: string }) =>
      plannerService.createActivityFromTask(params),
    onSuccess: () => invalidatePlannerViews(qc),
  })
}

// ── Dependencies ──

export function useActivityDependencies(activityId: string | undefined) {
  return useQuery({
    queryKey: ['planner', 'activities', activityId, 'dependencies'],
    queryFn: () => plannerService.listDependencies(activityId!),
    enabled: !!activityId,
  })
}

/**
 * Targeted invalidation for dependency changes — only the views that
 * actually need to refetch. The heatmap (slow) and conflicts (unrelated)
 * are intentionally excluded.
 */
function invalidateDependencyViews(qc: ReturnType<typeof useQueryClient>, activityId: string) {
  qc.invalidateQueries({ queryKey: ['planner', 'activities', activityId, 'dependencies'] })
  qc.invalidateQueries({ queryKey: ['planner', 'gantt'] })
}

export function useAddDependency() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ activityId, payload }: { activityId: string; payload: PlannerDependencyCreate }) =>
      plannerService.addDependency(activityId, payload),
    onSuccess: (_, { activityId }) => invalidateDependencyViews(qc, activityId),
  })
}

export function useRemoveDependency() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ activityId, dependencyId }: { activityId: string; dependencyId: string }) =>
      plannerService.removeDependency(activityId, dependencyId),
    // Optimistic update: remove the dep from the local cache immediately so the
    // UI updates without waiting for the API roundtrip.
    onMutate: async ({ activityId, dependencyId }) => {
      const depKey = ['planner', 'activities', activityId, 'dependencies'] as const
      await qc.cancelQueries({ queryKey: depKey })
      const previous = qc.getQueryData<PlannerDependency[]>(depKey)
      if (previous) {
        qc.setQueryData<PlannerDependency[]>(depKey, previous.filter((d) => d.id !== dependencyId))
      }
      return { previous, depKey }
    },
    onError: (_err, _vars, ctx) => {
      // Roll back if the API call failed
      if (ctx?.previous) qc.setQueryData(ctx.depKey, ctx.previous)
    },
    onSuccess: (_, { activityId }) => invalidateDependencyViews(qc, activityId),
  })
}

// ── Conflicts ──

export function useConflicts(params: PaginationParams & {
  asset_id?: string
  status?: string
  conflict_date_from?: string
  conflict_date_to?: string
  conflict_type?: string
} = {}) {
  return useQuery({
    queryKey: ['planner', 'conflicts', params],
    queryFn: () => plannerService.listConflicts(params),
    placeholderData: keepPreviousData,
  })
}

export function useRevisionSignals(params: PaginationParams = {}) {
  return useQuery({
    queryKey: ['planner', 'revision-signals', params],
    queryFn: () => plannerService.listRevisionSignals(params),
    placeholderData: keepPreviousData,
  })
}

export function useAcknowledgeRevisionSignal() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => plannerService.acknowledgeRevisionSignal(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['planner', 'revision-signals'] })
    },
  })
}

export function useRevisionSignalImpactSummary(signalId: string | undefined) {
  return useQuery({
    queryKey: ['planner', 'revision-signals', signalId, 'impact-summary'],
    queryFn: () => plannerService.getRevisionSignalImpactSummary(signalId!),
    enabled: !!signalId,
  })
}

export function useRevisionDecisionRequests(params: PaginationParams & {
  direction?: 'incoming' | 'outgoing'
  status?: 'pending' | 'responded' | 'forced' | 'all'
  project_id?: string
  task_id?: string
} = {}) {
  return useQuery({
    queryKey: ['planner', 'revision-decision-requests', params],
    queryFn: () => plannerService.listRevisionDecisionRequests(params),
    placeholderData: keepPreviousData,
  })
}

export function useRequestRevisionDecision() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ signalId, payload }: { signalId: string; payload: PlannerRevisionDecisionRequestCreate }) =>
      plannerService.requestRevisionDecision(signalId, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['planner', 'revision-decision-requests'] })
      qc.invalidateQueries({ queryKey: ['planner', 'revision-signals'] })
    },
  })
}

export function useRespondRevisionDecisionRequest() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ requestId, payload }: { requestId: string; payload: PlannerRevisionDecisionRespond }) =>
      plannerService.respondRevisionDecisionRequest(requestId, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['planner', 'revision-decision-requests'] })
    },
  })
}

export function useForceRevisionDecisionRequest() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ requestId, reason }: { requestId: string; reason?: string }) =>
      plannerService.forceRevisionDecisionRequest(requestId, reason),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['planner', 'revision-decision-requests'] })
    },
  })
}

export function useAcceptCounterRevisionDecision() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (requestId: string) =>
      plannerService.acceptCounterRevisionDecision(requestId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['planner', 'revision-decision-requests'] })
    },
  })
}

export function useResolveConflict() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: PlannerConflictResolve }) =>
      plannerService.resolveConflict(id, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['planner', 'conflicts'] })
      qc.invalidateQueries({ queryKey: ['planner', 'activities'] })
    },
  })
}

// ── Capacity (legacy) ──

export function useCapacity(params: { asset_id: string; date_from: string; date_to: string } | undefined) {
  return useQuery({
    queryKey: ['planner', 'capacity', params],
    queryFn: () => plannerService.getCapacity(params!),
    enabled: !!params?.asset_id && !!params?.date_from && !!params?.date_to,
  })
}

// ── Gantt ──

export function useGanttData(startDate: string, endDate: string, params?: {
  asset_id?: string
  types?: string
  statuses?: string
  show_permanent_ops?: boolean
  scenario_id?: string
}) {
  return useQuery({
    queryKey: ['planner', 'gantt', startDate, endDate, params],
    queryFn: () => plannerService.getGanttData(startDate, endDate, params),
    enabled: !!startDate && !!endDate,
    placeholderData: keepPreviousData,
  })
}

// ── Reference scenario ──

export function useReferenceScenario() {
  return useQuery({
    queryKey: ['planner', 'scenarios', 'reference'],
    queryFn: async () => {
      try {
        return await plannerService.getReferenceScenario()
      } catch (err: unknown) {
        // 404 = no reference scenario yet (not an error state)
        if (err && typeof err === 'object' && 'response' in err) {
          const status = (err as { response?: { status?: number } }).response?.status
          if (status === 404) return null
        }
        throw err
      }
    },
    staleTime: 30_000,
  })
}

// ── Capacity Heatmap ──

export function useCapacityHeatmap(startDate: string, endDate: string, assetId?: string, scenarioId?: string) {
  return useQuery({
    queryKey: ['planner', 'capacity-heatmap', startDate, endDate, assetId, scenarioId],
    queryFn: () => plannerService.getCapacityHeatmap(startDate, endDate, assetId, scenarioId),
    enabled: !!startDate && !!endDate,
    placeholderData: keepPreviousData,
  })
}

// ── Availability ──

export function useAvailability(assetId: string | undefined, start: string, end: string) {
  return useQuery({
    queryKey: ['planner', 'availability', assetId, start, end],
    queryFn: () => plannerService.getAvailability(assetId!, start, end),
    enabled: !!assetId && !!start && !!end,
  })
}

// ── Impact Preview ──

export function useImpactPreview() {
  return useMutation({
    mutationFn: ({ activityId, params }: {
      activityId: string
      params: { new_start?: string; new_end?: string; new_pax_quota?: number }
    }) => plannerService.getImpactPreview(activityId, params),
  })
}

// ── Asset Capacities (historized) ──

export function useAssetCapacities(assetId: string | undefined) {
  return useQuery({
    queryKey: ['planner', 'asset-capacities', assetId],
    queryFn: () => plannerService.getAssetCapacities(assetId!),
    enabled: !!assetId,
  })
}

export function useCreateAssetCapacity() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ assetId, payload }: { assetId: string; payload: AssetCapacityCreate }) =>
      plannerService.createAssetCapacity(assetId, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['planner', 'asset-capacities'] })
      qc.invalidateQueries({ queryKey: ['planner', 'capacity'] })
      qc.invalidateQueries({ queryKey: ['planner', 'capacity-heatmap'] })
      qc.invalidateQueries({ queryKey: ['planner', 'gantt'] })
    },
  })
}

// ── Priority Override ──

export function useOverridePriority() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ activityId, priority, reason }: { activityId: string; priority: string; reason: string }) =>
      plannerService.overridePriority(activityId, priority, reason),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['planner', 'activities'] })
      qc.invalidateQueries({ queryKey: ['planner', 'gantt'] })
    },
  })
}

// ── Recurrence ──

export function useSetRecurrence() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ activityId, payload }: { activityId: string; payload: RecurrenceCreate }) =>
      plannerService.setRecurrence(activityId, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['planner', 'activities'] })
    },
  })
}

export function useDeleteRecurrence() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (activityId: string) => plannerService.deleteRecurrence(activityId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['planner', 'activities'] })
    },
  })
}

// ── Bulk conflict resolution ──

export function useBulkResolveConflicts() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (items: BulkConflictResolveItem[]) =>
      plannerService.bulkResolveConflicts(items),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['planner', 'conflicts'] })
    },
  })
}

// ── Conflict audit trail ──

export function useConflictAudit(conflictId: string | undefined) {
  return useQuery({
    queryKey: ['planner', 'conflict-audit', conflictId],
    queryFn: () => plannerService.getConflictAudit(conflictId!),
    enabled: !!conflictId,
  })
}

// ── Scenario simulation (what-if) ──

export function useSimulateScenario() {
  return useMutation({
    mutationFn: (payload: ScenarioRequest) => plannerService.simulate(payload),
  })
}

// ── Capacity forecast ──

export function useForecast(assetId: string | undefined, horizonDays = 90, activityType?: string, projectId?: string) {
  return useQuery({
    queryKey: ['planner', 'forecast', assetId, horizonDays, activityType, projectId],
    queryFn: () => plannerService.forecast(assetId!, horizonDays, activityType, projectId),
    enabled: !!assetId,
    staleTime: 60_000,
  })
}

// ── Scenarios (persistent what-if) ──

function invalidateScenarioViews(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['planner', 'scenarios'] })
}

export function useScenarios(params: { page?: number; page_size?: number; status?: string; search?: string } = {}) {
  return useQuery({
    queryKey: ['planner', 'scenarios', params],
    queryFn: () => plannerService.listScenarios(params),
    placeholderData: keepPreviousData,
  })
}

export function useScenario(id: string | undefined) {
  return useQuery({
    queryKey: ['planner', 'scenarios', id],
    queryFn: () => plannerService.getScenario(id!),
    enabled: !!id,
  })
}

export function useCreateScenario() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: { title: string; description?: string }) =>
      plannerService.createScenario(payload),
    onSuccess: () => invalidateScenarioViews(qc),
  })
}

export function useUpdateScenario() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: { title?: string; description?: string; status?: string } }) =>
      plannerService.updateScenario(id, payload),
    onSuccess: () => invalidateScenarioViews(qc),
  })
}

export function useDeleteScenario() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => plannerService.deleteScenario(id),
    onSuccess: () => invalidateScenarioViews(qc),
  })
}

export function useAddScenarioActivity() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ scenarioId, payload }: { scenarioId: string; payload: Record<string, unknown> }) =>
      plannerService.addScenarioActivity(scenarioId, payload),
    onSuccess: (_, { scenarioId }) => {
      invalidateScenarioViews(qc)
      qc.invalidateQueries({ queryKey: ['planner', 'scenarios', scenarioId] })
    },
  })
}

export function useUpdateScenarioActivity() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ scenarioId, activityId, payload }: { scenarioId: string; activityId: string; payload: Record<string, unknown> }) =>
      plannerService.updateScenarioActivity(scenarioId, activityId, payload),
    onSuccess: (_, { scenarioId }) => {
      qc.invalidateQueries({ queryKey: ['planner', 'scenarios', scenarioId] })
    },
  })
}

export function useRemoveScenarioActivity() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ scenarioId, activityId }: { scenarioId: string; activityId: string }) =>
      plannerService.removeScenarioActivity(scenarioId, activityId),
    onSuccess: (_, { scenarioId }) => {
      invalidateScenarioViews(qc)
      qc.invalidateQueries({ queryKey: ['planner', 'scenarios', scenarioId] })
    },
  })
}

export function useSimulateScenarioPersistent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (scenarioId: string) => plannerService.simulateScenario(scenarioId),
    onSuccess: () => invalidateScenarioViews(qc),
  })
}

export function usePromoteScenario() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (scenarioId: string) => plannerService.promoteScenario(scenarioId),
    onSuccess: () => {
      invalidateScenarioViews(qc)
      // Promotion creates real activities and sets is_reference — invalidate all views
      invalidatePlannerViews(qc)
      qc.invalidateQueries({ queryKey: ['planner', 'scenarios', 'reference'] })
    },
  })
}

export function useRestoreScenario() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (scenarioId: string) => plannerService.restoreScenario(scenarioId),
    onSuccess: () => {
      invalidateScenarioViews(qc)
      invalidatePlannerViews(qc)
    },
  })
}
