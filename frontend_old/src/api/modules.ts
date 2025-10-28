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

export interface ModulePermission {
  code: string
  name: string
  description?: string
  category?: string
}

export interface ModuleHook {
  name: string
  event: string
  description?: string
  is_active: boolean
  priority: number
  conditions?: Record<string, unknown>
  actions?: Array<Record<string, unknown>>
}

export interface ModuleDependency {
  code: string
  name: string
  min_version?: string
  is_optional: boolean
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
  // Manifest complet
  manifest?: {
    permissions?: ModulePermission[]
    menu_items?: ModuleMenuItem[]
    hooks?: ModuleHook[]
    translations?: Record<string, Record<string, string>>
    dependencies?: {
      core_services?: string[]
      modules?: ModuleDependency[]
    }
    settings?: Array<Record<string, unknown>>
    user_preferences?: Array<Record<string, unknown>>
  }
  // Alias pour accès direct (calculés depuis manifest)
  permissions?: ModulePermission[]
  menu_items?: ModuleMenuItem[]
  hooks?: ModuleHook[]
  translations?: Record<string, Record<string, string>>
  dependencies?: {
    core_services?: string[]
    modules?: ModuleDependency[]
  }
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

export async function getModuleDetails(moduleId: string): Promise<Module> {
  const response = await fetch(`${API_URL}/api/v1/modules/${moduleId}`, {
    headers: getAuthHeaders(),
    cache: 'no-store',
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.detail || 'Failed to fetch module details')
  }

  return response.json()
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

export interface ModuleMenuItem {
  id: string
  label: string
  route: string
  icon?: string
  permission?: string
  order: number
  badge_source?: string
}

export interface ModuleMenuGroup {
  module_code: string
  module_name: string
  module_icon?: string
  module_color?: string
  menu_items: ModuleMenuItem[]
}

export interface ModuleMenusResponse {
  data: ModuleMenuGroup[]
  count: number
}

export async function getModuleMenus(): Promise<ModuleMenusResponse> {
  try {
    const response = await fetch(`${API_URL}/api/v1/modules/menus`, {
      headers: getAuthHeaders(),
      cache: 'no-store',
    })

    if (!response.ok) {
      throw new Error(`Failed to fetch module menus: ${response.statusText}`)
    }

    return response.json()
  } catch (_error) {
    // Error fetching menus - return empty response
    return { data: [], count: 0 }
  }
}
