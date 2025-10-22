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
import { useSidebarData } from "@/hooks/use-sidebar-data"
import { usePermissions } from "@/hooks/use-permissions"
import { filterNavItems } from "@/lib/permissions"
import { usePreferencesContext } from "@/contexts/preferences-context"
import { useModuleContext } from "@/contexts/module-context"
import * as TablerIcons from "@tabler/icons-react"
import { type NavGroup as NavGroupType } from "./types"

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { hasPermission, hasAnyPermission, hasAllPermissions, isLoading } = usePermissions()
  const { preferences } = usePreferencesContext()
  const { moduleMenus } = useModuleContext()
  const sidebarData = useSidebarData()

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

    // Combiner les nav groups statiques et les modules
    const allNavGroups = [...sidebarData.navGroups, ...moduleNavGroups]

    return allNavGroups
      .map((group) => ({
        ...group,
        items: filterNavItems(group.items, permissionChecker),
      }))
      .filter((group) => group.items.length > 0)
  }, [hasPermission, hasAnyPermission, hasAllPermissions, isLoading, moduleNavGroups])

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
