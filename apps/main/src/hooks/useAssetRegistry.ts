/**
 * React Query hooks for the Asset Registry module.
 *
 * All query keys are prefixed with 'ar-' to avoid collisions
 * with the legacy asset module hooks.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { assetRegistryService } from '@/services/assetRegistryService'
import type {
  InstallationDeckCreate,
  InstallationDeckUpdate,
  FieldLicenseCreate,
  FieldLicenseUpdate,
} from '@/types/assetRegistry'

// ── Fields ──

export function useFields(params?: { page?: number; page_size?: number; search?: string; status?: string; environment?: string }) {
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

// ── Field Licenses ──

export function useFieldLicenses(fieldId: string | undefined) {
  return useQuery({
    queryKey: ['ar-field-licenses', fieldId],
    queryFn: () => assetRegistryService.listFieldLicenses(fieldId!),
    enabled: !!fieldId,
  })
}

export function useCreateFieldLicense() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ fieldId, payload }: { fieldId: string; payload: FieldLicenseCreate }) =>
      assetRegistryService.createFieldLicense(fieldId, payload),
    onSuccess: (_, { fieldId }) => {
      qc.invalidateQueries({ queryKey: ['ar-field-licenses', fieldId] })
    },
  })
}

export function useUpdateFieldLicense() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ fieldId, licenseId, payload }: { fieldId: string; licenseId: string; payload: FieldLicenseUpdate }) =>
      assetRegistryService.updateFieldLicense(fieldId, licenseId, payload),
    onSuccess: (_, { fieldId }) => {
      qc.invalidateQueries({ queryKey: ['ar-field-licenses', fieldId] })
    },
  })
}

export function useDeleteFieldLicense() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ fieldId, licenseId }: { fieldId: string; licenseId: string }) =>
      assetRegistryService.deleteFieldLicense(fieldId, licenseId),
    onSuccess: (_, { fieldId }) => {
      qc.invalidateQueries({ queryKey: ['ar-field-licenses', fieldId] })
    },
  })
}

// ── Sites ──

export function useSites(params?: { page?: number; page_size?: number; field_id?: string; search?: string; status?: string; site_type?: string; environment?: string }) {
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

export function useInstallations(params?: { page?: number; page_size?: number; site_id?: string; search?: string; status?: string; installation_type?: string; environment?: string }) {
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

export function useAssetHierarchy() {
  return useQuery({
    queryKey: ['ar-hierarchy'],
    queryFn: () => assetRegistryService.getHierarchy(),
    staleTime: 5 * 60_000,
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
  search?: string; status?: string; criticality?: string;
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

export function usePipelines(params?: { page?: number; page_size?: number; search?: string; status?: string; service?: string }) {
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

// ══════════════════════════════════════════════════════════════
// EQUIPMENT SUB-MODELS
// ══════════════════════════════════════════════════════════════

// ── Crane Configurations ─────────────────────────────────────

export function useCraneConfigurations(eqId: string | undefined) {
  return useQuery({ queryKey: ['ar-crane-configs', eqId], queryFn: () => assetRegistryService.listCraneConfigurations(eqId!), enabled: !!eqId })
}
export function useCreateCraneConfiguration() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ eqId, payload }: { eqId: string; payload: any }) => assetRegistryService.createCraneConfiguration(eqId, payload),
    onSuccess: (_, { eqId }) => { qc.invalidateQueries({ queryKey: ['ar-crane-configs', eqId] }) },
  })
}
export function useUpdateCraneConfiguration() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ eqId, id, payload }: { eqId: string; id: string; payload: any }) => assetRegistryService.updateCraneConfiguration(eqId, id, payload),
    onSuccess: (_, { eqId }) => { qc.invalidateQueries({ queryKey: ['ar-crane-configs', eqId] }) },
  })
}
export function useDeleteCraneConfiguration() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ eqId, id }: { eqId: string; id: string }) => assetRegistryService.deleteCraneConfiguration(eqId, id),
    onSuccess: (_, { eqId }) => { qc.invalidateQueries({ queryKey: ['ar-crane-configs', eqId] }) },
  })
}

// ── Crane Load Chart Points (nested under config) ────────────

export function useCraneLoadChartPoints(eqId: string | undefined, configId: string | undefined) {
  return useQuery({ queryKey: ['ar-crane-lcp', eqId, configId], queryFn: () => assetRegistryService.listCraneLoadChartPoints(eqId!, configId!), enabled: !!eqId && !!configId })
}
export function useCreateCraneLoadChartPoint() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ eqId, configId, payload }: { eqId: string; configId: string; payload: any }) => assetRegistryService.createCraneLoadChartPoint(eqId, configId, payload),
    onSuccess: (_, { eqId, configId }) => { qc.invalidateQueries({ queryKey: ['ar-crane-lcp', eqId, configId] }) },
  })
}
export function useUpdateCraneLoadChartPoint() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ eqId, configId, id, payload }: { eqId: string; configId: string; id: string; payload: any }) => assetRegistryService.updateCraneLoadChartPoint(eqId, configId, id, payload),
    onSuccess: (_, { eqId, configId }) => { qc.invalidateQueries({ queryKey: ['ar-crane-lcp', eqId, configId] }) },
  })
}
export function useDeleteCraneLoadChartPoint() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ eqId, configId, id }: { eqId: string; configId: string; id: string }) => assetRegistryService.deleteCraneLoadChartPoint(eqId, configId, id),
    onSuccess: (_, { eqId, configId }) => { qc.invalidateQueries({ queryKey: ['ar-crane-lcp', eqId, configId] }) },
  })
}

// ── Crane Lift Zones (nested under config) ───────────────────

export function useCraneLiftZones(eqId: string | undefined, configId: string | undefined) {
  return useQuery({ queryKey: ['ar-crane-lz', eqId, configId], queryFn: () => assetRegistryService.listCraneLiftZones(eqId!, configId!), enabled: !!eqId && !!configId })
}
export function useCreateCraneLiftZone() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ eqId, configId, payload }: { eqId: string; configId: string; payload: any }) => assetRegistryService.createCraneLiftZone(eqId, configId, payload),
    onSuccess: (_, { eqId, configId }) => { qc.invalidateQueries({ queryKey: ['ar-crane-lz', eqId, configId] }) },
  })
}
export function useUpdateCraneLiftZone() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ eqId, configId, id, payload }: { eqId: string; configId: string; id: string; payload: any }) => assetRegistryService.updateCraneLiftZone(eqId, configId, id, payload),
    onSuccess: (_, { eqId, configId }) => { qc.invalidateQueries({ queryKey: ['ar-crane-lz', eqId, configId] }) },
  })
}
export function useDeleteCraneLiftZone() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ eqId, configId, id }: { eqId: string; configId: string; id: string }) => assetRegistryService.deleteCraneLiftZone(eqId, configId, id),
    onSuccess: (_, { eqId, configId }) => { qc.invalidateQueries({ queryKey: ['ar-crane-lz', eqId, configId] }) },
  })
}

// ── Crane Hook Blocks ────────────────────────────────────────

export function useCraneHookBlocks(eqId: string | undefined) {
  return useQuery({ queryKey: ['ar-crane-hooks', eqId], queryFn: () => assetRegistryService.listCraneHookBlocks(eqId!), enabled: !!eqId })
}
export function useCreateCraneHookBlock() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ eqId, payload }: { eqId: string; payload: any }) => assetRegistryService.createCraneHookBlock(eqId, payload),
    onSuccess: (_, { eqId }) => { qc.invalidateQueries({ queryKey: ['ar-crane-hooks', eqId] }) },
  })
}
export function useUpdateCraneHookBlock() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ eqId, id, payload }: { eqId: string; id: string; payload: any }) => assetRegistryService.updateCraneHookBlock(eqId, id, payload),
    onSuccess: (_, { eqId }) => { qc.invalidateQueries({ queryKey: ['ar-crane-hooks', eqId] }) },
  })
}
export function useDeleteCraneHookBlock() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ eqId, id }: { eqId: string; id: string }) => assetRegistryService.deleteCraneHookBlock(eqId, id),
    onSuccess: (_, { eqId }) => { qc.invalidateQueries({ queryKey: ['ar-crane-hooks', eqId] }) },
  })
}

// ── Crane Reeving Guide ──────────────────────────────────────

export function useCraneReevingGuide(eqId: string | undefined) {
  return useQuery({ queryKey: ['ar-crane-reeving', eqId], queryFn: () => assetRegistryService.listCraneReevingGuide(eqId!), enabled: !!eqId })
}
export function useCreateCraneReevingGuide() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ eqId, payload }: { eqId: string; payload: any }) => assetRegistryService.createCraneReevingGuide(eqId, payload),
    onSuccess: (_, { eqId }) => { qc.invalidateQueries({ queryKey: ['ar-crane-reeving', eqId] }) },
  })
}
export function useUpdateCraneReevingGuide() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ eqId, id, payload }: { eqId: string; id: string; payload: any }) => assetRegistryService.updateCraneReevingGuide(eqId, id, payload),
    onSuccess: (_, { eqId }) => { qc.invalidateQueries({ queryKey: ['ar-crane-reeving', eqId] }) },
  })
}
export function useDeleteCraneReevingGuide() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ eqId, id }: { eqId: string; id: string }) => assetRegistryService.deleteCraneReevingGuide(eqId, id),
    onSuccess: (_, { eqId }) => { qc.invalidateQueries({ queryKey: ['ar-crane-reeving', eqId] }) },
  })
}

// ── Separator Nozzles ────────────────────────────────────────

export function useSeparatorNozzles(eqId: string | undefined) {
  return useQuery({ queryKey: ['ar-sep-nozzles', eqId], queryFn: () => assetRegistryService.listSeparatorNozzles(eqId!), enabled: !!eqId })
}
export function useCreateSeparatorNozzle() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ eqId, payload }: { eqId: string; payload: any }) => assetRegistryService.createSeparatorNozzle(eqId, payload),
    onSuccess: (_, { eqId }) => { qc.invalidateQueries({ queryKey: ['ar-sep-nozzles', eqId] }) },
  })
}
export function useUpdateSeparatorNozzle() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ eqId, id, payload }: { eqId: string; id: string; payload: any }) => assetRegistryService.updateSeparatorNozzle(eqId, id, payload),
    onSuccess: (_, { eqId }) => { qc.invalidateQueries({ queryKey: ['ar-sep-nozzles', eqId] }) },
  })
}
export function useDeleteSeparatorNozzle() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ eqId, id }: { eqId: string; id: string }) => assetRegistryService.deleteSeparatorNozzle(eqId, id),
    onSuccess: (_, { eqId }) => { qc.invalidateQueries({ queryKey: ['ar-sep-nozzles', eqId] }) },
  })
}

// ── Separator Process Cases ──────────────────────────────────

export function useSeparatorProcessCases(eqId: string | undefined) {
  return useQuery({ queryKey: ['ar-sep-cases', eqId], queryFn: () => assetRegistryService.listSeparatorProcessCases(eqId!), enabled: !!eqId })
}
export function useCreateSeparatorProcessCase() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ eqId, payload }: { eqId: string; payload: any }) => assetRegistryService.createSeparatorProcessCase(eqId, payload),
    onSuccess: (_, { eqId }) => { qc.invalidateQueries({ queryKey: ['ar-sep-cases', eqId] }) },
  })
}
export function useUpdateSeparatorProcessCase() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ eqId, id, payload }: { eqId: string; id: string; payload: any }) => assetRegistryService.updateSeparatorProcessCase(eqId, id, payload),
    onSuccess: (_, { eqId }) => { qc.invalidateQueries({ queryKey: ['ar-sep-cases', eqId] }) },
  })
}
export function useDeleteSeparatorProcessCase() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ eqId, id }: { eqId: string; id: string }) => assetRegistryService.deleteSeparatorProcessCase(eqId, id),
    onSuccess: (_, { eqId }) => { qc.invalidateQueries({ queryKey: ['ar-sep-cases', eqId] }) },
  })
}

// ── Pump Curve Points ────────────────────────────────────────

export function usePumpCurvePoints(eqId: string | undefined) {
  return useQuery({ queryKey: ['ar-pump-curve', eqId], queryFn: () => assetRegistryService.listPumpCurvePoints(eqId!), enabled: !!eqId })
}
export function useCreatePumpCurvePoint() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ eqId, payload }: { eqId: string; payload: any }) => assetRegistryService.createPumpCurvePoint(eqId, payload),
    onSuccess: (_, { eqId }) => { qc.invalidateQueries({ queryKey: ['ar-pump-curve', eqId] }) },
  })
}
export function useUpdatePumpCurvePoint() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ eqId, id, payload }: { eqId: string; id: string; payload: any }) => assetRegistryService.updatePumpCurvePoint(eqId, id, payload),
    onSuccess: (_, { eqId }) => { qc.invalidateQueries({ queryKey: ['ar-pump-curve', eqId] }) },
  })
}
export function useDeletePumpCurvePoint() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ eqId, id }: { eqId: string; id: string }) => assetRegistryService.deletePumpCurvePoint(eqId, id),
    onSuccess: (_, { eqId }) => { qc.invalidateQueries({ queryKey: ['ar-pump-curve', eqId] }) },
  })
}

// ── Column Sections ──────────────────────────────────────────

export function useColumnSections(eqId: string | undefined) {
  return useQuery({ queryKey: ['ar-col-sections', eqId], queryFn: () => assetRegistryService.listColumnSections(eqId!), enabled: !!eqId })
}
export function useCreateColumnSection() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ eqId, payload }: { eqId: string; payload: any }) => assetRegistryService.createColumnSection(eqId, payload),
    onSuccess: (_, { eqId }) => { qc.invalidateQueries({ queryKey: ['ar-col-sections', eqId] }) },
  })
}
export function useUpdateColumnSection() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ eqId, id, payload }: { eqId: string; id: string; payload: any }) => assetRegistryService.updateColumnSection(eqId, id, payload),
    onSuccess: (_, { eqId }) => { qc.invalidateQueries({ queryKey: ['ar-col-sections', eqId] }) },
  })
}
export function useDeleteColumnSection() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ eqId, id }: { eqId: string; id: string }) => assetRegistryService.deleteColumnSection(eqId, id),
    onSuccess: (_, { eqId }) => { qc.invalidateQueries({ queryKey: ['ar-col-sections', eqId] }) },
  })
}

// ── Change Log (audit trail) ────────────────────────────────

export function useAssetChangeLog(entityType: string | undefined, entityId: string | undefined, page = 1, pageSize = 25) {
  return useQuery({
    queryKey: ['ar-change-log', entityType, entityId, page, pageSize],
    queryFn: () => assetRegistryService.getEntityChangeLog(entityType!, entityId!, { page, page_size: pageSize }),
    enabled: !!entityType && !!entityId,
  })
}

export function useRecentAssetChanges(limit = 10) {
  return useQuery({
    queryKey: ['ar-recent-changes', limit],
    queryFn: () => assetRegistryService.getRecentChanges(limit),
  })
}
