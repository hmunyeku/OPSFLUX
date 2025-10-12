import { createFileRoute } from "@tanstack/react-router"
import {
  Users,
  Ship,
  AlertTriangle,
  TrendingUp,
  Activity,
  Package,
  Calendar,
  Bell,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import useAuth from "@/hooks/useAuth"

export const Route = createFileRoute("/_layout/")({
  component: Dashboard,
})

function Dashboard() {
  const { user } = useAuth()

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          Welcome back, {user?.full_name || "User"}
        </h1>
        <p className="text-muted-foreground">
          Here's what's happening with your operations today.
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Personnel On Board</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">2,847</div>
            <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
              <TrendingUp className="h-3 w-3 text-green-500" />
              <span className="text-green-500">+12.5%</span> from last month
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Vessels</CardTitle>
            <Ship className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">24</div>
            <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
              <Activity className="h-3 w-3 text-blue-500" />
              <span className="text-blue-500">8 in transit</span>
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Open HSE Reports</CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">8</div>
            <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
              <ArrowDownRight className="h-3 w-3 text-green-500" />
              <span className="text-green-500">-4 this week</span>
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Bookings</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">42</div>
            <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
              <ArrowUpRight className="h-3 w-3 text-orange-500" />
              <span className="text-orange-500">+6 today</span>
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-7">
        {/* Recent Activity */}
        <Card className="lg:col-span-4">
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
            <CardDescription>
              Latest updates from your offshore operations
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {[
                {
                  icon: Ship,
                  title: "Vessel MV Atlantic departed",
                  description: "En route to Platform Alpha",
                  time: "5 minutes ago",
                  badge: "Logistics",
                  badgeVariant: "default" as const,
                },
                {
                  icon: AlertTriangle,
                  title: "New HSE incident reported",
                  description: "Minor injury on Platform Bravo - Investigation started",
                  time: "12 minutes ago",
                  badge: "HSE",
                  badgeVariant: "destructive" as const,
                },
                {
                  icon: Users,
                  title: "Crew rotation completed",
                  description: "28 personnel mobilized to Platform Charlie",
                  time: "1 hour ago",
                  badge: "Crew",
                  badgeVariant: "secondary" as const,
                },
                {
                  icon: Package,
                  title: "Equipment manifest approved",
                  description: "Drilling equipment cleared for Platform Delta",
                  time: "3 hours ago",
                  badge: "Procurement",
                  badgeVariant: "outline" as const,
                },
              ].map((activity, index) => (
                <div key={index} className="flex items-start gap-4">
                  <div className="rounded-full bg-muted p-2">
                    <activity.icon className="h-4 w-4" />
                  </div>
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium leading-none">
                        {activity.title}
                      </p>
                      <Badge variant={activity.badgeVariant}>{activity.badge}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {activity.description}
                    </p>
                    <p className="text-xs text-muted-foreground">{activity.time}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Quick Actions & Notifications */}
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
            <CardDescription>Frequently used operations</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button className="w-full justify-start" variant="outline">
              <Users className="mr-2 h-4 w-4" />
              New HSE Report
            </Button>
            <Button className="w-full justify-start" variant="outline">
              <Ship className="mr-2 h-4 w-4" />
              Book Transport
            </Button>
            <Button className="w-full justify-start" variant="outline">
              <Calendar className="mr-2 h-4 w-4" />
              Schedule Crew Rotation
            </Button>
            <Button className="w-full justify-start" variant="outline">
              <Package className="mr-2 h-4 w-4" />
              Create Manifest
            </Button>

            <Separator />

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">Notifications</p>
                <Badge variant="secondary">
                  <Bell className="mr-1 h-3 w-3" />3
                </Badge>
              </div>
              <div className="space-y-2">
                <div className="rounded-lg border p-3 text-sm">
                  <p className="font-medium">Platform Alpha - Weather Alert</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    High winds expected in 6 hours
                  </p>
                </div>
                <div className="rounded-lg border p-3 text-sm">
                  <p className="font-medium">Permit to Work - Approval Required</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    2 PTW requests awaiting your approval
                  </p>
                </div>
                <div className="rounded-lg border p-3 text-sm">
                  <p className="font-medium">Training Certificates Expiring</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    5 crew members need recertification
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* System Status */}
      <Card>
        <CardHeader>
          <CardTitle>System Status</CardTitle>
          <CardDescription>
            OpsFlux v3.0 - Development Progress
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-3">
              <p className="text-sm font-medium">CORE Services (0/25)</p>
              <div className="space-y-2">
                {[
                  { name: "Authentication & Security", status: "pending" },
                  { name: "Users & Permissions (RBAC)", status: "pending" },
                  { name: "Notification System", status: "pending" },
                  { name: "Translation/i18n Service", status: "pending" },
                ].map((service, index) => (
                  <div key={index} className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{service.name}</span>
                    <Badge variant="outline" className="text-xs">
                      {service.status === "pending" ? "Pending" : "Active"}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
            <div className="space-y-3">
              <p className="text-sm font-medium">Business Modules (0/10)</p>
              <div className="space-y-2">
                {[
                  { name: "Offshore Booking System", status: "planned" },
                  { name: "HSE Reports", status: "planned" },
                  { name: "POB Management", status: "planned" },
                  { name: "Logistics Tracking", status: "planned" },
                ].map((module, index) => (
                  <div key={index} className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{module.name}</span>
                    <Badge variant="secondary" className="text-xs">
                      {module.status === "planned" ? "Planned" : "Active"}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
