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
  PlanningRevisionCreate, PlanningRevisionUpdate,
  TaskDeliverableCreate, TaskDeliverableUpdate,
  TaskActionCreate, TaskActionUpdate,
  PaginationParams,
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

// ── All Tasks (cross-project spreadsheet) ──

export function useAllProjectTasks(params: PaginationParams & {
  project_id?: string; status?: string; priority?: string;
  assignee_id?: string; search?: string;
} = {}) {
  return useQuery({
    queryKey: ['all-project-tasks', params],
    queryFn: () => projetsService.listAllTasks(params),
  })
}

// ── Sub-projects ──

export function useSubProjects(projectId: string | undefined) {
  return useQuery({
    queryKey: ['sub-projects', projectId],
    queryFn: () => projetsService.listChildren(projectId!),
    enabled: !!projectId,
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

// ── Planning Revisions ──

export function usePlanningRevisions(projectId: string | undefined) {
  return useQuery({
    queryKey: ['planning-revisions', projectId],
    queryFn: () => projetsService.listRevisions(projectId!),
    enabled: !!projectId,
  })
}

export function useCreateRevision() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ projectId, payload }: { projectId: string; payload: PlanningRevisionCreate }) =>
      projetsService.createRevision(projectId, payload),
    onSuccess: (_, { projectId }) => {
      qc.invalidateQueries({ queryKey: ['planning-revisions', projectId] })
    },
  })
}

export function useUpdateRevision() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ projectId, revisionId, payload }: { projectId: string; revisionId: string; payload: PlanningRevisionUpdate }) =>
      projetsService.updateRevision(projectId, revisionId, payload),
    onSuccess: (_, { projectId }) => {
      qc.invalidateQueries({ queryKey: ['planning-revisions', projectId] })
    },
  })
}

export function useApplyRevision() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ projectId, revisionId }: { projectId: string; revisionId: string }) =>
      projetsService.applyRevision(projectId, revisionId),
    onSuccess: (_, { projectId }) => {
      qc.invalidateQueries({ queryKey: ['planning-revisions', projectId] })
      qc.invalidateQueries({ queryKey: ['projects'] })
    },
  })
}

export function useDeleteRevision() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ projectId, revisionId }: { projectId: string; revisionId: string }) =>
      projetsService.deleteRevision(projectId, revisionId),
    onSuccess: (_, { projectId }) => {
      qc.invalidateQueries({ queryKey: ['planning-revisions', projectId] })
    },
  })
}

// ── Task Deliverables ──

export function useTaskDeliverables(projectId: string | undefined, taskId: string | undefined) {
  return useQuery({
    queryKey: ['task-deliverables', projectId, taskId],
    queryFn: () => projetsService.listDeliverables(projectId!, taskId!),
    enabled: !!projectId && !!taskId,
  })
}

export function useCreateDeliverable() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ projectId, taskId, payload }: { projectId: string; taskId: string; payload: TaskDeliverableCreate }) =>
      projetsService.createDeliverable(projectId, taskId, payload),
    onSuccess: (_, { projectId, taskId }) => {
      qc.invalidateQueries({ queryKey: ['task-deliverables', projectId, taskId] })
    },
  })
}

export function useUpdateDeliverable() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ projectId, taskId, deliverableId, payload }: { projectId: string; taskId: string; deliverableId: string; payload: TaskDeliverableUpdate }) =>
      projetsService.updateDeliverable(projectId, taskId, deliverableId, payload),
    onSuccess: (_, { projectId, taskId }) => {
      qc.invalidateQueries({ queryKey: ['task-deliverables', projectId, taskId] })
    },
  })
}

export function useDeleteDeliverable() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ projectId, taskId, deliverableId }: { projectId: string; taskId: string; deliverableId: string }) =>
      projetsService.deleteDeliverable(projectId, taskId, deliverableId),
    onSuccess: (_, { projectId, taskId }) => {
      qc.invalidateQueries({ queryKey: ['task-deliverables', projectId, taskId] })
    },
  })
}

// ── Task Actions / Checklists ──

export function useTaskActions(projectId: string | undefined, taskId: string | undefined) {
  return useQuery({
    queryKey: ['task-actions', projectId, taskId],
    queryFn: () => projetsService.listActions(projectId!, taskId!),
    enabled: !!projectId && !!taskId,
  })
}

export function useCreateAction() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ projectId, taskId, payload }: { projectId: string; taskId: string; payload: TaskActionCreate }) =>
      projetsService.createAction(projectId, taskId, payload),
    onSuccess: (_, { projectId, taskId }) => {
      qc.invalidateQueries({ queryKey: ['task-actions', projectId, taskId] })
    },
  })
}

export function useUpdateAction() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ projectId, taskId, actionId, payload }: { projectId: string; taskId: string; actionId: string; payload: TaskActionUpdate }) =>
      projetsService.updateAction(projectId, taskId, actionId, payload),
    onSuccess: (_, { projectId, taskId }) => {
      qc.invalidateQueries({ queryKey: ['task-actions', projectId, taskId] })
    },
  })
}

export function useDeleteAction() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ projectId, taskId, actionId }: { projectId: string; taskId: string; actionId: string }) =>
      projetsService.deleteAction(projectId, taskId, actionId),
    onSuccess: (_, { projectId, taskId }) => {
      qc.invalidateQueries({ queryKey: ['task-actions', projectId, taskId] })
    },
  })
}

// ── Task Change Log ──

export function useTaskChangelog(projectId: string | undefined, taskId: string | undefined) {
  return useQuery({
    queryKey: ['task-changelog', projectId, taskId],
    queryFn: () => projetsService.listChangelog(projectId!, taskId!),
    enabled: !!projectId && !!taskId,
  })
}
