import { Group } from "./schema"

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

export async function getGroups(
  includePermissions = true,
  parentId?: string | null
): Promise<Group[]> {
  try {
    let url = `${API_URL}/api/v1/groups/?skip=0&limit=1000&include_permissions=${includePermissions}`

    if (parentId !== undefined) {
      url += `&parent_id=${parentId || ''}`
    }

    const response = await fetch(url, {
      headers: getAuthHeaders(),
      cache: 'no-store',
    })

    if (!response.ok) {
      throw new Error(`Failed to fetch groups: ${response.statusText}`)
    }

    const data = await response.json()
    return data.data || []
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Error fetching groups:', error)
    return []
  }
}

export async function getGroup(id: string, includePermissions = true): Promise<Group | null> {
  try {
    const response = await fetch(
      `${API_URL}/api/v1/groups/${id}?include_permissions=${includePermissions}`,
      {
        headers: getAuthHeaders(),
        cache: 'no-store',
      }
    )

    if (!response.ok) {
      throw new Error(`Failed to fetch group: ${response.statusText}`)
    }

    return await response.json()
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Error fetching group:', error)
    return null
  }
}

export interface CreateGroupInput {
  code: string
  name: string
  description?: string
  parent_id?: string | null
  is_active?: boolean
  permission_ids?: string[]
}

export async function createGroup(input: CreateGroupInput): Promise<Group> {
  const response = await fetch(`${API_URL}/api/v1/groups/`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(input),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.detail || 'Failed to create group')
  }

  return await response.json()
}

export interface UpdateGroupInput {
  code?: string
  name?: string
  description?: string
  parent_id?: string | null
  is_active?: boolean
  permission_ids?: string[]
}

export async function updateGroup(id: string, input: UpdateGroupInput): Promise<Group> {
  const response = await fetch(`${API_URL}/api/v1/groups/${id}`, {
    method: 'PATCH',
    headers: getAuthHeaders(),
    body: JSON.stringify(input),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.detail || 'Failed to update group')
  }

  return await response.json()
}

export async function deleteGroup(id: string): Promise<void> {
  const response = await fetch(`${API_URL}/api/v1/groups/${id}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.detail || 'Failed to delete group')
  }
}

export async function toggleGroupActive(id: string, is_active: boolean): Promise<Group> {
  return updateGroup(id, { is_active })
}
