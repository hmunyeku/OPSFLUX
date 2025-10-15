import { Permission } from "./schema"

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

export async function getPermissions(): Promise<Permission[]> {
  try {
    const response = await fetch(
      `${API_URL}/api/v1/permissions/?skip=0&limit=1000`,
      {
        headers: getAuthHeaders(),
        cache: 'no-store',
      }
    )

    if (!response.ok) {
      throw new Error(`Failed to fetch permissions: ${response.statusText}`)
    }

    const data = await response.json()
    return data.data || []
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Error fetching permissions:', error)
    return []
  }
}

export interface CreatePermissionInput {
  code: string
  name: string
  description?: string
  module: string
  is_default?: boolean
  is_active?: boolean
}

export async function createPermission(input: CreatePermissionInput): Promise<Permission> {
  const response = await fetch(`${API_URL}/api/v1/permissions/`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(input),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.detail || 'Failed to create permission')
  }

  return await response.json()
}

export interface UpdatePermissionInput {
  code?: string
  name?: string
  description?: string
  module?: string
  is_default?: boolean
  is_active?: boolean
}

export async function updatePermission(id: string, input: UpdatePermissionInput): Promise<Permission> {
  const response = await fetch(`${API_URL}/api/v1/permissions/${id}`, {
    method: 'PATCH',
    headers: getAuthHeaders(),
    body: JSON.stringify(input),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.detail || 'Failed to update permission')
  }

  return await response.json()
}

export async function deletePermission(id: string): Promise<void> {
  const response = await fetch(`${API_URL}/api/v1/permissions/${id}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.detail || 'Failed to delete permission')
  }
}
