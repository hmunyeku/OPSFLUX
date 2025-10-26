"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from "recharts"
import { Skeleton } from "@/components/ui/skeleton"
import { getCompanyStats } from "../api"
import { useSession } from "next-auth/react"
import { CompanyTypeLabels } from "../types"

interface CompaniesByTypeConfig {
  chartType?: "pie" | "donut"
  showLegend?: boolean
  showValues?: boolean
}

interface CompaniesByTypeProps {
  config?: CompaniesByTypeConfig
}

const COLORS = {
  client: "#8B5CF6",
  supplier: "#F97316",
  partner: "#06B6D4",
  contractor: "#EAB308",
  competitor: "#EF4444",
  other: "#6B7280",
}

export default function ThirdPartiesCompaniesByType({ config }: CompaniesByTypeProps) {
  const { data: session } = useSession()
  const [stats, setStats] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const { chartType = "pie", showLegend = true, showValues = true } = config || {}

  useEffect(() => {
    const fetchStats = async () => {
      if (!session?.user?.access_token) return

      try {
        setLoading(true)
        const data = await getCompanyStats(session.user.access_token)
        setStats(data)
        setError(null)
      } catch (err: any) {
        setError(err.message || "Erreur lors du chargement des statistiques")
      } finally {
        setLoading(false)
      }
    }

    fetchStats()
  }, [session])

  if (loading) {
    return (
      <Card className="w-full h-full">
        <CardHeader>
          <CardTitle>Entreprises par Type</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="w-full h-48" />
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card className="w-full h-full border-destructive">
        <CardHeader>
          <CardTitle className="text-destructive">Erreur</CardTitle>
          <CardDescription>{error}</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  if (!stats?.by_type) return null

  const chartData = Object.entries(stats.by_type).map(([type, value]) => ({
    name: CompanyTypeLabels[type as keyof typeof CompanyTypeLabels] || type,
    value: value as number,
    color: COLORS[type as keyof typeof COLORS] || COLORS.other,
  }))

  const total = chartData.reduce((sum, item) => sum + item.value, 0)

  return (
    <Card className="w-full h-full">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">Entreprises par Type</CardTitle>
        <CardDescription>Répartition des {total} entreprises</CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={200}>
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              labelLine={false}
              label={
                showValues
                  ? ({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`
                  : false
              }
              outerRadius={80}
              innerRadius={chartType === "donut" ? 40 : 0}
              fill="#8884d8"
              dataKey="value"
            >
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
            {showLegend && <Legend />}
            <Tooltip />
          </PieChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}
