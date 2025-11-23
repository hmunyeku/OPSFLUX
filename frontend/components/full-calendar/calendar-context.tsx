"use client"

import { createContext, useContext, useState, ReactNode } from "react"
import { CalendarContextType, CalendarEvent, CalendarUser, CalendarView } from "./types"

const CalendarContext = createContext<CalendarContextType | undefined>(undefined)

interface CalendarProviderProps {
  children: ReactNode
  initialEvents?: CalendarEvent[]
  initialUsers?: CalendarUser[]
  initialView?: CalendarView
}

export function CalendarProvider({
  children,
  initialEvents = [],
  initialUsers = [],
  initialView = "month",
}: CalendarProviderProps) {
  const [currentDate, setCurrentDate] = useState(new Date())
  const [view, setView] = useState<CalendarView>(initialView)
  const [events, setEvents] = useState<CalendarEvent[]>(initialEvents)
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null)
  const [filteredUserIds, setFilteredUserIds] = useState<string[]>([])

  return (
    <CalendarContext.Provider
      value={{
        currentDate,
        setCurrentDate,
        view,
        setView,
        events,
        setEvents,
        selectedEvent,
        setSelectedEvent,
        users: initialUsers,
        filteredUserIds,
        setFilteredUserIds,
      }}
    >
      {children}
    </CalendarContext.Provider>
  )
}

export function useCalendar() {
  const context = useContext(CalendarContext)
  if (!context) {
    throw new Error("useCalendar must be used within a CalendarProvider")
  }
  return context
}
