/**
 * Entity API service — entity listing, switching, and CRUD management.
 */
import api from '@/lib/api'
import type { PaginatedResponse, PaginationParams } from '@/types/api'

export interface EntityBrief {
  id: string
  code: string
  name: string
  country: string | null
  timezone: string
  logo_url: string | null
}

export interface EntityRead {
  id: string
  code: string
  name: string
  trade_name: string | null
  logo_url: string | null
  parent_id: string | null
  // Legal
  legal_form: string | null
  registration_number: string | null
  tax_id: string | null
  vat_number: string | null
  capital: number | null
  currency: string
  fiscal_year_start: number
  industry: string | null
  founded_date: string | null
  // Address
  address_line1: string | null
  address_line2: string | null
  city: string | null
  state: string | null
  zip_code: string | null
  country: string | null
  // Contact
  phone: string | null
  fax: string | null
  email: string | null
  website: string | null
  // Config
  timezone: string
  language: string
  active: boolean
  // Extended
  social_networks: Record<string, string> | null
  opening_hours: Record<string, { open: string; close: string }> | null
  notes: string | null
  // Computed
  created_at: string | null
  updated_at: string | null
  user_count: number
}

export interface EntityDetail extends EntityRead {
  parent_name: string | null
  children_count: number
}

export interface EntityCreate {
  code: string
  name: string
  trade_name?: string | null
  parent_id?: string | null
  // Legal
  legal_form?: string | null
  registration_number?: string | null
  tax_id?: string | null
  vat_number?: string | null
  capital?: number | null
  currency?: string
  fiscal_year_start?: number
  industry?: string | null
  founded_date?: string | null
  // Address
  address_line1?: string | null
  address_line2?: string | null
  city?: string | null
  state?: string | null
  zip_code?: string | null
  country?: string | null
  // Contact
  phone?: string | null
  fax?: string | null
  email?: string | null
  website?: string | null
  // Config
  timezone?: string
  language?: string
  active?: boolean
  // Extended
  social_networks?: Record<string, string> | null
  opening_hours?: Record<string, { open: string; close: string }> | null
  notes?: string | null
}

export interface EntityUpdate extends Partial<EntityCreate> {
  logo_url?: string | null
}

export interface EntityUser {
  user_id: string
  first_name: string
  last_name: string
  email: string
  active: boolean
  avatar_url: string | null
  group_names: string[]
}

export interface EntityListParams extends PaginationParams {
  search?: string
  active?: boolean
}

export const entityService = {
  getMyEntities: async (): Promise<EntityBrief[]> => {
    const { data } = await api.get('/api/v1/auth/me/entities')
    return data
  },

  switchEntity: async (entityId: string): Promise<void> => {
    await api.patch('/api/v1/auth/me/entity', { entity_id: entityId })
  },

  listEntities: async (params?: EntityListParams): Promise<PaginatedResponse<EntityRead>> => {
    const { data } = await api.get('/api/v1/entities', { params })
    return data
  },

  createEntity: async (payload: EntityCreate): Promise<EntityRead> => {
    const { data } = await api.post('/api/v1/entities', payload)
    return data
  },

  getEntity: async (id: string): Promise<EntityDetail> => {
    const { data } = await api.get(`/api/v1/entities/${id}`)
    return data
  },

  updateEntity: async (id: string, payload: EntityUpdate): Promise<EntityRead> => {
    const { data } = await api.patch(`/api/v1/entities/${id}`, payload)
    return data
  },

  deleteEntity: async (id: string): Promise<{ detail: string }> => {
    const { data } = await api.delete(`/api/v1/entities/${id}`)
    return data
  },

  getEntityUsers: async (id: string): Promise<EntityUser[]> => {
    const { data } = await api.get(`/api/v1/entities/${id}/users`)
    return data
  },

  addEntityUser: async (id: string, userId: string): Promise<{ detail: string }> => {
    const { data } = await api.post(`/api/v1/entities/${id}/users`, { user_id: userId })
    return data
  },

  removeEntityUser: async (id: string, userId: string): Promise<void> => {
    await api.delete(`/api/v1/entities/${id}/users/${userId}`)
  },
}
