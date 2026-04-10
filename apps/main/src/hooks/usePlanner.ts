/**
 * React Query hooks for the Planner module (activities, conflicts, capacity, gantt).
 */
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query'
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
} = {}) {
  return useQuery({
    queryKey: ['planner', 'activities', params],
    queryFn: () => plannerService.listActivities(params),
    placeholderData: keepPreviousData,
  })
}

export function useActivity(id: string | undefined) {
  return useQuery({
    queryKey: ['planner', 'activities', id],
    queryFn: () => plannerService.getActivity(id!),
    enabled: !!id,
  })
}

/**
 * Invalidate every Planner view that depends on activity data.
 * Used by all activity mutations so the Gantt + heatmap refresh
 * automatically after a create/update/delete/transition.
 */
function invalidatePlannerViews(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['planner', 'activities'] })
  qc.invalidateQueries({ queryKey: ['planner', 'gantt'] })
  qc.invalidateQueries({ queryKey: ['planner', 'capacity-heatmap'] })
  qc.invalidateQueries({ queryKey: ['planner', 'capacity'] })
  qc.invalidateQueries({ queryKey: ['planner', 'conflicts'] })
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
    onSuccess: () => invalidatePlannerViews(qc),
  })
}

export function useValidateActivity() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => plannerService.validateActivity(id),
    onSuccess: () => invalidatePlannerViews(qc),
  })
}

export function useRejectActivity() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string | null }) =>
      plannerService.rejectActivity(id, reason),
    onSuccess: () => invalidatePlannerViews(qc),
  })
}

export function useCancelActivity() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => plannerService.cancelActivity(id),
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
}) {
  return useQuery({
    queryKey: ['planner', 'gantt', startDate, endDate, params],
    queryFn: () => plannerService.getGanttData(startDate, endDate, params),
    enabled: !!startDate && !!endDate,
    placeholderData: keepPreviousData,
  })
}

// ── Capacity Heatmap ──

export function useCapacityHeatmap(startDate: string, endDate: string, assetId?: string) {
  return useQuery({
    queryKey: ['planner', 'capacity-heatmap', startDate, endDate, assetId],
    queryFn: () => plannerService.getCapacityHeatmap(startDate, endDate, assetId),
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

export function useForecast(assetId: string | undefined, horizonDays = 90) {
  return useQuery({
    queryKey: ['planner', 'forecast', assetId, horizonDays],
    queryFn: () => plannerService.forecast(assetId!, horizonDays),
    enabled: !!assetId,
    staleTime: 60_000,
  })
}
