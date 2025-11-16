"use client"

import { useEffect, useState } from "react"
import { useHeaderContext } from "@/components/header-context"
import { mockManifests } from "@/lib/travelwiz-data"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Plane, Ship, Filter, MoreVertical, Users, Package, Clock, MapPin, Plus } from "lucide-react"

export function ManifestsContent() {
  const { setContextualHeader, clearContextualHeader } = useHeaderContext()
  const [searchQuery, setSearchQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [showNewDialog, setShowNewDialog] = useState(false)

  useEffect(() => {
    setContextualHeader({
      searchPlaceholder: "Search manifests...",
      onSearchChange: setSearchQuery,
      contextualButtons: [
        {
          label: "New Manifest",
          icon: Plus,
          onClick: () => setShowNewDialog(true),
          variant: "default",
        },
      ],
    })

    return () => clearContextualHeader()
  }, [setContextualHeader, clearContextualHeader])

  const filteredManifests = mockManifests.filter((manifest) => {
    const matchesSearch =
      manifest.reference.toLowerCase().includes(searchQuery.toLowerCase()) ||
      manifest.route.from.toLowerCase().includes(searchQuery.toLowerCase()) ||
      manifest.route.to.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesStatus = statusFilter === "all" || manifest.status === statusFilter
    return matchesSearch && matchesStatus
  })

  const getStatusColor = (status: string) => {
    switch (status) {
      case "confirmed":
        return "bg-blue-500/10 text-blue-600 dark:text-blue-400"
      case "departed":
        return "bg-purple-500/10 text-purple-600 dark:text-purple-400"
      case "arrived":
        return "bg-green-500/10 text-green-600 dark:text-green-400"
      case "draft":
        return "bg-gray-500/10 text-gray-600 dark:text-gray-400"
      case "cancelled":
        return "bg-red-500/10 text-red-600 dark:text-red-400"
      default:
        return "bg-gray-500/10 text-gray-600 dark:text-gray-400"
    }
  }

  const getTypeIcon = (type: string) => {
    return type === "helicopter" ? <Plane className="h-3.5 w-3.5" /> : <Ship className="h-3.5 w-3.5" />
  }

  return (
    <div className="flex h-full flex-col gap-2 p-3">
      {/* Toolbar */}
      <div className="flex items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-7 gap-1 text-[11px] bg-transparent">
              <Filter className="h-3 w-3" />
              Status
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setStatusFilter("all")}>All Statuses</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setStatusFilter("draft")}>Draft</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setStatusFilter("confirmed")}>Confirmed</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setStatusFilter("departed")}>Departed</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setStatusFilter("arrived")}>Arrived</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Manifests Grid */}
      <div className="grid flex-1 gap-2 overflow-auto md:grid-cols-2 lg:grid-cols-3">
        {filteredManifests.map((manifest) => (
          <div
            key={manifest.id}
            className="flex h-fit flex-col gap-1.5 rounded-md border bg-card p-2 text-card-foreground shadow-sm transition-shadow hover:shadow-md"
          >
            {/* Header */}
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <div className="flex h-6 w-6 items-center justify-center rounded bg-primary/10 text-primary">
                  {getTypeIcon(manifest.type)}
                </div>
                <div className="flex flex-col">
                  <span className="text-[11px] font-medium leading-tight">{manifest.reference}</span>
                  <span className="text-[9px] text-muted-foreground">{manifest.id}</span>
                </div>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-5 w-5 p-0">
                    <MoreVertical className="h-3 w-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem>View Details</DropdownMenuItem>
                  <DropdownMenuItem>Edit</DropdownMenuItem>
                  <DropdownMenuItem>Print</DropdownMenuItem>
                  <DropdownMenuItem className="text-destructive">Cancel</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {/* Route */}
            <div className="flex items-center gap-1.5 rounded bg-muted/50 p-1.5">
              <MapPin className="h-3 w-3 text-muted-foreground" />
              <span className="text-[10px] font-medium">
                {manifest.route.from} → {manifest.route.to}
              </span>
            </div>

            {/* Status & Departure */}
            <div className="flex items-center justify-between gap-2">
              <Badge className={`h-4 text-[9px] ${getStatusColor(manifest.status)}`}>{manifest.status}</Badge>
              <div className="flex items-center gap-1 text-[9px] text-muted-foreground">
                <Clock className="h-3 w-3" />
                {new Date(manifest.departure).toLocaleString("en-US", {
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </div>
            </div>

            {/* Capacity */}
            <div className="flex items-center justify-between gap-2 rounded bg-muted/30 p-1.5">
              <div className="flex items-center gap-1">
                <Users className="h-3 w-3 text-muted-foreground" />
                <span className="text-[10px]">
                  {manifest.occupied}/{manifest.capacity}
                </span>
              </div>
              <div className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-primary"
                  style={{
                    width: `${(manifest.occupied / manifest.capacity) * 100}%`,
                  }}
                />
              </div>
              <span className="text-[9px] text-muted-foreground">
                {Math.round((manifest.occupied / manifest.capacity) * 100)}%
              </span>
            </div>

            {/* Cargo */}
            <div className="flex items-center gap-1.5 text-[10px]">
              <Package className="h-3 w-3 text-muted-foreground" />
              <span>
                {manifest.cargo.weight}kg • {manifest.cargo.items} items
              </span>
            </div>

            {/* Crew */}
            <div className="border-t pt-1.5 text-[9px] text-muted-foreground">
              <div>Pilot: {manifest.crew.pilot}</div>
              {manifest.crew.copilot && <div>Co-pilot: {manifest.crew.copilot}</div>}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
