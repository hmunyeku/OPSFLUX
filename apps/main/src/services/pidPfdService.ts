/**
 * PID/PFD API service — documents, equipment, process lines, DCS tags,
 * naming rules, process library, revisions, export, lock management.
 */
import api from '@/lib/api'
import type { PaginatedResponse, PaginationParams } from '@/types/api'

// ── Types ──────────────────────────────────────────────────────

export interface PIDDocument {
  id: string
  entity_id: string
  document_id: string | null
  project_id: string | null
  bu_id: string | null
  number: string
  title: string
  pid_type: 'pid' | 'pfd' | 'uid' | 'ufd' | 'cause_effect' | 'sld' | 'layout' | 'tie_in'
  revision: string
  status: string
  sheet_format: string
  scale: string | null
  drawing_number: string | null
  is_active: boolean
  created_by: string
  created_at: string
  updated_at: string
  // Enriched
  project_name: string | null
  equipment_count: number
  creator_name: string | null
}

export interface PIDDocumentDetail extends PIDDocument {
  xml_content: string | null
}

export interface PIDDocumentCreate {
  project_id?: string
  title: string
  pid_type: string
  sheet_format?: string
  scale?: string
  drawing_number?: string
}

export interface PIDDocumentUpdate {
  title?: string
  pid_type?: string
  sheet_format?: string
  scale?: string
  drawing_number?: string
  status?: string
}

export interface PIDRevision {
  id: string
  pid_document_id: string
  revision_code: string
  change_description: string | null
  change_type: string
  created_by: string
  created_at: string
  creator_name: string | null
}

export interface Equipment {
  id: string
  entity_id: string
  project_id: string | null
  pid_document_id: string | null
  asset_id: string | null
  tag: string
  description: string | null
  equipment_type: string
  service: string | null
  fluid: string | null
  fluid_phase: string | null
  design_pressure_barg: number | null
  design_temperature_c: number | null
  operating_pressure_barg: number | null
  operating_temperature_c: number | null
  material_of_construction: string | null
  capacity_value: number | null
  capacity_unit: string | null
  lat: number | null
  lng: number | null
  mxgraph_cell_id: string | null
  is_active: boolean
  removed_from_pid: boolean
  created_at: string
  updated_at: string
  // Enriched
  pid_number: string | null
  project_name: string | null
  asset_name: string | null
  dcs_tag_count: number
}

export interface ProcessLine {
  id: string
  entity_id: string
  project_id: string | null
  line_number: string
  nominal_diameter_inch: number | null
  nominal_diameter_mm: number | null
  pipe_schedule: string | null
  spec_class: string | null
  spec_code: string | null
  fluid: string | null
  fluid_full_name: string | null
  insulation_type: string
  insulation_thickness_mm: number | null
  heat_tracing: boolean
  heat_tracing_type: string | null
  design_pressure_barg: number | null
  design_temperature_c: number | null
  material_of_construction: string | null
  length_m: number | null
  mxgraph_cell_id: string | null
  created_at: string
}

export interface DCSTag {
  id: string
  entity_id: string
  project_id: string | null
  tag_name: string
  description: string | null
  tag_type: string
  area: string | null
  equipment_id: string | null
  pid_document_id: string | null
  dcs_address: string | null
  range_min: number | null
  range_max: number | null
  engineering_unit: string | null
  alarm_lo: number | null
  alarm_hi: number | null
  trip_lo: number | null
  trip_hi: number | null
  source: string | null
  is_active: boolean
  created_by: string
  created_at: string
  updated_at: string
  // Enriched
  equipment_tag: string | null
  pid_number: string | null
}

export interface TagNamingRule {
  id: string
  entity_id: string
  name: string
  description: string | null
  pattern: string
  segments: Array<Record<string, unknown>>
  separator: string
  applies_to_types: string[]
  is_default: boolean
  created_by: string
  created_at: string
}

export interface ProcessLibItem {
  id: string
  entity_id: string
  name: string
  category: string
  subcategory: string | null
  svg_template: string
  mxgraph_style: string
  properties_schema: Record<string, unknown>
  connection_points: Array<Record<string, unknown>>
  equipment_type_mapping: string | null
  autocad_block_name: string | null
  version: number
  is_active: boolean
  is_predefined: boolean
  created_by: string
  created_at: string
}

export interface PIDWorkflowTransitionDef {
  to_state: string
  label: string
  required_roles: string[]
  comment_required: boolean
}

export interface PIDWorkflowHistoryEntry {
  from_state: string
  to_state: string
  comment: string | null
  created_at: string | null
  actor_name: string
}

export interface PIDWorkflowState {
  current_state: string | null
  instance_id: string | null
  available_transitions: PIDWorkflowTransitionDef[]
  history: PIDWorkflowHistoryEntry[]
}

export interface AFCValidationResult {
  is_valid: boolean
  errors: Array<{ code: string; severity: string; message: string; entity_type?: string; entity_tag?: string }>
  warnings: Array<{ code: string; severity: string; message: string; entity_type?: string; entity_tag?: string }>
}

// ── Service ────────────────────────────────────────────────────

export const pidPfdService = {
  // ── PID Documents ──

  listDocuments: async (params: PaginationParams & {
    project_id?: string
    status?: string
    search?: string
  } = {}): Promise<PaginatedResponse<PIDDocument>> => {
    const { data } = await api.get('/api/v1/pid', { params })
    return data
  },

  getDocument: async (id: string): Promise<PIDDocumentDetail> => {
    const { data } = await api.get(`/api/v1/pid/${id}`)
    return data
  },

  createDocument: async (payload: PIDDocumentCreate): Promise<PIDDocument> => {
    const { data } = await api.post('/api/v1/pid', payload)
    return data
  },

  updateDocument: async (id: string, payload: PIDDocumentUpdate): Promise<PIDDocument> => {
    const { data } = await api.patch(`/api/v1/pid/${id}`, payload)
    return data
  },

  // ── Dynamic Workflow ──

  getWorkflowState: async (pidId: string): Promise<PIDWorkflowState> => {
    const { data } = await api.get(`/api/v1/pid/${pidId}/workflow-state`)
    return data
  },

  executeTransition: async (pidId: string, payload: { to_state: string; comment?: string }): Promise<PIDWorkflowState> => {
    const { data } = await api.post(`/api/v1/pid/${pidId}/transition`, payload)
    return data
  },

  // ── Draw.io XML ──

  saveXml: async (id: string, xmlContent: string): Promise<void> => {
    await api.patch(`/api/v1/pid/${id}/xml`, { xml_content: xmlContent })
  },

  syncXml: async (id: string): Promise<Record<string, unknown>> => {
    const { data } = await api.post(`/api/v1/pid/${id}/sync`)
    return data
  },

  // ── Revisions ──

  listRevisions: async (pidId: string): Promise<PIDRevision[]> => {
    const { data } = await api.get(`/api/v1/pid/${pidId}/revisions`)
    return data
  },

  createRevision: async (pidId: string, payload: {
    description?: string
    change_type?: string
  }): Promise<PIDRevision> => {
    const { data } = await api.post(`/api/v1/pid/${pidId}/revisions`, payload)
    return data
  },

  diffRevisions: async (pidId: string, revA: string, revB: string): Promise<Record<string, unknown>> => {
    const { data } = await api.get(`/api/v1/pid/${pidId}/diff`, { params: { rev_a: revA, rev_b: revB } })
    return data
  },

  // ── Equipment ──

  listEquipment: async (params: PaginationParams & {
    search?: string
    equipment_type?: string
    pid_id?: string
    project_id?: string
  } = {}): Promise<PaginatedResponse<Equipment>> => {
    const { data } = await api.get('/api/v1/pid/equipment', { params })
    return data
  },

  getEquipment: async (id: string): Promise<Equipment> => {
    const { data } = await api.get(`/api/v1/pid/equipment/${id}`)
    return data
  },

  updateEquipment: async (id: string, payload: Record<string, unknown>): Promise<Equipment> => {
    const { data } = await api.patch(`/api/v1/pid/equipment/${id}`, payload)
    return data
  },

  getEquipmentAppearances: async (id: string): Promise<{
    tag: string
    appearances: Array<{ pid_document_id: string; pid_number: string; mxgraph_cell_id: string | null }>
  }> => {
    const { data } = await api.get(`/api/v1/pid/equipment/${id}/appearances`)
    return data
  },

  // ── Process Lines ──

  listProcessLines: async (params: PaginationParams & {
    project_id?: string
    search?: string
  } = {}): Promise<PaginatedResponse<ProcessLine>> => {
    const { data } = await api.get('/api/v1/pid/lines', { params })
    return data
  },

  traceProcessLine: async (lineNumber: string, projectId: string): Promise<Record<string, unknown>> => {
    const { data } = await api.post('/api/v1/pid/lines/trace', { line_number: lineNumber, project_id: projectId })
    return data
  },

  // ── DCS Tags ──

  listTags: async (params: PaginationParams & {
    project_id?: string
    search?: string
    tag_type?: string
    area?: string
    equipment_id?: string
  } = {}): Promise<PaginatedResponse<DCSTag>> => {
    const { data } = await api.get('/api/v1/pid/tags', { params })
    return data
  },

  createTag: async (payload: Record<string, unknown>): Promise<DCSTag> => {
    const { data } = await api.post('/api/v1/pid/tags', payload)
    return data
  },

  updateTag: async (id: string, payload: Record<string, unknown>): Promise<DCSTag> => {
    const { data } = await api.patch(`/api/v1/pid/tags/${id}`, payload)
    return data
  },

  suggestTags: async (payload: {
    tag_type: string
    area: string
    equipment_id?: string
    project_id: string
  }): Promise<{ suggestions: string[] }> => {
    const { data } = await api.post('/api/v1/pid/tags/suggest', payload)
    return data
  },

  validateTag: async (payload: {
    tag_name: string
    tag_type: string
    project_id: string
  }): Promise<{ is_valid: boolean; errors: string[]; warnings: string[] }> => {
    const { data } = await api.post('/api/v1/pid/tags/validate', payload)
    return data
  },

  importTagsCsv: async (projectId: string, file: File): Promise<Record<string, unknown>> => {
    const formData = new FormData()
    formData.append('file', file)
    const { data } = await api.post(`/api/v1/pid/tags/import?project_id=${projectId}`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return data
  },

  previewBulkRename: async (payload: {
    project_id: string
    filter_area?: string
    filter_type?: string
    filter_pattern?: string
    rename_pattern: string
  }): Promise<{ preview: Array<{ old_name: string; new_name: string }> }> => {
    const { data } = await api.post('/api/v1/pid/tags/bulk-rename/preview', payload)
    return data
  },

  executeBulkRename: async (payload: {
    project_id: string
    renames: Array<{ old_name: string; new_name: string }>
  }): Promise<Record<string, unknown>> => {
    const { data } = await api.post('/api/v1/pid/tags/bulk-rename/execute', payload)
    return data
  },

  // ── Tag Naming Rules ──

  listNamingRules: async (): Promise<TagNamingRule[]> => {
    const { data } = await api.get('/api/v1/pid/naming-rules')
    return data
  },

  createNamingRule: async (payload: Record<string, unknown>): Promise<TagNamingRule> => {
    const { data } = await api.post('/api/v1/pid/naming-rules', payload)
    return data
  },

  updateNamingRule: async (id: string, payload: Record<string, unknown>): Promise<TagNamingRule> => {
    const { data } = await api.patch(`/api/v1/pid/naming-rules/${id}`, payload)
    return data
  },

  // ── Process Library ──

  listLibraryItems: async (params?: {
    category?: string
    search?: string
  }): Promise<ProcessLibItem[]> => {
    const { data } = await api.get('/api/v1/pid/library', { params })
    return data
  },

  createLibraryItem: async (payload: Record<string, unknown>): Promise<ProcessLibItem> => {
    const { data } = await api.post('/api/v1/pid/library', payload)
    return data
  },

  getDrawioLibraryUrl: (): string => '/api/v1/pid/library/drawio.xml',

  // ── Cell Data ──

  getCellData: async (pidId: string, cellId: string): Promise<{
    entity_type: string
    entity: Record<string, unknown> | null
    tag: string | null
    line_number: string | null
  }> => {
    const { data } = await api.get(`/api/v1/pid/${pidId}/cell/${cellId}`)
    return data
  },

  // ── AFC Validation ──

  validateAfc: async (pidId: string): Promise<AFCValidationResult> => {
    const { data } = await api.post(`/api/v1/pid/${pidId}/validate-afc`)
    return data
  },

  // ── Export ──

  exportSvgUrl: (pidId: string, revisionId?: string): string =>
    `/api/v1/pid/${pidId}/export/svg${revisionId ? `?revision_id=${revisionId}` : ''}`,

  exportPdfUrl: (pidId: string, revisionId?: string): string =>
    `/api/v1/pid/${pidId}/export/pdf${revisionId ? `?revision_id=${revisionId}` : ''}`,

  // ── Lock Management ──

  acquireLock: async (pidId: string): Promise<Record<string, unknown>> => {
    const { data } = await api.post(`/api/v1/pid/${pidId}/lock`)
    return data
  },

  releaseLock: async (pidId: string): Promise<void> => {
    await api.delete(`/api/v1/pid/${pidId}/lock`)
  },

  lockHeartbeat: async (pidId: string): Promise<void> => {
    await api.post(`/api/v1/pid/${pidId}/lock/heartbeat`)
  },

  forceReleaseLock: async (pidId: string): Promise<void> => {
    await api.post(`/api/v1/pid/${pidId}/lock/force-release`)
  },

  // ── Equipment CRUD ──

  createEquipment: async (payload: Record<string, unknown>): Promise<Equipment> => {
    const { data } = await api.post('/api/v1/pid/equipment', payload)
    return data
  },

  deleteEquipment: async (id: string): Promise<void> => {
    await api.delete(`/api/v1/pid/equipment/${id}`)
  },

  // ── Process Lines CRUD ──

  createProcessLine: async (payload: Record<string, unknown>): Promise<ProcessLine> => {
    const { data } = await api.post('/api/v1/pid/lines', payload)
    return data
  },

  updateProcessLine: async (id: string, payload: Record<string, unknown>): Promise<ProcessLine> => {
    const { data } = await api.patch(`/api/v1/pid/lines/${id}`, payload)
    return data
  },

  deleteProcessLine: async (id: string): Promise<void> => {
    await api.delete(`/api/v1/pid/lines/${id}`)
  },

  // ── DCS Tags delete ──

  deleteTag: async (id: string): Promise<void> => {
    await api.delete(`/api/v1/pid/tags/${id}`)
  },

  // ── Process Library CRUD ──

  updateLibraryItem: async (id: string, payload: Record<string, unknown>): Promise<ProcessLibItem> => {
    const { data } = await api.patch(`/api/v1/pid/library/${id}`, payload)
    return data
  },

  deleteLibraryItem: async (id: string): Promise<void> => {
    await api.delete(`/api/v1/pid/library/${id}`)
  },

  // ── PID Documents delete ──

  deleteDocument: async (id: string): Promise<void> => {
    await api.delete(`/api/v1/pid/${id}`)
  },
}
