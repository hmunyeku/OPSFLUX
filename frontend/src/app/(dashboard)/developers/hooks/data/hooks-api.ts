import type { Hook, HookExecution } from "./schema"

export type { Hook, HookExecution }

const API_URL = process.env.NEXT_PUBLIC_API_URL || "https://api.opsflux.io"

function getAuthHeaders() {
  const token = localStorage.getItem("access_token")
  if (!token) {
    throw new Error("No access token found")
  }
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  }
}

// Récupérer tous les hooks
export async function getHooks(params?: {
  event?: string
  is_active?: boolean
}): Promise<Hook[]> {
  const queryParams = new URLSearchParams()
  if (params?.event) queryParams.append("event", params.event)
  if (params?.is_active !== undefined) queryParams.append("is_active", String(params.is_active))

  const url = `${API_URL}/api/v1/hooks/?${queryParams.toString()}`

  const response = await fetch(url, {
    headers: getAuthHeaders(),
    cache: "no-store",
  })

  if (!response.ok) {
    throw new Error(`Failed to fetch hooks: ${response.statusText}`)
  }

  const result = await response.json()
  return result.data || []
}

// Récupérer un hook par ID
export async function getHook(id: string): Promise<Hook> {
  const response = await fetch(`${API_URL}/api/v1/hooks/${id}`, {
    headers: getAuthHeaders(),
    cache: "no-store",
  })

  if (!response.ok) {
    throw new Error(`Failed to fetch hook: ${response.statusText}`)
  }

  return response.json()
}

// Créer un nouveau hook
export async function createHook(data: {
  name: string
  event: string
  is_active?: boolean
  priority?: number
  description?: string
  conditions?: Record<string, unknown> | null
  actions: Array<{
    type: string
    config: Record<string, unknown>
  }>
}): Promise<Hook> {
  const response = await fetch(`${API_URL}/api/v1/hooks/`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify(data),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.detail || "Failed to create hook")
  }

  return response.json()
}

// Mettre à jour un hook
export async function updateHook(
  id: string,
  data: Partial<{
    name: string
    event: string
    is_active: boolean
    priority: number
    description: string
    conditions: Record<string, unknown> | null
    actions: Array<{
      type: string
      config: Record<string, unknown>
    }>
  }>
): Promise<Hook> {
  const response = await fetch(`${API_URL}/api/v1/hooks/${id}`, {
    method: "PATCH",
    headers: getAuthHeaders(),
    body: JSON.stringify(data),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.detail || "Failed to update hook")
  }

  return response.json()
}

// Supprimer un hook
export async function deleteHook(id: string): Promise<void> {
  const response = await fetch(`${API_URL}/api/v1/hooks/${id}`, {
    method: "DELETE",
    headers: getAuthHeaders(),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.detail || "Failed to delete hook")
  }
}

// Récupérer l'historique d'exécution d'un hook
export async function getHookExecutions(
  hookId: string,
  params?: {
    success?: boolean
    skip?: number
    limit?: number
  }
): Promise<HookExecution[]> {
  const queryParams = new URLSearchParams()
  if (params?.success !== undefined) queryParams.append("success", String(params.success))
  if (params?.skip !== undefined) queryParams.append("skip", String(params.skip))
  if (params?.limit !== undefined) queryParams.append("limit", String(params.limit))

  const url = `${API_URL}/api/v1/hooks/${hookId}/executions/?${queryParams.toString()}`

  const response = await fetch(url, {
    headers: getAuthHeaders(),
    cache: "no-store",
  })

  if (!response.ok) {
    throw new Error(`Failed to fetch hook executions: ${response.statusText}`)
  }

  const result = await response.json()
  return result.data || []
}

// Récupérer l'historique d'exécution de tous les hooks
export async function getAllExecutions(params?: {
  success?: boolean
  skip?: number
  limit?: number
}): Promise<HookExecution[]> {
  const queryParams = new URLSearchParams()
  if (params?.success !== undefined) queryParams.append("success", String(params.success))
  if (params?.skip !== undefined) queryParams.append("skip", String(params.skip))
  if (params?.limit !== undefined) queryParams.append("limit", String(params.limit))

  const url = `${API_URL}/api/v1/hooks/executions/all/?${queryParams.toString()}`

  const response = await fetch(url, {
    headers: getAuthHeaders(),
    cache: "no-store",
  })

  if (!response.ok) {
    throw new Error(`Failed to fetch executions: ${response.statusText}`)
  }

  const result = await response.json()
  return result.data || []
}
