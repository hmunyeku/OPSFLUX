/**
 * Planner (activities, conflicts, capacity, gantt) API service.
 */
import api from '@/lib/api'
import type {
  PlannerActivity, PlannerActivityCreate, PlannerActivityUpdate,
  PlannerConflict, PlannerConflictResolve,
  PlannerRevisionSignal,
  PlannerRevisionSignalImpactSummary,
  PlannerRevisionDecisionRequest,
  PlannerRevisionDecisionRequestCreate,
  PlannerRevisionDecisionRespond,
  PlannerCapacity,
  PlannerDependency, PlannerDependencyCreate,
  PaginatedResponse, PaginationParams,
  GanttResponse,
  CapacityHeatmapResponse,
  AvailabilityResponse,
  ImpactPreview,
  AssetCapacity, AssetCapacityCreate,
  RecurrenceCreate, RecurrenceConfig,
  BulkConflictResolveItem, BulkConflictResolveResult,
  ConflictAuditEntry,
  ScenarioRequest, ScenarioResult,
  ForecastResult,
} from '@/types/api'

const BASE = '/api/v1/planner'

interface ActivityListParams extends PaginationParams {
  asset_id?: string
  type?: string
  status?: string
  priority?: string
  project_id?: string
  start_date?: string
  end_date?: string
  search?: string
}

interface ConflictListParams extends PaginationParams {
  asset_id?: string
  status?: string
  conflict_date_from?: string
  conflict_date_to?: string
}

interface CapacityParams {
  asset_id: string
  date_from: string
  date_to: string
}

interface GanttParams {
  asset_id?: string
  types?: string
  statuses?: string
  show_permanent_ops?: boolean
}

export const plannerService = {
  // ── Activities ──
  listActivities: async (params: ActivityListParams = {}): Promise<PaginatedResponse<PlannerActivity>> => {
    const { data } = await api.get(`${BASE}/activities`, { params })
    return data
  },

  getActivity: async (id: string): Promise<PlannerActivity> => {
    const { data } = await api.get(`${BASE}/activities/${id}`)
    return data
  },

  createActivity: async (payload: PlannerActivityCreate): Promise<PlannerActivity> => {
    const { data } = await api.post(`${BASE}/activities`, payload)
    return data
  },

  updateActivity: async (id: string, payload: PlannerActivityUpdate): Promise<PlannerActivity> => {
    const { data } = await api.patch(`${BASE}/activities/${id}`, payload)
    return data
  },

  deleteActivity: async (id: string): Promise<void> => {
    await api.delete(`${BASE}/activities/${id}`)
  },

  submitActivity: async (id: string): Promise<PlannerActivity> => {
    const { data } = await api.post(`${BASE}/activities/${id}/submit`)
    return data
  },

  validateActivity: async (id: string): Promise<PlannerActivity> => {
    const { data } = await api.post(`${BASE}/activities/${id}/validate`)
    return data
  },

  rejectActivity: async (id: string, reason?: string | null): Promise<PlannerActivity> => {
    const { data } = await api.post(`${BASE}/activities/${id}/reject`, null, {
      params: reason ? { reason } : undefined,
    })
    return data
  },

  cancelActivity: async (id: string): Promise<PlannerActivity> => {
    const { data } = await api.post(`${BASE}/activities/${id}/cancel`)
    return data
  },

  createActivityFromTask: async (params: {
    project_id: string
    task_id: string
    pax_quota: number
    priority?: string
  }): Promise<PlannerActivity> => {
    const { data } = await api.post(`${BASE}/activities/from-project-task`, null, { params })
    return data
  },

  // ── Dependencies ──
  listDependencies: async (activityId: string): Promise<PlannerDependency[]> => {
    const { data } = await api.get(`${BASE}/activities/${activityId}/dependencies`)
    return data
  },

  addDependency: async (activityId: string, payload: PlannerDependencyCreate): Promise<PlannerDependency> => {
    const { data } = await api.post(`${BASE}/activities/${activityId}/dependencies`, payload)
    return data
  },

  removeDependency: async (activityId: string, dependencyId: string): Promise<void> => {
    await api.delete(`${BASE}/activities/${activityId}/dependencies/${dependencyId}`)
  },

  // ── Conflicts ──
  listConflicts: async (params: ConflictListParams = {}): Promise<PaginatedResponse<PlannerConflict>> => {
    const { data } = await api.get(`${BASE}/conflicts`, { params })
    return data
  },

  listRevisionSignals: async (params: PaginationParams = {}): Promise<PaginatedResponse<PlannerRevisionSignal>> => {
    const { data } = await api.get(`${BASE}/revision-signals`, { params })
    return data
  },

  acknowledgeRevisionSignal: async (id: string): Promise<{ acknowledged: boolean; signal_id: string }> => {
    const { data } = await api.post(`${BASE}/revision-signals/${id}/acknowledge`)
    return data
  },

  getRevisionSignalImpactSummary: async (id: string): Promise<PlannerRevisionSignalImpactSummary> => {
    const { data } = await api.get(`${BASE}/revision-signals/${id}/impact-summary`)
    return data
  },

  listRevisionDecisionRequests: async (params: PaginationParams & {
    direction?: 'incoming' | 'outgoing'
    status?: 'pending' | 'responded' | 'forced' | 'all'
    project_id?: string
    task_id?: string
  } = {}): Promise<PaginatedResponse<PlannerRevisionDecisionRequest>> => {
    const { data } = await api.get(`${BASE}/revision-decision-requests`, { params })
    return data
  },

  requestRevisionDecision: async (signalId: string, payload: PlannerRevisionDecisionRequestCreate): Promise<PlannerRevisionDecisionRequest> => {
    const { data } = await api.post(`${BASE}/revision-signals/${signalId}/request-decision`, payload)
    return data
  },

  respondRevisionDecisionRequest: async (requestId: string, payload: PlannerRevisionDecisionRespond): Promise<PlannerRevisionDecisionRequest> => {
    const { data } = await api.post(`${BASE}/revision-decision-requests/${requestId}/respond`, payload)
    return data
  },

  forceRevisionDecisionRequest: async (requestId: string, reason?: string): Promise<PlannerRevisionDecisionRequest> => {
    const { data } = await api.post(`${BASE}/revision-decision-requests/${requestId}/force`, reason ? { reason } : {})
    return data
  },

  resolveConflict: async (id: string, payload: PlannerConflictResolve): Promise<PlannerConflict> => {
    const { data } = await api.post(`${BASE}/conflicts/${id}/resolve`, payload)
    return data
  },

  // ── Capacity (legacy daily view) ──
  getCapacity: async (params: CapacityParams): Promise<PlannerCapacity[]> => {
    const { data } = await api.get(`${BASE}/capacity`, { params })
    return data
  },

  // ── Gantt ──
  getGanttData: async (startDate: string, endDate: string, params?: GanttParams): Promise<GanttResponse> => {
    const { data } = await api.get(`${BASE}/gantt`, {
      params: { start_date: startDate, end_date: endDate, ...params },
    })
    return data
  },

  // ── Capacity Heatmap ──
  getCapacityHeatmap: async (startDate: string, endDate: string, assetId?: string): Promise<CapacityHeatmapResponse> => {
    const { data } = await api.get(`${BASE}/capacity-heatmap`, {
      params: { start_date: startDate, end_date: endDate, asset_id: assetId },
    })
    return data
  },

  // ── Availability ──
  getAvailability: async (assetId: string, start: string, end: string): Promise<AvailabilityResponse> => {
    const { data } = await api.get(`${BASE}/assets/${assetId}/availability`, {
      params: { start_date: start, end_date: end },
    })
    return data
  },

  // ── Impact Preview ──
  getImpactPreview: async (activityId: string, params: {
    new_start?: string
    new_end?: string
    new_pax_quota?: number
  }): Promise<ImpactPreview> => {
    const { data } = await api.get(`${BASE}/activities/${activityId}/impact-preview`, { params })
    return data
  },

  // ── Asset Capacities (historized) ──
  getAssetCapacities: async (assetId: string): Promise<AssetCapacity[]> => {
    const { data } = await api.get(`${BASE}/assets/${assetId}/capacities`)
    return data
  },

  createAssetCapacity: async (assetId: string, payload: AssetCapacityCreate): Promise<AssetCapacity> => {
    const { data } = await api.post(`${BASE}/assets/${assetId}/capacities`, payload)
    return data
  },

  // ── Priority Override ──
  overridePriority: async (activityId: string, priority: string, reason: string): Promise<PlannerActivity> => {
    const { data } = await api.post(`${BASE}/activities/${activityId}/override-priority`, {
      priority,
      reason,
    })
    return data
  },

  // ── Recurrence ──
  setRecurrence: async (activityId: string, payload: RecurrenceCreate): Promise<RecurrenceConfig> => {
    const { data } = await api.post(`${BASE}/activities/${activityId}/recurrence`, payload)
    return data
  },

  deleteRecurrence: async (activityId: string): Promise<void> => {
    await api.delete(`${BASE}/activities/${activityId}/recurrence`)
  },

  // ── Bulk conflict resolution ──
  bulkResolveConflicts: async (items: BulkConflictResolveItem[]): Promise<BulkConflictResolveResult> => {
    const { data } = await api.post(`${BASE}/conflicts/bulk-resolve`, { items })
    return data
  },

  // ── Conflict audit trail ──
  getConflictAudit: async (conflictId: string): Promise<ConflictAuditEntry[]> => {
    const { data } = await api.get(`${BASE}/conflicts/${conflictId}/audit`)
    return data
  },

  // ── Scenario simulation (what-if) ──
  simulate: async (payload: ScenarioRequest): Promise<ScenarioResult> => {
    const { data } = await api.post(`${BASE}/scenarios/simulate`, payload)
    return data
  },

  // ── Capacity forecast ──
  forecast: async (assetId: string, horizonDays = 90): Promise<ForecastResult> => {
    const { data } = await api.post(`${BASE}/forecast`, {
      asset_id: assetId,
      horizon_days: horizonDays,
    })
    return data
  },
}
