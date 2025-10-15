"use client"

import { useEffect, useState } from "react"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
} from "@/components/ui/sidebar"
import { NavGroup } from "@/components/layout/nav-group"
import { NavUser } from "@/components/layout/nav-user"
import { TeamSwitcher } from "@/components/layout/team-switcher"
import { SidebarSync } from "@/components/sidebar-sync"
import { Skeleton } from "@/components/ui/skeleton"
import { sidebarData } from "./data/sidebar-data"
import { api } from "@/lib/api"

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const [user, setUser] = useState(sidebarData.user)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const loadUser = async () => {
      try {
        setIsLoading(true)
        const token = localStorage.getItem('access_token')
        if (token) {
          const userData = await api.getMe(token)
          // Mise à jour des données utilisateur pour le sidebar
          setUser({
            name: userData.first_name && userData.last_name
              ? `${userData.first_name} ${userData.last_name}`
              : userData.full_name || userData.email,
            email: userData.email,
            avatar: userData.avatar_url || "/avatars/avatar-1.png",
          })
        }
      } catch {
        // En cas d'erreur, on garde les données par défaut
      } finally {
        setIsLoading(false)
      }
    }

    loadUser()
  }, [])

  return (
    <div className="relative">
      {/* Synchroniser l'état de la sidebar avec les préférences utilisateur */}
      <SidebarSync />
      <Sidebar collapsible="icon" {...props}>
        <SidebarHeader>
          <TeamSwitcher teams={sidebarData.teams} />
        </SidebarHeader>
        <SidebarContent>
          {sidebarData.navGroups.map((props) => (
            <NavGroup key={props.title} {...props} />
          ))}
        </SidebarContent>
        <SidebarFooter>
          {isLoading ? (
            <div className="flex items-center gap-2 px-2 py-1.5">
              <Skeleton className="h-8 w-8 rounded-full" />
              <div className="flex flex-col gap-1 flex-1">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-3 w-32" />
              </div>
            </div>
          ) : (
            <NavUser user={user} />
          )}
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>
    </div>
  )
}
