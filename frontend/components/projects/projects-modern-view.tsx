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
  CalendarDays,
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
  Building2,
  Target,
  ChevronUp,
  ChevronDown,
  X,
} from "lucide-react"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card"
import { Separator } from "@/components/ui/separator"
import { useHeaderContext } from "@/components/header-context"
import { ButtonGroup } from "@/components/ui/button-group"
import { ProjectsKanban } from "./projects-kanban"
import { CreateProjectDrawer } from "./create-project-drawer"
import Link from "next/link"

const statusConfig: Record<string, { label: string; color: string; icon: typeof Edit }> = {
  draft: { label: "Brouillon", color: "bg-gray-500/10 text-gray-700", icon: Edit },
  planning: { label: "Planification", color: "bg-blue-500/10 text-blue-700", icon: Calendar },
  active: { label: "Actif", color: "bg-green-500/10 text-green-700", icon: TrendingUp },
  "on-hold": { label: "En pause", color: "bg-yellow-500/10 text-yellow-700", icon: Clock },
  "on_hold": { label: "En pause", color: "bg-yellow-500/10 text-yellow-700", icon: Clock },
  completed: { label: "Terminé", color: "bg-purple-500/10 text-purple-700", icon: CheckCircle2 },
  cancelled: { label: "Annulé", color: "bg-red-500/10 text-red-700", icon: AlertCircle },
  archived: { label: "Archivé", color: "bg-gray-500/10 text-gray-600", icon: Archive },
}

const defaultStatusConfig = { label: "Inconnu", color: "bg-gray-500/10 text-gray-500", icon: AlertCircle }

const priorityConfig = {
  low: { label: "Basse", color: "bg-gray-500/10 text-gray-700" },
  medium: { label: "Moyenne", color: "bg-blue-500/10 text-blue-700" },
  high: { label: "Haute", color: "bg-orange-500/10 text-orange-700" },
  critical: { label: "Critique", color: "bg-red-500/10 text-red-700" },
}

const healthConfig: Record<string, { label: string; color: string; icon: typeof CheckCircle2 }> = {
  good: { label: "Bon", color: "text-green-600", icon: CheckCircle2 },
  "at-risk": { label: "À risque", color: "text-orange-600", icon: AlertCircle },
  "at_risk": { label: "À risque", color: "text-orange-600", icon: AlertCircle },
  critical: { label: "Critique", color: "text-red-600", icon: TrendingDown },
}

const defaultHealthConfig = { label: "Inconnu", color: "text-gray-500", icon: AlertCircle }

type QuickFilter = "all" | "active" | "at-risk" | "completed"

export function ProjectsModernView() {
  const [viewMode, setViewMode] = useState<"grid" | "list" | "kanban">("grid")
  const [searchQuery, setSearchQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [priorityFilter, setPriorityFilter] = useState<string>("all")
  const [healthFilter, setHealthFilter] = useState<string>("all")
  const [projects, setProjects] = useState<Project[]>(mockProjects)
  const [showStats, setShowStats] = useState(true)
  const [quickFilter, setQuickFilter] = useState<QuickFilter>("all")
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

      // Quick filter from stats cards
      let matchesQuickFilter = true
      if (quickFilter === "active") {
        matchesQuickFilter = project.status === "active"
      } else if (quickFilter === "at-risk") {
        matchesQuickFilter = project.health === "at-risk" || project.health === "critical"
      } else if (quickFilter === "completed") {
        matchesQuickFilter = project.status === "completed"
      }

      return matchesSearch && matchesStatus && matchesPriority && matchesHealth && matchesQuickFilter
    })
  }, [projects, searchQuery, statusFilter, priorityFilter, healthFilter, quickFilter])

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

  const formatDateObj = (date: Date) => {
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
      {/* Stats Overview - Compact & Collapsible */}
      <div className="space-y-2">
        {/* Header with toggle */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {quickFilter !== "all" && (
              <Badge variant="secondary" className="gap-1 text-xs">
                {quickFilter === "active" && "En cours"}
                {quickFilter === "at-risk" && "A risque"}
                {quickFilter === "completed" && "Termines"}
                <button type="button" title="Effacer le filtre" onClick={() => setQuickFilter("all")} className="ml-1 hover:bg-muted rounded-full">
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            )}
            <span className="text-xs text-muted-foreground">
              {filteredProjects.length} projet{filteredProjects.length > 1 ? "s" : ""}
            </span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs text-muted-foreground"
            onClick={() => setShowStats(!showStats)}
          >
            {showStats ? <ChevronUp className="h-3 w-3 mr-1" /> : <ChevronDown className="h-3 w-3 mr-1" />}
            Stats
          </Button>
        </div>

        {/* Stats cards - compact inline */}
        {showStats && (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setQuickFilter(quickFilter === "all" ? "all" : "all")}
              className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-md border text-sm transition-all ${
                quickFilter === "all" ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-muted"
              }`}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
              <span className="font-semibold">{stats.total}</span>
              <span className="text-xs opacity-70">Total</span>
            </button>

            <button
              type="button"
              onClick={() => setQuickFilter(quickFilter === "active" ? "all" : "active")}
              className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-md border text-sm transition-all ${
                quickFilter === "active" ? "bg-green-600 text-white border-green-600" : "bg-background hover:bg-green-50 dark:hover:bg-green-950"
              }`}
            >
              <TrendingUp className={`h-3.5 w-3.5 ${quickFilter === "active" ? "" : "text-green-600"}`} />
              <span className={`font-semibold ${quickFilter === "active" ? "" : "text-green-600"}`}>{stats.active}</span>
              <span className="text-xs opacity-70">En cours</span>
            </button>

            <button
              type="button"
              onClick={() => setQuickFilter(quickFilter === "at-risk" ? "all" : "at-risk")}
              className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-md border text-sm transition-all ${
                quickFilter === "at-risk" ? "bg-orange-600 text-white border-orange-600" : "bg-background hover:bg-orange-50 dark:hover:bg-orange-950"
              }`}
            >
              <AlertCircle className={`h-3.5 w-3.5 ${quickFilter === "at-risk" ? "" : "text-orange-600"}`} />
              <span className={`font-semibold ${quickFilter === "at-risk" ? "" : "text-orange-600"}`}>{stats.atRisk}</span>
              <span className="text-xs opacity-70">A risque</span>
            </button>

            <button
              type="button"
              onClick={() => setQuickFilter(quickFilter === "completed" ? "all" : "completed")}
              className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-md border text-sm transition-all ${
                quickFilter === "completed" ? "bg-purple-600 text-white border-purple-600" : "bg-background hover:bg-purple-50 dark:hover:bg-purple-950"
              }`}
            >
              <CheckCircle2 className={`h-3.5 w-3.5 ${quickFilter === "completed" ? "" : "text-purple-600"}`} />
              <span className={`font-semibold ${quickFilter === "completed" ? "" : "text-purple-600"}`}>{stats.completed}</span>
              <span className="text-xs opacity-70">Termines</span>
            </button>
          </div>
        )}
      </div>

      {/* Projects Grid */}
      {viewMode === "grid" && (
        <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 items-start">
          {filteredProjects.map((project) => {
            const metrics = getProjectMetrics(project)
            const statusCfg = statusConfig[project.status] || defaultStatusConfig
            const healthCfg = healthConfig[project.health] || defaultHealthConfig
            const priorityCfg = priorityConfig[project.priority] || { label: "N/A", color: "bg-gray-500/10 text-gray-500" }
            const StatusIcon = statusCfg.icon
            const HealthIcon = healthCfg.icon

            return (
              <HoverCard key={project.id} openDelay={300} closeDelay={100}>
                <HoverCardTrigger asChild>
                  <Link href={`/projects/${project.id}`}>
                    <Card className="group hover:shadow-sm hover:border-primary/30 transition-all cursor-pointer !py-0 !gap-0">
                      <CardContent className="p-2.5 space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <Badge variant="outline" className="text-[9px] font-mono h-5 px-1.5 shrink-0">
                            {project.code}
                          </Badge>
                          <div className="flex items-center gap-1">
                            {project.isFavorite && <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />}
                            <Badge className={`${statusCfg.color} text-[9px] h-5 px-1.5`}>
                              {statusCfg.label}
                            </Badge>
                          </div>
                        </div>

                        <div>
                          <h3 className="text-sm font-medium leading-tight line-clamp-1">{project.name}</h3>
                          <p className="text-[11px] text-muted-foreground mt-0.5">{project.client}</p>
                        </div>

                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-[10px]">
                            <span className="text-muted-foreground">Progression</span>
                            <span className="font-medium">{project.progress}%</span>
                          </div>
                          <Progress value={project.progress} className="h-1" />
                        </div>

                        <div className="flex items-center justify-between pt-1 border-t text-[10px] text-muted-foreground">
                          <div className="flex items-center gap-3">
                            <span className="flex items-center gap-1">
                              <CheckCircle2 className="h-3 w-3" />
                              {project.completedTasks}/{project.totalTasks}
                            </span>
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {metrics.daysOverdue > 0 ? (
                                <span className="text-red-600">+{metrics.daysOverdue}j</span>
                              ) : (
                                <span>{metrics.daysRemaining}j</span>
                              )}
                            </span>
                          </div>
                          <div className="flex -space-x-1.5">
                            {(project.team || []).slice(0, 3).map((member, idx) => (
                              <Avatar key={idx} className="h-5 w-5 border border-background">
                                <AvatarImage src={member.avatar} />
                                <AvatarFallback className="text-[8px]">{member.name?.slice(0, 2) || "?"}</AvatarFallback>
                              </Avatar>
                            ))}
                            {(project.team?.length || 0) > 3 && (
                              <div className="h-5 w-5 rounded-full bg-muted border border-background flex items-center justify-center">
                                <span className="text-[8px]">+{(project.team?.length || 0) - 3}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                </HoverCardTrigger>
                <HoverCardContent className="w-96 p-0" side="right" align="start">
                  <div className="p-4 space-y-4">
                    {/* Header */}
                    <div className="space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <Badge variant="outline" className="text-xs font-mono">
                              {project.code}
                            </Badge>
                            {project.isFavorite && <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />}
                          </div>
                          <h4 className="font-semibold text-base leading-tight">{project.name}</h4>
                        </div>
                      </div>
                      <p className="text-sm text-muted-foreground leading-relaxed">{project.description}</p>
                    </div>

                    <Separator />

                    {/* Status & Priority */}
                    <div className="grid grid-cols-3 gap-3">
                      <div className="space-y-1">
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Statut</p>
                        <Badge className={`${statusCfg.color} text-xs`}>
                          <StatusIcon className="h-3 w-3 mr-1" />
                          {statusCfg.label}
                        </Badge>
                      </div>
                      <div className="space-y-1">
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Priorite</p>
                        <Badge className={`${priorityCfg.color} text-xs`}>
                          {priorityCfg.label}
                        </Badge>
                      </div>
                      <div className="space-y-1">
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Sante</p>
                        <div className={`flex items-center gap-1 text-xs font-medium ${healthCfg.color}`}>
                          <HealthIcon className="h-3.5 w-3.5" />
                          {healthCfg.label}
                        </div>
                      </div>
                    </div>

                    <Separator />

                    {/* Client & Dates */}
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div className="space-y-1">
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium flex items-center gap-1">
                          <Building2 className="h-3 w-3" />
                          Client
                        </p>
                        <p className="font-medium">{project.client}</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium flex items-center gap-1">
                          <CalendarDays className="h-3 w-3" />
                          Periode
                        </p>
                        <p className="font-medium text-xs">
                          {formatDateObj(project.startDate)} - {formatDateObj(project.endDate)}
                        </p>
                      </div>
                    </div>

                    <Separator />

                    {/* Progress & Budget */}
                    <div className="space-y-3">
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground flex items-center gap-1">
                            <Target className="h-3 w-3" />
                            Progression
                          </span>
                          <span className="font-semibold">{project.progress}%</span>
                        </div>
                        <Progress value={project.progress} className="h-2" />
                      </div>

                      <div className="grid grid-cols-3 gap-3 text-xs">
                        <div className="bg-muted/50 rounded-md p-2 text-center">
                          <p className="text-muted-foreground">Taches</p>
                          <p className="font-semibold text-sm">{project.completedTasks}/{project.totalTasks}</p>
                        </div>
                        <div className="bg-muted/50 rounded-md p-2 text-center">
                          <p className="text-muted-foreground">Jours</p>
                          <p className={`font-semibold text-sm ${metrics.daysOverdue > 0 ? 'text-red-600' : ''}`}>
                            {metrics.daysOverdue > 0 ? `+${metrics.daysOverdue}` : metrics.daysRemaining}
                          </p>
                        </div>
                        <div className="bg-muted/50 rounded-md p-2 text-center">
                          <p className="text-muted-foreground">Budget</p>
                          <p className="font-semibold text-sm">{metrics.budgetUsedPercent}%</p>
                        </div>
                      </div>
                    </div>

                    <Separator />

                    {/* Budget Details */}
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div className="space-y-1">
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium flex items-center gap-1">
                          <DollarSign className="h-3 w-3" />
                          Budget total
                        </p>
                        <p className="font-semibold text-green-600">{formatCurrency(project.budget)}</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Depense</p>
                        <p className="font-semibold text-orange-600">{formatCurrency(project.spent || 0)}</p>
                      </div>
                    </div>

                    {/* Team */}
                    {(project.team?.length || 0) > 0 && (
                      <>
                        <Separator />
                        <div className="space-y-2">
                          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium flex items-center gap-1">
                            <Users className="h-3 w-3" />
                            Equipe ({project.team?.length || 0} membres)
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {(project.team || []).map((member, idx) => (
                              <div key={idx} className="flex items-center gap-2 bg-muted/50 rounded-full pl-1 pr-3 py-1">
                                <Avatar className="h-6 w-6">
                                  <AvatarImage src={member.avatar} />
                                  <AvatarFallback className="text-[10px]">{member.name?.slice(0, 2) || "?"}</AvatarFallback>
                                </Avatar>
                                <div className="min-w-0">
                                  <p className="text-xs font-medium truncate">{member.name}</p>
                                  {member.role && <p className="text-[10px] text-muted-foreground truncate">{member.role}</p>}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </>
                    )}

                    {/* Tags */}
                    {(project.tags?.length || 0) > 0 && (
                      <>
                        <Separator />
                        <div className="flex flex-wrap gap-1">
                          {project.tags?.map((tag, idx) => (
                            <Badge key={idx} variant="secondary" className="text-[10px]">
                              {tag}
                            </Badge>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                </HoverCardContent>
              </HoverCard>
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
                const statusCfg = statusConfig[project.status] || defaultStatusConfig
                const healthCfg = healthConfig[project.health] || defaultHealthConfig
                const priorityCfg = priorityConfig[project.priority] || { label: "N/A", color: "bg-gray-500/10 text-gray-500" }
                const StatusIcon = statusCfg.icon
                const HealthIcon = healthCfg.icon

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
                          <Badge className={statusCfg.color}>
                            <StatusIcon className="h-3 w-3 mr-1" />
                            {statusCfg.label}
                          </Badge>
                          <Badge className={priorityCfg.color}>
                            {priorityCfg.label}
                          </Badge>
                          <div className={`flex items-center gap-1 text-xs ${healthCfg.color}`}>
                            <HealthIcon className="h-3 w-3" />
                            {healthCfg.label}
                          </div>
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Users className="h-3 w-3" />
                            {project.team?.length || 0} membres
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
        <ProjectsKanban
          projects={filteredProjects as any}
          onProjectUpdate={(updated) => {
            setProjects(prev => prev.map(p => p.id === updated.id ? updated as any : p))
          }}
        />
      )}

      {/* Empty State */}
      {filteredProjects.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <div className="h-16 w-16 rounded-2xl bg-muted flex items-center justify-center mb-6">
              <LayoutGrid className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold mb-2">Aucun projet trouve</h3>
            <p className="text-sm text-muted-foreground text-center max-w-sm mb-6">
              {searchQuery || statusFilter !== "all" || priorityFilter !== "all" || healthFilter !== "all"
                ? "Aucun projet ne correspond a vos criteres de recherche. Essayez de modifier vos filtres."
                : "Commencez par creer votre premier projet pour suivre vos operations offshore."}
            </p>
            <div className="flex gap-3">
              {(searchQuery || statusFilter !== "all" || priorityFilter !== "all" || healthFilter !== "all") && (
                <Button variant="outline" onClick={() => {
                  setSearchQuery("")
                  setStatusFilter("all")
                  setPriorityFilter("all")
                  setHealthFilter("all")
                }}>
                  Reinitialiser les filtres
                </Button>
              )}
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Nouveau projet
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
