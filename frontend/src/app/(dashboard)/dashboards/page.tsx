"use client"

import { useState, useEffect } from "react"
import { Header } from "@/components/layout/header"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  IconPlus,
  IconSearch,
  IconFilter,
  IconChartBar,
  IconStar,
  IconLock,
  IconUsers,
  IconSparkles,
} from "@tabler/icons-react"
import { getDashboards } from "@/lib/api/dashboards"
import { auth } from "@/lib/auth"
import type { UserDashboardsResponse, Dashboard } from "@/types/dashboard"
import Link from "next/link"
import { Skeleton } from "@/components/ui/skeleton"
import { PermissionGuard } from "@/components/permission-guard"
import { useTranslation } from "@/hooks/use-translation"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { DashboardCard } from "@/components/dashboard/dashboard-card"
import { motion, AnimatePresence } from "framer-motion"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

export default function DashboardsPageNew() {
  const { t } = useTranslation()
  const [dashboards, setDashboards] = useState<UserDashboardsResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [activeTab, setActiveTab] = useState<"all" | "my" | "mandatory" | "shared">("all")
  const [sortBy, setSortBy] = useState<"recent" | "name" | "widgets">("recent")

  useEffect(() => {
    const token = auth.getToken()
    if (!token) return

    const fetchDashboards = async () => {
      setIsLoading(true)
      try {
        const data = await getDashboards(token)
        setDashboards(data)
      } catch (error) {
        console.error("Failed to fetch dashboards:", error)
      } finally {
        setIsLoading(false)
      }
    }

    fetchDashboards()
  }, [])

  // Filter and sort dashboards
  const getFilteredDashboards = () => {
    if (!dashboards) return []

    let filtered: Dashboard[] = []

    switch (activeTab) {
      case "my":
        filtered = dashboards.my_dashboards || []
        break
      case "mandatory":
        filtered = dashboards.mandatory_dashboards || []
        break
      case "shared":
        filtered = dashboards.shared_dashboards || []
        break
      case "all":
      default:
        filtered = [
          ...(dashboards.my_dashboards || []),
          ...(dashboards.mandatory_dashboards || []),
          ...(dashboards.shared_dashboards || [])
        ]
        break
    }

    // Search filter
    if (searchQuery) {
      filtered = filtered.filter(d =>
        d.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        d.description?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    }

    // Sort
    switch (sortBy) {
      case "name":
        filtered.sort((a, b) => a.name.localeCompare(b.name))
        break
      case "widgets":
        filtered.sort((a, b) => (b.widgets?.length || 0) - (a.widgets?.length || 0))
        break
      case "recent":
      default:
        filtered.sort((a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        )
        break
    }

    return filtered
  }

  const filteredDashboards = getFilteredDashboards()
  const totalCount = dashboards?.total_count || 0

  const stats = [
    {
      label: "Total",
      value: totalCount,
      icon: IconChartBar,
      color: "text-blue-500",
      bgColor: "bg-blue-500/10"
    },
    {
      label: "Mes dashboards",
      value: dashboards?.my_dashboards?.length || 0,
      icon: IconStar,
      color: "text-yellow-500",
      bgColor: "bg-yellow-500/10"
    },
    {
      label: "Obligatoires",
      value: dashboards?.mandatory_dashboards?.length || 0,
      icon: IconLock,
      color: "text-purple-500",
      bgColor: "bg-purple-500/10"
    },
    {
      label: "Partagés",
      value: dashboards?.shared_dashboards?.length || 0,
      icon: IconUsers,
      color: "text-green-500",
      bgColor: "bg-green-500/10"
    },
  ]

  const EmptyState = ({ icon: Icon, title, description }: {
    icon: any
    title: string
    description: string
  }) => (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="flex flex-col items-center justify-center py-16 text-center"
    >
      <div className="rounded-full bg-muted p-6 mb-6">
        <Icon className="h-12 w-12 text-muted-foreground" />
      </div>
      <h3 className="text-lg font-semibold mb-2">{title}</h3>
      <p className="text-sm text-muted-foreground max-w-md mb-6">{description}</p>
      <PermissionGuard permission="dashboards.create">
        <Button asChild>
          <Link href="/dashboards/new">
            <IconPlus className="h-4 w-4 mr-2" />
            Créer mon premier dashboard
          </Link>
        </Button>
      </PermissionGuard>
    </motion.div>
  )

  return (
    <PermissionGuard permission="dashboards.read">
      <Header />
      <ScrollArea className="h-[calc(100vh-4rem)]">
        <div className="container py-8 space-y-8">
          {/* Hero Section */}
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary/10 via-purple-500/5 to-blue-500/5 p-8 border"
          >
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_50%,rgba(120,119,198,0.1),rgba(255,255,255,0))]" />
            <div className="relative">
              <div className="flex items-start justify-between flex-wrap gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="p-3 rounded-xl bg-primary/10">
                      <IconSparkles className="h-8 w-8 text-primary" />
                    </div>
                    <div>
                      <h1 className="text-3xl font-bold tracking-tight">
                        {t("dashboards.title", "Dashboards")}
                      </h1>
                      <p className="text-muted-foreground mt-1">
                        {t("dashboards.description", "Créez et gérez vos dashboards personnalisés")}
                      </p>
                    </div>
                  </div>
                </div>
                <PermissionGuard permission="dashboards.create">
                  <Button asChild size="lg" className="shadow-lg">
                    <Link href="/dashboards/new">
                      <IconPlus className="h-5 w-5 mr-2" />
                      {t("dashboards.new", "Nouveau dashboard")}
                    </Link>
                  </Button>
                </PermissionGuard>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
                {stats.map((stat, index) => (
                  <motion.div
                    key={stat.label}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: index * 0.1 }}
                    className="bg-background/50 backdrop-blur-sm rounded-xl p-4 border"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${stat.bgColor}`}>
                        <stat.icon className={`h-5 w-5 ${stat.color}`} />
                      </div>
                      <div>
                        <p className="text-2xl font-bold">{stat.value}</p>
                        <p className="text-xs text-muted-foreground">{stat.label}</p>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          </motion.div>

          {/* Filters & Search */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3, delay: 0.2 }}
            className="flex flex-col sm:flex-row gap-4"
          >
            <div className="relative flex-1">
              <IconSearch className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Rechercher un dashboard..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={sortBy} onValueChange={(value: any) => setSortBy(value)}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <IconFilter className="h-4 w-4 mr-2" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="recent">Plus récents</SelectItem>
                <SelectItem value="name">Par nom</SelectItem>
                <SelectItem value="widgets">Par widgets</SelectItem>
              </SelectContent>
            </Select>
          </motion.div>

          {/* Tabs & Dashboards */}
          <Tabs value={activeTab} onValueChange={(value: any) => setActiveTab(value)}>
            <TabsList className="w-full justify-start">
              <TabsTrigger value="all">
                Tous ({totalCount})
              </TabsTrigger>
              <TabsTrigger value="my">
                Mes dashboards ({dashboards?.my_dashboards?.length || 0})
              </TabsTrigger>
              <TabsTrigger value="mandatory">
                Obligatoires ({dashboards?.mandatory_dashboards?.length || 0})
              </TabsTrigger>
              <TabsTrigger value="shared">
                Partagés ({dashboards?.shared_dashboards?.length || 0})
              </TabsTrigger>
            </TabsList>

            <div className="mt-6">
              {isLoading ? (
                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                  {[...Array(6)].map((_, i) => (
                    <Skeleton key={i} className="h-48 rounded-xl" />
                  ))}
                </div>
              ) : filteredDashboards.length > 0 ? (
                <AnimatePresence mode="popLayout">
                  <motion.div
                    layout
                    className="grid gap-6 md:grid-cols-2 lg:grid-cols-3"
                  >
                    {filteredDashboards.map((dashboard, index) => (
                      <motion.div
                        key={dashboard.id}
                        layout
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.9 }}
                        transition={{ duration: 0.2, delay: index * 0.05 }}
                      >
                        <DashboardCard
                          dashboard={dashboard}
                          variant={dashboard.is_default_in_menu ? "featured" : "default"}
                        />
                      </motion.div>
                    ))}
                  </motion.div>
                </AnimatePresence>
              ) : (
                <EmptyState
                  icon={IconChartBar}
                  title={searchQuery ? "Aucun résultat" : "Aucun dashboard"}
                  description={
                    searchQuery
                      ? "Essayez avec d'autres termes de recherche"
                      : "Commencez par créer votre premier dashboard personnalisé"
                  }
                />
              )}
            </div>
          </Tabs>
        </div>
      </ScrollArea>
    </PermissionGuard>
  )
}
