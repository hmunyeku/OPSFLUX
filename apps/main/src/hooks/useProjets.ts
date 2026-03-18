/**
 * React Query hooks for Projets (project management) module.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { projetsService } from '@/services/projetsService'
import type {
  ProjectCreate, ProjectUpdate,
  ProjectMemberCreate,
  ProjectTaskCreate, ProjectTaskUpdate,
  ProjectMilestoneCreate, ProjectMilestoneUpdate,
} from '@/types/api'

// ── Projects ──

export function useProjects(params: {
  page?: number; page_size?: number;
  status?: string; priority?: string; manager_id?: string;
  tier_id?: string; asset_id?: string; search?: string;
} = {}) {
  return useQuery({
    queryKey: ['projects', params],
    queryFn: () => projetsService.list(params),
  })
}

export function useProject(id: string | undefined) {
  return useQuery({
    queryKey: ['projects', id],
    queryFn: () => projetsService.get(id!),
    enabled: !!id,
  })
}

export function useCreateProject() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: ProjectCreate) => projetsService.create(payload),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['projects'] }) },
  })
}

export function useUpdateProject() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: ProjectUpdate }) =>
      projetsService.update(id, payload),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['projects'] }) },
  })
}

export function useArchiveProject() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => projetsService.archive(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['projects'] }) },
  })
}

// ── Members ──

export function useProjectMembers(projectId: string | undefined) {
  return useQuery({
    queryKey: ['project-members', projectId],
    queryFn: () => projetsService.listMembers(projectId!),
    enabled: !!projectId,
  })
}

export function useAddProjectMember() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ projectId, payload }: { projectId: string; payload: ProjectMemberCreate }) =>
      projetsService.addMember(projectId, payload),
    onSuccess: (_, { projectId }) => {
      qc.invalidateQueries({ queryKey: ['project-members', projectId] })
      qc.invalidateQueries({ queryKey: ['projects'] })
    },
  })
}

export function useRemoveProjectMember() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ projectId, memberId }: { projectId: string; memberId: string }) =>
      projetsService.removeMember(projectId, memberId),
    onSuccess: (_, { projectId }) => {
      qc.invalidateQueries({ queryKey: ['project-members', projectId] })
      qc.invalidateQueries({ queryKey: ['projects'] })
    },
  })
}

// ── Tasks ──

export function useProjectTasks(projectId: string | undefined, params: { status?: string; assignee_id?: string } = {}) {
  return useQuery({
    queryKey: ['project-tasks', projectId, params],
    queryFn: () => projetsService.listTasks(projectId!, params),
    enabled: !!projectId,
  })
}

export function useCreateProjectTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ projectId, payload }: { projectId: string; payload: ProjectTaskCreate }) =>
      projetsService.createTask(projectId, payload),
    onSuccess: (_, { projectId }) => {
      qc.invalidateQueries({ queryKey: ['project-tasks', projectId] })
      qc.invalidateQueries({ queryKey: ['projects'] })
    },
  })
}

export function useUpdateProjectTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ projectId, taskId, payload }: { projectId: string; taskId: string; payload: ProjectTaskUpdate }) =>
      projetsService.updateTask(projectId, taskId, payload),
    onSuccess: (_, { projectId }) => {
      qc.invalidateQueries({ queryKey: ['project-tasks', projectId] })
    },
  })
}

export function useDeleteProjectTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ projectId, taskId }: { projectId: string; taskId: string }) =>
      projetsService.deleteTask(projectId, taskId),
    onSuccess: (_, { projectId }) => {
      qc.invalidateQueries({ queryKey: ['project-tasks', projectId] })
      qc.invalidateQueries({ queryKey: ['projects'] })
    },
  })
}

export function useReorderProjectTasks() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ projectId, items }: { projectId: string; items: { id: string; order: number; status?: string }[] }) =>
      projetsService.reorderTasks(projectId, items),
    onSuccess: (_, { projectId }) => {
      qc.invalidateQueries({ queryKey: ['project-tasks', projectId] })
    },
  })
}

// ── Milestones ──

export function useProjectMilestones(projectId: string | undefined) {
  return useQuery({
    queryKey: ['project-milestones', projectId],
    queryFn: () => projetsService.listMilestones(projectId!),
    enabled: !!projectId,
  })
}

export function useCreateProjectMilestone() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ projectId, payload }: { projectId: string; payload: ProjectMilestoneCreate }) =>
      projetsService.createMilestone(projectId, payload),
    onSuccess: (_, { projectId }) => {
      qc.invalidateQueries({ queryKey: ['project-milestones', projectId] })
    },
  })
}

export function useUpdateProjectMilestone() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ projectId, msId, payload }: { projectId: string; msId: string; payload: ProjectMilestoneUpdate }) =>
      projetsService.updateMilestone(projectId, msId, payload),
    onSuccess: (_, { projectId }) => {
      qc.invalidateQueries({ queryKey: ['project-milestones', projectId] })
    },
  })
}

export function useDeleteProjectMilestone() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ projectId, msId }: { projectId: string; msId: string }) =>
      projetsService.deleteMilestone(projectId, msId),
    onSuccess: (_, { projectId }) => {
      qc.invalidateQueries({ queryKey: ['project-milestones', projectId] })
    },
  })
}
