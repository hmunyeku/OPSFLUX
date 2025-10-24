"use client"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { IconActivity, IconClock } from "@tabler/icons-react"
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
    <div className="h-full flex flex-col">
      {displayActivities.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-full text-center px-4 sm:px-6 gap-2">
          <IconActivity className="h-10 w-10 sm:h-12 sm:w-12 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">Aucune activité récente</p>
        </div>
      ) : (
        <ScrollArea className="h-full">
          <div className="px-3 sm:px-5 py-3 sm:py-4">
            <div className="relative space-y-4 sm:space-y-5">
              {/* Timeline line */}
              <div className="absolute left-[19px] sm:left-[21px] top-0 bottom-0 w-px bg-gradient-to-b from-border via-border/50 to-transparent" />

              {displayActivities.map((activity, index) => (
                <div key={activity.id} className="relative flex items-start gap-3 sm:gap-4">
                  {/* Avatar with ring */}
                  <div className="relative z-10 flex-shrink-0">
                    <Avatar className="h-9 w-9 sm:h-10 sm:w-10 ring-2 ring-background">
                      <AvatarFallback className="text-xs sm:text-sm font-semibold bg-gradient-to-br from-primary/20 to-primary/10 text-primary">
                        {activity.initials || activity.user.substring(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0 pt-1">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <p className="text-xs sm:text-sm leading-relaxed">
                        <span className="font-semibold text-foreground">{activity.user}</span>{" "}
                        <span className="text-muted-foreground">{activity.action}</span>
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 text-[10px] sm:text-xs text-muted-foreground">
                      <IconClock className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                      <span>{activity.timestamp}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </ScrollArea>
      )}
    </div>
  )
}
