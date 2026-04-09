export function getApiBase(): string {
  const envBase = import.meta.env.VITE_API_URL
  if (envBase) return envBase.replace(/\/$/, '')
  const { protocol, hostname, port } = window.location
  if (hostname.startsWith('ext.')) {
    return `${protocol}//api.${hostname.slice(4)}`
  }
  if (hostname.startsWith('web.') || hostname.startsWith('app.')) {
    return `${protocol}//api.${hostname.split('.').slice(1).join('.')}`
  }
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return `${protocol}//${hostname}:${port === '5175' ? '8000' : port || '8000'}`
  }
  return `${protocol}//${hostname}`
}

const API_BASE = getApiBase()

export async function apiRequest(
  sessionToken: string | null,
  path: string,
  options: RequestInit = {},
): Promise<any> {
  const method = (options.method || 'GET').toUpperCase()
  const headers: Record<string, string> = { ...(options.headers as Record<string, string> || {}) }
  if (options.body != null && method !== 'GET' && method !== 'HEAD' && !('Content-Type' in headers)) {
    headers['Content-Type'] = 'application/json'
  }
  if (sessionToken) {
    headers['X-External-Session'] = sessionToken
  }
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  })
  const contentType = response.headers.get('content-type') || ''
  const payload = contentType.includes('application/json') ? await response.json() : await response.text()
  if (!response.ok) {
    const detail = typeof payload === 'object' && payload?.detail ? payload.detail : payload
    throw new Error(typeof detail === 'string' ? detail : JSON.stringify(detail))
  }
  return payload
}

export async function apiDownload(
  sessionToken: string | null,
  path: string,
  options: RequestInit = {},
): Promise<Blob> {
  const method = (options.method || 'GET').toUpperCase()
  const headers: Record<string, string> = { ...(options.headers as Record<string, string> || {}) }
  if (options.body != null && method !== 'GET' && method !== 'HEAD' && !('Content-Type' in headers)) {
    headers['Content-Type'] = 'application/json'
  }
  if (sessionToken) {
    headers['X-External-Session'] = sessionToken
  }
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  })
  if (!response.ok) {
    const contentType = response.headers.get('content-type') || ''
    const payload = contentType.includes('application/json') ? await response.json() : await response.text()
    const detail = typeof payload === 'object' && payload?.detail ? payload.detail : payload
    throw new Error(typeof detail === 'string' ? detail : JSON.stringify(detail))
  }
  return response.blob()
}

export function getTokenFromUrl(): string {
  const url = new URL(window.location.href)
  if (url.searchParams.get('tracking')) return ''
  const queryToken = url.searchParams.get('token')
  if (queryToken) return queryToken
  const parts = url.pathname.split('/').filter(Boolean)
  if (parts[0] === 'tracking') return ''
  return parts.at(-1) || ''
}

export function getPublicTrackingCodeFromUrl(): string {
  const url = new URL(window.location.href)
  const queryCode = url.searchParams.get('tracking')
  if (queryCode) return queryCode.trim()
  const parts = url.pathname.split('/').filter(Boolean)
  if (parts[0] === 'tracking' && parts[1]) return decodeURIComponent(parts[1])
  return ''
}

export function isTrackingMode(): boolean {
  const url = new URL(window.location.href)
  const code = getPublicTrackingCodeFromUrl()
  return url.pathname.startsWith('/tracking') || Boolean(code && !url.searchParams.get('token'))
}

export function parseApiErrorDetail(error: unknown): any {
  if (!(error instanceof Error) || !error.message) return null
  try {
    return JSON.parse(error.message)
  } catch {
    return null
  }
}

export function isSessionRequiredError(error: unknown): boolean {
  return String((error as Error)?.message || '').includes('Session externe requise')
}
