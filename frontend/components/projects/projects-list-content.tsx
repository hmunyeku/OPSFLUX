"use client"

import { useState, useEffect, useMemo } from "react"
import { mockProjects, type Project, type ProjectStatus } from "@/lib/projects-data"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Plus, Grid3x3, List, MoreVertical, Calendar, CheckCircle2, Target, Filter, ArrowUpDown, LayoutGrid, Table as TableIcon } from "lucide-react"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { CreateProjectDrawer } from "./create-project-drawer"
import { useHeaderContext } from "@/components/header-context"
import { ButtonGroup } from "@/components/ui/button-group"

type ViewMode = "grid" | "list"

const statusColors: Record<ProjectStatus, string> = {
  planning: "bg-blue-500/10 text-blue-700 dark:text-blue-400",
  "in-progress": "bg-green-500/10 text-green-700 dark:text-green-400",
  "on-hold": "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400",
  completed: "bg-gray-500/10 text-gray-700 dark:text-gray-400",
  cancelled: "bg-red-500/10 text-red-700 dark:text-red-400",
}

const priorityColors = {
  low: "bg-gray-500/10 text-gray-700 dark:text-gray-400",
  medium: "bg-blue-500/10 text-blue-700 dark:text-blue-400",
  high: "bg-orange-500/10 text-orange-700 dark:text-orange-400",
  critical: "bg-red-500/10 text-red-700 dark:text-red-400",
}

export function ProjectsListContent() {
  const [viewMode, setViewMode] = useState<ViewMode>("grid")
  const [searchQuery, setSearchQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [projects] = useState<Project[]>(mockProjects)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const { setContextualHeader, clearContextualHeader } = useHeaderContext()

  const filteredProjects = useMemo(() => {
    return projects.filter((project) => {
      const matchesSearch =
        project.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        project.client.toLowerCase().includes(searchQuery.toLowerCase()) ||
        project.description.toLowerCase().includes(searchQuery.toLowerCase())

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
          <Button variant="outline" size="sm" className="h-9 w-9 p-0 bg-transparent" onClick={() => setDrawerOpen(true)}>
            <Plus className="h-4 w-4" />
          </Button>

          {/* More Actions Menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-9 w-9 p-0 bg-transparent">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem>Importer des projets</DropdownMenuItem>
              <DropdownMenuItem>Exporter les projets</DropdownMenuItem>
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

  return (
    <div className="flex h-full flex-col">
      {/* Results count */}
      <div className="border-b bg-muted/30 px-3 py-2">
        <span className="text-xs text-muted-foreground">
          <strong>{filteredProjects.length}</strong> projet{filteredProjects.length > 1 ? 's' : ''}
        </span>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-3">
        {viewMode === "grid" ? (
          <div className="grid grid-cols-1 gap-2 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {filteredProjects.map((project) => (
              <Card key={project.id} className="group relative flex flex-col gap-2 p-2 transition-all hover:shadow-md">
                <div className="flex items-start justify-between gap-1.5">
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-xs font-semibold leading-none">{project.name}</h3>
                    <p className="truncate text-[10px] text-muted-foreground mt-0.5">{project.client}</p>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100">
                        <MoreVertical className="h-3.5 w-3.5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem>Voir détails</DropdownMenuItem>
                      <DropdownMenuItem>Modifier</DropdownMenuItem>
                      <DropdownMenuItem>Voir tâches</DropdownMenuItem>
                      <DropdownMenuItem className="text-destructive">Archiver</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                <div className="flex flex-wrap gap-1">
                  <Badge variant="secondary" className={`h-5 px-1.5 text-[9px] ${statusColors[project.status]}`}>
                    {project.status}
                  </Badge>
                  <Badge variant="secondary" className={`h-5 px-1.5 text-[9px] ${priorityColors[project.priority]}`}>
                    {project.priority}
                  </Badge>
                  {project.tags.slice(0, 2).map((tag) => (
                    <Badge key={tag} variant="outline" className="h-5 px-1.5 text-[9px]">
                      {tag}
                    </Badge>
                  ))}
                </div>

                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="text-muted-foreground">Progression</span>
                    <span className="font-medium">{project.progress}%</span>
                  </div>
                  <Progress value={project.progress} className="h-1.5" />
                </div>

                <div className="grid grid-cols-2 gap-1.5 text-[10px]">
                  <div>
                    <div className="flex items-center gap-1 text-muted-foreground mb-0.5">
                      <CheckCircle2 className="h-3 w-3" />
                      <span>Tâches</span>
                    </div>
                    <div className="font-medium">
                      {project.completedTasks}/{project.tasksCount}
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center gap-1 text-muted-foreground mb-0.5">
                      <Target className="h-3 w-3" />
                      <span>Jalons</span>
                    </div>
                    <div className="font-medium">
                      {project.completedMilestones}/{project.milestones}
                    </div>
                  </div>
                </div>

                <div className="space-y-1 border-t pt-1.5 text-[10px]">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Budget</span>
                    <span className="font-medium">{formatCurrency(project.budget)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Dépensé</span>
                    <span className="font-medium">{formatCurrency(project.spent)}</span>
                  </div>
                  <Progress value={(project.spent / project.budget) * 100} className="h-1" />
                </div>

                <div className="mt-auto flex items-center justify-between border-t pt-1.5">
                  <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                    <Calendar className="h-3 w-3" />
                    <span>{new Date(project.endDate).toLocaleDateString("fr-FR")}</span>
                  </div>
                  <div className="flex -space-x-1">
                    {project.team.slice(0, 3).map((member, i) => (
                      <Avatar key={i} className="h-5 w-5 border-2 border-background">
                        <AvatarFallback className="text-[8px]">
                          {member
                            .split(" ")
                            .map((n) => n[0])
                            .join("")}
                        </AvatarFallback>
                      </Avatar>
                    ))}
                    {project.team.length > 3 && (
                      <div className="flex h-5 w-5 items-center justify-center rounded-full border-2 border-background bg-muted text-[8px]">
                        +{project.team.length - 3}
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="h-8 text-[10px] font-semibold">Projet</TableHead>
                  <TableHead className="h-8 text-[10px] font-semibold">Client</TableHead>
                  <TableHead className="h-8 text-[10px] font-semibold">Statut</TableHead>
                  <TableHead className="h-8 text-[10px] font-semibold">Priorité</TableHead>
                  <TableHead className="h-8 text-[10px] font-semibold">Progression</TableHead>
                  <TableHead className="h-8 text-[10px] font-semibold">Tâches</TableHead>
                  <TableHead className="h-8 text-[10px] font-semibold">Budget</TableHead>
                  <TableHead className="h-8 text-[10px] font-semibold">Dépensé</TableHead>
                  <TableHead className="h-8 text-[10px] font-semibold">Échéance</TableHead>
                  <TableHead className="h-8 text-[10px] font-semibold">Équipe</TableHead>
                  <TableHead className="h-8 w-8"></TableHead>
                  </TableRow>
                </TableHeader>
              <TableBody>
                {filteredProjects.map((project) => (
                  <TableRow key={project.id} className="group">
                    <TableCell className="py-2">
                      <div className="flex flex-col gap-0.5">
                        <span className="text-xs font-medium">{project.name}</span>
                        <div className="flex flex-wrap gap-0.5">
                          {project.tags.slice(0, 2).map((tag) => (
                            <Badge key={tag} variant="outline" className="h-4 px-1 text-[9px]">
                              {tag}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="py-2 text-[10px] text-muted-foreground">{project.client}</TableCell>
                    <TableCell className="py-2">
                      <Badge variant="secondary" className={`h-5 px-1.5 text-[9px] ${statusColors[project.status]}`}>
                        {project.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="py-2">
                      <Badge
                        variant="secondary"
                        className={`h-5 px-1.5 text-[9px] ${priorityColors[project.priority]}`}
                      >
                        {project.priority}
                      </Badge>
                    </TableCell>
                    <TableCell className="py-2">
                      <div className="flex items-center gap-2">
                        <Progress value={project.progress} className="h-1.5 w-20" />
                        <span className="text-[10px] font-medium">{project.progress}%</span>
                      </div>
                    </TableCell>
                    <TableCell className="py-2 text-[10px]">
                      <span className="text-muted-foreground">
                        {project.completedTasks}/{project.tasksCount}
                      </span>
                    </TableCell>
                    <TableCell className="py-2 text-[10px] font-medium">{formatCurrency(project.budget)}</TableCell>
                    <TableCell className="py-2 text-[10px]">
                      <span className={project.spent > project.budget * 0.9 ? "text-orange-600" : ""}>
                        {formatCurrency(project.spent)}
                      </span>
                    </TableCell>
                    <TableCell className="py-2 text-[10px] text-muted-foreground">
                      {new Date(project.endDate).toLocaleDateString("fr-FR")}
                    </TableCell>
                    <TableCell className="py-2">
                      <div className="flex -space-x-1">
                        {project.team.slice(0, 3).map((member, i) => (
                          <Avatar key={i} className="h-5 w-5 border-2 border-background">
                            <AvatarFallback className="text-[8px]">
                              {member
                                .split(" ")
                                .map((n) => n[0])
                                .join("")}
                            </AvatarFallback>
                          </Avatar>
                        ))}
                        {project.team.length > 3 && (
                          <div className="flex h-5 w-5 items-center justify-center rounded-full border-2 border-background bg-muted text-[8px]">
                            +{project.team.length - 3}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="py-2">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                            <MoreVertical className="h-3.5 w-3.5" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem>Voir détails</DropdownMenuItem>
                          <DropdownMenuItem>Modifier</DropdownMenuItem>
                          <DropdownMenuItem>Voir tâches</DropdownMenuItem>
                          <DropdownMenuItem className="text-destructive">Archiver</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
      <CreateProjectDrawer open={drawerOpen} onOpenChange={setDrawerOpen} />
    </div>
  )
}
