export interface AuditLog {
  id: number
  timestamp: string
  level: "INFO" | "WARN" | "ERROR" | "DEBUG"
  event_type: "API" | "AUTH" | "CRUD" | "SYSTEM"
  message: string
  source: string
  method?: string
  path?: string
  status_code?: number
  user_id?: string
  ip_address?: string
  user_agent?: string
  environment?: string
  duration_ms?: number
  error_details?: string
  metadata?: string
}

export interface AuditLogsResponse {
  data: AuditLog[]
  total: number
}

export interface AuditStats {
  levels: {
    INFO: number
    WARN: number
    ERROR: number
    DEBUG: number
  }
  event_types: {
    API: number
    AUTH: number
    CRUD: number
    SYSTEM: number
  }
}

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

export async function getAuditLogs(params?: {
  skip?: number
  limit?: number
  level?: string
  event_type?: string
  search?: string
}): Promise<AuditLogsResponse> {
  try {
    const queryParams = new URLSearchParams()
    if (params?.skip !== undefined) queryParams.append('skip', params.skip.toString())
    if (params?.limit !== undefined) queryParams.append('limit', params.limit.toString())
    if (params?.level) queryParams.append('level', params.level)
    if (params?.event_type) queryParams.append('event_type', params.event_type)
    if (params?.search) queryParams.append('search', params.search)

    const url = `${API_URL}/api/v1/audit?${queryParams.toString()}`

    const response = await fetch(url, {
      headers: getAuthHeaders(),
      cache: 'no-store',
    })

    if (!response.ok) {
      throw new Error(`Failed to fetch audit logs: ${response.statusText}`)
    }

    const data = await response.json()
    return data
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Error fetching audit logs:', error)
    return { data: [], total: 0 }
  }
}

export async function getAuditStats(): Promise<AuditStats> {
  try {
    const response = await fetch(`${API_URL}/api/v1/audit/stats`, {
      headers: getAuthHeaders(),
      cache: 'no-store',
    })

    if (!response.ok) {
      throw new Error(`Failed to fetch audit stats: ${response.statusText}`)
    }

    const data = await response.json()
    return data
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Error fetching audit stats:', error)
    return {
      levels: { INFO: 0, WARN: 0, ERROR: 0, DEBUG: 0 },
      event_types: { API: 0, AUTH: 0, CRUD: 0, SYSTEM: 0 },
    }
  }
}

export async function clearAuditLogs(): Promise<void> {
  try {
    const response = await fetch(`${API_URL}/api/v1/audit/clear`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    })

    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(errorData.detail || `Failed to clear audit logs: ${response.statusText}`)
    }
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Error clearing audit logs:', error)
    throw error
  }
}
