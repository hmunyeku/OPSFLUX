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
  IconUpload,
} from "@tabler/icons-react"
import { getDashboards } from "@/lib/api/dashboards"
import { auth } from "@/lib/auth"
import type { UserDashboardsResponse, Dashboard } from "@/types/dashboard"
import Link from "next/link"
import { Skeleton } from "@/components/ui/skeleton"
import { PermissionGuard } from "@/components/permission-guard"
import { useTranslation } from "@/hooks/use-translation"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { DashboardCard } from "@/components/dashboard/dashboard-card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { DashboardCreateDrawer } from "@/components/dashboard/dashboard-create-drawer"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

export default function DashboardsPageNew() {
  const { t } = useTranslation()
  const [dashboards, setDashboards] = useState<UserDashboardsResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [activeTab, setActiveTab] = useState<"all" | "my" | "mandatory" | "shared">("all")
  const [sortBy, setSortBy] = useState<"recent" | "name" | "widgets">("recent")
  const [createDrawerOpen, setCreateDrawerOpen] = useState(false)

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

  const handleDashboardCreated = () => {
    // Refresh dashboards list
    const token = auth.getToken()
    if (token) {
      getDashboards(token).then(setDashboards).catch(console.error)
    }
  }

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
    <div className="flex flex-col items-center justify-center text-center">
      <div className="rounded-full bg-muted/50 p-6 mb-4">
        <Icon className="h-10 w-10 text-muted-foreground" />
      </div>
      <h3 className="text-lg font-semibold mb-2">{title}</h3>
      <p className="text-sm text-muted-foreground max-w-md mb-6">{description}</p>
      <PermissionGuard permission="dashboards.create">
        <Button onClick={() => setCreateDrawerOpen(true)}>
          <IconPlus className="h-4 w-4 mr-2" />
          Créer mon premier dashboard
        </Button>
      </PermissionGuard>
    </div>
  )

  return (
    <PermissionGuard permission="dashboards.read">
      <Header />
      <div className="flex flex-col h-[calc(100vh-4rem)]">
        {/* Compact Header */}
        <div className="flex-none border-b bg-card/30 backdrop-blur-sm">
          <div className="px-4 lg:px-6 py-4">
            <div className="flex items-center justify-between gap-4 mb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <IconChartBar className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h1 className="text-xl font-semibold">
                    {t("dashboards.title", "Dashboards")}
                  </h1>
                  <p className="text-sm text-muted-foreground">
                    {t("dashboards.description", "Créez et gérez vos dashboards personnalisés")}
                  </p>
                </div>
              </div>
              <PermissionGuard permission="dashboards.create">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button>
                      <IconPlus className="h-4 w-4 mr-2" />
                      {t("dashboards.new", "Nouveau")}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => setCreateDrawerOpen(true)}>
                      <IconPlus className="h-4 w-4 mr-2" />
                      Créer un dashboard
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setCreateDrawerOpen(true)}>
                      <IconUpload className="h-4 w-4 mr-2" />
                      Importer depuis JSON
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </PermissionGuard>
            </div>

            {/* Compact Stats */}
            <div className="grid grid-cols-4 gap-3">
              {stats.map((stat) => (
                <div
                  key={stat.label}
                  className="bg-background/60 rounded-lg p-3 border"
                >
                  <div className="flex items-center gap-2">
                    <div className={`p-1.5 rounded ${stat.bgColor}`}>
                      <stat.icon className={`h-4 w-4 ${stat.color}`} />
                    </div>
                    <div>
                      <p className="text-lg font-semibold">{stat.value}</p>
                      <p className="text-xs text-muted-foreground">{stat.label}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Search & Filters Bar */}
        <div className="flex-none border-b bg-background/50 backdrop-blur-sm">
          <div className="px-4 lg:px-6 py-3">
            <div className="flex items-center gap-3">
              <div className="relative flex-1 max-w-md">
                <IconSearch className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Rechercher un dashboard..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 h-9"
                />
              </div>
              <Select value={sortBy} onValueChange={(value: any) => setSortBy(value)}>
                <SelectTrigger className="w-[160px] h-9">
                  <IconFilter className="h-4 w-4 mr-2" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="recent">Plus récents</SelectItem>
                  <SelectItem value="name">Par nom</SelectItem>
                  <SelectItem value="widgets">Par widgets</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* Content Area with Tabs */}
        <div className="flex-1 overflow-auto">
          <Tabs value={activeTab} onValueChange={(value: any) => setActiveTab(value)} className="h-full flex flex-col">
            <div className="flex-none border-b bg-background/50">
              <div className="px-4 lg:px-6">
                <TabsList className="h-10 bg-transparent">
                  <TabsTrigger value="all" className="text-sm">
                    Tous <span className="ml-1.5 text-xs text-muted-foreground">({totalCount})</span>
                  </TabsTrigger>
                  <TabsTrigger value="my" className="text-sm">
                    Mes dashboards <span className="ml-1.5 text-xs text-muted-foreground">({dashboards?.my_dashboards?.length || 0})</span>
                  </TabsTrigger>
                  <TabsTrigger value="mandatory" className="text-sm">
                    Obligatoires <span className="ml-1.5 text-xs text-muted-foreground">({dashboards?.mandatory_dashboards?.length || 0})</span>
                  </TabsTrigger>
                  <TabsTrigger value="shared" className="text-sm">
                    Partagés <span className="ml-1.5 text-xs text-muted-foreground">({dashboards?.shared_dashboards?.length || 0})</span>
                  </TabsTrigger>
                </TabsList>
              </div>
            </div>

            <div className="flex-1 overflow-auto">
              <div className="px-4 lg:px-6 py-6">
                {isLoading ? (
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {[...Array(8)].map((_, i) => (
                      <Skeleton key={i} className="h-40 rounded-lg" />
                    ))}
                  </div>
                ) : filteredDashboards.length > 0 ? (
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {filteredDashboards.map((dashboard) => (
                      <DashboardCard
                        key={dashboard.id}
                        dashboard={dashboard}
                        variant={dashboard.is_default_in_menu ? "featured" : "default"}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-[400px]">
                    <EmptyState
                      icon={IconChartBar}
                      title={searchQuery ? "Aucun résultat" : "Aucun dashboard"}
                      description={
                        searchQuery
                          ? "Essayez avec d'autres termes de recherche"
                          : "Commencez par créer votre premier dashboard personnalisé"
                      }
                    />
                  </div>
                )}
              </div>
            </div>
          </Tabs>
        </div>
      </div>

      {/* Create Dashboard Drawer */}
      <DashboardCreateDrawer
        open={createDrawerOpen}
        onOpenChange={setCreateDrawerOpen}
        onSuccess={handleDashboardCreated}
      />
    </PermissionGuard>
  )
}
