"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { IconProgress } from "@tabler/icons-react"

interface ProgressCardProps {
  config: {
    title?: string
    value?: number
    max?: number
    label?: string
    description?: string
    showPercentage?: boolean
    color?: "default" | "success" | "warning" | "danger"
  }
}

export default function ProgressCard({ config }: ProgressCardProps) {
  const {
    title = "Progression",
    value = 0,
    max = 100,
    label,
    description,
    showPercentage = true,
    color = "default",
  } = config

  const percentage = Math.round((value / max) * 100)

  const getColorClass = () => {
    switch (color) {
      case "success":
        return "bg-green-500"
      case "warning":
        return "bg-yellow-500"
      case "danger":
        return "bg-red-500"
      default:
        return "bg-primary"
    }
  }

  return (
    <Card className="h-full">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <IconProgress className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-baseline justify-between">
          <div className="text-2xl font-bold">{value}</div>
          {showPercentage && (
            <div className="text-sm text-muted-foreground">{percentage}%</div>
          )}
        </div>

        <Progress value={percentage} className="h-2">
          <div
            className={`h-full transition-all ${getColorClass()}`}
            style={{ width: `${percentage}%` }}
          />
        </Progress>

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          {label && <span>{label}</span>}
          <span>
            {value} / {max}
          </span>
        </div>

        {description && (
          <p className="text-xs text-muted-foreground mt-2">{description}</p>
        )}
      </CardContent>
    </Card>
  )
}
