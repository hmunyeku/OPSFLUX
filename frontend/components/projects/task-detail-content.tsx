"use client"

import { useState, useEffect, useMemo } from "react"
import { useRouter } from "next/navigation"
import { useHeaderContext } from "@/components/header-context"
import { mockTasks as initialMockTasks, mockProjects, type Task, type TaskStatus, type TaskPriority } from "@/lib/projects-data"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import {
  ArrowLeft,
  Calendar,
  Clock,
  Edit2,
  Trash2,
  FolderKanban,
  User,
  Tag,
  AlertCircle,
  CheckCircle2,
  Target,
  Flag,
  MessageSquare,
  Timer,
  FileText,
  Users,
  Link2,
  ChevronRight,
  Save
} from "lucide-react"
import { cn } from "@/lib/utils"
import { TaskDrawer } from "./task-drawer"
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

const priorityColors: Record<TaskPriority, string> = {
  low: "bg-gray-500/10 text-gray-700 dark:text-gray-400 border-gray-300",
  medium: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-300",
  high: "bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-300",
  critical: "bg-red-500/10 text-red-700 dark:text-red-400 border-red-300",
}

const priorityLabels: Record<TaskPriority, string> = {
  low: "Basse",
  medium: "Moyenne",
  high: "Haute",
  critical: "Critique",
}

const statusLabels: Record<TaskStatus, string> = {
  todo: "A faire",
  "in-progress": "En cours",
  review: "En revue",
  done: "Termine",
  blocked: "Bloque",
}

const statusColors: Record<TaskStatus, string> = {
  todo: "bg-gray-500/10 text-gray-600 border-gray-300",
  "in-progress": "bg-blue-500/10 text-blue-600 border-blue-300",
  review: "bg-purple-500/10 text-purple-600 border-purple-300",
  done: "bg-green-500/10 text-green-600 border-green-300",
  blocked: "bg-red-500/10 text-red-600 border-red-300",
}

const statusList: { value: TaskStatus; label: string; color: string }[] = [
  { value: "todo", label: "A faire", color: "border-gray-400 bg-gray-400" },
  { value: "in-progress", label: "En cours", color: "border-blue-500 bg-blue-500" },
  { value: "review", label: "En revue", color: "border-purple-500 bg-purple-500" },
  { value: "done", label: "Termine", color: "border-green-500 bg-green-500" },
  { value: "blocked", label: "Bloque", color: "border-red-500 bg-red-500" },
]

interface TaskDetailContentProps {
  taskId: string
}

export function TaskDetailContent({ taskId }: TaskDetailContentProps) {
  const router = useRouter()
  const [task, setTask] = useState<Task | null>(null)
  const [loading, setLoading] = useState(true)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [personalNotes, setPersonalNotes] = useState("")
  const { setContextualHeader, clearContextualHeader } = useHeaderContext()

  // Find task from mock data
  useEffect(() => {
    const foundTask = initialMockTasks.find((t) => t.id === taskId)
    setTask(foundTask || null)
    setPersonalNotes(foundTask?.personalNotes || "")
    setLoading(false)
  }, [taskId])

  useEffect(() => {
    setContextualHeader({
      contextualButtons: [
        {
          label: "Modifier",
          icon: Edit2,
          onClick: () => setDrawerOpen(true),
          variant: "outline",
        },
      ],
    })
    return () => clearContextualHeader()
  }, [setContextualHeader, clearContextualHeader])

  const project = useMemo(() => {
    if (!task) return null
    return mockProjects.find((p) => p.id === task.projectId)
  }, [task])

  const isOverdue = task && task.status !== "done" && new Date(task.dueDate) < new Date()
  const daysUntilDue = task ? Math.ceil((new Date(task.dueDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)) : 0

  const handleSaveTask = (taskData: Partial<Task>) => {
    if (task) {
      setTask({ ...task, ...taskData })
    }
    setDrawerOpen(false)
  }

  const handleDeleteTask = () => {
    setDeleteDialogOpen(false)
    router.push("/projects/tasks")
  }

  const handleStatusChange = (newStatus: TaskStatus) => {
    if (task) {
      setTask({ ...task, status: newStatus })
    }
  }

  const handleSaveNotes = () => {
    if (task) {
      setTask({ ...task, personalNotes })
    }
  }

  // Calculate workload
  const workloadPercent = task?.estimatedHours
    ? Math.round(((task.usedHours || 0) / task.estimatedHours) * 100)
    : 0

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center space-y-2">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto" />
          <p className="text-sm text-muted-foreground">Chargement...</p>
        </div>
      </div>
    )
  }

  if (!task) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-6">
        <div className="rounded-full bg-muted p-4">
          <AlertCircle className="h-8 w-8 text-muted-foreground" />
        </div>
        <div className="text-center space-y-1">
          <h2 className="text-lg font-semibold">Tache introuvable</h2>
          <p className="text-sm text-muted-foreground">
            La tache avec l'identifiant "{taskId}" n'existe pas.
          </p>
        </div>
        <Button variant="outline" onClick={() => router.push("/projects/tasks")}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Retour aux taches
        </Button>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="flex items-center gap-4 p-4">
          <Button variant="ghost" size="sm" onClick={() => router.push("/projects/tasks")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3">
              {task.reference && (
                <Badge variant="outline" className="shrink-0 font-mono text-xs">
                  {task.reference}
                </Badge>
              )}
              <h1 className="text-xl font-semibold truncate">{task.title}</h1>
              {task.isMilestone && (
                <Badge variant="secondary" className="shrink-0">
                  <Target className="h-3 w-3 mr-1" />
                  Jalon
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
              <FolderKanban className="h-3.5 w-3.5" />
              <button
                onClick={() => router.push(`/projects/${task.projectId}`)}
                className="hover:text-foreground hover:underline transition-colors"
              >
                {project?.code || task.projectId} - {project?.name || "Projet"}
              </button>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button variant="outline" size="sm" onClick={() => setDrawerOpen(true)}>
              <Edit2 className="h-4 w-4 mr-2" />
              Modifier
            </Button>
            <Button variant="destructive" size="sm" onClick={() => setDeleteDialogOpen(true)}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Content - Two column Gouti-style layout */}
      <div className="flex-1 overflow-y-auto">
        <div className="flex h-full">
          {/* Left Column - Main Content with Tabs */}
          <div className="flex-1 p-6 overflow-y-auto border-r">
            <Tabs defaultValue="information" className="space-y-6">
              <TabsList className="grid w-full grid-cols-3 lg:w-[400px]">
                <TabsTrigger value="information">
                  <FileText className="h-4 w-4 mr-2" />
                  Information
                </TabsTrigger>
                <TabsTrigger value="temps">
                  <Timer className="h-4 w-4 mr-2" />
                  Temps
                </TabsTrigger>
                <TabsTrigger value="commentaires">
                  <MessageSquare className="h-4 w-4 mr-2" />
                  Commentaires
                </TabsTrigger>
              </TabsList>

              {/* Information Tab */}
              <TabsContent value="information" className="space-y-6">
                {/* Description Section */}
                <div className="space-y-3">
                  <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                    Description
                  </h3>
                  <Card>
                    <CardContent className="pt-4">
                      {task.description ? (
                        <p className="text-sm whitespace-pre-wrap">{task.description}</p>
                      ) : (
                        <p className="text-sm text-muted-foreground italic">Aucune description</p>
                      )}
                    </CardContent>
                  </Card>
                </div>

                {/* Dates Section */}
                <div className="space-y-3">
                  <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                    Dates
                  </h3>
                  <Card>
                    <CardContent className="pt-4">
                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-1">
                          <p className="text-xs text-muted-foreground">Date de debut</p>
                          <div className="flex items-center gap-2">
                            <Calendar className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm font-medium">
                              {task.startDate
                                ? new Date(task.startDate).toLocaleDateString("fr-FR", {
                                    day: "numeric",
                                    month: "long",
                                    year: "numeric",
                                  })
                                : "Non definie"}
                            </span>
                          </div>
                        </div>
                        <div className="space-y-1">
                          <p className="text-xs text-muted-foreground">Date d'echeance</p>
                          <div className="flex items-center gap-2">
                            <Calendar className={cn("h-4 w-4", isOverdue ? "text-red-500" : "text-muted-foreground")} />
                            <span className={cn("text-sm font-medium", isOverdue && "text-red-500")}>
                              {new Date(task.dueDate).toLocaleDateString("fr-FR", {
                                day: "numeric",
                                month: "long",
                                year: "numeric",
                              })}
                            </span>
                          </div>
                          <p className={cn("text-xs", isOverdue ? "text-red-500" : "text-muted-foreground")}>
                            {isOverdue
                              ? `En retard de ${Math.abs(daysUntilDue)} jour(s)`
                              : daysUntilDue === 0
                                ? "Aujourd'hui"
                                : `Dans ${daysUntilDue} jour(s)`}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Tags Section */}
                {task.tags && task.tags.length > 0 && (
                  <div className="space-y-3">
                    <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                      Tags
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {task.tags.map((tag) => (
                        <Badge key={tag} variant="outline">
                          <Tag className="h-3 w-3 mr-1" />
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* Dependencies Section */}
                {(task.predecessors?.length || task.successors?.length) && (
                  <div className="space-y-3">
                    <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                      Dependances
                    </h3>
                    <Card>
                      <CardContent className="pt-4 space-y-4">
                        {task.predecessors && task.predecessors.length > 0 && (
                          <div className="space-y-2">
                            <p className="text-xs text-muted-foreground">Predecesseurs</p>
                            <div className="space-y-1">
                              {task.predecessors.map((predId) => {
                                const predTask = initialMockTasks.find((t) => t.id === predId)
                                return (
                                  <button
                                    key={predId}
                                    onClick={() => router.push(`/projects/tasks/${predId}`)}
                                    className="flex items-center gap-2 text-sm hover:text-primary transition-colors w-full text-left"
                                  >
                                    <Link2 className="h-3 w-3" />
                                    <span>{predTask?.title || predId}</span>
                                    <ChevronRight className="h-3 w-3 ml-auto" />
                                  </button>
                                )
                              })}
                            </div>
                          </div>
                        )}
                        {task.successors && task.successors.length > 0 && (
                          <div className="space-y-2">
                            <p className="text-xs text-muted-foreground">Successeurs</p>
                            <div className="space-y-1">
                              {task.successors.map((succId) => {
                                const succTask = initialMockTasks.find((t) => t.id === succId)
                                return (
                                  <button
                                    key={succId}
                                    onClick={() => router.push(`/projects/tasks/${succId}`)}
                                    className="flex items-center gap-2 text-sm hover:text-primary transition-colors w-full text-left"
                                  >
                                    <Link2 className="h-3 w-3" />
                                    <span>{succTask?.title || succId}</span>
                                    <ChevronRight className="h-3 w-3 ml-auto" />
                                  </button>
                                )
                              })}
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </div>
                )}
              </TabsContent>

              {/* Temps Tab - Workload */}
              <TabsContent value="temps" className="space-y-6">
                <div className="space-y-3">
                  <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                    Charge de travail
                  </h3>
                  <Card>
                    <CardContent className="pt-4 space-y-4">
                      <div className="grid grid-cols-3 gap-4 text-center">
                        <div className="space-y-1">
                          <p className="text-2xl font-bold">{task.estimatedHours || 0}h</p>
                          <p className="text-xs text-muted-foreground">Estime</p>
                        </div>
                        <div className="space-y-1">
                          <p className="text-2xl font-bold text-blue-600">{task.usedHours || 0}h</p>
                          <p className="text-xs text-muted-foreground">Consomme</p>
                        </div>
                        <div className="space-y-1">
                          <p className="text-2xl font-bold text-green-600">{task.remainingHours || 0}h</p>
                          <p className="text-xs text-muted-foreground">Restant</p>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Progression</span>
                          <span className="font-medium">{workloadPercent}%</span>
                        </div>
                        <Progress value={workloadPercent} className="h-2" />
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Time entries placeholder */}
                <div className="space-y-3">
                  <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                    Saisies de temps
                  </h3>
                  <Card>
                    <CardContent className="pt-4">
                      <div className="text-center py-8 text-muted-foreground">
                        <Clock className="h-8 w-8 mx-auto mb-2 opacity-50" />
                        <p className="text-sm">Aucune saisie de temps</p>
                        <Button variant="outline" size="sm" className="mt-4">
                          <Timer className="h-4 w-4 mr-2" />
                          Ajouter du temps
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              {/* Commentaires Tab */}
              <TabsContent value="commentaires" className="space-y-6">
                <div className="space-y-3">
                  <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                    Commentaires ({task.comments?.length || 0})
                  </h3>
                  {task.comments && task.comments.length > 0 ? (
                    <div className="space-y-4">
                      {task.comments.map((comment) => (
                        <Card key={comment.id}>
                          <CardContent className="pt-4">
                            <div className="flex items-start gap-3">
                              <Avatar className="h-8 w-8">
                                <AvatarFallback className="text-xs">
                                  {comment.author.split(" ").map((n) => n[0]).join("")}
                                </AvatarFallback>
                              </Avatar>
                              <div className="flex-1 space-y-1">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-medium">{comment.author}</span>
                                  <span className="text-xs text-muted-foreground">
                                    {new Date(comment.createdAt).toLocaleDateString("fr-FR", {
                                      day: "numeric",
                                      month: "short",
                                      hour: "2-digit",
                                      minute: "2-digit",
                                    })}
                                  </span>
                                </div>
                                <p className="text-sm">{comment.content}</p>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  ) : (
                    <Card>
                      <CardContent className="pt-4">
                        <div className="text-center py-8 text-muted-foreground">
                          <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-50" />
                          <p className="text-sm">Aucun commentaire</p>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Add comment */}
                  <Card>
                    <CardContent className="pt-4">
                      <div className="space-y-3">
                        <Textarea placeholder="Ajouter un commentaire..." rows={3} />
                        <div className="flex justify-end">
                          <Button size="sm">
                            <MessageSquare className="h-4 w-4 mr-2" />
                            Commenter
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>
            </Tabs>
          </div>

          {/* Right Column - Sidebar (Gouti-style) */}
          <div className="w-80 shrink-0 p-6 space-y-6 overflow-y-auto bg-muted/30">
            {/* Quick Stats */}
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                Indicateurs
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <Card className="bg-background">
                  <CardContent className="p-3 text-center">
                    <p className="text-2xl font-bold">{task.progress}%</p>
                    <p className="text-xs text-muted-foreground">Progression</p>
                  </CardContent>
                </Card>
                <Card className={cn("bg-background", isOverdue && "border-red-300")}>
                  <CardContent className="p-3 text-center">
                    <p className={cn("text-2xl font-bold", isOverdue && "text-red-500")}>
                      {Math.abs(daysUntilDue)}j
                    </p>
                    <p className={cn("text-xs", isOverdue ? "text-red-500" : "text-muted-foreground")}>
                      {isOverdue ? "Retard" : "Restant"}
                    </p>
                  </CardContent>
                </Card>
              </div>
            </div>

            {/* Status Section */}
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                Statut
              </h3>
              <Card className="bg-background">
                <CardContent className="p-3 space-y-2">
                  {statusList.map((status) => (
                    <button
                      key={status.value}
                      onClick={() => handleStatusChange(status.value)}
                      className={cn(
                        "w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors",
                        task.status === status.value
                          ? "bg-primary/10 text-primary font-medium"
                          : "hover:bg-muted"
                      )}
                    >
                      <div
                        className={cn(
                          "w-3 h-3 rounded-full border-2",
                          task.status === status.value ? status.color : "border-muted-foreground/30"
                        )}
                      />
                      {status.label}
                      {task.status === status.value && (
                        <CheckCircle2 className="h-4 w-4 ml-auto" />
                      )}
                    </button>
                  ))}
                </CardContent>
              </Card>
            </div>

            {/* Priority */}
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                Priorite
              </h3>
              <Card className="bg-background">
                <CardContent className="p-3">
                  <Badge className={cn("text-sm", priorityColors[task.priority])}>
                    <Flag className="h-3 w-3 mr-1" />
                    {priorityLabels[task.priority]}
                  </Badge>
                </CardContent>
              </Card>
            </div>

            {/* Assignee */}
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                Responsable
              </h3>
              <Card className="bg-background">
                <CardContent className="p-3">
                  {task.assignee ? (
                    <div className="flex items-center gap-3">
                      <Avatar className="h-10 w-10">
                        <AvatarFallback>
                          {task.assignee.split(" ").map((n) => n[0]).join("")}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="text-sm font-medium">{task.assignee}</p>
                        {task.team && (
                          <p className="text-xs text-muted-foreground">{task.team}</p>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <User className="h-4 w-4" />
                      <span className="text-sm">Non assigne</span>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Workload Summary */}
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                Charge
              </h3>
              <Card className="bg-background">
                <CardContent className="p-3 space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Estime</span>
                    <span className="font-medium">{task.estimatedHours || 0}h</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Consomme</span>
                    <span className="font-medium text-blue-600">{task.usedHours || 0}h</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Restant</span>
                    <span className="font-medium text-green-600">{task.remainingHours || 0}h</span>
                  </div>
                  <Progress value={workloadPercent} className="h-2" />
                </CardContent>
              </Card>
            </div>

            {/* Personal Notes */}
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                Notes personnelles
              </h3>
              <Card className="bg-background">
                <CardContent className="p-3 space-y-3">
                  <Textarea
                    value={personalNotes}
                    onChange={(e) => setPersonalNotes(e.target.value)}
                    placeholder="Vos notes personnelles..."
                    rows={4}
                    className="text-sm resize-none"
                  />
                  {personalNotes !== (task.personalNotes || "") && (
                    <Button size="sm" className="w-full" onClick={handleSaveNotes}>
                      <Save className="h-4 w-4 mr-2" />
                      Enregistrer
                    </Button>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Blocked warning */}
            {task.status === "blocked" && (
              <Card className="border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-900/20">
                <CardContent className="p-3">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-red-700 dark:text-red-400">Bloque</p>
                      <p className="text-xs text-red-600 dark:text-red-400/80">
                        Cette tache necessite une attention.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Attention required */}
            {task.isAttentionRequired && task.status !== "blocked" && (
              <Card className="border-orange-300 dark:border-orange-800 bg-orange-50 dark:bg-orange-900/20">
                <CardContent className="p-3">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 text-orange-500 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-orange-700 dark:text-orange-400">Attention requise</p>
                      <p className="text-xs text-orange-600 dark:text-orange-400/80">
                        Cette tache necessite votre attention.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>

      {/* Task Drawer for editing */}
      <TaskDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        task={task}
        onSave={handleSaveTask}
        onDelete={handleDeleteTask}
      />

      {/* Delete confirmation dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer la tache</AlertDialogTitle>
            <AlertDialogDescription>
              Etes-vous sur de vouloir supprimer la tache "{task.title}" ? Cette action est irreversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteTask} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
