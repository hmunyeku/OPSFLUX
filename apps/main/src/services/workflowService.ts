/**
 * Workflow Engine API service.
 */
import api from '@/lib/api'
import type { PaginatedResponse, PaginationParams } from '@/types/api'

// ── Types ──

export interface WorkflowNodeDef {
  id: string
  type: 'start' | 'human_validation' | 'system_check' | 'notification' | 'condition' | 'parallel' | 'timer' | 'end_approved' | 'end_rejected' | 'end_cancelled'
  label: string
  config: Record<string, unknown>
  position: { x: number; y: number }
}

export interface WorkflowEdgeDef {
  id: string
  source: string
  target: string
  label?: string
  condition?: Record<string, unknown>
  condition_expression?: string
  required_role?: string
  required_roles?: string[]
  assignee?: Record<string, unknown>
  sla_hours?: number
  trigger?: 'human' | 'auto'
}

/** Full definition (returned by GET /definitions/:id, POST, PUT). */
export interface WorkflowDefinition {
  id: string
  entity_id: string
  slug: string
  name: string
  description: string | null
  entity_type: string
  status: 'draft' | 'published' | 'archived'
  version: number
  active: boolean
  // Visual editor data (computed fields from backend)
  nodes: WorkflowNodeDef[]
  edges: WorkflowEdgeDef[]
  // Raw JSONB (may be nodes or FSM states depending on creation method)
  states?: unknown
  transitions?: unknown
  created_by: string | null
  created_at: string
  updated_at: string
}

/** Lightweight summary (returned by GET /definitions list endpoint). */
export interface WorkflowDefinitionSummary {
  id: string
  entity_id: string
  slug: string
  name: string
  description: string | null
  entity_type: string
  status: 'draft' | 'published' | 'archived'
  version: number
  active: boolean
  node_count: number
  edge_count: number
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface WorkflowDefinitionCreate {
  name: string
  slug?: string
  description?: string
  entity_type?: string
  nodes?: WorkflowNodeDef[]
  edges?: WorkflowEdgeDef[]
}

export interface WorkflowInstance {
  id: string
  entity_id: string
  workflow_definition_id: string
  entity_type: string
  entity_id_ref: string
  current_state: string
  metadata: Record<string, unknown> | null
  definition_name?: string
  definition_slug?: string
  allowed_transitions?: string[]
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface WorkflowTransition {
  id: string
  instance_id: string
  from_state: string
  to_state: string
  actor_id: string
  actor_name?: string
  comment: string | null
  created_at: string
}

export interface WorkflowStateBucket {
  state: string
  count: number
}

export interface WorkflowStats {
  definition_id: string
  definition_name: string
  definition_slug: string
  total: number
  by_state: WorkflowStateBucket[]
}

// ── Params ──

interface DefinitionListParams extends PaginationParams {
  status?: string
  search?: string
}

interface InstanceListParams extends PaginationParams {
  definition_id?: string
  current_state?: string
  created_by?: string
  entity_type?: string
}

// ── Service ──

export const workflowService = {
  // ── Definitions ──

  listDefinitions: async (params: DefinitionListParams = {}): Promise<PaginatedResponse<WorkflowDefinitionSummary>> => {
    const { data } = await api.get('/api/v1/workflow/definitions', { params })
    return data
  },

  getDefinition: async (id: string): Promise<WorkflowDefinition> => {
    const { data } = await api.get(`/api/v1/workflow/definitions/${id}`)
    return data
  },

  createDefinition: async (payload: WorkflowDefinitionCreate): Promise<WorkflowDefinition> => {
    const { data } = await api.post('/api/v1/workflow/definitions', payload)
    return data
  },

  updateDefinition: async (id: string, payload: Partial<WorkflowDefinitionCreate & { nodes: WorkflowNodeDef[]; edges: WorkflowEdgeDef[] }>): Promise<WorkflowDefinition> => {
    const { data } = await api.put(`/api/v1/workflow/definitions/${id}`, payload)
    return data
  },

  publishDefinition: async (id: string): Promise<WorkflowDefinition> => {
    const { data } = await api.post(`/api/v1/workflow/definitions/${id}/publish`)
    return data
  },

  archiveDefinition: async (id: string): Promise<WorkflowDefinition> => {
    const { data } = await api.post(`/api/v1/workflow/definitions/${id}/archive`)
    return data
  },

  cloneDefinition: async (id: string): Promise<WorkflowDefinition> => {
    const { data } = await api.post(`/api/v1/workflow/definitions/${id}/clone`)
    return data
  },

  deleteDefinition: async (id: string): Promise<void> => {
    await api.delete(`/api/v1/workflow/definitions/${id}`)
  },

  // ── Instances ──

  listInstances: async (params: InstanceListParams = {}): Promise<PaginatedResponse<WorkflowInstance>> => {
    const { data } = await api.get('/api/v1/workflow/instances', { params })
    return data
  },

  getInstance: async (id: string): Promise<WorkflowInstance> => {
    const { data } = await api.get(`/api/v1/workflow/instances/${id}`)
    return data
  },

  createInstance: async (payload: {
    workflow_definition_id: string
    entity_type: string
    entity_id_ref: string
    metadata?: Record<string, unknown>
  }): Promise<WorkflowInstance> => {
    const { data } = await api.post('/api/v1/workflow/instances', payload)
    return data
  },

  getInstanceHistory: async (id: string): Promise<WorkflowTransition[]> => {
    const { data } = await api.get(`/api/v1/workflow/instances/${id}/history`)
    return data
  },

  transition: async (id: string, payload: { to_state: string; comment?: string }): Promise<WorkflowInstance> => {
    const { data } = await api.post(`/api/v1/workflow/instances/${id}/transition`, payload)
    return data
  },

  // ── Stats ──

  getStats: async (): Promise<WorkflowStats[]> => {
    const { data } = await api.get('/api/v1/workflow/stats')
    return data
  },
}
