"use client"

import { useState } from "react"
import { mockProjects } from "@/lib/projects-data"
import { Card } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { BarChart3, TrendingUp, DollarSign, Calendar, CheckCircle2, AlertTriangle, Target } from "lucide-react"

export function TrackingContent() {
  const [selectedProject, setSelectedProject] = useState("all")

  const projects = selectedProject === "all" ? mockProjects : mockProjects.filter((p) => p.id === selectedProject)

  const totalBudget = projects.reduce((sum, p) => sum + p.budget, 0)
  const totalSpent = projects.reduce((sum, p) => sum + p.spent, 0)
  const totalTasks = projects.reduce((sum, p) => sum + p.tasksCount, 0)
  const completedTasks = projects.reduce((sum, p) => sum + p.completedTasks, 0)
  const avgProgress = projects.reduce((sum, p) => sum + p.progress, 0) / projects.length

  const formatCurrency = (amount: number) => {
    // Manual formatting to avoid hydration mismatch with Intl.NumberFormat
    if (amount >= 1000000) {
      return `${(amount / 1000000).toFixed(1).replace(".", ",")} M €`
    } else if (amount >= 1000) {
      return `${(amount / 1000).toFixed(0)} k €`
    }
    return `${amount.toFixed(0)} €`
  }

  return (
    <div className="flex h-full flex-col gap-2 p-2">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Suivi des Projets</h2>
        <Select value={selectedProject} onValueChange={setSelectedProject}>
          <SelectTrigger className="h-8 w-[200px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les projets</SelectItem>
            {mockProjects.map((project) => (
              <SelectItem key={project.id} value={project.id}>
                {project.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-4">
        <Card className="p-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-md bg-blue-500/10">
                <BarChart3 className="h-4 w-4 text-blue-600" />
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground">Progression Moyenne</p>
                <p className="text-lg font-bold">{avgProgress.toFixed(0)}%</p>
              </div>
            </div>
            <TrendingUp className="h-4 w-4 text-green-600" />
          </div>
          <Progress value={avgProgress} className="mt-2 h-1" />
        </Card>

        <Card className="p-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-md bg-green-500/10">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground">Tâches Complétées</p>
                <p className="text-lg font-bold">
                  {completedTasks}/{totalTasks}
                </p>
              </div>
            </div>
            <div className="text-xs font-medium text-green-600">
              {((completedTasks / totalTasks) * 100).toFixed(0)}%
            </div>
          </div>
          <Progress value={(completedTasks / totalTasks) * 100} className="mt-2 h-1" />
        </Card>

        <Card className="p-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-md bg-purple-500/10">
                <DollarSign className="h-4 w-4 text-purple-600" />
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground">Budget Total</p>
                <p className="text-lg font-bold">{formatCurrency(totalBudget)}</p>
              </div>
            </div>
          </div>
          <div className="mt-2 flex items-center justify-between text-[10px]">
            <span className="text-muted-foreground">Dépensé: {formatCurrency(totalSpent)}</span>
            <span className="font-medium">{((totalSpent / totalBudget) * 100).toFixed(0)}%</span>
          </div>
        </Card>

        <Card className="p-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-md bg-orange-500/10">
                <AlertTriangle className="h-4 w-4 text-orange-600" />
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground">Projets Actifs</p>
                <p className="text-lg font-bold">{projects.filter((p) => p.status === "in-progress").length}</p>
              </div>
            </div>
          </div>
          <div className="mt-2 text-[10px] text-muted-foreground">
            {projects.filter((p) => p.status === "on-hold").length} en pause
          </div>
        </Card>
      </div>

      {/* Projects List */}
      <div className="flex-1 overflow-auto">
        <div className="space-y-2">
          {projects.map((project) => (
            <Card key={project.id} className="p-2">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-xs font-semibold">{project.name}</h3>
                    <Badge
                      variant="secondary"
                      className={`h-4 px-1.5 text-[9px] ${
                        project.status === "in-progress"
                          ? "bg-green-500/10 text-green-700"
                          : project.status === "planning"
                            ? "bg-blue-500/10 text-blue-700"
                            : project.status === "on-hold"
                              ? "bg-yellow-500/10 text-yellow-700"
                              : "bg-gray-500/10 text-gray-700"
                      }`}
                    >
                      {project.status}
                    </Badge>
                    <Badge
                      variant="secondary"
                      className={`h-4 px-1.5 text-[9px] ${
                        project.priority === "critical"
                          ? "bg-red-500/10 text-red-700"
                          : project.priority === "high"
                            ? "bg-orange-500/10 text-orange-700"
                            : "bg-blue-500/10 text-blue-700"
                      }`}
                    >
                      {project.priority}
                    </Badge>
                  </div>
                  <p className="mt-0.5 text-[10px] text-muted-foreground">{project.client}</p>
                </div>

                <div className="grid grid-cols-4 gap-4 text-[10px]">
                  <div>
                    <p className="text-muted-foreground">Progression</p>
                    <div className="mt-1 flex items-center gap-2">
                      <Progress value={project.progress} className="h-1.5 w-20" />
                      <span className="font-medium">{project.progress}%</span>
                    </div>
                  </div>

                  <div>
                    <p className="text-muted-foreground">Tâches</p>
                    <div className="mt-1 flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3 text-green-600" />
                      <span className="font-medium">
                        {project.completedTasks}/{project.tasksCount}
                      </span>
                    </div>
                  </div>

                  <div>
                    <p className="text-muted-foreground">Budget</p>
                    <div className="mt-1">
                      <div className="font-medium">{formatCurrency(project.budget)}</div>
                      <div className="flex items-center gap-1 text-muted-foreground">
                        <span>{formatCurrency(project.spent)}</span>
                        <span>({((project.spent / project.budget) * 100).toFixed(0)}%)</span>
                      </div>
                    </div>
                  </div>

                  <div>
                    <p className="text-muted-foreground">Échéance</p>
                    <div className="mt-1 flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      <span className="font-medium">{new Date(project.endDate).toLocaleDateString("fr-FR")}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-2 grid grid-cols-2 gap-2 border-t pt-2">
                <div className="flex items-center gap-2 text-[10px]">
                  <Target className="h-3 w-3 text-muted-foreground" />
                  <span className="text-muted-foreground">Jalons:</span>
                  <span className="font-medium">
                    {project.completedMilestones}/{project.milestones}
                  </span>
                  <Progress value={(project.completedMilestones / project.milestones) * 100} className="h-1 w-16" />
                </div>

                <div className="flex items-center gap-2 text-[10px]">
                  <span className="text-muted-foreground">Équipe:</span>
                  <span className="font-medium">{(project.team || []).length} membres</span>
                  <span className="text-muted-foreground">• Manager: {project.manager}</span>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  )
}
