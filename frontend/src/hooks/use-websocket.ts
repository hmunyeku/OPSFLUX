import { useEffect, useRef, useState, useCallback } from "react"
import { auth } from "@/lib/auth"

export interface WebSocketMessage {
  type: string
  data?: Record<string, unknown>
  timestamp: string
}

export interface UseWebSocketOptions {
  url: string
  onMessage?: (message: WebSocketMessage) => void
  onConnect?: () => void
  onDisconnect?: () => void
  onError?: (error: Event) => void
  reconnectInterval?: number
  reconnectAttempts?: number
}

export function useWebSocket({
  url,
  onMessage,
  onConnect,
  onDisconnect,
  onError,
  reconnectInterval = 3000,
  reconnectAttempts = 5,
}: UseWebSocketOptions) {
  const [isConnected, setIsConnected] = useState(false)
  const [connectionError, setConnectionError] = useState<string | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const reconnectCountRef = useRef(0)
  const mountedRef = useRef(true)

  const connect = useCallback(() => {
    // Ne pas se connecter si le composant est démonté
    if (!mountedRef.current) return

    // Obtenir le token d'authentification
    const token = auth.getToken()
    if (!token) {
      setConnectionError("Token d'authentification manquant")
      return
    }

    try {
      // Créer l'URL WebSocket avec le token en query parameter
      const wsUrl = `${url}?token=${encodeURIComponent(token)}`

      // Créer la connexion WebSocket
      const ws = new WebSocket(wsUrl)

      ws.onopen = () => {
        setIsConnected(true)
        setConnectionError(null)
        reconnectCountRef.current = 0
        onConnect?.()
      }

      ws.onmessage = (event) => {
        try {
          const message: WebSocketMessage = JSON.parse(event.data)
          onMessage?.(message)
        } catch (_error) {
          // Ignore malformed messages
        }
      }

      ws.onerror = (error) => {
        setConnectionError("Erreur de connexion WebSocket")
        onError?.(error)
      }

      ws.onclose = () => {
        setIsConnected(false)
        onDisconnect?.()

        // Tenter de se reconnecter si le composant est toujours monté
        if (
          mountedRef.current &&
          reconnectCountRef.current < reconnectAttempts
        ) {
          reconnectCountRef.current++

          reconnectTimeoutRef.current = setTimeout(() => {
            connect()
          }, reconnectInterval)
        } else if (reconnectCountRef.current >= reconnectAttempts) {
          setConnectionError(
            `Échec de reconnexion après ${reconnectAttempts} tentatives`
          )
        }
      }

      wsRef.current = ws
    } catch (_error) {
      setConnectionError("Impossible de créer la connexion WebSocket")
    }
  }, [
    url,
    onMessage,
    onConnect,
    onDisconnect,
    onError,
    reconnectInterval,
    reconnectAttempts,
  ])

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current)
      reconnectTimeoutRef.current = null
    }

    if (wsRef.current) {
      wsRef.current.close()
      wsRef.current = null
    }

    setIsConnected(false)
  }, [])

  const sendMessage = useCallback((message: string | Record<string, unknown>) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        typeof message === "string" ? message : JSON.stringify(message)
      )
    }
  }, [])

  // Connecter au montage du composant
  useEffect(() => {
    mountedRef.current = true
    connect()

    return () => {
      mountedRef.current = false
      disconnect()
    }
  }, [connect, disconnect])

  // Ping périodique pour maintenir la connexion active
  useEffect(() => {
    if (!isConnected) return

    const pingInterval = setInterval(() => {
      sendMessage({ type: "ping" })
    }, 30000) // Ping toutes les 30 secondes

    return () => clearInterval(pingInterval)
  }, [isConnected, sendMessage])

  return {
    isConnected,
    connectionError,
    sendMessage,
    reconnect: connect,
    disconnect,
  }
}
