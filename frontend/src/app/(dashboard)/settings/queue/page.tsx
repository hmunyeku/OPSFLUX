"use client"

import { useCallback, useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Separator } from "@/components/ui/separator"
import {
  IconRefresh,
  IconPlayerPlay,
  IconClock,
  IconCheck,
  IconAlertTriangle,
  IconServer,
  IconActivity,
  IconTrendingUp,
  IconX,
  IconEye,
  IconTrash,
  IconAlertCircle,
  IconLoader,
  IconCircleCheck,
  IconCircleX,
  IconCircleDashed,
  IconPlus,
  IconEdit,
  IconPlayerPause,
  IconPlayerPlayFilled,
} from "@tabler/icons-react"
import { useToast } from "@/hooks/use-toast"
import { getQueueStats, type QueueStats, cancelTask, purgeQueue } from "@/api/queue"
import { PermissionGuard } from "@/components/permission-guard"
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { formatDistanceToNow } from "date-fns"
import { fr } from "date-fns/locale"
import { TaskDrawer } from "./components/task-drawer"
import { TaskLogsDialog } from "./components/task-logs-dialog"
import { Input } from "@/components/ui/input"
import {
  listScheduledTasks,
  createScheduledTask,
  updateScheduledTask,
  deleteScheduledTask,
  pauseScheduledTask,
  resumeScheduledTask,
  runTaskNow,
  cronToHumanReadable,
  type ScheduledTask,
  type ScheduledTaskCreate,
  type ScheduledTaskUpdate,
} from "@/api/scheduled-tasks"
import { IconDotsVertical, IconHistory, IconSearch } from "@tabler/icons-react"
import { t } from "./components/translations"

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
  const [purgeDialogOpen, setPurgeDialogOpen] = useState(false)
  const [selectedQueue, setSelectedQueue] = useState<string | null>(null)
  const [scheduledTasks, setScheduledTasks] = useState<ScheduledTask[]>([])
  const [tasksLoading, setTasksLoading] = useState(false)
  const [taskDialogOpen, setTaskDialogOpen] = useState(false)
  const [selectedTask, setSelectedTask] = useState<ScheduledTask | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [taskToDelete, setTaskToDelete] = useState<ScheduledTask | null>(null)
  const [logsDialogOpen, setLogsDialogOpen] = useState(false)
  const [taskForLogs, setTaskForLogs] = useState<ScheduledTask | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const { toast } = useToast()

  const fetchStats = useCallback(async () => {
    setLoading(true)
    try {
      const data = await getQueueStats()
      setStats(data)
    } catch (_error) {
      toast({
        variant: "destructive",
        title: "Erreur",
        description: "Impossible de charger les statistiques",
      })
    } finally {
      setLoading(false)
    }
  }, [toast])

  const fetchScheduledTasks = useCallback(async () => {
    setTasksLoading(true)
    try {
      const response = await listScheduledTasks({ include_inactive: true })
      setScheduledTasks(response.data)
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Erreur",
        description: "Impossible de charger les tâches planifiées",
      })
    } finally {
      setTasksLoading(false)
    }
  }, [toast])

  useEffect(() => {
    fetchStats()
    fetchScheduledTasks()
    // Refresh every 5 seconds
    const interval = setInterval(fetchStats, 5000)
    return () => clearInterval(interval)
  }, [fetchStats, fetchScheduledTasks])

  const handleCreateTask = () => {
    setSelectedTask(null)
    setTaskDialogOpen(true)
  }

  const handleEditTask = (task: ScheduledTask) => {
    setSelectedTask(task)
    setTaskDialogOpen(true)
  }

  const handleSaveTask = async (data: ScheduledTaskCreate | ScheduledTaskUpdate) => {
    if (selectedTask) {
      await updateScheduledTask(selectedTask.id, data as ScheduledTaskUpdate)
    } else {
      await createScheduledTask(data as ScheduledTaskCreate)
    }
    await fetchScheduledTasks()
  }

  const handleDeleteTask = async () => {
    if (!taskToDelete) return
    try {
      await deleteScheduledTask(taskToDelete.id)
      toast({
        title: "Tâche supprimée",
        description: `La tâche "${taskToDelete.name}" a été supprimée`,
      })
      await fetchScheduledTasks()
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Erreur",
        description: "Impossible de supprimer la tâche",
      })
    } finally {
      setDeleteDialogOpen(false)
      setTaskToDelete(null)
    }
  }

  const handlePauseTask = async (task: ScheduledTask) => {
    try {
      await pauseScheduledTask(task.id)
      toast({
        title: "Tâche mise en pause",
        description: `La tâche "${task.name}" est en pause`,
      })
      await fetchScheduledTasks()
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Erreur",
        description: "Impossible de mettre en pause la tâche",
      })
    }
  }

  const handleResumeTask = async (task: ScheduledTask) => {
    try {
      await resumeScheduledTask(task.id)
      toast({
        title: "Tâche reprise",
        description: `La tâche "${task.name}" est active`,
      })
      await fetchScheduledTasks()
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Erreur",
        description: "Impossible de reprendre la tâche",
      })
    }
  }

  const handleRunNow = async (task: ScheduledTask) => {
    try {
      const result = await runTaskNow(task.id)
      toast({
        title: "Tâche lancée",
        description: `La tâche "${task.name}" a été lancée avec l'ID ${result.task_id}`,
      })
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Erreur",
        description: "Impossible de lancer la tâche",
      })
    }
  }

  const handlePurgeQueue = async () => {
    if (!selectedQueue) return

    try {
      const result = await purgeQueue(selectedQueue)
      toast({
        title: "Queue vidée",
        description: `${result.tasks_deleted} tâches supprimées de ${selectedQueue}`,
      })
      setPurgeDialogOpen(false)
      setSelectedQueue(null)
      fetchStats()
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Erreur",
        description: "Impossible de vider la queue",
      })
    }
  }

  if (loading && !stats) {
    return (
      <div className="flex flex-1 flex-col space-y-4">
        <div>
          <h3 className="text-lg font-medium">Monitoring des Tâches</h3>
          <p className="text-sm text-muted-foreground">Surveillez et gérez les tâches de fond Celery en temps réel</p>
        </div>
        <Separator />
        <div className="flex items-center justify-center py-12">
          <IconRefresh className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    )
  }

  const totalWorkers = Object.keys(stats?.workers || {}).length
  const totalActive = Object.values(stats?.workers || {}).reduce((acc, w) => acc + w.active, 0)
  const totalScheduled = Object.values(stats?.workers || {}).reduce((acc, w) => acc + w.scheduled, 0)
  const totalReserved = Object.values(stats?.workers || {}).reduce((acc, w) => acc + w.reserved, 0)
  const totalTasks = totalActive + totalScheduled + totalReserved

  return (
    <div className="flex flex-1 flex-col space-y-4">
      <div>
        <h3 className="text-lg font-medium">Monitoring des Tâches Celery</h3>
        <p className="text-sm text-muted-foreground">Surveillez et gérez les tâches de fond, workers et queues en temps réel</p>
      </div>
      <Separator />
      <div className="space-y-6">
        {/* Header Actions */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${totalWorkers > 0 ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
              <span className="text-sm font-medium">
                {totalWorkers > 0 ? `${totalWorkers} Worker${totalWorkers > 1 ? 's' : ''} actif${totalWorkers > 1 ? 's' : ''}` : 'Aucun worker'}
              </span>
            </div>
            {totalTasks > 0 && (
              <Badge variant="secondary" className="gap-1">
                <IconActivity className="h-3 w-3" />
                {totalTasks} tâche{totalTasks > 1 ? 's' : ''}
              </Badge>
            )}
          </div>

          <Button variant="outline" size="sm" onClick={fetchStats} disabled={loading}>
            <IconRefresh className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Actualiser
          </Button>
        </div>

        {/* Statistics Cards - Ultra compact */}
        <div className="grid gap-2 grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardContent className="p-3">
              <div className="flex items-center gap-2">
                <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-green-500/10 flex items-center justify-center">
                  <IconPlayerPlay className="h-4 w-4 text-green-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] text-muted-foreground font-medium">En cours</p>
                  <p className="text-xl font-bold text-green-700 dark:text-green-400">{totalActive}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-3">
              <div className="flex items-center gap-2">
                <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
                  <IconClock className="h-4 w-4 text-blue-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] text-muted-foreground font-medium">Planifiées</p>
                  <p className="text-xl font-bold text-blue-700 dark:text-blue-400">{totalScheduled}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-3">
              <div className="flex items-center gap-2">
                <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center">
                  <IconCircleDashed className="h-4 w-4 text-amber-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] text-muted-foreground font-medium">Réservées</p>
                  <p className="text-xl font-bold text-amber-700 dark:text-amber-400">{totalReserved}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-3">
              <div className="flex items-center gap-2">
                <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-purple-500/10 flex items-center justify-center">
                  <IconServer className="h-4 w-4 text-purple-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] text-muted-foreground font-medium">Workers</p>
                  <p className="text-xl font-bold text-purple-700 dark:text-purple-400">{totalWorkers}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="workers" className="space-y-4">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="workers" className="text-xs sm:text-sm">
              <IconServer className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Workers</span>
            </TabsTrigger>
            <TabsTrigger value="queues" className="text-xs sm:text-sm">
              <IconActivity className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Queues</span>
            </TabsTrigger>
            <TabsTrigger value="schedule" className="text-xs sm:text-sm">
              <IconClock className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Planification</span>
            </TabsTrigger>
          </TabsList>

          {/* Workers Tab */}
          <TabsContent value="workers" className="space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <IconServer className="h-4 w-4" />
                  Workers Celery
                </CardTitle>
                <CardDescription className="text-xs">
                  Workers actifs et leurs tâches en cours
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-0">
                {totalWorkers === 0 ? (
                  <div className="text-center py-12">
                    <div className="mx-auto w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
                      <IconAlertTriangle className="h-8 w-8 text-muted-foreground" />
                    </div>
                    <h3 className="text-lg font-semibold mb-2">Aucun worker actif</h3>
                    <p className="text-sm text-muted-foreground max-w-md mx-auto">
                      Aucun worker Celery n'est actuellement connecté. Vérifiez que le service celery-worker est démarré.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {Object.entries(stats?.workers || {}).map(([name, worker]) => (
                      <Card key={name}>
                        <CardContent className="p-3">
                          <div className="flex items-center gap-2 mb-2">
                            <div className="w-2 h-2 rounded-full bg-green-500" />
                            <h4 className="font-semibold text-sm truncate flex-1">{name}</h4>
                            <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
                              Actif
                            </Badge>
                          </div>

                          <div className="grid grid-cols-3 gap-2">
                            <div className="bg-muted/30 rounded p-1.5">
                              <div className="flex items-center gap-1 mb-0.5">
                                <IconPlayerPlay className="h-3 w-3 text-green-600" />
                                <span className="text-[10px] text-muted-foreground">En cours</span>
                              </div>
                              <div className="text-base font-bold">{worker.active}</div>
                            </div>

                            <div className="bg-muted/30 rounded p-1.5">
                              <div className="flex items-center gap-1 mb-0.5">
                                <IconClock className="h-3 w-3 text-blue-600" />
                                <span className="text-[10px] text-muted-foreground">Planif.</span>
                              </div>
                              <div className="text-base font-bold">{worker.scheduled}</div>
                            </div>

                            <div className="bg-muted/30 rounded p-1.5">
                              <div className="flex items-center gap-1 mb-0.5">
                                <IconCircleDashed className="h-3 w-3 text-amber-600" />
                                <span className="text-[10px] text-muted-foreground">Réserv.</span>
                              </div>
                              <div className="text-base font-bold">{worker.reserved}</div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Queues Tab */}
          <TabsContent value="queues" className="space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <IconActivity className="h-4 w-4" />
                  Files d'Attente
                </CardTitle>
                <CardDescription className="text-xs">
                  Gestion des différentes queues de tâches
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="space-y-2">
                  {Object.entries(stats?.queues || {}).map(([name, queue]) => (
                    <Card key={name}>
                      <CardContent className="p-3">
                        <div className="flex items-center gap-2">
                          <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                            <IconActivity className="h-4 w-4 text-primary" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <h4 className="font-semibold text-sm truncate">{name}</h4>
                            <p className="text-[10px] text-muted-foreground">
                              {queue.length} tâche{queue.length !== 1 ? 's' : ''}
                            </p>
                          </div>
                          <Badge variant={queue.length > 0 ? "default" : "outline"} className="h-6 px-2 text-xs">
                            {queue.length}
                          </Badge>
                          {queue.length > 0 && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0"
                              onClick={() => {
                                setSelectedQueue(name)
                                setPurgeDialogOpen(true)
                              }}
                            >
                              <IconTrash className="h-3.5 w-3.5 text-destructive" />
                            </Button>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Schedule Tab */}
          <TabsContent value="schedule" className="space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <IconClock className="h-4 w-4" />
                      Tâches Planifiées (Beat)
                    </CardTitle>
                    <CardDescription className="text-xs">
                      Tâches exécutées automatiquement selon un calendrier
                    </CardDescription>
                  </div>
                  <Button size="sm" onClick={handleCreateTask}>
                    <IconPlus className="h-4 w-4 mr-2" />
                    Créer
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                {tasksLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <IconRefresh className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : scheduledTasks.length === 0 ? (
                  <div className="text-center py-12">
                    <div className="mx-auto w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
                      <IconClock className="h-8 w-8 text-muted-foreground" />
                    </div>
                    <h3 className="text-lg font-semibold mb-2">Aucune tâche planifiée</h3>
                    <p className="text-sm text-muted-foreground max-w-md mx-auto mb-4">
                      Créez votre première tâche planifiée pour automatiser des processus récurrents.
                    </p>
                    <Button onClick={handleCreateTask}>
                      <IconPlus className="h-4 w-4 mr-2" />
                      Créer une tâche
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {scheduledTasks.map((task) => (
                      <Card key={task.id}>
                        <CardContent className="p-3">
                          <div className="flex items-start gap-2 mb-2">
                            <div className={`w-2 h-2 rounded-full mt-1.5 ${
                              task.is_paused ? 'bg-amber-500' : task.is_active ? 'bg-green-500' : 'bg-gray-400'
                            }`} />
                            <div className="flex-1 min-w-0">
                              <h4 className="font-semibold text-sm break-all">{task.task_name}</h4>
                              <p className="text-[11px] text-muted-foreground">{task.name}</p>
                              {task.description && (
                                <p className="text-[10px] text-muted-foreground mt-0.5">{task.description}</p>
                              )}
                            </div>
                            <div className="flex items-center gap-1">
                              <Badge
                                variant={task.is_paused ? "outline" : task.is_active ? "secondary" : "outline"}
                                className="h-5 px-1.5 text-[10px]"
                              >
                                {task.is_paused ? "Pause" : task.is_active ? "Actif" : "Inactif"}
                              </Badge>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                                    <IconDotsVertical className="h-3.5 w-3.5" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem onClick={() => handleEditTask(task)}>
                                    <IconEdit className="h-3.5 w-3.5 mr-2" />
                                    Éditer
                                  </DropdownMenuItem>
                                  {task.is_paused ? (
                                    <DropdownMenuItem onClick={() => handleResumeTask(task)}>
                                      <IconPlayerPlayFilled className="h-3.5 w-3.5 mr-2" />
                                      Reprendre
                                    </DropdownMenuItem>
                                  ) : (
                                    <DropdownMenuItem onClick={() => handlePauseTask(task)}>
                                      <IconPlayerPause className="h-3.5 w-3.5 mr-2" />
                                      Mettre en pause
                                    </DropdownMenuItem>
                                  )}
                                  <DropdownMenuItem onClick={() => handleRunNow(task)}>
                                    <IconPlayerPlay className="h-3.5 w-3.5 mr-2" />
                                    Exécuter maintenant
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={() => {
                                      setTaskToDelete(task)
                                      setDeleteDialogOpen(true)
                                    }}
                                    className="text-destructive"
                                  >
                                    <IconTrash className="h-3.5 w-3.5 mr-2" />
                                    Supprimer
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          </div>

                          <div className="space-y-1 text-xs pl-4">
                            <div className="flex items-center gap-1.5 text-muted-foreground">
                              <IconClock className="h-3 w-3 flex-shrink-0" />
                              <span className="break-words">{cronToHumanReadable(task)}</span>
                            </div>

                            {task.last_run_at ? (
                              <div className="flex items-center gap-1.5 text-muted-foreground">
                                {task.last_run_success ? (
                                  <IconCircleCheck className="h-3 w-3 flex-shrink-0 text-green-600" />
                                ) : (
                                  <IconCircleX className="h-3 w-3 flex-shrink-0 text-red-600" />
                                )}
                                <span className="break-words text-[11px]">
                                  {formatDistanceToNow(new Date(task.last_run_at), { addSuffix: true, locale: fr })}
                                  {!task.last_run_success && task.last_run_error && (
                                    <span className="text-red-600"> - {task.last_run_error}</span>
                                  )}
                                </span>
                              </div>
                            ) : (
                              <div className="flex items-center gap-1.5 text-muted-foreground">
                                <IconCircleDashed className="h-3 w-3 flex-shrink-0" />
                                <span className="text-[11px]">Jamais exécuté</span>
                              </div>
                            )}

                            {task.total_run_count > 0 && (
                              <div className="flex items-center gap-1.5 text-muted-foreground">
                                <IconTrendingUp className="h-3 w-3 flex-shrink-0" />
                                <span className="text-[11px]">{task.total_run_count} exécution{task.total_run_count > 1 ? 's' : ''}</span>
                              </div>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Info Card */}
        <Card className="border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/20">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-blue-700 dark:text-blue-300 text-sm">
              <IconAlertCircle className="h-4 w-4" />
              À propos
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs space-y-1">
            <p><strong>Workers:</strong> Processus qui exécutent les tâches async</p>
            <p><strong>Queues:</strong> Files d'attente pour organiser et prioriser les tâches</p>
            <p><strong>Beat:</strong> Scheduler qui lance les tâches récurrentes</p>
            <p><strong>Actualisation:</strong> Données rafraîchies toutes les 5s</p>
          </CardContent>
        </Card>
      </div>

      {/* Purge Queue Dialog */}
      <AlertDialog open={purgeDialogOpen} onOpenChange={setPurgeDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Vider la queue "{selectedQueue}"</AlertDialogTitle>
            <AlertDialogDescription>
              Êtes-vous sûr de vouloir supprimer toutes les tâches en attente de la queue "{selectedQueue}" ?
              Cette action est irréversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setSelectedQueue(null)}>
              Annuler
            </AlertDialogCancel>
            <AlertDialogAction onClick={handlePurgeQueue} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              <IconTrash className="h-4 w-4 mr-2" />
              Vider la queue
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Task Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer la tâche planifiée</AlertDialogTitle>
            <AlertDialogDescription>
              Êtes-vous sûr de vouloir supprimer la tâche "{taskToDelete?.name}" ?
              Cette action est irréversible et la tâche ne sera plus exécutée.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setTaskToDelete(null)}>
              Annuler
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteTask} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              <IconTrash className="h-4 w-4 mr-2" />
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Task Drawer */}
      <TaskDrawer
        open={taskDialogOpen}
        onOpenChange={setTaskDialogOpen}
        task={selectedTask}
        onSave={handleSaveTask}
      />
    </div>
  )
}
