"use client"

import { useMemo } from "react"
import {
  isSameDay,
  isToday,
  format,
  setHours,
  setMinutes,
  eachHourOfInterval,
} from "date-fns"
import { fr } from "date-fns/locale"
import { useCalendar } from "../calendar-context"
import { CalendarEvent, getEventColors } from "../types"
import { cn } from "@/lib/utils"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"

interface DayViewProps {
  onEventClick?: (event: CalendarEvent) => void
  onTimeSlotClick?: (date: Date, hour: number) => void
}

export function DayView({ onEventClick, onTimeSlotClick }: DayViewProps) {
  const { currentDate, events, filteredUserIds } = useCalendar()

  const hours = useMemo(() => {
    const start = setHours(setMinutes(new Date(), 0), 0)
    const end = setHours(setMinutes(new Date(), 0), 23)
    return eachHourOfInterval({ start, end })
  }, [])

  const dayEvents = useMemo(() => {
    return events.filter((event) => {
      const eventStart = new Date(event.start)
      const isSame = isSameDay(eventStart, currentDate)
      const isUserFiltered = filteredUserIds.length === 0 || (event.userId && filteredUserIds.includes(event.userId))
      return isSame && isUserFiltered
    })
  }, [events, currentDate, filteredUserIds])

  const getEventsForHour = (hour: number) => {
    return dayEvents.filter((event) => {
      const eventStart = new Date(event.start)
      return eventStart.getHours() === hour && !event.allDay
    })
  }

  const allDayEvents = dayEvents.filter((event) => event.allDay)
  const isCurrentDay = isToday(currentDate)

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="border-b bg-muted/30 p-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm text-muted-foreground">
              {format(currentDate, "EEEE", { locale: fr })}
            </div>
            <div
              className={cn(
                "text-3xl font-bold",
                isCurrentDay && "text-blue-600"
              )}
            >
              {format(currentDate, "d MMMM yyyy", { locale: fr })}
            </div>
          </div>
          {isCurrentDay && (
            <Badge className="bg-blue-600 text-white">Aujourd'hui</Badge>
          )}
        </div>
      </div>

      {/* All-day events */}
      {allDayEvents.length > 0 && (
        <div className="border-b p-2 bg-muted/20">
          <div className="text-xs text-muted-foreground mb-2">Toute la journée</div>
          <div className="flex flex-wrap gap-2">
            {allDayEvents.map((event) => {
              const colors = getEventColors(event.color)
              return (
                <div
                  key={event.id}
                  onClick={() => onEventClick?.(event)}
                  className={cn(
                    "text-sm px-3 py-1.5 rounded-lg cursor-pointer border-l-4 shadow-sm",
                    colors.bg,
                    colors.border,
                    colors.text
                  )}
                >
                  {event.title}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Time grid */}
      <ScrollArea className="flex-1">
        <div className="grid grid-cols-[80px_1fr]">
          {hours.map((hour) => {
            const hourEvents = getEventsForHour(hour.getHours())
            const currentHour = new Date().getHours()
            const isCurrentHour = isCurrentDay && hour.getHours() === currentHour

            return (
              <div key={hour.toISOString()} className="contents">
                <div
                  className={cn(
                    "p-2 text-sm text-muted-foreground text-right pr-4 border-b h-20 bg-muted/30",
                    isCurrentHour && "text-blue-600 font-medium"
                  )}
                >
                  {format(hour, "HH:mm")}
                </div>
                <div
                  className={cn(
                    "border-l border-b h-20 p-1 cursor-pointer hover:bg-accent/30 transition-colors relative",
                    isCurrentHour && "bg-blue-50/50 dark:bg-blue-950/20"
                  )}
                  onClick={() => onTimeSlotClick?.(currentDate, hour.getHours())}
                >
                  {isCurrentHour && (
                    <div className="absolute left-0 right-0 top-0 h-0.5 bg-blue-600" />
                  )}
                  <div className="space-y-1">
                    {hourEvents.map((event) => {
                      const colors = getEventColors(event.color)
                      return (
                        <div
                          key={event.id}
                          onClick={(e) => {
                            e.stopPropagation()
                            onEventClick?.(event)
                          }}
                          className={cn(
                            "text-sm px-3 py-1.5 rounded-lg cursor-pointer border-l-4 shadow-sm",
                            colors.bg,
                            colors.border,
                            colors.text
                          )}
                        >
                          <div className="flex items-center gap-2">
                            <span className="font-semibold">
                              {format(new Date(event.start), "HH:mm")} - {format(new Date(event.end), "HH:mm")}
                            </span>
                          </div>
                          <div className="font-medium">{event.title}</div>
                          {event.location && (
                            <div className="text-xs opacity-75">{event.location}</div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </ScrollArea>
    </div>
  )
}
