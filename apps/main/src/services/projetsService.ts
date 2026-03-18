/**
 * Projets (project management) API service.
 */
import api from '@/lib/api'
import type {
  Project, ProjectCreate, ProjectUpdate,
  ProjectMember, ProjectMemberCreate,
  ProjectTask, ProjectTaskCreate, ProjectTaskUpdate,
  ProjectMilestone, ProjectMilestoneCreate, ProjectMilestoneUpdate,
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
}
