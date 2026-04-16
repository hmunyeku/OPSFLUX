import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { packlogService } from '@/services/packlogService'
import type {
  CargoAttachmentEvidence,
  CargoItemCreate,
  CargoItemUpdate,
  CargoRequestCreate,
  CargoRequestUpdate,
  CargoReturnCreate,
  CargoStatusUpdate,
  CargoWorkflowStatusUpdate,
  PackageElementDispositionUpdate,
  PackageElementReturnUpdate,
  PaginationParams,
  TravelArticleCreate,
} from '@/types/api'

/**
 * Invalidate the TravelWiz views that depend on cargo state.
 *
 * Why this exists: a cargo item lives in PackLog but its lifecycle
 * (create / status update / return / receipt) directly affects the
 * voyage that carries it AND the manifest the cargo is attached to.
 * Without cross-module invalidation, a user who marks a cargo as
 * `loaded` from the PackLog tab and then switches to the TravelWiz
 * voyage detail panel sees stale weight/cargo-count numbers until
 * the next manual refresh.
 *
 * Scope of invalidation:
 *   - ['travelwiz', 'voyages']    → voyage list + voyage detail
 *                                    (cargo_count, weight totals)
 *   - ['travelwiz', 'manifests']  → manifest list (cargo aggregation)
 *
 * We deliberately do NOT invalidate ['travelwiz', 'vectors'] or
 * ['travelwiz', 'rotations'] — those don't depend on cargo state.
 */
function invalidateTravelWizCargoViews(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['travelwiz', 'voyages'] })
  qc.invalidateQueries({ queryKey: ['travelwiz', 'manifests'] })
}

async function openPdfBlob(loader: () => Promise<Blob>) {
  const popup = window.open('', '_blank')
  if (popup) {
    popup.document.write('<html><body style="font-family: sans-serif; padding: 16px;">Chargement du PDF...</body></html>')
    popup.document.close()
  }
  const blob = await loader()
  const url = URL.createObjectURL(blob)
  if (popup && !popup.closed) popup.location.href = url
  else window.open(url, '_blank')
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

export function usePackLogCargoRequests(params: PaginationParams & { status?: string; search?: string } = {}) {
  return useQuery({
    queryKey: ['packlog', 'cargo-requests', params],
    queryFn: () => packlogService.listCargoRequests(params),
    placeholderData: keepPreviousData,
  })
}

export function usePackLogCargoRequest(id: string | undefined) {
  return useQuery({
    queryKey: ['packlog', 'cargo-requests', id],
    queryFn: () => packlogService.getCargoRequest(id!),
    enabled: !!id,
  })
}

export function usePackLogArticle(id: string | undefined) {
  return useQuery({
    queryKey: ['packlog', 'articles', id],
    queryFn: () => packlogService.getArticle(id!),
    enabled: !!id,
  })
}

export function usePackLogCargoRequestLtPdf() {
  return useMutation({
    mutationFn: async (id: string) => openPdfBlob(() => packlogService.getCargoRequestLtPdf(id)),
  })
}

export function useCargoLabelPdf() {
  return useMutation({
    mutationFn: async ({ id, language = 'fr' }: { id: string; language?: 'fr' | 'en' }) =>
      openPdfBlob(() => packlogService.getCargoLabelPdf(id, language)),
  })
}

export function usePackLogCargoRequestLoadingOptions(id: string | undefined) {
  return useQuery({
    queryKey: ['packlog', 'cargo-requests', id, 'loading-options'],
    queryFn: () => packlogService.getCargoRequestLoadingOptions(id!),
    enabled: !!id,
  })
}

export function useCreatePackLogCargoRequest() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: CargoRequestCreate) => packlogService.createCargoRequest(payload),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['packlog', 'cargo-requests'] }) },
  })
}

export function useUpdatePackLogCargoRequest() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: CargoRequestUpdate }) => packlogService.updateCargoRequest(id, payload),
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: ['packlog', 'cargo-requests'] })
      qc.invalidateQueries({ queryKey: ['packlog', 'cargo-requests', id] })
      qc.invalidateQueries({ queryKey: ['packlog', 'cargo'] })
    },
  })
}

export function useApplyPackLogCargoRequestLoadingOption() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, voyageId }: { id: string; voyageId: string }) => packlogService.applyCargoRequestLoadingOption(id, voyageId),
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: ['packlog', 'cargo-requests'] })
      qc.invalidateQueries({ queryKey: ['packlog', 'cargo-requests', id] })
      qc.invalidateQueries({ queryKey: ['packlog', 'cargo-requests', id, 'loading-options'] })
      qc.invalidateQueries({ queryKey: ['packlog', 'cargo'] })
      // Apply-loading-option creates VoyageManifest entries on the TravelWiz
      // side and assigns cargo to a voyage. Invalidate the corresponding
      // TravelWiz views so the voyage/manifest list refreshes immediately.
      // (The previous code invalidated 'all-manifests' which doesn't exist
      //  as a queryKey — useTravelWizManifests uses 'manifests'.)
      invalidateTravelWizCargoViews(qc)
    },
  })
}

export function usePackLogCargo(params: PaginationParams & {
  status?: string; cargo_type?: string; manifest_id?: string; destination_asset_id?: string; request_id?: string; search?: string; scope?: string
} = {}) {
  return useQuery({
    queryKey: ['packlog', 'cargo', params],
    queryFn: () => packlogService.listCargo(params),
    placeholderData: keepPreviousData,
  })
}

export function usePackLogCargoItem(id: string | undefined) {
  return useQuery({
    queryKey: ['packlog', 'cargo', id],
    queryFn: () => packlogService.getCargo(id!),
    enabled: !!id,
  })
}

export function useCreatePackLogCargo() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: CargoItemCreate) => packlogService.createCargo(payload),
    onSuccess: (created) => {
      qc.invalidateQueries({ queryKey: ['packlog', 'cargo'] })
      // If the new cargo was created already attached to a manifest,
      // the corresponding voyage's cargo aggregation changes.
      if (created?.manifest_id) {
        invalidateTravelWizCargoViews(qc)
      }
    },
  })
}

export function useUpdatePackLogCargo() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: CargoItemUpdate }) => packlogService.updateCargo(id, payload),
    onSuccess: (updated, { id, payload }) => {
      qc.invalidateQueries({ queryKey: ['packlog', 'cargo'] })
      qc.invalidateQueries({ queryKey: ['packlog', 'cargo', id] })
      // Manifest re-assignment, weight changes, dimension changes all
      // potentially affect voyage capacity calculations.
      const touchesManifest = payload.manifest_id !== undefined
        || payload.weight_kg !== undefined
        || payload.width_cm !== undefined
        || payload.length_cm !== undefined
        || payload.height_cm !== undefined
      if (touchesManifest || updated?.manifest_id) {
        invalidateTravelWizCargoViews(qc)
      }
    },
  })
}

export function useUpdatePackLogCargoStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: CargoStatusUpdate['status'] }) => packlogService.updateCargoStatus(id, { status }),
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: ['packlog', 'cargo'] })
      qc.invalidateQueries({ queryKey: ['packlog', 'cargo', id] })
      // Status transitions (loaded → in_transit → delivered_*) affect
      // the voyage's "cargo loaded / in transit / delivered" counters.
      invalidateTravelWizCargoViews(qc)
    },
  })
}

export function useUpdatePackLogCargoWorkflowStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, workflow_status }: { id: string; workflow_status: CargoWorkflowStatusUpdate['workflow_status'] }) =>
      packlogService.updateCargoWorkflowStatus(id, { workflow_status }),
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: ['packlog', 'cargo'] })
      qc.invalidateQueries({ queryKey: ['packlog', 'cargo', id] })
      // Workflow transitions (draft → ready_for_review → approved →
      // assigned → in_transit → delivered) trigger voyage/manifest
      // aggregation refresh.
      invalidateTravelWizCargoViews(qc)
    },
  })
}

export function useReceivePackLogCargo() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload?: { notes?: string | null } }) => packlogService.receiveCargo(id, payload),
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: ['packlog', 'cargo'] })
      qc.invalidateQueries({ queryKey: ['packlog', 'cargo', id] })
      // Receipt closes a cargo on a manifest — voyage aggregation
      // shifts ("delivered" counter increments).
      invalidateTravelWizCargoViews(qc)
    },
  })
}

export function usePackLogCargoAttachmentEvidence(id: string | undefined) {
  return useQuery({
    queryKey: ['packlog', 'cargo', id, 'attachment-evidence'],
    queryFn: () => packlogService.listCargoAttachmentEvidence(id!),
    enabled: !!id,
  })
}

export function useUpdatePackLogCargoAttachmentEvidence() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ cargoId, attachmentId, evidence_type }: { cargoId: string; attachmentId: string; evidence_type: CargoAttachmentEvidence['evidence_type'] }) =>
      packlogService.updateCargoAttachmentEvidence(cargoId, attachmentId, evidence_type),
    onSuccess: (_, { cargoId }) => {
      qc.invalidateQueries({ queryKey: ['packlog', 'cargo', cargoId, 'attachment-evidence'] })
    },
  })
}

export function useInitiatePackLogCargoReturn() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ cargoItemId, payload }: { cargoItemId: string; payload: CargoReturnCreate }) => packlogService.initiateCargoReturn(cargoItemId, payload),
    onSuccess: (_, { cargoItemId }) => {
      qc.invalidateQueries({ queryKey: ['packlog', 'cargo'] })
      qc.invalidateQueries({ queryKey: ['packlog', 'cargo', cargoItemId] })
      // Return declaration shifts the cargo into the return lifecycle —
      // voyage manifest cargo count and weight totals change.
      invalidateTravelWizCargoViews(qc)
    },
  })
}

export function usePackLogPackageElements(cargoItemId: string | undefined) {
  return useQuery({
    queryKey: ['packlog', 'cargo', cargoItemId, 'elements'],
    queryFn: () => packlogService.getPackageElements(cargoItemId!),
    enabled: !!cargoItemId,
  })
}

export function usePackLogCargoHistory(cargoItemId: string | undefined) {
  return useQuery({
    queryKey: ['packlog', 'cargo', cargoItemId, 'history'],
    queryFn: () => packlogService.getCargoHistory(cargoItemId!),
    enabled: !!cargoItemId,
  })
}

export function useUpdatePackLogPackageElementReturn() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ cargoItemId, elementId, payload }: { cargoItemId: string; elementId: string; payload: PackageElementReturnUpdate }) =>
      packlogService.updatePackageElementReturn(cargoItemId, elementId, payload),
    onSuccess: (_, { cargoItemId }) => {
      qc.invalidateQueries({ queryKey: ['packlog', 'cargo', cargoItemId, 'elements'] })
      qc.invalidateQueries({ queryKey: ['packlog', 'cargo', cargoItemId] })
      qc.invalidateQueries({ queryKey: ['packlog', 'cargo'] })
    },
  })
}

export function useUpdatePackLogPackageElementDisposition() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ cargoItemId, elementId, payload }: { cargoItemId: string; elementId: string; payload: PackageElementDispositionUpdate }) =>
      packlogService.updatePackageElementDisposition(cargoItemId, elementId, payload),
    onSuccess: (_, { cargoItemId }) => {
      qc.invalidateQueries({ queryKey: ['packlog', 'cargo', cargoItemId, 'elements'] })
      qc.invalidateQueries({ queryKey: ['packlog', 'cargo', cargoItemId] })
      qc.invalidateQueries({ queryKey: ['packlog', 'cargo'] })
    },
  })
}

export function usePackLogSapMatch() {
  return useMutation({
    mutationFn: (description: string) => packlogService.sapMatch(description),
  })
}

export function usePackLogArticles(params: PaginationParams & {
  search?: string; sap_code?: string; management_type?: string; is_hazmat?: boolean;
} = {}) {
  return useQuery({
    queryKey: ['packlog', 'articles', params],
    queryFn: () => packlogService.listArticles(params),
    placeholderData: keepPreviousData,
  })
}

export function useCreatePackLogArticle() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: TravelArticleCreate) => packlogService.createArticle(payload),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['packlog', 'articles'] }) },
  })
}

export function useImportPackLogArticlesCsv() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (file: File) => packlogService.importArticlesCsv(file),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['packlog', 'articles'] }) },
  })
}

export function usePackLogPublicCargoTracking(trackingCode: string | undefined) {
  return useQuery({
    queryKey: ['packlog', 'tracking', 'cargo', trackingCode],
    queryFn: () => packlogService.getPublicCargoTracking(trackingCode!),
    enabled: !!trackingCode,
  })
}

export function usePackLogPublicVoyageTracking(voyageCode: string | undefined) {
  return useQuery({
    queryKey: ['packlog', 'tracking', 'voyage', voyageCode],
    queryFn: () => packlogService.getPublicVoyageCargoTracking(voyageCode!),
    enabled: !!voyageCode,
  })
}

