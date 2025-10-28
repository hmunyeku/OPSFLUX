"use client"

import { useEffect, useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import {
  IconCircleCheck,
  IconCircleX,
  IconCircleDashed,
  IconLoader,
  IconClock,
} from "@tabler/icons-react"
import { getTaskLogs, type TaskExecutionLog, type ScheduledTask } from "@/api/scheduled-tasks"
import { formatDistanceToNow } from "date-fns"
import { fr } from "date-fns/locale"

interface TaskLogsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  task: ScheduledTask | null
}

export function TaskLogsDialog({ open, onOpenChange, task }: TaskLogsDialogProps) {
  const [logs, setLogs] = useState<TaskExecutionLog[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (open && task) {
      loadLogs()
    }
  }, [open, task])

  const loadLogs = async () => {
    if (!task) return

    setLoading(true)
    try {
      const response = await getTaskLogs(task.id, { limit: 50 })
      setLogs(response.data)
    } catch (error) {
      console.error("Failed to load logs:", error)
    } finally {
      setLoading(false)
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "success":
        return <IconCircleCheck className="h-5 w-5 text-green-500" />
      case "failure":
        return <IconCircleX className="h-5 w-5 text-red-500" />
      case "running":
        return <IconLoader className="h-5 w-5 text-blue-500 animate-spin" />
      case "pending":
        return <IconCircleDashed className="h-5 w-5 text-gray-400" />
      default:
        return <IconCircleDashed className="h-5 w-5 text-gray-400" />
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "success":
        return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">Succès</Badge>
      case "failure":
        return <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">Échec</Badge>
      case "running":
        return <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">En cours</Badge>
      case "pending":
        return <Badge variant="outline" className="bg-gray-50 text-gray-700 border-gray-200">En attente</Badge>
      default:
        return <Badge variant="outline">{status}</Badge>
    }
  }

  const formatDuration = (seconds?: number) => {
    if (!seconds) return "—"
    if (seconds < 1) return `${(seconds * 1000).toFixed(0)}ms`
    if (seconds < 60) return `${seconds.toFixed(1)}s`
    const minutes = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${minutes}m ${secs.toFixed(0)}s`
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>Historique d'exécution</DialogTitle>
          <DialogDescription>
            {task?.name} — {logs.length} exécution(s)
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="h-[500px] pr-4">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <IconLoader className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : logs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <IconClock className="h-12 w-12 mb-2 opacity-50" />
              <p>Aucune exécution enregistrée</p>
              <p className="text-sm">Cliquez sur "Run Now" pour tester la tâche</p>
            </div>
          ) : (
            <div className="space-y-4">
              {logs.map((log) => (
                <div key={log.id} className="border rounded-lg p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {getStatusIcon(log.status)}
                      <span className="font-medium">
                        {formatDistanceToNow(new Date(log.started_at), {
                          addSuffix: true,
                          locale: fr,
                        })}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {getStatusBadge(log.status)}
                      {log.duration_seconds && (
                        <Badge variant="secondary">
                          {formatDuration(log.duration_seconds)}
                        </Badge>
                      )}
                    </div>
                  </div>

                  <div className="text-sm text-muted-foreground">
                    <div className="flex gap-4">
                      <div>
                        <span className="font-medium">Début:</span>{" "}
                        {new Date(log.started_at).toLocaleString("fr-FR")}
                      </div>
                      {log.finished_at && (
                        <div>
                          <span className="font-medium">Fin:</span>{" "}
                          {new Date(log.finished_at).toLocaleString("fr-FR")}
                        </div>
                      )}
                    </div>
                    <div className="mt-1">
                      <span className="font-medium">Task ID:</span>{" "}
                      <code className="text-xs bg-muted px-1 py-0.5 rounded">
                        {log.celery_task_id}
                      </code>
                    </div>
                  </div>

                  {log.result && (
                    <div className="mt-2">
                      <div className="text-sm font-medium mb-1">Résultat:</div>
                      <pre className="text-xs bg-muted p-2 rounded overflow-auto max-h-32">
                        {log.result}
                      </pre>
                    </div>
                  )}

                  {log.error && (
                    <div className="mt-2">
                      <div className="text-sm font-medium text-red-600 mb-1">Erreur:</div>
                      <pre className="text-xs bg-red-50 text-red-900 p-2 rounded overflow-auto max-h-32">
                        {log.error}
                      </pre>
                    </div>
                  )}

                  {log.traceback && (
                    <details className="mt-2">
                      <summary className="text-sm font-medium text-muted-foreground cursor-pointer">
                        Voir le traceback complet
                      </summary>
                      <pre className="text-xs bg-muted p-2 rounded overflow-auto max-h-48 mt-1">
                        {log.traceback}
                      </pre>
                    </details>
                  )}

                  {log !== logs[logs.length - 1] && <Separator className="mt-4" />}
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}
