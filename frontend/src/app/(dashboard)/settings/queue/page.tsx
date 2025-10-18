"use client"

import { useCallback, useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  IconRefresh,
  IconPlayerPlay,
  IconX,
  IconClock,
  IconCheck,
  IconAlertTriangle,
} from "@tabler/icons-react"
import ContentSection from "../components/content-section"
import { useToast } from "@/hooks/use-toast"
import { useTranslation } from "@/hooks/use-translation"
import { getQueueStats, type QueueStats, TaskStatus } from "@/api/queue"

export default function QueuePage() {
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

  const _getStatusBadge = (status: string) => {
    switch (status) {
      case TaskStatus.SUCCESS:
        return (
          <Badge variant="default" className="bg-green-600">
            <IconCheck className="mr-1 h-3 w-3" />
            Succès
          </Badge>
        )
      case TaskStatus.PENDING:
        return (
          <Badge variant="secondary">
            <IconClock className="mr-1 h-3 w-3" />
            En attente
          </Badge>
        )
      case TaskStatus.STARTED:
        return (
          <Badge variant="default" className="bg-blue-600">
            <IconPlayerPlay className="mr-1 h-3 w-3" />
            En cours
          </Badge>
        )
      case TaskStatus.FAILURE:
        return (
          <Badge variant="destructive">
            <IconX className="mr-1 h-3 w-3" />
            Échec
          </Badge>
        )
      case TaskStatus.RETRY:
        return (
          <Badge variant="default" className="bg-amber-600">
            <IconRefresh className="mr-1 h-3 w-3" />
            Retry
          </Badge>
        )
      default:
        return <Badge variant="outline">{status}</Badge>
    }
  }

  if (loading && !stats) {
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

  const totalWorkers = Object.keys(stats?.workers || {}).length
  const totalActive = Object.values(stats?.workers || {}).reduce((acc, w) => acc + w.active, 0)
  const totalScheduled = Object.values(stats?.workers || {}).reduce((acc, w) => acc + w.scheduled, 0)
  const totalReserved = Object.values(stats?.workers || {}).reduce((acc, w) => acc + w.reserved, 0)

  return (
    <ContentSection
      title={t("page.title")}
      desc={t("page.description")}
      className="w-full lg:max-w-full"
    >
      <div className="space-y-6">
        {/* Actions */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <IconPlayerPlay className="h-5 w-5 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">
              Workers actifs: {totalWorkers}
            </span>
          </div>

          <Button variant="outline" size="sm" onClick={fetchStats}>
            <IconRefresh className="mr-2 h-4 w-4" />
            Actualiser
          </Button>
        </div>

        {/* Overview Stats */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Tâches actives</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalActive}</div>
              <p className="text-xs text-muted-foreground">En cours d&apos;exécution</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Tâches planifiées</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalScheduled}</div>
              <p className="text-xs text-muted-foreground">Programmées</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Tâches réservées</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalReserved}</div>
              <p className="text-xs text-muted-foreground">Pré-allouées</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Workers</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalWorkers}</div>
              <p className="text-xs text-muted-foreground">Connectés</p>
            </CardContent>
          </Card>
        </div>

        {/* Workers */}
        <Card>
          <CardHeader>
            <CardTitle>Workers</CardTitle>
            <CardDescription>État des workers Celery</CardDescription>
          </CardHeader>
          <CardContent>
            {totalWorkers === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <IconAlertTriangle className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p>Aucun worker connecté</p>
                <p className="text-xs mt-1">
                  Démarrez les workers Celery pour traiter les tâches
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
                        Actif
                      </Badge>
                    </div>
                    <div className="grid grid-cols-3 gap-4 text-sm">
                      <div>
                        <div className="text-muted-foreground">Actives</div>
                        <div className="font-semibold">{worker.active}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">Planifiées</div>
                        <div className="font-semibold">{worker.scheduled}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">Réservées</div>
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
            <CardTitle>Queues</CardTitle>
            <CardDescription>État des files d&apos;attente</CardDescription>
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
                    <Badge variant="outline">{queue.length} tâche(s)</Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Info */}
        <Card>
          <CardHeader>
            <CardTitle>Information</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-2">
            <p>
              • Les workers Celery traitent les tâches asynchrones en arrière-plan
            </p>
            <p>
              • Les tâches sont réparties selon leur priorité et leur queue
            </p>
            <p>
              • Les workers peuvent être scalés horizontalement
            </p>
          </CardContent>
        </Card>
      </div>
    </ContentSection>
  )
}
