"use client"

import * as React from "react"
import { Package, MapPin, MoreVertical } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { useFilters } from "./filter-context"
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

export function DataList() {
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
      <div className="w-full border rounded-lg bg-card overflow-hidden">
        <div className="sticky top-0 z-10 grid grid-cols-[32px_100px_1fr_120px_160px_100px_130px_50px_32px] gap-2 px-3 py-2 border-b bg-muted/50 text-[10px] font-medium text-muted-foreground">
          <div>
            <Checkbox />
          </div>
          <div>Référence</div>
          <div>Expédition</div>
          <div>Statut</div>
          <div>Route</div>
          <div>Transporteur</div>
          <div>Tags</div>
          <div>Assigné</div>
          <div></div>
        </div>

        <div>
          {mockShipments.map((shipment, index) => (
            <div
              key={shipment.id}
              className={`grid grid-cols-[32px_100px_1fr_120px_160px_100px_130px_50px_32px] gap-2 px-3 py-2 text-xs hover:bg-muted/50 transition-colors cursor-pointer ${
                index % 2 === 0 ? "bg-background" : "bg-muted/20"
              }`}
            >
              <div className="flex items-center">
                <Checkbox
                  checked={selectedItems.includes(shipment.id)}
                  onCheckedChange={() => toggleSelection(shipment.id)}
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
              <div className="flex items-center">
                <span className="font-mono text-xs text-muted-foreground">{shipment.reference}</span>
              </div>
              <div className="flex items-center gap-2 min-w-0">
                <Package className="h-4 w-4 text-primary shrink-0" />
                <span className="font-medium truncate">{shipment.title}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge
                      variant={getStatusVariant(shipment.status)}
                      className="text-[10px] cursor-pointer hover:opacity-80 transition-opacity"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleStatusClick(getStatusLabel(shipment.status))
                      }}
                    >
                      {getStatusLabel(shipment.status)}
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="text-xs">Filtrer par statut</p>
                  </TooltipContent>
                </Tooltip>
                {(shipment.priority === "urgent" || shipment.priority === "high") && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Badge
                        variant={shipment.priority === "urgent" ? "destructive" : "default"}
                        className="text-[10px] cursor-pointer hover:opacity-80 transition-opacity"
                        onClick={(e) => {
                          e.stopPropagation()
                          handlePriorityClick(getPriorityLabel(shipment.priority))
                        }}
                      >
                        {getPriorityLabel(shipment.priority)}
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="text-xs">Filtrer par priorité</p>
                    </TooltipContent>
                  </Tooltip>
                )}
              </div>
              <div className="flex items-center gap-1.5 text-muted-foreground text-xs min-w-0">
                <MapPin className="h-3 w-3 shrink-0" />
                <span className="truncate">
                  {shipment.origin} → {shipment.destination}
                </span>
              </div>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div
                    className="flex items-center gap-1.5 text-muted-foreground text-xs cursor-pointer hover:text-foreground transition-colors"
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
                  <p className="text-xs">Filtrer par transporteur</p>
                </TooltipContent>
              </Tooltip>
              <div className="flex items-center gap-1 flex-wrap">
                {shipment.tags.slice(0, 2).map((tag) => (
                  <Tooltip key={tag}>
                    <TooltipTrigger asChild>
                      <Badge
                        variant="outline"
                        className="text-[10px] h-5 px-1.5 cursor-pointer hover:bg-accent transition-colors"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleTagClick(tag)
                        }}
                      >
                        {tag}
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="text-xs">Filtrer par tag</p>
                    </TooltipContent>
                  </Tooltip>
                ))}
                {shipment.tags.length > 2 && (
                  <Badge variant="outline" className="text-[10px] h-5 px-1.5">
                    +{shipment.tags.length - 2}
                  </Badge>
                )}
              </div>
              <div className="flex items-center justify-center">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Avatar className="h-6 w-6">
                      <AvatarFallback className="text-[10px]">{shipment.assignee.avatar}</AvatarFallback>
                    </Avatar>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="text-xs">{shipment.assignee.name}</p>
                  </TooltipContent>
                </Tooltip>
              </div>
              <div className="flex items-center">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => e.stopPropagation()}>
                      <MoreVertical className="h-3 w-3" />
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
            </div>
          ))}
        </div>
      </div>
    </TooltipProvider>
  )
}
