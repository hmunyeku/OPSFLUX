"use client"

import { useState, useEffect, useRef } from "react"
import {
  IconTrendingUp,
  IconTrendingDown,
  IconMinus,
  IconArrowUpRight,
  IconArrowDownRight,
  IconChartBar,
  IconUsers,
  IconFileText,
  IconLayoutDashboard,
  IconClock,
  IconRefresh,
} from "@tabler/icons-react"
import { cn } from "@/lib/utils"
import { auth } from "@/lib/auth"
import { Skeleton } from "@/components/ui/skeleton"
import { Button } from "@/components/ui/button"

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL
  ? `${process.env.NEXT_PUBLIC_API_URL}/api/v1`
  : "/api/v1"

interface StatsCardProps {
  config: {
    title?: string
    value?: number | string
    trend?: number
    icon?: string
    description?: string
    color?: string
    // Nouvelles options pour connexion API
    apiEndpoint?: string  // URL de l'API pour récupérer la valeur
    apiValuePath?: string  // Chemin vers la valeur dans la réponse (ex: "data.count")
    refreshInterval?: number  // Intervalle de rafraîchissement en secondes
    suffix?: string  // Suffixe à afficher après la valeur (ex: "€", "km", etc.)
    prefix?: string  // Préfixe à afficher avant la valeur
  }
}

const ICON_MAP: Record<string, any> = {
  chart: IconChartBar,
  users: IconUsers,
  file: IconFileText,
  dashboard: IconLayoutDashboard,
  clock: IconClock,
}

export default function StatsCard({ config }: StatsCardProps) {
  const {
    title = "Statistique",
    value: configValue = 0,
    trend = 0,
    description,
    color = "blue",
    icon = "chart",
    apiEndpoint,
    apiValuePath,
    refreshInterval = 0,
    suffix = "",
    prefix = "",
  } = config

  const [value, setValue] = useState<number | string>(configValue)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const isFirstRender = useRef(true)

  const IconComponent = ICON_MAP[icon] || IconChartBar

  const fetchValue = async () => {
    if (!apiEndpoint) {
      setValue(configValue)
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      const token = auth.getToken()
      if (!token) throw new Error("Non authentifié")

      const url = apiEndpoint.startsWith("http") ? apiEndpoint : `${API_BASE_URL}${apiEndpoint}`
      const response = await fetch(url, {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      })

      if (!response.ok) {
        throw new Error(`Erreur ${response.status}`)
      }

      const data = await response.json()

      // Extraire la valeur selon le path fourni
      let extractedValue = data
      if (apiValuePath) {
        const paths = apiValuePath.split(".")
        for (const path of paths) {
          extractedValue = extractedValue?.[path]
        }
      }

      setValue(extractedValue ?? configValue)
    } catch (err: any) {
      console.error("Stats Card Error:", err)
      setError(err.message)
      setValue(configValue)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false
      fetchValue()
    }

    if (refreshInterval > 0) {
      const interval = setInterval(fetchValue, refreshInterval * 1000)
      return () => clearInterval(interval)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshInterval])

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

  const getColorClass = () => {
    const colors: Record<string, string> = {
      blue: "text-blue-600 dark:text-blue-400",
      green: "text-green-600 dark:text-green-400",
      orange: "text-orange-600 dark:text-orange-400",
      red: "text-red-600 dark:text-red-400",
      purple: "text-purple-600 dark:text-purple-400",
    }
    return colors[color] || colors.blue
  }

  return (
    <div className="h-full flex flex-col p-4 sm:p-6">
      {/* Header with Title and Icon */}
      <div className="flex items-start justify-between mb-3 sm:mb-4">
        <div className="flex-1 min-w-0">
          <h3 className="text-sm sm:text-base font-semibold text-foreground truncate">
            {title}
          </h3>
        </div>
        <div className="flex items-center gap-2 ml-2">
          {apiEndpoint && !isLoading && (
            <Button
              variant="ghost"
              size="sm"
              onClick={fetchValue}
              className="h-7 w-7 p-0"
            >
              <IconRefresh className="h-3.5 w-3.5" />
            </Button>
          )}
          <div className={cn("p-2 rounded-lg bg-muted/50", getColorClass())}>
            <IconComponent className="h-4 w-4 sm:h-5 sm:w-5" />
          </div>
        </div>
      </div>

      {/* Value - Large and prominent */}
      <div className="flex-1 flex items-center">
        {isLoading ? (
          <Skeleton className="h-12 w-32" />
        ) : error ? (
          <div className="text-sm text-destructive">Erreur</div>
        ) : (
          <div className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight tabular-nums">
            {prefix}{value}{suffix}
          </div>
        )}
      </div>

      {/* Description */}
      {description && (
        <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed line-clamp-2 mt-2">
          {description}
        </p>
      )}

      {/* Trend Badge */}
      {trend !== 0 && (
        <div className="mt-3 sm:mt-4 pt-3 sm:pt-4 border-t border-border/40">
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
