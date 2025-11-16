"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  LayoutDashboard,
  BarChart3,
  Plus,
  Settings,
  RefreshCw,
  Download,
  Filter,
  Calendar,
  TrendingUp,
  TrendingDown,
  Users,
  FolderKanban,
  Clock,
  AlertCircle,
  CheckCircle2,
  MoreVertical,
  ArrowRight,
  Sparkles,
} from "lucide-react"
import { PermissionGuard } from "@/components/permission-guard"
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  PieChart,
  Pie,
  Cell,
} from "recharts"

// Mock data
const statsData = [
  {
    title: "Projets Actifs",
    value: "24",
    change: "+12%",
    trend: "up" as const,
    icon: FolderKanban,
    color: "blue",
    description: "vs mois dernier",
  },
  {
    title: "Tâches Complétées",
    value: "156",
    change: "+8%",
    trend: "up" as const,
    icon: CheckCircle2,
    color: "green",
    description: "ce mois-ci",
  },
  {
    title: "En Attente",
    value: "23",
    change: "-15%",
    trend: "down" as const,
    icon: Clock,
    color: "orange",
    description: "vs semaine dernière",
  },
  {
    title: "Équipe Active",
    value: "45",
    change: "stable",
    trend: "stable" as const,
    icon: Users,
    color: "purple",
    description: "membres",
  },
]

const activityData = [
  { month: "Jan", projets: 65, taches: 150 },
  { month: "Fév", projets: 75, taches: 180 },
  { month: "Mar", projets: 85, taches: 210 },
  { month: "Avr", projets: 78, taches: 195 },
  { month: "Mai", projets: 90, taches: 220 },
  { month: "Jun", projets: 95, taches: 245 },
]

const performanceData = [
  { name: "Terminé", value: 156, color: "#10b981" },
  { name: "En cours", value: 68, color: "#3b82f6" },
  { name: "En attente", value: 23, color: "#f59e0b" },
  { name: "Bloqué", value: 8, color: "#ef4444" },
]

const recentActivities = [
  {
    id: 1,
    user: "Jean Dupont",
    action: "a créé un nouveau projet",
    project: "Modernisation Platform A",
    time: "Il y a 2h",
    type: "project",
  },
  {
    id: 2,
    user: "Marie Martin",
    action: "a complété la tâche",
    project: "Audit 5S - Zone B",
    time: "Il y a 3h",
    type: "task",
  },
  {
    id: 3,
    user: "Pierre Leroy",
    action: "a commenté",
    project: "Documentation API v2",
    time: "Il y a 4h",
    type: "comment",
  },
  {
    id: 4,
    user: "Sophie Bernard",
    action: "a validé le MOC",
    project: "MOC-2024-045",
    time: "Il y a 5h",
    type: "approval",
  },
]

export function ModernDashboard() {
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [selectedPeriod, setSelectedPeriod] = useState("month")

  const handleRefresh = () => {
    setIsRefreshing(true)
    setTimeout(() => setIsRefreshing(false), 1000)
  }

  return (
    <div className="flex h-full flex-col gap-3 p-3">
      {/* Header avec actions */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-bold leading-none">
            <LayoutDashboard className="h-5 w-5 text-primary" />
            Dashboard Principal
          </h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Vue d'ensemble de vos projets et indicateurs clés de performance
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={handleRefresh} disabled={isRefreshing}>
            <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
            Actualiser
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 text-xs">
                <Filter className="mr-1.5 h-3.5 w-3.5" />
                Filtrer
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuLabel className="text-xs">Période</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-xs" onClick={() => setSelectedPeriod("week")}>Cette semaine</DropdownMenuItem>
              <DropdownMenuItem className="text-xs" onClick={() => setSelectedPeriod("month")}>Ce mois</DropdownMenuItem>
              <DropdownMenuItem className="text-xs" onClick={() => setSelectedPeriod("quarter")}>Ce trimestre</DropdownMenuItem>
              <DropdownMenuItem className="text-xs" onClick={() => setSelectedPeriod("year")}>Cette année</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 text-xs">
                <Download className="mr-1.5 h-3.5 w-3.5" />
                Exporter
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem className="text-xs">Export PDF</DropdownMenuItem>
              <DropdownMenuItem className="text-xs">Export Excel</DropdownMenuItem>
              <DropdownMenuItem className="text-xs">Export CSV</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <PermissionGuard resource="dashboards" action="create">
            <Button size="sm" className="h-8 text-xs">
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              Nouveau Dashboard
            </Button>
          </PermissionGuard>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-4">
        {statsData.map((stat, index) => (
          <Card key={index} className="overflow-hidden transition-all hover:shadow-md">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 px-3 pt-3">
              <CardTitle className="text-xs font-medium">{stat.title}</CardTitle>
              <div
                className={`rounded-full p-1.5 ${
                  stat.color === "blue"
                    ? "bg-blue-100 text-blue-600 dark:bg-blue-900/20"
                    : stat.color === "green"
                      ? "bg-green-100 text-green-600 dark:bg-green-900/20"
                      : stat.color === "orange"
                        ? "bg-orange-100 text-orange-600 dark:bg-orange-900/20"
                        : "bg-purple-100 text-purple-600 dark:bg-purple-900/20"
                }`}
              >
                <stat.icon className="h-3.5 w-3.5" />
              </div>
            </CardHeader>
            <CardContent className="px-3 pb-3">
              <div className="text-base font-bold">{stat.value}</div>
              <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                {stat.trend === "up" && <TrendingUp className="h-3 w-3 text-green-500" />}
                {stat.trend === "down" && <TrendingDown className="h-3 w-3 text-red-500" />}
                <span className={stat.trend === "up" ? "text-green-500" : stat.trend === "down" ? "text-red-500" : ""}>
                  {stat.change}
                </span>
                <span>{stat.description}</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Charts Row */}
      <div className="grid gap-3 md:grid-cols-7">
        <Card className="md:col-span-4">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Évolution des Activités</CardTitle>
            <CardDescription className="text-xs">Progression des projets et tâches sur 6 mois</CardDescription>
          </CardHeader>
          <CardContent className="pl-2">
            <ResponsiveContainer width="100%" height={250}>
              <AreaChart data={activityData}>
                <defs>
                  <linearGradient id="colorProjets" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorTaches" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--background))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                  }}
                />
                <Legend />
                <Area
                  type="monotone"
                  dataKey="projets"
                  stroke="#3b82f6"
                  fillOpacity={1}
                  fill="url(#colorProjets)"
                  name="Projets"
                />
                <Area
                  type="monotone"
                  dataKey="taches"
                  stroke="#10b981"
                  fillOpacity={1}
                  fill="url(#colorTaches)"
                  name="Tâches"
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="md:col-span-3">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Répartition des Tâches</CardTitle>
            <CardDescription className="text-xs">Distribution par statut</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={performanceData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={90}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {performanceData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <div className="mt-3 grid grid-cols-2 gap-1.5">
              {performanceData.map((item, index) => (
                <div key={index} className="flex items-center gap-1.5 text-[10px]">
                  <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                  <span className="text-muted-foreground">{item.name}:</span>
                  <span className="font-medium">{item.value}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Activity & Quick Actions */}
      <div className="grid gap-3 md:grid-cols-7">
        <Card className="md:col-span-4">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Activité Récente</CardTitle>
            <CardDescription className="text-xs">Dernières actions de l'équipe</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {recentActivities.map((activity) => (
                <div
                  key={activity.id}
                  className="flex items-start gap-2 rounded-lg border p-2 transition-colors hover:bg-muted/50"
                >
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10">
                    <Sparkles className="h-3.5 w-3.5 text-primary" />
                  </div>
                  <div className="flex-1 space-y-0.5">
                    <p className="text-xs leading-tight">
                      <span className="font-medium">{activity.user}</span>{" "}
                      <span className="text-muted-foreground">{activity.action}</span>
                    </p>
                    <p className="text-xs font-medium leading-tight">{activity.project}</p>
                    <p className="flex items-center gap-1 text-[10px] text-muted-foreground">
                      <Clock className="h-2.5 w-2.5" />
                      {activity.time}
                    </p>
                  </div>
                  <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="md:col-span-3">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Actions Rapides</CardTitle>
            <CardDescription className="text-xs">Accès rapide aux fonctionnalités</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1.5">
            <PermissionGuard resource="projects" action="create">
              <Button variant="outline" className="w-full justify-start h-8 text-xs" asChild>
                <a href="/projects/new">
                  <FolderKanban className="mr-1.5 h-3.5 w-3.5" />
                  Nouveau Projet
                </a>
              </Button>
            </PermissionGuard>
            <PermissionGuard resource="tasks" action="create">
              <Button variant="outline" className="w-full justify-start h-8 text-xs" asChild>
                <a href="/projects/tasks">
                  <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
                  Créer une Tâche
                </a>
              </Button>
            </PermissionGuard>
            <Button variant="outline" className="w-full justify-start h-8 text-xs" asChild>
              <a href="/pobvue/requests">
                <Users className="mr-1.5 h-3.5 w-3.5" />
                Demande POB
              </a>
            </Button>
            <Button variant="outline" className="w-full justify-start h-8 text-xs" asChild>
              <a href="/mocvue/requests">
                <AlertCircle className="mr-1.5 h-3.5 w-3.5" />
                Nouveau MOC
              </a>
            </Button>
            <Button variant="outline" className="w-full justify-start h-8 text-xs" asChild>
              <a href="/gallery">
                <LayoutDashboard className="mr-1.5 h-3.5 w-3.5" />
                Galerie Dashboards
              </a>
            </Button>
            <Button variant="outline" className="w-full justify-start h-8 text-xs" asChild>
              <a href="/settings/general">
                <Settings className="mr-1.5 h-3.5 w-3.5" />
                Paramètres
              </a>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
