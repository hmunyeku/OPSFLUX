/**
 * React Query hooks for the Asset Registry module.
 *
 * All query keys are prefixed with 'ar-' to avoid collisions
 * with the legacy asset module hooks.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { assetRegistryService } from '@/services/assetRegistryService'
import type { InstallationDeckCreate, InstallationDeckUpdate } from '@/types/assetRegistry'

// ── Fields ──

export function useFields(params?: { page?: number; page_size?: number; search?: string; status?: string }) {
  return useQuery({
    queryKey: ['ar-fields', params],
    queryFn: () => assetRegistryService.listFields(params),
  })
}

export function useField(id: string | undefined) {
  return useQuery({
    queryKey: ['ar-field', id],
    queryFn: () => assetRegistryService.getField(id!),
    enabled: !!id,
  })
}

export function useCreateField() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: assetRegistryService.createField,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['ar-fields'] }) },
  })
}

export function useUpdateField() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) =>
      assetRegistryService.updateField(id, data),
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: ['ar-fields'] })
      qc.invalidateQueries({ queryKey: ['ar-field', id] })
    },
  })
}

export function useDeleteField() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: assetRegistryService.deleteField,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['ar-fields'] }) },
  })
}

// ── Sites ──

export function useSites(params?: { page?: number; page_size?: number; field_id?: string; search?: string; status?: string }) {
  return useQuery({
    queryKey: ['ar-sites', params],
    queryFn: () => assetRegistryService.listSites(params),
  })
}

export function useSite(id: string | undefined) {
  return useQuery({
    queryKey: ['ar-site', id],
    queryFn: () => assetRegistryService.getSite(id!),
    enabled: !!id,
  })
}

export function useCreateSite() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: assetRegistryService.createSite,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['ar-sites'] }) },
  })
}

export function useUpdateSite() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) =>
      assetRegistryService.updateSite(id, data),
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: ['ar-sites'] })
      qc.invalidateQueries({ queryKey: ['ar-site', id] })
    },
  })
}

export function useDeleteSite() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: assetRegistryService.deleteSite,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['ar-sites'] }) },
  })
}

// ── Installations ──

export function useInstallations(params?: { page?: number; page_size?: number; site_id?: string; search?: string; status?: string }) {
  return useQuery({
    queryKey: ['ar-installations', params],
    queryFn: () => assetRegistryService.listInstallations(params),
  })
}

export function useInstallation(id: string | undefined) {
  return useQuery({
    queryKey: ['ar-installation', id],
    queryFn: () => assetRegistryService.getInstallation(id!),
    enabled: !!id,
  })
}

export function useCreateInstallation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: assetRegistryService.createInstallation,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['ar-installations'] }) },
  })
}

export function useUpdateInstallation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) =>
      assetRegistryService.updateInstallation(id, data),
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: ['ar-installations'] })
      qc.invalidateQueries({ queryKey: ['ar-installation', id] })
    },
  })
}

export function useDeleteInstallation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: assetRegistryService.deleteInstallation,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['ar-installations'] }) },
  })
}

// ── Decks ──

export function useDecks(installationId: string | undefined) {
  return useQuery({
    queryKey: ['ar-decks', installationId],
    queryFn: () => assetRegistryService.listDecks(installationId!),
    enabled: !!installationId,
  })
}

export function useCreateDeck() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ installationId, data }: { installationId: string; data: InstallationDeckCreate }) =>
      assetRegistryService.createDeck(installationId, data),
    onSuccess: (_, { installationId }) => { qc.invalidateQueries({ queryKey: ['ar-decks', installationId] }) },
  })
}

export function useUpdateDeck() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ installationId, deckId, data }: { installationId: string; deckId: string; data: InstallationDeckUpdate }) =>
      assetRegistryService.updateDeck(installationId, deckId, data),
    onSuccess: (_, { installationId }) => {
      qc.invalidateQueries({ queryKey: ['ar-decks', installationId] })
    },
  })
}

export function useDeleteDeck() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ installationId, deckId }: { installationId: string; deckId: string }) =>
      assetRegistryService.deleteDeck(installationId, deckId),
    onSuccess: (_, { installationId }) => { qc.invalidateQueries({ queryKey: ['ar-decks', installationId] }) },
  })
}

// ── Equipment ──

export function useEquipmentList(params?: {
  page?: number; page_size?: number;
  installation_id?: string; equipment_class?: string;
  search?: string; status?: string;
}) {
  return useQuery({
    queryKey: ['ar-equipment', params],
    queryFn: () => assetRegistryService.listEquipment(params),
  })
}

export function useEquipmentItem(id: string | undefined) {
  return useQuery({
    queryKey: ['ar-equipment-item', id],
    queryFn: () => assetRegistryService.getEquipment(id!),
    enabled: !!id,
  })
}

export function useCreateEquipment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: assetRegistryService.createEquipment,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['ar-equipment'] }) },
  })
}

export function useUpdateEquipment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) =>
      assetRegistryService.updateEquipment(id, data),
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: ['ar-equipment'] })
      qc.invalidateQueries({ queryKey: ['ar-equipment-item', id] })
    },
  })
}

export function useDeleteEquipment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: assetRegistryService.deleteEquipment,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['ar-equipment'] }) },
  })
}

// ── Pipelines ──

export function usePipelines(params?: { page?: number; page_size?: number; search?: string; status?: string }) {
  return useQuery({
    queryKey: ['ar-pipelines', params],
    queryFn: () => assetRegistryService.listPipelines(params),
  })
}

export function usePipeline(id: string | undefined) {
  return useQuery({
    queryKey: ['ar-pipeline', id],
    queryFn: () => assetRegistryService.getPipeline(id!),
    enabled: !!id,
  })
}

export function useCreatePipeline() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: assetRegistryService.createPipeline,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['ar-pipelines'] }) },
  })
}

export function useUpdatePipeline() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) =>
      assetRegistryService.updatePipeline(id, data),
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: ['ar-pipelines'] })
      qc.invalidateQueries({ queryKey: ['ar-pipeline', id] })
    },
  })
}

export function useDeletePipeline() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: assetRegistryService.deletePipeline,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['ar-pipelines'] }) },
  })
}

// ── Hierarchy & Stats ──

export function useHierarchy() {
  return useQuery({
    queryKey: ['ar-hierarchy'],
    queryFn: () => assetRegistryService.getHierarchy(),
  })
}

export function useAssetRegistryStats() {
  return useQuery({
    queryKey: ['ar-stats'],
    queryFn: () => assetRegistryService.getStats(),
  })
}
