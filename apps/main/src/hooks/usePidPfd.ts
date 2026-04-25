/**
 * React Query hooks for the PID/PFD module.
 */
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { pidPfdService } from '@/services/pidPfdService'
import type { PIDDocumentCreate, PIDDocumentUpdate } from '@/services/pidPfdService'
import type { PaginationParams } from '@/types/api'

// ── PID Documents ──

export function usePIDDocuments(params: PaginationParams & {
  project_id?: string
  status?: string
  search?: string
} = {}) {
  return useQuery({
    queryKey: ['pid-pfd', 'documents', params],
    queryFn: () => pidPfdService.listDocuments(params),
    placeholderData: keepPreviousData,
  })
}

export function usePIDDocument(id: string | undefined) {
  return useQuery({
    queryKey: ['pid-pfd', 'documents', id],
    queryFn: () => pidPfdService.getDocument(id!),
    enabled: !!id,
  })
}

export function useCreatePIDDocument() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: PIDDocumentCreate) => pidPfdService.createDocument(payload),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['pid-pfd', 'documents'] }) },
  })
}

export function useUpdatePIDDocument() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: PIDDocumentUpdate }) =>
      pidPfdService.updateDocument(id, payload),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['pid-pfd', 'documents'] }) },
  })
}

// ── Dynamic Workflow ──

export function usePIDWorkflowState(pidId: string | null) {
  return useQuery({
    queryKey: ['pid-workflow-state', pidId],
    queryFn: () => pidPfdService.getWorkflowState(pidId!),
    enabled: !!pidId,
  })
}

export function usePIDTransition() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ pidId, toState, comment }: { pidId: string; toState: string; comment?: string }) =>
      pidPfdService.executeTransition(pidId, { to_state: toState, comment }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['pid-workflow-state', vars.pidId] })
      qc.invalidateQueries({ queryKey: ['pid-pfd', 'documents'] })
      qc.invalidateQueries({ queryKey: ['pid-pfd', 'documents', vars.pidId] })
    },
  })
}

// ── XML ──

export function useSaveXml() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, xmlContent }: { id: string; xmlContent: string }) =>
      pidPfdService.saveXml(id, xmlContent),
    onSuccess: (_, { id }) => { qc.invalidateQueries({ queryKey: ['pid-pfd', 'documents', id] }) },
  })
}

export function useSyncXml() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => pidPfdService.syncXml(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pid-pfd'] })
    },
  })
}

// ── Revisions ──

export function usePIDRevisions(pidId: string | undefined) {
  return useQuery({
    queryKey: ['pid-pfd', 'revisions', pidId],
    queryFn: () => pidPfdService.listRevisions(pidId!),
    enabled: !!pidId,
  })
}

export function useCreatePIDRevision() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ pidId, payload }: { pidId: string; payload: { description?: string; change_type?: string } }) =>
      pidPfdService.createRevision(pidId, payload),
    onSuccess: (_, { pidId }) => { qc.invalidateQueries({ queryKey: ['pid-pfd', 'revisions', pidId] }) },
  })
}

// ── Equipment ──

export function useEquipment(params: PaginationParams & {
  search?: string
  equipment_type?: string
  pid_id?: string
  project_id?: string
} = {}) {
  return useQuery({
    queryKey: ['pid-pfd', 'equipment', params],
    queryFn: () => pidPfdService.listEquipment(params),
    placeholderData: keepPreviousData,
  })
}

export function useEquipmentDetail(id: string | undefined) {
  return useQuery({
    queryKey: ['pid-pfd', 'equipment', id],
    queryFn: () => pidPfdService.getEquipment(id!),
    enabled: !!id,
  })
}

export function useCreateEquipment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: Record<string, unknown>) => pidPfdService.createEquipment(payload),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['pid-pfd', 'equipment'] }) },
  })
}

export function useUpdateEquipment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Record<string, unknown> }) =>
      pidPfdService.updateEquipment(id, payload),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['pid-pfd', 'equipment'] }) },
  })
}

export function useDeleteEquipment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => pidPfdService.deleteEquipment(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['pid-pfd', 'equipment'] }) },
  })
}

export function useEquipmentAppearances(id: string | undefined) {
  return useQuery({
    queryKey: ['pid-pfd', 'equipment', id, 'appearances'],
    queryFn: () => pidPfdService.getEquipmentAppearances(id!),
    enabled: !!id,
  })
}

// ── Process Lines ──

export function useProcessLines(params: PaginationParams & {
  project_id?: string
  search?: string
} = {}) {
  return useQuery({
    queryKey: ['pid-pfd', 'lines', params],
    queryFn: () => pidPfdService.listProcessLines(params),
    placeholderData: keepPreviousData,
  })
}

export function useCreateProcessLine() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: Record<string, unknown>) => pidPfdService.createProcessLine(payload),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['pid-pfd', 'lines'] }) },
  })
}

export function useUpdateProcessLine() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Record<string, unknown> }) =>
      pidPfdService.updateProcessLine(id, payload),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['pid-pfd', 'lines'] }) },
  })
}

export function useDeleteProcessLine() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => pidPfdService.deleteProcessLine(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['pid-pfd', 'lines'] }) },
  })
}

export function useTraceProcessLine() {
  return useMutation({
    mutationFn: ({ lineNumber, projectId }: { lineNumber: string; projectId: string }) =>
      pidPfdService.traceProcessLine(lineNumber, projectId),
  })
}

// ── DCS Tags ──

export function useDCSTags(params: PaginationParams & {
  project_id?: string
  search?: string
  tag_type?: string
  area?: string
  equipment_id?: string
} = {}) {
  return useQuery({
    queryKey: ['pid-pfd', 'tags', params],
    queryFn: () => pidPfdService.listTags(params),
    placeholderData: keepPreviousData,
  })
}

export function useCreateDCSTag() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: Record<string, unknown>) => pidPfdService.createTag(payload),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['pid-pfd', 'tags'] }) },
  })
}

export function useUpdateDCSTag() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Record<string, unknown> }) =>
      pidPfdService.updateTag(id, payload),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['pid-pfd', 'tags'] }) },
  })
}

export function useDeleteDCSTag() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => pidPfdService.deleteTag(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['pid-pfd', 'tags'] }) },
  })
}

export function useImportTagsCsv() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ projectId, file }: { projectId: string; file: File }) =>
      pidPfdService.importTagsCsv(projectId, file),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['pid-pfd', 'tags'] }) },
  })
}

// ── Tag Naming Rules ──

export function useTagNamingRules() {
  return useQuery({
    queryKey: ['pid-pfd', 'naming-rules'],
    queryFn: () => pidPfdService.listNamingRules(),
    staleTime: 300_000,
  })
}

export function useCreateNamingRule() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: Record<string, unknown>) => pidPfdService.createNamingRule(payload),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['pid-pfd', 'naming-rules'] }) },
  })
}

// ── Process Library ──

export function useProcessLibrary(params?: { category?: string; search?: string }) {
  return useQuery({
    queryKey: ['pid-pfd', 'library', params],
    queryFn: () => pidPfdService.listLibraryItems(params),
    staleTime: 300_000,
  })
}

export function useCreateLibraryItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: Record<string, unknown>) => pidPfdService.createLibraryItem(payload),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['pid-pfd', 'library'] }) },
  })
}

export function useUpdateLibraryItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Record<string, unknown> }) =>
      pidPfdService.updateLibraryItem(id, payload),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['pid-pfd', 'library'] }) },
  })
}

export function useDeleteLibraryItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => pidPfdService.deleteLibraryItem(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['pid-pfd', 'library'] }) },
  })
}

// ── PID Document Delete ──

export function useDeletePIDDocument() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => pidPfdService.deleteDocument(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['pid-pfd', 'documents'] }) },
  })
}

// ── AFC Validation ──

export function useValidateAfc() {
  return useMutation({
    mutationFn: (pidId: string) => pidPfdService.validateAfc(pidId),
  })
}

// ── Lock Management ──

export function useAcquireLock() {
  return useMutation({
    mutationFn: (pidId: string) => pidPfdService.acquireLock(pidId),
  })
}

export function useReleaseLock() {
  return useMutation({
    mutationFn: (pidId: string) => pidPfdService.releaseLock(pidId),
  })
}
