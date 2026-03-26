/**
 * Asset Registry API service — O&G hierarchy CRUD + hierarchy tree + stats.
 */
import api from '@/lib/api'
import type { PaginatedResponse, PaginationParams } from '@/types/api'
import type {
  OilField, OilFieldCreate, OilFieldUpdate,
  OilSite, OilSiteCreate, OilSiteUpdate,
  Installation, InstallationCreate, InstallationUpdate,
  InstallationDeck, InstallationDeckCreate, InstallationDeckUpdate,
  RegistryEquipment, EquipmentCreate, EquipmentUpdate,
  RegistryPipeline, PipelineCreate, PipelineUpdate,
  HierarchyNode, AssetRegistryStats,
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
  getHierarchy: async (): Promise<HierarchyNode[]> => {
    const { data } = await api.get(`${BASE}/hierarchy`)
    return data
  },

  getStats: async (): Promise<AssetRegistryStats> => {
    const { data } = await api.get(`${BASE}/stats`)
    return data
  },
}
