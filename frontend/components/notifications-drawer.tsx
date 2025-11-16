"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { Bell, Check, CheckCheck, X, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useNotifications } from "@/lib/notifications-context"
import { formatDistanceToNow } from "date-fns"
import { fr } from "date-fns/locale"

export function NotificationsDrawer() {
  const {
    notifications,
    unreadCount,
    isLoading,
    markAsRead,
    markAllAsRead,
    deleteNotification: deleteNotif,
  } = useNotifications()

  const unreadNotifications = notifications.filter((n) => !n.read)
  const readNotifications = notifications.filter((n) => n.read)

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between p-4 border-b">
        <div className="flex items-center gap-2">
          <Bell className="h-5 w-5" />
          <h2 className="text-lg font-semibold">Notifications</h2>
          {unreadCount > 0 && <Badge variant="secondary">{unreadCount}</Badge>}
          {isLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => markAllAsRead()} disabled={unreadCount === 0}>
            <CheckCheck className="h-4 w-4 mr-2" />
            Tout marquer lu
          </Button>
        </div>
      </div>

      <Tabs defaultValue="all" className="flex-1 flex flex-col">
        <TabsList className="w-full justify-start rounded-none border-b px-4">
          <TabsTrigger value="all">Toutes ({notifications.length})</TabsTrigger>
          <TabsTrigger value="unread">Non lues ({unreadNotifications.length})</TabsTrigger>
          <TabsTrigger value="read">Lues ({readNotifications.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="flex-1 m-0">
          <ScrollArea className="h-full">
            {notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full p-8 text-center">
                <Bell className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-sm text-muted-foreground">Aucune notification</p>
              </div>
            ) : (
              <div className="divide-y">
                {notifications.map((notification) => (
                  <NotificationItem
                    key={notification.id}
                    notification={notification}
                    onMarkAsRead={markAsRead}
                    onDelete={deleteNotif}
                  />
                ))}
              </div>
            )}
          </ScrollArea>
        </TabsContent>

        <TabsContent value="unread" className="flex-1 m-0">
          <ScrollArea className="h-full">
            {unreadNotifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full p-8 text-center">
                <CheckCheck className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-sm text-muted-foreground">Aucune notification non lue</p>
              </div>
            ) : (
              <div className="divide-y">
                {unreadNotifications.map((notification) => (
                  <NotificationItem
                    key={notification.id}
                    notification={notification}
                    onMarkAsRead={markAsRead}
                    onDelete={deleteNotif}
                  />
                ))}
              </div>
            )}
          </ScrollArea>
        </TabsContent>

        <TabsContent value="read" className="flex-1 m-0">
          <ScrollArea className="h-full">
            {readNotifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full p-8 text-center">
                <Check className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-sm text-muted-foreground">Aucune notification lue</p>
              </div>
            ) : (
              <div className="divide-y">
                {readNotifications.map((notification) => (
                  <NotificationItem
                    key={notification.id}
                    notification={notification}
                    onMarkAsRead={markAsRead}
                    onDelete={deleteNotif}
                  />
                ))}
              </div>
            )}
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </div>
  )
}

function NotificationItem({
  notification,
  onMarkAsRead,
  onDelete,
}: {
  notification: any
  onMarkAsRead: (id: string) => void
  onDelete: (id: string) => void
}) {
  const router = useRouter()
  const getTypeLabel = (type: string) => {
    switch (type) {
      case "info":
        return "Info"
      case "success":
        return "Succès"
      case "warning":
        return "Attention"
      case "error":
        return "Erreur"
      case "system":
        return "Système"
      default:
        return "Info"
    }
  }

  const getVariant = (priority: string) => {
    if (priority === "urgent" || priority === "high") return "destructive"
    if (priority === "low") return "outline"
    return "secondary"
  }

  const formatDate = (dateString: string) => {
    try {
      return formatDistanceToNow(new Date(dateString), { addSuffix: true, locale: fr })
    } catch {
      return "Date inconnue"
    }
  }

  return (
    <div className={`p-4 hover:bg-accent/50 transition-colors ${!notification.read ? "bg-accent/20" : ""}`}>
      <div className="flex items-start gap-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <Badge variant={getVariant(notification.priority)} className="text-[10px]">
              {getTypeLabel(notification.type)}
            </Badge>
            <span className="text-xs text-muted-foreground">{formatDate(notification.created_at)}</span>
            {!notification.read && <div className="h-2 w-2 rounded-full bg-primary" />}
          </div>
          <p className="text-sm font-medium mb-1">{notification.title}</p>
          <p className="text-xs text-muted-foreground">{notification.message}</p>

          <div className="flex items-center gap-2 mt-3">
            {notification.action_url && (
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs bg-transparent"
                onClick={() => router.push(notification.action_url)}
              >
                {notification.action_text || "Voir détails"}
              </Button>
            )}
            {!notification.read && (
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => onMarkAsRead(notification.id)}>
                <Check className="h-3 w-3 mr-1" />
                Marquer lu
              </Button>
            )}
          </div>
        </div>

        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onDelete(notification.id)}>
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}
