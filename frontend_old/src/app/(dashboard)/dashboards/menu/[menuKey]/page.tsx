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
import { IconChartBar, IconStar, IconSparkles, IconLayoutGrid } from "@tabler/icons-react"
import { cn } from "@/lib/utils"
import { motion, AnimatePresence } from "framer-motion"
import { Badge } from "@/components/ui/badge"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"

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

        // Set default active dashboard
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

  const renderDashboardContent = (dashboard: Dashboard | null) => {
    if (isLoadingDashboard) {
      return <Skeleton className="h-96 w-full rounded-2xl" />
    }

    if (!dashboard) return null

    if (dashboard.widgets && dashboard.widgets.length > 0) {
      return (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <DashboardGrid
            dashboard={dashboard}
            widgets={dashboard.widgets}
            isEditMode={false}
            onLayoutChange={() => {}}
            onConfigureWidget={() => {}}
          />
        </motion.div>
      )
    }

    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3 }}
        className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed py-16 bg-gradient-to-br from-muted/30 to-muted/10"
      >
        <div className="p-4 rounded-full bg-muted mb-4">
          <IconLayoutGrid className="h-8 w-8 text-muted-foreground" />
        </div>
        <p className="text-lg font-medium mb-2">Ce dashboard est vide</p>
        <p className="text-sm text-muted-foreground">Aucun widget n'a été ajouté</p>
      </motion.div>
    )
  }

  if (isLoading) {
    return (
      <>
        <Header />
        <div className="container py-8 space-y-6">
          <Skeleton className="h-12 w-full" />
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
        <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
          <div className="container py-12">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col items-center justify-center py-16"
            >
              <div className="p-6 rounded-full bg-muted mb-6">
                <IconChartBar className="h-12 w-12 text-muted-foreground" />
              </div>
              <h3 className="text-xl font-semibold mb-2">Aucun dashboard disponible</h3>
              <p className="text-muted-foreground">Ce menu ne contient pas encore de dashboard</p>
            </motion.div>
          </div>
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
        <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
          <div className="container py-6 space-y-6">
            {/* Breadcrumb */}
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3 }}
            >
              <Breadcrumb>
                <BreadcrumbList>
                  <BreadcrumbItem>
                    <BreadcrumbLink href="/dashboards">Dashboards</BreadcrumbLink>
                  </BreadcrumbItem>
                  <BreadcrumbSeparator />
                  <BreadcrumbItem>
                    <BreadcrumbPage>{dashboard.name}</BreadcrumbPage>
                  </BreadcrumbItem>
                </BreadcrumbList>
              </Breadcrumb>
            </motion.div>

            {/* Header */}
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary/10 via-purple-500/5 to-blue-500/5 p-6 border backdrop-blur-sm"
            >
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_50%,rgba(120,119,198,0.1),rgba(255,255,255,0))]" />

              <div className="relative flex items-start gap-4">
                <div className="p-3 rounded-xl bg-primary/10 backdrop-blur-sm">
                  <IconSparkles className="h-8 w-8 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mb-2">{dashboard.name}</h1>
                  {dashboard.description && (
                    <p className="text-muted-foreground">{dashboard.description}</p>
                  )}
                </div>
              </div>
            </motion.div>

            {/* Content */}
            {renderDashboardContent(activeDashboard)}
          </div>
        </div>
      </>
    )
  }

  // Multiple dashboards - use tabs
  return (
    <>
      <Header />
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
        <div className="container py-6 space-y-6">
          {/* Breadcrumb */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3 }}
          >
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem>
                  <BreadcrumbLink href="/dashboards">Dashboards</BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbPage>{menuKey}</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </motion.div>

          {/* Tabs */}
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
          >
            <Tabs value={activeDashboardId} onValueChange={setActiveDashboardId} className="w-full">
              {/* Modern Tab List */}
              <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary/10 via-purple-500/5 to-blue-500/5 p-2 border backdrop-blur-sm mb-6">
                <TabsList className="w-full justify-start bg-transparent gap-2">
                  <AnimatePresence mode="sync">
                    {dashboards.map((dashboard) => (
                      <TabsTrigger
                        key={dashboard.id}
                        value={dashboard.id}
                        className={cn(
                          "relative px-6 py-3 rounded-xl font-medium transition-all",
                          "data-[state=active]:bg-background data-[state=active]:shadow-lg",
                          "data-[state=inactive]:hover:bg-background/50"
                        )}
                      >
                        <div className="flex items-center gap-2">
                          {dashboard.is_default_in_menu && (
                            <IconStar className="h-4 w-4 text-yellow-500 fill-yellow-500" />
                          )}
                          <span className="truncate max-w-[200px]">{dashboard.name}</span>
                          <Badge variant="secondary" className="ml-2 text-xs">
                            {dashboard.widgets?.length || 0}
                          </Badge>
                        </div>
                      </TabsTrigger>
                    ))}
                  </AnimatePresence>
                </TabsList>
              </div>

              {/* Tab Content */}
              <AnimatePresence mode="wait">
                {dashboards.map((dashboard) => (
                  <TabsContent key={dashboard.id} value={dashboard.id} className="mt-0">
                    {activeDashboardId === dashboard.id && (
                      <div className="space-y-6">
                        {/* Dashboard Description */}
                        {dashboard.description && (
                          <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ duration: 0.3 }}
                            className="rounded-xl bg-muted/50 p-4"
                          >
                            <p className="text-sm text-muted-foreground">{dashboard.description}</p>
                          </motion.div>
                        )}

                        {/* Dashboard Content */}
                        {renderDashboardContent(activeDashboard)}
                      </div>
                    )}
                  </TabsContent>
                ))}
              </AnimatePresence>
            </Tabs>
          </motion.div>
        </div>
      </div>
    </>
  )
}
