import { Link } from "@tanstack/react-router"
import { cn } from "@/lib/utils"
import {
  Home,
  Users,
  Shield,
  Settings,
  FileText,
  BarChart3,
  Calendar,
  Bell,
  Briefcase,
  Ship,
  Plane,
  Package,
  AlertTriangle,
  ChevronRight,
} from "lucide-react"
import useAuth from "@/hooks/useAuth"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { ScrollArea } from "@/components/ui/scroll-area"

interface SidebarProps {
  className?: string
}

interface NavItem {
  title: string
  href: string
  icon: React.ComponentType<{ className?: string }>
  badge?: number
  active?: boolean
}

interface NavGroup {
  title: string
  items: NavItem[]
}

export function Sidebar({ className }: SidebarProps) {
  const { user } = useAuth()

  const navGroups: NavGroup[] = [
    {
      title: "Principal",
      items: [
        { title: "Dashboard", href: "/", icon: Home },
        { title: "Notifications", href: "/notifications", icon: Bell, badge: 3 },
        { title: "Calendar", href: "/calendar", icon: Calendar },
      ],
    },
    {
      title: "Operations",
      items: [
        { title: "HSE Reports", href: "/hse-reports", icon: AlertTriangle },
        { title: "POB Management", href: "/pob", icon: Users },
        { title: "Logistics", href: "/logistics", icon: Package },
        { title: "Offshore Booking", href: "/booking", icon: Ship },
      ],
    },
    {
      title: "Assets & Planning",
      items: [
        { title: "Assets", href: "/assets", icon: Briefcase },
        { title: "Planning", href: "/planning", icon: Calendar },
        { title: "Documents", href: "/documents", icon: FileText },
      ],
    },
    {
      title: "Administration",
      items: [
        { title: "Utilisateurs", href: "/users", icon: Users },
        { title: "Rôles & Permissions", href: "/roles", icon: Shield },
        { title: "Rapports", href: "/reports", icon: BarChart3 },
        { title: "Paramètres", href: "/settings", icon: Settings },
      ],
    },
  ]

  return (
    <aside
      className={cn(
        "fixed left-0 top-16 z-40 h-[calc(100vh-4rem)] w-64 border-r bg-background",
        className
      )}
    >
      <ScrollArea className="h-[calc(100vh-9rem)] px-3 py-4">
        <div className="space-y-4">
          {navGroups.map((group, idx) => (
            <div key={idx} className="space-y-2">
              <h4 className="px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                {group.title}
              </h4>
              <nav className="space-y-1">
                {group.items.map((item, itemIdx) => (
                  <Link
                    key={itemIdx}
                    to={item.href}
                    className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-all hover:bg-accent hover:text-accent-foreground group"
                    activeProps={{
                      className: "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground",
                    }}
                  >
                    <item.icon className="h-4 w-4 shrink-0" />
                    <span className="flex-1">{item.title}</span>
                    {item.badge !== undefined && (
                      <Badge variant="secondary" className="h-5 w-5 shrink-0 rounded-full p-0 flex items-center justify-center text-xs">
                        {item.badge}
                      </Badge>
                    )}
                    <ChevronRight className="h-4 w-4 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </Link>
                ))}
              </nav>
              {idx < navGroups.length - 1 && <Separator className="my-2" />}
            </div>
          ))}
        </div>
      </ScrollArea>

      {/* User footer */}
      <div className="absolute bottom-0 left-0 right-0 border-t bg-background/95 backdrop-blur">
        <div className="p-4">
          <div className="flex items-center gap-3">
            <Avatar className="h-9 w-9">
              <AvatarFallback className="bg-primary text-primary-foreground font-semibold">
                {user?.email?.charAt(0).toUpperCase() || "U"}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 overflow-hidden">
              <p className="text-sm font-medium truncate">{user?.full_name || "User"}</p>
              <p className="text-xs text-muted-foreground truncate">
                {user?.email}
              </p>
            </div>
            <Settings className="h-4 w-4 text-muted-foreground hover:text-foreground cursor-pointer transition-colors" />
          </div>
        </div>
      </div>
    </aside>
  )
}
