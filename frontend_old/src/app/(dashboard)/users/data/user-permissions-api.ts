import { Permission } from "../permissions/data/schema"

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

export type PermissionSource = 'default' | 'role' | 'group' | 'personal'

export interface UserPermissionWithSource {
  permission: Permission
  source: PermissionSource
  source_name: string | null
}

export interface UserPermissionsWithSources {
  data: UserPermissionWithSource[]
  count: number
}

export async function getUserPermissions(userId: string): Promise<UserPermissionsWithSources> {
  try {
    const response = await fetch(`${API_URL}/api/v1/user-permissions/${userId}`, {
      headers: getAuthHeaders(),
      cache: 'no-store',
    })

    if (!response.ok) {
      throw new Error(`Failed to fetch user permissions: ${response.statusText}`)
    }

    return await response.json()
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Error fetching user permissions:', error)
    throw error
  }
}

export async function getMyPermissions(): Promise<UserPermissionsWithSources> {
  try {
    const response = await fetch(`${API_URL}/api/v1/user-permissions/me`, {
      headers: getAuthHeaders(),
      cache: 'no-store',
    })

    if (!response.ok) {
      throw new Error(`Failed to fetch my permissions: ${response.statusText}`)
    }

    return await response.json()
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Error fetching my permissions:', error)
    throw error
  }
}
