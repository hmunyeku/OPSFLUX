export function getTokenFromUrl() {
  const queryToken = new URLSearchParams(window.location.search).get("token")
  if (queryToken) return queryToken
  const parts = window.location.pathname.split("/").filter(Boolean)
  return parts.at(-1) || ""
}

export function getApiBase() {
  const envBase = import.meta.env.VITE_API_URL
  if (envBase) return envBase.replace(/\/$/, "")
  const { protocol, hostname, port } = window.location
  if (hostname.startsWith("ext.")) {
    return `${protocol}//api.${hostname.slice(4)}`
  }
  if (hostname.startsWith("web.") || hostname.startsWith("app.")) {
    return `${protocol}//api.${hostname.split(".").slice(1).join(".")}`
  }
  if (hostname === "localhost" || hostname === "127.0.0.1") {
    return `${protocol}//${hostname}:${port === "5175" ? "8000" : port || "8000"}`
  }
  return `${protocol}//${hostname}`
}

export function sessionStorageKey(token) {
  return `opsflux-ext-paxlog-session:${token}`
}

export async function apiRequest({ apiBase, sessionToken }, path, options = {}) {
  const method = (options.method || "GET").toUpperCase()
  const headers = { ...(options.headers || {}) }
  if (options.body != null && method !== "GET" && method !== "HEAD" && !("Content-Type" in headers)) {
    headers["Content-Type"] = "application/json"
  }
  if (sessionToken) {
    headers["X-External-Session"] = sessionToken
  }
  const response = await fetch(`${apiBase}${path}`, {
    ...options,
    headers,
  })
  const contentType = response.headers.get("content-type") || ""
  const payload = contentType.includes("application/json") ? await response.json() : await response.text()
  if (!response.ok) {
    const detail = typeof payload === "object" && payload?.detail ? payload.detail : payload
    throw new Error(typeof detail === "string" ? detail : JSON.stringify(detail))
  }
  return payload
}

export async function apiDownload({ apiBase, sessionToken }, path, options = {}) {
  const method = (options.method || "GET").toUpperCase()
  const headers = { ...(options.headers || {}) }
  if (options.body != null && method !== "GET" && method !== "HEAD" && !("Content-Type" in headers)) {
    headers["Content-Type"] = "application/json"
  }
  if (sessionToken) {
    headers["X-External-Session"] = sessionToken
  }
  const response = await fetch(`${apiBase}${path}`, {
    ...options,
    headers,
  })
  if (!response.ok) {
    const contentType = response.headers.get("content-type") || ""
    const payload = contentType.includes("application/json") ? await response.json() : await response.text()
    const detail = typeof payload === "object" && payload?.detail ? payload.detail : payload
    throw new Error(typeof detail === "string" ? detail : JSON.stringify(detail))
  }
  return response.blob()
}
