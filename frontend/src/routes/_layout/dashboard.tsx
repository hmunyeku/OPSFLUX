import { createFileRoute } from "@tanstack/react-router"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts"
import {
  Users,
  Ship,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Activity,
  Clock,
  CheckCircle2,
  XCircle,
  ArrowUpRight,
} from "lucide-react"
import useAuth from "@/hooks/useAuth"

export const Route = createFileRoute("/_layout/dashboard")({
  component: DashboardPage,
})

function DashboardPage() {
  const { user } = useAuth()

  // Sample data for charts
  const revenueData = [
    { month: "Jan", revenue: 4200, expenses: 2400 },
    { month: "Fév", revenue: 5100, expenses: 2800 },
    { month: "Mar", revenue: 4800, expenses: 2600 },
    { month: "Avr", revenue: 6200, expenses: 3200 },
    { month: "Mai", revenue: 7100, expenses: 3600 },
    { month: "Juin", revenue: 6800, expenses: 3400 },
  ]

  const pobData = [
    { day: "Lun", personnel: 142 },
    { day: "Mar", personnel: 138 },
    { day: "Mer", personnel: 145 },
    { day: "Jeu", personnel: 152 },
    { day: "Ven", personnel: 148 },
    { day: "Sam", personnel: 143 },
    { day: "Dim", personnel: 140 },
  ]

  const operationsData = [
    { name: "Completed", value: 234, color: "#22c55e" },
    { name: "In Progress", value: 45, color: "#3b82f6" },
    { name: "Pending", value: 28, color: "#f59e0b" },
    { name: "Cancelled", value: 7, color: "#ef4444" },
  ]

  const stats = [
    {
      title: "Personnel On Board",
      value: "142",
      change: "+12.5%",
      trend: "up",
      icon: Users,
      color: "text-blue-600",
      bgColor: "bg-blue-100 dark:bg-blue-950",
    },
    {
      title: "Active Operations",
      value: "28",
      change: "+4.2%",
      trend: "up",
      icon: Activity,
      color: "text-green-600",
      bgColor: "bg-green-100 dark:bg-green-950",
    },
    {
      title: "Open Incidents",
      value: "7",
      change: "-3",
      trend: "down",
      icon: AlertTriangle,
      color: "text-orange-600",
      bgColor: "bg-orange-100 dark:bg-orange-950",
    },
    {
      title: "Completed Tasks",
      value: "234",
      change: "+18",
      trend: "up",
      icon: CheckCircle2,
      color: "text-purple-600",
      bgColor: "bg-purple-100 dark:bg-purple-950",
    },
  ]

  const recentActivity = [
    {
      id: 1,
      user: "John Doe",
      action: "completed HSE Report",
      details: "Near Miss - Platform Alpha",
      time: "2 min ago",
      status: "success",
    },
    {
      id: 2,
      user: "Sarah Smith",
      action: "updated POB",
      details: "Crew Change Completed",
      time: "15 min ago",
      status: "success",
    },
    {
      id: 3,
      user: "Mike Johnson",
      action: "approved Manifest",
      details: "Cargo Manifest #CR-2024-001",
      time: "1 hour ago",
      status: "success",
    },
    {
      id: 4,
      user: "Emma Wilson",
      action: "scheduled Flight",
      details: "Helicopter to Platform Beta",
      time: "2 hours ago",
      status: "pending",
    },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          Welcome back, {user?.full_name || "User"} 👋
        </h1>
        <p className="text-muted-foreground mt-1">
          Here's what's happening with your operations today
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat, idx) => (
          <Card key={idx} className="hover:shadow-lg transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">{stat.title}</CardTitle>
              <div className={`${stat.bgColor} p-2.5 rounded-lg`}>
                <stat.icon className={`h-4 w-4 ${stat.color}`} />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{stat.value}</div>
              <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                {stat.trend === "up" ? (
                  <>
                    <TrendingUp className="h-3 w-3 text-green-600" />
                    <span className="text-green-600 font-medium">{stat.change}</span>
                  </>
                ) : (
                  <>
                    <TrendingDown className="h-3 w-3 text-red-600" />
                    <span className="text-red-600 font-medium">{stat.change}</span>
                  </>
                )}
                <span className="ml-1">from last month</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Charts Row */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        {/* Revenue Chart */}
        <Card className="col-span-4">
          <CardHeader>
            <CardTitle>Revenue Overview</CardTitle>
            <CardDescription>Monthly revenue and expenses comparison</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={revenueData}>
                <defs>
                  <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorExpenses" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="month" className="text-xs" />
                <YAxis className="text-xs" />
                <Tooltip />
                <Area
                  type="monotone"
                  dataKey="revenue"
                  stroke="#3b82f6"
                  fillOpacity={1}
                  fill="url(#colorRevenue)"
                />
                <Area
                  type="monotone"
                  dataKey="expenses"
                  stroke="#ef4444"
                  fillOpacity={1}
                  fill="url(#colorExpenses)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Operations Pie Chart */}
        <Card className="col-span-3">
          <CardHeader>
            <CardTitle>Operations Status</CardTitle>
            <CardDescription>Current operations breakdown</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={operationsData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  fill="#8884d8"
                  paddingAngle={2}
                  dataKey="value"
                  label={(entry) => `${entry.name}: ${entry.value}`}
                >
                  {operationsData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* POB Trend */}
      <Card>
        <CardHeader>
          <CardTitle>Personnel On Board - Weekly Trend</CardTitle>
          <CardDescription>Personnel count for the last 7 days</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={pobData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="day" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="personnel" fill="#3b82f6" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Recent Activity */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Recent Activity</CardTitle>
              <CardDescription>Latest actions and updates</CardDescription>
            </div>
            <Button variant="ghost" size="sm">
              View All
              <ArrowUpRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {recentActivity.map((activity) => (
              <div
                key={activity.id}
                className="flex items-start gap-4 p-3 rounded-lg hover:bg-accent transition-colors"
              >
                <Avatar className="h-10 w-10">
                  <AvatarFallback className="bg-primary text-primary-foreground font-semibold">
                    {activity.user
                      .split(" ")
                      .map((n) => n[0])
                      .join("")}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 space-y-1">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">
                      <span className="font-semibold">{activity.user}</span> {activity.action}
                    </p>
                    <Badge
                      variant={activity.status === "success" ? "default" : "secondary"}
                      className={
                        activity.status === "success"
                          ? "bg-green-500 hover:bg-green-600"
                          : ""
                      }
                    >
                      {activity.status}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">{activity.details}</p>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    {activity.time}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
