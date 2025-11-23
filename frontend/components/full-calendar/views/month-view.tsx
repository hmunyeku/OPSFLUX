"use client"

import { useMemo } from "react"
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  isToday,
  format,
} from "date-fns"
import { fr } from "date-fns/locale"
import { useCalendar } from "../calendar-context"
import { CalendarEvent, getEventColors } from "../types"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { motion, AnimatePresence } from "framer-motion"

interface MonthViewProps {
  onEventClick?: (event: CalendarEvent) => void
  onDateClick?: (date: Date) => void
}

export function MonthView({ onEventClick, onDateClick }: MonthViewProps) {
  const { currentDate, events, filteredUserIds } = useCalendar()

  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(currentDate), { weekStartsOn: 1 })
    const end = endOfWeek(endOfMonth(currentDate), { weekStartsOn: 1 })
    return eachDayOfInterval({ start, end })
  }, [currentDate])

  const weekDays = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"]

  const getEventsForDay = (day: Date) => {
    return events.filter((event) => {
      const eventStart = new Date(event.start)
      const eventEnd = new Date(event.end)
      const dayStart = new Date(day)
      dayStart.setHours(0, 0, 0, 0)
      const dayEnd = new Date(day)
      dayEnd.setHours(23, 59, 59, 999)

      const isInRange = eventStart <= dayEnd && eventEnd >= dayStart
      const isUserFiltered = filteredUserIds.length === 0 || (event.userId && filteredUserIds.includes(event.userId))

      return isInRange && isUserFiltered
    })
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header with day names */}
      <div className="grid grid-cols-7 border-b bg-muted/30">
        {weekDays.map((day) => (
          <div
            key={day}
            className="p-2 text-center text-sm font-medium text-muted-foreground"
          >
            {day}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="flex-1 grid grid-cols-7 auto-rows-fr">
        <AnimatePresence mode="wait">
          {days.map((day, index) => {
            const dayEvents = getEventsForDay(day)
            const isCurrentMonth = isSameMonth(day, currentDate)
            const isCurrentDay = isToday(day)

            return (
              <motion.div
                key={day.toISOString()}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.1, delay: index * 0.005 }}
                className={cn(
                  "border-b border-r p-1 min-h-[100px] transition-colors cursor-pointer",
                  "hover:bg-accent/30",
                  !isCurrentMonth && "bg-muted/20"
                )}
                onClick={() => onDateClick?.(day)}
              >
                <div className="flex items-center justify-between mb-1">
                  <span
                    className={cn(
                      "text-sm font-medium h-7 w-7 flex items-center justify-center rounded-full",
                      !isCurrentMonth && "text-muted-foreground",
                      isCurrentDay && "bg-blue-600 text-white"
                    )}
                  >
                    {format(day, "d")}
                  </span>
                  {dayEvents.length > 3 && (
                    <Badge variant="secondary" className="text-[10px] h-5 px-1">
                      +{dayEvents.length - 3}
                    </Badge>
                  )}
                </div>

                <div className="space-y-0.5">
                  {dayEvents.slice(0, 3).map((event) => {
                    const colors = getEventColors(event.color)
                    return (
                      <div
                        key={event.id}
                        onClick={(e) => {
                          e.stopPropagation()
                          onEventClick?.(event)
                        }}
                        className={cn(
                          "text-xs px-1.5 py-0.5 rounded truncate border-l-2 cursor-pointer",
                          "transition-all hover:shadow-sm",
                          colors.bg,
                          colors.border,
                          colors.text
                        )}
                      >
                        {!event.allDay && (
                          <span className="font-medium mr-1">
                            {format(new Date(event.start), "HH:mm")}
                          </span>
                        )}
                        {event.title}
                      </div>
                    )
                  })}
                </div>
              </motion.div>
            )
          })}
        </AnimatePresence>
      </div>
    </div>
  )
}
