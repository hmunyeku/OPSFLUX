"use client"

import { useState, useEffect, useMemo } from "react"
import { useRouter } from "next/navigation"
import { mockProjects, type Project, type ProjectStatus } from "@/lib/projects-data"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  Plus,
  MoreHorizontal,
  CheckCircle2,
  Target,
  Filter,
  LayoutGrid,
  Table as TableIcon,
  TrendingUp,
  Minus,
  Star,
  FolderKanban,
  Clock,
  User,
  Wallet,
  CalendarDays,
} from "lucide-react"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { CreateProjectDrawer } from "./create-project-drawer"
import { useHeaderContext } from "@/components/header-context"
import { ButtonGroup } from "@/components/ui/button-group"
import { cn } from "@/lib/utils"

type ViewMode = "grid" | "list"

const statusConfig: Record<ProjectStatus, { label: string; color: string; bgColor: string; dotColor: string }> = {
  draft: {
    label: "Brouillon",
    color: "text-slate-600 dark:text-slate-400",
    bgColor: "bg-slate-50 dark:bg-slate-950/50",
    dotColor: "bg-slate-400",
  },
  planning: {
    label: "Planification",
    color: "text-blue-700 dark:text-blue-400",
    bgColor: "bg-blue-50 dark:bg-blue-950/50",
    dotColor: "bg-blue-500",
  },
  validated: {
    label: "Validé",
    color: "text-indigo-700 dark:text-indigo-400",
    bgColor: "bg-indigo-50 dark:bg-indigo-950/50",
    dotColor: "bg-indigo-500",
  },
  "in-progress": {
    label: "En cours",
    color: "text-emerald-700 dark:text-emerald-400",
    bgColor: "bg-emerald-50 dark:bg-emerald-950/50",
    dotColor: "bg-emerald-500",
  },
  closing: {
    label: "Clôture",
    color: "text-purple-700 dark:text-purple-400",
    bgColor: "bg-purple-50 dark:bg-purple-950/50",
    dotColor: "bg-purple-500",
  },
  "on-hold": {
    label: "En attente",
    color: "text-amber-700 dark:text-amber-400",
    bgColor: "bg-amber-50 dark:bg-amber-950/50",
    dotColor: "bg-amber-500",
  },
  completed: {
    label: "Terminé",
    color: "text-slate-700 dark:text-slate-400",
    bgColor: "bg-slate-50 dark:bg-slate-950/50",
    dotColor: "bg-slate-500",
  },
  cancelled: {
    label: "Annulé",
    color: "text-red-700 dark:text-red-400",
    bgColor: "bg-red-50 dark:bg-red-950/50",
    dotColor: "bg-red-500",
  },
}

const priorityConfig = {
  low: { label: "Basse", color: "text-slate-600", icon: Minus },
  medium: { label: "Moyenne", color: "text-blue-600", icon: Minus },
  high: { label: "Haute", color: "text-orange-600", icon: TrendingUp },
  critical: { label: "Critique", color: "text-red-600", icon: TrendingUp },
}

// Gradient colors for project cards
const projectGradients = [
  "from-blue-500 to-indigo-600",
  "from-emerald-500 to-teal-600",
  "from-orange-500 to-amber-600",
  "from-purple-500 to-violet-600",
  "from-pink-500 to-rose-600",
  "from-cyan-500 to-sky-600",
]

export function ProjectsListContent() {
  const router = useRouter()
  const [viewMode, setViewMode] = useState<ViewMode>("grid")
  const [searchQuery, setSearchQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [projects, setProjects] = useState<Project[]>(mockProjects)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const { setContextualHeader, clearContextualHeader } = useHeaderContext()

  const filteredProjects = useMemo(() => {
    return projects.filter((project) => {
      const query = searchQuery.toLowerCase()
      const matchesSearch =
        project.name.toLowerCase().includes(query) ||
        project.client.toLowerCase().includes(query) ||
        project.code.toLowerCase().includes(query) ||
        project.manager.toLowerCase().includes(query) ||
        (project.description?.toLowerCase().includes(query) ?? false)

      const matchesStatus = statusFilter === "all" || project.status === statusFilter

      return matchesSearch && matchesStatus
    })
  }, [projects, searchQuery, statusFilter])

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("fr-FR", {
      style: "currency",
      currency: "EUR",
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(amount)
  }

  const getProjectGradient = (index: number) => projectGradients[index % projectGradients.length]

  const getDaysRemaining = (endDate: string) => {
    const end = new Date(endDate)
    const today = new Date()
    const diff = Math.ceil((end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
    return diff
  }

  const toggleFavorite = (projectId: string) => {
    setProjects(projects.map(p =>
      p.id === projectId ? { ...p, isFavorite: !p.isFavorite } : p
    ))
  }

  // Configure contextual header
  useEffect(() => {
    setContextualHeader({
      searchPlaceholder: "Rechercher des projets... (Ctrl+K)",
      searchValue: searchQuery,
      onSearchChange: (value) => setSearchQuery(value),
      customRender: (
        <ButtonGroup>
          {/* View Toggle */}
          <div className="flex items-center rounded-md border">
            <Button
              variant={viewMode === "grid" ? "secondary" : "ghost"}
              size="sm"
              className="h-9 rounded-r-none"
              onClick={() => setViewMode("grid")}
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === "list" ? "secondary" : "ghost"}
              size="sm"
              className="h-9 rounded-l-none"
              onClick={() => setViewMode("list")}
            >
              <TableIcon className="h-4 w-4" />
            </Button>
          </div>

          {/* Status Filter */}
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-9 w-[140px] bg-transparent">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous statuts</SelectItem>
              <SelectItem value="planning">Planification</SelectItem>
              <SelectItem value="in-progress">En cours</SelectItem>
              <SelectItem value="on-hold">En attente</SelectItem>
              <SelectItem value="completed">Terminés</SelectItem>
              <SelectItem value="cancelled">Annulés</SelectItem>
            </SelectContent>
          </Select>

          {/* Filters Button */}
          <Button variant="outline" size="sm" className="h-9 bg-transparent">
            <Filter className="h-4 w-4" />
          </Button>

          {/* Add Button */}
          <Button
            size="sm"
            className="h-9 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700"
            onClick={() => setDrawerOpen(true)}
          >
            <Plus className="h-4 w-4 mr-1" />
            Nouveau
          </Button>

          {/* More Actions Menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-9 w-9 p-0 bg-transparent">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem>Importer des projets</DropdownMenuItem>
              <DropdownMenuItem>Exporter les projets</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem>Archiver sélection</DropdownMenuItem>
              <DropdownMenuItem>Paramètres d'affichage</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </ButtonGroup>
      ),
    })

    return () => {
      clearContextualHeader()
    }
  }, [searchQuery, viewMode, statusFilter, setContextualHeader, clearContextualHeader])

  // Project Card Component for Grid View - Compact design
  const ProjectCard = ({ project, index }: { project: Project; index: number }) => {
    const status = statusConfig[project.status]
    const daysRemaining = getDaysRemaining(project.endDate)

    return (
      <Card
        className="group relative overflow-hidden transition-all duration-200 hover:shadow-md hover:border-primary/20 cursor-pointer !py-0 !gap-0"
        onClick={() => router.push(`/projects/${project.id}`)}
      >
        {/* Left color bar */}
        <div className={cn("absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b", getProjectGradient(index))} />

        <div className="pl-4 pr-3 py-3">
          {/* Header row */}
          <div className="flex items-start justify-between gap-2 mb-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 mb-0.5">
                <span className="text-[11px] font-medium text-muted-foreground">{project.code}</span>
                {project.isFavorite && <Star className="h-3 w-3 fill-amber-400 text-amber-400" />}
              </div>
              <h3 className="font-medium text-sm leading-tight group-hover:text-primary transition-colors line-clamp-1">
                {project.name}
              </h3>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                  <MoreHorizontal className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => router.push(`/projects/${project.id}`)}>Voir détails</DropdownMenuItem>
                <DropdownMenuItem>Modifier</DropdownMenuItem>
                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); toggleFavorite(project.id) }}>
                  {project.isFavorite ? "Retirer des favoris" : "Ajouter aux favoris"}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-destructive">Archiver</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Client + Status row */}
          <div className="flex items-center justify-between gap-2 mb-2.5">
            <span className="text-xs text-muted-foreground truncate">{project.client}</span>
            <div className="flex items-center gap-1.5 shrink-0">
              <div className={cn("h-1.5 w-1.5 rounded-full", status.dotColor)} />
              <span className={cn("text-[11px] font-medium", status.color)}>{status.label}</span>
            </div>
          </div>

          {/* Progress bar */}
          <div className="mb-2.5">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] text-muted-foreground">Progression</span>
              <span className="text-[11px] font-semibold">{project.progress}%</span>
            </div>
            <Progress value={project.progress} className="h-1.5" />
          </div>

          {/* Stats row */}
          <div className="flex items-center justify-between text-[11px] mb-2.5">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3 text-muted-foreground" />
                <span>{project.completedTasks}/{project.tasksCount}</span>
              </div>
              <div className="flex items-center gap-1">
                <Target className="h-3 w-3 text-muted-foreground" />
                <span>{project.completedMilestones}/{project.milestones}</span>
              </div>
            </div>
            <span className="font-medium">{formatCurrency(project.budget)}</span>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between pt-2 border-t">
            <div className="flex items-center gap-1">
              <Clock className="h-3 w-3 text-muted-foreground" />
              <span className={cn(
                "text-[11px]",
                daysRemaining < 0 ? "text-red-600 font-medium" :
                daysRemaining <= 7 ? "text-amber-600" :
                "text-muted-foreground"
              )}>
                {daysRemaining < 0 ? `${Math.abs(daysRemaining)}j retard` : `${daysRemaining}j`}
              </span>
            </div>
            <div className="flex -space-x-1.5">
              {(project.team || []).slice(0, 3).map((member, i) => (
                <Avatar key={i} className="h-5 w-5 border border-background" title={`${member.name} - ${member.role}`}>
                  <AvatarFallback className="text-[8px] font-medium">
                    {member.name.split(" ").map((n) => n[0]).join("")}
                  </AvatarFallback>
                </Avatar>
              ))}
              {(project.team || []).length > 3 && (
                <div className="flex h-5 w-5 items-center justify-center rounded-full border border-background bg-muted text-[8px] font-medium">
                  +{(project.team || []).length - 3}
                </div>
              )}
            </div>
          </div>
        </div>
      </Card>
    )
  }

  return (
    <div className="flex h-full flex-col">
      {/* Results count */}
      <div className="border-b bg-muted/30 px-4 py-2.5">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">
            <strong className="text-foreground">{filteredProjects.length}</strong> projet{filteredProjects.length > 1 ? 's' : ''}
            {statusFilter !== "all" && (
              <span className="ml-2">
                • Filtre: <Badge variant="secondary" className="ml-1">{statusConfig[statusFilter as ProjectStatus]?.label}</Badge>
              </span>
            )}
          </span>
          {filteredProjects.length > 0 && (
            <span className="text-xs text-muted-foreground">
              {projects.filter(p => p.status === "in-progress").length} en cours • {projects.filter(p => p.isFavorite).length} favoris
            </span>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-3">
        {viewMode === "grid" ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
            {filteredProjects.map((project, index) => (
              <ProjectCard key={project.id} project={project} index={index} />
            ))}
          </div>
        ) : (
          <div className="rounded-lg border bg-card">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="h-11 font-semibold">Projet</TableHead>
                  <TableHead className="h-11 font-semibold">Statut</TableHead>
                  <TableHead className="h-11 font-semibold">Progression</TableHead>
                  <TableHead className="h-11 font-semibold">
                    <div className="flex items-center gap-1.5">
                      <CheckCircle2 className="h-3.5 w-3.5 text-muted-foreground" />
                      Tâches
                    </div>
                  </TableHead>
                  <TableHead className="h-11 font-semibold">
                    <div className="flex items-center gap-1.5">
                      <Wallet className="h-3.5 w-3.5 text-muted-foreground" />
                      Budget
                    </div>
                  </TableHead>
                  <TableHead className="h-11 font-semibold">
                    <div className="flex items-center gap-1.5">
                      <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />
                      Échéance
                    </div>
                  </TableHead>
                  <TableHead className="h-11 font-semibold">
                    <div className="flex items-center gap-1.5">
                      <User className="h-3.5 w-3.5 text-muted-foreground" />
                      Manager
                    </div>
                  </TableHead>
                  <TableHead className="h-11 font-semibold">Équipe</TableHead>
                  <TableHead className="h-11 w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredProjects.map((project, index) => {
                  const status = statusConfig[project.status]
                  const priority = priorityConfig[project.priority]
                  const daysRemaining = getDaysRemaining(project.endDate)
                  const budgetPercentage = Math.round((project.spent / project.budget) * 100)

                  return (
                    <TableRow
                      key={project.id}
                      className="group cursor-pointer"
                      onClick={() => router.push(`/projects/${project.id}`)}
                    >
                      <TableCell className="py-3">
                        <div className="flex items-start gap-3">
                          {/* Color indicator */}
                          <div className={cn("w-1 h-12 rounded-full bg-gradient-to-b shrink-0", getProjectGradient(index))} />
                          <div className="flex flex-col gap-0.5 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-[11px] font-medium text-muted-foreground">{project.code}</span>
                              {project.isFavorite && <Star className="h-3 w-3 fill-amber-400 text-amber-400" />}
                              <Badge variant="outline" className={cn("h-4 text-[9px] font-medium", priority.color)}>
                                {priority.label}
                              </Badge>
                            </div>
                            <span className="font-medium group-hover:text-primary transition-colors truncate">
                              {project.name}
                            </span>
                            <span className="text-xs text-muted-foreground truncate">{project.client}</span>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="py-3">
                        <Badge variant="secondary" className={cn("font-medium", status.bgColor, status.color)}>
                          <div className={cn("h-1.5 w-1.5 rounded-full mr-1.5", status.dotColor)} />
                          {status.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="py-3">
                        <div className="flex flex-col gap-1.5 min-w-[120px]">
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-muted-foreground">Avancement</span>
                            <span className="font-semibold">{project.progress}%</span>
                          </div>
                          <Progress value={project.progress} className="h-1.5" />
                        </div>
                      </TableCell>
                      <TableCell className="py-3">
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-1.5">
                            <span className="text-sm font-medium">{project.completedTasks}/{project.tasksCount}</span>
                            <span className="text-xs text-muted-foreground">
                              ({Math.round((project.completedTasks / project.tasksCount) * 100)}%)
                            </span>
                          </div>
                          <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                            <Target className="h-3 w-3" />
                            <span>{project.completedMilestones}/{project.milestones} jalons</span>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="py-3">
                        <div className="flex flex-col gap-1 min-w-[100px]">
                          <span className="text-sm font-medium">{formatCurrency(project.budget)}</span>
                          <div className="flex items-center gap-2">
                            <Progress
                              value={budgetPercentage}
                              className={cn(
                                "h-1 w-16",
                                budgetPercentage > 100 && "[&>div]:bg-red-500",
                                budgetPercentage > 80 && budgetPercentage <= 100 && "[&>div]:bg-amber-500"
                              )}
                            />
                            <span className={cn(
                              "text-[11px]",
                              budgetPercentage > 100 ? "text-red-600 font-medium" :
                              budgetPercentage > 80 ? "text-amber-600" :
                              "text-muted-foreground"
                            )}>
                              {budgetPercentage}%
                            </span>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="py-3">
                        <div className="flex flex-col gap-0.5">
                          <span className={cn(
                            "text-sm font-medium",
                            daysRemaining < 0 ? "text-red-600" :
                            daysRemaining <= 7 ? "text-amber-600" :
                            ""
                          )}>
                            {new Date(project.endDate).toLocaleDateString("fr-FR")}
                          </span>
                          <span className={cn(
                            "text-[11px]",
                            daysRemaining < 0 ? "text-red-600 font-medium" :
                            daysRemaining <= 7 ? "text-amber-600" :
                            "text-muted-foreground"
                          )}>
                            {daysRemaining < 0
                              ? `${Math.abs(daysRemaining)}j de retard`
                              : daysRemaining === 0
                                ? "Aujourd'hui"
                                : `${daysRemaining}j restants`}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="py-3">
                        <div className="flex items-center gap-2">
                          <Avatar className="h-6 w-6 border border-border">
                            <AvatarFallback className="text-[9px] font-medium bg-primary/10 text-primary">
                              {project.manager.split(" ").map((n) => n[0]).join("")}
                            </AvatarFallback>
                          </Avatar>
                          <span className="text-sm truncate max-w-[100px]">{project.manager}</span>
                        </div>
                      </TableCell>
                      <TableCell className="py-3">
                        <div className="flex -space-x-1.5">
                          {(project.team || []).slice(0, 3).map((member, i) => (
                            <Avatar key={i} className="h-6 w-6 border-2 border-background" title={`${member.name} - ${member.role}`}>
                              <AvatarFallback className="text-[9px] font-medium">
                                {member.name.split(" ").map((n) => n[0]).join("")}
                              </AvatarFallback>
                            </Avatar>
                          ))}
                          {(project.team || []).length > 3 && (
                            <div className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-background bg-muted text-[9px] font-medium">
                              +{(project.team || []).length - 3}
                            </div>
                          )}
                          {(project.team || []).length === 0 && (
                            <span className="text-xs text-muted-foreground">-</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="py-3">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                            <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => router.push(`/projects/${project.id}`)}>
                              Voir détails
                            </DropdownMenuItem>
                            <DropdownMenuItem>Modifier</DropdownMenuItem>
                            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); toggleFavorite(project.id) }}>
                              {project.isFavorite ? "Retirer des favoris" : "Ajouter aux favoris"}
                            </DropdownMenuItem>
                            <DropdownMenuItem>Voir tâches</DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem className="text-destructive">Archiver</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Empty state */}
        {filteredProjects.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="h-16 w-16 rounded-full bg-muted/50 flex items-center justify-center mb-4">
              <FolderKanban className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold mb-2">Aucun projet trouvé</h3>
            <p className="text-sm text-muted-foreground mb-4 max-w-sm">
              {searchQuery
                ? "Aucun projet ne correspond à votre recherche. Essayez d'autres termes."
                : "Commencez par créer votre premier projet pour organiser vos tâches et suivre votre progression."
              }
            </p>
            <Button onClick={() => setDrawerOpen(true)} className="gap-2">
              <Plus className="h-4 w-4" />
              Créer un projet
            </Button>
          </div>
        )}
      </div>

      <CreateProjectDrawer open={drawerOpen} onOpenChange={setDrawerOpen} />
    </div>
  )
}
