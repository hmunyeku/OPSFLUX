"use client"

import { useState } from "react"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Button } from "@/components/ui/button"
import { Calendar as CalendarIcon, Clock } from "lucide-react"
import { Calendar } from "@/components/ui/calendar"
import { fr } from "date-fns/locale"
import { Separator } from "@/components/ui/separator"

interface Event {
  id: string
  title: string
  time: string
  type: "meeting" | "deadline" | "reminder"
}

// Données de démo
const mockEvents: Event[] = [
  { id: "1", title: "Réunion d'équipe", time: "10:00", type: "meeting" },
  { id: "2", title: "Date limite projet X", time: "17:00", type: "deadline" },
]

export function CalendarButton() {
  const [date, setDate] = useState<Date | undefined>(new Date())
  const [open, setOpen] = useState(false)

  const getEventColor = (type: Event["type"]) => {
    switch (type) {
      case "meeting":
        return "bg-blue-500"
      case "deadline":
        return "bg-red-500"
      case "reminder":
        return "bg-yellow-500"
      default:
        return "bg-gray-500"
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" title="Calendrier">
          <CalendarIcon className="h-5 w-5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="end">
        <div className="p-4">
          <h4 className="font-semibold text-sm mb-3">Calendrier</h4>
          <Calendar
            mode="single"
            selected={date}
            onSelect={setDate}
            locale={fr}
            className="rounded-md border"
          />
        </div>

        {mockEvents.length > 0 && (
          <>
            <Separator />
            <div className="p-4">
              <h4 className="font-semibold text-sm mb-2 flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Événements du jour
              </h4>
              <div className="space-y-2">
                {mockEvents.map((event) => (
                  <div
                    key={event.id}
                    className="flex items-start gap-2 p-2 rounded-lg hover:bg-accent cursor-pointer transition-colors"
                  >
                    <div className={`h-2 w-2 rounded-full mt-1.5 ${getEventColor(event.type)}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{event.title}</p>
                      <p className="text-xs text-muted-foreground">{event.time}</p>
                    </div>
                  </div>
                ))}
              </div>
              <Button
                variant="outline"
                size="sm"
                className="w-full mt-3"
                onClick={() => setOpen(false)}
              >
                Voir tous les événements
              </Button>
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  )
}
