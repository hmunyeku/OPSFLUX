"use client"

import { useCalendar } from "./calendar-context"
import { CalendarEvent } from "./types"
import { MonthView, WeekView, DayView, YearView, AgendaView } from "./views"

interface CalendarBodyProps {
  onEventClick?: (event: CalendarEvent) => void
  onDateClick?: (date: Date) => void
  onTimeSlotClick?: (date: Date, hour: number) => void
}

export function CalendarBody({
  onEventClick,
  onDateClick,
  onTimeSlotClick,
}: CalendarBodyProps) {
  const { view } = useCalendar()

  switch (view) {
    case "month":
      return <MonthView onEventClick={onEventClick} onDateClick={onDateClick} />
    case "week":
      return <WeekView onEventClick={onEventClick} onTimeSlotClick={onTimeSlotClick} />
    case "day":
      return <DayView onEventClick={onEventClick} onTimeSlotClick={onTimeSlotClick} />
    case "year":
      return <YearView onEventClick={onEventClick} onDateClick={onDateClick} />
    case "agenda":
      return <AgendaView onEventClick={onEventClick} />
    default:
      return <MonthView onEventClick={onEventClick} onDateClick={onDateClick} />
  }
}
