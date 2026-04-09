/**
 * React Query hooks for Papyrus.
 *
 * Historical filename kept for compatibility during the migration away from
 * the legacy document-module naming.
 */
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { papyrusService } from '@/services/papyrusService'
import type {
  DocumentCreate, DocumentUpdate,
  DocTypeCreate, DocTypeUpdate,
  TemplateCreate, TemplateUpdate,
} from '@/services/papyrusService'
import type { PaginationParams } from '@/types/api'

export const PAPYRUS_QUERY_ROOT = ['papyrus'] as const

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
    queryKey: [...PAPYRUS_QUERY_ROOT, 'documents', params],
    queryFn: () => papyrusService.listDocuments(params),
    placeholderData: keepPreviousData,
  })
}

export function useDocumentCounts() {
  return useQuery({
    queryKey: [...PAPYRUS_QUERY_ROOT, 'document-counts'],
    queryFn: () => papyrusService.getDocumentCounts(),
    staleTime: 30_000,
  })
}

export function useDocument(id: string | undefined) {
  return useQuery({
    queryKey: [...PAPYRUS_QUERY_ROOT, 'documents', id],
    queryFn: () => papyrusService.getDocument(id!),
    enabled: !!id,
  })
}

export function useCreateDocument() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: DocumentCreate) => papyrusService.createDocument(payload),
    onSuccess: () => { qc.invalidateQueries({ queryKey: PAPYRUS_QUERY_ROOT }) },
  })
}

export function useUpdateDocument() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: DocumentUpdate }) =>
      papyrusService.updateDocument(id, payload),
    onSuccess: () => { qc.invalidateQueries({ queryKey: PAPYRUS_QUERY_ROOT }) },
  })
}

export function useDeleteDocument() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => papyrusService.deleteDocument(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: PAPYRUS_QUERY_ROOT }) },
  })
}

export function useArchiveDocument() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => papyrusService.archiveDocument(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: PAPYRUS_QUERY_ROOT }) },
  })
}

// ── Draft ──

export function useSaveDraft() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: { content?: Record<string, unknown>; form_data?: Record<string, unknown> } }) =>
      papyrusService.saveDraft(id, payload),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: [...PAPYRUS_QUERY_ROOT, 'documents', vars.id] })
      qc.invalidateQueries({ queryKey: [...PAPYRUS_QUERY_ROOT, 'papyrus-document', vars.id] })
      qc.invalidateQueries({ queryKey: [...PAPYRUS_QUERY_ROOT, 'papyrus-versions', vars.id] })
      qc.invalidateQueries({ queryKey: [...PAPYRUS_QUERY_ROOT, 'revisions', vars.id] })
    },
  })
}

// ── Revisions ──

export function useRevisions(docId: string | undefined) {
  return useQuery({
    queryKey: [...PAPYRUS_QUERY_ROOT, 'revisions', docId],
    queryFn: () => papyrusService.listRevisions(docId!),
    enabled: !!docId,
  })
}

export function useRevision(docId: string | undefined, revisionId: string | undefined) {
  return useQuery({
    queryKey: [...PAPYRUS_QUERY_ROOT, 'revision', docId, revisionId],
    queryFn: () => papyrusService.getRevision(docId!, revisionId!),
    enabled: !!docId && !!revisionId,
  })
}

export function usePapyrusDocument(docId: string | undefined, version?: number) {
  return useQuery({
    queryKey: [...PAPYRUS_QUERY_ROOT, 'papyrus-document', docId, version],
    queryFn: () => papyrusService.getPapyrusDocument(docId!, version),
    enabled: !!docId,
  })
}

export function useRenderedPapyrusDocument(docId: string | undefined) {
  return useQuery({
    queryKey: [...PAPYRUS_QUERY_ROOT, 'papyrus-document-rendered', docId],
    queryFn: () => papyrusService.getRenderedPapyrusDocument(docId!),
    enabled: !!docId,
  })
}

export function usePapyrusVersions(docId: string | undefined) {
  return useQuery({
    queryKey: [...PAPYRUS_QUERY_ROOT, 'papyrus-versions', docId],
    queryFn: () => papyrusService.listPapyrusVersions(docId!),
    enabled: !!docId,
  })
}

export function usePapyrusSchedule(docId: string | undefined) {
  return useQuery({
    queryKey: [...PAPYRUS_QUERY_ROOT, 'papyrus-schedule', docId],
    queryFn: () => papyrusService.getPapyrusSchedule(docId!),
    enabled: !!docId,
  })
}

export function useUpdatePapyrusSchedule() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ docId, payload }: { docId: string; payload: Parameters<typeof papyrusService.updatePapyrusSchedule>[1] }) =>
      papyrusService.updatePapyrusSchedule(docId, payload),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: [...PAPYRUS_QUERY_ROOT, 'papyrus-schedule', vars.docId] })
      qc.invalidateQueries({ queryKey: [...PAPYRUS_QUERY_ROOT, 'papyrus-document', vars.docId] })
      qc.invalidateQueries({ queryKey: [...PAPYRUS_QUERY_ROOT, 'papyrus-versions', vars.docId] })
    },
  })
}

export function usePapyrusDispatchRuns(docId: string | undefined) {
  return useQuery({
    queryKey: [...PAPYRUS_QUERY_ROOT, 'papyrus-dispatch-runs', docId],
    queryFn: () => papyrusService.listPapyrusDispatchRuns(docId!),
    enabled: !!docId,
  })
}

export function useRunPapyrusDispatchNow() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (docId: string) => papyrusService.runPapyrusDispatchNow(docId),
    onSuccess: (_, docId) => {
      qc.invalidateQueries({ queryKey: [...PAPYRUS_QUERY_ROOT, 'papyrus-dispatch-runs', docId] })
      qc.invalidateQueries({ queryKey: [...PAPYRUS_QUERY_ROOT, 'papyrus-schedule', docId] })
    },
  })
}

export function usePapyrusForms() {
  return useQuery({
    queryKey: [...PAPYRUS_QUERY_ROOT, 'papyrus-forms'],
    queryFn: () => papyrusService.listPapyrusForms(),
  })
}

export function useCreatePapyrusForm() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: {
      document_id?: string
      name: string
      description?: string
      schema_json?: Record<string, unknown>
      settings_json?: Record<string, unknown>
    }) => papyrusService.createPapyrusForm(payload),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: [...PAPYRUS_QUERY_ROOT, 'papyrus-forms'] })
      if (vars.document_id) {
        qc.invalidateQueries({ queryKey: [...PAPYRUS_QUERY_ROOT, 'documents', vars.document_id] })
      }
    },
  })
}

export function useUpdatePapyrusForm() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ formId, payload }: {
      formId: string
      payload: {
        name?: string
        description?: string
        schema_json?: Record<string, unknown>
        settings_json?: Record<string, unknown>
        is_active?: boolean
      }
    }) => papyrusService.updatePapyrusForm(formId, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...PAPYRUS_QUERY_ROOT, 'papyrus-forms'] })
    },
  })
}

export function useImportPapyrusEpiCollect() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: {
      document_id?: string
      name: string
      description?: string
      project: Record<string, unknown>
    }) => papyrusService.importPapyrusEpiCollect(payload),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: [...PAPYRUS_QUERY_ROOT, 'papyrus-forms'] })
      if (vars.document_id) {
        qc.invalidateQueries({ queryKey: [...PAPYRUS_QUERY_ROOT, 'documents', vars.document_id] })
      }
    },
  })
}

export function usePapyrusSubmissions(formId: string | undefined) {
  return useQuery({
    queryKey: [...PAPYRUS_QUERY_ROOT, 'papyrus-submissions', formId],
    queryFn: () => papyrusService.listPapyrusSubmissions(formId!),
    enabled: !!formId,
  })
}

export function useExportPapyrusEpiCollect() {
  return useMutation({
    mutationFn: (formId: string) => papyrusService.exportPapyrusEpiCollect(formId),
  })
}

export function useCreatePapyrusExternalLink() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ formId, payload }: {
      formId: string
      payload: {
        expires_in_hours?: number
        max_submissions?: number
        prefill?: Record<string, unknown>
        allowed_ips?: string[]
        require_identity?: boolean
      }
    }) => papyrusService.createPapyrusExternalLink(formId, payload),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: [...PAPYRUS_QUERY_ROOT, 'papyrus-forms'] })
      qc.invalidateQueries({ queryKey: [...PAPYRUS_QUERY_ROOT, 'papyrus-submissions', vars.formId] })
    },
  })
}

export function useCreateRevision() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (docId: string) => papyrusService.createRevision(docId),
    onSuccess: (_, docId) => {
      qc.invalidateQueries({ queryKey: [...PAPYRUS_QUERY_ROOT, 'revisions', docId] })
      qc.invalidateQueries({ queryKey: [...PAPYRUS_QUERY_ROOT, 'documents', docId] })
      qc.invalidateQueries({ queryKey: [...PAPYRUS_QUERY_ROOT, 'papyrus-document', docId] })
      qc.invalidateQueries({ queryKey: [...PAPYRUS_QUERY_ROOT, 'papyrus-versions', docId] })
    },
  })
}

export function useRevisionDiff(docId: string | undefined, revA: string | undefined, revB: string | undefined) {
  return useQuery({
    queryKey: [...PAPYRUS_QUERY_ROOT, 'diff', docId, revA, revB],
    queryFn: () => papyrusService.diffRevisions(docId!, revA!, revB!),
    enabled: !!docId && !!revA && !!revB,
  })
}

// ── Workflow ──

export function useSubmitDocument() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, comment }: { id: string; comment?: string }) =>
      papyrusService.submitDocument(id, comment),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: PAPYRUS_QUERY_ROOT })
    },
  })
}

export function useApproveDocument() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, comment }: { id: string; comment?: string }) =>
      papyrusService.approveDocument(id, comment),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: PAPYRUS_QUERY_ROOT })
    },
  })
}

export function useRejectDocument() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      papyrusService.rejectDocument(id, reason),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: PAPYRUS_QUERY_ROOT })
    },
  })
}

export function usePublishDocument() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, distributionListIds }: { id: string; distributionListIds?: string[] }) =>
      papyrusService.publishDocument(id, distributionListIds),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: PAPYRUS_QUERY_ROOT })
    },
  })
}

export function useObsoleteDocument() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, supersededBy }: { id: string; supersededBy?: string }) =>
      papyrusService.obsoleteDocument(id, supersededBy),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: PAPYRUS_QUERY_ROOT })
    },
  })
}

// ── Dynamic Workflow ──

export function useDocumentWorkflowState(docId: string | null) {
  return useQuery({
    queryKey: ['document-workflow-state', docId],
    queryFn: () => papyrusService.getWorkflowState(docId!),
    enabled: !!docId,
  })
}

export function useDocumentTransition() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ docId, toState, comment }: { docId: string; toState: string; comment?: string }) =>
      papyrusService.executeTransition(docId, { to_state: toState, comment }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['document-workflow-state', vars.docId] })
      qc.invalidateQueries({ queryKey: [...PAPYRUS_QUERY_ROOT, 'documents'] })
      qc.invalidateQueries({ queryKey: [...PAPYRUS_QUERY_ROOT, 'documents', vars.docId] })
      qc.invalidateQueries({ queryKey: [...PAPYRUS_QUERY_ROOT, 'document-counts'] })
    },
  })
}

// ── Doc Types ──

export function useDocTypes() {
  return useQuery({
    queryKey: [...PAPYRUS_QUERY_ROOT, 'doc-types'],
    queryFn: () => papyrusService.listDocTypes(),
    staleTime: 300_000,
  })
}

export function useCreateDocType() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: DocTypeCreate) => papyrusService.createDocType(payload),
    onSuccess: () => { qc.invalidateQueries({ queryKey: [...PAPYRUS_QUERY_ROOT, 'doc-types'] }) },
  })
}

export function useUpdateDocType() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: DocTypeUpdate }) =>
      papyrusService.updateDocType(id, payload),
    onSuccess: () => { qc.invalidateQueries({ queryKey: [...PAPYRUS_QUERY_ROOT, 'doc-types'] }) },
  })
}

// ── MDR Import ──

export function useImportMDR() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ file, projectId }: { file: File; projectId?: string }) =>
      papyrusService.importMDR(file, projectId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: PAPYRUS_QUERY_ROOT })
    },
  })
}

// ── Templates ──

export function useTemplates(docTypeId?: string) {
  return useQuery({
    queryKey: [...PAPYRUS_QUERY_ROOT, 'templates', docTypeId],
    queryFn: () => papyrusService.listTemplates(docTypeId),
    staleTime: 300_000,
  })
}

export function useCreateTemplate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: TemplateCreate) => papyrusService.createTemplate(payload),
    onSuccess: () => { qc.invalidateQueries({ queryKey: [...PAPYRUS_QUERY_ROOT, 'templates'] }) },
  })
}

export function useUpdateTemplate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: TemplateUpdate }) =>
      papyrusService.updateTemplate(id, payload),
    onSuccess: () => { qc.invalidateQueries({ queryKey: [...PAPYRUS_QUERY_ROOT, 'templates'] }) },
  })
}

// ── Distribution Lists ──

export function useDistributionLists(docTypeId?: string) {
  return useQuery({
    queryKey: [...PAPYRUS_QUERY_ROOT, 'distribution-lists', docTypeId],
    queryFn: () => papyrusService.listDistributionLists(docTypeId),
  })
}

// ── Arborescence ──

export function useArborescenceNodes(projectId: string | undefined) {
  return useQuery({
    queryKey: [...PAPYRUS_QUERY_ROOT, 'arborescence', projectId],
    queryFn: () => papyrusService.listArborescenceNodes(projectId!),
    enabled: !!projectId,
  })
}

// ── Share Links ──

export function useCreateShareLink() {
  return useMutation({
    mutationFn: ({ docId, payload }: { docId: string; payload?: { expires_days?: number; otp_required?: boolean; max_accesses?: number } }) =>
      papyrusService.createShareLink(docId, payload),
  })
}

export const usePapyrusDocuments = useDocuments
export const usePapyrusDocumentCounts = useDocumentCounts
export const usePapyrusDocumentDetail = useDocument
export const useCreatePapyrusDocument = useCreateDocument
export const useUpdatePapyrusDocument = useUpdateDocument
export const useDeletePapyrusDocument = useDeleteDocument
export const useArchivePapyrusDocument = useArchiveDocument
export const usePapyrusRevisions = useRevisions
export const usePapyrusRevision = useRevision
export const usePapyrusDocTypes = useDocTypes
export const useCreatePapyrusDocType = useCreateDocType
export const useUpdatePapyrusDocType = useUpdateDocType
export const usePapyrusTemplates = useTemplates
export const useCreatePapyrusTemplate = useCreateTemplate
export const useUpdatePapyrusTemplate = useUpdateTemplate
