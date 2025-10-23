"use client"

import { useState, useEffect } from "react"
import { useParams } from "next/navigation"
import { auth } from "@/lib/auth"
import { Header } from "@/components/layout/header"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Skeleton } from "@/components/ui/skeleton"
import { getDashboardsByMenu, getDashboard } from "@/lib/api/dashboards"
import type { Dashboard } from "@/types/dashboard"
import DashboardGrid from "@/components/dashboard/dashboard-grid"
import { IconChartBar, IconStar } from "@tabler/icons-react"
import { cn } from "@/lib/utils"

export default function MenuDashboardsPage() {
  const params = useParams()
  const menuKey = params.menuKey as string

  const [dashboards, setDashboards] = useState<Dashboard[]>([])
  const [activeDashboardId, setActiveDashboardId] = useState<string>("")
  const [activeDashboard, setActiveDashboard] = useState<Dashboard | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isLoadingDashboard, setIsLoadingDashboard] = useState(false)

  // Fetch dashboards for this menu
  useEffect(() => {
    const token = auth.getToken()
    if (!token || !menuKey) return

    const fetchDashboards = async () => {
      setIsLoading(true)
      try {
        const data = await getDashboardsByMenu(token, menuKey)
        setDashboards(data)

        // Set default active dashboard (first one or the one marked as default)
        if (data.length > 0) {
          const defaultDashboard = data.find(d => d.is_default_in_menu) || data[0]
          setActiveDashboardId(defaultDashboard.id)
        }
      } catch (error) {
        console.error("Failed to fetch dashboards for menu:", error)
      } finally {
        setIsLoading(false)
      }
    }

    fetchDashboards()
  }, [menuKey])

  // Fetch active dashboard details
  useEffect(() => {
    const token = auth.getToken()
    if (!token || !activeDashboardId) return

    const fetchActiveDashboard = async () => {
      setIsLoadingDashboard(true)
      try {
        const data = await getDashboard(token, activeDashboardId)
        setActiveDashboard(data)
      } catch (error) {
        console.error("Failed to fetch dashboard:", error)
      } finally {
        setIsLoadingDashboard(false)
      }
    }

    fetchActiveDashboard()
  }, [activeDashboardId])

  if (isLoading) {
    return (
      <>
        <Header />
        <div className="p-4 space-y-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-96 w-full" />
        </div>
      </>
    )
  }

  if (dashboards.length === 0) {
    return (
      <>
        <Header />
        <div className="flex flex-col items-center justify-center h-[50vh] gap-4">
          <IconChartBar className="h-12 w-12 text-muted-foreground" />
          <p className="text-muted-foreground">Aucun dashboard disponible pour ce menu</p>
        </div>
      </>
    )
  }

  // Single dashboard - no tabs
  if (dashboards.length === 1) {
    const dashboard = activeDashboard || dashboards[0]

    return (
      <>
        <Header />
        <div className="p-4 space-y-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{dashboard.name}</h1>
            {dashboard.description && (
              <p className="text-sm text-muted-foreground mt-1">{dashboard.description}</p>
            )}
          </div>

          {isLoadingDashboard ? (
            <Skeleton className="h-96 w-full" />
          ) : activeDashboard && activeDashboard.widgets ? (
            <DashboardGrid
              dashboard={activeDashboard}
              widgets={activeDashboard.widgets || []}
              isEditMode={false}
              onLayoutChange={() => {}}
              onConfigureWidget={() => {}}
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-[50vh] border-2 border-dashed rounded-lg">
              <p className="text-muted-foreground">Ce dashboard ne contient aucun widget</p>
            </div>
          )}
        </div>
      </>
    )
  }

  // Multiple dashboards - use tabs
  return (
    <>
      <Header />
      <div className="p-4 space-y-4">
        <Tabs value={activeDashboardId} onValueChange={setActiveDashboardId} className="w-full">
          <TabsList className="w-full justify-start border-b rounded-none h-auto p-0 bg-transparent">
            {dashboards.map((dashboard) => (
              <TabsTrigger
                key={dashboard.id}
                value={dashboard.id}
                className={cn(
                  "relative rounded-none border-b-2 border-transparent",
                  "data-[state=active]:border-primary data-[state=active]:bg-transparent",
                  "data-[state=active]:shadow-none"
                )}
              >
                <div className="flex items-center gap-2">
                  {dashboard.is_default_in_menu && (
                    <IconStar className="h-3 w-3 text-yellow-500 fill-yellow-500" />
                  )}
                  {dashboard.name}
                </div>
              </TabsTrigger>
            ))}
          </TabsList>

          {dashboards.map((dashboard) => (
            <TabsContent key={dashboard.id} value={dashboard.id} className="mt-4">
              {dashboard.description && (
                <p className="text-sm text-muted-foreground mb-4">{dashboard.description}</p>
              )}

              {isLoadingDashboard && activeDashboardId === dashboard.id ? (
                <Skeleton className="h-96 w-full" />
              ) : activeDashboard && activeDashboardId === dashboard.id ? (
                activeDashboard.widgets && activeDashboard.widgets.length > 0 ? (
                  <DashboardGrid
                    dashboard={activeDashboard}
                    widgets={activeDashboard.widgets}
                    isEditMode={false}
                    onLayoutChange={() => {}}
                    onConfigureWidget={() => {}}
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center h-[50vh] border-2 border-dashed rounded-lg">
                    <p className="text-muted-foreground">Ce dashboard ne contient aucun widget</p>
                  </div>
                )
              ) : null}
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </>
  )
}
