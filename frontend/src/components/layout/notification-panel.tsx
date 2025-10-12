import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import {
  Bell,
  Ship,
  AlertTriangle,
  Users,
  Package,
  CheckCheck,
  X,
} from "lucide-react"

interface NotificationPanelProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

interface Notification {
  id: string
  title: string
  description: string
  time: string
  type: "info" | "warning" | "success" | "error"
  unread: boolean
  icon?: "ship" | "alert" | "users" | "package"
}

const notifications: Notification[] = [
  {
    id: "1",
    title: "New Offshore Booking",
    description: "Helicopter flight to Platform Alpha scheduled for tomorrow 08:00",
    time: "5 minutes ago",
    type: "info",
    unread: true,
    icon: "ship",
  },
  {
    id: "2",
    title: "HSE Alert",
    description: "Weather conditions deteriorating - High waves expected",
    time: "15 minutes ago",
    type: "warning",
    unread: true,
    icon: "alert",
  },
  {
    id: "3",
    title: "Crew Rotation Update",
    description: "28-day rotation schedule updated for offshore crew",
    time: "1 hour ago",
    type: "info",
    unread: true,
    icon: "users",
  },
  {
    id: "4",
    title: "Equipment Delivery",
    description: "Cargo manifest #OMV-2847 approved and ready for shipment",
    time: "2 hours ago",
    type: "success",
    unread: false,
    icon: "package",
  },
  {
    id: "5",
    title: "PTW Expiring Soon",
    description: "Permit to Work #PTW-8842 expires in 2 hours",
    time: "3 hours ago",
    type: "warning",
    unread: false,
    icon: "alert",
  },
]

const iconComponents = {
  ship: Ship,
  alert: AlertTriangle,
  users: Users,
  package: Package,
}

const typeColors = {
  info: "text-blue-500 bg-blue-500/10 border-blue-500/20",
  warning: "text-amber-500 bg-amber-500/10 border-amber-500/20",
  success: "text-green-500 bg-green-500/10 border-green-500/20",
  error: "text-red-500 bg-red-500/10 border-red-500/20",
}

export function NotificationPanel({ open, onOpenChange }: NotificationPanelProps) {
  const unreadCount = notifications.filter((n) => n.unread).length

  const handleMarkAllRead = () => {
    // TODO: Implement mark all as read
    console.log("Mark all as read")
  }

  const handleClearAll = () => {
    // TODO: Implement clear all notifications
    console.log("Clear all notifications")
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[400px] sm:w-[540px] flex flex-col p-0">
        <SheetHeader className="p-6 pb-4 border-b">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <SheetTitle>Notifications</SheetTitle>
              {unreadCount > 0 && (
                <Badge variant="secondary" className="h-5 px-2">
                  {unreadCount} new
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleMarkAllRead}
                disabled={unreadCount === 0}
              >
                <CheckCheck className="h-4 w-4 mr-2" />
                Mark all read
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClearAll}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </SheetHeader>

        <ScrollArea className="flex-1 px-6">
          <div className="space-y-4 py-4">
            {/* Today */}
            <div>
              <h4 className="mb-3 text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                Today
              </h4>
              <div className="space-y-3">
                {notifications.map((notification) => {
                  const IconComponent = notification.icon
                    ? iconComponents[notification.icon]
                    : Bell
                  const isUnread = notification.unread

                  return (
                    <div
                      key={notification.id}
                      className={cn(
                        "group relative flex gap-4 rounded-lg border p-4 cursor-pointer transition-all hover:bg-accent",
                        isUnread && "bg-primary/5 border-primary/20 shadow-sm",
                        typeColors[notification.type]
                      )}
                    >
                      {isUnread && (
                        <div className="absolute -left-1 top-1/2 -translate-y-1/2 h-2 w-2 rounded-full bg-primary" />
                      )}
                      <div
                        className={cn(
                          "flex h-10 w-10 shrink-0 items-center justify-center rounded-full",
                          typeColors[notification.type]
                        )}
                      >
                        <IconComponent className="h-5 w-5" />
                      </div>
                      <div className="flex-1 space-y-1">
                        <p className="text-sm font-semibold leading-none">
                          {notification.title}
                        </p>
                        <p className="text-sm text-muted-foreground line-clamp-2">
                          {notification.description}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {notification.time}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={(e) => {
                          e.stopPropagation()
                          console.log("Delete notification", notification.id)
                        }}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Earlier */}
            <div>
              <h4 className="mb-3 text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                Earlier this week
              </h4>
              <div className="space-y-3">
                <div className="flex gap-4 rounded-lg border p-4 cursor-pointer transition-all hover:bg-accent">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted">
                    <Bell className="h-5 w-5" />
                  </div>
                  <div className="flex-1 space-y-1">
                    <p className="text-sm font-medium leading-none">
                      System Maintenance Scheduled
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Platform will be under maintenance this Sunday 02:00-04:00 UTC
                    </p>
                    <p className="text-xs text-muted-foreground">3 days ago</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </ScrollArea>

        <div className="border-t p-4">
          <Button variant="outline" className="w-full">
            View all notifications
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
