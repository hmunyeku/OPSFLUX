"use client"

import * as React from "react"
import {
  ChevronLeft,
  ChevronRight,
  Home,
  LayoutGrid,
  Plus,
  Package,
  Truck,
  Warehouse,
  FileText,
  Users,
  Briefcase,
  FileSpreadsheet,
  Wrench,
  Calendar,
  CheckSquare,
  PenTool as Tool,
  Settings,
  Code,
  Key,
  Webhook,
  Activity,
  FileCode,
  UserCircle,
  UsersRound,
  Shield,
  Target,
  Star,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

interface SidebarProps {
  open: boolean
  collapsed: boolean
  onToggleCollapse: () => void
  onClose: () => void
}

interface MenuItem {
  icon: React.ElementType
  label: string
  badge?: number
  href?: string
  children?: MenuItem[]
}

const menuItems: MenuItem[] = [
  {
    icon: Target,
    label: "PILOTAGE",
    children: [
      { icon: Home, label: "Bienvenue", href: "/" },
      { icon: LayoutGrid, label: "Galerie", href: "/gallery" },
      { icon: Plus, label: "Nouveau", href: "/new" },
    ],
  },
  {
    icon: Package,
    label: "Logistique",
    children: [
      { icon: Truck, label: "Expéditions", badge: 12, href: "/logistics/shipments" },
      { icon: FileText, label: "Commandes", href: "/logistics/orders" },
      { icon: Warehouse, label: "Entrepôts", href: "/logistics/warehouses" },
      { icon: FileSpreadsheet, label: "Rapports", href: "/logistics/reports" },
    ],
  },
  {
    icon: Briefcase,
    label: "Gestion",
    children: [
      { icon: Users, label: "Équipe", href: "/management/team" },
      { icon: FileText, label: "Documents", href: "/management/documents" },
      { icon: FileSpreadsheet, label: "Finance", href: "/management/finance" },
    ],
  },
  {
    icon: Wrench,
    label: "Maintenance",
    children: [
      { icon: Calendar, label: "Planning", href: "/maintenance/planning" },
      { icon: CheckSquare, label: "Interventions", href: "/maintenance/interventions" },
      { icon: Tool, label: "Équipements", href: "/maintenance/equipment" },
    ],
  },
]

const systemMenuItems: MenuItem[] = [
  { icon: Settings, label: "Paramètres", href: "/settings" },
  {
    icon: Code,
    label: "Développeurs",
    children: [
      { icon: Activity, label: "Vue d'ensemble", href: "/dev/overview" },
      { icon: Key, label: "Clés API", href: "/dev/api-keys" },
      { icon: Webhook, label: "Hooks et Triggers", href: "/dev/webhooks" },
      { icon: Activity, label: "Événements", href: "/dev/events" },
      { icon: FileCode, label: "Logs", href: "/dev/logs" },
    ],
  },
  {
    icon: Users,
    label: "Utilisateurs",
    children: [
      { icon: UserCircle, label: "Comptes", href: "/users/accounts" },
      { icon: UsersRound, label: "Groupes", href: "/users/groups" },
      { icon: Shield, label: "Rôles et Permissions", href: "/users/roles" },
    ],
  },
]

export function Sidebar({ open, collapsed, onToggleCollapse, onClose }: SidebarProps) {
  const [expandedItems, setExpandedItems] = React.useState<string[]>(["Logistique"])
  const [activeItem, setActiveItem] = React.useState("/logistics/shipments")

  const toggleExpanded = (label: string) => {
    setExpandedItems((prev) => (prev.includes(label) ? prev.filter((item) => item !== label) : [...prev, label]))
  }

  return (
    <>
      {/* Mobile Overlay */}
      {open && <div className="fixed inset-0 z-40 bg-background/80 backdrop-blur-sm lg:hidden" onClick={onClose} />}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed lg:relative inset-y-0 left-0 z-50 flex flex-col border-r bg-sidebar transition-all duration-300",
          collapsed ? "w-16" : "w-64",
          open ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
        )}
      >
        {/* Toggle Button */}
        <div className="flex h-14 items-center justify-between border-b px-3">
          {!collapsed && (
            <div className="flex items-center gap-2">
              <Star className="h-4 w-4 text-primary" />
              <span className="text-sm font-semibold">Favoris</span>
            </div>
          )}
          <Button variant="ghost" size="icon" onClick={onToggleCollapse} className="ml-auto">
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </Button>
        </div>

        {/* Main Menu Items - Scrollable */}
        <ScrollArea className="flex-1 px-2 py-4">
          <div className="space-y-1">
            {menuItems.map((item) => (
              <MenuItemComponent
                key={item.label}
                item={item}
                collapsed={collapsed}
                expanded={expandedItems.includes(item.label)}
                active={activeItem}
                onToggle={() => toggleExpanded(item.label)}
                onSelect={setActiveItem}
              />
            ))}
          </div>
        </ScrollArea>

        {/* System Menu Items - Sticky at bottom */}
        <div className="border-t bg-sidebar px-2 py-3">
          <Separator className="mb-3" />
          <div className="space-y-1">
            {systemMenuItems.map((item) => (
              <MenuItemComponent
                key={item.label}
                item={item}
                collapsed={collapsed}
                expanded={expandedItems.includes(item.label)}
                active={activeItem}
                onToggle={() => toggleExpanded(item.label)}
                onSelect={setActiveItem}
              />
            ))}
          </div>
        </div>
      </aside>
    </>
  )
}

interface MenuItemComponentProps {
  item: MenuItem
  collapsed: boolean
  expanded: boolean
  active: string
  onToggle: () => void
  onSelect: (href: string) => void
}

function MenuItemComponent({ item, collapsed, expanded, active, onToggle, onSelect }: MenuItemComponentProps) {
  const Icon = item.icon
  const hasChildren = item.children && item.children.length > 0
  const isActive = item.href === active

  if (hasChildren) {
    return (
      <div>
        <Button
          variant="ghost"
          className={cn("w-full justify-start gap-2 px-3 h-9 text-sm font-medium", collapsed && "justify-center px-2")}
          onClick={onToggle}
        >
          <Icon className="h-4 w-4 shrink-0" />
          {!collapsed && (
            <>
              <span className="flex-1 text-left">{item.label}</span>
              <ChevronRight className={cn("h-3 w-3 transition-transform", expanded && "rotate-90")} />
            </>
          )}
        </Button>
        {!collapsed && expanded && (
          <div className="ml-4 mt-1 space-y-1 border-l pl-2">
            {item.children.map((child) => {
              const ChildIcon = child.icon
              const isChildActive = child.href === active
              return (
                <Button
                  key={child.label}
                  variant="ghost"
                  className={cn(
                    "w-full justify-start gap-2 px-3 h-8 text-sm",
                    isChildActive && "bg-sidebar-accent text-sidebar-accent-foreground font-medium",
                  )}
                  onClick={() => child.href && onSelect(child.href)}
                >
                  <ChildIcon className="h-3 w-3 shrink-0" />
                  <span className="flex-1 text-left">{child.label}</span>
                  {child.badge && (
                    <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
                      {child.badge}
                    </Badge>
                  )}
                </Button>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  return (
    <Button
      variant="ghost"
      className={cn(
        "w-full justify-start gap-2 px-3 h-9 text-sm",
        collapsed && "justify-center px-2",
        isActive && "bg-sidebar-accent text-sidebar-accent-foreground font-medium",
      )}
      onClick={() => item.href && onSelect(item.href)}
    >
      <Icon className="h-4 w-4 shrink-0" />
      {!collapsed && (
        <>
          <span className="flex-1 text-left">{item.label}</span>
          {item.badge && (
            <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
              {item.badge}
            </Badge>
          )}
        </>
      )}
    </Button>
  )
}
