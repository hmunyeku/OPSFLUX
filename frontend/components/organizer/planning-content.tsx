"use client"

import { useState } from "react"
import { mockPlanningEvents, type PlanningEvent } from "@/lib/organizer-data"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Calendar, ChevronLeft, ChevronRight, Plus, Filter, List, Grid3x3, Clock, MapPin, Users } from "lucide-react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

const statusColors = {
  scheduled: "bg-blue-500/10 text-blue-700 dark:text-blue-400",
  "in-progress": "bg-green-500/10 text-green-700 dark:text-green-400",
  completed: "bg-gray-500/10 text-gray-700 dark:text-gray-400",
  delayed: "bg-red-500/10 text-red-700 dark:text-red-400",
}

const typeColors = {
  milestone: "bg-purple-500/10 text-purple-700 dark:text-purple-400",
  task: "bg-blue-500/10 text-blue-700 dark:text-blue-400",
  meeting: "bg-green-500/10 text-green-700 dark:text-green-400",
  delivery: "bg-orange-500/10 text-orange-700 dark:text-orange-400",
}

export function PlanningContent() {
  const [currentDate, setCurrentDate] = useState(new Date(2025, 1, 1))
  const [events] = useState<PlanningEvent[]>(mockPlanningEvents)
  const [viewMode, setViewMode] = useState<"month" | "week" | "day" | "agenda">("month")
  const [selectedEvent, setSelectedEvent] = useState<PlanningEvent | null>(null)

  const getCalendarData = () => {
    if (viewMode === "month") {
      const daysInMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate()
      const firstDayOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1).getDay()
      return { daysInMonth, firstDayOfMonth }
    } else if (viewMode === "week") {
      // Get current week
      const startOfWeek = new Date(currentDate)
      startOfWeek.setDate(currentDate.getDate() - currentDate.getDay() + 1)
      return { startOfWeek }
    }
    return {}
  }

  const calendarData = getCalendarData()
  const monthName = currentDate.toLocaleDateString("fr-FR", { month: "long", year: "numeric" })

  const navigateCalendar = (direction: "prev" | "next") => {
    const newDate = new Date(currentDate)
    if (viewMode === "month") {
      newDate.setMonth(newDate.getMonth() + (direction === "next" ? 1 : -1))
    } else if (viewMode === "week") {
      newDate.setDate(newDate.getDate() + (direction === "next" ? 7 : -7))
    } else if (viewMode === "day") {
      newDate.setDate(newDate.getDate() + (direction === "next" ? 1 : -1))
    }
    setCurrentDate(newDate)
  }

  const renderMonthView = () => {
    if (!calendarData.daysInMonth) return null

    return (
      <div className="grid grid-cols-7 gap-1">
        {["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"].map((day) => (
          <div key={day} className="p-1 text-center text-[10px] font-semibold text-muted-foreground">
            {day}
          </div>
        ))}

        {Array.from({ length: calendarData.firstDayOfMonth === 0 ? 6 : calendarData.firstDayOfMonth - 1 }).map(
          (_, i) => (
            <div key={`empty-${i}`} className="min-h-[100px] rounded-md bg-muted/30 p-1" />
          ),
        )}

        {Array.from({ length: calendarData.daysInMonth }).map((_, i) => {
          const day = i + 1
          const dateStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`
          const dayEvents = events.filter((e) => e.startDate === dateStr || e.endDate === dateStr)
          const isToday = day === new Date().getDate() && currentDate.getMonth() === new Date().getMonth()

          return (
            <div
              key={day}
              className={`min-h-[100px] rounded-md border p-1 transition-colors hover:bg-muted/50 ${isToday ? "border-primary bg-primary/5" : "bg-background"}`}
            >
              <div className={`mb-1 text-[10px] font-semibold ${isToday ? "text-primary" : "text-muted-foreground"}`}>
                {day}
              </div>
              <div className="space-y-0.5">
                {dayEvents.slice(0, 3).map((event) => (
                  <div
                    key={event.id}
                    onClick={() => setSelectedEvent(event)}
                    className={`cursor-pointer rounded px-1 py-0.5 text-[9px] transition-colors hover:opacity-80 ${typeColors[event.type]}`}
                  >
                    <div className="truncate font-medium">{event.title}</div>
                  </div>
                ))}
                {dayEvents.length > 3 && (
                  <div className="text-[8px] text-muted-foreground">+{dayEvents.length - 3} plus</div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  const renderWeekView = () => {
    if (!calendarData.startOfWeek) return null

    const weekDays = Array.from({ length: 7 }).map((_, i) => {
      const date = new Date(calendarData.startOfWeek)
      date.setDate(date.getDate() + i)
      return date
    })

    const hours = Array.from({ length: 24 }).map((_, i) => i)

    return (
      <div className="flex flex-col">
        {/* Week header */}
        <div className="grid grid-cols-8 gap-1 border-b pb-2">
          <div className="text-[10px] font-semibold text-muted-foreground">Heure</div>
          {weekDays.map((date, i) => (
            <div key={i} className="text-center">
              <div className="text-[10px] font-semibold">{date.toLocaleDateString("fr-FR", { weekday: "short" })}</div>
              <div className="text-xs">{date.getDate()}</div>
            </div>
          ))}
        </div>

        {/* Week grid */}
        <div className="flex-1 overflow-auto">
          <div className="grid grid-cols-8 gap-1">
            {hours.map((hour) => (
              <>
                <div key={`hour-${hour}`} className="border-r p-1 text-[10px] text-muted-foreground">
                  {String(hour).padStart(2, "0")}:00
                </div>
                {weekDays.map((date, i) => (
                  <div key={`${hour}-${i}`} className="min-h-[40px] border-b border-r p-0.5">
                    {/* Events would be positioned here based on time */}
                  </div>
                ))}
              </>
            ))}
          </div>
        </div>
      </div>
    )
  }

  const renderAgendaView = () => {
    const sortedEvents = [...events].sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime())

    return (
      <div className="space-y-2">
        {sortedEvents.map((event) => (
          <Card
            key={event.id}
            className="p-3 transition-colors hover:bg-muted/50 cursor-pointer"
            onClick={() => setSelectedEvent(event)}
          >
            <div className="flex items-start gap-3">
              <div className="flex flex-col items-center gap-1">
                <div className="text-xs font-bold">{new Date(event.startDate).getDate()}</div>
                <div className="text-[10px] text-muted-foreground">
                  {new Date(event.startDate).toLocaleDateString("fr-FR", { month: "short" })}
                </div>
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <h4 className="text-sm font-semibold">{event.title}</h4>
                  <Badge variant="secondary" className={`h-4 px-1.5 text-[9px] ${typeColors[event.type]}`}>
                    {event.type}
                  </Badge>
                  <Badge variant="secondary" className={`h-4 px-1.5 text-[9px] ${statusColors[event.status]}`}>
                    {event.status}
                  </Badge>
                </div>
                <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {new Date(event.startDate).toLocaleTimeString("fr-FR", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </div>
                  <div className="flex items-center gap-1">
                    <MapPin className="h-3 w-3" />
                    {event.project}
                  </div>
                  <div className="flex items-center gap-1">
                    <Users className="h-3 w-3" />
                    {event.assignees.length} participants
                  </div>
                </div>
              </div>
            </div>
          </Card>
        ))}
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col gap-2 p-2">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-8 w-8 p-0 bg-transparent"
            onClick={() => navigateCalendar("prev")}
          >
            <ChevronLeft className="h-3 w-3" />
          </Button>
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-semibold capitalize">{monthName}</span>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-8 w-8 p-0 bg-transparent"
            onClick={() => navigateCalendar("next")}
          >
            <ChevronRight className="h-3 w-3" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs bg-transparent"
            onClick={() => setCurrentDate(new Date())}
          >
            Aujourd'hui
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <Tabs value={viewMode} onValueChange={(v: any) => setViewMode(v)} className="w-auto">
            <TabsList className="h-8">
              <TabsTrigger value="month" className="h-6 text-xs">
                <Grid3x3 className="h-3 w-3 mr-1" />
                Mois
              </TabsTrigger>
              <TabsTrigger value="week" className="h-6 text-xs">
                <List className="h-3 w-3 mr-1" />
                Semaine
              </TabsTrigger>
              <TabsTrigger value="agenda" className="h-6 text-xs">
                <List className="h-3 w-3 mr-1" />
                Agenda
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <Select defaultValue="all">
            <SelectTrigger className="h-8 w-[140px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les projets</SelectItem>
              <SelectItem value="1">Offshore Platform</SelectItem>
              <SelectItem value="2">Subsea Pipeline</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs bg-transparent">
            <Filter className="h-3 w-3" />
            Filtres
          </Button>

          <Sheet>
            <SheetTrigger asChild>
              <Button size="sm" className="h-8 gap-1.5 text-xs">
                <Plus className="h-3 w-3" />
                Nouvel événement
              </Button>
            </SheetTrigger>
            <SheetContent>
              <SheetHeader>
                <SheetTitle>Nouvel événement</SheetTitle>
              </SheetHeader>
              <div className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label htmlFor="title">Titre</Label>
                  <Input id="title" placeholder="Titre de l'événement" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="type">Type</Label>
                  <Select>
                    <SelectTrigger id="type">
                      <SelectValue placeholder="Sélectionner un type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="milestone">Jalon</SelectItem>
                      <SelectItem value="task">Tâche</SelectItem>
                      <SelectItem value="meeting">Réunion</SelectItem>
                      <SelectItem value="delivery">Livraison</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">Description</Label>
                  <Textarea id="description" placeholder="Description de l'événement" />
                </div>
                <Button className="w-full">Créer l'événement</Button>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>

      {/* Calendar Views */}
      <Card className="flex-1 overflow-auto p-2">
        {viewMode === "month" && renderMonthView()}
        {viewMode === "week" && renderWeekView()}
        {viewMode === "agenda" && renderAgendaView()}
      </Card>

      <Sheet open={!!selectedEvent} onOpenChange={(open) => !open && setSelectedEvent(null)}>
        <SheetContent>
          {selectedEvent && (
            <>
              <SheetHeader>
                <SheetTitle>{selectedEvent.title}</SheetTitle>
              </SheetHeader>
              <div className="space-y-4 mt-4">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className={`${typeColors[selectedEvent.type]}`}>
                    {selectedEvent.type}
                  </Badge>
                  <Badge variant="secondary" className={`${statusColors[selectedEvent.status]}`}>
                    {selectedEvent.status}
                  </Badge>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <span>
                      {new Date(selectedEvent.startDate).toLocaleDateString("fr-FR")} -{" "}
                      {new Date(selectedEvent.endDate).toLocaleDateString("fr-FR")}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                    <span>{selectedEvent.project}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <Users className="h-4 w-4 text-muted-foreground" />
                    <div className="flex -space-x-1">
                      {selectedEvent.assignees.map((assignee, i) => (
                        <Avatar key={i} className="h-6 w-6 border-2 border-background">
                          <AvatarFallback className="text-[10px]">
                            {assignee
                              .split(" ")
                              .map((n) => n[0])
                              .join("")}
                          </AvatarFallback>
                        </Avatar>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1 bg-transparent">
                    Modifier
                  </Button>
                  <Button variant="destructive" className="flex-1">
                    Supprimer
                  </Button>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}
