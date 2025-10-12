import { Link } from "@tanstack/react-router"
import { cn } from "@/lib/utils"
import {
  Home,
  Users,
  Settings,
  FileText,
  Ship,
  AlertTriangle,
  Calendar,
  Package,
  Shield,
  Bell,
  ClipboardList,
  Map,
  Briefcase,
  ChevronDown,
  LucideIcon,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { useState } from "react"

interface SidebarProps {
  className?: string
}

interface NavigationGroup {
  title: string
  items: NavigationItem[]
}

interface NavigationItem {
  title: string
  href: string
  icon: LucideIcon
  badge?: number | string
}

const navigationGroups: NavigationGroup[] = [
  {
    title: "Overview",
    items: [
      {
        title: "Dashboard",
        href: "/",
        icon: Home,
      },
      {
        title: "Map View",
        href: "/map",
        icon: Map,
      },
    ],
  },
  {
    title: "Operations",
    items: [
      {
        title: "Offshore Booking",
        href: "/bookings",
        icon: Ship,
        badge: 12,
      },
      {
        title: "HSE Reports",
        href: "/hse-reports",
        icon: AlertTriangle,
        badge: 8,
      },
      {
        title: "POB Management",
        href: "/pob",
        icon: Users,
      },
      {
        title: "Logistics Tracking",
        href: "/logistics",
        icon: Package,
      },
      {
        title: "Planning",
        href: "/planning",
        icon: Calendar,
      },
    ],
  },
  {
    title: "Compliance",
    items: [
      {
        title: "Permits to Work",
        href: "/permits",
        icon: ClipboardList,
        badge: 3,
      },
      {
        title: "Documents",
        href: "/documents",
        icon: FileText,
      },
      {
        title: "Asset Management",
        href: "/assets",
        icon: Briefcase,
      },
    ],
  },
  {
    title: "System",
    items: [
      {
        title: "Users & Roles",
        href: "/users",
        icon: Users,
      },
      {
        title: "Permissions",
        href: "/permissions",
        icon: Shield,
      },
      {
        title: "Notifications",
        href: "/notifications",
        icon: Bell,
      },
      {
        title: "Settings",
        href: "/settings",
        icon: Settings,
      },
    ],
  },
]

export function Sidebar({ className }: SidebarProps) {
  const [expandedGroups, setExpandedGroups] = useState<string[]>([
    "Overview",
    "Operations",
  ])

  const toggleGroup = (title: string) => {
    setExpandedGroups((prev) =>
      prev.includes(title)
        ? prev.filter((g) => g !== title)
        : [...prev, title]
    )
  }

  return (
    <aside
      className={cn(
        "fixed left-0 top-16 z-40 h-[calc(100vh-4rem)] w-60 border-r bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60",
        className
      )}
    >
      <ScrollArea className="h-[calc(100vh-10rem)]">
        <nav className="flex flex-col gap-4 p-4">
          {navigationGroups.map((group) => {
            const isExpanded = expandedGroups.includes(group.title)
            return (
              <div key={group.title} className="space-y-2">
                <button
                  onClick={() => toggleGroup(group.title)}
                  className="flex w-full items-center justify-between text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
                >
                  {group.title}
                  <ChevronDown
                    className={cn(
                      "h-4 w-4 transition-transform",
                      isExpanded && "rotate-180"
                    )}
                  />
                </button>
                {isExpanded && (
                  <div className="space-y-1">
                    {group.items.map((item) => {
                      const Icon = item.icon
                      return (
                        <Link
                          key={item.href}
                          to={item.href}
                          className="flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-all hover:bg-accent hover:text-accent-foreground"
                          activeProps={{
                            className: "bg-primary/10 text-primary font-semibold",
                          }}
                        >
                          <div className="flex items-center gap-3">
                            <Icon className="h-4 w-4 shrink-0" />
                            <span className="truncate">{item.title}</span>
                          </div>
                          {item.badge && (
                            <Badge
                              variant="secondary"
                              className="h-5 w-5 p-0 flex items-center justify-center text-xs"
                            >
                              {item.badge}
                            </Badge>
                          )}
                        </Link>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </nav>
      </ScrollArea>

      <Separator />

      {/* User footer */}
      <div className="absolute bottom-0 left-0 right-0 border-t bg-background p-4">
        <div className="flex items-center gap-3">
          <Avatar className="h-9 w-9">
            <AvatarImage src="/avatars/user.jpg" />
            <AvatarFallback className="bg-primary/10 text-primary font-semibold">
              JD
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 overflow-hidden">
            <p className="text-sm font-medium truncate">John Doe</p>
            <p className="text-xs text-muted-foreground truncate">
              Operations Manager
            </p>
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <Settings className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </aside>
  )
}
