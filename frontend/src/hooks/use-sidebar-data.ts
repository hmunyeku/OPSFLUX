/**
 * Hook to dynamically load sidebar data with home dashboards
 */

import { useState, useEffect } from "react"
import { sidebarData } from "@/components/layout/data/sidebar-data"
import { getHomeDashboards } from "@/lib/api/dashboards"
import type { SidebarData, NavGroup } from "@/components/layout/types"
import type { Dashboard } from "@/types/dashboard"
import { IconLayoutDashboard, IconChartBar, IconPlus } from "@tabler/icons-react"

/**
 * Loads sidebar data with dynamically fetched home dashboards
 */
export function useSidebarData(): SidebarData {
  const [data, setData] = useState<SidebarData>(sidebarData)

  useEffect(() => {
    async function loadHomeDashboards() {
      const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null

      if (!token) {
        console.log("[useSidebarData] No token found, skipping home dashboards load")
        return
      }

      try {
        console.log("[useSidebarData] Fetching home dashboards...")
        const homeDashboards = await getHomeDashboards(token)
        console.log("[useSidebarData] Home dashboards fetched:", homeDashboards)

        // Update the "Tableau de bord" menu item
        const updatedNavGroups: NavGroup[] = sidebarData.navGroups.map((group) => {
          if (group.title === "Général") {
            return {
              ...group,
              items: group.items.map((item) => {
                if (item.title === "Tableau de bord") {
                  // Build the updated items array
                  const updatedItems = []

                  // Premier dashboard home devient "Général"
                  if (homeDashboards.length > 0) {
                    const firstDashboard = homeDashboards[0]
                    updatedItems.push({
                      title: "Général",
                      url: `/dashboards/${firstDashboard.id}`,
                      icon: IconLayoutDashboard,
                    })
                  }

                  // "Galerie" = tous les tableaux
                  updatedItems.push({
                    title: "Galerie",
                    url: "/dashboards",
                    icon: IconChartBar,
                  })

                  // "Nouveau" = créer un tableau
                  updatedItems.push({
                    title: "Nouveau",
                    url: "/dashboards/new",
                    icon: IconPlus,
                    permission: "dashboards.create",
                  })

                  return {
                    ...item,
                    items: updatedItems,
                  }
                }
                return item
              }),
            }
          }
          return group
        })

        setData({
          ...sidebarData,
          navGroups: updatedNavGroups,
        })
        console.log("[useSidebarData] Sidebar data updated successfully")
      } catch (err) {
        console.error("[useSidebarData] Failed to load home dashboards for sidebar:", err)
        // Keep using the default sidebar data on error
      }
    }

    loadHomeDashboards()
  }, [])

  return data
}
