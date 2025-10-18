"use client"

import { useEffect, useState } from "react"
import { useTranslation } from "@/hooks/use-translation"
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
  IconChartBar,
  IconTrendingUp,
  IconClock,
  IconChartPie,
} from "@tabler/icons-react"
import ContentSection from "../components/content-section"
import { useToast } from "@/hooks/use-toast"
import { getMetricsStats, resetMetrics, type MetricsStats } from "@/api/metrics"
import { PermissionGuard } from "@/components/permission-guard"
import { usePermissions } from "@/hooks/use-permissions"

export default function MetricsPage() {
  return (
    <PermissionGuard permission="core.metrics.read">
      <MetricsPageContent />
    </PermissionGuard>
  )
}

function MetricsPageContent() {
  const { hasPermission } = usePermissions()
  const { t } = useTranslation("core.settings")
  const [stats, setStats] = useState<MetricsStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [resetting, setResetting] = useState(false)
  const [resetDialogOpen, setResetDialogOpen] = useState(false)
  const { toast } = useToast()

  const fetchStats = async () => {
    setLoading(true)
    try {
      const data = await getMetricsStats()
      setStats(data)
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Erreur",
        description: "Impossible de charger les métriques.",
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchStats()
    // Auto-refresh every 30 seconds
    const interval = setInterval(fetchStats, 30000)
    return () => clearInterval(interval)
  }, [])

  const handleResetMetrics = async () => {
    setResetting(true)
    try {
      await resetMetrics()
      toast({
        title: "Métriques réinitialisées",
        description: "Toutes les métriques ont été remises à zéro.",
      })
      setResetDialogOpen(false)
      await fetchStats()
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Erreur",
        description: "Impossible de réinitialiser les métriques.",
      })
    } finally {
      setResetting(false)
    }
  }

  const getMetricIcon = (type: string) => {
    switch (type) {
      case "counter":
        return <IconTrendingUp className="h-4 w-4 text-blue-600" />
      case "gauge":
        return <IconActivity className="h-4 w-4 text-green-600" />
      case "histogram":
        return <IconChartBar className="h-4 w-4 text-purple-600" />
      default:
        return <IconChartPie className="h-4 w-4 text-gray-600" />
    }
  }

  const renderMetricValue = (metric: any) => {
    if (metric.type === "counter" || metric.type === "gauge") {
      if (!metric.values) return "0"
      const values = Object.values(metric.values) as number[]
      const total = values.reduce((sum, val) => sum + val, 0)
      return total.toLocaleString()
    }

    if (metric.type === "histogram" && metric.stats) {
      const stats = Object.values(metric.stats)[0] as any
      if (stats) {
        return `${stats.count} (sum: ${stats.sum.toFixed(2)})`
      }
    }

    return "N/A"
  }

  const renderMetricDetails = (name: string, metric: any) => {
    if (metric.type === "counter" || metric.type === "gauge") {
      if (!metric.values || Object.keys(metric.values).length === 0) {
        return <div className="text-sm text-muted-foreground">Aucune donnée</div>
      }

      return (
        <div className="space-y-1">
          {Object.entries(metric.values).map(([label, value]) => (
            <div key={label} className="flex justify-between text-sm">
              <span className="text-muted-foreground truncate">{label || "total"}</span>
              <span className="font-medium">{(value as number).toLocaleString()}</span>
            </div>
          ))}
        </div>
      )
    }

    if (metric.type === "histogram" && metric.stats) {
      return (
        <div className="space-y-2">
          {Object.entries(metric.stats).map(([label, data]) => {
            const histData = data as any
            return (
              <div key={label} className="space-y-1">
                <div className="text-xs text-muted-foreground">{label || "total"}</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-muted-foreground">Count: </span>
                    <span className="font-medium">{histData.count}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Sum: </span>
                    <span className="font-medium">{histData.sum.toFixed(2)}</span>
                  </div>
                </div>
                {histData.buckets && Object.keys(histData.buckets).length > 0 && (
                  <div className="mt-1">
                    <div className="text-xs text-muted-foreground mb-1">Buckets:</div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-1 text-xs">
                      {Object.entries(histData.buckets).slice(0, 6).map(([bucket, count]) => (
                        <div key={bucket} className="flex justify-between">
                          <span className="text-muted-foreground">≤{bucket}:</span>
                          <span>{count as number}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )
    }

    return null
  }

  if (loading && !stats) {
    return (
      <ContentSection
        title={t("metrics.title")}
        desc={t("metrics.description")}
        className="w-full lg:max-w-full"
      >
        <div className="flex items-center justify-center py-8">
          <IconRefresh className="h-6 w-6 animate-spin" />
        </div>
      </ContentSection>
    )
  }

  const totalMetrics = Object.keys(stats || {}).length
  const counterMetrics = Object.values(stats || {}).filter((m) => m.type === "counter").length
  const gaugeMetrics = Object.values(stats || {}).filter((m) => m.type === "gauge").length
  const histogramMetrics = Object.values(stats || {}).filter((m) => m.type === "histogram").length

  return (
    <ContentSection
      title={t("metrics.title")}
      desc={t("metrics.description")}
      className="w-full lg:max-w-full"
    >
      <div className="space-y-6">
        {/* Actions */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <IconChartBar className="h-5 w-5 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">
              Total: {totalMetrics}
            </span>
          </div>

          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={fetchStats}>
              <IconRefresh className="mr-2 h-4 w-4" />
              <span className="hidden sm:inline">Actualiser</span>
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setResetDialogOpen(true)}
              disabled={!hasPermission("core.metrics.delete")}
            >
              <IconTrash className="mr-2 h-4 w-4" />
              <span className="hidden sm:inline">Réinitialiser</span>
            </Button>
          </div>
        </div>

        {/* Overview Stats */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total métriques</CardTitle>
              <IconChartPie className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalMetrics}</div>
              <p className="text-xs text-muted-foreground">Toutes catégories</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Compteurs</CardTitle>
              <IconTrendingUp className="h-4 w-4 text-blue-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{counterMetrics}</div>
              <p className="text-xs text-muted-foreground">Métriques cumulatives</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Jauges</CardTitle>
              <IconActivity className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{gaugeMetrics}</div>
              <p className="text-xs text-muted-foreground">Valeurs instantanées</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Histogrammes</CardTitle>
              <IconChartBar className="h-4 w-4 text-purple-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{histogramMetrics}</div>
              <p className="text-xs text-muted-foreground">Distributions</p>
            </CardContent>
          </Card>
        </div>

        {/* Metrics List */}
        <Card>
          <CardHeader>
            <CardTitle>Métriques disponibles</CardTitle>
            <CardDescription>
              Vue détaillée de toutes les métriques collectées
            </CardDescription>
          </CardHeader>
          <CardContent>
            {totalMetrics === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <IconChartBar className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p>Aucune métrique collectée</p>
              </div>
            ) : (
              <div className="space-y-4">
                {Object.entries(stats || {}).map(([name, metric]) => (
                  <div key={name} className="border rounded-lg p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-start gap-2 flex-1">
                        {getMetricIcon(metric.type)}
                        <div className="flex-1">
                          <div className="font-medium">{name}</div>
                          <div className="flex items-center gap-2 mt-1">
                            <Badge variant="outline" className="text-xs">
                              {metric.type}
                            </Badge>
                            <span className="text-sm text-muted-foreground">
                              Valeur: {renderMetricValue(metric)}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="mt-3 pt-3 border-t">
                      {renderMetricDetails(name, metric)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Info */}
        <Card>
          <CardHeader>
            <CardTitle>Information</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-2">
            <p>
              • <strong>Compteurs (Counters):</strong> Métriques cumulatives qui ne peuvent qu&apos;augmenter
            </p>
            <p>
              • <strong>Jauges (Gauges):</strong> Valeurs qui peuvent augmenter ou diminuer
            </p>
            <p>
              • <strong>Histogrammes:</strong> Distribution des valeurs avec buckets
            </p>
            <p className="mt-3 pt-3 border-t">
              Les métriques sont exportées au format Prometheus sur <code className="px-1 py-0.5 bg-muted rounded">/metrics</code>
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Reset Dialog */}
      <AlertDialog open={resetDialogOpen} onOpenChange={setResetDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Réinitialiser les métriques ?</AlertDialogTitle>
            <AlertDialogDescription>
              Cette action remettra toutes les métriques à zéro. Les données
              historiques seront perdues. Cette opération est généralement
              utilisée pour les tests ou le debugging.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleResetMetrics}
              disabled={resetting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {resetting ? "Réinitialisation..." : "Réinitialiser"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ContentSection>
  )
}
