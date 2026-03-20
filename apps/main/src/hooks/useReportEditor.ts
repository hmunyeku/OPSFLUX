/**
 * React Query hooks for the Report Editor module.
 */
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { reportEditorService } from '@/services/reportEditorService'
import type {
  DocumentCreate, DocumentUpdate,
  DocTypeCreate, DocTypeUpdate,
  TemplateCreate, TemplateUpdate,
} from '@/services/reportEditorService'
import type { PaginationParams } from '@/types/api'

// ── Documents ──

export function useDocuments(params: PaginationParams & {
  project_id?: string
  doc_type_id?: string
  status?: string
  classification?: string
  arborescence_node_id?: string
  search?: string
} = {}) {
  return useQuery({
    queryKey: ['report-editor', 'documents', params],
    queryFn: () => reportEditorService.listDocuments(params),
    placeholderData: keepPreviousData,
  })
}

export function useDocumentCounts() {
  return useQuery({
    queryKey: ['report-editor', 'document-counts'],
    queryFn: () => reportEditorService.getDocumentCounts(),
    staleTime: 30_000,
  })
}

export function useDocument(id: string | undefined) {
  return useQuery({
    queryKey: ['report-editor', 'documents', id],
    queryFn: () => reportEditorService.getDocument(id!),
    enabled: !!id,
  })
}

export function useCreateDocument() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: DocumentCreate) => reportEditorService.createDocument(payload),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['report-editor', 'documents'] }) },
  })
}

export function useUpdateDocument() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: DocumentUpdate }) =>
      reportEditorService.updateDocument(id, payload),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['report-editor', 'documents'] }) },
  })
}

export function useDeleteDocument() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => reportEditorService.deleteDocument(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['report-editor', 'documents'] }) },
  })
}

export function useArchiveDocument() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => reportEditorService.archiveDocument(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['report-editor', 'documents'] }) },
  })
}

// ── Draft ──

export function useSaveDraft() {
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: { content?: Record<string, unknown>; form_data?: Record<string, unknown> } }) =>
      reportEditorService.saveDraft(id, payload),
  })
}

// ── Revisions ──

export function useRevisions(docId: string | undefined) {
  return useQuery({
    queryKey: ['report-editor', 'revisions', docId],
    queryFn: () => reportEditorService.listRevisions(docId!),
    enabled: !!docId,
  })
}

export function useRevision(docId: string | undefined, revisionId: string | undefined) {
  return useQuery({
    queryKey: ['report-editor', 'revision', docId, revisionId],
    queryFn: () => reportEditorService.getRevision(docId!, revisionId!),
    enabled: !!docId && !!revisionId,
  })
}

export function useCreateRevision() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (docId: string) => reportEditorService.createRevision(docId),
    onSuccess: (_, docId) => { qc.invalidateQueries({ queryKey: ['report-editor', 'revisions', docId] }) },
  })
}

export function useRevisionDiff(docId: string | undefined, revA: string | undefined, revB: string | undefined) {
  return useQuery({
    queryKey: ['report-editor', 'diff', docId, revA, revB],
    queryFn: () => reportEditorService.diffRevisions(docId!, revA!, revB!),
    enabled: !!docId && !!revA && !!revB,
  })
}

// ── Workflow ──

export function useSubmitDocument() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, comment }: { id: string; comment?: string }) =>
      reportEditorService.submitDocument(id, comment),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['report-editor', 'documents'] })
      qc.invalidateQueries({ queryKey: ['report-editor', 'document-counts'] })
    },
  })
}

export function useApproveDocument() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, comment }: { id: string; comment?: string }) =>
      reportEditorService.approveDocument(id, comment),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['report-editor', 'documents'] })
      qc.invalidateQueries({ queryKey: ['report-editor', 'document-counts'] })
    },
  })
}

export function useRejectDocument() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      reportEditorService.rejectDocument(id, reason),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['report-editor', 'documents'] })
      qc.invalidateQueries({ queryKey: ['report-editor', 'document-counts'] })
    },
  })
}

export function usePublishDocument() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, distributionListIds }: { id: string; distributionListIds?: string[] }) =>
      reportEditorService.publishDocument(id, distributionListIds),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['report-editor', 'documents'] })
      qc.invalidateQueries({ queryKey: ['report-editor', 'document-counts'] })
    },
  })
}

export function useObsoleteDocument() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, supersededBy }: { id: string; supersededBy?: string }) =>
      reportEditorService.obsoleteDocument(id, supersededBy),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['report-editor', 'documents'] })
      qc.invalidateQueries({ queryKey: ['report-editor', 'document-counts'] })
    },
  })
}

// ── Dynamic Workflow ──

export function useDocumentWorkflowState(docId: string | null) {
  return useQuery({
    queryKey: ['document-workflow-state', docId],
    queryFn: () => reportEditorService.getWorkflowState(docId!),
    enabled: !!docId,
  })
}

export function useDocumentTransition() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ docId, toState, comment }: { docId: string; toState: string; comment?: string }) =>
      reportEditorService.executeTransition(docId, { to_state: toState, comment }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['document-workflow-state', vars.docId] })
      qc.invalidateQueries({ queryKey: ['report-editor', 'documents'] })
      qc.invalidateQueries({ queryKey: ['report-editor', 'documents', vars.docId] })
      qc.invalidateQueries({ queryKey: ['report-editor', 'document-counts'] })
    },
  })
}

// ── Doc Types ──

export function useDocTypes() {
  return useQuery({
    queryKey: ['report-editor', 'doc-types'],
    queryFn: () => reportEditorService.listDocTypes(),
    staleTime: 300_000,
  })
}

export function useCreateDocType() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: DocTypeCreate) => reportEditorService.createDocType(payload),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['report-editor', 'doc-types'] }) },
  })
}

export function useUpdateDocType() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: DocTypeUpdate }) =>
      reportEditorService.updateDocType(id, payload),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['report-editor', 'doc-types'] }) },
  })
}

// ── Templates ──

export function useTemplates(docTypeId?: string) {
  return useQuery({
    queryKey: ['report-editor', 'templates', docTypeId],
    queryFn: () => reportEditorService.listTemplates(docTypeId),
    staleTime: 300_000,
  })
}

export function useCreateTemplate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: TemplateCreate) => reportEditorService.createTemplate(payload),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['report-editor', 'templates'] }) },
  })
}

export function useUpdateTemplate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: TemplateUpdate }) =>
      reportEditorService.updateTemplate(id, payload),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['report-editor', 'templates'] }) },
  })
}

// ── Distribution Lists ──

export function useDistributionLists(docTypeId?: string) {
  return useQuery({
    queryKey: ['report-editor', 'distribution-lists', docTypeId],
    queryFn: () => reportEditorService.listDistributionLists(docTypeId),
  })
}

// ── Arborescence ──

export function useArborescenceNodes(projectId: string | undefined) {
  return useQuery({
    queryKey: ['report-editor', 'arborescence', projectId],
    queryFn: () => reportEditorService.listArborescenceNodes(projectId!),
    enabled: !!projectId,
  })
}

// ── Share Links ──

export function useCreateShareLink() {
  return useMutation({
    mutationFn: ({ docId, payload }: { docId: string; payload?: { expires_days?: number; otp_required?: boolean; max_accesses?: number } }) =>
      reportEditorService.createShareLink(docId, payload),
  })
}
