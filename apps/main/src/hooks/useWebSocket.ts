/**
 * useWebSocket — Real-time WebSocket connection for notifications.
 *
 * Connects to /ws/notifications?token=xxx
 * Handles reconnection with exponential backoff.
 * Dispatches received notifications to React Query cache.
 */
import { useEffect, useRef, useCallback, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@/stores/authStore'
import { useToast } from '@/components/ui/Toast'

type WSStatus = 'connecting' | 'connected' | 'disconnected' | 'error'

interface WSNotification {
  type: 'notification' | 'pong' | 'read_ack' | 'cache_invalidate'
  data?: {
    id?: string
    title?: string
    body?: string
    category?: string
    link?: string
    created_at?: string
    keys?: string[]
  }
}

const MAX_RECONNECT_DELAY = 30_000
const PING_INTERVAL = 25_000

export function useWebSocket() {
  const { isAuthenticated } = useAuthStore()
  const accessToken = localStorage.getItem('access_token')
  const qc = useQueryClient()
  const { toast } = useToast()
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimer = useRef<ReturnType<typeof setTimeout>>()
  const pingTimer = useRef<ReturnType<typeof setInterval>>()
  const reconnectDelay = useRef(1000)
  const [status, setStatus] = useState<WSStatus>('disconnected')

  const connect = useCallback(() => {
    if (!accessToken || !isAuthenticated) return
    if (wsRef.current?.readyState === WebSocket.OPEN) return

    setStatus('connecting')

    // Use API URL for WebSocket (backend may be on a different host in production)
    const apiBase = import.meta.env.VITE_API_URL || window.location.origin
    const wsBase = apiBase.replace(/^http/, 'ws')
    const url = `${wsBase}/ws/notifications?token=${encodeURIComponent(accessToken)}`

    const ws = new WebSocket(url)
    wsRef.current = ws

    ws.onopen = () => {
      setStatus('connected')
      reconnectDelay.current = 1000 // Reset backoff

      // Start ping interval
      pingTimer.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'ping' }))
        }
      }, PING_INTERVAL)
    }

    ws.onmessage = (event) => {
      try {
        const msg: WSNotification = JSON.parse(event.data)

        if (msg.type === 'notification' && msg.data) {
          // Invalidate notification queries to refetch (list + unread count badge)
          qc.invalidateQueries({ queryKey: ['notifications'] })
          qc.invalidateQueries({ queryKey: ['notifications', 'unread-count'] })
          qc.invalidateQueries({ queryKey: ['settings-badge'] })

          // Show toast for the notification
          toast({
            title: msg.data.title!,
            description: msg.data.body || undefined,
            variant: msg.data.category === 'error' ? 'error'
              : msg.data.category === 'warning' ? 'warning'
                : 'default',
          })
        }

        // Cache invalidation broadcast — invalidate specific React Query keys
        if (msg.type === 'cache_invalidate') {
          const keys = msg.data?.keys as string[] | undefined
          if (keys) {
            for (const key of keys) {
              qc.invalidateQueries({ queryKey: [key] })
            }
          }
        }
        // pong and read_ack are silently handled
      } catch {
        // Ignore parse errors
      }
    }

    ws.onclose = (event) => {
      setStatus('disconnected')
      clearInterval(pingTimer.current)
      wsRef.current = null

      // Reconnect with exponential backoff (unless intentional close)
      if (event.code !== 1000 && isAuthenticated) {
        reconnectTimer.current = setTimeout(() => {
          reconnectDelay.current = Math.min(reconnectDelay.current * 2, MAX_RECONNECT_DELAY)
          connect()
        }, reconnectDelay.current)
      }
    }

    ws.onerror = () => {
      setStatus('error')
    }
  }, [accessToken, isAuthenticated, qc, toast])

  const disconnect = useCallback(() => {
    clearTimeout(reconnectTimer.current)
    clearInterval(pingTimer.current)
    if (wsRef.current) {
      wsRef.current.close(1000, 'User disconnect')
      wsRef.current = null
    }
    setStatus('disconnected')
  }, [])

  const markRead = useCallback((notificationId: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'mark_read', data: { id: notificationId } }))
    }
  }, [])

  // Auto-connect when authenticated
  useEffect(() => {
    if (isAuthenticated && accessToken) {
      connect()
    } else {
      disconnect()
    }
    return () => disconnect()
  }, [isAuthenticated, accessToken, connect, disconnect])

  return { status, markRead, disconnect, reconnect: connect }
}
