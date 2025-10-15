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

export interface Webhook {
  id: string
  url: string
  name: string
  description?: string
  authType: string
  status: string
  events?: string[]
  user_id: string
  created_at: string
  updated_at: string
}

export interface WebhookLog {
  id: string
  webhook_id: string
  action: string
  succeeded: boolean
  status_code?: number
  response_body?: string
  error_message?: string
  created_at: string
}

export interface CreateWebhookInput {
  url: string
  name: string
  description?: string
  auth_type?: string
  status?: string
  events?: string[]
}

export interface UpdateWebhookInput {
  url?: string
  name?: string
  description?: string
  auth_type?: string
  status?: string
  events?: string[]
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapWebhookFromBackend(webhook: any): Webhook {
  return {
    id: webhook.id,
    url: webhook.url,
    name: webhook.name,
    description: webhook.description,
    authType: webhook.auth_type,
    status: webhook.status,
    events: webhook.events || [],
    user_id: webhook.user_id,
    created_at: webhook.created_at,
    updated_at: webhook.updated_at,
  }
}

export async function getWebhooks(): Promise<Webhook[]> {
  try {
    const response = await fetch(`${API_URL}/api/v1/webhooks/?skip=0&limit=1000`, {
      headers: getAuthHeaders(),
      cache: 'no-store',
    })

    if (!response.ok) {
      throw new Error(`Failed to fetch webhooks: ${response.statusText}`)
    }

    const result = await response.json()
    return (result.data || []).map(mapWebhookFromBackend)
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Error fetching webhooks:', error)
    return []
  }
}

export async function getWebhook(id: string): Promise<Webhook | null> {
  try {
    const response = await fetch(`${API_URL}/api/v1/webhooks/${id}`, {
      headers: getAuthHeaders(),
      cache: 'no-store',
    })

    if (!response.ok) {
      throw new Error(`Failed to fetch webhook: ${response.statusText}`)
    }

    const webhook = await response.json()
    return mapWebhookFromBackend(webhook)
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Error fetching webhook:', error)
    return null
  }
}

export async function createWebhook(input: CreateWebhookInput): Promise<Webhook> {
  const response = await fetch(`${API_URL}/api/v1/webhooks/`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({
      url: input.url,
      name: input.name,
      description: input.description,
      auth_type: input.auth_type || 'none',
      status: input.status || 'enabled',
      events: input.events || [],
    }),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.detail || 'Failed to create webhook')
  }

  const webhook = await response.json()
  return mapWebhookFromBackend(webhook)
}

export async function updateWebhook(id: string, input: UpdateWebhookInput): Promise<Webhook> {
  const response = await fetch(`${API_URL}/api/v1/webhooks/${id}`, {
    method: 'PATCH',
    headers: getAuthHeaders(),
    body: JSON.stringify({
      url: input.url,
      name: input.name,
      description: input.description,
      auth_type: input.auth_type,
      status: input.status,
      events: input.events,
    }),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.detail || 'Failed to update webhook')
  }

  const webhook = await response.json()
  return mapWebhookFromBackend(webhook)
}

export async function deleteWebhook(id: string): Promise<void> {
  const response = await fetch(`${API_URL}/api/v1/webhooks/${id}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.detail || 'Failed to delete webhook')
  }
}

export async function toggleWebhookStatus(id: string, status: string): Promise<Webhook> {
  return updateWebhook(id, { status })
}

export async function getWebhookLogs(id: string): Promise<WebhookLog[]> {
  try {
    const response = await fetch(`${API_URL}/api/v1/webhooks/${id}/logs`, {
      headers: getAuthHeaders(),
      cache: 'no-store',
    })

    if (!response.ok) {
      throw new Error(`Failed to fetch webhook logs: ${response.statusText}`)
    }

    const result = await response.json()
    return result.data || []
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Error fetching webhook logs:', error)
    return []
  }
}
