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
    <div className="flex flex-col gap-6">
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
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">{t("logs.title", "Événements & Logs d'Audit")}</h2>
          <p className="text-muted-foreground">
            {t("logs.description", "Suivez et analysez tous les événements système en temps réel")}
          </p>
        </div>
        <ImportDialog disabled={!hasPermission("core.audit.configure")} />
      </div>

      {/* Statistics Cards */}
      {isLoadingStats ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[...Array(8)].map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total événements</CardTitle>
                <Activity className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.total.toLocaleString()}</div>
                <p className="text-xs text-muted-foreground">
                  {stats.last24h} dernières 24h
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Taux d'erreur</CardTitle>
                <AlertTriangle className="h-4 w-4 text-destructive" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{errorRate}%</div>
                <p className="text-xs text-muted-foreground">
                  {stats.error} erreurs totales
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Durée moyenne</CardTitle>
                <Clock className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.avgDuration}ms</div>
                <p className="text-xs text-muted-foreground">
                  Temps de réponse moyen
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Événements API</CardTitle>
                <Zap className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.api.toLocaleString()}</div>
                <p className="text-xs text-muted-foreground">
                  Requêtes API traitées
                </p>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Info</CardTitle>
                <Info className="h-4 w-4 text-blue-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.info.toLocaleString()}</div>
                <Badge variant="outline" className="mt-2 text-xs">
                  {((stats.info / stats.total) * 100).toFixed(1)}%
                </Badge>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Avertissements</CardTitle>
                <AlertTriangle className="h-4 w-4 text-amber-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.warn.toLocaleString()}</div>
                <Badge variant="outline" className="mt-2 text-xs">
                  {((stats.warn / stats.total) * 100).toFixed(1)}%
                </Badge>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Erreurs</CardTitle>
                <ShieldAlert className="h-4 w-4 text-destructive" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.error.toLocaleString()}</div>
                <Badge variant="destructive" className="mt-2 text-xs">
                  {((stats.error / stats.total) * 100).toFixed(1)}%
                </Badge>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Debug</CardTitle>
                <Bug className="h-4 w-4 text-purple-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.debug.toLocaleString()}</div>
                <Badge variant="outline" className="mt-2 text-xs">
                  {((stats.debug / stats.total) * 100).toFixed(1)}%
                </Badge>
              </CardContent>
            </Card>
          </div>
        </>
      )}

      {/* Main Content */}
      <div className="grid grid-cols-1 gap-6">
        <div className="col-span-1">
          <Logs />
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          <RouteView />
          <Referrers />
        </div>
      </div>
    </div>
  )
}
