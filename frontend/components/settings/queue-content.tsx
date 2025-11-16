"use client"

import { useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Progress } from "@/components/ui/progress"
import { mockJobs, mockCronJobs, type Job, type JobStatus, type CronJob } from "@/lib/settings-data"
import { Play, Pause, RotateCw, Trash2, Clock, CheckCircle2, XCircle } from "lucide-react"

export function SettingsQueueContent() {
  const [jobs] = useState<Job[]>(mockJobs)
  const [cronJobs] = useState<CronJob[]>(mockCronJobs)

  const getStatusBadge = (status: JobStatus) => {
    const variants = {
      pending: { variant: "secondary" as const, icon: Clock, label: "En attente" },
      processing: { variant: "default" as const, icon: Play, label: "En cours" },
      completed: { variant: "default" as const, icon: CheckCircle2, label: "Terminé" },
      failed: { variant: "destructive" as const, icon: XCircle, label: "Échec" },
    }
    const config = variants[status]
    const Icon = config.icon
    return (
      <Badge variant={config.variant} className="gap-1">
        <Icon className="h-3 w-3" />
        {config.label}
      </Badge>
    )
  }

  const stats = {
    pending: jobs.filter((j) => j.status === "pending").length,
    processing: jobs.filter((j) => j.status === "processing").length,
    completed: jobs.filter((j) => j.status === "completed").length,
    failed: jobs.filter((j) => j.status === "failed").length,
  }

  return (
    <div className="flex h-full flex-col gap-4 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Gestion de la File d'Attente</h1>
          <p className="text-sm text-muted-foreground">Jobs asynchrones et tâches planifiées</p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-orange-100 p-2 dark:bg-orange-900">
              <Clock className="h-5 w-5 text-orange-600 dark:text-orange-400" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">En Attente</p>
              <p className="text-2xl font-bold">{stats.pending}</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-blue-100 p-2 dark:bg-blue-900">
              <Play className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">En Cours</p>
              <p className="text-2xl font-bold">{stats.processing}</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-green-100 p-2 dark:bg-green-900">
              <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Terminés</p>
              <p className="text-2xl font-bold">{stats.completed}</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-red-100 p-2 dark:bg-red-900">
              <XCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Échecs</p>
              <p className="text-2xl font-bold">{stats.failed}</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Jobs Table */}
      <Card className="overflow-hidden">
        <div className="border-b p-4">
          <h3 className="font-semibold">Jobs en Cours</h3>
          <p className="text-sm text-muted-foreground">Liste des jobs actifs et récents</p>
        </div>
        <div className="overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Type</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead>Progression</TableHead>
                <TableHead>Créé par</TableHead>
                <TableHead>Date Création</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {jobs.map((job) => (
                <TableRow key={job.id}>
                  <TableCell className="font-medium">{job.type}</TableCell>
                  <TableCell>{getStatusBadge(job.status)}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Progress value={job.progress} className="w-24" />
                      <span className="text-sm text-muted-foreground">{job.progress}%</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">{job.createdBy}</TableCell>
                  <TableCell className="text-sm">{job.createdAt.toLocaleString("fr-FR")}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      {job.status === "failed" && (
                        <Button variant="ghost" size="sm">
                          <RotateCw className="h-4 w-4" />
                        </Button>
                      )}
                      <Button variant="ghost" size="sm">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* Cron Jobs Table */}
      <Card className="flex-1 overflow-hidden">
        <div className="border-b p-4">
          <h3 className="font-semibold">Tâches Planifiées (Cron Jobs)</h3>
          <p className="text-sm text-muted-foreground">Jobs récurrents automatiques</p>
        </div>
        <div className="h-full overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nom</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Cron Expression</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead>Dernière Exécution</TableHead>
                <TableHead>Prochaine Exécution</TableHead>
                <TableHead>Succès / Échecs</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {cronJobs.map((cronJob) => (
                <TableRow key={cronJob.id}>
                  <TableCell className="font-medium">{cronJob.name}</TableCell>
                  <TableCell className="text-sm">{cronJob.type}</TableCell>
                  <TableCell>
                    <code className="rounded bg-muted px-2 py-1 text-xs">{cronJob.cronExpression}</code>
                  </TableCell>
                  <TableCell>
                    {cronJob.isActive ? (
                      <Badge variant="default" className="gap-1">
                        <CheckCircle2 className="h-3 w-3" />
                        Actif
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="gap-1">
                        <Pause className="h-3 w-3" />
                        Inactif
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">
                    {cronJob.lastRun ? cronJob.lastRun.toLocaleString("fr-FR") : "-"}
                  </TableCell>
                  <TableCell className="text-sm">{cronJob.nextRun.toLocaleString("fr-FR")}</TableCell>
                  <TableCell>
                    <div className="flex gap-2 text-sm">
                      <span className="text-green-600">{cronJob.successCount}</span>
                      <span className="text-muted-foreground">/</span>
                      <span className="text-red-600">{cronJob.failureCount}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      {cronJob.isActive ? (
                        <Button variant="ghost" size="sm">
                          <Pause className="h-4 w-4" />
                        </Button>
                      ) : (
                        <Button variant="ghost" size="sm">
                          <Play className="h-4 w-4" />
                        </Button>
                      )}
                      <Button variant="ghost" size="sm">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  )
}
