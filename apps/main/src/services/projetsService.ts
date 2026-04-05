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
  PaginatedResponse, PaginationParams,
} from '@/types/api'

interface ProjectListParams extends PaginationParams {
  status?: string
  priority?: string
  manager_id?: string
  tier_id?: string
  asset_id?: string
  search?: string
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
}
