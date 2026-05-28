/**
 * Tiers (companies) API service — companies + contacts + identifiers + blocks + refs.
 */
import api from '@/lib/api'
import type {
  Tier, TierCreate,
  TierContact, TierContactCreate, TierContactPromoteUserRequest, TierContactUpdate, TierContactWithTier,
  TierBlock, TierBlockCreate,
  ExternalReference, ExternalReferenceCreate,
  PaginatedResponse, PaginationParams, UserRead,
} from '@/types/api'

export interface AuditLogFilters {
  actions?: string[]
  since?: string  // ISO datetime
  until?: string  // ISO datetime
}

export interface TierAuditEvent {
  id: string
  action: string
  resource_type: string
  user_id: string | null
  user_name: string | null
  details: Record<string, unknown> | null
  ip_address: string | null
  created_at: string
}

interface TierListParams extends PaginationParams {
  type?: string
  search?: string
  active?: boolean
  country?: string
  legal_form?: string
  industry?: string
  registration_number?: string
  city?: string
  is_blocked?: boolean
  is_authorization_center?: boolean
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

  bulkArchive: async (ids: string[]): Promise<{ archived: number; skipped: Array<{ id: string; reason: 'not_found' | 'forbidden' | 'already_archived' }> }> => {
    const { data } = await api.post('/api/v1/tiers/bulk-archive', { ids })
    return data
  },

  listAuditLog: async (tierId: string, limit = 50, filters: AuditLogFilters = {}): Promise<TierAuditEvent[]> => {
    // axios serialise un array `actions` en plusieurs `?actions=...` params
    // grace au `paramsSerializer` par defaut (style indices/repeat).
    // FastAPI Query(default=None) recoit la liste correctement.
    const params: Record<string, unknown> = { limit }
    if (filters.actions?.length) params.actions = filters.actions
    if (filters.since) params.since = filters.since
    if (filters.until) params.until = filters.until
    const { data } = await api.get(`/api/v1/tiers/${tierId}/audit-log`, { params })
    return data
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

  getGlobalContact: async (contactId: string): Promise<TierContactWithTier> => {
    const { data } = await api.get(`/api/v1/tiers/contacts/all/${contactId}`)
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

  promoteContactToUser: async (
    tierId: string,
    contactId: string,
    payload: TierContactPromoteUserRequest = {},
  ): Promise<UserRead> => {
    const { data } = await api.post(`/api/v1/tiers/${tierId}/contacts/${contactId}/promote-user`, payload)
    return data
  },

  deleteContact: async (tierId: string, contactId: string): Promise<void> => {
    await api.delete(`/api/v1/tiers/${tierId}/contacts/${contactId}`)
  },

  // ── All contacts (cross-company) ──
  listAllContacts: async (params: PaginationParams & {
    search?: string
    tier_id?: string
    tier?: string
    department?: string
    position?: string
    job_position?: string
    email?: string
    phone?: string
    is_primary?: boolean
    linked_user?: boolean
  } = {}): Promise<PaginatedResponse<TierContactWithTier>> => {
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
}
