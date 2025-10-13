import { createFileRoute } from "@tanstack/react-router"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import useAuth from "@/hooks/useAuth"
import {
  Users,
  Ship,
  AlertTriangle,
  CheckCircle2,
  TrendingUp,
  TrendingDown,
  Plus,
  Calendar,
  FileText,
  Clock,
  ArrowUpRight,
} from "lucide-react"

export const Route = createFileRoute("/_layout/")({
  component: Dashboard,
})

function Dashboard() {
  const { user } = useAuth()

  const stats = [
    {
      title: "Personnel On Board",
      value: "142",
      change: "+12.5%",
      trend: "up",
      icon: Users,
      color: "text-blue-500",
      bgColor: "bg-blue-500/10",
    },
    {
      title: "Active Operations",
      value: "28",
      change: "+4.2%",
      trend: "up",
      icon: Ship,
      color: "text-green-500",
      bgColor: "bg-green-500/10",
    },
    {
      title: "Open Incidents",
      value: "7",
      change: "-3",
      trend: "down",
      icon: AlertTriangle,
      color: "text-orange-500",
      bgColor: "bg-orange-500/10",
    },
    {
      title: "Completed Tasks",
      value: "234",
      change: "+18",
      trend: "up",
      icon: CheckCircle2,
      color: "text-purple-500",
      bgColor: "bg-purple-500/10",
    },
  ]

  const recentActivity = [
    {
      id: 1,
      type: "HSE Report",
      title: "Near Miss - Platform Alpha",
      user: "John Doe",
      time: "2 minutes ago",
      status: "pending",
    },
    {
      id: 2,
      type: "POB Update",
      title: "Crew Change Completed",
      user: "Sarah Smith",
      time: "15 minutes ago",
      status: "completed",
    },
    {
      id: 3,
      type: "Logistics",
      title: "Cargo Manifest Approved",
      user: "Mike Johnson",
      time: "1 hour ago",
      status: "completed",
    },
    {
      id: 4,
      type: "Booking",
      title: "Helicopter Flight Scheduled",
      user: "Emma Wilson",
      time: "2 hours ago",
      status: "scheduled",
    },
  ]

  const quickActions = [
    { title: "New HSE Report", icon: AlertTriangle, href: "/hse-reports/new" },
    { title: "Update POB", icon: Users, href: "/pob" },
    { title: "Create Booking", icon: Ship, href: "/booking/new" },
    { title: "New Document", icon: FileText, href: "/documents/new" },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Bonjour, {user?.full_name || "User"} 👋
          </h1>
          <p className="text-muted-foreground mt-1">
            Voici un aperçu de vos opérations aujourd'hui
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm">
            <Calendar className="mr-2 h-4 w-4" />
            Aujourd'hui
          </Button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat, idx) => (
          <Card key={idx} className="hover:shadow-md transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                {stat.title}
              </CardTitle>
              <div className={`${stat.bgColor} p-2 rounded-lg`}>
                <stat.icon className={`h-4 w-4 ${stat.color}`} />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stat.value}</div>
              <div className="flex items-center text-xs text-muted-foreground mt-1">
                {stat.trend === "up" ? (
                  <TrendingUp className="mr-1 h-3 w-3 text-green-500" />
                ) : (
                  <TrendingDown className="mr-1 h-3 w-3 text-red-500" />
                )}
                <span className={stat.trend === "up" ? "text-green-500" : "text-red-500"}>
                  {stat.change}
                </span>
                <span className="ml-1">ce mois</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Main Content Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        {/* Recent Activity */}
        <Card className="col-span-4">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Activité récente</CardTitle>
                <CardDescription>
                  Dernières actions et mises à jour
                </CardDescription>
              </div>
              <Button variant="ghost" size="sm">
                Voir tout
                <ArrowUpRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {recentActivity.map((activity) => (
                <div
                  key={activity.id}
                  className="flex items-start gap-4 p-3 rounded-lg hover:bg-accent transition-colors cursor-pointer"
                >
                  <Avatar className="h-9 w-9">
                    <AvatarFallback className="bg-primary text-primary-foreground">
                      {activity.user.split(" ").map(n => n[0]).join("")}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium">{activity.title}</p>
                      <Badge
                        variant={
                          activity.status === "completed"
                            ? "default"
                            : activity.status === "pending"
                            ? "secondary"
                            : "outline"
                        }
                        className="text-xs"
                      >
                        {activity.status}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {activity.type} • {activity.user}
                    </p>
                    <div className="flex items-center text-xs text-muted-foreground">
                      <Clock className="mr-1 h-3 w-3" />
                      {activity.time}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Quick Actions & Shortcuts */}
        <Card className="col-span-3">
          <CardHeader>
            <CardTitle>Actions rapides</CardTitle>
            <CardDescription>
              Raccourcis pour vos tâches fréquentes
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {quickActions.map((action, idx) => (
              <Button
                key={idx}
                variant="outline"
                className="w-full justify-start h-auto py-3"
                asChild
              >
                <a href={action.href}>
                  <action.icon className="mr-3 h-5 w-5" />
                  <span className="flex-1 text-left">{action.title}</span>
                  <Plus className="h-4 w-4 text-muted-foreground" />
                </a>
              </Button>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Additional Content Tabs */}
      <Card>
        <CardHeader>
          <CardTitle>Vue d'ensemble des opérations</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="offshore" className="space-y-4">
            <TabsList>
              <TabsTrigger value="offshore">Offshore</TabsTrigger>
              <TabsTrigger value="logistics">Logistique</TabsTrigger>
              <TabsTrigger value="hse">HSE</TabsTrigger>
              <TabsTrigger value="planning">Planning</TabsTrigger>
            </TabsList>
            <TabsContent value="offshore" className="space-y-4">
              <div className="grid gap-4 md:grid-cols-3">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium">Plateformes actives</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">12</div>
                    <p className="text-xs text-muted-foreground">En production</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium">Navires en mer</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">8</div>
                    <p className="text-xs text-muted-foreground">En mission</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium">Vols programmés</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">24</div>
                    <p className="text-xs text-muted-foreground">Cette semaine</p>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
            <TabsContent value="logistics">
              <p className="text-sm text-muted-foreground">
                Contenu logistique à venir...
              </p>
            </TabsContent>
            <TabsContent value="hse">
              <p className="text-sm text-muted-foreground">
                Contenu HSE à venir...
              </p>
            </TabsContent>
            <TabsContent value="planning">
              <p className="text-sm text-muted-foreground">
                Contenu planning à venir...
              </p>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  )
}
