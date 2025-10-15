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

export interface ApiKey {
  id: string
  name: string
  key_preview: string
  environment: string
  key_type: string
  is_active: boolean
  user_id: string
  created_at: string
}

export interface ApiKeyWithFullKey extends ApiKey {
  key: string
  message: string
}

export interface CreateApiKeyInput {
  name: string
  environment?: string
  key_type?: string
}

export interface UpdateApiKeyInput {
  name?: string
  is_active?: boolean
}

export async function getApiKeys(): Promise<ApiKey[]> {
  try {
    const response = await fetch(`${API_URL}/api/v1/api-keys/?skip=0&limit=1000`, {
      headers: getAuthHeaders(),
      cache: 'no-store',
    })

    if (!response.ok) {
      throw new Error(`Failed to fetch API keys: ${response.statusText}`)
    }

    const result = await response.json()
    return result.data || []
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Error fetching API keys:', error)
    return []
  }
}

export async function getApiKey(id: string): Promise<ApiKey | null> {
  try {
    const response = await fetch(`${API_URL}/api/v1/api-keys/${id}`, {
      headers: getAuthHeaders(),
      cache: 'no-store',
    })

    if (!response.ok) {
      throw new Error(`Failed to fetch API key: ${response.statusText}`)
    }

    return await response.json()
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Error fetching API key:', error)
    return null
  }
}

export async function createApiKey(input: CreateApiKeyInput): Promise<ApiKeyWithFullKey> {
  const response = await fetch(`${API_URL}/api/v1/api-keys/`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({
      name: input.name,
      environment: input.environment || 'production',
      key_type: input.key_type || 'secret',
    }),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.detail || 'Failed to create API key')
  }

  return await response.json()
}

export async function updateApiKey(id: string, input: UpdateApiKeyInput): Promise<ApiKey> {
  const response = await fetch(`${API_URL}/api/v1/api-keys/${id}`, {
    method: 'PATCH',
    headers: getAuthHeaders(),
    body: JSON.stringify(input),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.detail || 'Failed to update API key')
  }

  return await response.json()
}

export async function deleteApiKey(id: string): Promise<void> {
  const response = await fetch(`${API_URL}/api/v1/api-keys/${id}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.detail || 'Failed to delete API key')
  }
}

export async function toggleApiKeyActive(id: string, is_active: boolean): Promise<ApiKey> {
  return updateApiKey(id, { is_active })
}
