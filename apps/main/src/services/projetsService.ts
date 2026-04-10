/**
 * Projets (project management) API service.
 */
import api from '@/lib/api'
import type {
  Project, ProjectCreate, ProjectUpdate,
  ProjectMember, ProjectMemberCreate,
  ProjectTask, ProjectTaskCreate, ProjectTaskUpdate, ProjectTaskEnriched,
  ProjectMilestone, ProjectMilestoneCreate, ProjectMilestoneUpdate,
  PlanningRevision, PlanningRevisionCreate, PlanningRevisionUpdate,
  TaskDeliverable, TaskDeliverableCreate, TaskDeliverableUpdate,
  TaskAction, TaskActionCreate, TaskActionUpdate,
  TaskChangeLog,
  TaskDependency, TaskDependencyCreate,
  ProjectWBSNode, ProjectWBSNodeCreate, ProjectWBSNodeUpdate,
  CPMResult,
  ProjectTemplate, ProjectTemplateCreate,
  CustomFieldDef, CustomFieldValuePayload,
  ProjectComment, ProjectCommentCreate,
  ActivityFeedItem,
  PaginatedResponse, PaginationParams,
} from '@/types/api'

interface ProjectListParams extends PaginationParams {
  status?: string
  priority?: string
  manager_id?: string
  tier_id?: string
  asset_id?: string
  source?: 'opsflux' | 'gouti'
  search?: string
}

export interface GoutiSyncResult {
  synced: number
  created: number
  updated: number
  errors: string[]
}

export interface GoutiCapabilities {
  probed_at: string | null
  reads: Record<string, boolean | null>
  writes: Record<string, string[]>
}

export interface GoutiSyncStatus {
  last_sync_at: string | null
  project_count: number
  connector_configured: boolean
  capabilities?: GoutiCapabilities | null
  auto_sync_enabled?: boolean
  auto_sync_interval_minutes?: number
  has_selection?: boolean
}

export interface GoutiCatalogCategory {
  id: string | number
  name: string
}

export interface GoutiCatalogTask {
  gouti_id: string
  name: string
  code?: string
  status_raw?: string | null
  status?: string
  progress?: number | null
  start_date?: string | null
  end_date?: string | null
  actual_start_date?: string | null
  actual_end_date?: string | null
  workload?: number | null
  actual_workload?: number | null
  duration_days?: number | null
  description?: string | null
  is_milestone?: boolean
  is_macro?: boolean
  level?: number
  order?: number
  parent_ref?: string | null
}

export interface GoutiCatalogProject {
  gouti_id: string
  code: string
  name: string
  status: string
  status_raw?: string | null
  progress: number | null
  manager_name: string | null
  target_date: string | null
  start_date?: string | null
  criticality?: string | null
  categories: GoutiCatalogCategory[]
  task_count: number
  tasks: GoutiCatalogTask[]
}

export interface GoutiCatalogResponse {
  total: number
  filtered: number
  applied_filters: Record<string, unknown>
  items: GoutiCatalogProject[]
}

export interface GoutiFacets {
  years: number[]
  categories: { id: string; name: string }[]
  statuses: { value: string; count: number }[]
  managers: { ref_us: string; name_us: string }[]
  criticalities: { value: number; count: number }[]
  total_projects: number
}

export interface GoutiCatalogFilters {
  year?: number | null
  category_ids?: string[]
  status?: string[]
  manager_id?: string | null
  criticality?: number[]
  search?: string
}

export interface GoutiTaskSelection {
  mode: 'all' | 'none' | 'some'
  task_ids: string[]
}

export interface GoutiProjectSelection {
  include: boolean
  tasks: GoutiTaskSelection
}

export interface GoutiSelectionPayload {
  projects: Record<string, GoutiProjectSelection>
}

export interface GoutiSingleSyncResult {
  project_id: string
  local_id: string
  action: 'created' | 'updated'
  reports_synced: number
  errors: string[]
}

export const projetsService = {
  // ── Projects ──
  list: async (params: ProjectListParams = {}): Promise<PaginatedResponse<Project>> => {
    const { data } = await api.get('/api/v1/projects', { params })
    return data
  },

  get: async (id: string): Promise<Project> => {
    const { data } = await api.get(`/api/v1/projects/${id}`)
    return data
  },

  create: async (payload: ProjectCreate): Promise<Project> => {
    const { data } = await api.post('/api/v1/projects', payload)
    return data
  },

  update: async (id: string, payload: ProjectUpdate): Promise<Project> => {
    const { data } = await api.patch(`/api/v1/projects/${id}`, payload)
    return data
  },

  archive: async (id: string): Promise<void> => {
    await api.delete(`/api/v1/projects/${id}`)
  },

  // ── All Tasks (cross-project, spreadsheet view) ──
  listAllTasks: async (params: PaginationParams & {
    project_id?: string; status?: string; priority?: string;
    assignee_id?: string; search?: string;
  } = {}): Promise<PaginatedResponse<ProjectTaskEnriched>> => {
    const { data } = await api.get('/api/v1/projects/tasks-all', { params })
    return data
  },

  // ── Sub-projects ──
  listChildren: async (projectId: string): Promise<Project[]> => {
    const { data } = await api.get(`/api/v1/projects/${projectId}/children`)
    return data
  },

  // ── Members ──
  listMembers: async (projectId: string): Promise<ProjectMember[]> => {
    const { data } = await api.get(`/api/v1/projects/${projectId}/members`)
    return data
  },

  addMember: async (projectId: string, payload: ProjectMemberCreate): Promise<ProjectMember> => {
    const { data } = await api.post(`/api/v1/projects/${projectId}/members`, payload)
    return data
  },

  removeMember: async (projectId: string, memberId: string): Promise<void> => {
    await api.delete(`/api/v1/projects/${projectId}/members/${memberId}`)
  },

  // ── Tasks ──
  listTasks: async (projectId: string, params: { status?: string; assignee_id?: string } = {}): Promise<ProjectTask[]> => {
    const { data } = await api.get(`/api/v1/projects/${projectId}/tasks`, { params })
    return data
  },

  createTask: async (projectId: string, payload: ProjectTaskCreate): Promise<ProjectTask> => {
    const { data } = await api.post(`/api/v1/projects/${projectId}/tasks`, payload)
    return data
  },

  updateTask: async (projectId: string, taskId: string, payload: ProjectTaskUpdate): Promise<ProjectTask> => {
    const { data } = await api.patch(`/api/v1/projects/${projectId}/tasks/${taskId}`, payload)
    return data
  },

  deleteTask: async (projectId: string, taskId: string): Promise<void> => {
    await api.delete(`/api/v1/projects/${projectId}/tasks/${taskId}`)
  },

  reorderTasks: async (projectId: string, items: { id: string; order: number; status?: string }[]): Promise<void> => {
    await api.patch(`/api/v1/projects/${projectId}/tasks/reorder`, items)
  },

  // ── Milestones ──
  listMilestones: async (projectId: string): Promise<ProjectMilestone[]> => {
    const { data } = await api.get(`/api/v1/projects/${projectId}/milestones`)
    return data
  },

  createMilestone: async (projectId: string, payload: ProjectMilestoneCreate): Promise<ProjectMilestone> => {
    const { data } = await api.post(`/api/v1/projects/${projectId}/milestones`, payload)
    return data
  },

  updateMilestone: async (projectId: string, msId: string, payload: ProjectMilestoneUpdate): Promise<ProjectMilestone> => {
    const { data } = await api.patch(`/api/v1/projects/${projectId}/milestones/${msId}`, payload)
    return data
  },

  deleteMilestone: async (projectId: string, msId: string): Promise<void> => {
    await api.delete(`/api/v1/projects/${projectId}/milestones/${msId}`)
  },

  // ── Planning Revisions ──
  listRevisions: async (projectId: string): Promise<PlanningRevision[]> => {
    const { data } = await api.get(`/api/v1/projects/${projectId}/revisions`)
    return data
  },

  createRevision: async (projectId: string, payload: PlanningRevisionCreate): Promise<PlanningRevision> => {
    const { data } = await api.post(`/api/v1/projects/${projectId}/revisions`, payload)
    return data
  },

  updateRevision: async (projectId: string, revisionId: string, payload: PlanningRevisionUpdate): Promise<PlanningRevision> => {
    const { data } = await api.patch(`/api/v1/projects/${projectId}/revisions/${revisionId}`, payload)
    return data
  },

  applyRevision: async (projectId: string, revisionId: string): Promise<void> => {
    await api.post(`/api/v1/projects/${projectId}/revisions/${revisionId}/apply`)
  },

  deleteRevision: async (projectId: string, revisionId: string): Promise<void> => {
    await api.delete(`/api/v1/projects/${projectId}/revisions/${revisionId}`)
  },

  // ── Task Deliverables ──
  listDeliverables: async (projectId: string, taskId: string): Promise<TaskDeliverable[]> => {
    const { data } = await api.get(`/api/v1/projects/${projectId}/tasks/${taskId}/deliverables`)
    return data
  },

  createDeliverable: async (projectId: string, taskId: string, payload: TaskDeliverableCreate): Promise<TaskDeliverable> => {
    const { data } = await api.post(`/api/v1/projects/${projectId}/tasks/${taskId}/deliverables`, payload)
    return data
  },

  updateDeliverable: async (projectId: string, taskId: string, deliverableId: string, payload: TaskDeliverableUpdate): Promise<TaskDeliverable> => {
    const { data } = await api.patch(`/api/v1/projects/${projectId}/tasks/${taskId}/deliverables/${deliverableId}`, payload)
    return data
  },

  deleteDeliverable: async (projectId: string, taskId: string, deliverableId: string): Promise<void> => {
    await api.delete(`/api/v1/projects/${projectId}/tasks/${taskId}/deliverables/${deliverableId}`)
  },

  // ── Task Actions / Checklists ──
  listActions: async (projectId: string, taskId: string): Promise<TaskAction[]> => {
    const { data } = await api.get(`/api/v1/projects/${projectId}/tasks/${taskId}/actions`)
    return data
  },

  createAction: async (projectId: string, taskId: string, payload: TaskActionCreate): Promise<TaskAction> => {
    const { data } = await api.post(`/api/v1/projects/${projectId}/tasks/${taskId}/actions`, payload)
    return data
  },

  updateAction: async (projectId: string, taskId: string, actionId: string, payload: TaskActionUpdate): Promise<TaskAction> => {
    const { data } = await api.patch(`/api/v1/projects/${projectId}/tasks/${taskId}/actions/${actionId}`, payload)
    return data
  },

  deleteAction: async (projectId: string, taskId: string, actionId: string): Promise<void> => {
    await api.delete(`/api/v1/projects/${projectId}/tasks/${taskId}/actions/${actionId}`)
  },

  // ── Task Change Log ──
  listChangelog: async (projectId: string, taskId: string): Promise<TaskChangeLog[]> => {
    const { data } = await api.get(`/api/v1/projects/${projectId}/tasks/${taskId}/changelog`)
    return data
  },

  // ── Task Dependencies ──
  listDependencies: async (projectId: string): Promise<TaskDependency[]> => {
    const { data } = await api.get(`/api/v1/projects/${projectId}/dependencies`)
    return data
  },

  createDependency: async (projectId: string, payload: TaskDependencyCreate): Promise<TaskDependency> => {
    const { data } = await api.post(`/api/v1/projects/${projectId}/dependencies`, payload)
    return data
  },

  deleteDependency: async (projectId: string, depId: string): Promise<void> => {
    await api.delete(`/api/v1/projects/${projectId}/dependencies/${depId}`)
  },

  // ── Gouti sync (import / resync from external Gouti API) ──
  goutiStatus: async (): Promise<GoutiSyncStatus> => {
    const { data } = await api.get('/api/v1/gouti/status')
    return data
  },

  goutiSyncAll: async (): Promise<GoutiSyncResult> => {
    const { data } = await api.post('/api/v1/gouti/sync')
    return data
  },

  goutiSyncOne: async (goutiProjectId: string): Promise<GoutiSingleSyncResult> => {
    const { data } = await api.post(`/api/v1/gouti/sync/${goutiProjectId}`)
    return data
  },

  // ── Gouti catalog / filters / selection (import assistant) ──
  goutiFacets: async (): Promise<GoutiFacets> => {
    const { data } = await api.get('/api/v1/gouti/catalog/facets')
    return data
  },

  goutiCatalog: async (filters: GoutiCatalogFilters = {}): Promise<GoutiCatalogResponse> => {
    const params: Record<string, string | number> = {}
    if (filters.year != null) params.year = filters.year
    if (filters.category_ids?.length) params.category_ids = filters.category_ids.join(',')
    if (filters.status?.length) params.status = filters.status.join(',')
    if (filters.manager_id) params.manager_id = filters.manager_id
    if (filters.criticality?.length) params.criticality = filters.criticality.join(',')
    if (filters.search) params.search = filters.search
    const { data } = await api.get('/api/v1/gouti/catalog', { params })
    return data
  },

  goutiDefaultFilters: async (): Promise<GoutiCatalogFilters> => {
    const { data } = await api.get('/api/v1/gouti/default-filters')
    return data
  },

  goutiSetDefaultFilters: async (filters: GoutiCatalogFilters): Promise<GoutiCatalogFilters> => {
    const { data } = await api.put('/api/v1/gouti/default-filters', filters)
    return data
  },

  goutiGetSelection: async (): Promise<GoutiSelectionPayload> => {
    const { data } = await api.get('/api/v1/gouti/selection')
    return data
  },

  goutiSaveSelection: async (payload: GoutiSelectionPayload): Promise<GoutiSelectionPayload> => {
    const { data } = await api.put('/api/v1/gouti/selection', payload)
    return data
  },

  goutiClearSelection: async (): Promise<void> => {
    await api.delete('/api/v1/gouti/selection')
  },

  goutiSyncSelected: async (): Promise<GoutiSyncResult> => {
    const { data } = await api.post('/api/v1/gouti/sync-selected')
    return data
  },

  goutiProjectTasks: async (goutiProjectId: string): Promise<{ count: number; items: GoutiCatalogTask[] }> => {
    const { data } = await api.get(`/api/v1/gouti/catalog/projects/${goutiProjectId}/tasks`)
    return data
  },

  // ── WBS nodes ──
  listWbsNodes: async (projectId: string): Promise<ProjectWBSNode[]> => {
    const { data } = await api.get(`/api/v1/projects/${projectId}/wbs`)
    return data
  },

  createWbsNode: async (projectId: string, payload: ProjectWBSNodeCreate): Promise<ProjectWBSNode> => {
    const { data } = await api.post(`/api/v1/projects/${projectId}/wbs`, payload)
    return data
  },

  updateWbsNode: async (projectId: string, nodeId: string, payload: ProjectWBSNodeUpdate): Promise<ProjectWBSNode> => {
    const { data } = await api.patch(`/api/v1/projects/${projectId}/wbs/${nodeId}`, payload)
    return data
  },

  deleteWbsNode: async (projectId: string, nodeId: string): Promise<void> => {
    await api.delete(`/api/v1/projects/${projectId}/wbs/${nodeId}`)
  },

  // ── CPM ──
  getCpm: async (projectId: string): Promise<CPMResult> => {
    const { data } = await api.get(`/api/v1/projects/${projectId}/cpm`)
    return data
  },

  // ── Planner link ──
  listPlannerLinks: async (projectId: string): Promise<{ task_id: string; activity_id: string; status: string; title: string }[]> => {
    const { data } = await api.get(`/api/v1/projects/${projectId}/planner-links`)
    return data
  },

  sendToPlanner: async (projectId: string, items: { task_id: string; pax_quota?: number; priority: string }[], assetId?: string): Promise<{ created: number; skipped: number; errors: string[] }> => {
    const { data } = await api.post(`/api/v1/projects/${projectId}/send-to-planner`, {
      items,
      asset_id: assetId || undefined,
    })
    return data
  },

  /**
   * Spec 1.5 / 2.3: remove a single task from the Planner. Soft-deletes
   * the linked PlannerActivities so the Gantt and heatmap no longer
   * count them. Idempotent — safe to call when no link exists.
   */
  unlinkTaskFromPlanner: async (projectId: string, taskId: string): Promise<void> => {
    await api.delete(`/api/v1/projects/${projectId}/tasks/${taskId}/planner-link`)
  },

  // ── Templates ──
  listTemplates: async (category?: string): Promise<ProjectTemplate[]> => {
    const { data } = await api.get('/api/v1/projects/templates', { params: category ? { category } : {} })
    return data
  },

  saveAsTemplate: async (payload: ProjectTemplateCreate): Promise<ProjectTemplate> => {
    const { data } = await api.post('/api/v1/projects/templates', null, { params: payload })
    return data
  },

  cloneFromTemplate: async (templateId: string, name: string): Promise<Project> => {
    const { data } = await api.post('/api/v1/projects/from-template', null, { params: { template_id: templateId, name } })
    return data
  },

  deleteTemplate: async (templateId: string): Promise<void> => {
    await api.delete(`/api/v1/projects/templates/${templateId}`)
  },

  // ── Custom Fields ──
  listCustomFields: async (projectId: string): Promise<CustomFieldDef[]> => {
    const { data } = await api.get(`/api/v1/projects/${projectId}/custom-fields`)
    return data
  },

  setCustomFieldValue: async (projectId: string, fieldDefId: string, payload: CustomFieldValuePayload): Promise<void> => {
    await api.put(`/api/v1/projects/${projectId}/custom-fields/${fieldDefId}`, null, { params: payload })
  },

  // ── Comments ──
  listProjectComments: async (projectId: string): Promise<ProjectComment[]> => {
    const { data } = await api.get(`/api/v1/projects/${projectId}/comments`)
    return data
  },

  createProjectComment: async (projectId: string, payload: ProjectCommentCreate): Promise<ProjectComment> => {
    const { data } = await api.post(`/api/v1/projects/${projectId}/comments`, payload)
    return data
  },

  listTaskComments: async (projectId: string, taskId: string): Promise<ProjectComment[]> => {
    const { data } = await api.get(`/api/v1/projects/${projectId}/tasks/${taskId}/comments`)
    return data
  },

  createTaskComment: async (projectId: string, taskId: string, payload: ProjectCommentCreate): Promise<ProjectComment> => {
    const { data } = await api.post(`/api/v1/projects/${projectId}/tasks/${taskId}/comments`, payload)
    return data
  },

  deleteComment: async (projectId: string, commentId: string): Promise<void> => {
    await api.delete(`/api/v1/projects/${projectId}/comments/${commentId}`)
  },

  // ── Activity Feed ──
  getActivityFeed: async (projectId: string, limit = 50): Promise<ActivityFeedItem[]> => {
    const { data } = await api.get(`/api/v1/projects/${projectId}/activity-feed`, { params: { limit } })
    return data
  },

  // ── PDF Export ──
  exportPdf: async (projectId: string): Promise<Blob> => {
    const { data } = await api.get(`/api/v1/projects/${projectId}/pdf`, { responseType: 'blob' })
    return data
  },
}

// Helper to detect Gouti-imported projects from the external_ref field
export function isGoutiProject(p: { external_ref?: string | null }): boolean {
  return !!p.external_ref && p.external_ref.startsWith('gouti:')
}

export function goutiProjectId(p: { external_ref?: string | null }): string | null {
  if (!p.external_ref || !p.external_ref.startsWith('gouti:')) return null
  return p.external_ref.slice('gouti:'.length)
}

// Fields Gouti owns on an imported project — these are always read-only
// locally and can only change via a Gouti sync. Kept in sync with the
// backend GOUTI_OWNED set in update_project.
export const GOUTI_OWNED_PROJECT_FIELDS = new Set<string>([
  'name', 'code', 'description', 'status', 'priority',
  'progress', 'start_date', 'end_date', 'actual_end_date', 'budget',
])

export function isProjectFieldEditable(
  project: { external_ref?: string | null },
  field: string,
  capabilities?: GoutiCapabilities | null,
): boolean {
  if (!isGoutiProject(project)) return true
  if (!GOUTI_OWNED_PROJECT_FIELDS.has(field)) return true  // locally-owned field
  // Gouti-owned field: only editable if the capability matrix says so.
  const allowed = capabilities?.writes?.project || []
  return allowed.includes(field)
}
