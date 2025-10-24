"use client"

import { useState, useEffect, useRef } from "react"
import { IconUsers, IconTrendingUp, IconTrendingDown, IconRefresh } from "@tabler/icons-react"
import { cn } from "@/lib/utils"
import { auth } from "@/lib/auth"
import { Skeleton } from "@/components/ui/skeleton"
import { Button } from "@/components/ui/button"

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL
  ? `${process.env.NEXT_PUBLIC_API_URL}/api/v1`
  : "/api/v1"

interface UserStatsProps {
  config: {
    title?: string
    totalUsers?: number
    activeUsers?: number
    newUsers?: number
    trend?: number
    description?: string
    // API options
    apiEndpoint?: string
    refreshInterval?: number
  }
}

export default function UserStats({ config }: UserStatsProps) {
  const {
    title = "Statistiques Utilisateurs",
    totalUsers: configTotal = 0,
    activeUsers: configActive = 0,
    newUsers: configNew = 0,
    trend: configTrend = 0,
    description,
    apiEndpoint,
    refreshInterval = 0,
  } = config

  const [totalUsers, setTotalUsers] = useState(configTotal)
  const [activeUsers, setActiveUsers] = useState(configActive)
  const [newUsers, setNewUsers] = useState(configNew)
  const [trend, setTrend] = useState(configTrend)
  const [isLoading, setIsLoading] = useState(false)
  const isFirstRender = useRef(true)

  const fetchStats = async () => {
    if (!apiEndpoint) {
      setTotalUsers(configTotal)
      setActiveUsers(configActive)
      setNewUsers(configNew)
      setTrend(configTrend)
      return
    }

    setIsLoading(true)
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

      if (!response.ok) throw new Error(`Erreur ${response.status}`)

      const data = await response.json()
      setTotalUsers(data.total ?? configTotal)
      setActiveUsers(data.active ?? configActive)
      setNewUsers(data.new ?? configNew)
      setTrend(data.trend ?? configTrend)
    } catch (err: any) {
      console.error("User Stats Error:", err)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false
      fetchStats()
    }
    if (refreshInterval > 0) {
      const interval = setInterval(fetchStats, refreshInterval * 1000)
      return () => clearInterval(interval)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshInterval])

  return (
    <div className="h-full flex flex-col p-3">
      {/* Bouton refresh si API configurée */}
      {apiEndpoint && !isLoading && (
        <div className="flex justify-end mb-2">
          <Button variant="ghost" size="sm" onClick={fetchStats} className="h-6 w-6 p-0">
            <IconRefresh className="h-3 w-3" />
          </Button>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-8 w-16" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : (
        <div className="space-y-2">
          {/* Total - Compact */}
          <div>
            <div className="flex items-baseline gap-1">
              <div className="text-xl font-bold tabular-nums">{totalUsers}</div>
              {trend !== 0 && (
                <div className={cn(
                  "inline-flex items-center gap-0.5 text-[10px] font-medium",
                  trend > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"
                )}>
                  {trend > 0 ? <IconTrendingUp className="h-2.5 w-2.5" /> : <IconTrendingDown className="h-2.5 w-2.5" />}
                  <span>{trend > 0 ? "+" : ""}{trend}%</span>
                </div>
              )}
            </div>
            <p className="text-[10px] text-muted-foreground">Total</p>
          </div>

          {/* Compact Stats Grid */}
          <div className="grid grid-cols-2 gap-2 pt-1.5 border-t">
            <div>
              <div className="text-sm font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums">{activeUsers}</div>
              <p className="text-[10px] text-muted-foreground">Actifs</p>
            </div>
            <div>
              <div className="text-sm font-semibold text-blue-600 dark:text-blue-400 tabular-nums">{newUsers}</div>
              <p className="text-[10px] text-muted-foreground">Nouveaux</p>
            </div>
          </div>

          {description && (
            <p className="text-[10px] text-muted-foreground line-clamp-1 pt-1">{description}</p>
          )}
        </div>
      )}
    </div>
  )
}
