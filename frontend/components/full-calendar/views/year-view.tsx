"use client"

import { useMemo } from "react"
import {
  startOfYear,
  endOfYear,
  eachMonthOfInterval,
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
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import { motion } from "framer-motion"

interface YearViewProps {
  onEventClick?: (event: CalendarEvent) => void
  onDateClick?: (date: Date) => void
  onMonthClick?: (date: Date) => void
}

export function YearView({ onEventClick, onDateClick, onMonthClick }: YearViewProps) {
  const { currentDate, events, filteredUserIds, setCurrentDate, setView } = useCalendar()

  const months = useMemo(() => {
    const start = startOfYear(currentDate)
    const end = endOfYear(currentDate)
    return eachMonthOfInterval({ start, end })
  }, [currentDate])

  const getEventsForDay = (day: Date) => {
    return events.filter((event) => {
      const eventStart = new Date(event.start)
      const isSame = isSameDay(eventStart, day)
      const isUserFiltered = filteredUserIds.length === 0 || (event.userId && filteredUserIds.includes(event.userId))
      return isSame && isUserFiltered
    })
  }

  const getEventsForMonth = (month: Date) => {
    return events.filter((event) => {
      const eventStart = new Date(event.start)
      const isSame = isSameMonth(eventStart, month)
      const isUserFiltered = filteredUserIds.length === 0 || (event.userId && filteredUserIds.includes(event.userId))
      return isSame && isUserFiltered
    })
  }

  const handleMonthClick = (month: Date) => {
    setCurrentDate(month)
    setView("month")
  }

  const weekDays = ["L", "M", "M", "J", "V", "S", "D"]

  return (
    <ScrollArea className="h-full">
      <div className="p-6">
        <div className="grid grid-cols-3 xl:grid-cols-4 gap-6">
          {months.map((month, monthIndex) => {
            const monthStart = startOfMonth(month)
            const monthEnd = endOfMonth(month)
            const calendarStart = startOfWeek(monthStart, { weekStartsOn: 1 })
            const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 1 })
            const days = eachDayOfInterval({ start: calendarStart, end: calendarEnd })
            const monthEvents = getEventsForMonth(month)

            return (
              <motion.div
                key={month.toISOString()}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, delay: monthIndex * 0.03 }}
                className="bg-background rounded-xl border shadow-sm overflow-hidden hover:shadow-md transition-shadow"
              >
                {/* Month header */}
                <div
                  className="px-4 py-3 bg-gradient-to-r from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 border-b cursor-pointer hover:from-blue-50 hover:to-indigo-50 dark:hover:from-blue-950/30 dark:hover:to-indigo-950/30 transition-colors"
                  onClick={() => handleMonthClick(month)}
                >
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold capitalize">
                      {format(month, "MMMM", { locale: fr })}
                    </h3>
                    {monthEvents.length > 0 && (
                      <Badge variant="secondary" className="text-[10px] h-5 px-1.5">
                        {monthEvents.length}
                      </Badge>
                    )}
                  </div>
                </div>

                {/* Mini calendar */}
                <div className="p-2">
                  {/* Week days header */}
                  <div className="grid grid-cols-7 mb-1">
                    {weekDays.map((day, i) => (
                      <div
                        key={i}
                        className="text-[10px] text-center text-muted-foreground font-medium py-1"
                      >
                        {day}
                      </div>
                    ))}
                  </div>

                  {/* Days grid */}
                  <div className="grid grid-cols-7 gap-px">
                    {days.slice(0, 42).map((day) => {
                      const dayEvents = getEventsForDay(day)
                      const isCurrentMonth = isSameMonth(day, month)
                      const isCurrentDay = isToday(day)
                      const hasEvents = dayEvents.length > 0

                      return (
                        <div
                          key={day.toISOString()}
                          className={cn(
                            "aspect-square flex items-center justify-center relative cursor-pointer rounded-sm transition-colors",
                            !isCurrentMonth && "text-muted-foreground/30",
                            isCurrentDay && "bg-blue-600 text-white font-semibold",
                            !isCurrentDay && hasEvents && "bg-blue-50 dark:bg-blue-950/30",
                            !isCurrentDay && "hover:bg-accent"
                          )}
                          onClick={() => {
                            setCurrentDate(day)
                            setView("day")
                          }}
                        >
                          <span className="text-[11px]">{format(day, "d")}</span>
                          {hasEvents && !isCurrentDay && (
                            <div className="absolute bottom-0.5 left-1/2 -translate-x-1/2 flex gap-0.5">
                              {dayEvents.slice(0, 3).map((event, i) => {
                                const colors = getEventColors(event.color)
                                return (
                                  <div
                                    key={i}
                                    className={cn("w-1 h-1 rounded-full", colors.border.replace("border-l-", "bg-"))}
                                  />
                                )
                              })}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* Events preview */}
                {monthEvents.length > 0 && (
                  <div className="px-2 pb-2 space-y-1">
                    {monthEvents.slice(0, 2).map((event) => {
                      const colors = getEventColors(event.color)
                      return (
                        <div
                          key={event.id}
                          onClick={(e) => {
                            e.stopPropagation()
                            onEventClick?.(event)
                          }}
                          className={cn(
                            "text-[10px] px-2 py-1 rounded truncate cursor-pointer border-l-2",
                            colors.bg,
                            colors.border,
                            colors.text
                          )}
                        >
                          <span className="font-medium">
                            {format(new Date(event.start), "d")}
                          </span>{" "}
                          {event.title}
                        </div>
                      )
                    })}
                    {monthEvents.length > 2 && (
                      <div className="text-[10px] text-muted-foreground text-center py-1">
                        +{monthEvents.length - 2} autres
                      </div>
                    )}
                  </div>
                )}
              </motion.div>
            )
          })}
        </div>
      </div>
    </ScrollArea>
  )
}
