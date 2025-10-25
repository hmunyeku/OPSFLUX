"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useTranslation } from "@/hooks/use-translation"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Button } from "@/components/ui/button"
import { RefreshCw, AlertTriangle, CheckCircle2, XCircle, Activity, Database, Server, Cpu, HardDrive, MemoryStick } from "lucide-react"
import { getSystemHealth, type SystemHealthResponse } from "@/api/system-health"
import { toast } from "sonner"

export default function SystemHealthPage() {
  const { t } = useTranslation("core.settings")
  const tCommon = useTranslation("core.common").t
  const [health, setHealth] = useState<SystemHealthResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)

  const fetchHealth = async () => {
    try {
      setLoading(true)
      const data = await getSystemHealth()
      setHealth(data)
      setLastUpdate(new Date())
    } catch (error) {
      console.error("Failed to fetch system health:", error)
      toast.error("Impossible de récupérer l'état de santé du système")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchHealth()
    // Auto-refresh every 30 seconds
    const interval = setInterval(fetchHealth, 30000)
    return () => clearInterval(interval)
  }, [])

  const getStatusColor = (status: string) => {
    switch (status) {
      case "healthy":
      case "normal":
        return "text-green-600 dark:text-green-400"
      case "degraded":
      case "warning":
        return "text-yellow-600 dark:text-yellow-400"
      case "unhealthy":
      case "critical":
        return "text-red-600 dark:text-red-400"
      default:
        return "text-gray-600 dark:text-gray-400"
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "healthy":
      case "normal":
        return <CheckCircle2 className="h-5 w-5" />
      case "degraded":
      case "warning":
        return <AlertTriangle className="h-5 w-5" />
      case "unhealthy":
      case "critical":
        return <XCircle className="h-5 w-5" />
      default:
        return <Activity className="h-5 w-5" />
    }
  }

  const getStatusBadge = (status: string) => {
    const variant =
      status === "healthy" || status === "normal" ? "success" :
      status === "degraded" || status === "warning" ? "warning" :
      status === "unhealthy" || status === "critical" ? "destructive" : "secondary"

    return (
      <Badge variant={variant as any} className="capitalize">
        {status}
      </Badge>
    )
  }

  return (
    <div className="flex flex-col gap-3 lg:gap-4">
      <div className="flex w-full flex-col gap-2">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href="/">{tCommon("breadcrumb.home")}</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href="/settings">{t("breadcrumb.settings", "Paramètres")}</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>System Health</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xl font-bold tracking-tight sm:text-2xl">System Health</h2>
            <p className="text-xs text-muted-foreground sm:text-sm">
              Surveillance en temps réel de la santé du système
            </p>
          </div>
          <div className="flex items-center gap-2">
            {lastUpdate && (
              <span className="text-xs text-muted-foreground">
                Mis à jour: {lastUpdate.toLocaleTimeString()}
              </span>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={fetchHealth}
              disabled={loading}
            >
              <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              Actualiser
            </Button>
          </div>
        </div>
      </div>

      {health && (
        <>
          {/* Global Status */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={getStatusColor(health.overall_status)}>
                    {getStatusIcon(health.overall_status)}
                  </div>
                  <CardTitle>État Global</CardTitle>
                </div>
                {getStatusBadge(health.overall_status)}
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex gap-6 text-sm">
                <div>
                  <span className="text-muted-foreground">Services totaux: </span>
                  <span className="font-medium">{health.summary.total_services}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">En bonne santé: </span>
                  <span className="font-medium text-green-600">{health.summary.healthy}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Défaillants: </span>
                  <span className="font-medium text-red-600">{health.summary.unhealthy}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-3 sm:grid-cols-2 lg:gap-4">
            {/* Database Health */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Database className="h-4 w-4" />
                    <CardTitle className="text-base">PostgreSQL</CardTitle>
                  </div>
                  {getStatusBadge(health.services.database.status)}
                </div>
                <CardDescription>Base de données principale</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {health.services.database.status === "healthy" ? (
                  <>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Version</span>
                      <span className="font-medium">{health.services.database.version}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Taille</span>
                      <span className="font-medium">{health.services.database.size_mb} MB</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Temps de réponse</span>
                      <span className="font-medium">{health.services.database.response_time_ms} ms</span>
                    </div>
                    <Separator />
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Connexions actives</span>
                      <span className="font-medium">{health.services.database.connections?.active}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Connexions idle</span>
                      <span className="font-medium">{health.services.database.connections?.idle}</span>
                    </div>
                  </>
                ) : (
                  <div className="text-destructive">{health.services.database.error}</div>
                )}
              </CardContent>
            </Card>

            {/* Redis Health */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Server className="h-4 w-4" />
                    <CardTitle className="text-base">Redis</CardTitle>
                  </div>
                  {getStatusBadge(health.services.cache.status)}
                </div>
                <CardDescription>Cache et file d'attente</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {health.services.cache.status === "healthy" ? (
                  <>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Version</span>
                      <span className="font-medium">{health.services.cache.version}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Mémoire utilisée</span>
                      <span className="font-medium">{health.services.cache.used_memory_mb} MB</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Clients connectés</span>
                      <span className="font-medium">{health.services.cache.connected_clients}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Uptime</span>
                      <span className="font-medium">{health.services.cache.uptime_days} jours</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Temps de réponse</span>
                      <span className="font-medium">{health.services.cache.response_time_ms} ms</span>
                    </div>
                  </>
                ) : (
                  <div className="text-destructive">{health.services.cache.error}</div>
                )}
              </CardContent>
            </Card>

            {/* System Resources */}
            <Card className="sm:col-span-2">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Activity className="h-4 w-4" />
                    <CardTitle className="text-base">Ressources Système</CardTitle>
                  </div>
                  {getStatusBadge(health.services.system.status)}
                </div>
                <CardDescription>CPU, Mémoire et Disque</CardDescription>
              </CardHeader>
              <CardContent>
                {health.services.system.status === "healthy" ? (
                  <div className="grid gap-4 sm:grid-cols-3">
                    {/* CPU */}
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Cpu className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">CPU</span>
                        {health.services.system.cpu && getStatusBadge(health.services.system.cpu.status)}
                      </div>
                      <div className="text-2xl font-bold">{health.services.system.cpu?.usage_percent}%</div>
                      <div className="text-xs text-muted-foreground">
                        {health.services.system.cpu?.count} cores
                      </div>
                    </div>

                    {/* Memory */}
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <MemoryStick className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">Mémoire</span>
                        {health.services.system.memory && getStatusBadge(health.services.system.memory.status)}
                      </div>
                      <div className="text-2xl font-bold">{health.services.system.memory?.usage_percent}%</div>
                      <div className="text-xs text-muted-foreground">
                        {health.services.system.memory?.used_mb} / {health.services.system.memory?.total_mb} MB
                      </div>
                    </div>

                    {/* Disk */}
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <HardDrive className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">Disque</span>
                        {health.services.system.disk && getStatusBadge(health.services.system.disk.status)}
                      </div>
                      <div className="text-2xl font-bold">{health.services.system.disk?.usage_percent}%</div>
                      <div className="text-xs text-muted-foreground">
                        {health.services.system.disk?.used_gb} / {health.services.system.disk?.total_gb} GB
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-destructive">{health.services.system.error}</div>
                )}
              </CardContent>
            </Card>

            {/* Celery Workers */}
            <Card className="sm:col-span-2">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Server className="h-4 w-4" />
                    <CardTitle className="text-base">Celery Workers</CardTitle>
                  </div>
                  {getStatusBadge(health.services.workers.status)}
                </div>
                <CardDescription>File d'attente de tâches asynchrones</CardDescription>
              </CardHeader>
              <CardContent>
                {health.services.workers.status === "healthy" ? (
                  <div className="grid gap-4 text-sm sm:grid-cols-3">
                    <div>
                      <div className="font-medium">Default Queue</div>
                      <div className="text-muted-foreground">
                        Status: {health.services.workers.workers?.default.status}
                      </div>
                    </div>
                    <div>
                      <div className="font-medium">High Priority</div>
                      <div className="text-muted-foreground">
                        Status: {health.services.workers.workers?.high.status}
                      </div>
                    </div>
                    <div>
                      <div className="font-medium">Low Priority</div>
                      <div className="text-muted-foreground">
                        Status: {health.services.workers.workers?.low.status}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-destructive">{health.services.workers.error}</div>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  )
}
