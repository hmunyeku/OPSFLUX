"use client"

import { useMemo } from "react"
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
import { sidebarData } from "./data/sidebar-data"
import { usePermissions } from "@/hooks/use-permissions"
import { filterNavItems } from "@/lib/permissions"
import { usePreferencesContext } from "@/contexts/preferences-context"

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { hasPermission, hasAnyPermission, hasAllPermissions, isLoading } = usePermissions()
  const { preferences } = usePreferencesContext()

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

    return sidebarData.navGroups
      .map((group) => ({
        ...group,
        items: filterNavItems(group.items, permissionChecker),
      }))
      .filter((group) => group.items.length > 0)
  }, [hasPermission, hasAnyPermission, hasAllPermissions, isLoading])

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
