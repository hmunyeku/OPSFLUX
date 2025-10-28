"use client"

import { useState, useEffect, useRef } from "react"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { IconActivity, IconRefresh } from "@tabler/icons-react"
import { ScrollArea } from "@/components/ui/scroll-area"
import { auth } from "@/lib/auth"
import { Skeleton } from "@/components/ui/skeleton"
import { Button } from "@/components/ui/button"

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL
  ? `${process.env.NEXT_PUBLIC_API_URL}/api/v1`
  : "/api/v1"

interface ActivityItem {
  id: string
  user: string
  action: string
  timestamp: string
  initials?: string
}

interface RecentActivityProps {
  config: {
    title?: string
    activities?: ActivityItem[]
    maxItems?: number
    apiEndpoint?: string
    refreshInterval?: number
  }
}

export default function RecentActivity({ config }: RecentActivityProps) {
  const {
    title = "Activité Récente",
    activities: configActivities = [],
    maxItems = 5,
    apiEndpoint,
    refreshInterval = 0,
  } = config

  const [activities, setActivities] = useState<ActivityItem[]>(configActivities)
  const [isLoading, setIsLoading] = useState(false)
  const isFirstRender = useRef(true)

  const fetchActivities = async () => {
    if (!apiEndpoint) {
      setActivities(configActivities)
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
      setActivities(data.data || data || configActivities)
    } catch (err: any) {
      console.error("Recent Activity Error:", err)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false
      fetchActivities()
    }
    if (refreshInterval > 0) {
      const interval = setInterval(fetchActivities, refreshInterval * 1000)
      return () => clearInterval(interval)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshInterval])

  const displayActivities = activities.slice(0, maxItems)

  return (
    <div className="h-full flex flex-col p-3">
      {/* Bouton refresh si API configurée */}
      {apiEndpoint && !isLoading && (
        <div className="flex justify-end mb-2">
          <Button variant="ghost" size="sm" onClick={fetchActivities} className="h-6 w-6 p-0">
            <IconRefresh className="h-3 w-3" />
          </Button>
        </div>
      )}

      {/* Compact Activity List */}
      <div className="flex-1 min-h-0">
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : displayActivities.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center gap-2">
            <IconActivity className="h-8 w-8 text-muted-foreground/30" />
            <p className="text-xs text-muted-foreground">Aucune activité</p>
          </div>
        ) : (
          <ScrollArea className="h-full">
            <div className="space-y-2">
              {displayActivities.map((activity) => (
                <div key={activity.id} className="flex items-start gap-2">
                  <Avatar className="h-6 w-6 shrink-0">
                    <AvatarFallback className="text-[10px] font-semibold bg-muted text-foreground">
                      {activity.initials || activity.user.substring(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] leading-relaxed text-foreground">
                      <span className="font-medium">{activity.user}</span>{" "}
                      <span className="text-muted-foreground">{activity.action}</span>
                    </p>
                    <p className="text-[10px] text-muted-foreground">{activity.timestamp}</p>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </div>
    </div>
  )
}
