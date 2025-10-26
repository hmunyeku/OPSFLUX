"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts"
import { Skeleton } from "@/components/ui/skeleton"
import { TrendingUp } from "lucide-react"
import { useSession } from "next-auth/react"

interface ContactsEvolutionConfig {
  period?: "week" | "month" | "quarter"
  chartType?: "line" | "area"
  showDataPoints?: boolean
  groupBy?: "day" | "week" | "month"
}

interface ContactsEvolutionProps {
  config?: ContactsEvolutionConfig
}

export default function ThirdPartiesContactsEvolution({ config }: ContactsEvolutionProps) {
  const { data: session } = useSession()
  const [chartData, setChartData] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const {
    period = "month",
    chartType = "line",
    showDataPoints = true,
    groupBy = "week",
  } = config || {}

  useEffect(() => {
    // TODO: Implémenter l'appel API pour récupérer les données d'évolution
    // Pour l'instant, on génère des données de démonstration
    const generateMockData = () => {
      const data = []
      const periods = period === "week" ? 7 : period === "month" ? 30 : 90

      for (let i = periods; i >= 0; i--) {
        const date = new Date()
        date.setDate(date.getDate() - i)

        data.push({
          date: date.toLocaleDateString("fr-FR", {
            day: "2-digit",
            month: "short"
          }),
          contacts: Math.floor(Math.random() * 50) + 20,
        })
      }

      return data
    }

    setLoading(true)
    setTimeout(() => {
      setChartData(generateMockData())
      setLoading(false)
    }, 500)
  }, [session, period])

  if (loading) {
    return (
      <Card className="w-full h-full">
        <CardHeader>
          <CardTitle>Évolution des Contacts</CardTitle>
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

  return (
    <Card className="w-full h-full">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <TrendingUp className="h-5 w-5" />
          Évolution des Contacts
        </CardTitle>
        <CardDescription>
          Nombre de contacts ajoutés sur la période
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 12 }}
              stroke="#888888"
            />
            <YAxis
              tick={{ fontSize: 12 }}
              stroke="#888888"
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "hsl(var(--background))",
                border: "1px solid hsl(var(--border))",
                borderRadius: "6px"
              }}
            />
            <Line
              type="monotone"
              dataKey="contacts"
              stroke="hsl(var(--primary))"
              strokeWidth={2}
              dot={showDataPoints}
              activeDot={{ r: 6 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}
