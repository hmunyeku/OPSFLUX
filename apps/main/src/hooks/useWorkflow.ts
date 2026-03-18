/**
 * React Query hooks for workflow engine.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { workflowService } from '@/services/workflowService'
import type { WorkflowDefinitionCreate, WorkflowNodeDef, WorkflowEdgeDef } from '@/services/workflowService'

// ── Definition hooks ──

export function useWorkflowDefinitions(params: { page?: number; page_size?: number; status?: string; search?: string } = {}) {
  return useQuery({
    queryKey: ['workflow', 'definitions', params],
    queryFn: () => workflowService.listDefinitions(params),
  })
}

export function useWorkflowDefinition(id: string) {
  return useQuery({
    queryKey: ['workflow', 'definitions', id],
    queryFn: () => workflowService.getDefinition(id),
    enabled: !!id,
  })
}

export function useCreateWorkflowDefinition() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: WorkflowDefinitionCreate) => workflowService.createDefinition(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workflow', 'definitions'] })
    },
  })
}

export function useUpdateWorkflowDefinition() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Partial<WorkflowDefinitionCreate & { nodes: WorkflowNodeDef[]; edges: WorkflowEdgeDef[] }> }) =>
      workflowService.updateDefinition(id, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workflow', 'definitions'] })
    },
  })
}

export function usePublishWorkflowDefinition() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => workflowService.publishDefinition(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workflow', 'definitions'] })
    },
  })
}

export function useArchiveWorkflowDefinition() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => workflowService.archiveDefinition(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workflow', 'definitions'] })
    },
  })
}

export function useCloneWorkflowDefinition() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => workflowService.cloneDefinition(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workflow', 'definitions'] })
    },
  })
}

export function useDeleteWorkflowDefinition() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => workflowService.deleteDefinition(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workflow', 'definitions'] })
    },
  })
}

// ── Instance hooks ──

export function useWorkflowInstances(params: { page?: number; page_size?: number; definition_id?: string; current_state?: string } = {}) {
  return useQuery({
    queryKey: ['workflow', 'instances', params],
    queryFn: () => workflowService.listInstances(params),
  })
}

export function useWorkflowInstance(id: string) {
  return useQuery({
    queryKey: ['workflow', 'instances', id],
    queryFn: () => workflowService.getInstance(id),
    enabled: !!id,
  })
}

export function useWorkflowInstanceHistory(id: string) {
  return useQuery({
    queryKey: ['workflow', 'instances', id, 'history'],
    queryFn: () => workflowService.getInstanceHistory(id),
    enabled: !!id,
  })
}

export function useCreateWorkflowInstance() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: {
      workflow_definition_id: string
      entity_type: string
      entity_id_ref: string
      metadata?: Record<string, unknown>
    }) => workflowService.createInstance(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workflow', 'instances'] })
    },
  })
}

export function useWorkflowTransition() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...payload }: { id: string; to_state: string; comment?: string }) =>
      workflowService.transition(id, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workflow'] })
    },
  })
}

// ── Stats ──

export function useWorkflowStats() {
  return useQuery({
    queryKey: ['workflow', 'stats'],
    queryFn: () => workflowService.getStats(),
    staleTime: 60_000,
  })
}
