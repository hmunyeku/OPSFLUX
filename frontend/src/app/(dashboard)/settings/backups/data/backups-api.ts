export interface Backup {
  id: string
  name: string
  description?: string
  backup_type: string
  status: "pending" | "in_progress" | "completed" | "failed"
  file_path?: string
  file_size?: number
  error_message?: string
  created_at: string
  completed_at?: string
  created_by_id?: string
  includes_database: boolean
  includes_storage: boolean
  includes_config: boolean
  database_size?: number
  storage_size?: number
  config_size?: number
}

export interface BackupsResponse {
  data: Backup[]
  count: number
}

export interface BackupCreate {
  name: string
  description?: string
  backup_type?: string
  includes_database?: boolean
  includes_storage?: boolean
  includes_config?: boolean
}

export interface BackupRestore {
  backup_id: string
  restore_database?: boolean
  restore_storage?: boolean
  restore_config?: boolean
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://api.opsflux.io'

function getAuthHeaders() {
  const token = localStorage.getItem('access_token')
  if (!token) {
    throw new Error('No access token found')
  }
  return {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  }
}

export async function getBackups(params?: {
  skip?: number
  limit?: number
}): Promise<BackupsResponse> {
  try {
    const queryParams = new URLSearchParams()
    if (params?.skip !== undefined) queryParams.append('skip', params.skip.toString())
    if (params?.limit !== undefined) queryParams.append('limit', params.limit.toString())

    const url = `${API_URL}/api/v1/backups/?${queryParams.toString()}`

    const response = await fetch(url, {
      headers: getAuthHeaders(),
      cache: 'no-store',
    })

    if (!response.ok) {
      throw new Error(`Failed to fetch backups: ${response.statusText}`)
    }

    const data = await response.json()
    return data
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Error fetching backups:', error)
    return { data: [], count: 0 }
  }
}

export async function getBackup(id: string): Promise<Backup | null> {
  try {
    const response = await fetch(`${API_URL}/api/v1/backups/${id}`, {
      headers: getAuthHeaders(),
      cache: 'no-store',
    })

    if (!response.ok) {
      throw new Error(`Failed to fetch backup: ${response.statusText}`)
    }

    const data = await response.json()
    return data
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Error fetching backup:', error)
    return null
  }
}

export async function createBackup(backup: BackupCreate): Promise<Backup | null> {
  try {
    const response = await fetch(`${API_URL}/api/v1/backups/`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(backup),
    })

    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(errorData.detail || `Failed to create backup: ${response.statusText}`)
    }

    const data = await response.json()
    return data
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Error creating backup:', error)
    throw error
  }
}

export async function downloadBackup(id: string): Promise<void> {
  try {
    const response = await fetch(`${API_URL}/api/v1/backups/${id}/download`, {
      headers: getAuthHeaders(),
    })

    if (!response.ok) {
      throw new Error(`Failed to download backup: ${response.statusText}`)
    }

    // Get filename from Content-Disposition header or use default
    const contentDisposition = response.headers.get('Content-Disposition')
    let filename = 'backup.tar.gz'
    if (contentDisposition) {
      const match = contentDisposition.match(/filename="?(.+)"?/)
      if (match) filename = match[1]
    }

    // Create blob and download
    const blob = await response.blob()
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    window.URL.revokeObjectURL(url)
    document.body.removeChild(a)
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Error downloading backup:', error)
    throw error
  }
}

export async function restoreBackup(id: string, options: BackupRestore): Promise<void> {
  try {
    const response = await fetch(`${API_URL}/api/v1/backups/${id}/restore`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(options),
    })

    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(errorData.detail || `Failed to restore backup: ${response.statusText}`)
    }

    const data = await response.json()
    return data
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Error restoring backup:', error)
    throw error
  }
}

export async function deleteBackup(id: string): Promise<void> {
  try {
    const response = await fetch(`${API_URL}/api/v1/backups/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    })

    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(errorData.detail || `Failed to delete backup: ${response.statusText}`)
    }
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Error deleting backup:', error)
    throw error
  }
}
