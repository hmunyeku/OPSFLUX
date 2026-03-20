/**
 * Report Editor API service — documents, revisions, templates, doc types,
 * distribution lists, arborescence, share links, workflow transitions.
 */
import api from '@/lib/api'
import type { PaginatedResponse, PaginationParams } from '@/types/api'

// ── Types ──────────────────────────────────────────────────────

export interface DocType {
  id: string
  entity_id: string
  code: string
  name: Record<string, string>
  nomenclature_pattern: string
  discipline: string | null
  default_template_id: string | null
  default_workflow_id: string | null
  default_language: string
  revision_scheme: 'alpha' | 'numeric' | 'semver'
  is_active: boolean
  created_by: string
  created_at: string
}

export interface DocTypeCreate {
  code: string
  name: Record<string, string>
  nomenclature_pattern: string
  discipline?: string
  default_template_id?: string
  default_workflow_id?: string
  default_language?: string
  revision_scheme?: 'alpha' | 'numeric' | 'semver'
}

export interface Document {
  id: string
  entity_id: string
  bu_id: string | null
  doc_type_id: string
  project_id: string | null
  arborescence_node_id: string | null
  number: string
  title: string
  language: string
  current_revision_id: string | null
  status: 'draft' | 'in_review' | 'approved' | 'published' | 'obsolete' | 'archived'
  classification: 'INT' | 'CONF' | 'REST' | 'PUB'
  created_by: string
  created_at: string
  updated_at: string
  // Enriched
  doc_type_name: string | null
  project_name: string | null
  creator_name: string | null
  revision_count: number
  current_rev_code: string | null
}

export interface DocumentCreate {
  doc_type_id: string
  project_id?: string
  arborescence_node_id?: string
  title: string
  language?: string
  classification?: string
  free_parts?: Record<string, string>
}

export interface DocumentUpdate {
  title?: string
  classification?: string
  arborescence_node_id?: string
}

export interface Revision {
  id: string
  entity_id: string
  document_id: string
  rev_code: string
  content: Record<string, unknown>
  form_data: Record<string, unknown>
  word_count: number
  is_locked: boolean
  created_by: string
  created_at: string
  creator_name: string | null
}

export interface RevisionSummary {
  id: string
  document_id: string
  rev_code: string
  word_count: number
  is_locked: boolean
  created_by: string
  created_at: string
  creator_name: string | null
}

export interface Template {
  id: string
  entity_id: string
  name: string
  description: string | null
  doc_type_id: string | null
  version: number
  structure: Record<string, unknown>
  styles: Record<string, unknown>
  is_active: boolean
  created_by: string
  created_at: string
  doc_type_name: string | null
  field_count: number
}

export interface TemplateCreate {
  name: string
  description?: string
  doc_type_id?: string
  structure: Record<string, unknown>
  styles: Record<string, unknown>
}

export interface TemplateUpdate {
  name?: string
  description?: string
  doc_type_id?: string
  structure?: Record<string, unknown>
  styles?: Record<string, unknown>
  is_active?: boolean
}

export interface DistributionList {
  id: string
  entity_id: string
  name: string
  doc_type_filter: string | null
  recipients: Array<Record<string, unknown>>
  is_active: boolean
  created_by: string
  created_at: string
  updated_at: string
  recipient_count: number
}

export interface ArborescenceNode {
  id: string
  entity_id: string
  project_id: string
  parent_id: string | null
  name: string
  node_level: number
  display_order: number
  nomenclature_override: Record<string, unknown> | null
  created_at: string
  children_count: number
}

export interface ShareLink {
  id: string
  entity_id: string
  document_id: string
  token: string
  expires_at: string
  otp_required: boolean
  access_count: number
  max_accesses: number | null
  created_by: string
  created_at: string
}

export interface RevisionDiff {
  rev_a: string
  rev_b: string
  additions: Array<Record<string, unknown>>
  deletions: Array<Record<string, unknown>>
  modifications: Array<Record<string, unknown>>
}

// ── Service ────────────────────────────────────────────────────

export const reportEditorService = {
  // ── Documents ──

  listDocuments: async (params: PaginationParams & {
    project_id?: string
    doc_type_id?: string
    status?: string
    classification?: string
    search?: string
  } = {}): Promise<PaginatedResponse<Document>> => {
    const { data } = await api.get('/api/v1/documents/', { params })
    return data
  },

  getDocument: async (id: string): Promise<Document> => {
    const { data } = await api.get(`/api/v1/documents/${id}`)
    return data
  },

  createDocument: async (payload: DocumentCreate): Promise<Document> => {
    const { data } = await api.post('/api/v1/documents/', payload)
    return data
  },

  updateDocument: async (id: string, payload: DocumentUpdate): Promise<Document> => {
    const { data } = await api.patch(`/api/v1/documents/${id}`, payload)
    return data
  },

  deleteDocument: async (id: string): Promise<void> => {
    await api.delete(`/api/v1/documents/${id}`)
  },

  archiveDocument: async (id: string): Promise<Document> => {
    const { data } = await api.post(`/api/v1/documents/${id}/archive`)
    return data
  },

  // ── Draft ──

  saveDraft: async (id: string, payload: {
    content?: Record<string, unknown>
    form_data?: Record<string, unknown>
    yjs_state?: string
  }): Promise<void> => {
    await api.patch(`/api/v1/documents/${id}/draft`, payload)
  },

  // ── Revisions ──

  listRevisions: async (docId: string): Promise<RevisionSummary[]> => {
    const { data } = await api.get(`/api/v1/documents/${docId}/revisions`)
    return data
  },

  getRevision: async (docId: string, revisionId: string): Promise<Revision> => {
    const { data } = await api.get(`/api/v1/documents/${docId}/revisions/${revisionId}`)
    return data
  },

  createRevision: async (docId: string): Promise<Revision> => {
    const { data } = await api.post(`/api/v1/documents/${docId}/revisions`)
    return data
  },

  diffRevisions: async (docId: string, revA: string, revB: string): Promise<RevisionDiff> => {
    const { data } = await api.get(`/api/v1/documents/${docId}/diff`, { params: { rev_a: revA, rev_b: revB } })
    return data
  },

  // ── Workflow ──

  submitDocument: async (id: string, comment?: string): Promise<Document> => {
    const { data } = await api.post(`/api/v1/documents/${id}/submit`, comment ? { comment } : undefined)
    return data
  },

  approveDocument: async (id: string, comment?: string): Promise<Document> => {
    const { data } = await api.post(`/api/v1/documents/${id}/approve`, comment ? { comment } : undefined)
    return data
  },

  rejectDocument: async (id: string, reason: string): Promise<Document> => {
    const { data } = await api.post(`/api/v1/documents/${id}/reject`, { reason })
    return data
  },

  publishDocument: async (id: string, distributionListIds: string[] = []): Promise<Document> => {
    const { data } = await api.post(`/api/v1/documents/${id}/publish`, { distribution_list_ids: distributionListIds })
    return data
  },

  // ── Export ──

  exportPdf: (docId: string, revisionId?: string): string =>
    `/api/v1/documents/${docId}/export/pdf${revisionId ? `?revision_id=${revisionId}` : ''}`,

  exportDocx: (docId: string): string =>
    `/api/v1/documents/${docId}/export/docx`,

  // ── Doc Types ──

  listDocTypes: async (): Promise<DocType[]> => {
    const { data } = await api.get('/api/v1/documents/types')
    return data
  },

  createDocType: async (payload: DocTypeCreate): Promise<DocType> => {
    const { data } = await api.post('/api/v1/documents/types', payload)
    return data
  },

  // ── Templates ──

  listTemplates: async (docTypeId?: string): Promise<Template[]> => {
    const { data } = await api.get('/api/v1/documents/templates', {
      params: docTypeId ? { doc_type_id: docTypeId } : undefined,
    })
    return data
  },

  createTemplate: async (payload: TemplateCreate): Promise<Template> => {
    const { data } = await api.post('/api/v1/documents/templates', payload)
    return data
  },

  updateTemplate: async (id: string, payload: TemplateUpdate): Promise<Template> => {
    const { data } = await api.patch(`/api/v1/documents/templates/${id}`, payload)
    return data
  },

  // ── Distribution Lists ──

  listDistributionLists: async (docTypeId?: string): Promise<DistributionList[]> => {
    const { data } = await api.get('/api/v1/documents/distribution-lists', {
      params: docTypeId ? { doc_type_id: docTypeId } : undefined,
    })
    return data
  },

  createDistributionList: async (payload: {
    name: string
    doc_type_filter?: string
    recipients: Array<Record<string, unknown>>
  }): Promise<DistributionList> => {
    const { data } = await api.post('/api/v1/documents/distribution-lists', payload)
    return data
  },

  // ── Arborescence ──

  listArborescenceNodes: async (projectId: string): Promise<ArborescenceNode[]> => {
    const { data } = await api.get(`/api/v1/documents/arborescence/${projectId}`)
    return data
  },

  createArborescenceNode: async (payload: {
    project_id: string
    parent_id?: string
    name: string
    display_order?: number
    nomenclature_override?: Record<string, unknown>
  }): Promise<ArborescenceNode> => {
    const { data } = await api.post('/api/v1/documents/arborescence', payload)
    return data
  },

  // ── Share Links ──

  createShareLink: async (docId: string, payload?: {
    expires_days?: number
    otp_required?: boolean
    max_accesses?: number
  }): Promise<ShareLink> => {
    const { data } = await api.post(`/api/v1/documents/${docId}/share`, payload)
    return data
  },

  // ── Nomenclature ──

  validateNomenclature: async (pattern: string): Promise<{
    pattern: string
    is_valid: boolean
    errors: string[]
  }> => {
    const { data } = await api.post('/api/v1/documents/nomenclature/validate', { pattern })
    return data
  },
}
