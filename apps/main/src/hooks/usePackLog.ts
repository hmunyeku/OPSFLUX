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
} from '@/types/api'

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

export function usePackLogCargoRequestLtPdf() {
  return useMutation({
    mutationFn: async (id: string) => openPdfBlob(() => packlogService.getCargoRequestLtPdf(id)),
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
      qc.invalidateQueries({ queryKey: ['travelwiz', 'voyages'] })
      qc.invalidateQueries({ queryKey: ['travelwiz', 'all-manifests'] })
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
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['packlog', 'cargo'] }) },
  })
}

export function useUpdatePackLogCargo() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: CargoItemUpdate }) => packlogService.updateCargo(id, payload),
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: ['packlog', 'cargo'] })
      qc.invalidateQueries({ queryKey: ['packlog', 'cargo', id] })
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

// Backward-compatible aliases while shared cargo panels are extracted from TravelWiz.
export const useCargoRequests = usePackLogCargoRequests
export const useCargoRequest = usePackLogCargoRequest
export const useCargoRequestLtPdf = usePackLogCargoRequestLtPdf
export const useCargoRequestLoadingOptions = usePackLogCargoRequestLoadingOptions
export const useCreateCargoRequest = useCreatePackLogCargoRequest
export const useUpdateCargoRequest = useUpdatePackLogCargoRequest
export const useApplyCargoRequestLoadingOption = useApplyPackLogCargoRequestLoadingOption
export const useCargo = usePackLogCargo
export const useCargoItem = usePackLogCargoItem
export const useCreateCargo = useCreatePackLogCargo
export const useUpdateCargo = useUpdatePackLogCargo
export const useUpdateCargoStatus = useUpdatePackLogCargoStatus
export const useUpdateCargoWorkflowStatus = useUpdatePackLogCargoWorkflowStatus
export const useCargoAttachmentEvidence = usePackLogCargoAttachmentEvidence
export const useUpdateCargoAttachmentEvidence = useUpdatePackLogCargoAttachmentEvidence
export const useInitiateCargoReturn = useInitiatePackLogCargoReturn
export const usePackageElements = usePackLogPackageElements
export const useUpdatePackageElementReturn = useUpdatePackLogPackageElementReturn
export const useUpdatePackageElementDisposition = useUpdatePackLogPackageElementDisposition
export const useCargoHistory = usePackLogCargoHistory
