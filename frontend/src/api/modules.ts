const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

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

export interface Module {
  id: string
  name: string
  code: string
  version: string
  description: string
  category: string
  status: "active" | "inactive" | "installed" | "error" | "ACTIVE" | "INACTIVE" | "INSTALLED" | "ERROR"
  author?: string
  icon?: string
  icon_url?: string
  color?: string
  slug?: string
  installed_at?: string
  activated_at?: string
  is_system?: boolean
  is_required?: boolean
  requires_license?: boolean
  created_at?: string
  updated_at?: string
}

export interface ModulesResponse {
  data: Module[]
  count: number
}

export interface ModuleInstallResponse {
  success: boolean
  message: string
  module?: Module
  errors?: string[]
}

export async function getModules(): Promise<ModulesResponse> {
  try {
    const response = await fetch(`${API_URL}/api/v1/modules/`, {
      headers: getAuthHeaders(),
      cache: 'no-store',
    })

    if (!response.ok) {
      throw new Error(`Failed to fetch modules: ${response.statusText}`)
    }

    return response.json()
  } catch (_error) {
    // Error fetching modules - return empty response
    return { data: [], count: 0 }
  }
}

export async function activateModule(moduleId: string): Promise<Module> {
  const response = await fetch(`${API_URL}/api/v1/modules/${moduleId}/activate`, {
    method: 'POST',
    headers: getAuthHeaders(),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.detail || 'Failed to activate module')
  }

  return response.json()
}

export async function deactivateModule(moduleId: string): Promise<Module> {
  const response = await fetch(`${API_URL}/api/v1/modules/${moduleId}/deactivate`, {
    method: 'POST',
    headers: getAuthHeaders(),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.detail || 'Failed to deactivate module')
  }

  return response.json()
}

export async function installModule(file: File): Promise<ModuleInstallResponse> {
  const formData = new FormData()
  formData.append('file', file)

  const token = localStorage.getItem('access_token')
  if (!token) {
    throw new Error('No access token found')
  }

  const response = await fetch(`${API_URL}/api/v1/modules/install`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      // Don't set Content-Type for FormData - browser will set it with boundary
    },
    body: formData,
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.detail || 'Failed to install module')
  }

  return response.json()
}

export async function uninstallModule(moduleId: string): Promise<void> {
  const response = await fetch(`${API_URL}/api/v1/modules/${moduleId}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.detail || 'Failed to uninstall module')
  }
}
