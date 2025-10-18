/**
 * API Client simple pour les services CORE
 */

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

interface ApiResponse<T> {
  data: T
  status: number
}

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> {
  const url = `${API_URL}/api/v1${path}`

  const response = await fetch(url, {
    ...options,
    headers: {
      ...getAuthHeaders(),
      ...options.headers,
    },
    cache: 'no-store',
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: response.statusText }))
    throw new Error(error.detail || `HTTP Error: ${response.status}`)
  }

  const data = await response.json()
  return {
    data,
    status: response.status,
  }
}

export const apiClient = {
  async get<T>(path: string, options?: RequestInit): Promise<ApiResponse<T>> {
    return request<T>(path, { ...options, method: 'GET' })
  },

  async post<T>(path: string, body?: unknown, options?: RequestInit): Promise<ApiResponse<T>> {
    return request<T>(path, {
      ...options,
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
    })
  },

  async put<T>(path: string, body?: unknown, options?: RequestInit): Promise<ApiResponse<T>> {
    return request<T>(path, {
      ...options,
      method: 'PUT',
      body: body ? JSON.stringify(body) : undefined,
    })
  },

  async patch<T>(path: string, body?: unknown, options?: RequestInit): Promise<ApiResponse<T>> {
    return request<T>(path, {
      ...options,
      method: 'PATCH',
      body: body ? JSON.stringify(body) : undefined,
    })
  },

  async delete<T>(path: string, options?: RequestInit): Promise<ApiResponse<T>> {
    return request<T>(path, { ...options, method: 'DELETE' })
  },
}
