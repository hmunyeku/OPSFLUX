/**
 * API Client pour les préférences utilisateur
 */

import { apiClient } from './client'

export interface UserPreference {
  id: string
  user_id: string
  module_id?: string | null
  preference_key: string
  preference_value: Record<string, unknown>
  preference_type: string
  description?: string | null
  created_at: string
  updated_at?: string | null
}

export interface UserPreferencesResponse {
  data: UserPreference[]
  count: number
}

export interface UserPreferenceCreate {
  module_id?: string | null
  preference_key: string
  preference_value: Record<string, unknown>
  preference_type: string
  description?: string | null
}

export interface UserPreferenceBulkUpdate {
  preferences: Record<string, { value: unknown; type: string }>
  module_id?: string | null
}

export interface BulkUpdateResponse {
  updated: number
  created: number
  total: number
}

/**
 * Récupère toutes les préférences sous forme de dictionnaire
 * Format: {preference_key: {value, type}}
 */
export async function getAllUserPreferences(
  moduleId?: string | null
): Promise<Record<string, { value: unknown; type: string }>> {
  const params = moduleId ? `?module_id=${moduleId}` : ''
  const { data } = await apiClient.get<Record<string, { value: unknown; type: string }>>(
    `/user-preferences/all${params}`
  )
  return data
}

/**
 * Récupère les préférences avec pagination
 */
export async function getUserPreferences(
  skip = 0,
  limit = 100,
  moduleId?: string | null
): Promise<UserPreferencesResponse> {
  let params = `?skip=${skip}&limit=${limit}`
  if (moduleId) {
    params += `&module_id=${moduleId}`
  }
  const { data } = await apiClient.get<UserPreferencesResponse>(`/user-preferences/${params}`)
  return data
}

/**
 * Récupère une préférence spécifique
 */
export async function getUserPreference(
  preferenceKey: string,
  moduleId?: string | null
): Promise<UserPreference> {
  const params = moduleId ? `?module_id=${moduleId}` : ''
  const { data } = await apiClient.get<UserPreference>(
    `/user-preferences/${preferenceKey}${params}`
  )
  return data
}

/**
 * Crée ou met à jour une préférence (upsert)
 */
export async function createUserPreference(
  preference: UserPreferenceCreate
): Promise<UserPreference> {
  const { data } = await apiClient.post<UserPreference>('/user-preferences/', preference)
  return data
}

/**
 * Met à jour plusieurs préférences en une seule requête (bulk upsert)
 */
export async function bulkUpdateUserPreferences(
  bulkUpdate: UserPreferenceBulkUpdate
): Promise<BulkUpdateResponse> {
  const { data } = await apiClient.post<BulkUpdateResponse>(
    '/user-preferences/bulk',
    bulkUpdate
  )
  return data
}

/**
 * Supprime une préférence (soft delete)
 */
export async function deleteUserPreference(
  preferenceKey: string,
  moduleId?: string | null
): Promise<{ success: boolean; message: string }> {
  const params = moduleId ? `?module_id=${moduleId}` : ''
  const { data } = await apiClient.delete<{ success: boolean; message: string }>(
    `/user-preferences/${preferenceKey}${params}`
  )
  return data
}

/**
 * Réinitialise toutes les préférences (soft delete)
 */
export async function resetUserPreferences(
  moduleId?: string | null
): Promise<{ success: boolean; message: string; count: number }> {
  const params = moduleId ? `?module_id=${moduleId}` : ''
  const { data } = await apiClient.post<{ success: boolean; message: string; count: number }>(
    `/user-preferences/reset${params}`
  )
  return data
}
