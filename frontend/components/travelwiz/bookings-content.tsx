"use client"

import { useEffect, useState } from "react"
import { useHeaderContext } from "@/components/header-context"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Plane, Ship, Car, Plus, Filter } from "lucide-react"

const mockBookings = [
  {
    id: "1",
    type: "helicopter",
    passenger: "Jean Dupont",
    from: "Base",
    to: "Platform Alpha",
    date: "2025-02-15",
    status: "confirmed",
  },
  {
    id: "2",
    type: "boat",
    passenger: "Marie Martin",
    from: "Port",
    to: "Subsea Site",
    date: "2025-02-20",
    status: "pending",
  },
  {
    id: "3",
    type: "vehicle",
    passenger: "Pierre Bernard",
    from: "Office",
    to: "Workshop",
    date: "2025-02-18",
    status: "confirmed",
  },
]

const typeIcons = { helicopter: Plane, boat: Ship, vehicle: Car }
const statusColors = {
  confirmed: "bg-green-500/10 text-green-700",
  pending: "bg-yellow-500/10 text-yellow-700",
  cancelled: "bg-red-500/10 text-red-700",
}

export function BookingsContent() {
  const { setContextualHeader, clearContextualHeader } = useHeaderContext()
  const [searchQuery, setSearchQuery] = useState("")
  const [showNewDialog, setShowNewDialog] = useState(false)

  useEffect(() => {
    setContextualHeader({
      searchPlaceholder: "Rechercher réservations...",
      onSearchChange: setSearchQuery,
      contextualButtons: [
        {
          label: "Filtres",
          icon: Filter,
          onClick: () => {},
          variant: "outline",
        },
        {
          label: "Nouvelle réservation",
          icon: Plus,
          onClick: () => setShowNewDialog(true),
          variant: "default",
        },
      ],
    })

    return () => clearContextualHeader()
  }, [setContextualHeader, clearContextualHeader])

  return (
    <div className="flex h-full flex-col gap-2 p-2">
      <div className="flex-1 overflow-auto space-y-1">
        {mockBookings.map((booking) => {
          const Icon = typeIcons[booking.type as keyof typeof typeIcons]
          return (
            <Card key={booking.id} className="flex items-center gap-3 p-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10">
                <Icon className="h-4 w-4 text-primary" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="text-xs font-semibold">{booking.passenger}</h3>
                  <Badge
                    variant="secondary"
                    className={`h-4 px-1.5 text-[9px] ${statusColors[booking.status as keyof typeof statusColors]}`}
                  >
                    {booking.status}
                  </Badge>
                </div>
                <p className="text-[10px] text-muted-foreground">
                  {booking.from} → {booking.to} • {new Date(booking.date).toLocaleDateString("fr-FR")}
                </p>
              </div>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
