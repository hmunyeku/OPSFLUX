"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  ChevronRight,
  Home,
  LayoutGrid,
  Plus,
  Users,
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
  Building2,
  UsersIcon,
  UserPlus,
  FolderKanban,
  ListTodo,
  BarChart3,
  CalendarDays,
  UserCheck,
  Boxes,
  Plane,
  Ship,
  Car,
  FileEdit,
  Recycle,
  Sparkles,
  Zap,
  FileCheck,
  Package,
  GanttChart,
  SettingsIcon,
  Menu,
  Bell,
  Database,
  HardDrive,
  Mail,
  Clock,
  Save,
  List,
  CheckCircle2,
  Sliders,
  Loader2,
} from "lucide-react"
import * as Icons from "lucide-react"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  useSidebar,
} from "@/components/ui/sidebar"
import { Badge } from "@/components/ui/badge"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card"
import { cn } from "@/lib/utils"
import { useFavorites } from "@/lib/favorites-context"
import { usePermissions } from "@/lib/permissions-context"
import {
  menuPermissions,
  systemMenuPermissions,
  hasMenuAccess,
  type MenuPermissionConfig,
} from "@/lib/menu-permissions"
import { dashboardSystemAPI } from "@/src/api/dashboard-system"
import { DashboardPublic, MenuParentEnum } from "@/src/types/dashboard-system"

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
    label: "Pilotage",
    children: [
      { icon: Home, label: "Bienvenue", href: "/" },
      { icon: LayoutGrid, label: "Galerie", href: "/gallery" },
      { icon: Plus, label: "Nouveau", href: "/new" },
    ],
  },
  {
    icon: Building2,
    label: "Tiers",
    children: [
      { icon: Building2, label: "Entreprises", href: "/tiers/companies" },
      { icon: UsersIcon, label: "Contacts", href: "/tiers/contacts" },
      { icon: UserPlus, label: "Utilisateurs Externes", href: "/tiers/external-users" },
    ],
  },
  {
    icon: FolderKanban,
    label: "Projects",
    children: [
      { icon: FolderKanban, label: "Projets", badge: 8, href: "/projects/list" },
      { icon: ListTodo, label: "Tâches", badge: 24, href: "/projects/tasks" },
      { icon: CalendarDays, label: "Calendrier", href: "/projects/calendar" },
      { icon: GanttChart, label: "Gantt", href: "/projects/gantt" },
      { icon: BarChart3, label: "Suivi", href: "/projects/tracking" },
      { icon: Plus, label: "Nouveau Projet", href: "/projects/new" },
    ],
  },
  {
    icon: CalendarDays,
    label: "Organizer",
    children: [
      { icon: CalendarDays, label: "Planning Multi-Projets", href: "/organizer/planning" },
      { icon: UserCheck, label: "Gestion POB", href: "/organizer/pob" },
      { icon: Boxes, label: "Ressources", href: "/organizer/resources" },
    ],
  },
  {
    icon: FileEdit,
    label: "Rédacteur",
    children: [
      { icon: FileEdit, label: "Documents", badge: 5, href: "/redacteur/documents" },
      { icon: FileCheck, label: "Templates", href: "/redacteur/templates" },
      { icon: Plus, label: "Nouveau", href: "/redacteur/editor/new" },
    ],
  },
  {
    icon: UserCheck,
    label: "POBVue",
    children: [
      { icon: UserCheck, label: "Avis de Séjour", badge: 5, href: "/pobvue/requests" },
      { icon: CheckCircle2, label: "Validations", badge: 12, href: "/pobvue/validations" },
      { icon: Sliders, label: "Logiques", href: "/pobvue/validation-logic" },
      { icon: CalendarDays, label: "Planning", href: "/pobvue/planning" },
      { icon: BarChart3, label: "Statistiques", href: "/pobvue/stats" },
    ],
  },
  {
    icon: Plane,
    label: "TravelWiz",
    children: [
      { icon: Plane, label: "Réservations", badge: 3, href: "/travelwiz/bookings" },
      { icon: Ship, label: "Manifestes Bateau", href: "/travelwiz/boat-manifests" },
      { icon: Plane, label: "Manifestes Hélico", href: "/travelwiz/heli-manifests" },
      { icon: Car, label: "Manifestes Véhicule", href: "/travelwiz/vehicle-manifests" },
      { icon: Package, label: "Retours Site", badge: 5, href: "/travelwiz/back-cargo" },
      { icon: Activity, label: "Tracking", href: "/travelwiz/tracking" },
      { icon: BarChart3, label: "Consommation", href: "/travelwiz/consumption" },
    ],
  },
  {
    icon: FileCheck,
    label: "MOCVue",
    children: [
      { icon: FileCheck, label: "Demandes", badge: 2, href: "/mocvue/requests" },
      { icon: Activity, label: "Workflow", href: "/mocvue/workflow" },
      { icon: BarChart3, label: "Suivi", href: "/mocvue/tracking" },
    ],
  },
  {
    icon: Sparkles,
    label: "CleanVue",
    children: [
      { icon: Sparkles, label: "Audits 5S", href: "/cleanvue/audits" },
      { icon: Recycle, label: "Scrapping", href: "/cleanvue/scrapping" },
      { icon: Boxes, label: "Retours Site", href: "/cleanvue/returns" },
    ],
  },
  {
    icon: Zap,
    label: "PowerTrace",
    children: [
      { icon: Activity, label: "Consommation Actuelle", href: "/powertrace/current" },
      { icon: BarChart3, label: "Prévisions", href: "/powertrace/forecast" },
      { icon: Zap, label: "Dimensionnement", href: "/powertrace/sizing" },
    ],
  },
]

const systemMenuItems: MenuItem[] = [
  {
    icon: Settings,
    label: "Paramètres",
    children: [
      { icon: SettingsIcon, label: "Général", href: "/settings/general" },
      { icon: Package, label: "Modules", href: "/settings/modules" },
      { icon: List, label: "Listes", href: "/settings/lists" },
      { icon: Menu, label: "Menus & Navigation", href: "/settings/menus" },
      { icon: Bell, label: "Notifications", href: "/settings/notifications" },
      { icon: Database, label: "Base de Données", href: "/settings/database" },
      { icon: HardDrive, label: "Cache", href: "/settings/cache" },
      { icon: Clock, label: "File d'Attente", href: "/settings/queue" },
      { icon: Save, label: "Sauvegardes", href: "/settings/backups" },
      { icon: Mail, label: "Email", href: "/settings/email" },
    ],
  },
  {
    icon: Code,
    label: "Développeurs",
    children: [
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

// Hover submenu component for collapsed sidebar
interface HoverSubmenuProps {
  item: MenuItem
  children: MenuItem[]
  dashboards?: DashboardPublic[]
  activeItem: string
  setActiveItem: (item: string) => void
  isCollapsed: boolean
  defaultOpen?: boolean
  isParentActive?: boolean
}

function CollapsibleMenuItem({
  item,
  children,
  dashboards = [],
  activeItem,
  setActiveItem,
  isCollapsed,
  defaultOpen = false,
  isParentActive = false,
}: HoverSubmenuProps) {
  const allChildren = [
    ...children,
    ...dashboards.map((d) => ({
      icon: d.menu_icon
        ? (Icons[d.menu_icon as keyof typeof Icons] as React.ElementType) || Icons.LayoutDashboard
        : Icons.LayoutDashboard,
      label: d.menu_label,
      href: `/dashboards-system/${d.id}`,
      badge: d.is_home_page ? "Home" : undefined,
    })),
  ]

  // When collapsed, show hover card
  if (isCollapsed) {
    return (
      <HoverCard openDelay={0} closeDelay={100}>
        <HoverCardTrigger asChild>
          <SidebarMenuButton
            className={cn(
              "cursor-pointer",
              isParentActive && "bg-accent text-accent-foreground"
            )}
          >
            <item.icon className={cn(
              "h-5 w-5 transition-colors",
              isParentActive && "text-primary"
            )} />
            <span className="font-medium">{item.label}</span>
          </SidebarMenuButton>
        </HoverCardTrigger>
        <HoverCardContent
          side="right"
          align="start"
          sideOffset={8}
          className="w-56 p-1"
        >
          <div className="flex flex-col">
            <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground border-b mb-1">
              {item.label}
            </div>
            {allChildren.map((child) => (
              <Link
                key={child.label}
                href={child.href || "#"}
                onClick={() => child.href && setActiveItem(child.href)}
                className={cn(
                  "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
                  "hover:bg-accent hover:text-accent-foreground",
                  activeItem === child.href && "bg-accent text-accent-foreground font-medium"
                )}
              >
                <child.icon className="h-3.5 w-3.5" />
                <span className="flex-1">{child.label}</span>
                {child.badge && (
                  <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
                    {child.badge}
                  </Badge>
                )}
              </Link>
            ))}
          </div>
        </HoverCardContent>
      </HoverCard>
    )
  }

  // When expanded, show collapsible
  return (
    <Collapsible defaultOpen={defaultOpen} className="group/collapsible">
      <CollapsibleTrigger asChild>
        <SidebarMenuButton tooltip={item.label}>
          <item.icon className="h-4 w-4 group-data-[state=open]/collapsible:text-primary" />
          <span className="font-medium">{item.label}</span>
          <ChevronRight className="ml-auto h-3 w-3 transition-transform group-data-[state=open]/collapsible:rotate-90" />
        </SidebarMenuButton>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <SidebarMenuSub>
          {children.map((child) => (
            <SidebarMenuSubItem key={child.label}>
              <SidebarMenuSubButton
                asChild
                isActive={activeItem === child.href}
                onClick={() => child.href && setActiveItem(child.href)}
              >
                <Link href={child.href || "#"}>
                  <child.icon className="h-3 w-3" />
                  <span>{child.label}</span>
                  {child.badge && (
                    <Badge variant="secondary" className="ml-auto h-5 px-1.5 text-[10px]">
                      {child.badge}
                    </Badge>
                  )}
                </Link>
              </SidebarMenuSubButton>
            </SidebarMenuSubItem>
          ))}
          {dashboards.map((dashboard) => {
            const DashboardIcon = dashboard.menu_icon
              ? (Icons[dashboard.menu_icon as keyof typeof Icons] as React.ComponentType<{ className?: string }>)
              : Icons.LayoutDashboard
            const dashboardHref = `/dashboards-system/${dashboard.id}`

            return (
              <SidebarMenuSubItem key={dashboard.id}>
                <SidebarMenuSubButton
                  asChild
                  isActive={activeItem === dashboardHref}
                  onClick={() => setActiveItem(dashboardHref)}
                >
                  <Link href={dashboardHref}>
                    {DashboardIcon && <DashboardIcon className="h-3 w-3" />}
                    <span>{dashboard.menu_label}</span>
                    {dashboard.is_home_page && (
                      <Badge variant="secondary" className="ml-auto h-5 px-1.5 text-[10px]">
                        Home
                      </Badge>
                    )}
                  </Link>
                </SidebarMenuSubButton>
              </SidebarMenuSubItem>
            )
          })}
        </SidebarMenuSub>
      </CollapsibleContent>
    </Collapsible>
  )
}

export function AppSidebar() {
  const pathname = usePathname()
  const [activeItem, setActiveItem] = React.useState("/logistics/shipments")
  const { favorites } = useFavorites()
  const { hasPermission, hasAnyPermission, hasAllPermissions, isLoading } = usePermissions()
  const [dashboards, setDashboards] = React.useState<DashboardPublic[]>([])
  const [dashboardsLoading, setDashboardsLoading] = React.useState(true)
  const { state } = useSidebar()
  const isCollapsed = state === "collapsed"

  // Helper to check if menu item is the parent of current path
  const isMenuParentOfCurrentPage = React.useCallback(
    (item: MenuItem, menuDashboards: DashboardPublic[] = []) => {
      // Check children
      if (item.children) {
        for (const child of item.children) {
          if (child.href && pathname.startsWith(child.href)) {
            return true
          }
        }
      }
      // Check dashboards
      for (const d of menuDashboards) {
        if (pathname === `/dashboards-system/${d.id}`) {
          return true
        }
      }
      return false
    },
    [pathname]
  )

  // Charger les dashboards
  React.useEffect(() => {
    const loadDashboards = async () => {
      try {
        setDashboardsLoading(true)
        const response = await dashboardSystemAPI.getDashboards({
          is_archived: false,
          limit: 1000,
        })
        setDashboards(response.data.filter((d) => d.show_in_sidebar))
      } catch (error) {
        console.error("Error loading dashboards:", error)
        setDashboards([])
      } finally {
        setDashboardsLoading(false)
      }
    }
    loadDashboards()
  }, [])

  /**
   * Group dashboards by menu parent
   */
  const dashboardsByMenu = React.useMemo(() => {
    const grouped: Record<string, DashboardPublic[]> = {}
    dashboards.forEach((dashboard) => {
      const menuKey = dashboard.menu_parent
      if (!grouped[menuKey]) {
        grouped[menuKey] = []
      }
      grouped[menuKey].push(dashboard)
    })
    // Sort dashboards by menu_order
    Object.keys(grouped).forEach((key) => {
      grouped[key].sort((a, b) => (a.menu_order || 999) - (b.menu_order || 999))
    })
    return grouped
  }, [dashboards])

  /**
   * Filter menu items based on user permissions and add dashboards
   */
  const filterMenuItems = React.useMemo(() => {
    return (items: MenuItem[], permissionsConfig: Record<string, MenuPermissionConfig>) => {
      if (isLoading) return items // Show all while loading

      return items.filter((item) => {
        const config = permissionsConfig[item.label]

        // Check parent menu access
        if (!hasMenuAccess(config, hasPermission, hasAnyPermission, hasAllPermissions)) {
          return false
        }

        // Filter children if they exist
        if (item.children && config?.children) {
          const filteredChildren = item.children.filter((child) => {
            const childConfig = config.children?.[child.label]
            return hasMenuAccess(childConfig, hasPermission, hasAnyPermission, hasAllPermissions)
          })

          // If parent has no accessible children, hide the parent
          if (filteredChildren.length === 0) {
            return false
          }

          // Update item with filtered children
          item.children = filteredChildren
        }

        return true
      })
    }
  }, [isLoading, hasPermission, hasAnyPermission, hasAllPermissions])

  const filteredMenuItems = React.useMemo(
    () => filterMenuItems(menuItems, menuPermissions),
    [filterMenuItems]
  )

  const filteredSystemMenuItems = React.useMemo(
    () => filterMenuItems(systemMenuItems, systemMenuPermissions),
    [filterMenuItems]
  )

  /**
   * Map menu labels to MenuParentEnum
   */
  const menuLabelToEnum: Record<string, MenuParentEnum> = {
    "Pilotage": MenuParentEnum.PILOTAGE,
    "Tiers": MenuParentEnum.TIERS,
    "Projects": MenuParentEnum.PROJECTS,
    "Organizer": MenuParentEnum.ORGANIZER,
    "Rédacteur": MenuParentEnum.REDACTEUR,
    "POBVue": MenuParentEnum.POBVUE,
    "TravelWiz": MenuParentEnum.TRAVELWIZ,
    "MOCVue": MenuParentEnum.MOCVUE,
    "CleanVue": MenuParentEnum.CLEANVUE,
    "PowerTrace": MenuParentEnum.POWERTRACE,
  }

  return (
    <Sidebar collapsible="icon" variant="sidebar">
      {/* Main Menu Items - Scrollable */}
      <SidebarContent>
        <SidebarGroup>
          <SidebarMenu>
            {/* Favoris Menu - Hidden when no favorites */}
            {favorites.length > 0 && (
              <SidebarMenuItem>
                {isCollapsed ? (
                  <HoverCard openDelay={0} closeDelay={100}>
                    <HoverCardTrigger asChild>
                      <SidebarMenuButton className="cursor-pointer">
                        <Star className="h-5 w-5 fill-primary text-primary" />
                        <span className="font-medium">Favoris</span>
                      </SidebarMenuButton>
                    </HoverCardTrigger>
                    <HoverCardContent
                      side="right"
                      align="start"
                      sideOffset={8}
                      className="w-56 p-1"
                    >
                      <div className="flex flex-col">
                        <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground border-b mb-1 flex items-center gap-2">
                          <Star className="h-3 w-3 fill-primary text-primary" />
                          Favoris
                          <Badge variant="secondary" className="ml-auto h-4 px-1 text-[9px]">
                            {favorites.length}
                          </Badge>
                        </div>
                        {favorites.map((favorite) => (
                          <Link
                            key={favorite.id}
                            href={favorite.path}
                            onClick={() => setActiveItem(favorite.path)}
                            className={cn(
                              "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
                              "hover:bg-accent hover:text-accent-foreground",
                              activeItem === favorite.path && "bg-accent text-accent-foreground font-medium"
                            )}
                          >
                            <Star className="h-3.5 w-3.5 fill-primary text-primary" />
                            <span className="flex-1 truncate">{favorite.title}</span>
                          </Link>
                        ))}
                      </div>
                    </HoverCardContent>
                  </HoverCard>
                ) : (
                  <Collapsible defaultOpen={favorites.length > 0} className="group/collapsible">
                    <CollapsibleTrigger asChild>
                      <SidebarMenuButton tooltip="Favoris">
                        <Star className="h-4 w-4 group-data-[state=open]/collapsible:text-primary group-data-[state=open]/collapsible:fill-primary" />
                        <span className="font-medium">Favoris</span>
                        <Badge variant="secondary" className="ml-auto h-5 px-1.5 text-[10px]">
                          {favorites.length}
                        </Badge>
                        <ChevronRight className="ml-auto h-3 w-3 transition-transform group-data-[state=open]/collapsible:rotate-90" />
                      </SidebarMenuButton>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <SidebarMenuSub>
                        {favorites.map((favorite) => (
                          <SidebarMenuSubItem key={favorite.id}>
                            <SidebarMenuSubButton
                              asChild
                              isActive={activeItem === favorite.path}
                              onClick={() => setActiveItem(favorite.path)}
                            >
                              <Link href={favorite.path} title={favorite.title}>
                                <Star className="h-3 w-3 fill-primary text-primary" />
                                <span className="truncate">{favorite.title}</span>
                                {favorite.category && (
                                  <Badge variant="outline" className="ml-auto h-4 px-1 text-[9px] hidden xl:flex">
                                    {favorite.category}
                                  </Badge>
                                )}
                              </Link>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        ))}
                      </SidebarMenuSub>
                    </CollapsibleContent>
                  </Collapsible>
                )}
              </SidebarMenuItem>
            )}

            {/* Other Menu Items - Filtered by permissions with Dashboards */}
            {filteredMenuItems.map((item) => {
              const menuEnum = menuLabelToEnum[item.label]
              const menuDashboards = menuEnum ? (dashboardsByMenu[menuEnum] || []) : []
              const isParentActive = isMenuParentOfCurrentPage(item, menuDashboards)

              return (
                <SidebarMenuItem key={item.label}>
                  {item.children || menuDashboards.length > 0 ? (
                    <CollapsibleMenuItem
                      item={item}
                      children={item.children || []}
                      dashboards={menuDashboards}
                      activeItem={activeItem}
                      setActiveItem={setActiveItem}
                      isCollapsed={isCollapsed}
                      defaultOpen={item.label === "Pilotage"}
                      isParentActive={isParentActive}
                    />
                  ) : (
                    <SidebarMenuButton
                      asChild
                      isActive={activeItem === item.href}
                      onClick={() => item.href && setActiveItem(item.href)}
                      tooltip={item.label}
                    >
                      <Link href={item.href || "#"}>
                        <item.icon className="h-4 w-4" />
                        <span>{item.label}</span>
                        {item.badge && (
                          <Badge variant="secondary" className="ml-auto h-5 px-1.5 text-[10px]">
                            {item.badge}
                          </Badge>
                        )}
                      </Link>
                    </SidebarMenuButton>
                  )}
                </SidebarMenuItem>
              )
            })}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>

      {/* System Menu Items - Sticky at bottom - Filtered by permissions */}
      <SidebarFooter className="border-t">
        <SidebarGroup>
          <SidebarMenu>
            {filteredSystemMenuItems.map((item) => {
              const isParentActive = isMenuParentOfCurrentPage(item)
              return (
              <SidebarMenuItem key={item.label}>
                {item.children ? (
                  <CollapsibleMenuItem
                    item={item}
                    children={item.children}
                    activeItem={activeItem}
                    setActiveItem={setActiveItem}
                    isCollapsed={isCollapsed}
                    isParentActive={isParentActive}
                  />
                ) : (
                  <SidebarMenuButton
                    asChild
                    isActive={activeItem === item.href}
                    onClick={() => item.href && setActiveItem(item.href)}
                    tooltip={item.label}
                  >
                    <Link href={item.href || "#"}>
                      <item.icon className="h-4 w-4" />
                      <span>{item.label}</span>
                    </Link>
                  </SidebarMenuButton>
                )}
              </SidebarMenuItem>
            )})}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarFooter>
    </Sidebar>
  )
}
