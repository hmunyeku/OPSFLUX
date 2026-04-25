import { createContext, useContext, type ReactNode } from 'react'
import {
  useApplyCargoRequestLoadingOption as useLegacyCargoRequestLoadingOption,
  useCargo as useLegacyCargo,
  useCargoAttachmentEvidence as useLegacyCargoAttachmentEvidence,
  useCargoHistory as useLegacyCargoHistory,
  useCargoItem as useLegacyCargoItem,
  useCargoRequest as useLegacyCargoRequest,
  useCargoRequestLoadingOptions as useLegacyCargoRequestLoadingOptions,
  useCargoRequestLtPdf as useLegacyCargoRequestLtPdf,
  useCargoRequests as useLegacyCargoRequests,
  useCreateCargo as useLegacyCreateCargo,
  useCreateCargoRequest as useLegacyCreateCargoRequest,
  useInitiateCargoReturn as useLegacyInitiateCargoReturn,
  usePackageElements as useLegacyPackageElements,
  useUpdateCargo as useLegacyUpdateCargo,
  useUpdateCargoAttachmentEvidence as useLegacyUpdateCargoAttachmentEvidence,
  useUpdateCargoRequest as useLegacyUpdateCargoRequest,
  useUpdateCargoStatus as useLegacyUpdateCargoStatus,
  useUpdateCargoWorkflowStatus as useLegacyUpdateCargoWorkflowStatus,
  useUpdatePackageElementDisposition as useLegacyUpdatePackageElementDisposition,
  useUpdatePackageElementReturn as useLegacyUpdatePackageElementReturn,
} from '@/hooks/useTravelWiz'
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

export type CargoWorkspaceModule = 'travelwiz' | 'packlog'

const CargoWorkspaceContext = createContext<{ panelModule: CargoWorkspaceModule; moduleLabel: string; queryNamespace: 'travelwiz' | 'packlog' }>({
  panelModule: 'travelwiz',
  moduleLabel: 'TravelWiz',
  queryNamespace: 'travelwiz',
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
    <CargoWorkspaceContext.Provider value={{ panelModule: module, moduleLabel: label, queryNamespace: module === 'packlog' ? 'packlog' : 'travelwiz' }}>
      {children}
    </CargoWorkspaceContext.Provider>
  )
}

export function useCargoWorkspace() {
  return useContext(CargoWorkspaceContext)
}

export function useWorkspaceCargoRequests(params: Parameters<typeof useLegacyCargoRequests>[0]) {
  const { queryNamespace } = useCargoWorkspace()
  return queryNamespace === 'packlog' ? usePackLogCargoRequests(params) : useLegacyCargoRequests(params)
}

export function useWorkspaceCargoRequest(id: string | undefined) {
  const { queryNamespace } = useCargoWorkspace()
  return queryNamespace === 'packlog' ? usePackLogCargoRequest(id) : useLegacyCargoRequest(id)
}

export function useWorkspaceCargoRequestLtPdf() {
  const { queryNamespace } = useCargoWorkspace()
  return queryNamespace === 'packlog' ? usePackLogCargoRequestLtPdf() : useLegacyCargoRequestLtPdf()
}

export function useWorkspaceCargoRequestLoadingOptions(id: string | undefined) {
  const { queryNamespace } = useCargoWorkspace()
  return queryNamespace === 'packlog' ? usePackLogCargoRequestLoadingOptions(id) : useLegacyCargoRequestLoadingOptions(id)
}

export function useWorkspaceCreateCargoRequest() {
  const { queryNamespace } = useCargoWorkspace()
  return queryNamespace === 'packlog' ? useCreatePackLogCargoRequest() : useLegacyCreateCargoRequest()
}

export function useWorkspaceUpdateCargoRequest() {
  const { queryNamespace } = useCargoWorkspace()
  return queryNamespace === 'packlog' ? useUpdatePackLogCargoRequest() : useLegacyUpdateCargoRequest()
}

export function useWorkspaceApplyCargoRequestLoadingOption() {
  const { queryNamespace } = useCargoWorkspace()
  return queryNamespace === 'packlog' ? useApplyPackLogCargoRequestLoadingOption() : useLegacyCargoRequestLoadingOption()
}

export function useWorkspaceCargo(params: Parameters<typeof useLegacyCargo>[0]) {
  const { queryNamespace } = useCargoWorkspace()
  return queryNamespace === 'packlog' ? usePackLogCargo(params) : useLegacyCargo(params)
}

export function useWorkspaceCargoItem(id: string | undefined) {
  const { queryNamespace } = useCargoWorkspace()
  return queryNamespace === 'packlog' ? usePackLogCargoItem(id) : useLegacyCargoItem(id)
}

export function useWorkspaceCreateCargo() {
  const { queryNamespace } = useCargoWorkspace()
  return queryNamespace === 'packlog' ? useCreatePackLogCargo() : useLegacyCreateCargo()
}

export function useWorkspaceUpdateCargo() {
  const { queryNamespace } = useCargoWorkspace()
  return queryNamespace === 'packlog' ? useUpdatePackLogCargo() : useLegacyUpdateCargo()
}

export function useWorkspaceUpdateCargoStatus() {
  const { queryNamespace } = useCargoWorkspace()
  return queryNamespace === 'packlog' ? useUpdatePackLogCargoStatus() : useLegacyUpdateCargoStatus()
}

export function useWorkspaceUpdateCargoWorkflowStatus() {
  const { queryNamespace } = useCargoWorkspace()
  return queryNamespace === 'packlog' ? useUpdatePackLogCargoWorkflowStatus() : useLegacyUpdateCargoWorkflowStatus()
}

export function useWorkspaceCargoAttachmentEvidence(id: string | undefined) {
  const { queryNamespace } = useCargoWorkspace()
  return queryNamespace === 'packlog' ? usePackLogCargoAttachmentEvidence(id) : useLegacyCargoAttachmentEvidence(id)
}

export function useWorkspaceUpdateCargoAttachmentEvidence() {
  const { queryNamespace } = useCargoWorkspace()
  return queryNamespace === 'packlog' ? useUpdatePackLogCargoAttachmentEvidence() : useLegacyUpdateCargoAttachmentEvidence()
}

export function useWorkspaceInitiateCargoReturn() {
  const { queryNamespace } = useCargoWorkspace()
  return queryNamespace === 'packlog' ? useInitiatePackLogCargoReturn() : useLegacyInitiateCargoReturn()
}

export function useWorkspacePackageElements(id: string | undefined) {
  const { queryNamespace } = useCargoWorkspace()
  return queryNamespace === 'packlog' ? usePackLogPackageElements(id) : useLegacyPackageElements(id)
}

export function useWorkspaceUpdatePackageElementReturn() {
  const { queryNamespace } = useCargoWorkspace()
  return queryNamespace === 'packlog' ? useUpdatePackLogPackageElementReturn() : useLegacyUpdatePackageElementReturn()
}

export function useWorkspaceUpdatePackageElementDisposition() {
  const { queryNamespace } = useCargoWorkspace()
  return queryNamespace === 'packlog' ? useUpdatePackLogPackageElementDisposition() : useLegacyUpdatePackageElementDisposition()
}

export function useWorkspaceCargoHistory(id: string | undefined) {
  const { queryNamespace } = useCargoWorkspace()
  return queryNamespace === 'packlog' ? usePackLogCargoHistory(id) : useLegacyCargoHistory(id)
}

export function useCargoDictionaryCategory(suffix: string) {
  const { queryNamespace } = useCargoWorkspace()
  return `${queryNamespace === 'packlog' ? 'packlog' : 'travelwiz'}_${suffix}`
}
