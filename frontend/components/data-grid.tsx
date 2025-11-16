"use client"

import * as React from "react"
import { Package, MapPin, Clock, MoreVertical } from "lucide-react"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Checkbox } from "@/components/ui/checkbox"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { useFilters } from "./filter-context"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { mockShipments, type Shipment } from "@/lib/mock-data"

const getStatusVariant = (status: Shipment["status"]) => {
  switch (status) {
    case "in-transit":
      return "default"
    case "delivered":
      return "secondary"
    case "delayed":
      return "destructive"
    default:
      return "outline"
  }
}

const getStatusLabel = (status: Shipment["status"]) => {
  switch (status) {
    case "in-transit":
      return "En Transit"
    case "delivered":
      return "Livré"
    case "pending":
      return "En Attente"
    case "delayed":
      return "Retardé"
    case "cancelled":
      return "Annulé"
  }
}

const getPriorityLabel = (priority: Shipment["priority"]) => {
  switch (priority) {
    case "urgent":
      return "Urgent"
    case "high":
      return "Haute"
    case "medium":
      return "Moyenne"
    case "low":
      return "Basse"
  }
}

export function DataGrid() {
  const [selectedItems, setSelectedItems] = React.useState<string[]>([])
  const { addFilter } = useFilters()

  const toggleSelection = (id: string) => {
    setSelectedItems((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]))
  }

  const handleStatusClick = (status: string) => {
    addFilter({ label: "Statut", value: status, type: "status" })
  }

  const handlePriorityClick = (priority: string) => {
    addFilter({ label: "Priorité", value: priority, type: "priority" })
  }

  const handleTagClick = (tag: string) => {
    addFilter({ label: "Tag", value: tag, type: "tag" })
  }

  const handleCarrierClick = (carrier: string) => {
    addFilter({ label: "Transporteur", value: carrier, type: "carrier" })
  }

  return (
    <TooltipProvider>
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-7 gap-1.5">
        {mockShipments.map((shipment) => (
          <Card key={shipment.id} className="group hover:shadow-md transition-shadow cursor-pointer relative">
            <CardHeader className="p-1.5 pb-1">
              <div className="flex items-start justify-between gap-1.5">
                <div className="flex items-start gap-1.5 flex-1 min-w-0">
                  <Checkbox
                    checked={selectedItems.includes(shipment.id)}
                    onCheckedChange={() => toggleSelection(shipment.id)}
                    className="mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity h-3 w-3"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1 mb-0.5">
                      <Package className="h-3 w-3 text-primary shrink-0" />
                      <span className="text-[9px] font-mono text-muted-foreground">{shipment.reference}</span>
                    </div>
                    <h3 className="font-semibold text-[11px] leading-tight line-clamp-2">{shipment.title}</h3>
                  </div>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <MoreVertical className="h-2.5 w-2.5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem>Voir détails</DropdownMenuItem>
                    <DropdownMenuItem>Modifier</DropdownMenuItem>
                    <DropdownMenuItem>Dupliquer</DropdownMenuItem>
                    <DropdownMenuItem className="text-destructive">Supprimer</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </CardHeader>
            <CardContent className="p-1.5 pt-0 space-y-1">
              <div className="flex items-center gap-1.5 flex-wrap">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge
                      variant={getStatusVariant(shipment.status)}
                      className="text-[10px] h-4 px-1.5 cursor-pointer hover:opacity-80 transition-opacity"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleStatusClick(getStatusLabel(shipment.status))
                      }}
                    >
                      {getStatusLabel(shipment.status)}
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="text-xs">Filtrer par statut: {getStatusLabel(shipment.status)}</p>
                  </TooltipContent>
                </Tooltip>
                {(shipment.priority === "urgent" || shipment.priority === "high") && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Badge
                        variant={shipment.priority === "urgent" ? "destructive" : "default"}
                        className="text-[10px] h-4 px-1.5 cursor-pointer hover:opacity-80 transition-opacity"
                        onClick={(e) => {
                          e.stopPropagation()
                          handlePriorityClick(getPriorityLabel(shipment.priority))
                        }}
                      >
                        {getPriorityLabel(shipment.priority)}
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="text-xs">Filtrer par priorité: {getPriorityLabel(shipment.priority)}</p>
                    </TooltipContent>
                  </Tooltip>
                )}
              </div>
              <div className="space-y-1 text-[10px]">
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <MapPin className="h-3 w-3 shrink-0" />
                  <span className="truncate">
                    {shipment.origin} → {shipment.destination}
                  </span>
                </div>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div
                      className="flex items-center gap-1.5 text-muted-foreground cursor-pointer hover:text-foreground transition-colors"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleCarrierClick(shipment.carrier)
                      }}
                    >
                      <Package className="h-3 w-3 shrink-0" />
                      <span className="truncate">{shipment.carrier}</span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="text-xs">Filtrer par transporteur: {shipment.carrier}</p>
                  </TooltipContent>
                </Tooltip>
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <Clock className="h-3 w-3 shrink-0" />
                  <span>{shipment.estimatedDelivery.toLocaleDateString("fr-FR")}</span>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex flex-wrap gap-1">
                  {shipment.tags.slice(0, 2).map((tag) => (
                    <Tooltip key={tag}>
                      <TooltipTrigger asChild>
                        <Badge
                          variant="outline"
                          className="text-[9px] h-4 px-1 cursor-pointer hover:bg-accent transition-colors"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleTagClick(tag)
                          }}
                        >
                          {tag}
                        </Badge>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="text-xs">Filtrer par tag: {tag}</p>
                      </TooltipContent>
                    </Tooltip>
                  ))}
                  {shipment.tags.length > 2 && (
                    <Badge variant="outline" className="text-[9px] h-4 px-1">
                      +{shipment.tags.length - 2}
                    </Badge>
                  )}
                </div>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Avatar className="h-4 w-4">
                      <AvatarFallback className="text-[8px]">{shipment.assignee.avatar}</AvatarFallback>
                    </Avatar>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="text-xs">{shipment.assignee.name}</p>
                  </TooltipContent>
                </Tooltip>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </TooltipProvider>
  )
}
