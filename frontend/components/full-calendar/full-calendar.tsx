"use client"

import { CalendarProvider } from "./calendar-context"
import { CalendarHeader } from "./calendar-header"
import { CalendarBody } from "./calendar-body"
import { CalendarEvent, CalendarUser, CalendarView } from "./types"

interface FullCalendarProps {
  events?: CalendarEvent[]
  users?: CalendarUser[]
  initialView?: CalendarView
  onEventClick?: (event: CalendarEvent) => void
  onDateClick?: (date: Date) => void
  onTimeSlotClick?: (date: Date, hour: number) => void
  onCreateEvent?: () => void
}

export function FullCalendar({
  events = [],
  users = [],
  initialView = "month",
  onEventClick,
  onDateClick,
  onTimeSlotClick,
  onCreateEvent,
}: FullCalendarProps) {
  return (
    <CalendarProvider
      initialEvents={events}
      initialUsers={users}
      initialView={initialView}
    >
      <div className="h-full flex flex-col bg-background rounded-xl border shadow-sm overflow-hidden">
        <CalendarHeader onCreateEvent={onCreateEvent} />
        <div className="flex-1 overflow-hidden">
          <CalendarBody
            onEventClick={onEventClick}
            onDateClick={onDateClick}
            onTimeSlotClick={onTimeSlotClick}
          />
        </div>
      </div>
    </CalendarProvider>
  )
}
