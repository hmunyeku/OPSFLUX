/**
 * Asset Registry API service — O&G hierarchy CRUD + hierarchy tree + stats.
 */
import api from '@/lib/api'
import type { PaginatedResponse, PaginationParams } from '@/types/api'
import type {
  OilField, OilFieldCreate, OilFieldUpdate,
  FieldLicense, FieldLicenseCreate, FieldLicenseUpdate,
  OilSite, OilSiteCreate, OilSiteUpdate,
  Installation, InstallationCreate, InstallationUpdate,
  InstallationDeck, InstallationDeckCreate, InstallationDeckUpdate,
  RegistryEquipment, EquipmentCreate, EquipmentUpdate,
  RegistryPipeline, PipelineCreate, PipelineUpdate,
  HierarchyFieldNode, AssetRegistryStats,
  CraneConfiguration, CraneConfigurationCreate, CraneConfigurationUpdate,
  CraneLoadChartPoint, CraneLoadChartPointCreate, CraneLoadChartPointUpdate,
  CraneLiftZone, CraneLiftZoneCreate, CraneLiftZoneUpdate,
  CraneHookBlock, CraneHookBlockCreate, CraneHookBlockUpdate,
  CraneReevingGuideEntry, CraneReevingGuideCreate, CraneReevingGuideUpdate,
  SeparatorNozzle, SeparatorNozzleCreate, SeparatorNozzleUpdate,
  SeparatorProcessCase, SeparatorProcessCaseCreate, SeparatorProcessCaseUpdate,
  PumpCurvePoint, PumpCurvePointCreate, PumpCurvePointUpdate,
  ColumnSection, ColumnSectionCreate, ColumnSectionUpdate,
  AssetChangeLogEntry,
} from '@/types/assetRegistry'

const BASE = '/api/v1/asset-registry'

// ── List-param interfaces ────────────────────────────────────
interface FieldListParams extends PaginationParams {
  search?: string
  status?: string
}

interface SiteListParams extends PaginationParams {
  search?: string
  field_id?: string
}

interface InstallationListParams extends PaginationParams {
  search?: string
  site_id?: string
}

interface EquipmentListParams extends PaginationParams {
  search?: string
  installation_id?: string
  equipment_class?: string
}

interface PipelineListParams extends PaginationParams {
  search?: string
}

// ── KMZ preview shape ────────────────────────────────────────
export interface KmzPreviewSample {
  kml_id: string
  name: string
  attributes: Record<string, string>
  folder: string
  geometry_type?: 'Point' | 'LineString' | 'Polygon'
  coordinates?: Array<[number, number]>
  parsed_name?: { diameter_in: number | null; fluid: string | null; from_tag: string | null; to_tag: string | null }
}

export interface KmzPreviewCategory {
  count: number
  attribute_keys?: string[]
  samples?: KmzPreviewSample[]
  note?: string
}

export interface KmzPreview {
  source: { document_name: string; folder_count: number; placemark_count: number }
  categories: {
    platforms: KmzPreviewCategory
    wells: KmzPreviewCategory
    pipelines: KmzPreviewCategory
    cables: KmzPreviewCategory
    structures: KmzPreviewCategory
    bathymetry: KmzPreviewCategory
  }
  filename?: string
  uploaded_by?: string
  entity_id?: string
}

// ── Service ──────────────────────────────────────────────────
export const assetRegistryService = {

  // ── Fields ───────────────────────────────────────────────
  listFields: async (params: FieldListParams = {}): Promise<PaginatedResponse<OilField>> => {
    const { data } = await api.get(`${BASE}/fields`, { params })
    return data
  },

  getField: async (id: string): Promise<OilField> => {
    const { data } = await api.get(`${BASE}/fields/${id}`)
    return data
  },

  createField: async (payload: OilFieldCreate): Promise<OilField> => {
    const { data } = await api.post(`${BASE}/fields`, payload)
    return data
  },

  updateField: async (id: string, payload: OilFieldUpdate): Promise<OilField> => {
    const { data } = await api.patch(`${BASE}/fields/${id}`, payload)
    return data
  },

  deleteField: async (id: string): Promise<void> => {
    await api.delete(`${BASE}/fields/${id}`)
  },

  // ── Field Licenses (nested under field) ─────────────────
  listFieldLicenses: async (fieldId: string): Promise<FieldLicense[]> => {
    const { data } = await api.get(`${BASE}/fields/${fieldId}/licenses`)
    return data
  },

  createFieldLicense: async (fieldId: string, payload: FieldLicenseCreate): Promise<FieldLicense> => {
    const { data } = await api.post(`${BASE}/fields/${fieldId}/licenses`, payload)
    return data
  },

  updateFieldLicense: async (fieldId: string, licenseId: string, payload: FieldLicenseUpdate): Promise<FieldLicense> => {
    const { data } = await api.patch(`${BASE}/fields/${fieldId}/licenses/${licenseId}`, payload)
    return data
  },

  deleteFieldLicense: async (fieldId: string, licenseId: string): Promise<void> => {
    await api.delete(`${BASE}/fields/${fieldId}/licenses/${licenseId}`)
  },

  // ── Sites ────────────────────────────────────────────────
  listSites: async (params: SiteListParams = {}): Promise<PaginatedResponse<OilSite>> => {
    const { data } = await api.get(`${BASE}/sites`, { params })
    return data
  },

  getSite: async (id: string): Promise<OilSite> => {
    const { data } = await api.get(`${BASE}/sites/${id}`)
    return data
  },

  createSite: async (payload: OilSiteCreate): Promise<OilSite> => {
    const { data } = await api.post(`${BASE}/sites`, payload)
    return data
  },

  updateSite: async (id: string, payload: OilSiteUpdate): Promise<OilSite> => {
    const { data } = await api.patch(`${BASE}/sites/${id}`, payload)
    return data
  },

  deleteSite: async (id: string): Promise<void> => {
    await api.delete(`${BASE}/sites/${id}`)
  },

  // ── Installations ────────────────────────────────────────
  listInstallations: async (params: InstallationListParams = {}): Promise<PaginatedResponse<Installation>> => {
    const { data } = await api.get(`${BASE}/installations`, { params })
    return data
  },

  getInstallation: async (id: string): Promise<Installation> => {
    const { data } = await api.get(`${BASE}/installations/${id}`)
    return data
  },

  createInstallation: async (payload: InstallationCreate): Promise<Installation> => {
    const { data } = await api.post(`${BASE}/installations`, payload)
    return data
  },

  updateInstallation: async (id: string, payload: InstallationUpdate): Promise<Installation> => {
    const { data } = await api.patch(`${BASE}/installations/${id}`, payload)
    return data
  },

  deleteInstallation: async (id: string): Promise<void> => {
    await api.delete(`${BASE}/installations/${id}`)
  },

  // ── Decks (nested under installation) ────────────────────
  listDecks: async (installationId: string): Promise<InstallationDeck[]> => {
    const { data } = await api.get(`${BASE}/installations/${installationId}/decks`)
    return data
  },

  createDeck: async (installationId: string, payload: InstallationDeckCreate): Promise<InstallationDeck> => {
    const { data } = await api.post(`${BASE}/installations/${installationId}/decks`, payload)
    return data
  },

  updateDeck: async (installationId: string, deckId: string, payload: InstallationDeckUpdate): Promise<InstallationDeck> => {
    const { data } = await api.patch(`${BASE}/installations/${installationId}/decks/${deckId}`, payload)
    return data
  },

  deleteDeck: async (installationId: string, deckId: string): Promise<void> => {
    await api.delete(`${BASE}/installations/${installationId}/decks/${deckId}`)
  },

  // ── Installation 1:1 sub-details ───────────────────────
  upsertOffshoreDetails: async (installationId: string, payload: Record<string, unknown>): Promise<Record<string, unknown>> => {
    const { data } = await api.put(`${BASE}/installations/${installationId}/offshore-details`, payload)
    return data
  },
  upsertOnshoreDetails: async (installationId: string, payload: Record<string, unknown>): Promise<Record<string, unknown>> => {
    const { data } = await api.put(`${BASE}/installations/${installationId}/onshore-details`, payload)
    return data
  },
  upsertTypeDetails: async (installationId: string, payload: Record<string, unknown>): Promise<Record<string, unknown>> => {
    const { data } = await api.put(`${BASE}/installations/${installationId}/type-details`, payload)
    return data
  },

  // ── Equipment ────────────────────────────────────────────
  listEquipment: async (params: EquipmentListParams = {}): Promise<PaginatedResponse<RegistryEquipment>> => {
    const { data } = await api.get(`${BASE}/equipment`, { params })
    return data
  },

  getEquipment: async (id: string): Promise<RegistryEquipment> => {
    const { data } = await api.get(`${BASE}/equipment/${id}`)
    return data
  },

  createEquipment: async (payload: EquipmentCreate): Promise<RegistryEquipment> => {
    const { data } = await api.post(`${BASE}/equipment`, payload)
    return data
  },

  updateEquipment: async (id: string, payload: EquipmentUpdate): Promise<RegistryEquipment> => {
    const { data } = await api.patch(`${BASE}/equipment/${id}`, payload)
    return data
  },

  deleteEquipment: async (id: string): Promise<void> => {
    await api.delete(`${BASE}/equipment/${id}`)
  },

  // ── Pipelines ────────────────────────────────────────────
  listPipelines: async (params: PipelineListParams = {}): Promise<PaginatedResponse<RegistryPipeline>> => {
    const { data } = await api.get(`${BASE}/pipelines`, { params })
    return data
  },

  getPipeline: async (id: string): Promise<RegistryPipeline> => {
    const { data } = await api.get(`${BASE}/pipelines/${id}`)
    return data
  },

  createPipeline: async (payload: PipelineCreate): Promise<RegistryPipeline> => {
    const { data } = await api.post(`${BASE}/pipelines`, payload)
    return data
  },

  updatePipeline: async (id: string, payload: PipelineUpdate): Promise<RegistryPipeline> => {
    const { data } = await api.patch(`${BASE}/pipelines/${id}`, payload)
    return data
  },

  deletePipeline: async (id: string): Promise<void> => {
    await api.delete(`${BASE}/pipelines/${id}`)
  },

  // ── Hierarchy & Stats ────────────────────────────────────
  getHierarchy: async (): Promise<HierarchyFieldNode[]> => {
    const { data } = await api.get(`${BASE}/hierarchy`)
    return data
  },

  getStats: async (): Promise<AssetRegistryStats> => {
    const { data } = await api.get(`${BASE}/stats`)
    return data
  },

  // ── Crane Configurations ───────────────────────────────────
  listCraneConfigurations: async (eqId: string): Promise<CraneConfiguration[]> => {
    const { data } = await api.get(`${BASE}/equipment/${eqId}/crane-configurations`)
    return data
  },
  createCraneConfiguration: async (eqId: string, payload: CraneConfigurationCreate): Promise<CraneConfiguration> => {
    const { data } = await api.post(`${BASE}/equipment/${eqId}/crane-configurations`, payload)
    return data
  },
  updateCraneConfiguration: async (eqId: string, id: string, payload: CraneConfigurationUpdate): Promise<CraneConfiguration> => {
    const { data } = await api.patch(`${BASE}/equipment/${eqId}/crane-configurations/${id}`, payload)
    return data
  },
  deleteCraneConfiguration: async (eqId: string, id: string): Promise<void> => {
    await api.delete(`${BASE}/equipment/${eqId}/crane-configurations/${id}`)
  },

  // ── Crane Load Chart Points (nested under config) ─────────────
  listCraneLoadChartPoints: async (eqId: string, configId: string): Promise<CraneLoadChartPoint[]> => {
    const { data } = await api.get(`${BASE}/equipment/${eqId}/crane-configurations/${configId}/load-chart-points`)
    return data
  },
  createCraneLoadChartPoint: async (eqId: string, configId: string, payload: CraneLoadChartPointCreate): Promise<CraneLoadChartPoint> => {
    const { data } = await api.post(`${BASE}/equipment/${eqId}/crane-configurations/${configId}/load-chart-points`, payload)
    return data
  },
  updateCraneLoadChartPoint: async (eqId: string, configId: string, id: string, payload: CraneLoadChartPointUpdate): Promise<CraneLoadChartPoint> => {
    const { data } = await api.patch(`${BASE}/equipment/${eqId}/crane-configurations/${configId}/load-chart-points/${id}`, payload)
    return data
  },
  deleteCraneLoadChartPoint: async (eqId: string, configId: string, id: string): Promise<void> => {
    await api.delete(`${BASE}/equipment/${eqId}/crane-configurations/${configId}/load-chart-points/${id}`)
  },

  // ── Crane Lift Zones (nested under config) ────────────────────
  listCraneLiftZones: async (eqId: string, configId: string): Promise<CraneLiftZone[]> => {
    const { data } = await api.get(`${BASE}/equipment/${eqId}/crane-configurations/${configId}/lift-zones`)
    return data
  },
  createCraneLiftZone: async (eqId: string, configId: string, payload: CraneLiftZoneCreate): Promise<CraneLiftZone> => {
    const { data } = await api.post(`${BASE}/equipment/${eqId}/crane-configurations/${configId}/lift-zones`, payload)
    return data
  },
  updateCraneLiftZone: async (eqId: string, configId: string, id: string, payload: CraneLiftZoneUpdate): Promise<CraneLiftZone> => {
    const { data } = await api.patch(`${BASE}/equipment/${eqId}/crane-configurations/${configId}/lift-zones/${id}`, payload)
    return data
  },
  deleteCraneLiftZone: async (eqId: string, configId: string, id: string): Promise<void> => {
    await api.delete(`${BASE}/equipment/${eqId}/crane-configurations/${configId}/lift-zones/${id}`)
  },

  // ── Crane Hook Blocks ──────────────────────────────────────
  listCraneHookBlocks: async (eqId: string): Promise<CraneHookBlock[]> => {
    const { data } = await api.get(`${BASE}/equipment/${eqId}/crane-hook-blocks`)
    return data
  },
  createCraneHookBlock: async (eqId: string, payload: CraneHookBlockCreate): Promise<CraneHookBlock> => {
    const { data } = await api.post(`${BASE}/equipment/${eqId}/crane-hook-blocks`, payload)
    return data
  },
  updateCraneHookBlock: async (eqId: string, id: string, payload: CraneHookBlockUpdate): Promise<CraneHookBlock> => {
    const { data } = await api.patch(`${BASE}/equipment/${eqId}/crane-hook-blocks/${id}`, payload)
    return data
  },
  deleteCraneHookBlock: async (eqId: string, id: string): Promise<void> => {
    await api.delete(`${BASE}/equipment/${eqId}/crane-hook-blocks/${id}`)
  },

  // ── Crane Reeving Guide ────────────────────────────────────
  listCraneReevingGuide: async (eqId: string): Promise<CraneReevingGuideEntry[]> => {
    const { data } = await api.get(`${BASE}/equipment/${eqId}/crane-reeving-guide`)
    return data
  },
  createCraneReevingGuide: async (eqId: string, payload: CraneReevingGuideCreate): Promise<CraneReevingGuideEntry> => {
    const { data } = await api.post(`${BASE}/equipment/${eqId}/crane-reeving-guide`, payload)
    return data
  },
  updateCraneReevingGuide: async (eqId: string, id: string, payload: CraneReevingGuideUpdate): Promise<CraneReevingGuideEntry> => {
    const { data } = await api.patch(`${BASE}/equipment/${eqId}/crane-reeving-guide/${id}`, payload)
    return data
  },
  deleteCraneReevingGuide: async (eqId: string, id: string): Promise<void> => {
    await api.delete(`${BASE}/equipment/${eqId}/crane-reeving-guide/${id}`)
  },

  // ── Separator Nozzles ──────────────────────────────────────
  listSeparatorNozzles: async (eqId: string): Promise<SeparatorNozzle[]> => {
    const { data } = await api.get(`${BASE}/equipment/${eqId}/separator-nozzles`)
    return data
  },
  createSeparatorNozzle: async (eqId: string, payload: SeparatorNozzleCreate): Promise<SeparatorNozzle> => {
    const { data } = await api.post(`${BASE}/equipment/${eqId}/separator-nozzles`, payload)
    return data
  },
  updateSeparatorNozzle: async (eqId: string, id: string, payload: SeparatorNozzleUpdate): Promise<SeparatorNozzle> => {
    const { data } = await api.patch(`${BASE}/equipment/${eqId}/separator-nozzles/${id}`, payload)
    return data
  },
  deleteSeparatorNozzle: async (eqId: string, id: string): Promise<void> => {
    await api.delete(`${BASE}/equipment/${eqId}/separator-nozzles/${id}`)
  },

  // ── Separator Process Cases ────────────────────────────────
  listSeparatorProcessCases: async (eqId: string): Promise<SeparatorProcessCase[]> => {
    const { data } = await api.get(`${BASE}/equipment/${eqId}/separator-process-cases`)
    return data
  },
  createSeparatorProcessCase: async (eqId: string, payload: SeparatorProcessCaseCreate): Promise<SeparatorProcessCase> => {
    const { data } = await api.post(`${BASE}/equipment/${eqId}/separator-process-cases`, payload)
    return data
  },
  updateSeparatorProcessCase: async (eqId: string, id: string, payload: SeparatorProcessCaseUpdate): Promise<SeparatorProcessCase> => {
    const { data } = await api.patch(`${BASE}/equipment/${eqId}/separator-process-cases/${id}`, payload)
    return data
  },
  deleteSeparatorProcessCase: async (eqId: string, id: string): Promise<void> => {
    await api.delete(`${BASE}/equipment/${eqId}/separator-process-cases/${id}`)
  },

  // ── Pump Curve Points ──────────────────────────────────────
  listPumpCurvePoints: async (eqId: string): Promise<PumpCurvePoint[]> => {
    const { data } = await api.get(`${BASE}/equipment/${eqId}/pump-curve-points`)
    return data
  },
  createPumpCurvePoint: async (eqId: string, payload: PumpCurvePointCreate): Promise<PumpCurvePoint> => {
    const { data } = await api.post(`${BASE}/equipment/${eqId}/pump-curve-points`, payload)
    return data
  },
  updatePumpCurvePoint: async (eqId: string, id: string, payload: PumpCurvePointUpdate): Promise<PumpCurvePoint> => {
    const { data } = await api.patch(`${BASE}/equipment/${eqId}/pump-curve-points/${id}`, payload)
    return data
  },
  deletePumpCurvePoint: async (eqId: string, id: string): Promise<void> => {
    await api.delete(`${BASE}/equipment/${eqId}/pump-curve-points/${id}`)
  },

  // ── Column Sections ────────────────────────────────────────
  listColumnSections: async (eqId: string): Promise<ColumnSection[]> => {
    const { data } = await api.get(`${BASE}/equipment/${eqId}/column-sections`)
    return data
  },
  createColumnSection: async (eqId: string, payload: ColumnSectionCreate): Promise<ColumnSection> => {
    const { data } = await api.post(`${BASE}/equipment/${eqId}/column-sections`, payload)
    return data
  },
  updateColumnSection: async (eqId: string, id: string, payload: ColumnSectionUpdate): Promise<ColumnSection> => {
    const { data } = await api.patch(`${BASE}/equipment/${eqId}/column-sections/${id}`, payload)
    return data
  },
  deleteColumnSection: async (eqId: string, id: string): Promise<void> => {
    await api.delete(`${BASE}/equipment/${eqId}/column-sections/${id}`)
  },

  // ── Change Log (audit trail) ──────────────────────────────
  getEntityChangeLog: async (
    entityType: string,
    entityId: string,
    params: { page?: number; page_size?: number } = {},
  ): Promise<PaginatedResponse<AssetChangeLogEntry>> => {
    const { data } = await api.get(`${BASE}/history/${entityType}/${entityId}`, { params })
    return data
  },

  getRecentChanges: async (limit = 10): Promise<AssetChangeLogEntry[]> => {
    const { data } = await api.get(`${BASE}/history/recent`, { params: { limit } })
    return data
  },

  // ── KMZ import / export ────────────────────────────────────
  kmzPreview: async (file: File): Promise<KmzPreview> => {
    const formData = new FormData()
    formData.append('file', file)
    const { data } = await api.post(`${BASE}/kmz/preview`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return data
  },

  /** Download the entity's assets as a KMZ file (triggers browser download). */
  kmzExportUrl: (): string => `${BASE}/kmz/export`,

  /** Fetch the entity's assets as a KMZ blob for programmatic download. */
  kmzExportBlob: async (): Promise<Blob> => {
    const { data } = await api.get(`${BASE}/kmz/export`, { responseType: 'blob' })
    return data
  },
}
