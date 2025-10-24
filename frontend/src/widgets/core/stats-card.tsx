"use client"

import { IconTrendingUp, IconTrendingDown, IconMinus, IconArrowUpRight, IconArrowDownRight } from "@tabler/icons-react"
import { cn } from "@/lib/utils"

interface StatsCardProps {
  config: {
    title?: string
    value?: number | string
    trend?: number
    icon?: string
    description?: string
    color?: string
  }
}

export default function StatsCard({ config }: StatsCardProps) {
  const { title = "Statistique", value = 0, trend = 0, description, color = "blue" } = config

  const getTrendIcon = () => {
    if (trend > 0) return <IconArrowUpRight className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
    if (trend < 0) return <IconArrowDownRight className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
    return <IconMinus className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
  }

  const getTrendText = () => {
    if (trend === 0) return "Aucun changement"
    const sign = trend > 0 ? "+" : ""
    return `${sign}${trend}%`
  }

  const getTrendColor = () => {
    if (trend > 0) return "text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/20"
    if (trend < 0) return "text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/20"
    return "text-muted-foreground bg-muted/20"
  }

  return (
    <div className="h-full flex flex-col justify-between p-4 sm:p-6">
      {/* Main Content */}
      <div className="space-y-3 sm:space-y-4">
        {/* Value - Large and prominent */}
        <div>
          <div className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight tabular-nums">
            {value}
          </div>
        </div>

        {/* Description */}
        {description && (
          <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed line-clamp-2">
            {description}
          </p>
        )}
      </div>

      {/* Trend Badge */}
      {trend !== 0 && (
        <div className="mt-4 pt-3 sm:pt-4 border-t border-border/40">
          <div className={cn(
            "inline-flex items-center gap-1 sm:gap-1.5 px-2 sm:px-2.5 py-1 sm:py-1.5 rounded-md text-xs sm:text-sm font-medium transition-colors",
            getTrendColor()
          )}>
            {getTrendIcon()}
            <span className="font-semibold">{getTrendText()}</span>
            <span className="text-[10px] sm:text-xs opacity-70 ml-0.5">vs période préc.</span>
          </div>
        </div>
      )}
    </div>
  )
}
