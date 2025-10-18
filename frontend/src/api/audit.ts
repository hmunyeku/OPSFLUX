/**
 * API Client pour l'Audit Service
 */

import { apiClient } from './client'

export interface AuditLog {
  id: number
  timestamp: string
  level: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG'
  event_type: 'API' | 'AUTH' | 'CRUD' | 'SYSTEM'
  message: string
  source: string
  method?: string
  path?: string
  status_code?: number
  environment?: string
  error_details?: string
}

export interface AuditLogsResponse {
  data: AuditLog[]
  total: number
}

export interface AuditStats {
  levels: {
    INFO: number
    WARN: number
    ERROR: number
    DEBUG: number
  }
  event_types: {
    API: number
    AUTH: number
    CRUD: number
    SYSTEM: number
  }
}

export interface GetAuditLogsParams {
  skip?: number
  limit?: number
  level?: string
  event_type?: string
  search?: string
}

/**
 * Récupère les logs d'audit
 */
export async function getAuditLogs(params?: GetAuditLogsParams) {
  // Construire l'URL avec les query params
  const queryParams = new URLSearchParams()
  if (params?.skip !== undefined) queryParams.set('skip', params.skip.toString())
  if (params?.limit !== undefined) queryParams.set('limit', params.limit.toString())
  if (params?.level) queryParams.set('level', params.level)
  if (params?.event_type) queryParams.set('event_type', params.event_type)
  if (params?.search) queryParams.set('search', params.search)

  const url = `/audit/${queryParams.toString() ? `?${queryParams.toString()}` : ''}`
  const response = await apiClient.get<AuditLogsResponse>(url)
  return response.data
}

/**
 * Récupère les statistiques des logs d'audit
 */
export async function getAuditStats() {
  const response = await apiClient.get<AuditStats>('/audit/stats')
  return response.data
}
