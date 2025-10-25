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
import { getCacheStats, getCacheHealth, clearCache, type CacheStats, type CacheHealth } from "@/api/cache"
import { useTranslation } from "@/hooks/use-translation"
import { PermissionGuard } from "@/components/permission-guard"
import { usePermissions } from "@/hooks/use-permissions"
import { Skeleton } from "@/components/ui/skeleton"
import { showLoadError, showSuccessToast } from "@/lib/toast-helpers"

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
    } catch (error) {
      showLoadError(t("page.title", "le cache"), fetchData)
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
      showSuccessToast(
        t("toast.clear.success"),
        t("toast.clear.success_description", { keys_deleted: result.keys_deleted })
      )
      setClearDialogOpen(false)
      await fetchData()
    } catch (error) {
      showLoadError(t("page.title", "le cache"), handleClearCache)
    } finally {
      setClearing(false)
    }
  }

  if (loading) {
    return (
      <ContentSection
        title={t("page.title", "Titre")}
        desc={t("page.description", "Description")}
        className="w-full lg:max-w-full"
      >
        <div className="space-y-6">
          <Skeleton className="h-24 w-full" />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        </div>
      </ContentSection>
    )
  }

  const hitRate = stats?.hit_rate || 0
  const isHealthy = health?.healthy || false

  return (
    <ContentSection
      title={t("page.title", "Titre")}
      desc={t("page.description", "Description")}
      className="w-full lg:max-w-full"
    >
      <div className="space-y-4">
        {/* Status & Actions */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <IconDatabase className="h-5 w-5 text-primary" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm">{t("status.label", "Statut")}</span>
                    {isHealthy ? (
                      <Badge variant="default" className="bg-green-600 text-[10px] h-5 px-1.5">
                        <IconCheck className="mr-1 h-3 w-3" />
                        {t("status.connected", "Connecté")}
                      </Badge>
                    ) : (
                      <Badge variant="destructive" className="text-[10px] h-5 px-1.5">
                        <IconX className="mr-1 h-3 w-3" />
                        {t("status.disconnected", "Déconnecté")}
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {health?.backend || 'N/A'}
                  </p>
                </div>
              </div>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={fetchData}
                >
                  <IconRefresh className="h-4 w-4 sm:mr-2" />
                  <span className="hidden sm:inline">{t("actions.refresh", "Actualiser")}</span>
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setClearDialogOpen(true)}
                  disabled={!hasPermission("core.cache.clear")}
                >
                  <IconTrash className="h-4 w-4 sm:mr-2" />
                  <span className="hidden sm:inline">{t("actions.clear_cache", "Vider")}</span>
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Stats Grid - Ultra compact like storage/queue */}
        <div className="grid gap-2 grid-cols-2 sm:grid-cols-4">
          {/* Hits */}
          <Card>
            <CardContent className="p-3">
              <div className="flex items-center gap-2">
                <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-green-500/10 flex items-center justify-center">
                  <IconCheck className="h-4 w-4 text-green-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] text-muted-foreground font-medium mb-1">{t("stats.hits", "Succès")}</p>
                  <div className="text-base font-bold">{stats?.hits.toLocaleString('fr-FR') || 0}</div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Misses */}
          <Card>
            <CardContent className="p-3">
              <div className="flex items-center gap-2">
                <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-red-500/10 flex items-center justify-center">
                  <IconX className="h-4 w-4 text-red-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] text-muted-foreground font-medium mb-1">{t("stats.misses", "Échecs")}</p>
                  <div className="text-base font-bold">{stats?.misses.toLocaleString('fr-FR') || 0}</div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Hit Rate */}
          <Card>
            <CardContent className="p-3">
              <div className="flex items-center gap-2">
                <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
                  <IconChartBar className="h-4 w-4 text-blue-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] text-muted-foreground font-medium mb-1">{t("stats.hit_rate", "Taux")}</p>
                  <div className="text-base font-bold">{hitRate.toFixed(1)}%</div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Total Requests */}
          <Card>
            <CardContent className="p-3">
              <div className="flex items-center gap-2">
                <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-purple-500/10 flex items-center justify-center">
                  <IconActivity className="h-4 w-4 text-purple-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] text-muted-foreground font-medium mb-1">{t("stats.total_requests", "Total")}</p>
                  <div className="text-base font-bold">{stats?.total_requests.toLocaleString('fr-FR') || 0}</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Operations Stats */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{t("operations.title", "Opérations")}</CardTitle>
            <CardDescription className="text-xs">
              {t("operations.description", "Statistiques des opérations de cache")}
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="grid gap-2 grid-cols-1 sm:grid-cols-3">
              <div className="bg-muted/30 rounded-lg p-3">
                <div className="text-xs font-medium text-muted-foreground mb-1">{t("operations.sets", "Écritures")}</div>
                <div className="text-xl font-bold">{stats?.sets.toLocaleString('fr-FR') || 0}</div>
              </div>
              <div className="bg-muted/30 rounded-lg p-3">
                <div className="text-xs font-medium text-muted-foreground mb-1">{t("operations.deletes", "Suppressions")}</div>
                <div className="text-xl font-bold">{stats?.deletes.toLocaleString('fr-FR') || 0}</div>
              </div>
              <div className="bg-muted/30 rounded-lg p-3">
                <div className="text-xs font-medium text-muted-foreground mb-1">{t("operations.redis_hits", "Hits Redis")}</div>
                <div className="text-xl font-bold">{stats?.redis_hits?.toLocaleString('fr-FR') || 'N/A'}</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Performance Tips */}
        {(hitRate < 50 || hitRate >= 80) && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">{t("recommendations.title", "Recommandations")}</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="space-y-2">
                {hitRate < 50 && (
                  <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900">
                    <IconActivity className="h-4 w-4 mt-0.5 text-amber-600 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm text-amber-900 dark:text-amber-100">
                        {t("recommendations.low_hit_rate", "Taux de succès faible")}
                      </p>
                      <p className="text-xs text-amber-700 dark:text-amber-300 mt-0.5">
                        {t("recommendations.low_hit_rate_description", "Considérez augmenter le TTL ou vérifier la configuration")}
                      </p>
                    </div>
                  </div>
                )}
                {hitRate >= 80 && (
                  <div className="flex items-start gap-2 p-3 rounded-lg bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-900">
                    <IconCheck className="h-4 w-4 mt-0.5 text-green-600 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm text-green-900 dark:text-green-100">
                        {t("recommendations.excellent_performance", "Excellentes performances")}
                      </p>
                      <p className="text-xs text-green-700 dark:text-green-300 mt-0.5">
                        {t("recommendations.excellent_performance_description", "Le cache fonctionne de manière optimale")}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Clear Cache Dialog */}
      <AlertDialog open={clearDialogOpen} onOpenChange={setClearDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("dialog.clear.title", "Title")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("dialog.clear.description", "Description")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("dialog.clear.cancel", "Cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleClearCache}
              disabled={clearing}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {clearing ? t("dialog.clear.confirming", "Confirming") : t("dialog.clear.confirm", "Confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ContentSection>
  )
}
