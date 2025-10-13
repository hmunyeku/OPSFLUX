"use client"

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
} from "react"
import { useWebSocket, WebSocketMessage } from "@/hooks/use-websocket"
import { useAuth } from "@/hooks/use-auth"
import { api } from "@/lib/api"
import { auth } from "@/lib/auth"
import { useToast } from "@/hooks/use-toast"

export interface Notification {
  id: string
  title: string
  message: string
  type: "info" | "success" | "warning" | "error" | "system"
  priority: "low" | "normal" | "high" | "urgent"
  read: boolean
  read_at?: string
  metadata?: Record<string, unknown>
  action_url?: string
  created_at: string
  updated_at: string
  expires_at?: string
}

interface NotificationsContextType {
  notifications: Notification[]
  unreadCount: number
  isConnected: boolean
  isLoading: boolean
  markAsRead: (notificationId: string) => Promise<void>
  markAllAsRead: () => Promise<void>
  deleteNotification: (notificationId: string) => Promise<void>
  refreshNotifications: () => Promise<void>
  createTestNotification: (
    type?: Notification["type"],
    priority?: Notification["priority"]
  ) => Promise<void>
}

const NotificationsContext = createContext<NotificationsContextType | undefined>(
  undefined
)

export function NotificationsProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const { user } = useAuth()
  const { toast } = useToast()
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [isLoading, setIsLoading] = useState(false)

  // Obtenir l'URL du WebSocket
  const getWebSocketUrl = useCallback(() => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"
    const wsProtocol = apiUrl.startsWith("https") ? "wss" : "ws"
    const wsUrl = apiUrl.replace(/^https?/, wsProtocol)
    return `${wsUrl}/api/v1/ws/notifications`
  }, [])

  // Gérer les messages WebSocket
  const handleWebSocketMessage = useCallback(
    (message: WebSocketMessage) => {
      if (message.type === "notification") {
        const notification = message.data as unknown as Notification
        setNotifications((prev) => [notification, ...prev])
        setUnreadCount((prev) => prev + 1)

        // Afficher une notification toast pour les notifications urgentes
        if (notification.priority === "urgent" || notification.priority === "high") {
          toast({
            title: notification.title,
            description: notification.message,
            variant: notification.type === "error" ? "destructive" : "default",
          })
        }
      }
      // Ignore other message types (connected, pong, etc.)
    },
    [toast]
  )

  // Connexion WebSocket
  const { isConnected } = useWebSocket({
    url: getWebSocketUrl(),
    onMessage: handleWebSocketMessage,
  })

  // Charger les notifications initiales
  const loadNotifications = useCallback(async () => {
    if (!user) return

    const token = auth.getToken()
    if (!token) return

    try {
      setIsLoading(true)
      const response = await api.fetch<{ data: Notification[]; count: number }>(
        "/api/v1/notifications?limit=50",
        {},
        token
      )
      setNotifications(response.data)
      setUnreadCount(response.data.filter((n: Notification) => !n.read).length)
    } catch (_error) {
      // Error will be handled by the component
    } finally {
      setIsLoading(false)
    }
  }, [user])

  // Charger le compteur de notifications non lues
  const loadUnreadCount = useCallback(async () => {
    if (!user) return

    const token = auth.getToken()
    if (!token) return

    try {
      const response = await api.fetch<{ count: number }>(
        "/api/v1/notifications/unread-count",
        {},
        token
      )
      setUnreadCount(response.count)
    } catch (_error) {
      // Error will be handled by the component
    }
  }, [user])

  // Marquer une notification comme lue
  const markAsRead = useCallback(async (notificationId: string) => {
    const token = auth.getToken()
    if (!token) throw new Error("Not authenticated")

    try {
      await api.fetch<Notification>(
        `/api/v1/notifications/${notificationId}`,
        {
          method: "PATCH",
          body: JSON.stringify({ read: true }),
        },
        token
      )
      setNotifications((prev) =>
        prev.map((n) => (n.id === notificationId ? { ...n, read: true } : n))
      )
      setUnreadCount((prev) => Math.max(0, prev - 1))
    } catch (error) {
      throw error
    }
  }, [])

  // Marquer toutes les notifications comme lues
  const markAllAsRead = useCallback(async () => {
    const token = auth.getToken()
    if (!token) throw new Error("Not authenticated")

    try {
      await api.fetch<{ message: string }>(
        "/api/v1/notifications/mark-all-read",
        {
          method: "POST",
        },
        token
      )
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
      setUnreadCount(0)
      toast({
        title: "Notifications marquées comme lues",
        description: "Toutes vos notifications ont été marquées comme lues.",
      })
    } catch (error) {
      throw error
    }
  }, [toast])

  // Supprimer une notification
  const deleteNotification = useCallback(async (notificationId: string) => {
    const token = auth.getToken()
    if (!token) throw new Error("Not authenticated")

    try {
      await api.fetch<{ message: string }>(
        `/api/v1/notifications/${notificationId}`,
        {
          method: "DELETE",
        },
        token
      )
      setNotifications((prev) => {
        const notification = prev.find((n) => n.id === notificationId)
        if (notification && !notification.read) {
          setUnreadCount((count) => Math.max(0, count - 1))
        }
        return prev.filter((n) => n.id !== notificationId)
      })
    } catch (error) {
      throw error
    }
  }, [])

  // Rafraîchir les notifications
  const refreshNotifications = useCallback(async () => {
    await Promise.all([loadNotifications(), loadUnreadCount()])
  }, [loadNotifications, loadUnreadCount])

  // Créer une notification de test
  const createTestNotification = useCallback(
    async (
      type: Notification["type"] = "info",
      priority: Notification["priority"] = "normal"
    ) => {
      const token = auth.getToken()
      if (!token) throw new Error("Not authenticated")

      try {
        await api.fetch<Notification>(
          `/api/v1/notifications/test?notification_type=${type}&priority=${priority}`,
          {
            method: "POST",
          },
          token
        )
        toast({
          title: "Notification de test créée",
          description: "Une notification de test a été envoyée.",
        })
      } catch (error) {
        throw error
      }
    },
    [toast]
  )

  // Charger les notifications au montage et lorsque l'utilisateur change
  useEffect(() => {
    if (user) {
      loadNotifications()
      loadUnreadCount()
    } else {
      setNotifications([])
      setUnreadCount(0)
    }
  }, [user, loadNotifications, loadUnreadCount])

  return (
    <NotificationsContext.Provider
      value={{
        notifications,
        unreadCount,
        isConnected,
        isLoading,
        markAsRead,
        markAllAsRead,
        deleteNotification,
        refreshNotifications,
        createTestNotification,
      }}
    >
      {children}
    </NotificationsContext.Provider>
  )
}

export function useNotifications() {
  const context = useContext(NotificationsContext)
  if (context === undefined) {
    throw new Error(
      "useNotifications doit être utilisé dans un NotificationsProvider"
    )
  }
  return context
}
