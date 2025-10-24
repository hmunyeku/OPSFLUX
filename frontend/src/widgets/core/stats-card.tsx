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
    <div className="h-full flex flex-col p-3">
      {/* Compact Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <div className={cn("p-1.5 rounded-md bg-muted/50 shrink-0", getColorClass())}>
            <IconComponent className="h-3.5 w-3.5" />
          </div>
          <h3 className="text-xs font-medium text-muted-foreground truncate">
            {title}
          </h3>
        </div>
        {apiEndpoint && !isLoading && (
          <Button
            variant="ghost"
            size="sm"
            onClick={fetchValue}
            className="h-6 w-6 p-0 shrink-0"
          >
            <IconRefresh className="h-3 w-3" />
          </Button>
        )}
      </div>

      {/* Compact Value Display */}
      <div className="flex-1 flex flex-col justify-center min-h-0">
        {isLoading ? (
          <Skeleton className="h-8 w-24" />
        ) : error ? (
          <div className="text-xs text-destructive">Erreur</div>
        ) : (
          <div className="flex items-baseline gap-1">
            <div className="text-2xl font-bold tracking-tight tabular-nums">
              {prefix}{value}{suffix}
            </div>
            {trend !== 0 && (
              <div className={cn(
                "inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium",
                getTrendColor()
              )}>
                {getTrendIcon()}
                <span>{getTrendText()}</span>
              </div>
            )}
          </div>
        )}

        {description && (
          <p className="text-[11px] text-muted-foreground line-clamp-1 mt-1">
            {description}
          </p>
        )}
      </div>
    </div>
  )
}
