/**
 * API Client pour la gestion des clés API utilisateur
 */

import { apiClient } from './client'

export interface UserApiKey {
  id: string
  name: string
  key_prefix: string
  created_at: string
  last_used_at: string | null
  expires_at: string | null
  is_active: boolean
}

export interface UserApiKeyResponse {
  id: string
  name: string
  key: string // Clé complète retournée UNE SEULE FOIS
  key_prefix: string
  created_at: string
  expires_at: string | null
}

/**
 * Générer une nouvelle clé API
 */
export async function generateApiKey(name: string = 'My API Key') {
  const response = await apiClient.post<UserApiKeyResponse>('/users/me/api-key', { name })
  return response.data
}

/**
 * Récupérer la clé actuelle (sans le secret)
 */
export async function getCurrentApiKey() {
  try {
    const response = await apiClient.get<UserApiKey>('/users/me/api-key')
    return response.data
  } catch (error: any) {
    if (error.message.includes('404')) {
      return null
    }
    throw error
  }
}

/**
 * Révoquer la clé API
 */
export async function revokeApiKey() {
  const response = await apiClient.delete<{ message: string }>('/users/me/api-key')
  return response.data
}

/**
 * Régénérer la clé API
 */
export async function regenerateApiKey() {
  const response = await apiClient.put<UserApiKeyResponse>('/users/me/api-key/regenerate')
  return response.data
}
