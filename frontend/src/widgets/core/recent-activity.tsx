"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { IconClock } from "@tabler/icons-react"
import { ScrollArea } from "@/components/ui/scroll-area"

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
  }
}

export default function RecentActivity({ config }: RecentActivityProps) {
  const {
    title = "Activité Récente",
    activities = [],
    maxItems = 5,
  } = config

  const displayActivities = activities.slice(0, maxItems)

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <IconClock className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent className="flex-1 overflow-hidden p-0">
        {displayActivities.length === 0 ? (
          <div className="flex items-center justify-center h-full text-sm text-muted-foreground px-6">
            Aucune activité récente
          </div>
        ) : (
          <ScrollArea className="h-full px-6 pb-4">
            <div className="space-y-4">
              {displayActivities.map((activity) => (
                <div key={activity.id} className="flex items-start gap-3">
                  <Avatar className="h-8 w-8">
                    <AvatarFallback className="text-xs">
                      {activity.initials || activity.user.substring(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 space-y-1">
                    <p className="text-sm">
                      <span className="font-medium">{activity.user}</span>{" "}
                      <span className="text-muted-foreground">{activity.action}</span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {activity.timestamp}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  )
}
