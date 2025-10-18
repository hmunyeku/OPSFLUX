"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  IconRefresh,
  IconTrash,
  IconActivity,
  IconCheck,
  IconX,
  IconDatabase,
  IconChartBar,
} from "@tabler/icons-react"
import ContentSection from "../components/content-section"
import { useToast } from "@/hooks/use-toast"
import { getCacheStats, getCacheHealth, clearCache, type CacheStats, type CacheHealth } from "@/api/cache"
import { useTranslation } from "@/hooks/use-translation"
import { PermissionGuard } from "@/components/permission-guard"
import { usePermissions } from "@/hooks/use-permissions"

export default function CachePage() {
  return (
    <PermissionGuard permission="core.cache.read">
      <CachePageContent />
    </PermissionGuard>
  )
}

function CachePageContent() {
  const { hasPermission } = usePermissions()
  const [stats, setStats] = useState<CacheStats | null>(null)
  const [health, setHealth] = useState<CacheHealth | null>(null)
  const [loading, setLoading] = useState(true)
  const [clearing, setClearing] = useState(false)
  const [clearDialogOpen, setClearDialogOpen] = useState(false)
  const { toast } = useToast()
  const { t } = useTranslation("core.cache")

  const fetchData = async () => {
    setLoading(true)
    try {
      const [statsData, healthData] = await Promise.all([
        getCacheStats(),
        getCacheHealth(),
      ])
      setStats(statsData)
      setHealth(healthData)
    } catch (_error) {
      toast({
        variant: "destructive",
        title: t("toast.error.title"),
        description: t("toast.error.load"),
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

  const handleClearCache = async () => {
    setClearing(true)
    try {
      const result = await clearCache()
      toast({
        title: t("toast.clear.success"),
        description: t("toast.clear.success_description", { keys_deleted: result.keys_deleted }),
      })
      setClearDialogOpen(false)
      await fetchData()
    } catch (_error) {
      toast({
        variant: "destructive",
        title: t("toast.error.title"),
        description: t("toast.error.load"),
      })
    } finally {
      setClearing(false)
    }
  }

  if (loading) {
    return (
      <ContentSection
        title={t("page.title")}
        desc={t("page.description")}
        className="w-full lg:max-w-full"
      >
        <div className="flex items-center justify-center py-8">
          <IconRefresh className="h-6 w-6 animate-spin" />
        </div>
      </ContentSection>
    )
  }

  const hitRate = stats?.hit_rate || 0
  const isHealthy = health?.healthy || false

  return (
    <ContentSection
      title={t("page.title")}
      desc={t("page.description")}
      className="w-full lg:max-w-full"
    >
      <div className="space-y-6">
        {/* Status & Actions */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <IconDatabase className="h-5 w-5 text-muted-foreground" />
            <div>
              <div className="flex items-center gap-2">
                <span className="font-medium">{t("status.label")}</span>
                {isHealthy ? (
                  <Badge variant="default" className="bg-green-600">
                    <IconCheck className="mr-1 h-3 w-3" />
                    {t("status.connected")}
                  </Badge>
                ) : (
                  <Badge variant="destructive">
                    <IconX className="mr-1 h-3 w-3" />
                    {t("status.disconnected")}
                  </Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground">
                {t("status.backend")}: {health?.backend || 'N/A'}
              </p>
            </div>
          </div>

          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={fetchData}
            >
              <IconRefresh className="mr-2 h-4 w-4" />
              {t("actions.refresh")}
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setClearDialogOpen(true)}
              disabled={!hasPermission("core.cache.clear")}
            >
              <IconTrash className="mr-2 h-4 w-4" />
              {t("actions.clear_cache")}
            </Button>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {/* Hits */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{t("stats.hits")}</CardTitle>
              <IconCheck className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.hits.toLocaleString() || 0}</div>
              <p className="text-xs text-muted-foreground">
                {t("stats.hits_description")}
              </p>
            </CardContent>
          </Card>

          {/* Misses */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{t("stats.misses")}</CardTitle>
              <IconX className="h-4 w-4 text-red-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.misses.toLocaleString() || 0}</div>
              <p className="text-xs text-muted-foreground">
                {t("stats.misses_description")}
              </p>
            </CardContent>
          </Card>

          {/* Hit Rate */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{t("stats.hit_rate")}</CardTitle>
              <IconChartBar className="h-4 w-4 text-blue-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{hitRate.toFixed(1)}%</div>
              <p className="text-xs text-muted-foreground">
                {t("stats.hit_rate_description")}
              </p>
            </CardContent>
          </Card>

          {/* Total Requests */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{t("stats.total_requests")}</CardTitle>
              <IconActivity className="h-4 w-4 text-purple-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.total_requests.toLocaleString() || 0}</div>
              <p className="text-xs text-muted-foreground">
                {t("stats.total_requests_description")}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Operations Stats */}
        <Card>
          <CardHeader>
            <CardTitle>{t("operations.title")}</CardTitle>
            <CardDescription>
              {t("operations.description")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <div className="text-sm font-medium text-muted-foreground">{t("operations.sets")}</div>
                <div className="text-2xl font-bold">{stats?.sets.toLocaleString() || 0}</div>
              </div>
              <div>
                <div className="text-sm font-medium text-muted-foreground">{t("operations.deletes")}</div>
                <div className="text-2xl font-bold">{stats?.deletes.toLocaleString() || 0}</div>
              </div>
              <div>
                <div className="text-sm font-medium text-muted-foreground">{t("operations.redis_hits")}</div>
                <div className="text-2xl font-bold">{stats?.redis_hits?.toLocaleString() || 'N/A'}</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Performance Tips */}
        <Card>
          <CardHeader>
            <CardTitle>{t("recommendations.title")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 text-sm">
              {hitRate < 50 && (
                <div className="flex items-start gap-2 text-amber-600">
                  <IconActivity className="h-4 w-4 mt-0.5" />
                  <div>
                    <p className="font-medium">{t("recommendations.low_hit_rate")}</p>
                    <p className="text-xs text-muted-foreground">
                      {t("recommendations.low_hit_rate_description")}
                    </p>
                  </div>
                </div>
              )}
              {hitRate >= 80 && (
                <div className="flex items-start gap-2 text-green-600">
                  <IconCheck className="h-4 w-4 mt-0.5" />
                  <div>
                    <p className="font-medium">{t("recommendations.excellent_performance")}</p>
                    <p className="text-xs text-muted-foreground">
                      {t("recommendations.excellent_performance_description")}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Clear Cache Dialog */}
      <AlertDialog open={clearDialogOpen} onOpenChange={setClearDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("dialog.clear.title")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("dialog.clear.description")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("dialog.clear.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleClearCache}
              disabled={clearing}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {clearing ? t("dialog.clear.confirming") : t("dialog.clear.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ContentSection>
  )
}
