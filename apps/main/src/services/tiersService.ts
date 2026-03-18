/**
 * Tiers (companies) API service — companies + contacts + identifiers.
 */
import api from '@/lib/api'
import type {
  Tier, TierCreate,
  TierContact, TierContactCreate, TierContactUpdate, TierContactWithTier,
  TierIdentifier, TierIdentifierCreate, TierIdentifierUpdate,
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

  // ── Identifiers (legal/fiscal IDs) ──
  listIdentifiers: async (tierId: string): Promise<TierIdentifier[]> => {
    const { data } = await api.get(`/api/v1/tiers/${tierId}/identifiers`)
    return data
  },

  createIdentifier: async (tierId: string, payload: TierIdentifierCreate): Promise<TierIdentifier> => {
    const { data } = await api.post(`/api/v1/tiers/${tierId}/identifiers`, payload)
    return data
  },

  updateIdentifier: async (tierId: string, identId: string, payload: TierIdentifierUpdate): Promise<TierIdentifier> => {
    const { data } = await api.patch(`/api/v1/tiers/${tierId}/identifiers/${identId}`, payload)
    return data
  },

  deleteIdentifier: async (tierId: string, identId: string): Promise<void> => {
    await api.delete(`/api/v1/tiers/${tierId}/identifiers/${identId}`)
  },
}
