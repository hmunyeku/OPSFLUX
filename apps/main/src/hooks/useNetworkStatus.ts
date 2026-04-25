/**
 * useNetworkStatus — Reactive hook for browser online/offline + API reachability.
 *
 * Returns:
 *   online:       boolean — browser reports network connectivity
 *   apiReachable: boolean — backend API responds to /api/health
 *   since:        Date    — timestamp of last status change
 *
 * Uses `navigator.onLine` + `online`/`offline` window events.
 * Pings `/api/health` every 30s with raw `fetch` (bypasses axios interceptors
 * to avoid 401-refresh loops and noisy console errors).
 */
import { useState, useEffect, useCallback, useRef } from 'react'
import { resolveApiBaseUrl } from '@/lib/runtimeUrls'

export interface NetworkStatus {
  /** Browser reports network connectivity */
  online: boolean
  /** Backend API is reachable */
  apiReachable: boolean
  /** Timestamp of last status change */
  since: Date
}

/** Resolve the API base URL the same way the axios instance does. */
function getBaseUrl(): string {
  try {
    return resolveApiBaseUrl()
  } catch {
    return window.location.origin
  }
}

export function useNetworkStatus(pingIntervalMs = 30_000): NetworkStatus {
  const [online, setOnline] = useState(navigator.onLine)
  const [apiReachable, setApiReachable] = useState(true)
  const [since, setSince] = useState(() => new Date())
  const pingTimerRef = useRef<ReturnType<typeof setInterval>>()

  const updateOnline = useCallback((isOnline: boolean) => {
    setOnline((prev) => {
      if (prev !== isOnline) setSince(new Date())
      return isOnline
    })
  }, [])

  // Browser online/offline events
  useEffect(() => {
    const handleOnline = () => updateOnline(true)
    const handleOffline = () => updateOnline(false)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [updateOnline])

  // Periodic API ping — uses raw fetch to avoid axios interceptors
  useEffect(() => {
    const baseUrl = getBaseUrl()

    const ping = async () => {
      if (!navigator.onLine) {
        setApiReachable(false)
        return
      }
      try {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 5000)
        const res = await fetch(`${baseUrl}/api/health`, {
          method: 'HEAD',
          signal: controller.signal,
        })
        clearTimeout(timeoutId)
        // Any HTTP response (even 4xx/5xx) means the server is reachable
        const reachable = res.ok || res.status < 500
        setApiReachable((prev) => {
          if (prev !== reachable) setSince(new Date())
          return reachable
        })
      } catch {
        // Network error or timeout — API unreachable
        setApiReachable((prev) => {
          if (prev) setSince(new Date())
          return false
        })
      }
    }

    // Initial check (delay slightly to avoid blocking first render)
    const initialTimer = setTimeout(ping, 1500)

    pingTimerRef.current = setInterval(ping, pingIntervalMs)
    return () => {
      clearTimeout(initialTimer)
      if (pingTimerRef.current) clearInterval(pingTimerRef.current)
    }
  }, [pingIntervalMs])

  return { online, apiReachable, since }
}
