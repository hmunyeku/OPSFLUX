/**
 * Tiers (companies) API service — companies + contacts + identifiers + blocks + refs + SAP import.
 */
import api from '@/lib/api'
import type {
  Tier, TierCreate,
  TierContact, TierContactCreate, TierContactUpdate, TierContactWithTier,
  TierBlock, TierBlockCreate,
  ExternalReference, ExternalReferenceCreate,
  SapImportResult,
  PaginatedResponse, PaginationParams,
} from '@/types/api'

interface TierListParams extends PaginationParams {
  type?: string
  search?: string
  active?: boolean
}

export const tiersService = {
  // ── Tiers ──
  list: async (params: TierListParams = {}): Promise<PaginatedResponse<Tier>> => {
    const { data } = await api.get('/api/v1/tiers', { params })
    return data
  },

  get: async (id: string): Promise<Tier> => {
    const { data } = await api.get(`/api/v1/tiers/${id}`)
    return data
  },

  create: async (payload: TierCreate): Promise<Tier> => {
    const { data } = await api.post('/api/v1/tiers', payload)
    return data
  },

  update: async (id: string, payload: Partial<TierCreate>): Promise<Tier> => {
    const { data } = await api.patch(`/api/v1/tiers/${id}`, payload)
    return data
  },

  archive: async (id: string): Promise<void> => {
    await api.delete(`/api/v1/tiers/${id}`)
  },

  // ── Contacts (employees) ──
  listContacts: async (tierId: string): Promise<TierContact[]> => {
    const { data } = await api.get(`/api/v1/tiers/${tierId}/contacts`)
    return data
  },

  countContacts: async (tierId: string): Promise<number> => {
    const { data } = await api.get(`/api/v1/tiers/${tierId}/contacts/count`)
    return data.count
  },

  getContact: async (tierId: string, contactId: string): Promise<TierContact> => {
    const { data } = await api.get(`/api/v1/tiers/${tierId}/contacts/${contactId}`)
    return data
  },

  createContact: async (tierId: string, payload: TierContactCreate): Promise<TierContact> => {
    const { data } = await api.post(`/api/v1/tiers/${tierId}/contacts`, payload)
    return data
  },

  updateContact: async (tierId: string, contactId: string, payload: TierContactUpdate): Promise<TierContact> => {
    const { data } = await api.patch(`/api/v1/tiers/${tierId}/contacts/${contactId}`, payload)
    return data
  },

  deleteContact: async (tierId: string, contactId: string): Promise<void> => {
    await api.delete(`/api/v1/tiers/${tierId}/contacts/${contactId}`)
  },

  // ── All contacts (cross-company) ──
  listAllContacts: async (params: PaginationParams & { search?: string; tier_id?: string; department?: string; is_primary?: boolean } = {}): Promise<PaginatedResponse<TierContactWithTier>> => {
    const { data } = await api.get('/api/v1/tiers/contacts/all', { params })
    return data
  },

  // ── Identifiers — now served by legalIdentifiersService (polymorphic) ──

  // ── Blocks (blocking/unblocking) ──
  listBlocks: async (tierId: string): Promise<TierBlock[]> => {
    const { data } = await api.get(`/api/v1/tiers/${tierId}/blocks`)
    return data
  },

  blockTier: async (tierId: string, payload: TierBlockCreate): Promise<TierBlock> => {
    const { data } = await api.post(`/api/v1/tiers/${tierId}/block`, payload)
    return data
  },

  unblockTier: async (tierId: string, payload: TierBlockCreate): Promise<TierBlock> => {
    const { data } = await api.post(`/api/v1/tiers/${tierId}/unblock`, payload)
    return data
  },

  // ── External References ──
  listExternalRefs: async (tierId: string): Promise<ExternalReference[]> => {
    const { data } = await api.get(`/api/v1/tiers/${tierId}/external-refs`)
    return data
  },

  createExternalRef: async (tierId: string, payload: ExternalReferenceCreate): Promise<ExternalReference> => {
    const { data } = await api.post(`/api/v1/tiers/${tierId}/external-refs`, payload)
    return data
  },

  deleteExternalRef: async (tierId: string, refId: string): Promise<void> => {
    await api.delete(`/api/v1/tiers/${tierId}/external-refs/${refId}`)
  },

  // ── SAP Import ──
  importSap: async (file: File): Promise<SapImportResult> => {
    const form = new FormData()
    form.append('file', file)
    const { data } = await api.post('/api/v1/tiers/import/sap', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return data
  },
}
