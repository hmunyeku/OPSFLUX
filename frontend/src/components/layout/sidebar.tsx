import { Link } from "@tanstack/react-router"
import { cn } from "@/lib/utils"
import { Home } from "lucide-react"
import useAuth from "@/hooks/useAuth"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"

interface SidebarProps {
  className?: string
}

export function Sidebar({ className }: SidebarProps) {
  const { user } = useAuth()

  return (
    <aside
      className={cn(
        "fixed left-0 top-16 z-40 h-[calc(100vh-4rem)] w-60 border-r bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60",
        className
      )}
    >
      <nav className="p-4">
        <Link
          to="/"
          className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-all hover:bg-accent hover:text-accent-foreground"
          activeProps={{
            className: "bg-secondary text-foreground",
          }}
        >
          <Home className="h-4 w-4" />
          <span>Dashboard</span>
        </Link>
      </nav>

      {/* User footer */}
      <div className="absolute bottom-0 left-0 right-0 border-t bg-background p-4">
        <div className="flex items-center gap-3">
          <Avatar className="h-9 w-9">
            <AvatarFallback className="bg-secondary text-foreground font-semibold">
              {user?.email?.charAt(0).toUpperCase() || "U"}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 overflow-hidden">
            <p className="text-sm font-medium truncate">{user?.full_name || "User"}</p>
            <p className="text-xs text-muted-foreground truncate">
              {user?.email}
            </p>
          </div>
        </div>
      </div>
    </aside>
  )
}
