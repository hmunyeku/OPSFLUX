"use client"

import { useMemo } from "react"
import {
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isSameDay,
  isToday,
  format,
  isPast,
} from "date-fns"
import { fr } from "date-fns/locale"
import { useCalendar } from "../calendar-context"
import { CalendarEvent, getEventColors } from "../types"
import { cn } from "@/lib/utils"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import { Clock, MapPin, Calendar, Target } from "lucide-react"

interface AgendaViewProps {
  onEventClick?: (event: CalendarEvent) => void
}

export function AgendaView({ onEventClick }: AgendaViewProps) {
  const { currentDate, events, filteredUserIds } = useCalendar()

  const groupedEvents = useMemo(() => {
    const start = startOfMonth(currentDate)
    const end = endOfMonth(currentDate)
    const days = eachDayOfInterval({ start, end })

    const filtered = events.filter((event) => {
      const isUserFiltered = filteredUserIds.length === 0 || (event.userId && filteredUserIds.includes(event.userId))
      return isUserFiltered
    })

    return days
      .map((day) => {
        const dayEvents = filtered.filter((event) => {
          const eventStart = new Date(event.start)
          return isSameDay(eventStart, day)
        })
        return { day, events: dayEvents }
      })
      .filter((group) => group.events.length > 0)
  }, [currentDate, events, filteredUserIds])

  const getEventIcon = (type?: string) => {
    switch (type) {
      case "meeting":
        return Calendar
      case "deadline":
        return Clock
      case "milestone":
        return Target
      default:
        return Calendar
    }
  }

  return (
    <ScrollArea className="h-full">
      <div className="p-4 space-y-6">
        {groupedEvents.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <Calendar className="h-16 w-16 mb-4 opacity-30" />
            <p className="text-lg font-medium">Aucun événement ce mois</p>
            <p className="text-sm">Les événements apparaîtront ici</p>
          </div>
        ) : (
          groupedEvents.map(({ day, events: dayEvents }) => {
            const isCurrentDay = isToday(day)
            const isPastDay = isPast(day) && !isCurrentDay

            return (
              <div key={day.toISOString()} className="relative">
                {/* Day header */}
                <div
                  className={cn(
                    "sticky top-0 bg-background/95 backdrop-blur-sm z-10 py-2 mb-3",
                    "flex items-center gap-3"
                  )}
                >
                  <div
                    className={cn(
                      "h-12 w-12 rounded-xl flex flex-col items-center justify-center",
                      isCurrentDay
                        ? "bg-blue-600 text-white"
                        : isPastDay
                        ? "bg-muted text-muted-foreground"
                        : "bg-muted"
                    )}
                  >
                    <span className="text-[10px] uppercase font-medium">
                      {format(day, "EEE", { locale: fr })}
                    </span>
                    <span className="text-lg font-bold">{format(day, "d")}</span>
                  </div>
                  <div>
                    <h3
                      className={cn(
                        "text-sm font-semibold",
                        isPastDay && "text-muted-foreground"
                      )}
                    >
                      {format(day, "EEEE d MMMM", { locale: fr })}
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      {dayEvents.length} événement{dayEvents.length > 1 ? "s" : ""}
                    </p>
                  </div>
                  {isCurrentDay && (
                    <Badge className="ml-auto bg-blue-600 text-white">
                      Aujourd'hui
                    </Badge>
                  )}
                </div>

                {/* Events list */}
                <div className="space-y-2 ml-[60px]">
                  {dayEvents
                    .sort(
                      (a, b) =>
                        new Date(a.start).getTime() - new Date(b.start).getTime()
                    )
                    .map((event) => {
                      const colors = getEventColors(event.color)
                      const EventIcon = getEventIcon(event.type)

                      return (
                        <div
                          key={event.id}
                          onClick={() => onEventClick?.(event)}
                          className={cn(
                            "p-4 rounded-xl border-l-4 cursor-pointer transition-all",
                            "hover:shadow-md hover:scale-[1.01]",
                            colors.bg,
                            colors.border,
                            isPastDay && "opacity-60"
                          )}
                        >
                          <div className="flex items-start gap-3">
                            <div
                              className={cn(
                                "h-10 w-10 rounded-lg flex items-center justify-center shrink-0",
                                colors.bg
                              )}
                            >
                              <EventIcon className={cn("h-5 w-5", colors.text)} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <h4 className={cn("font-semibold", colors.text)}>
                                  {event.title}
                                </h4>
                                {event.type && (
                                  <Badge
                                    variant="secondary"
                                    className="text-[10px] h-5"
                                  >
                                    {event.type}
                                  </Badge>
                                )}
                              </div>
                              {event.description && (
                                <p className="text-sm text-muted-foreground line-clamp-2 mb-2">
                                  {event.description}
                                </p>
                              )}
                              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                                <div className="flex items-center gap-1">
                                  <Clock className="h-3.5 w-3.5" />
                                  {event.allDay ? (
                                    <span>Toute la journée</span>
                                  ) : (
                                    <span>
                                      {format(new Date(event.start), "HH:mm")} -{" "}
                                      {format(new Date(event.end), "HH:mm")}
                                    </span>
                                  )}
                                </div>
                                {event.location && (
                                  <div className="flex items-center gap-1">
                                    <MapPin className="h-3.5 w-3.5" />
                                    <span>{event.location}</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                </div>
              </div>
            )
          })
        )}
      </div>
    </ScrollArea>
  )
}
