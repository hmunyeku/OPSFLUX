/**
 * React Query hooks for the Planner module (activities, conflicts, capacity, gantt).
 */
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { plannerService } from '@/services/plannerService'
import type {
  PlannerActivityCreate, PlannerActivityUpdate,
  PlannerConflictResolve,
  PlannerDependencyCreate,
  PaginationParams,
  AssetCapacityCreate,
  RecurrenceCreate,
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

export function useCreateActivity() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: PlannerActivityCreate) => plannerService.createActivity(payload),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['planner', 'activities'] }) },
  })
}

export function useUpdateActivity() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: PlannerActivityUpdate }) =>
      plannerService.updateActivity(id, payload),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['planner', 'activities'] }) },
  })
}

export function useDeleteActivity() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => plannerService.deleteActivity(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['planner', 'activities'] }) },
  })
}

export function useSubmitActivity() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => plannerService.submitActivity(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['planner', 'activities'] })
      qc.invalidateQueries({ queryKey: ['planner', 'conflicts'] })
    },
  })
}

export function useValidateActivity() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => plannerService.validateActivity(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['planner', 'activities'] })
      qc.invalidateQueries({ queryKey: ['planner', 'capacity'] })
    },
  })
}

export function useRejectActivity() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string | null }) =>
      plannerService.rejectActivity(id, reason),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['planner', 'activities'] }) },
  })
}

export function useCancelActivity() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => plannerService.cancelActivity(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['planner', 'activities'] })
      qc.invalidateQueries({ queryKey: ['planner', 'capacity'] })
    },
  })
}

export function useCreateActivityFromTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (params: { project_id: string; task_id: string; pax_quota: number; priority?: string }) =>
      plannerService.createActivityFromTask(params),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['planner', 'activities'] }) },
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

export function useAddDependency() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ activityId, payload }: { activityId: string; payload: PlannerDependencyCreate }) =>
      plannerService.addDependency(activityId, payload),
    onSuccess: (_, { activityId }) => {
      qc.invalidateQueries({ queryKey: ['planner', 'activities', activityId, 'dependencies'] })
    },
  })
}

export function useRemoveDependency() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ activityId, dependencyId }: { activityId: string; dependencyId: string }) =>
      plannerService.removeDependency(activityId, dependencyId),
    onSuccess: (_, { activityId }) => {
      qc.invalidateQueries({ queryKey: ['planner', 'activities', activityId, 'dependencies'] })
    },
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
