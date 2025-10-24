"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import { auth } from "@/lib/auth"
import type { Dashboard, DashboardWidgetWithWidget } from "@/types/dashboard"

interface DashboardRealtimeUpdate {
  type: "widget_added" | "widget_removed" | "widget_updated" | "layout_changed" | "dashboard_updated"
  dashboard_id: string
  data: any
}

interface UseDashboardRealtimeOptions {
  dashboardId: string
  onUpdate?: (dashboard: Dashboard) => void
  onWidgetAdded?: (widget: DashboardWidgetWithWidget) => void
  onWidgetRemoved?: (widgetId: string) => void
  onWidgetUpdated?: (widget: DashboardWidgetWithWidget) => void
  onLayoutChanged?: (widgets: DashboardWidgetWithWidget[]) => void
  enabled?: boolean
}

export function useDashboardRealtime({
  dashboardId,
  onUpdate,
  onWidgetAdded,
  onWidgetRemoved,
  onWidgetUpdated,
  onLayoutChanged,
  enabled = true,
}: UseDashboardRealtimeOptions) {
  const [isConnected, setIsConnected] = useState(false)
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>()
  const reconnectAttempts = useRef(0)
  const maxReconnectAttempts = 5

  const connect = useCallback(() => {
    if (!enabled || !dashboardId) return

    const token = auth.getToken()
    if (!token) return

    try {
      // WebSocket URL (adapter selon votre configuration)
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:"
      const wsUrl = `${protocol}//${window.location.host}/api/v1/ws/dashboards/${dashboardId}?token=${token}`

      const ws = new WebSocket(wsUrl)

      ws.onopen = () => {
        console.log(`WebSocket connected to dashboard ${dashboardId}`)
        setIsConnected(true)
        reconnectAttempts.current = 0
      }

      ws.onmessage = (event) => {
        try {
          const message: DashboardRealtimeUpdate = JSON.parse(event.data)

          switch (message.type) {
            case "dashboard_updated":
              onUpdate?.(message.data)
              break
            case "widget_added":
              onWidgetAdded?.(message.data)
              break
            case "widget_removed":
              onWidgetRemoved?.(message.data.widget_id)
              break
            case "widget_updated":
              onWidgetUpdated?.(message.data)
              break
            case "layout_changed":
              onLayoutChanged?.(message.data.widgets)
              break
            default:
              console.warn("Unknown message type:", message.type)
          }
        } catch (error) {
          console.error("Error parsing WebSocket message:", error)
        }
      }

      ws.onerror = (error) => {
        console.error("WebSocket error:", error)
      }

      ws.onclose = () => {
        console.log("WebSocket disconnected")
        setIsConnected(false)
        wsRef.current = null

        // Tentative de reconnexion automatique
        if (enabled && reconnectAttempts.current < maxReconnectAttempts) {
          reconnectAttempts.current++
          const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30000)
          console.log(`Reconnecting in ${delay}ms (attempt ${reconnectAttempts.current}/${maxReconnectAttempts})`)

          reconnectTimeoutRef.current = setTimeout(() => {
            connect()
          }, delay)
        }
      }

      wsRef.current = ws
    } catch (error) {
      console.error("Failed to create WebSocket connection:", error)
    }
  }, [
    enabled,
    dashboardId,
    onUpdate,
    onWidgetAdded,
    onWidgetRemoved,
    onWidgetUpdated,
    onLayoutChanged,
  ])

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current)
    }

    if (wsRef.current) {
      wsRef.current.close()
      wsRef.current = null
    }

    setIsConnected(false)
  }, [])

  // Connect/disconnect based on enabled flag
  useEffect(() => {
    if (enabled) {
      connect()
    } else {
      disconnect()
    }

    return () => {
      disconnect()
    }
  }, [enabled, connect, disconnect])

  // Send message via WebSocket
  const sendMessage = useCallback((message: any) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message))
    } else {
      console.warn("WebSocket not connected. Message not sent:", message)
    }
  }, [])

  return {
    isConnected,
    sendMessage,
    disconnect,
    reconnect: connect,
  }
}
