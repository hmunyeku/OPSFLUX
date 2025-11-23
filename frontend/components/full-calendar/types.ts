export type CalendarView = "month" | "week" | "day" | "year" | "agenda"

export interface CalendarUser {
  id: string
  name: string
  initials: string
  color: string
}

export interface CalendarEvent {
  id: string
  title: string
  description?: string
  start: Date
  end: Date
  allDay?: boolean
  color?: string
  userId?: string
  projectId?: string
  taskId?: string
  location?: string
  type?: "task" | "meeting" | "deadline" | "milestone" | "event"
}

export interface CalendarContextType {
  currentDate: Date
  setCurrentDate: (date: Date) => void
  view: CalendarView
  setView: (view: CalendarView) => void
  events: CalendarEvent[]
  setEvents: React.Dispatch<React.SetStateAction<CalendarEvent[]>>
  selectedEvent: CalendarEvent | null
  setSelectedEvent: (event: CalendarEvent | null) => void
  users: CalendarUser[]
  filteredUserIds: string[]
  setFilteredUserIds: (ids: string[]) => void
}

export const eventColors: Record<string, { bg: string; border: string; text: string }> = {
  blue: { bg: "bg-blue-100 dark:bg-blue-900/30", border: "border-l-blue-500", text: "text-blue-700 dark:text-blue-300" },
  green: { bg: "bg-emerald-100 dark:bg-emerald-900/30", border: "border-l-emerald-500", text: "text-emerald-700 dark:text-emerald-300" },
  red: { bg: "bg-red-100 dark:bg-red-900/30", border: "border-l-red-500", text: "text-red-700 dark:text-red-300" },
  orange: { bg: "bg-orange-100 dark:bg-orange-900/30", border: "border-l-orange-500", text: "text-orange-700 dark:text-orange-300" },
  purple: { bg: "bg-purple-100 dark:bg-purple-900/30", border: "border-l-purple-500", text: "text-purple-700 dark:text-purple-300" },
  yellow: { bg: "bg-yellow-100 dark:bg-yellow-900/30", border: "border-l-yellow-500", text: "text-yellow-700 dark:text-yellow-300" },
  cyan: { bg: "bg-cyan-100 dark:bg-cyan-900/30", border: "border-l-cyan-500", text: "text-cyan-700 dark:text-cyan-300" },
  pink: { bg: "bg-pink-100 dark:bg-pink-900/30", border: "border-l-pink-500", text: "text-pink-700 dark:text-pink-300" },
}

export const getEventColors = (color: string = "blue") => {
  return eventColors[color] || eventColors.blue
}
