"use client"

import { useMemo, useEffect, useState } from "react"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
} from "@/components/ui/sidebar"
import { NavGroup } from "@/components/layout/nav-group"
import { TeamSwitcher } from "@/components/layout/team-switcher"
import { SidebarSync } from "@/components/sidebar-sync"
import { useSidebarData } from "@/hooks/use-sidebar-data"
import { usePermissions } from "@/hooks/use-permissions"
import { filterNavItems } from "@/lib/permissions"
import { usePreferencesContext } from "@/contexts/preferences-context"
import { useModuleContext } from "@/contexts/module-context"
import * as TablerIcons from "@tabler/icons-react"
import { type NavGroup as NavGroupType } from "./types"
import { auth } from "@/lib/auth"
import { getDashboards } from "@/lib/api/dashboards"
import type { Dashboard } from "@/types/dashboard"

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { hasPermission, hasAnyPermission, hasAllPermissions, isLoading } = usePermissions()
  const { preferences } = usePreferencesContext()
  const { moduleMenus } = useModuleContext()
  const sidebarData = useSidebarData()
  const [dashboards, setDashboards] = useState<Dashboard[]>([])

  // Charger les dashboards depuis l'API
  useEffect(() => {
    const token = auth.getToken()
    if (!token) return

    getDashboards(token)
      .then((data) => {
        // Combiner tous les dashboards (obligatoires + mes dashboards)
        const allDashboards = [
          ...(data.mandatory_dashboards || []),
          ...(data.my_dashboards || []),
        ]
        setDashboards(allDashboards)
      })
      .catch((error) => {
        console.error("Failed to load dashboards for sidebar:", error)
      })
  }, [])

  // Convertir les menus des modules en NavGroups
  const moduleNavGroups = useMemo(() => {
    return moduleMenus.map((moduleGroup): NavGroupType => {
      // Mapper les icônes Tabler
      const getIcon = (iconName?: string): React.ElementType => {
        if (!iconName) return TablerIcons.IconPuzzle
        const iconKey = `Icon${iconName}` as keyof typeof TablerIcons
        const IconComponent = TablerIcons[iconKey]
        // Vérifier que c'est bien un component React
        if (typeof IconComponent === 'function') {
          return IconComponent as React.ElementType
        }
        return TablerIcons.IconPuzzle
      }

      return {
        title: moduleGroup.module_name,
        items: moduleGroup.menu_items.map((item) => ({
          title: item.label,
          url: item.route,
          icon: getIcon(item.icon),
          permission: item.permission,
        })),
      }
    })
  }, [moduleMenus])

  // Créer le groupe de navigation des dashboards dynamiques
  const dashboardNavGroup = useMemo((): NavGroupType | null => {
    if (dashboards.length === 0) return null

    return {
      title: "Dashboards",
      items: dashboards.map((dashboard) => ({
        title: dashboard.name,
        url: `/dashboards/${dashboard.id}`,
        icon: dashboard.is_mandatory ? TablerIcons.IconLock : TablerIcons.IconLayoutDashboard,
      })),
    }
  }, [dashboards])

  // Filtrer les groupes de navigation selon les permissions
  const filteredNavGroups = useMemo(() => {
    if (isLoading) {
      return sidebarData.navGroups
    }

    const permissionChecker = {
      hasPermission,
      hasAnyPermission,
      hasAllPermissions,
    }

    // Modifier le groupe "Général" pour remplacer le sous-menu "Dashboards" par les dashboards individuels
    const modifiedSidebarGroups = sidebarData.navGroups.map((group) => {
      if (group.title === "Général") {
        return {
          ...group,
          items: group.items.map((item) => {
            // Remplacer le menu "Dashboards" avec sous-items par les dashboards directs
            if (item.title === "Dashboards" && dashboardNavGroup) {
              return {
                title: "Dashboards",
                icon: TablerIcons.IconChartBar,
                permission: "dashboards.read",
                items: [
                  ...dashboardNavGroup.items,
                  {
                    title: "Tous les dashboards",
                    url: "/dashboards",
                    icon: TablerIcons.IconLayoutDashboard,
                  },
                  {
                    title: "Nouveau dashboard",
                    url: "/dashboards/new",
                    icon: TablerIcons.IconPlus,
                    permission: "dashboards.create",
                  },
                ],
              }
            }
            return item
          }),
        }
      }
      return group
    })

    // Combiner les nav groups modifiés et les modules
    const allNavGroups = [...modifiedSidebarGroups, ...moduleNavGroups]

    return allNavGroups
      .map((group) => ({
        ...group,
        items: filterNavItems(group.items, permissionChecker),
      }))
      .filter((group) => group.items.length > 0)
  }, [hasPermission, hasAnyPermission, hasAllPermissions, isLoading, moduleNavGroups, dashboardNavGroup, dashboards])

  return (
    <div className="relative">
      {/* Synchroniser l'état de la sidebar avec les préférences utilisateur */}
      <SidebarSync />
      <Sidebar collapsible="icon" variant={preferences.sidebarVariant} {...props}>
        <SidebarHeader>
          <TeamSwitcher teams={sidebarData.teams} />
        </SidebarHeader>
        <SidebarContent>
          {filteredNavGroups.map((props) => (
            <NavGroup key={props.title} {...props} />
          ))}
        </SidebarContent>
        <SidebarFooter>
          {/* Avatar supprimé - uniquement dans la barre du haut */}
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>
    </div>
  )
}
