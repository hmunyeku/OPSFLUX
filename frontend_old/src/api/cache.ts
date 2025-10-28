/**
 * API Client pour le Cache Service
 */

import { apiClient } from './client'

export interface CacheStats {
  hits: number
  misses: number
  sets: number
  deletes: number
  total_requests: number
  hit_rate: number
  redis_hits?: number
  redis_misses?: number
}

export interface CacheHealth {
  healthy: boolean
  backend: string
}

/**
 * Récupère les statistiques du cache
 */
export async function getCacheStats() {
  const response = await apiClient.get<CacheStats>('/cache/stats')
  return response.data
}

/**
 * Vérifie la santé du cache (Redis)
 */
export async function getCacheHealth() {
  const response = await apiClient.get<CacheHealth>('/cache/health')
  return response.data
}

/**
 * Vide le cache (tout ou un namespace)
 */
export async function clearCache(namespace?: string) {
  const response = await apiClient.post<{
    success: boolean
    message: string
    keys_deleted: number
  }>('/cache/clear', { namespace })
  return response.data
}

/**
 * Récupère une valeur du cache (debug)
 */
export async function getCacheValue(key: string, namespace?: string) {
  const params = namespace ? { namespace } : {}
  const response = await apiClient.get<{
    key: string
    namespace?: string
    value: any
  }>(`/cache/get/${key}`, { params })
  return response.data
}

/**
 * Supprime une clé du cache (debug)
 */
export async function deleteCacheKey(key: string, namespace?: string) {
  const params = namespace ? { namespace } : {}
  const response = await apiClient.delete<{
    success: boolean
    key: string
    namespace?: string
  }>(`/cache/delete/${key}`, { params })
  return response.data
}
