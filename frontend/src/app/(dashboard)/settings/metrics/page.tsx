"use client"

import { useEffect, useState, useMemo } from "react"
import { useTranslation } from "@/hooks/use-translation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
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
  IconChartPie,
  IconSearch,
  IconDownload,
  IconFilter,
  IconX,
} from "@tabler/icons-react"
import { LineChart, Line, BarChart, Bar, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts"
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
  const { t } = useTranslation("core.metrics")
  const [stats, setStats] = useState<MetricsStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [resetting, setResetting] = useState(false)
  const [resetDialogOpen, setResetDialogOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState("")
  const [typeFilter, setTypeFilter] = useState<string>("all")
  const [expandedMetrics, setExpandedMetrics] = useState<Set<string>>(new Set())
  const { toast } = useToast()

  const fetchStats = async () => {
    setLoading(true)
    try {
      const data = await getMetricsStats()
      setStats(data)
    } catch (error) {
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
    fetchStats()
    const interval = setInterval(fetchStats, 30000)
    return () => clearInterval(interval)
  }, [])

  const handleResetMetrics = async () => {
    setResetting(true)
    try {
      await resetMetrics()
      toast({
        title: t("toast.reset.success"),
        description: t("toast.reset.description"),
      })
      setResetDialogOpen(false)
      await fetchStats()
    } catch (error) {
      toast({
        variant: "destructive",
        title: t("toast.error.title"),
        description: t("toast.error.reset"),
      })
    } finally {
      setResetting(false)
    }
  }

  const handleExportCSV = () => {
    if (!stats) return

    const rows = [["Metric Name", "Type", "Value", "Labels"]]

    Object.entries(stats).forEach(([name, metric]) => {
      if (metric.type === "counter" || metric.type === "gauge") {
        if (metric.values) {
          Object.entries(metric.values).forEach(([label, value]) => {
            rows.push([name, metric.type, String(value), label || "total"])
          })
        }
      } else if (metric.type === "histogram" && metric.stats) {
        Object.entries(metric.stats).forEach(([label, data]: [string, any]) => {
          rows.push([name, metric.type, `count: ${data.count}, sum: ${data.sum}`, label || "total"])
        })
      }
    })

    const csv = rows.map(row => row.map(cell => `"${cell}"`).join(",")).join("\n")
    const blob = new Blob([csv], { type: "text/csv" })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `metrics_${new Date().toISOString().split("T")[0]}.csv`
    a.click()
    window.URL.revokeObjectURL(url)

    toast({
      title: "Export réussi",
      description: "Les métriques ont été exportées en CSV",
    })
  }

  const getMetricIcon = (type: string) => {
    switch (type) {
      case "counter":
        return <IconTrendingUp className="h-3.5 w-3.5 text-blue-600" />
      case "gauge":
        return <IconActivity className="h-3.5 w-3.5 text-green-600" />
      case "histogram":
        return <IconChartBar className="h-3.5 w-3.5 text-purple-600" />
      default:
        return <IconChartPie className="h-3.5 w-3.5 text-gray-600" />
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
        return `${stats.count}`
      }
    }

    return "0"
  }

  const renderMiniChart = (name: string, metric: any) => {
    if (metric.type === "counter" || metric.type === "gauge") {
      if (!metric.values || Object.keys(metric.values).length === 0) return null

      const data = Object.entries(metric.values).map(([label, value]) => ({
        name: label || "total",
        value: value as number,
      }))

      const colors = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899"]

      return (
        <div className="h-20 w-full mt-2">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="name" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip
                contentStyle={{ fontSize: 11, padding: "4px 8px" }}
                formatter={(value: any) => value.toLocaleString()}
              />
              <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                {data.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )
    }

    if (metric.type === "histogram" && metric.stats) {
      const firstStat = Object.values(metric.stats)[0] as any
      if (!firstStat || !firstStat.buckets) return null

      const data = Object.entries(firstStat.buckets).slice(0, 8).map(([bucket, count]) => ({
        bucket: `≤${bucket}`,
        count: count as number,
      }))

      return (
        <div className="h-20 w-full mt-2">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="bucket" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip
                contentStyle={{ fontSize: 11, padding: "4px 8px" }}
              />
              <Area type="monotone" dataKey="count" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.6} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )
    }

    return null
  }

  const renderMetricDetails = (name: string, metric: any) => {
    if (metric.type === "counter" || metric.type === "gauge") {
      if (!metric.values || Object.keys(metric.values).length === 0) {
        return <div className="text-xs text-muted-foreground">Aucune donnée</div>
      }

      return (
        <div className="space-y-0.5">
          {Object.entries(metric.values).map(([label, value]) => (
            <div key={label} className="flex justify-between text-xs">
              <span className="text-muted-foreground truncate">{label || "total"}</span>
              <span className="font-medium">{(value as number).toLocaleString()}</span>
            </div>
          ))}
        </div>
      )
    }

    if (metric.type === "histogram" && metric.stats) {
      return (
        <div className="space-y-1">
          {Object.entries(metric.stats).map(([label, data]) => {
            const histData = data as any
            return (
              <div key={label} className="space-y-0.5">
                <div className="text-[10px] text-muted-foreground">{label || "total"}</div>
                <div className="grid grid-cols-2 gap-1 text-xs">
                  <div>
                    <span className="text-muted-foreground">Count: </span>
                    <span className="font-medium">{histData.count}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Sum: </span>
                    <span className="font-medium">{histData.sum.toFixed(2)}</span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )
    }

    return null
  }

  const filteredMetrics = useMemo(() => {
    if (!stats) return []

    return Object.entries(stats).filter(([name, metric]) => {
      const matchesSearch = name.toLowerCase().includes(searchTerm.toLowerCase())
      const matchesType = typeFilter === "all" || metric.type === typeFilter
      return matchesSearch && matchesType
    })
  }, [stats, searchTerm, typeFilter])

  const totalMetrics = Object.keys(stats || {}).length
  const counterMetrics = Object.values(stats || {}).filter((m) => m.type === "counter").length
  const gaugeMetrics = Object.values(stats || {}).filter((m) => m.type === "gauge").length
  const histogramMetrics = Object.values(stats || {}).filter((m) => m.type === "histogram").length

  if (loading && !stats) {
    return (
      <ContentSection
        title={t("metrics.title", "Métriques")}
        desc={t("metrics.description", "Surveillance des métriques applicatives")}
        className="w-full lg:max-w-full"
      >
        <div className="flex items-center justify-center py-8">
          <IconRefresh className="h-6 w-6 animate-spin" />
        </div>
      </ContentSection>
    )
  }

  return (
    <ContentSection
      title={t("metrics.title", "Métriques")}
      desc={t("metrics.description", "Surveillance des métriques applicatives")}
      className="w-full lg:max-w-full"
    >
      <div className="space-y-3">
        {/* Actions compactes */}
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <IconSearch className="absolute left-2 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Rechercher une métrique..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8 h-9 text-sm"
            />
            {searchTerm && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSearchTerm("")}
                className="absolute right-1 top-1/2 transform -translate-y-1/2 h-7 w-7 p-0"
              >
                <IconX className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>

          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-full sm:w-40 h-9 text-sm">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous</SelectItem>
              <SelectItem value="counter">Compteurs</SelectItem>
              <SelectItem value="gauge">Jauges</SelectItem>
              <SelectItem value="histogram">Histogrammes</SelectItem>
            </SelectContent>
          </Select>

          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={fetchStats} className="h-9">
              <IconRefresh className="h-3.5 w-3.5 sm:mr-1.5" />
              <span className="hidden sm:inline text-sm">Actualiser</span>
            </Button>
            <Button variant="outline" size="sm" onClick={handleExportCSV} className="h-9">
              <IconDownload className="h-3.5 w-3.5 sm:mr-1.5" />
              <span className="hidden sm:inline text-sm">Export CSV</span>
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setResetDialogOpen(true)}
              disabled={!hasPermission("core.metrics.delete")}
              className="h-9"
            >
              <IconTrash className="h-3.5 w-3.5 sm:mr-1.5" />
              <span className="hidden sm:inline text-sm">Reset</span>
            </Button>
          </div>
        </div>

        {/* Overview Stats - Ultra compact */}
        <div className="grid gap-2 grid-cols-2 md:grid-cols-4">
          <Card className="border-l-4 border-l-gray-400">
            <CardHeader className="p-3 pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium">Total</CardTitle>
                <IconChartPie className="h-4 w-4 text-muted-foreground" />
              </div>
            </CardHeader>
            <CardContent className="p-3 pt-0">
              <div className="text-2xl font-bold">{totalMetrics}</div>
              <p className="text-[10px] text-muted-foreground">métriques</p>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-blue-500">
            <CardHeader className="p-3 pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium">Compteurs</CardTitle>
                <IconTrendingUp className="h-4 w-4 text-blue-600" />
              </div>
            </CardHeader>
            <CardContent className="p-3 pt-0">
              <div className="text-2xl font-bold">{counterMetrics}</div>
              <p className="text-[10px] text-muted-foreground">cumulatifs</p>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-green-500">
            <CardHeader className="p-3 pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium">Jauges</CardTitle>
                <IconActivity className="h-4 w-4 text-green-600" />
              </div>
            </CardHeader>
            <CardContent className="p-3 pt-0">
              <div className="text-2xl font-bold">{gaugeMetrics}</div>
              <p className="text-[10px] text-muted-foreground">instantanés</p>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-purple-500">
            <CardHeader className="p-3 pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium">Histogrammes</CardTitle>
                <IconChartBar className="h-4 w-4 text-purple-600" />
              </div>
            </CardHeader>
            <CardContent className="p-3 pt-0">
              <div className="text-2xl font-bold">{histogramMetrics}</div>
              <p className="text-[10px] text-muted-foreground">distributions</p>
            </CardContent>
          </Card>
        </div>

        {/* Résultats filtrés */}
        {searchTerm || typeFilter !== "all" ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <IconFilter className="h-4 w-4" />
            <span>
              {filteredMetrics.length} métrique{filteredMetrics.length > 1 ? "s" : ""} trouvée{filteredMetrics.length > 1 ? "s" : ""}
            </span>
          </div>
        ) : null}

        {/* Metrics Grid - Ultra compact */}
        {filteredMetrics.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center">
              <IconChartBar className="h-12 w-12 mx-auto mb-2 opacity-30" />
              <p className="text-sm text-muted-foreground">
                {searchTerm || typeFilter !== "all"
                  ? "Aucune métrique ne correspond aux filtres"
                  : "Aucune métrique collectée"}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-2 grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filteredMetrics.map(([name, metric]) => {
              const isExpanded = expandedMetrics.has(name)

              return (
                <Card
                  key={name}
                  className="hover:shadow-md transition-shadow cursor-pointer"
                  onClick={() => {
                    const newExpanded = new Set(expandedMetrics)
                    if (isExpanded) {
                      newExpanded.delete(name)
                    } else {
                      newExpanded.add(name)
                    }
                    setExpandedMetrics(newExpanded)
                  }}
                >
                  <CardContent className="p-3">
                    {/* Header compact */}
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex items-start gap-1.5 flex-1 min-w-0">
                        {getMetricIcon(metric.type)}
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-xs truncate" title={name}>
                            {name}
                          </div>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <Badge variant="outline" className="text-[10px] h-4 px-1">
                              {metric.type}
                            </Badge>
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-lg font-bold">{renderMetricValue(metric)}</div>
                      </div>
                    </div>

                    {/* Details si expandé */}
                    {isExpanded && (
                      <div className="mt-2 pt-2 border-t space-y-2">
                        {renderMetricDetails(name, metric)}
                        {renderMiniChart(name, metric)}
                      </div>
                    )}
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}
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
