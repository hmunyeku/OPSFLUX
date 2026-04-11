import { createContext, useContext, type ReactNode } from 'react'
import {
  useApplyCargoRequestLoadingOption,
  useCargo,
  useCargoAttachmentEvidence,
  useCargoHistory,
  useCargoItem,
  useCargoRequest,
  useCargoRequestLoadingOptions,
  useCargoRequestLtPdf,
  useCargoRequests,
  useCreateCargo,
  useCreateCargoRequest,
  useInitiateCargoReturn,
  usePackageElements,
  useUpdateCargo,
  useUpdateCargoAttachmentEvidence,
  useUpdateCargoRequest,
  useUpdateCargoStatus,
  useUpdateCargoWorkflowStatus,
  useUpdatePackageElementDisposition,
  useUpdatePackageElementReturn,
} from '@/hooks/useTravelWiz'
import {
  useApplyPackLogCargoRequestLoadingOption,
  useCargo as usePackLogCargo,
  useCargoAttachmentEvidence as usePackLogCargoAttachmentEvidence,
  useCargoHistory as usePackLogCargoHistory,
  useCargoItem as usePackLogCargoItem,
  useCargoRequest as usePackLogCargoRequest,
  useCargoRequestLoadingOptions as usePackLogCargoRequestLoadingOptions,
  useCargoRequestLtPdf as usePackLogCargoRequestLtPdf,
  useCargoRequests as usePackLogCargoRequests,
  useCreateCargo as useCreatePackLogCargo,
  useCreateCargoRequest as useCreatePackLogCargoRequest,
  useInitiateCargoReturn as useInitiatePackLogCargoReturn,
  usePackageElements as usePackLogPackageElements,
  useUpdateCargo as useUpdatePackLogCargo,
  useUpdateCargoAttachmentEvidence as useUpdatePackLogCargoAttachmentEvidence,
  useUpdateCargoRequest as useUpdatePackLogCargoRequest,
  useUpdateCargoStatus as useUpdatePackLogCargoStatus,
  useUpdateCargoWorkflowStatus as useUpdatePackLogCargoWorkflowStatus,
  useUpdatePackageElementDisposition as useUpdatePackLogPackageElementDisposition,
  useUpdatePackageElementReturn as useUpdatePackLogPackageElementReturn,
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

export function useWorkspaceCargoRequests(params: Parameters<typeof useCargoRequests>[0]) {
  const { queryNamespace } = useCargoWorkspace()
  return queryNamespace === 'packlog' ? usePackLogCargoRequests(params) : useCargoRequests(params)
}

export function useWorkspaceCargoRequest(id: string | undefined) {
  const { queryNamespace } = useCargoWorkspace()
  return queryNamespace === 'packlog' ? usePackLogCargoRequest(id) : useCargoRequest(id)
}

export function useWorkspaceCargoRequestLtPdf() {
  const { queryNamespace } = useCargoWorkspace()
  return queryNamespace === 'packlog' ? usePackLogCargoRequestLtPdf() : useCargoRequestLtPdf()
}

export function useWorkspaceCargoRequestLoadingOptions(id: string | undefined) {
  const { queryNamespace } = useCargoWorkspace()
  return queryNamespace === 'packlog' ? usePackLogCargoRequestLoadingOptions(id) : useCargoRequestLoadingOptions(id)
}

export function useWorkspaceCreateCargoRequest() {
  const { queryNamespace } = useCargoWorkspace()
  return queryNamespace === 'packlog' ? useCreatePackLogCargoRequest() : useCreateCargoRequest()
}

export function useWorkspaceUpdateCargoRequest() {
  const { queryNamespace } = useCargoWorkspace()
  return queryNamespace === 'packlog' ? useUpdatePackLogCargoRequest() : useUpdateCargoRequest()
}

export function useWorkspaceApplyCargoRequestLoadingOption() {
  const { queryNamespace } = useCargoWorkspace()
  return queryNamespace === 'packlog' ? useApplyPackLogCargoRequestLoadingOption() : useApplyCargoRequestLoadingOption()
}

export function useWorkspaceCargo(params: Parameters<typeof useCargo>[0]) {
  const { queryNamespace } = useCargoWorkspace()
  return queryNamespace === 'packlog' ? usePackLogCargo(params) : useCargo(params)
}

export function useWorkspaceCargoItem(id: string | undefined) {
  const { queryNamespace } = useCargoWorkspace()
  return queryNamespace === 'packlog' ? usePackLogCargoItem(id) : useCargoItem(id)
}

export function useWorkspaceCreateCargo() {
  const { queryNamespace } = useCargoWorkspace()
  return queryNamespace === 'packlog' ? useCreatePackLogCargo() : useCreateCargo()
}

export function useWorkspaceUpdateCargo() {
  const { queryNamespace } = useCargoWorkspace()
  return queryNamespace === 'packlog' ? useUpdatePackLogCargo() : useUpdateCargo()
}

export function useWorkspaceUpdateCargoStatus() {
  const { queryNamespace } = useCargoWorkspace()
  return queryNamespace === 'packlog' ? useUpdatePackLogCargoStatus() : useUpdateCargoStatus()
}

export function useWorkspaceUpdateCargoWorkflowStatus() {
  const { queryNamespace } = useCargoWorkspace()
  return queryNamespace === 'packlog' ? useUpdatePackLogCargoWorkflowStatus() : useUpdateCargoWorkflowStatus()
}

export function useWorkspaceCargoAttachmentEvidence(id: string | undefined) {
  const { queryNamespace } = useCargoWorkspace()
  return queryNamespace === 'packlog' ? usePackLogCargoAttachmentEvidence(id) : useCargoAttachmentEvidence(id)
}

export function useWorkspaceUpdateCargoAttachmentEvidence() {
  const { queryNamespace } = useCargoWorkspace()
  return queryNamespace === 'packlog' ? useUpdatePackLogCargoAttachmentEvidence() : useUpdateCargoAttachmentEvidence()
}

export function useWorkspaceInitiateCargoReturn() {
  const { queryNamespace } = useCargoWorkspace()
  return queryNamespace === 'packlog' ? useInitiatePackLogCargoReturn() : useInitiateCargoReturn()
}

export function useWorkspacePackageElements(id: string | undefined) {
  const { queryNamespace } = useCargoWorkspace()
  return queryNamespace === 'packlog' ? usePackLogPackageElements(id) : usePackageElements(id)
}

export function useWorkspaceUpdatePackageElementReturn() {
  const { queryNamespace } = useCargoWorkspace()
  return queryNamespace === 'packlog' ? useUpdatePackLogPackageElementReturn() : useUpdatePackageElementReturn()
}

export function useWorkspaceUpdatePackageElementDisposition() {
  const { queryNamespace } = useCargoWorkspace()
  return queryNamespace === 'packlog' ? useUpdatePackLogPackageElementDisposition() : useUpdatePackageElementDisposition()
}

export function useWorkspaceCargoHistory(id: string | undefined) {
  const { queryNamespace } = useCargoWorkspace()
  return queryNamespace === 'packlog' ? usePackLogCargoHistory(id) : useCargoHistory(id)
}

export function useCargoDictionaryCategory(suffix: string) {
  const { queryNamespace } = useCargoWorkspace()
  return `${queryNamespace === 'packlog' ? 'packlog' : 'travelwiz'}_${suffix}`
}
