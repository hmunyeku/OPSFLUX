"use client"

import { useState, useEffect } from "react"
import { useHeaderContext } from "@/components/header-context"
import { mockTasks, type Task, type TaskStatus } from "@/lib/projects-data"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Filter, MoreVertical, Calendar, CheckCircle2, AlertCircle, FolderKanban, Plus } from "lucide-react"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

const statusColors: Record<TaskStatus, string> = {
  todo: "bg-gray-500/10 text-gray-700 dark:text-gray-400",
  "in-progress": "bg-blue-500/10 text-blue-700 dark:text-blue-400",
  review: "bg-purple-500/10 text-purple-700 dark:text-purple-400",
  done: "bg-green-500/10 text-green-700 dark:text-green-400",
  blocked: "bg-red-500/10 text-red-700 dark:text-red-400",
}

const priorityColors: Record<string, string> = {
  low: "bg-gray-500/10 text-gray-700 dark:text-gray-400",
  medium: "bg-blue-500/10 text-blue-700 dark:text-blue-400",
  high: "bg-orange-500/10 text-orange-700 dark:text-orange-400",
  critical: "bg-red-500/10 text-red-700 dark:text-red-400",
}

export function TasksContent() {
  const [searchQuery, setSearchQuery] = useState("")
  const [tasks] = useState<Task[]>(mockTasks)
  const { setContextualHeader, clearContextualHeader } = useHeaderContext()

  useEffect(() => {
    setContextualHeader({
      searchPlaceholder: "Rechercher tâches...",
      onSearchChange: setSearchQuery,
      contextualButtons: [
        {
          label: "Nouvelle tâche",
          icon: Plus,
          onClick: () => {
            // TODO: Open new task dialog
            console.log("New task")
          },
        },
      ],
    })

    return () => clearContextualHeader()
  }, [setContextualHeader, clearContextualHeader])

  const filteredTasks = tasks.filter(
    (task) =>
      task.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      task.project.toLowerCase().includes(searchQuery.toLowerCase()) ||
      task.description.toLowerCase().includes(searchQuery.toLowerCase()),
  )

  const groupedTasks = filteredTasks.reduce(
    (acc, task) => {
      if (!acc[task.status]) {
        acc[task.status] = []
      }
      acc[task.status].push(task)
      return acc
    },
    {} as Record<TaskStatus, Task[]>,
  )

  const columns: { status: TaskStatus; label: string; color: string }[] = [
    { status: "todo", label: "À faire", color: "text-gray-600" },
    { status: "in-progress", label: "En cours", color: "text-blue-600" },
    { status: "review", label: "Revue", color: "text-purple-600" },
    { status: "done", label: "Terminé", color: "text-green-600" },
    { status: "blocked", label: "Bloqué", color: "text-red-600" },
  ]

  return (
    <div className="flex h-full flex-col gap-2 p-2">
      {/* Toolbar */}
      <div className="flex items-center gap-2">
        <Select defaultValue="all">
          <SelectTrigger className="h-8 w-[120px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous projets</SelectItem>
            <SelectItem value="1">Offshore Platform</SelectItem>
            <SelectItem value="2">Subsea Pipeline</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs bg-transparent">
          <Filter className="h-3 w-3" />
          Filtres
        </Button>
      </div>

      {/* Results count */}
      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
        <span>{filteredTasks.length} tâches</span>
      </div>

      {/* Kanban Board */}
      <div className="flex flex-1 gap-2 overflow-x-auto pb-2">
        {columns.map((column) => {
          const columnTasks = groupedTasks[column.status] || []
          return (
            <div key={column.status} className="flex min-w-[260px] flex-col gap-2">
              <div className="flex items-center justify-between rounded-md bg-muted/50 px-2 py-1">
                <div className="flex items-center gap-1">
                  <div className={`text-[10px] font-semibold ${column.color}`}>{column.label}</div>
                  <Badge variant="secondary" className="h-4 px-1 text-[9px]">
                    {columnTasks.length}
                  </Badge>
                </div>
              </div>

              <div className="flex-1 space-y-2 overflow-y-auto">
                {columnTasks.map((task) => (
                  <Card key={task.id} className="group relative flex flex-col gap-1.5 p-2 transition-all hover:shadow-md">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <h3 className="text-xs font-semibold leading-tight">{task.title}</h3>
                        <p className="mt-0.5 line-clamp-2 text-[10px] text-muted-foreground">{task.description}</p>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-5 w-5 p-0 opacity-0 group-hover:opacity-100">
                            <MoreVertical className="h-3 w-3" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem className="text-xs">Voir détails</DropdownMenuItem>
                          <DropdownMenuItem className="text-xs">Modifier</DropdownMenuItem>
                          <DropdownMenuItem className="text-xs">Changer statut</DropdownMenuItem>
                          <DropdownMenuItem className="text-xs text-destructive">Supprimer</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>

                    <div className="flex flex-wrap gap-1">
                      <Badge variant="secondary" className={`h-4 px-1.5 text-[9px] ${priorityColors[task.priority]}`}>
                        {task.priority}
                      </Badge>
                      {task.tags.slice(0, 2).map((tag) => (
                        <Badge key={tag} variant="outline" className="h-4 px-1.5 text-[9px]">
                          {tag}
                        </Badge>
                      ))}
                    </div>

                    <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                      <FolderKanban className="h-3 w-3" />
                      <span className="truncate">{task.project}</span>
                    </div>

                    {task.progress > 0 && (
                      <div className="space-y-0.5">
                        <div className="flex items-center justify-between text-[10px]">
                          <span className="text-muted-foreground">Progression</span>
                          <span className="font-medium">{task.progress}%</span>
                        </div>
                        <Progress value={task.progress} className="h-1" />
                      </div>
                    )}

                    {task.subtasksCount > 0 && (
                      <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                        <CheckCircle2 className="h-3 w-3" />
                        <span>
                          {task.completedSubtasks}/{task.subtasksCount} sous-tâches
                        </span>
                      </div>
                    )}

                    <div className="flex items-center justify-between border-t pt-1.5">
                      <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                        <Calendar className="h-3 w-3" />
                        <span>{new Date(task.dueDate).toLocaleDateString("fr-FR")}</span>
                      </div>
                      <div className="flex -space-x-1">
                        {task.assignees.slice(0, 2).map((assignee, i) => (
                          <Avatar key={i} className="h-5 w-5 border-2 border-background">
                            <AvatarFallback className="text-[8px]">
                              {assignee
                                .split(" ")
                                .map((n) => n[0])
                                .join("")}
                            </AvatarFallback>
                          </Avatar>
                        ))}
                        {task.assignees.length > 2 && (
                          <div className="flex h-5 w-5 items-center justify-center rounded-full border-2 border-background bg-muted text-[8px]">
                            +{task.assignees.length - 2}
                          </div>
                        )}
                      </div>
                    </div>

                    {task.status === "blocked" && (
                      <div className="flex items-center gap-1 rounded-md bg-red-500/10 px-1.5 py-1 text-[10px] text-red-700 dark:text-red-400">
                        <AlertCircle className="h-3 w-3" />
                        <span>Tâche bloquée</span>
                      </div>
                    )}
                  </Card>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
