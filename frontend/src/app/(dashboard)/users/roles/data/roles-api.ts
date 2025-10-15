import { Role } from "./schema"

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

export async function getRoles(includePermissions = true): Promise<Role[]> {
  try {
    const response = await fetch(
      `${API_URL}/api/v1/roles/?skip=0&limit=1000&include_permissions=${includePermissions}`,
      {
        headers: getAuthHeaders(),
        cache: 'no-store',
      }
    )

    if (!response.ok) {
      throw new Error(`Failed to fetch roles: ${response.statusText}`)
    }

    const data = await response.json()
    return data.data || []
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Error fetching roles:', error)
    return []
  }
}

export async function getRole(id: string, includePermissions = true): Promise<Role | null> {
  try {
    const response = await fetch(
      `${API_URL}/api/v1/roles/${id}?include_permissions=${includePermissions}`,
      {
        headers: getAuthHeaders(),
        cache: 'no-store',
      }
    )

    if (!response.ok) {
      throw new Error(`Failed to fetch role: ${response.statusText}`)
    }

    return await response.json()
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Error fetching role:', error)
    return null
  }
}

export interface CreateRoleInput {
  code: string
  name: string
  description?: string
  is_system?: boolean
  is_active?: boolean
  priority?: number
  permission_ids?: string[]
}

export async function createRole(input: CreateRoleInput): Promise<Role> {
  const response = await fetch(`${API_URL}/api/v1/roles/`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(input),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.detail || 'Failed to create role')
  }

  return await response.json()
}

export interface UpdateRoleInput {
  code?: string
  name?: string
  description?: string
  is_system?: boolean
  is_active?: boolean
  priority?: number
  permission_ids?: string[]
}

export async function updateRole(id: string, input: UpdateRoleInput): Promise<Role> {
  const response = await fetch(`${API_URL}/api/v1/roles/${id}`, {
    method: 'PATCH',
    headers: getAuthHeaders(),
    body: JSON.stringify(input),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.detail || 'Failed to update role')
  }

  return await response.json()
}

export async function deleteRole(id: string): Promise<void> {
  const response = await fetch(`${API_URL}/api/v1/roles/${id}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.detail || 'Failed to delete role')
  }
}

export async function toggleRoleActive(id: string, is_active: boolean): Promise<Role> {
  return updateRole(id, { is_active })
}
