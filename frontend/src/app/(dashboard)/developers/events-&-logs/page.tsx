"use client"

import Link from "next/link"
import { useEffect, useState, useMemo } from "react"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useTranslation } from "@/hooks/use-translation"
import ImportDialog from "./components/import-dialog"
import Logs from "./components/logs"
import Referrers from "./components/referrers"
import RouteView from "./components/route-view"
import { PermissionGuard } from "@/components/permission-guard"
import { usePermissions } from "@/hooks/use-permissions"
import { getAuditLogs, type AuditLog } from "./data/audit-api"
import {
  Activity,
  AlertTriangle,
  Info,
  ShieldAlert,
  Clock,
  TrendingUp,
  Bug,
  Zap
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"

export default function EventsAndLogsPage() {
  return (
    <PermissionGuard permission="core.audit.read">
      <EventsAndLogsPageContent />
    </PermissionGuard>
  )
}

function EventsAndLogsPageContent() {
  const { t } = useTranslation("core.developers")
  const { hasPermission } = usePermissions()
  const [stats, setStats] = useState({
    total: 0,
    info: 0,
    warn: 0,
    error: 0,
    debug: 0,
    api: 0,
    auth: 0,
    crud: 0,
    system: 0,
    last24h: 0,
    avgDuration: 0
  })
  const [isLoadingStats, setIsLoadingStats] = useState(true)

  useEffect(() => {
    const loadStats = async () => {
      try {
        setIsLoadingStats(true)
        const response = await getAuditLogs({ limit: 1000 })
        const logs = response.data

        // Calculate 24h logs
        const now = new Date()
        const last24h = logs.filter(log => {
          const logDate = new Date(log.timestamp)
          return (now.getTime() - logDate.getTime()) / (1000 * 60 * 60) <= 24
        }).length

        // Calculate average duration
        const logsWithDuration = logs.filter(log => log.duration_ms)
        const avgDuration = logsWithDuration.length > 0
          ? Math.round(logsWithDuration.reduce((acc, log) => acc + (log.duration_ms || 0), 0) / logsWithDuration.length)
          : 0

        setStats({
          total: response.total,
          info: logs.filter(l => l.level === 'INFO').length,
          warn: logs.filter(l => l.level === 'WARN').length,
          error: logs.filter(l => l.level === 'ERROR').length,
          debug: logs.filter(l => l.level === 'DEBUG').length,
          api: logs.filter(l => l.event_type === 'API').length,
          auth: logs.filter(l => l.event_type === 'AUTH').length,
          crud: logs.filter(l => l.event_type === 'CRUD').length,
          system: logs.filter(l => l.event_type === 'SYSTEM').length,
          last24h,
          avgDuration
        })
      } catch (error) {
        console.error('Failed to load audit stats:', error)
      } finally {
        setIsLoadingStats(false)
      }
    }

    loadStats()
  }, [])

  const errorRate = useMemo(() => {
    if (stats.total === 0) return 0
    return ((stats.error / stats.total) * 100).toFixed(1)
  }, [stats])

  return (
    <div className="flex flex-col gap-3 lg:gap-4">
      {/* Breadcrumb */}
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/">{t("breadcrumb.home", "Accueil")}</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{t("breadcrumb.developers", "Développeurs")}</BreadcrumbPage>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{t("logs.title", "Événements & Logs")}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold tracking-tight sm:text-2xl">{t("logs.title", "Événements & Logs d'Audit")}</h2>
          <p className="text-xs text-muted-foreground sm:text-sm">
            {t("logs.description", "Suivez et analysez tous les événements système en temps réel")}
          </p>
        </div>
        <div className="hidden sm:block">
          <ImportDialog disabled={!hasPermission("core.audit.configure")} />
        </div>
      </div>

      {/* Statistics Cards */}
      {isLoadingStats ? (
        <div className="grid gap-2 sm:gap-3 grid-cols-2 lg:grid-cols-4">
          {[...Array(8)].map((_, i) => (
            <Skeleton key={i} className="h-24 sm:h-28" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid gap-2 sm:gap-3 grid-cols-2 lg:grid-cols-4">
            <Card className="shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 p-3 pb-2 sm:p-4 sm:pb-2">
                <CardTitle className="text-xs font-medium sm:text-sm">{t("stats.total_events", "Total événements")}</CardTitle>
                <Activity className="h-3 w-3 text-muted-foreground sm:h-4 sm:w-4" />
              </CardHeader>
              <CardContent className="p-3 pt-0 sm:p-4 sm:pt-0">
                <div className="text-xl font-bold sm:text-2xl">{stats.total.toLocaleString()}</div>
                <p className="text-[10px] text-muted-foreground sm:text-xs">
                  {t("stats.last_24h", "{{count}} dernières 24h", { count: stats.last24h })}
                </p>
              </CardContent>
            </Card>

            <Card className="shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 p-3 pb-2 sm:p-4 sm:pb-2">
                <CardTitle className="text-xs font-medium sm:text-sm">{t("stats.error_rate", "Taux d'erreur")}</CardTitle>
                <AlertTriangle className="h-3 w-3 text-destructive sm:h-4 sm:w-4" />
              </CardHeader>
              <CardContent className="p-3 pt-0 sm:p-4 sm:pt-0">
                <div className="text-xl font-bold sm:text-2xl">{errorRate}%</div>
                <p className="text-[10px] text-muted-foreground sm:text-xs">
                  {t("stats.total_errors", "{{count}} erreurs totales", { count: stats.error })}
                </p>
              </CardContent>
            </Card>

            <Card className="shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 p-3 pb-2 sm:p-4 sm:pb-2">
                <CardTitle className="text-xs font-medium sm:text-sm">{t("stats.avg_duration", "Durée moyenne")}</CardTitle>
                <Clock className="h-3 w-3 text-muted-foreground sm:h-4 sm:w-4" />
              </CardHeader>
              <CardContent className="p-3 pt-0 sm:p-4 sm:pt-0">
                <div className="text-xl font-bold sm:text-2xl">{stats.avgDuration}ms</div>
                <p className="text-[10px] text-muted-foreground sm:text-xs">
                  {t("stats.avg_response_time", "Temps de réponse moyen")}
                </p>
              </CardContent>
            </Card>

            <Card className="shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 p-3 pb-2 sm:p-4 sm:pb-2">
                <CardTitle className="text-xs font-medium sm:text-sm">{t("stats.api_events", "Événements API")}</CardTitle>
                <Zap className="h-3 w-3 text-muted-foreground sm:h-4 sm:w-4" />
              </CardHeader>
              <CardContent className="p-3 pt-0 sm:p-4 sm:pt-0">
                <div className="text-xl font-bold sm:text-2xl">{stats.api.toLocaleString()}</div>
                <p className="text-[10px] text-muted-foreground sm:text-xs">
                  {t("stats.api_requests_processed", "Requêtes API traitées")}
                </p>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-2 sm:gap-3 grid-cols-2 lg:grid-cols-4">
            <Card className="shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 p-3 pb-2 sm:p-4 sm:pb-2">
                <CardTitle className="text-xs font-medium sm:text-sm">{t("stats.info", "Info")}</CardTitle>
                <Info className="h-3 w-3 text-blue-500 sm:h-4 sm:w-4" />
              </CardHeader>
              <CardContent className="p-3 pt-0 sm:p-4 sm:pt-0">
                <div className="text-xl font-bold sm:text-2xl">{stats.info.toLocaleString()}</div>
                <Badge variant="outline" className="mt-1 text-[10px] sm:mt-2 sm:text-xs">
                  {((stats.info / stats.total) * 100).toFixed(1)}%
                </Badge>
              </CardContent>
            </Card>

            <Card className="shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 p-3 pb-2 sm:p-4 sm:pb-2">
                <CardTitle className="text-xs font-medium sm:text-sm">{t("stats.warnings", "Avertissements")}</CardTitle>
                <AlertTriangle className="h-3 w-3 text-amber-500 sm:h-4 sm:w-4" />
              </CardHeader>
              <CardContent className="p-3 pt-0 sm:p-4 sm:pt-0">
                <div className="text-xl font-bold sm:text-2xl">{stats.warn.toLocaleString()}</div>
                <Badge variant="outline" className="mt-1 text-[10px] sm:mt-2 sm:text-xs">
                  {((stats.warn / stats.total) * 100).toFixed(1)}%
                </Badge>
              </CardContent>
            </Card>

            <Card className="shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 p-3 pb-2 sm:p-4 sm:pb-2">
                <CardTitle className="text-xs font-medium sm:text-sm">{t("stats.errors", "Erreurs")}</CardTitle>
                <ShieldAlert className="h-3 w-3 text-destructive sm:h-4 sm:w-4" />
              </CardHeader>
              <CardContent className="p-3 pt-0 sm:p-4 sm:pt-0">
                <div className="text-xl font-bold sm:text-2xl">{stats.error.toLocaleString()}</div>
                <Badge variant="destructive" className="mt-1 text-[10px] sm:mt-2 sm:text-xs">
                  {((stats.error / stats.total) * 100).toFixed(1)}%
                </Badge>
              </CardContent>
            </Card>

            <Card className="shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 p-3 pb-2 sm:p-4 sm:pb-2">
                <CardTitle className="text-xs font-medium sm:text-sm">{t("stats.debug", "Debug")}</CardTitle>
                <Bug className="h-3 w-3 text-purple-500 sm:h-4 sm:w-4" />
              </CardHeader>
              <CardContent className="p-3 pt-0 sm:p-4 sm:pt-0">
                <div className="text-xl font-bold sm:text-2xl">{stats.debug.toLocaleString()}</div>
                <Badge variant="outline" className="mt-1 text-[10px] sm:mt-2 sm:text-xs">
                  {((stats.debug / stats.total) * 100).toFixed(1)}%
                </Badge>
              </CardContent>
            </Card>
          </div>
        </>
      )}

      {/* Main Content */}
      <div className="grid grid-cols-1 gap-3 lg:gap-4">
        <div className="col-span-1">
          <Logs />
        </div>
        <div className="grid gap-3 lg:grid-cols-2 lg:gap-4">
          <RouteView />
          <Referrers />
        </div>
      </div>
    </div>
  )
}
