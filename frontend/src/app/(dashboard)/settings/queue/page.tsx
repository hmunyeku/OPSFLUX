"use client"

import { useCallback, useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  IconRefresh,
  IconPlayerPlay,
  IconClock,
  IconCheck,
  IconAlertTriangle,
} from "@tabler/icons-react"
import ContentSection from "../components/content-section"
import { useToast } from "@/hooks/use-toast"
import { useTranslation } from "@/hooks/use-translation"
import { getQueueStats, type QueueStats } from "@/api/queue"
import { PermissionGuard } from "@/components/permission-guard"

export default function QueuePage() {
  return (
    <PermissionGuard permission="core.queue.read">
      <QueuePageContent />
    </PermissionGuard>
  )
}

function QueuePageContent() {
  const [stats, setStats] = useState<QueueStats | null>(null)
  const [loading, setLoading] = useState(true)
  const { toast } = useToast()
  const { t } = useTranslation("core.queue")

  const fetchStats = useCallback(async () => {
    setLoading(true)
    try {
      const data = await getQueueStats()
      setStats(data)
    } catch (_error) {
      toast({
        variant: "destructive",
        title: t("toast.error.title"),
        description: t("toast.error.load"),
      })
    } finally {
      setLoading(false)
    }
  }, [toast, t])

  useEffect(() => {
    fetchStats()
    // Refresh every 10 seconds
    const interval = setInterval(fetchStats, 10000)
    return () => clearInterval(interval)
  }, [fetchStats])

  if (loading && !stats) {
    return (
      <ContentSection
        title={t("page.title", "Titre")}
        desc={t("page.description", "Description")}
        className="w-full lg:max-w-full"
      >
        <div className="flex items-center justify-center py-8">
          <IconRefresh className="h-6 w-6 animate-spin" />
        </div>
      </ContentSection>
    )
  }

  const totalWorkers = Object.keys(stats?.workers || {}).length
  const totalActive = Object.values(stats?.workers || {}).reduce((acc, w) => acc + w.active, 0)
  const totalScheduled = Object.values(stats?.workers || {}).reduce((acc, w) => acc + w.scheduled, 0)
  const totalReserved = Object.values(stats?.workers || {}).reduce((acc, w) => acc + w.reserved, 0)

  return (
    <ContentSection
      title={t("page.title", "Titre")}
      desc={t("page.description", "Description")}
      className="w-full lg:max-w-full"
    >
      <div className="space-y-6">
        {/* Actions */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <IconPlayerPlay className="h-5 w-5 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">
              {t("workers.active_count", { count: totalWorkers })}
            </span>
          </div>

          <Button variant="outline" size="sm" onClick={fetchStats}>
            <IconRefresh className="mr-2 h-4 w-4" />
            {t("actions.refresh", "Refresh")}
          </Button>
        </div>

        {/* Overview Stats */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">{t("stats.active_tasks", "Active tasks")}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalActive}</div>
              <p className="text-xs text-muted-foreground">{t("stats.running", "Running")}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">{t("stats.scheduled_tasks", "Scheduled tasks")}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalScheduled}</div>
              <p className="text-xs text-muted-foreground">{t("stats.scheduled", "Scheduled")}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">{t("stats.reserved_tasks", "Reserved tasks")}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalReserved}</div>
              <p className="text-xs text-muted-foreground">{t("stats.reserved", "Reserved")}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">{t("workers.title", "Title")}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalWorkers}</div>
              <p className="text-xs text-muted-foreground">{t("workers.connected", "Connected")}</p>
            </CardContent>
          </Card>
        </div>

        {/* Workers */}
        <Card>
          <CardHeader>
            <CardTitle>{t("workers.title", "Title")}</CardTitle>
            <CardDescription>{t("workers.description", "Description")}</CardDescription>
          </CardHeader>
          <CardContent>
            {totalWorkers === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <IconAlertTriangle className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p>{t("workers.none", "None")}</p>
                <p className="text-xs mt-1">
                  {t("workers.none_description", "None description")}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {Object.entries(stats?.workers || {}).map(([name, worker]) => (
                  <div key={name} className="border rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="font-medium">{name}</div>
                      <Badge variant="default" className="bg-green-600">
                        <IconCheck className="mr-1 h-3 w-3" />
                        {t("workers.active", "Active")}
                      </Badge>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
                      <div>
                        <div className="text-muted-foreground">{t("workers.active_tasks", "Active tasks")}</div>
                        <div className="font-semibold">{worker.active}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">{t("workers.scheduled_tasks", "Scheduled tasks")}</div>
                        <div className="font-semibold">{worker.scheduled}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">{t("workers.reserved_tasks", "Reserved tasks")}</div>
                        <div className="font-semibold">{worker.reserved}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Queues */}
        <Card>
          <CardHeader>
            <CardTitle>{t("queues.title", "Title")}</CardTitle>
            <CardDescription>{t("queues.description", "Description")}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {Object.entries(stats?.queues || {}).map(([name, queue]) => (
                <div
                  key={name}
                  className="flex items-center justify-between p-3 border rounded-lg"
                >
                  <div className="flex items-center gap-2">
                    <IconClock className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">{name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{t("queues.tasks_count", { count: queue.length })}</Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Info */}
        <Card>
          <CardHeader>
            <CardTitle>{t("info.title", "Title")}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-2">
            <p>• {t("info.workers_description", "Workers description")}</p>
            <p>• {t("info.distribution_description", "Distribution description")}</p>
            <p>• {t("info.scaling_description", "Scaling description")}</p>
          </CardContent>
        </Card>
      </div>
    </ContentSection>
  )
}
