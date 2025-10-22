/**
 * API Client pour le Database Service
 */

import { apiClient } from './client'

export interface DatabaseInfo {
  database_name: string
  server_host: string
  server_port: number
  total_tables: number
  database_size: string
  total_connections: number
  active_connections: number
  last_backup: string | null
  postgres_version: string
}

export interface DatabaseTable {
  schema: string
  name: string
  size: string
  row_count: number
}

export interface RecentActivity {
  pid: number
  user: string
  application: string
  client_address: string | null
  state: string
  query: string
  timestamp: string | null
}

export interface AdminerToken {
  token: string
  expires_at: string
  adminer_url: string
}

export interface BackupInfo {
  filename: string
  size: string
  created_at: string
  database_name: string
}

export interface BackupCreateRequest {
  include_schema?: boolean
  include_data?: boolean
  description?: string
}

/**
 * Récupère les informations de la base de données
 */
export async function getDatabaseInfo() {
  const response = await apiClient.get<DatabaseInfo>('/database/info')
  return response.data
}

/**
 * Récupère la liste des tables de la base de données
 */
export async function getDatabaseTables() {
  const response = await apiClient.get<{
    tables: DatabaseTable[]
    count: number
  }>('/database/tables')
  return response.data
}

/**
 * Récupère l'activité récente sur la base de données
 */
export async function getRecentActivity(params?: { limit?: number }) {
  const response = await apiClient.get<{
    activities: RecentActivity[]
    count: number
  }>('/database/recent-activity', { params })
  return response.data
}

/**
 * Crée un token temporaire pour accéder à Adminer
 */
export async function createAdminerToken() {
  const response = await apiClient.post<AdminerToken>('/database/adminer-token')
  return response.data
}

/**
 * Récupère la liste des sauvegardes
 */
export async function listBackups() {
  const response = await apiClient.get<{
    backups: BackupInfo[]
    count: number
  }>('/database/backups')
  return response.data
}

/**
 * Crée une nouvelle sauvegarde
 */
export async function createBackup(request?: BackupCreateRequest) {
  const response = await apiClient.post<BackupInfo>('/database/backups', request)
  return response.data
}

/**
 * Télécharge une sauvegarde
 */
export async function downloadBackup(filename: string) {
  const response = await apiClient.get(`/database/backups/${filename}`, {
    responseType: 'blob',
  })

  // Create download link
  const url = window.URL.createObjectURL(new Blob([response.data]))
  const link = document.createElement('a')
  link.href = url
  link.setAttribute('download', filename)
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.URL.revokeObjectURL(url)
}

/**
 * Supprime une sauvegarde
 */
export async function deleteBackup(filename: string) {
  const response = await apiClient.delete(`/database/backups/${filename}`)
  return response.data
}

export const DatabaseService = {
  getDatabaseInfo,
  getDatabaseTables,
  getRecentActivity,
  createAdminerToken,
  listBackups,
  createBackup,
  downloadBackup,
  deleteBackup,
}
