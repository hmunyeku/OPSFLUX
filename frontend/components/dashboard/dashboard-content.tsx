"use client"

import { cn } from "@/lib/utils"
import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  FolderKanban,
  ListTodo,
  UserCheck,
  FileCheck,
  TrendingUp,
  TrendingDown,
  Minus,
  ArrowRight,
  Plus,
  LayoutGrid,
  Clock,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react"
import {
  Line,
  LineChart,
  Bar,
  BarChart,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  Legend,
} from "recharts"
import { DashboardWidget } from "./dashboard-widget"

const projectsData = [
  { month: "Jan", projets: 18, taches: 145, mocs: 12 },
  { month: "Fév", projets: 20, taches: 168, mocs: 15 },
  { month: "Mar", projets: 24, taches: 192, mocs: 18 },
  { month: "Avr", projets: 22, taches: 178, mocs: 14 },
  { month: "Mai", projets: 26, taches: 210, mocs: 20 },
  { month: "Jun", projets: 24, taches: 198, mocs: 17 },
]

const tasksData = [
  { status: "À faire", count: 45, color: "#94a3b8" },
  { status: "En cours", count: 68, color: "#3b82f6" },
  { status: "En revue", count: 23, color: "#f59e0b" },
  { status: "Terminé", count: 156, color: "#10b981" },
]

const recentActivity = [
  {
    action: "Nouveau projet créé",
    project: "Modernisation Plateforme A",
    time: "Il y a 2h",
    user: "Jean Dupont",
    type: "project",
    status: "success",
  },
  {
    action: "Tâche complétée",
    project: "Audit 5S - Zone Production",
    time: "Il y a 3h",
    user: "Marie Martin",
    type: "task",
    status: "success",
  },
  {
    action: "Document approuvé",
    project: "Procédure Sécurité Rev.3",
    time: "Il y a 5h",
    user: "Pierre Leroy",
    type: "document",
    status: "success",
  },
  {
    action: "MOC validé",
    project: "MOC-2024-045",
    time: "Il y a 1j",
    user: "Sophie Bernard",
    type: "moc",
    status: "success",
  },
  {
    action: "Demande POB approuvée",
    project: "Séjour Mars 2024",
    time: "Il y a 1j",
    user: "Luc Moreau",
    type: "pob",
    status: "success",
  },
]

const upcomingTasks = [
  { task: "Révision procédure HSE", project: "Sécurité Q1", deadline: "2024-03-25", priority: "high" },
  { task: "Audit 5S Zone B", project: "Qualité", deadline: "2024-03-26", priority: "medium" },
  { task: "Formation équipe", project: "RH", deadline: "2024-03-28", priority: "low" },
  { task: "Inspection équipements", project: "Maintenance", deadline: "2024-03-29", priority: "high" },
]

const quickLinks = [
  { label: "Nouveau Projet", href: "/projects/list", icon: FolderKanban, color: "blue" },
  { label: "Créer Tâche", href: "/projects/tasks", icon: ListTodo, color: "orange" },
  { label: "Demande POB", href: "/pobvue/requests", icon: UserCheck, color: "green" },
  { label: "Nouveau MOC", href: "/mocvue/requests", icon: FileCheck, color: "purple" },
]

export function DashboardContent() {
  const [refreshingWidgets, setRefreshingWidgets] = useState<Record<string, boolean>>({})

  const handleRefresh = (widgetId: string) => {
    setRefreshingWidgets((prev) => ({ ...prev, [widgetId]: true }))
    // Simulate refresh
    setTimeout(() => {
      setRefreshingWidgets((prev) => ({ ...prev, [widgetId]: false }))
    }, 1000)
  }

  const handleExport = (widgetTitle: string, format: string) => {
    console.log(`[v0] Exporting "${widgetTitle}" as ${format}`)
    // In real app, implement actual export logic
  }

  return (
    <div className="flex h-full flex-col gap-3 p-3 sm:gap-4 sm:p-4 md:gap-6 md:p-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight sm:text-2xl md:text-3xl">Bienvenue sur OpsFlux</h1>
          <p className="text-muted-foreground mt-1 text-xs sm:text-sm">
            Vue d'ensemble de vos opérations et indicateurs clés
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" asChild className="h-8 text-xs sm:h-9 sm:text-sm bg-transparent">
            <a href="/gallery">
              <LayoutGrid className="mr-1 h-3 w-3 sm:mr-2 sm:h-4 sm:w-4" />
              <span className="hidden sm:inline">Galerie</span>
              <span className="sm:hidden">Gal.</span>
            </a>
          </Button>
          <Button size="sm" asChild className="h-8 text-xs sm:h-9 sm:text-sm">
            <a href="/new">
              <Plus className="mr-1 h-3 w-3 sm:mr-2 sm:h-4 sm:w-4" />
              <span className="hidden sm:inline">Nouveau Dashboard</span>
              <span className="sm:hidden">Nouveau</span>
            </a>
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-3 sm:gap-4 md:grid-cols-2 lg:grid-cols-4 md:gap-6">
        <DashboardWidget
          title="Projets Actifs"
          onRefresh={() => handleRefresh("kpi-1")}
          onExport={(format) => handleExport("Projets Actifs", format)}
          isRefreshing={refreshingWidgets["kpi-1"]}
          className="border-l-4 border-l-blue-500"
        >
          <div className="flex items-center justify-between">
            <div>
              <div className="text-3xl font-bold">24</div>
              <div className="flex items-center mt-2 text-xs text-muted-foreground">
                <TrendingUp className="mr-1 h-3 w-3 text-green-600" />
                <span className="text-green-600 font-medium">+12%</span>
                <span className="ml-1">vs mois dernier</span>
              </div>
            </div>
            <div className="h-12 w-12 rounded-full bg-blue-100 flex items-center justify-center">
              <FolderKanban className="h-6 w-6 text-blue-600" />
            </div>
          </div>
        </DashboardWidget>

        <DashboardWidget
          title="Tâches en Cours"
          onRefresh={() => handleRefresh("kpi-2")}
          onExport={(format) => handleExport("Tâches en Cours", format)}
          isRefreshing={refreshingWidgets["kpi-2"]}
          className="border-l-4 border-l-orange-500"
        >
          <div className="flex items-center justify-between">
            <div>
              <div className="text-3xl font-bold">156</div>
              <div className="flex items-center mt-2 text-xs text-muted-foreground">
                <TrendingDown className="mr-1 h-3 w-3 text-red-600" />
                <span className="text-red-600 font-medium">-5%</span>
                <span className="ml-1">vs mois dernier</span>
              </div>
            </div>
            <div className="h-12 w-12 rounded-full bg-orange-100 flex items-center justify-center">
              <ListTodo className="h-6 w-6 text-orange-600" />
            </div>
          </div>
        </DashboardWidget>

        <DashboardWidget
          title="Demandes POB"
          onRefresh={() => handleRefresh("kpi-3")}
          onExport={(format) => handleExport("Demandes POB", format)}
          isRefreshing={refreshingWidgets["kpi-3"]}
          className="border-l-4 border-l-green-500"
        >
          <div className="flex items-center justify-between">
            <div>
              <div className="text-3xl font-bold">8</div>
              <div className="flex items-center mt-2 text-xs text-muted-foreground">
                <TrendingUp className="mr-1 h-3 w-3 text-green-600" />
                <span className="text-green-600 font-medium">+3</span>
                <span className="ml-1">nouvelles</span>
              </div>
            </div>
            <div className="h-12 w-12 rounded-full bg-green-100 flex items-center justify-center">
              <UserCheck className="h-6 w-6 text-green-600" />
            </div>
          </div>
        </DashboardWidget>

        <DashboardWidget
          title="MOC en Attente"
          onRefresh={() => handleRefresh("kpi-4")}
          onExport={(format) => handleExport("MOC en Attente", format)}
          isRefreshing={refreshingWidgets["kpi-4"]}
          className="border-l-4 border-l-purple-500"
        >
          <div className="flex items-center justify-between">
            <div>
              <div className="text-3xl font-bold">5</div>
              <div className="flex items-center mt-2 text-xs text-muted-foreground">
                <Minus className="mr-1 h-3 w-3 text-gray-500" />
                <span className="text-gray-500 font-medium">Stable</span>
              </div>
            </div>
            <div className="h-12 w-12 rounded-full bg-purple-100 flex items-center justify-center">
              <FileCheck className="h-6 w-6 text-purple-600" />
            </div>
          </div>
        </DashboardWidget>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 gap-3 sm:gap-4 md:gap-6 lg:grid-cols-2">
        <DashboardWidget
          title="Évolution des Activités"
          onRefresh={() => handleRefresh("chart-1")}
          onExport={(format) => handleExport("Évolution des Activités", format)}
          onPrint={() => console.log("[v0] Printing chart")}
          isRefreshing={refreshingWidgets["chart-1"]}
        >
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={projectsData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="month" className="text-xs" />
              <YAxis className="text-xs" />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--background))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "6px",
                }}
              />
              <Legend />
              <Line type="monotone" dataKey="projets" stroke="#3b82f6" strokeWidth={2} name="Projets" />
              <Line type="monotone" dataKey="taches" stroke="#f59e0b" strokeWidth={2} name="Tâches" />
              <Line type="monotone" dataKey="mocs" stroke="#8b5cf6" strokeWidth={2} name="MOCs" />
            </LineChart>
          </ResponsiveContainer>
        </DashboardWidget>

        <DashboardWidget
          title="Répartition des Tâches"
          onRefresh={() => handleRefresh("chart-2")}
          onExport={(format) => handleExport("Répartition des Tâches", format)}
          onPrint={() => console.log("[v0] Printing chart")}
          isRefreshing={refreshingWidgets["chart-2"]}
        >
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={tasksData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="status" className="text-xs" />
              <YAxis className="text-xs" />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--background))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "6px",
                }}
              />
              <Bar dataKey="count" fill="#3b82f6" name="Nombre de tâches" />
            </BarChart>
          </ResponsiveContainer>
        </DashboardWidget>
      </div>

      {/* Activity and Tasks */}
      <div className="grid grid-cols-1 gap-3 sm:gap-4 md:gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <DashboardWidget
            title="Activité Récente"
            onRefresh={() => handleRefresh("activity")}
            onExport={(format) => handleExport("Activité Récente", format)}
            isRefreshing={refreshingWidgets["activity"]}
          >
            <div className="space-y-3">
              {recentActivity.map((activity, index) => (
                <div
                  key={index}
                  className="flex items-start gap-3 rounded-lg border p-3 hover:bg-muted/50 transition-colors"
                >
                  <div className="mt-0.5">
                    {activity.status === "success" && <CheckCircle2 className="h-4 w-4 text-green-600" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium">{activity.action}</span>
                      <Badge variant="outline" className="text-xs">
                        {activity.project}
                      </Badge>
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                      <span className="font-medium">{activity.user}</span>
                      <span>•</span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {activity.time}
                      </span>
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0 shrink-0">
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </DashboardWidget>
        </div>

        <DashboardWidget
          title="Tâches à Venir"
          onRefresh={() => handleRefresh("upcoming")}
          onExport={(format) => handleExport("Tâches à Venir", format)}
          isRefreshing={refreshingWidgets["upcoming"]}
        >
          <div className="space-y-3">
            {upcomingTasks.map((task, index) => (
              <div key={index} className="rounded-lg border p-3 hover:bg-muted/50 transition-colors">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{task.task}</div>
                    <div className="text-xs text-muted-foreground mt-1">{task.project}</div>
                  </div>
                  {task.priority === "high" && <AlertTriangle className="h-4 w-4 text-red-600 shrink-0" />}
                </div>
                <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  {task.deadline}
                </div>
              </div>
            ))}
          </div>
        </DashboardWidget>
      </div>

      {/* Quick Links */}
      <DashboardWidget title="Actions Rapides">
        <div className="grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-4">
          {quickLinks.map((link, index) => (
            <Button
              key={index}
              variant="outline"
              className="h-auto flex-col gap-2 p-4 hover:bg-primary/5 hover:border-primary/50 bg-transparent"
              asChild
            >
              <a href={link.href}>
                <div
                  className={cn(
                    "h-10 w-10 rounded-full flex items-center justify-center",
                    link.color === "blue" && "bg-blue-100",
                    link.color === "orange" && "bg-orange-100",
                    link.color === "green" && "bg-green-100",
                    link.color === "purple" && "bg-purple-100",
                  )}
                >
                  <link.icon
                    className={cn(
                      "h-5 w-5",
                      link.color === "blue" && "text-blue-600",
                      link.color === "orange" && "text-orange-600",
                      link.color === "green" && "text-green-600",
                      link.color === "purple" && "text-purple-600",
                    )}
                  />
                </div>
                <span className="text-sm font-medium">{link.label}</span>
              </a>
            </Button>
          ))}
        </div>
      </DashboardWidget>
    </div>
  )
}
