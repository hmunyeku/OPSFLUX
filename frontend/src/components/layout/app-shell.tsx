import { useState } from "react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Input } from "@/components/ui/input"
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
  Package,
  AlertTriangle,
  Search,
  Menu,
  X,
  ChevronRight,
  LogOut,
  User,
  Moon,
  Sun,
} from "lucide-react"
import { Link } from "@tanstack/react-router"
import useAuth from "@/hooks/useAuth"
import { ThemeToggle } from "@/components/theme-toggle"

interface NavItem {
  title: string
  href: string
  icon: React.ComponentType<{ className?: string }>
  badge?: number
}

interface NavGroup {
  title: string
  items: NavItem[]
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [mobileOpen, setMobileOpen] = useState(false)
  const { user, logout } = useAuth()

  const navGroups: NavGroup[] = [
    {
      title: "Principal",
      items: [
        { title: "Dashboard", href: "/", icon: Home },
        { title: "Analytics", href: "/analytics", icon: BarChart3 },
        { title: "Calendar", href: "/calendar", icon: Calendar },
      ],
    },
    {
      title: "Operations",
      items: [
        { title: "HSE Reports", href: "/hse-reports", icon: AlertTriangle, badge: 3 },
        { title: "POB Management", href: "/pob", icon: Users },
        { title: "Logistics", href: "/logistics", icon: Package },
        { title: "Offshore Booking", href: "/booking", icon: Ship },
      ],
    },
    {
      title: "Management",
      items: [
        { title: "Assets", href: "/assets", icon: Briefcase },
        { title: "Documents", href: "/documents", icon: FileText },
        { title: "Utilisateurs", href: "/users", icon: Users },
        { title: "Rôles", href: "/roles", icon: Shield },
      ],
    },
  ]

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Desktop Sidebar */}
      <aside
        className={cn(
          "hidden md:flex flex-col border-r bg-background transition-all duration-300",
          sidebarOpen ? "w-64" : "w-16"
        )}
      >
        {/* Sidebar Header */}
        <div className="flex h-16 items-center justify-between border-b px-4">
          {sidebarOpen && (
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <Ship className="h-5 w-5" />
              </div>
              <span className="font-semibold">OpsFlux</span>
            </div>
          )}
          <Button
            variant="ghost"
            size="icon"
            className={cn("h-8 w-8", !sidebarOpen && "mx-auto")}
            onClick={() => setSidebarOpen(!sidebarOpen)}
          >
            {sidebarOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </Button>
        </div>

        {/* Sidebar Navigation */}
        <ScrollArea className="flex-1 px-3">
          <div className="space-y-4 py-4">
            {navGroups.map((group, idx) => (
              <div key={idx} className="space-y-2">
                {sidebarOpen && (
                  <h4 className="px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {group.title}
                  </h4>
                )}
                <nav className="space-y-1">
                  {group.items.map((item, itemIdx) => (
                    <Link
                      key={itemIdx}
                      to={item.href}
                      className={cn(
                        "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all hover:bg-accent hover:text-accent-foreground group",
                        !sidebarOpen && "justify-center"
                      )}
                      activeProps={{
                        className: "bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground",
                      }}
                    >
                      <item.icon className="h-4 w-4 shrink-0" />
                      {sidebarOpen && (
                        <>
                          <span className="flex-1">{item.title}</span>
                          {item.badge !== undefined && (
                            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1.5 text-xs text-destructive-foreground">
                              {item.badge}
                            </span>
                          )}
                        </>
                      )}
                    </Link>
                  ))}
                </nav>
                {idx < navGroups.length - 1 && sidebarOpen && <Separator className="my-2" />}
              </div>
            ))}
          </div>
        </ScrollArea>

        {/* Sidebar Footer */}
        <div className="border-t p-4">
          <div className={cn("flex items-center gap-3", !sidebarOpen && "justify-center")}>
            <Avatar className="h-9 w-9">
              <AvatarFallback className="bg-primary text-primary-foreground font-semibold">
                {user?.email?.charAt(0).toUpperCase() || "U"}
              </AvatarFallback>
            </Avatar>
            {sidebarOpen && (
              <div className="flex-1 overflow-hidden">
                <p className="text-sm font-medium truncate">{user?.full_name || "User"}</p>
                <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* Mobile Sidebar */}
      {mobileOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-background/80 backdrop-blur-sm md:hidden"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="fixed left-0 top-0 z-50 h-full w-64 border-r bg-background md:hidden">
            <div className="flex h-16 items-center justify-between border-b px-4">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                  <Ship className="h-5 w-5" />
                </div>
                <span className="font-semibold">OpsFlux</span>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setMobileOpen(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <ScrollArea className="h-[calc(100vh-4rem)]">
              {/* Same nav as desktop */}
            </ScrollArea>
          </aside>
        </>
      )}

      {/* Main Content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Header */}
        <header className="flex h-16 items-center gap-4 border-b px-6">
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={() => setMobileOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </Button>

          {/* Search */}
          <div className="flex-1 max-w-md">
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Rechercher... (Cmd+K)"
                className="pl-8 w-full"
              />
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" className="relative">
              <Bell className="h-5 w-5" />
              <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[10px] text-destructive-foreground">
                3
              </span>
            </Button>

            <ThemeToggle />

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="relative h-9 w-9 rounded-full">
                  <Avatar className="h-9 w-9">
                    <AvatarFallback className="bg-primary text-primary-foreground">
                      {user?.email?.charAt(0).toUpperCase() || "U"}
                    </AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>
                  <div className="flex flex-col space-y-1">
                    <p className="text-sm font-medium">{user?.full_name || "User"}</p>
                    <p className="text-xs text-muted-foreground">{user?.email}</p>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem>
                  <User className="mr-2 h-4 w-4" />
                  Profile
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <Settings className="mr-2 h-4 w-4" />
                  Settings
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={logout} className="text-destructive">
                  <LogOut className="mr-2 h-4 w-4" />
                  Log out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto">
          <div className="p-6">
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}
