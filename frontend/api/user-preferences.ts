/**
 * API client for user preferences
 */

import { ApiClient } from '@/lib/api-client'

const apiClient = new ApiClient()

export interface UserPreference {
  id: string
  user_id: string
  module_id?: string | null
  preference_key: string
  preference_value: any
  preference_type: 'string' | 'number' | 'boolean' | 'json' | 'array'
  description?: string | null
}

export interface UserPreferencesResponse {
  data: UserPreference[]
  count: number
}

export interface BulkUpdatePreferences {
  preferences: Record<string, { value: any; type: string }>
  module_id?: string | null
}

export const UserPreferencesAPI = {
  /**
   * Get all preferences as a flat dictionary
   */
  async getAll(moduleId?: string | null): Promise<Record<string, { value: any; type: string }>> {
    const params = moduleId ? `?module_id=${moduleId}` : ''
    return apiClient.get(`/api/v1/user-preferences/all${params}`)
  },

  /**
   * Get paginated preferences
   */
  async list(params?: { skip?: number; limit?: number; module_id?: string }): Promise<UserPreferencesResponse> {
    const query = new URLSearchParams()
    if (params?.skip) query.append('skip', params.skip.toString())
    if (params?.limit) query.append('limit', params.limit.toString())
    if (params?.module_id) query.append('module_id', params.module_id)

    return apiClient.get(`/api/v1/user-preferences/?${query.toString()}`)
  },

  /**
   * Get a single preference by key
   */
  async get(key: string, moduleId?: string | null): Promise<UserPreference> {
    const params = moduleId ? `?module_id=${moduleId}` : ''
    return apiClient.get(`/api/v1/user-preferences/${key}${params}`)
  },

  /**
   * Create or update a preference (upsert)
   */
  async upsert(data: {
    preference_key: string
    preference_value: any
    preference_type: string
    description?: string
    module_id?: string | null
  }): Promise<UserPreference> {
    return apiClient.post('/api/v1/user-preferences/', data)
  },

  /**
   * Bulk update multiple preferences
   */
  async bulkUpdate(data: BulkUpdatePreferences): Promise<{ updated: number; created: number; total: number }> {
    return apiClient.post('/api/v1/user-preferences/bulk', data)
  },

  /**
   * Delete a preference
   */
  async delete(key: string, moduleId?: string | null): Promise<{ success: boolean; message: string }> {
    const params = moduleId ? `?module_id=${moduleId}` : ''
    return apiClient.delete(`/api/v1/user-preferences/${key}${params}`)
  },

  /**
   * Reset all preferences (or by module)
   */
  async reset(moduleId?: string | null): Promise<{ success: boolean; message: string; count: number }> {
    const params = moduleId ? `?module_id=${moduleId}` : ''
    return apiClient.post(`/api/v1/user-preferences/reset${params}`)
  },
}
