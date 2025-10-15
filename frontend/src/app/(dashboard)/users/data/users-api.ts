import { User } from "./schema"

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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapUserFromBackend(user: any): User {
  return {
    id: user.id,
    firstName: user.first_name || '',
    lastName: user.last_name || '',
    email: user.email,
    phoneNumber: user.phone_numbers?.[0] || '',
    status: user.is_active ? 'active' : 'inactive',
    role: user.is_superuser ? 'superadmin' : 'admin',
    createdAt: user.created_at ? new Date(user.created_at) : new Date(),
    lastLoginAt: user.updated_at ? new Date(user.updated_at) : new Date(),
    updatedAt: user.updated_at ? new Date(user.updated_at) : new Date(),
  }
}

export async function getUsers(): Promise<User[]> {
  try {
    const response = await fetch(`${API_URL}/api/v1/users/?skip=0&limit=1000`, {
      headers: getAuthHeaders(),
      cache: 'no-store',
    })

    if (!response.ok) {
      throw new Error(`Failed to fetch users: ${response.statusText}`)
    }

    const data = await response.json()
    return (data.data || []).map(mapUserFromBackend)
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Error fetching users:', error)
    return []
  }
}

export async function getUser(id: string): Promise<User | null> {
  try {
    const response = await fetch(`${API_URL}/api/v1/users/${id}`, {
      headers: getAuthHeaders(),
      cache: 'no-store',
    })

    if (!response.ok) {
      throw new Error(`Failed to fetch user: ${response.statusText}`)
    }

    const user = await response.json()
    return mapUserFromBackend(user)
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Error fetching user:', error)
    return null
  }
}

export interface CreateUserInput {
  email: string
  password: string
  first_name?: string
  last_name?: string
  full_name?: string
  is_active?: boolean
  is_superuser?: boolean
  phone_numbers?: string[]
}

export async function createUser(input: CreateUserInput): Promise<User> {
  const response = await fetch(`${API_URL}/api/v1/users/`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(input),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.detail || 'Failed to create user')
  }

  const user = await response.json()
  return mapUserFromBackend(user)
}

export interface UpdateUserInput {
  email?: string
  first_name?: string
  last_name?: string
  full_name?: string
  is_active?: boolean
  is_superuser?: boolean
  phone_numbers?: string[]
}

export async function updateUser(id: string, input: UpdateUserInput): Promise<User> {
  const response = await fetch(`${API_URL}/api/v1/users/${id}`, {
    method: 'PATCH',
    headers: getAuthHeaders(),
    body: JSON.stringify(input),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.detail || 'Failed to update user')
  }

  const user = await response.json()
  return mapUserFromBackend(user)
}

export async function deleteUser(id: string): Promise<void> {
  const response = await fetch(`${API_URL}/api/v1/users/${id}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.detail || 'Failed to delete user')
  }
}

export async function toggleUserActive(id: string, is_active: boolean): Promise<User> {
  return updateUser(id, { is_active })
}
