/**
 * API Client pour le File Storage Service
 */

import { apiClient } from './client'

export enum FileCategory {
  DOCUMENT = 'documents',
  IMAGE = 'images',
  VIDEO = 'videos',
  AUDIO = 'audio',
  ARCHIVE = 'archives',
  OTHER = 'other',
}

export interface FileInfo {
  path: string
  filename: string
  size: number
  mime_type: string
  category: FileCategory
  module: string
  user_id?: string
  thumbnail_path?: string
  checksum?: string
  url?: string
  uploaded_at: string
}

export interface UploadResponse {
  success: boolean
  file: FileInfo
}

/**
 * Upload un fichier
 */
export async function uploadFile(
  file: File,
  module: string,
  category?: FileCategory,
  generateThumbnail = true
) {
  const formData = new FormData()
  formData.append('file', file)

  const params = new URLSearchParams()
  params.append('module', module)
  if (category) params.append('category', category)
  params.append('generate_thumbnail', String(generateThumbnail))

  const response = await apiClient.post<UploadResponse>(
    `/storage/upload?${params.toString()}`,
    formData
    // Ne pas définir Content-Type manuellement pour multipart/form-data
    // Le navigateur le génère automatiquement avec le boundary correct
  )

  return response.data
}

/**
 * Télécharge un fichier
 */
export async function downloadFile(path: string) {
  const response = await apiClient.get(`/storage/files/${path}`, {
    responseType: 'blob',
  })
  return response.data
}

/**
 * Supprime un fichier
 */
export async function deleteFile(path: string) {
  const response = await apiClient.delete<{
    success: boolean
    message: string
  }>(`/storage/files/${path}`)
  return response.data
}

/**
 * Récupère les informations d'un fichier
 */
export async function getFileInfo(path: string) {
  const response = await apiClient.get<FileInfo>(`/storage/files/${path}/info`)
  return response.data
}

/**
 * Liste les fichiers avec filtres
 */
export async function listFiles(module?: string, category?: FileCategory) {
  const params: any = {}
  if (module) params.module = module
  if (category) params.category = category

  const response = await apiClient.get<{
    files: FileInfo[]
    count: number
  }>('/storage/list', { params })

  return response.data
}

/**
 * Récupère les statistiques de stockage
 */
export async function getStorageStats() {
  const response = await apiClient.get<{
    total_files: number
    total_size_mb: number
    by_module: Record<string, any>
    by_category: Record<string, any>
  }>('/storage/stats')

  return response.data
}

/**
 * Génère une URL pour un fichier
 */
export function getFileUrl(path: string): string {
  return `${apiClient.defaults.baseURL}/storage/files/${path}`
}
