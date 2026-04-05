/**
 * Axios instance with JWT interceptors, tenant header, error handling.
 *
 * Includes a refresh-token mutex to prevent concurrent refresh calls
 * when multiple parallel requests receive 401 simultaneously.
 */
import axios, { type AxiosRequestConfig } from 'axios'
import { resolveApiBaseUrl } from '@/lib/runtimeUrls'

const api = axios.create({
  baseURL: resolveApiBaseUrl(),
  headers: {
    'Content-Type': 'application/json',
  },
})

// Request interceptor — attach JWT + entity header
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }

  const entityId = localStorage.getItem('entity_id')
  if (entityId) {
    config.headers['X-Entity-ID'] = entityId
  }

  return config
})

// ── Refresh mutex ────────────────────────────────────────────────────────────
// When multiple requests fail with 401, only ONE refresh call is made.
// All other 401 requests wait for the refresh to complete, then retry
// with the new token.

let isRefreshing = false
let refreshSubscribers: ((token: string) => void)[] = []

function subscribeTokenRefresh(cb: (token: string) => void) {
  refreshSubscribers.push(cb)
}

function onTokenRefreshed(newToken: string) {
  refreshSubscribers.forEach((cb) => cb(newToken))
  refreshSubscribers = []
}

function onRefreshFailed() {
  refreshSubscribers = []
}

// Response interceptor — handle 401 (token refresh with mutex)
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config as AxiosRequestConfig & { _retry?: boolean }

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true

      // If already refreshing, queue this request to retry after refresh
      if (isRefreshing) {
        return new Promise((resolve) => {
          subscribeTokenRefresh((newToken: string) => {
            originalRequest.headers = originalRequest.headers || {}
            originalRequest.headers.Authorization = `Bearer ${newToken}`
            resolve(api(originalRequest))
          })
        })
      }

      const refreshToken = localStorage.getItem('refresh_token')
      if (refreshToken) {
        isRefreshing = true
        try {
          const res = await axios.post('/api/v1/auth/refresh', {
            refresh_token: refreshToken,
          })
          const { access_token, refresh_token: newRefresh } = res.data
          localStorage.setItem('access_token', access_token)
          localStorage.setItem('refresh_token', newRefresh)
          isRefreshing = false

          // Notify all queued requests with the new token
          onTokenRefreshed(access_token)

          // Retry the original request
          originalRequest.headers = originalRequest.headers || {}
          originalRequest.headers.Authorization = `Bearer ${access_token}`
          return api(originalRequest)
        } catch {
          isRefreshing = false
          onRefreshFailed()
          // Refresh failed — clear session & redirect to login
          localStorage.removeItem('access_token')
          localStorage.removeItem('refresh_token')
          if (window.location.pathname !== '/login') {
            window.location.href = '/login'
          }
        }
      } else {
        // No refresh token — session expired, redirect to login
        localStorage.removeItem('access_token')
        if (window.location.pathname !== '/login') {
          window.location.href = '/login'
        }
      }
    }

    // Network error (server unreachable) — log but do NOT force logout.
    // Transient network errors (server restart, deploy) should not
    // destroy the session. React Query will retry automatically.
    // Only the 401 refresh-failure path above should force logout.

    return Promise.reject(error)
  },
)

export default api
