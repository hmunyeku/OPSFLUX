"use client"

import { useState, useMemo } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import type { Project, ProjectStatus, Priority, ProjectHealth } from "@/lib/projects-api"
import { getProjectMetrics } from "@/lib/project-mock-data"
import {
  Plus,
  MoreHorizontal,
  Star,
  CheckCircle2,
  Clock,
  Kanban,
} from "lucide-react"

interface ProjectsKanbanProps {
  projects: Project[]
  onProjectUpdate?: (project: Project) => void
  onProjectDelete?: (projectId: string) => void
}

const statusColumns: { key: ProjectStatus; label: string; color: string }[] = [
  { key: "draft", label: "Brouillon", color: "bg-slate-400" },
  { key: "planning", label: "Planification", color: "bg-blue-500" },
  { key: "active", label: "Actif", color: "bg-emerald-500" },
  { key: "on-hold", label: "En pause", color: "bg-amber-500" },
  { key: "completed", label: "Terminé", color: "bg-violet-500" },
]

const priorityConfig: Record<Priority, { label: string; color: string }> = {
  low: { label: "Basse", color: "text-slate-500" },
  medium: { label: "Moyenne", color: "text-blue-600" },
  high: { label: "Haute", color: "text-orange-600" },
  critical: { label: "Critique", color: "text-red-600" },
}

const healthConfig: Record<ProjectHealth, { color: string }> = {
  good: { color: "bg-emerald-500" },
  "at-risk": { color: "bg-amber-500" },
  critical: { color: "bg-red-500" },
}

export function ProjectsKanban({
  projects,
  onProjectUpdate,
  onProjectDelete,
}: ProjectsKanbanProps) {
  const [draggedProject, setDraggedProject] = useState<Project | null>(null)
  const [dragOverColumn, setDragOverColumn] = useState<ProjectStatus | null>(null)

  const projectsByStatus = useMemo(() => {
    const grouped: Record<ProjectStatus, Project[]> = {
      draft: [],
      planning: [],
      active: [],
      "on-hold": [],
      completed: [],
      cancelled: [],
      archived: [],
    }

    projects.forEach((project) => {
      if (grouped[project.status]) {
        grouped[project.status].push(project)
      }
    })

    return grouped
  }, [projects])

  const columnStats = useMemo(() => {
    const stats: Record<ProjectStatus, { count: number; totalBudget: number; avgProgress: number }> = {
      draft: { count: 0, totalBudget: 0, avgProgress: 0 },
      planning: { count: 0, totalBudget: 0, avgProgress: 0 },
      active: { count: 0, totalBudget: 0, avgProgress: 0 },
      "on-hold": { count: 0, totalBudget: 0, avgProgress: 0 },
      completed: { count: 0, totalBudget: 0, avgProgress: 0 },
      cancelled: { count: 0, totalBudget: 0, avgProgress: 0 },
      archived: { count: 0, totalBudget: 0, avgProgress: 0 },
    }

    Object.entries(projectsByStatus).forEach(([status, statusProjects]) => {
      stats[status as ProjectStatus] = {
        count: statusProjects.length,
        totalBudget: statusProjects.reduce((sum, p) => sum + p.budget, 0),
        avgProgress: statusProjects.length > 0
          ? Math.round(statusProjects.reduce((sum, p) => sum + p.progress, 0) / statusProjects.length)
          : 0,
      }
    })

    return stats
  }, [projectsByStatus])

  const handleDragStart = (e: React.DragEvent, project: Project) => {
    setDraggedProject(project)
    e.dataTransfer.effectAllowed = "move"
    e.dataTransfer.setData("text/plain", project.id)
  }

  const handleDragOver = (e: React.DragEvent, status: ProjectStatus) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = "move"
    setDragOverColumn(status)
  }

  const handleDragLeave = () => {
    setDragOverColumn(null)
  }

  const handleDrop = (e: React.DragEvent, newStatus: ProjectStatus) => {
    e.preventDefault()
    setDragOverColumn(null)

    if (draggedProject && draggedProject.status !== newStatus) {
      const updatedProject = { ...draggedProject, status: newStatus }
      if (onProjectUpdate) {
        onProjectUpdate(updatedProject)
      }
    }

    setDraggedProject(null)
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("fr-FR", {
      style: "currency",
      currency: "EUR",
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(amount)
  }

  return (
    <ScrollArea className="w-full h-full">
      <div className="flex gap-2 p-2 min-w-max h-full">
        {statusColumns.map((column) => {
          const columnProjects = projectsByStatus[column.key] || []
          const stats = columnStats[column.key]

          return (
            <div
              key={column.key}
              className={cn(
                "flex flex-col flex-shrink-0 w-52 rounded-md transition-colors",
                dragOverColumn === column.key && "ring-2 ring-primary/50"
              )}
              onDragOver={(e) => handleDragOver(e, column.key)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, column.key)}
            >
              {/* Column Header */}
              <div className="flex items-center justify-between px-1 py-1 mb-1">
                <div className="flex items-center gap-1">
                  <div className={cn("h-1.5 w-1.5 rounded-full", column.color)} />
                  <span className="font-medium text-[10px] text-muted-foreground">{column.label}</span>
                  <span className="text-[9px] text-muted-foreground/60 ml-0.5">{stats.count}</span>
                </div>
                <Button variant="ghost" size="icon" className="h-4 w-4 opacity-60 hover:opacity-100">
                  <Plus className="h-2.5 w-2.5" />
                </Button>
              </div>

              {/* Column Content */}
              <div className="flex-1 space-y-1 min-h-[30px]">
                {columnProjects.map((project) => (
                  <KanbanCard
                    key={project.id}
                    project={project}
                    onDragStart={handleDragStart}
                    isDragging={draggedProject?.id === project.id}
                    onUpdate={onProjectUpdate}
                    onDelete={onProjectDelete}
                  />
                ))}

                {columnProjects.length === 0 && (
                  <div className="flex items-center justify-center py-2 text-muted-foreground/40">
                    <p className="text-[9px]">Vide</p>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
      <ScrollBar orientation="horizontal" />
    </ScrollArea>
  )
}

// Compact Kanban Card
function KanbanCard({
  project,
  onDragStart,
  isDragging,
  onUpdate,
  onDelete,
}: {
  project: Project
  onDragStart: (e: React.DragEvent, project: Project) => void
  isDragging: boolean
  onUpdate?: (project: Project) => void
  onDelete?: (projectId: string) => void
}) {
  const metrics = getProjectMetrics(project as any)
  const priorityCfg = priorityConfig[project.priority]
  const healthCfg = healthConfig[project.health]

  const toggleFavorite = () => {
    if (onUpdate) {
      onUpdate({ ...project, isFavorite: !project.isFavorite })
    }
  }

  return (
    <Card
      draggable
      onDragStart={(e) => onDragStart(e, project)}
      className={cn(
        "cursor-grab active:cursor-grabbing transition-all hover:shadow-sm group bg-card border-0 shadow-sm !py-0 !gap-0",
        isDragging && "opacity-50 ring-2 ring-primary"
      )}
    >
      <div className="px-2 py-1.5 space-y-1">
        {/* Header - Code + Title */}
        <div className="flex items-start justify-between gap-1">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1 mb-0.5">
              <span className="text-[9px] font-mono text-muted-foreground">{project.code}</span>
              <div className={cn("h-1.5 w-1.5 rounded-full", healthCfg.color)} />
              {project.isFavorite && <Star className="h-2.5 w-2.5 fill-amber-400 text-amber-400" />}
            </div>
            <Link href={`/projects/${project.id}`} className="hover:underline">
              <h4 className="font-medium text-[11px] leading-tight line-clamp-1">{project.name}</h4>
            </Link>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-5 w-5 opacity-0 group-hover:opacity-100 shrink-0">
                <MoreHorizontal className="h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-32">
              <DropdownMenuItem asChild><Link href={`/projects/${project.id}`}>Voir</Link></DropdownMenuItem>
              <DropdownMenuItem onClick={toggleFavorite}>{project.isFavorite ? "- Favori" : "+ Favori"}</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-destructive" onClick={() => onDelete?.(project.id)}>Supprimer</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Client + Priority */}
        <div className="flex items-center justify-between">
          <span className="text-[9px] text-muted-foreground truncate">{project.client}</span>
          <span className={cn("text-[9px] font-medium", priorityCfg.color)}>{priorityCfg.label}</span>
        </div>

        {/* Progress */}
        <div className="flex items-center gap-1.5">
          <Progress value={project.progress} className="h-1 flex-1" />
          <span className="text-[9px] font-semibold w-7 text-right">{project.progress}%</span>
        </div>

        {/* Footer - Tasks + Time + Team */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-[9px] text-muted-foreground">
            <span className="flex items-center gap-0.5">
              <CheckCircle2 className="h-2.5 w-2.5" />
              {project.completedTasks}/{project.totalTasks}
            </span>
            <span className={cn("flex items-center gap-0.5", metrics.daysOverdue > 0 && "text-red-500")}>
              <Clock className="h-2.5 w-2.5" />
              {metrics.daysOverdue > 0 ? `+${metrics.daysOverdue}j` : `${metrics.daysRemaining}j`}
            </span>
          </div>
          <div className="flex -space-x-1">
            {(project.team || []).slice(0, 2).map((member, idx) => (
              <Avatar key={idx} className="h-4 w-4 border border-background">
                <AvatarImage src={member.avatar} />
                <AvatarFallback className="text-[7px]">{member.name?.slice(0, 1) || "?"}</AvatarFallback>
              </Avatar>
            ))}
            {(project.team?.length || 0) > 2 && (
              <div className="h-4 w-4 rounded-full bg-muted border border-background flex items-center justify-center">
                <span className="text-[7px]">+{(project.team?.length || 0) - 2}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </Card>
  )
}
