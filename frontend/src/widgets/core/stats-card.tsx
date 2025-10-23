"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { IconTrendingUp, IconTrendingDown, IconMinus } from "@tabler/icons-react"

interface StatsCardProps {
  config: {
    title?: string
    value?: number | string
    trend?: number
    icon?: string
    description?: string
  }
}

export default function StatsCard({ config }: StatsCardProps) {
  const { title = "Statistique", value = 0, trend = 0, description } = config

  const getTrendIcon = () => {
    if (trend > 0) return <IconTrendingUp className="h-4 w-4 text-green-500" />
    if (trend < 0) return <IconTrendingDown className="h-4 w-4 text-red-500" />
    return <IconMinus className="h-4 w-4 text-muted-foreground" />
  }

  const getTrendText = () => {
    if (trend === 0) return "Aucun changement"
    const sign = trend > 0 ? "+" : ""
    return `${sign}${trend}%`
  }

  const getTrendColor = () => {
    if (trend > 0) return "text-green-500"
    if (trend < 0) return "text-red-500"
    return "text-muted-foreground"
  }

  return (
    <Card className="h-full">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        {getTrendIcon()}
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {description && (
          <p className="text-xs text-muted-foreground mt-1">{description}</p>
        )}
        <div className={`flex items-center gap-1 text-xs mt-2 ${getTrendColor()}`}>
          <span>{getTrendText()}</span>
        </div>
      </CardContent>
    </Card>
  )
}
