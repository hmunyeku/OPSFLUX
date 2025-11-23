"use client"

import { useMemo } from "react"
import {
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  eachHourOfInterval,
  isSameDay,
  isToday,
  format,
  setHours,
  setMinutes,
  startOfDay,
  endOfDay,
} from "date-fns"
import { fr } from "date-fns/locale"
import { useCalendar } from "../calendar-context"
import { CalendarEvent, getEventColors } from "../types"
import { cn } from "@/lib/utils"
import { ScrollArea } from "@/components/ui/scroll-area"

interface WeekViewProps {
  onEventClick?: (event: CalendarEvent) => void
  onTimeSlotClick?: (date: Date, hour: number) => void
}

export function WeekView({ onEventClick, onTimeSlotClick }: WeekViewProps) {
  const { currentDate, events, filteredUserIds } = useCalendar()

  const days = useMemo(() => {
    const start = startOfWeek(currentDate, { weekStartsOn: 1 })
    const end = endOfWeek(currentDate, { weekStartsOn: 1 })
    return eachDayOfInterval({ start, end })
  }, [currentDate])

  const hours = useMemo(() => {
    const start = setHours(setMinutes(new Date(), 0), 0)
    const end = setHours(setMinutes(new Date(), 0), 23)
    return eachHourOfInterval({ start, end })
  }, [])

  const getEventsForDayAndHour = (day: Date, hour: number) => {
    return events.filter((event) => {
      const eventStart = new Date(event.start)
      const eventHour = eventStart.getHours()
      const isSame = isSameDay(eventStart, day) && eventHour === hour
      const isUserFiltered = filteredUserIds.length === 0 || (event.userId && filteredUserIds.includes(event.userId))
      return isSame && isUserFiltered
    })
  }

  const getAllDayEvents = (day: Date) => {
    return events.filter((event) => {
      const eventStart = new Date(event.start)
      const isSame = isSameDay(eventStart, day) && event.allDay
      const isUserFiltered = filteredUserIds.length === 0 || (event.userId && filteredUserIds.includes(event.userId))
      return isSame && isUserFiltered
    })
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header with day names */}
      <div className="grid grid-cols-[60px_repeat(7,1fr)] border-b bg-muted/30">
        <div className="p-2" />
        {days.map((day) => {
          const isCurrentDay = isToday(day)
          return (
            <div
              key={day.toISOString()}
              className={cn(
                "p-2 text-center border-l",
                isCurrentDay && "bg-blue-50 dark:bg-blue-950/30"
              )}
            >
              <div className="text-xs text-muted-foreground">
                {format(day, "EEE", { locale: fr })}
              </div>
              <div
                className={cn(
                  "text-lg font-semibold",
                  isCurrentDay && "text-blue-600"
                )}
              >
                {format(day, "d")}
              </div>
            </div>
          )
        })}
      </div>

      {/* All-day events row */}
      <div className="grid grid-cols-[60px_repeat(7,1fr)] border-b min-h-[40px]">
        <div className="p-1 text-xs text-muted-foreground text-right pr-2 bg-muted/30">
          Journée
        </div>
        {days.map((day) => {
          const allDayEvents = getAllDayEvents(day)
          return (
            <div key={day.toISOString()} className="p-1 border-l flex flex-wrap gap-0.5">
              {allDayEvents.slice(0, 2).map((event) => {
                const colors = getEventColors(event.color)
                return (
                  <div
                    key={event.id}
                    onClick={() => onEventClick?.(event)}
                    className={cn(
                      "text-[10px] px-1 py-0.5 rounded truncate cursor-pointer",
                      colors.bg,
                      colors.text
                    )}
                  >
                    {event.title}
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>

      {/* Time grid */}
      <ScrollArea className="flex-1">
        <div className="grid grid-cols-[60px_repeat(7,1fr)]">
          {hours.map((hour) => (
            <div key={hour.toISOString()} className="contents">
              <div className="p-1 text-xs text-muted-foreground text-right pr-2 border-b h-14 bg-muted/30">
                {format(hour, "HH:mm")}
              </div>
              {days.map((day) => {
                const hourEvents = getEventsForDayAndHour(day, hour.getHours())
                const isCurrentDay = isToday(day)
                return (
                  <div
                    key={`${day.toISOString()}-${hour.toISOString()}`}
                    className={cn(
                      "border-l border-b h-14 p-0.5 cursor-pointer hover:bg-accent/30 transition-colors",
                      isCurrentDay && "bg-blue-50/30 dark:bg-blue-950/10"
                    )}
                    onClick={() => onTimeSlotClick?.(day, hour.getHours())}
                  >
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
                            "text-[10px] px-1 py-0.5 rounded truncate cursor-pointer border-l-2",
                            colors.bg,
                            colors.border,
                            colors.text
                          )}
                        >
                          <span className="font-medium">
                            {format(new Date(event.start), "HH:mm")}
                          </span>{" "}
                          {event.title}
                        </div>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  )
}
