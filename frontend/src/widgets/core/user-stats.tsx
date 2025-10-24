"use client"

import { IconUsers, IconTrendingUp, IconTrendingDown } from "@tabler/icons-react"

interface UserStatsProps {
  config: {
    title?: string
    totalUsers?: number
    activeUsers?: number
    newUsers?: number
    trend?: number
    description?: string
  }
}

export default function UserStats({ config }: UserStatsProps) {
  const {
    title = "Statistiques Utilisateurs",
    totalUsers = 0,
    activeUsers = 0,
    newUsers = 0,
    trend = 0,
    description,
  } = config

  return (
    <div className="h-full flex flex-col p-4 sm:p-6">
      <div className="space-y-3">
        {/* Total Users */}
        <div>
          <div className="text-2xl font-bold">{totalUsers}</div>
          <p className="text-xs text-muted-foreground">Utilisateurs totaux</p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-3 pt-2 border-t">
          <div>
            <div className="text-lg font-semibold text-green-600">{activeUsers}</div>
            <p className="text-xs text-muted-foreground">Actifs</p>
          </div>
          <div>
            <div className="text-lg font-semibold text-blue-600">{newUsers}</div>
            <p className="text-xs text-muted-foreground">Nouveaux</p>
          </div>
        </div>

        {/* Trend */}
        {trend !== 0 && (
          <div className={`flex items-center gap-1 text-xs ${trend > 0 ? "text-green-500" : "text-red-500"}`}>
            {trend > 0 ? (
              <IconTrendingUp className="h-3 w-3" />
            ) : (
              <IconTrendingDown className="h-3 w-3" />
            )}
            <span>{trend > 0 ? "+" : ""}{trend}% ce mois</span>
          </div>
        )}

        {/* Description */}
        {description && (
          <p className="text-xs text-muted-foreground mt-2">{description}</p>
        )}
      </div>
    </div>
  )
}
