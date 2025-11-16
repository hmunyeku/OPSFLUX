"use client"

import { useState, useEffect, useMemo } from "react"
import { mockProjects, mockTeamMembers, getProjectMetrics } from "@/lib/project-mock-data"
import type { Project, ProjectStatus, Priority, ProjectViewPreferences } from "@/lib/project-management-types"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  Plus,
  LayoutGrid,
  List,
  Kanban,
  Calendar,
  MoreVertical,
  TrendingUp,
  TrendingDown,
  AlertCircle,
  CheckCircle2,
  Clock,
  DollarSign,
  Users,
  Filter,
  ArrowUpDown,
  Eye,
  Edit,
  Star,
  StarOff,
  Archive,
} from "lucide-react"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useHeaderContext } from "@/components/header-context"
import { ButtonGroup } from "@/components/ui/button-group"
import Link from "next/link"

const statusConfig = {
  draft: { label: "Brouillon", color: "bg-gray-500/10 text-gray-700", icon: Edit },
  planning: { label: "Planification", color: "bg-blue-500/10 text-blue-700", icon: Calendar },
  active: { label: "Actif", color: "bg-green-500/10 text-green-700", icon: TrendingUp },
  "on-hold": { label: "En pause", color: "bg-yellow-500/10 text-yellow-700", icon: Clock },
  completed: { label: "Terminé", color: "bg-purple-500/10 text-purple-700", icon: CheckCircle2 },
  cancelled: { label: "Annulé", color: "bg-red-500/10 text-red-700", icon: AlertCircle },
  archived: { label: "Archivé", color: "bg-gray-500/10 text-gray-600", icon: Archive },
}

const priorityConfig = {
  low: { label: "Basse", color: "bg-gray-500/10 text-gray-700" },
  medium: { label: "Moyenne", color: "bg-blue-500/10 text-blue-700" },
  high: { label: "Haute", color: "bg-orange-500/10 text-orange-700" },
  critical: { label: "Critique", color: "bg-red-500/10 text-red-700" },
}

const healthConfig = {
  good: { label: "Bon", color: "text-green-600", icon: CheckCircle2 },
  "at-risk": { label: "À risque", color: "text-orange-600", icon: AlertCircle },
  critical: { label: "Critique", color: "text-red-600", icon: TrendingDown },
}

export function ProjectsModernView() {
  const [viewMode, setViewMode] = useState<"grid" | "list" | "kanban">("grid")
  const [searchQuery, setSearchQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [priorityFilter, setPriorityFilter] = useState<string>("all")
  const [healthFilter, setHealthFilter] = useState<string>("all")
  const [projects, setProjects] = useState<Project[]>(mockProjects)
  const { setContextualHeader, clearContextualHeader } = useHeaderContext()

  const filteredProjects = useMemo(() => {
    return projects.filter((project) => {
      const matchesSearch =
        project.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        project.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
        project.client.toLowerCase().includes(searchQuery.toLowerCase()) ||
        project.description.toLowerCase().includes(searchQuery.toLowerCase())

      const matchesStatus = statusFilter === "all" || project.status === statusFilter
      const matchesPriority = priorityFilter === "all" || project.priority === priorityFilter
      const matchesHealth = healthFilter === "all" || project.health === healthFilter

      return matchesSearch && matchesStatus && matchesPriority && matchesHealth
    })
  }, [projects, searchQuery, statusFilter, priorityFilter, healthFilter])

  const stats = useMemo(() => {
    return {
      total: projects.length,
      active: projects.filter((p) => p.status === "active").length,
      atRisk: projects.filter((p) => p.health === "at-risk" || p.health === "critical").length,
      completed: projects.filter((p) => p.status === "completed").length,
    }
  }, [projects])

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("fr-FR", {
      style: "currency",
      currency: "EUR",
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(amount)
  }

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" })
  }

  const toggleFavorite = (projectId: string) => {
    setProjects(prev =>
      prev.map(p => p.id === projectId ? { ...p, isFavorite: !p.isFavorite } : p)
    )
  }

  // Configure contextual header
  useEffect(() => {
    setContextualHeader({
      searchPlaceholder: "Rechercher des projets... (code, client, nom)",
      searchValue: searchQuery,
      onSearchChange: (value) => setSearchQuery(value),
      customRender: (
        <ButtonGroup>
          {/* View Toggle */}
          <div className="flex items-center rounded-md border bg-background">
            <Button
              variant={viewMode === "grid" ? "secondary" : "ghost"}
              size="sm"
              className="h-9 rounded-r-none border-r"
              onClick={() => setViewMode("grid")}
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === "list" ? "secondary" : "ghost"}
              size="sm"
              className="h-9 rounded-none border-r"
              onClick={() => setViewMode("list")}
            >
              <List className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === "kanban" ? "secondary" : "ghost"}
              size="sm"
              className="h-9 rounded-l-none"
              onClick={() => setViewMode("kanban")}
            >
              <Kanban className="h-4 w-4" />
            </Button>
          </div>

          {/* Filters */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-9 gap-2 bg-transparent">
                <Filter className="h-4 w-4" />
                Filtres
                {(statusFilter !== "all" || priorityFilter !== "all" || healthFilter !== "all") && (
                  <Badge variant="secondary" className="h-5 px-1 text-xs">
                    {[statusFilter !== "all", priorityFilter !== "all", healthFilter !== "all"].filter(Boolean).length}
                  </Badge>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <div className="p-2">
                <label className="text-xs font-medium text-muted-foreground">Statut</label>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="h-8 mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tous</SelectItem>
                    {Object.entries(statusConfig).map(([value, config]) => (
                      <SelectItem key={value} value={value}>{config.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="p-2">
                <label className="text-xs font-medium text-muted-foreground">Priorité</label>
                <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                  <SelectTrigger className="h-8 mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Toutes</SelectItem>
                    {Object.entries(priorityConfig).map(([value, config]) => (
                      <SelectItem key={value} value={value}>{config.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="p-2">
                <label className="text-xs font-medium text-muted-foreground">Santé</label>
                <Select value={healthFilter} onValueChange={setHealthFilter}>
                  <SelectTrigger className="h-8 mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Toutes</SelectItem>
                    {Object.entries(healthConfig).map(([value, config]) => (
                      <SelectItem key={value} value={value}>{config.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* New Project */}
          <Button size="sm" className="h-9 gap-2">
            <Plus className="h-4 w-4" />
            Nouveau projet
          </Button>

          {/* More Options */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-9 w-9 p-0 bg-transparent">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem>Importer des projets</DropdownMenuItem>
              <DropdownMenuItem>Exporter la liste</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem>Templates de projets</DropdownMenuItem>
              <DropdownMenuItem>Paramètres d'affichage</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </ButtonGroup>
      ),
    })

    return () => clearContextualHeader()
  }, [searchQuery, viewMode, statusFilter, priorityFilter, healthFilter, setContextualHeader, clearContextualHeader])

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Stats Overview */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total projets</p>
                <p className="text-2xl font-bold">{stats.total}</p>
              </div>
              <div className="h-10 w-10 rounded-full bg-blue-500/10 flex items-center justify-center">
                <LayoutGrid className="h-5 w-5 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Actifs</p>
                <p className="text-2xl font-bold text-green-600">{stats.active}</p>
              </div>
              <div className="h-10 w-10 rounded-full bg-green-500/10 flex items-center justify-center">
                <TrendingUp className="h-5 w-5 text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">À risque</p>
                <p className="text-2xl font-bold text-orange-600">{stats.atRisk}</p>
              </div>
              <div className="h-10 w-10 rounded-full bg-orange-500/10 flex items-center justify-center">
                <AlertCircle className="h-5 w-5 text-orange-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Terminés</p>
                <p className="text-2xl font-bold text-purple-600">{stats.completed}</p>
              </div>
              <div className="h-10 w-10 rounded-full bg-purple-500/10 flex items-center justify-center">
                <CheckCircle2 className="h-5 w-5 text-purple-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Projects Grid */}
      {viewMode === "grid" && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredProjects.map((project) => {
            const metrics = getProjectMetrics(project)
            const StatusIcon = statusConfig[project.status].icon
            const HealthIcon = healthConfig[project.health].icon

            return (
              <Card key={project.id} className="group hover:shadow-lg transition-all border-2">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="outline" className="text-xs font-mono">
                          {project.code}
                        </Badge>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={() => toggleFavorite(project.id)}
                        >
                          {project.isFavorite ? (
                            <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                          ) : (
                            <StarOff className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                      <CardTitle className="text-base font-semibold truncate">{project.name}</CardTitle>
                      <CardDescription className="text-xs mt-1 line-clamp-2">{project.description}</CardDescription>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 mt-3 flex-wrap">
                    <Badge className={statusConfig[project.status].color}>
                      <StatusIcon className="h-3 w-3 mr-1" />
                      {statusConfig[project.status].label}
                    </Badge>
                    <Badge className={priorityConfig[project.priority].color}>
                      {priorityConfig[project.priority].label}
                    </Badge>
                    <div className={`flex items-center gap-1 text-xs ${healthConfig[project.health].color}`}>
                      <HealthIcon className="h-3 w-3" />
                      {healthConfig[project.health].label}
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="space-y-3">
                  {/* Progress */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Progression</span>
                      <span className="font-medium">{project.progress}%</span>
                    </div>
                    <Progress value={project.progress} className="h-2" />
                  </div>

                  {/* Metrics Grid */}
                  <div className="grid grid-cols-2 gap-2 pt-2 border-t">
                    <div className="space-y-1">
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <CheckCircle2 className="h-3 w-3" />
                        <span>Tâches</span>
                      </div>
                      <p className="text-sm font-medium">
                        {project.completedTasks}/{project.totalTasks}
                      </p>
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <DollarSign className="h-3 w-3" />
                        <span>Budget</span>
                      </div>
                      <p className="text-sm font-medium">{formatCurrency(project.budget)}</p>
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        <span>Échéance</span>
                      </div>
                      <p className="text-xs font-medium">
                        {metrics.daysOverdue > 0 ? (
                          <span className="text-red-600">+{metrics.daysOverdue}j</span>
                        ) : (
                          <span>{metrics.daysRemaining}j</span>
                        )}
                      </p>
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Users className="h-3 w-3" />
                        <span>Équipe</span>
                      </div>
                      <div className="flex -space-x-2">
                        {project.team.slice(0, 3).map((member, idx) => (
                          <Avatar key={idx} className="h-6 w-6 border-2 border-background">
                            <AvatarImage src={member.avatar} />
                            <AvatarFallback className="text-xs">{member.name.slice(0, 2)}</AvatarFallback>
                          </Avatar>
                        ))}
                        {project.team.length > 3 && (
                          <div className="h-6 w-6 rounded-full bg-muted border-2 border-background flex items-center justify-center">
                            <span className="text-[10px] font-medium">+{project.team.length - 3}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 pt-2 border-t">
                    <Link href={`/projects/${project.id}`} className="flex-1">
                      <Button variant="outline" size="sm" className="w-full h-8">
                        <Eye className="h-3 w-3 mr-1.5" />
                        Voir détails
                      </Button>
                    </Link>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem>Modifier</DropdownMenuItem>
                        <DropdownMenuItem>Dupliquer</DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem>Archiver</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* List View */}
      {viewMode === "list" && (
        <Card>
          <CardContent className="p-0">
            <div className="divide-y">
              {filteredProjects.map((project) => {
                const metrics = getProjectMetrics(project)
                const StatusIcon = statusConfig[project.status].icon
                const HealthIcon = healthConfig[project.health].icon

                return (
                  <div key={project.id} className="p-4 hover:bg-muted/50 transition-colors group">
                    <div className="flex items-start gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 mb-2">
                          <Badge variant="outline" className="text-xs font-mono">
                            {project.code}
                          </Badge>
                          <Link href={`/projects/${project.id}`} className="hover:underline">
                            <h3 className="font-semibold">{project.name}</h3>
                          </Link>
                          {project.isFavorite && <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />}
                        </div>
                        <p className="text-sm text-muted-foreground line-clamp-1 mb-3">{project.description}</p>

                        <div className="flex items-center gap-4 flex-wrap">
                          <Badge className={statusConfig[project.status].color}>
                            <StatusIcon className="h-3 w-3 mr-1" />
                            {statusConfig[project.status].label}
                          </Badge>
                          <Badge className={priorityConfig[project.priority].color}>
                            {priorityConfig[project.priority].label}
                          </Badge>
                          <div className={`flex items-center gap-1 text-xs ${healthConfig[project.health].color}`}>
                            <HealthIcon className="h-3 w-3" />
                            {healthConfig[project.health].label}
                          </div>
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Users className="h-3 w-3" />
                            {project.team.length} membres
                          </div>
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <CheckCircle2 className="h-3 w-3" />
                            {project.completedTasks}/{project.totalTasks} tâches
                          </div>
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <DollarSign className="h-3 w-3" />
                            {formatCurrency(project.budget)}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <p className="text-sm font-medium">{project.progress}%</p>
                          <p className="text-xs text-muted-foreground">Progression</p>
                        </div>
                        <Button variant="outline" size="sm" asChild>
                          <Link href={`/projects/${project.id}`}>
                            <Eye className="h-4 w-4 mr-1.5" />
                            Détails
                          </Link>
                        </Button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Kanban View */}
      {viewMode === "kanban" && (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {Object.entries(statusConfig).map(([status, config]) => {
            const projectsInStatus = filteredProjects.filter((p) => p.status === status)
            const Icon = config.icon

            return (
              <div key={status} className="flex-shrink-0 w-80">
                <div className="bg-muted/50 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Icon className="h-4 w-4" />
                      <h3 className="font-semibold text-sm">{config.label}</h3>
                      <Badge variant="secondary" className="h-5 px-1.5 text-xs">
                        {projectsInStatus.length}
                      </Badge>
                    </div>
                  </div>

                  <div className="space-y-2">
                    {projectsInStatus.map((project) => {
                      const HealthIcon = healthConfig[project.health].icon
                      return (
                        <Card key={project.id} className="p-3 cursor-pointer hover:shadow-md transition-shadow">
                          <Link href={`/projects/${project.id}`}>
                            <div className="space-y-2">
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex-1 min-w-0">
                                  <Badge variant="outline" className="text-[10px] mb-1">
                                    {project.code}
                                  </Badge>
                                  <h4 className="font-medium text-sm line-clamp-2">{project.name}</h4>
                                </div>
                                {project.isFavorite && <Star className="h-3 w-3 fill-yellow-400 text-yellow-400 flex-shrink-0" />}
                              </div>

                              <div className="flex items-center gap-2">
                                <Badge className={priorityConfig[project.priority].color} variant="secondary">
                                  {priorityConfig[project.priority].label}
                                </Badge>
                                <div className={`flex items-center gap-1 text-xs ${healthConfig[project.health].color}`}>
                                  <HealthIcon className="h-3 w-3" />
                                </div>
                              </div>

                            <div className="space-y-1">
                              <div className="flex items-center justify-between text-xs">
                                <span className="text-muted-foreground">Progression</span>
                                <span className="font-medium">{project.progress}%</span>
                              </div>
                              <Progress value={project.progress} className="h-1.5" />
                            </div>

                            <div className="flex items-center justify-between text-xs">
                              <div className="flex -space-x-1.5">
                                {project.team.slice(0, 3).map((member, idx) => (
                                  <Avatar key={idx} className="h-5 w-5 border border-background">
                                    <AvatarFallback className="text-[10px]">{member.name.slice(0, 2)}</AvatarFallback>
                                  </Avatar>
                                ))}
                              </div>
                              <span className="text-muted-foreground">
                                {project.completedTasks}/{project.totalTasks}
                              </span>
                            </div>
                          </div>
                        </Link>
                      </Card>
                    )
                    })}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Empty State */}
      {filteredProjects.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <LayoutGrid className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-semibold mb-1">Aucun projet trouvé</h3>
            <p className="text-sm text-muted-foreground mb-4">Essayez de modifier vos filtres ou créez un nouveau projet</p>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Créer un projet
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
