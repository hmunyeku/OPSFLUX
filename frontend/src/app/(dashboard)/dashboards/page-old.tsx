"use client"

import { useState, useEffect } from "react"
import { Header } from "@/components/layout/header"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  IconPlus,
  IconLayoutDashboard,
  IconStar,
  IconLock,
  IconUsers,
  IconClock,
  IconChartBar,
  IconPencil,
  IconTrash,
  IconCopy,
  IconWorld,
} from "@tabler/icons-react"
import { getDashboards } from "@/lib/api/dashboards"
import { auth } from "@/lib/auth"
import type { UserDashboardsResponse, Dashboard } from "@/types/dashboard"
import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { PermissionGuard } from "@/components/permission-guard"
import { useTranslation } from "@/hooks/use-translation"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"

export default function DashboardsPage() {
  const { t } = useTranslation()
  const [dashboards, setDashboards] = useState<UserDashboardsResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)

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

  const DashboardCard = ({ dashboard }: { dashboard: Dashboard }) => (
    <Link href={`/dashboards/${dashboard.id}`}>
      <Card className="group hover:shadow-lg hover:border-primary/50 transition-all duration-200 cursor-pointer h-full">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <CardTitle className="text-lg flex items-center gap-2 group-hover:text-primary transition-colors">
                <IconChartBar className="h-5 w-5 flex-shrink-0" />
                <span className="truncate">{dashboard.name}</span>
              </CardTitle>
              {dashboard.description && (
                <CardDescription className="mt-1.5 line-clamp-2">
                  {dashboard.description}
                </CardDescription>
              )}
            </div>
            <div className="flex flex-col gap-1 flex-shrink-0">
              {dashboard.is_mandatory && (
                <Badge variant="secondary" className="text-xs">
                  <IconLock className="h-3 w-3 mr-1" />
                  {t("dashboards.mandatory", "Obligatoire")}
                </Badge>
              )}
              {dashboard.is_public && (
                <Badge variant="outline" className="text-xs">
                  <IconWorld className="h-3 w-3 mr-1" />
                  {t("dashboards.public", "Public")}
                </Badge>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1">
                <IconLayoutDashboard className="h-4 w-4" />
                {(dashboard.widgets || []).length} {t("dashboards.widgets", "widgets")}
              </span>
              {dashboard.created_at && (
                <span className="flex items-center gap-1">
                  <IconClock className="h-4 w-4" />
                  {new Date(dashboard.created_at).toLocaleDateString("fr-FR")}
                </span>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  )

  const DashboardSection = ({
    title,
    description,
    dashboards: items,
    icon: Icon,
    emptyMessage
  }: {
    title: string
    description: string
    dashboards: Dashboard[]
    icon: React.ElementType
    emptyMessage: string
  }) => {
    if (items.length === 0 && !isLoading) return null

    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Icon className="h-5 w-5 text-muted-foreground" />
          <div>
            <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
            <p className="text-sm text-muted-foreground">{description}</p>
          </div>
        </div>

        {isLoading ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[...Array(3)].map((_, i) => (
              <Card key={i}>
                <CardHeader>
                  <Skeleton className="h-6 w-3/4" />
                  <Skeleton className="h-4 w-full mt-2" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-4 w-1/2" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : items.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {items.map((dashboard) => (
              <DashboardCard key={dashboard.id} dashboard={dashboard} />
            ))}
          </div>
        ) : (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-10 text-center">
              <div className="rounded-full bg-muted p-3 mb-4">
                <Icon className="h-6 w-6 text-muted-foreground" />
              </div>
              <p className="text-sm text-muted-foreground">{emptyMessage}</p>
            </CardContent>
          </Card>
        )}
      </div>
    )
  }

  return (
    <PermissionGuard permission="dashboards.read">
      <Header />
      <ScrollArea className="h-[calc(100vh-4rem)]">
        <div className="container py-8 space-y-8">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">
                {t("dashboards.title", "Dashboards")}
              </h1>
              <p className="text-muted-foreground mt-2">
                {t("dashboards.description", "Créez et gérez vos dashboards personnalisés avec des widgets")}
              </p>
            </div>
            <PermissionGuard permission="dashboards.create">
              <Button asChild size="lg">
                <Link href="/dashboards/new">
                  <IconPlus className="h-5 w-5 mr-2" />
                  {t("dashboards.new", "Nouveau dashboard")}
                </Link>
              </Button>
            </PermissionGuard>
          </div>

          <Separator />

          {/* My Dashboards */}
          <DashboardSection
            title={t("dashboards.my_dashboards", "Mes dashboards")}
            description={t("dashboards.my_dashboards_desc", "Dashboards que vous avez créés")}
            dashboards={dashboards?.my_dashboards || []}
            icon={IconChartBar}
            emptyMessage={t("dashboards.no_my_dashboards", "Vous n'avez pas encore créé de dashboard")}
          />

          {/* Mandatory Dashboards */}
          <DashboardSection
            title={t("dashboards.mandatory_dashboards", "Dashboards obligatoires")}
            description={t("dashboards.mandatory_dashboards_desc", "Dashboards configurés par les administrateurs")}
            dashboards={dashboards?.mandatory_dashboards || []}
            icon={IconLock}
            emptyMessage={t("dashboards.no_mandatory_dashboards", "Aucun dashboard obligatoire")}
          />

          {/* Shared Dashboards */}
          <DashboardSection
            title={t("dashboards.shared_dashboards", "Dashboards partagés")}
            description={t("dashboards.shared_dashboards_desc", "Dashboards publics créés par d'autres utilisateurs")}
            dashboards={dashboards?.shared_dashboards || []}
            icon={IconUsers}
            emptyMessage={t("dashboards.no_shared_dashboards", "Aucun dashboard partagé")}
          />
        </div>
      </ScrollArea>
    </PermissionGuard>
  )
}
