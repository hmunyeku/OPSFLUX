import { createContext, useContext, type ReactNode } from 'react'
import {
  useApplyPackLogCargoRequestLoadingOption,
  useCreatePackLogCargo,
  useCreatePackLogCargoRequest,
  useInitiatePackLogCargoReturn,
  usePackLogCargo,
  usePackLogCargoAttachmentEvidence,
  usePackLogCargoHistory,
  usePackLogCargoItem,
  usePackLogCargoRequest,
  usePackLogCargoRequestLoadingOptions,
  usePackLogCargoRequestLtPdf,
  usePackLogCargoRequests,
  usePackLogPackageElements,
  useUpdatePackLogCargo,
  useUpdatePackLogCargoAttachmentEvidence,
  useUpdatePackLogCargoRequest,
  useUpdatePackLogCargoStatus,
  useUpdatePackLogCargoWorkflowStatus,
  useUpdatePackLogPackageElementDisposition,
  useUpdatePackLogPackageElementReturn,
} from '@/hooks/usePackLog'
import type { PaginationParams } from '@/types/api'

export type CargoWorkspaceModule = 'travelwiz' | 'packlog'

const CargoWorkspaceContext = createContext<{ panelModule: CargoWorkspaceModule; moduleLabel: string; queryNamespace: 'packlog' }>({
  panelModule: 'packlog',
  moduleLabel: 'PackLog',
  queryNamespace: 'packlog',
})

export function CargoWorkspaceProvider({
  module,
  label,
  children,
}: {
  module: CargoWorkspaceModule
  label: string
  children: ReactNode
}) {
  return (
    <CargoWorkspaceContext.Provider value={{ panelModule: module, moduleLabel: label, queryNamespace: 'packlog' }}>
      {children}
    </CargoWorkspaceContext.Provider>
  )
}

export function useCargoWorkspace() {
  return useContext(CargoWorkspaceContext)
}

// ── All workspace hooks now point directly to PackLog ──

export function useWorkspaceCargoRequests(params: PaginationParams & { status?: string; search?: string }) {
  return usePackLogCargoRequests(params)
}

export function useWorkspaceCargoRequest(id: string | undefined) {
  return usePackLogCargoRequest(id)
}

export function useWorkspaceCargoRequestLtPdf() {
  return usePackLogCargoRequestLtPdf()
}

export function useWorkspaceCargoRequestLoadingOptions(id: string | undefined) {
  return usePackLogCargoRequestLoadingOptions(id)
}

export function useWorkspaceCreateCargoRequest() {
  return useCreatePackLogCargoRequest()
}

export function useWorkspaceUpdateCargoRequest() {
  return useUpdatePackLogCargoRequest()
}

export function useWorkspaceApplyCargoRequestLoadingOption() {
  return useApplyPackLogCargoRequestLoadingOption()
}

export function useWorkspaceCargo(params: PaginationParams & { status?: string; cargo_type?: string; manifest_id?: string; destination_asset_id?: string; request_id?: string; search?: string; scope?: string }) {
  return usePackLogCargo(params)
}

export function useWorkspaceCargoItem(id: string | undefined) {
  return usePackLogCargoItem(id)
}

export function useWorkspaceCreateCargo() {
  return useCreatePackLogCargo()
}

export function useWorkspaceUpdateCargo() {
  return useUpdatePackLogCargo()
}

export function useWorkspaceUpdateCargoStatus() {
  return useUpdatePackLogCargoStatus()
}

export function useWorkspaceUpdateCargoWorkflowStatus() {
  return useUpdatePackLogCargoWorkflowStatus()
}

export function useWorkspaceCargoAttachmentEvidence(id: string | undefined) {
  return usePackLogCargoAttachmentEvidence(id)
}

export function useWorkspaceUpdateCargoAttachmentEvidence() {
  return useUpdatePackLogCargoAttachmentEvidence()
}

export function useWorkspaceInitiateCargoReturn() {
  return useInitiatePackLogCargoReturn()
}

export function useWorkspacePackageElements(id: string | undefined) {
  return usePackLogPackageElements(id)
}

export function useWorkspaceUpdatePackageElementReturn() {
  return useUpdatePackLogPackageElementReturn()
}

export function useWorkspaceUpdatePackageElementDisposition() {
  return useUpdatePackLogPackageElementDisposition()
}

export function useWorkspaceCargoHistory(id: string | undefined) {
  return usePackLogCargoHistory(id)
}

export function useCargoDictionaryCategory(suffix: string) {
  return `packlog_${suffix}`
}
