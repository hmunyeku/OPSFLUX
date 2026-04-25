function normalizeAbsoluteUrl(raw: string): string {
  const trimmed = raw.trim().replace(/\/$/, '')
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  if (trimmed.startsWith('//')) return `${window.location.protocol}${trimmed}`
  if (/^[a-z0-9.-]+(?::\d+)?(\/.*)?$/i.test(trimmed)) {
    return `${window.location.protocol}//${trimmed}`
  }
  return new URL(trimmed, window.location.origin).toString().replace(/\/$/, '')
}

export function resolveApiBaseUrl(): string {
  const envBase = import.meta.env.VITE_API_URL
  if (envBase) return normalizeAbsoluteUrl(envBase)

  const { protocol, hostname, port } = window.location
  if (hostname.startsWith('api.')) return `${protocol}//${hostname}${port ? `:${port}` : ''}`
  if (hostname.startsWith('app.')) return `${protocol}//api.${hostname.slice(4)}`
  if (hostname.startsWith('web.')) return `${protocol}//api.${hostname.slice(4)}`
  if (hostname.startsWith('ext.')) return `${protocol}//api.${hostname.slice(4)}`
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return `${protocol}//${hostname}:${port === '4175' ? '8000' : port || '8000'}`
  }
  return `${protocol}//${hostname}${port ? `:${port}` : ''}`
}

export function resolveWebSocketBaseUrl(): string {
  const apiBase = resolveApiBaseUrl()
  const parsed = new URL(apiBase)
  parsed.protocol = parsed.protocol === 'https:' ? 'wss:' : 'ws:'
  return parsed.toString().replace(/\/$/, '')
}

