"use client"

import { useState } from "react"
import { mockResources, type Resource } from "@/lib/organizer-data"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import { Search, Plus, Filter, MapPin, Wrench, Grid3x3, List, MoreVertical } from "lucide-react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"

type ViewMode = "grid" | "list"

const statusColors = {
  available: "bg-green-500/10 text-green-700 dark:text-green-400",
  "in-use": "bg-blue-500/10 text-blue-700 dark:text-blue-400",
  maintenance: "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400",
  unavailable: "bg-red-500/10 text-red-700 dark:text-red-400",
}

const typeIcons = {
  equipment: Wrench,
  vehicle: MapPin,
  material: Grid3x3,
}

export function ResourcesContent() {
  const [viewMode, setViewMode] = useState<ViewMode>("grid")
  const [searchQuery, setSearchQuery] = useState("")
  const [resources] = useState<Resource[]>(mockResources)

  const filteredResources = resources.filter(
    (resource) =>
      resource.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      resource.location.toLowerCase().includes(searchQuery.toLowerCase()),
  )

  return (
    <div className="flex h-full flex-col gap-2 p-2">
      {/* Toolbar */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Rechercher ressources..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-8 pl-8 text-xs"
          />
        </div>
        <Select defaultValue="all">
          <SelectTrigger className="h-8 w-[120px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous types</SelectItem>
            <SelectItem value="equipment">Équipements</SelectItem>
            <SelectItem value="vehicle">Véhicules</SelectItem>
            <SelectItem value="material">Matériaux</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs bg-transparent">
          <Filter className="h-3 w-3" />
          Filtres
        </Button>
        <div className="flex items-center gap-0.5 rounded-md border p-0.5">
          <Button
            variant={viewMode === "grid" ? "secondary" : "ghost"}
            size="sm"
            className="h-6 w-6 p-0"
            onClick={() => setViewMode("grid")}
          >
            <Grid3x3 className="h-3 w-3" />
          </Button>
          <Button
            variant={viewMode === "list" ? "secondary" : "ghost"}
            size="sm"
            className="h-6 w-6 p-0"
            onClick={() => setViewMode("list")}
          >
            <List className="h-3 w-3" />
          </Button>
        </div>
        <Button size="sm" className="h-8 gap-1.5 text-xs">
          <Plus className="h-3 w-3" />
          Nouvelle ressource
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-2">
        <Card className="p-2">
          <div className="text-[10px] text-muted-foreground">Total Ressources</div>
          <div className="text-xl font-bold">{resources.length}</div>
        </Card>
        <Card className="p-2">
          <div className="text-[10px] text-muted-foreground">Disponibles</div>
          <div className="text-xl font-bold text-green-600">
            {resources.filter((r) => r.status === "available").length}
          </div>
        </Card>
        <Card className="p-2">
          <div className="text-[10px] text-muted-foreground">En Utilisation</div>
          <div className="text-xl font-bold text-blue-600">{resources.filter((r) => r.status === "in-use").length}</div>
        </Card>
        <Card className="p-2">
          <div className="text-[10px] text-muted-foreground">Taux Moyen</div>
          <div className="text-xl font-bold">
            {(resources.reduce((sum, r) => sum + r.utilizationRate, 0) / resources.length).toFixed(0)}%
          </div>
        </Card>
      </div>

      {/* Resources */}
      <div className="flex-1 overflow-auto">
        {viewMode === "grid" ? (
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filteredResources.map((resource) => {
              const Icon = typeIcons[resource.type]
              return (
                <Card
                  key={resource.id}
                  className="group relative flex flex-col gap-2 p-2 transition-all hover:shadow-md"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10">
                        <Icon className="h-4 w-4 text-primary" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="truncate text-xs font-semibold">{resource.name}</h3>
                        <p className="text-[10px] capitalize text-muted-foreground">{resource.type}</p>
                      </div>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100">
                          <MoreVertical className="h-3 w-3" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem className="text-xs">Voir détails</DropdownMenuItem>
                        <DropdownMenuItem className="text-xs">Modifier</DropdownMenuItem>
                        <DropdownMenuItem className="text-xs">Planifier maintenance</DropdownMenuItem>
                        <DropdownMenuItem className="text-xs text-destructive">Retirer</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  <Badge variant="secondary" className={`h-4 w-fit px-1.5 text-[9px] ${statusColors[resource.status]}`}>
                    {resource.status}
                  </Badge>

                  <div className="space-y-1 text-[10px] text-muted-foreground">
                    <div className="flex items-center gap-1.5">
                      <MapPin className="h-3 w-3 shrink-0" />
                      <span className="truncate">{resource.location}</span>
                    </div>
                    {resource.assignedTo && (
                      <div className="truncate">
                        <span className="font-medium">Assigné:</span> {resource.assignedTo}
                      </div>
                    )}
                    {resource.nextMaintenance && (
                      <div className="flex items-center gap-1.5">
                        <Wrench className="h-3 w-3 shrink-0" />
                        <span>Maintenance: {new Date(resource.nextMaintenance).toLocaleDateString("fr-FR")}</span>
                      </div>
                    )}
                  </div>

                  <div className="mt-auto space-y-1 border-t pt-2">
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="text-muted-foreground">Utilisation</span>
                      <span className="font-medium">{resource.utilizationRate}%</span>
                    </div>
                    <Progress value={resource.utilizationRate} className="h-1" />
                  </div>
                </Card>
              )
            })}
          </div>
        ) : (
          <div className="space-y-1">
            {filteredResources.map((resource) => {
              const Icon = typeIcons[resource.type]
              return (
                <Card key={resource.id} className="group flex items-center gap-3 p-2 transition-all hover:shadow-md">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10">
                    <Icon className="h-4 w-4 text-primary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="text-xs font-semibold">{resource.name}</h3>
                      <Badge variant="secondary" className={`h-4 px-1.5 text-[9px] ${statusColors[resource.status]}`}>
                        {resource.status}
                      </Badge>
                    </div>
                    <p className="text-[10px] capitalize text-muted-foreground">{resource.type}</p>
                  </div>
                  <div className="flex items-center gap-4 text-[10px]">
                    <div className="flex items-center gap-1 text-muted-foreground">
                      <MapPin className="h-3 w-3" />
                      <span>{resource.location}</span>
                    </div>
                    {resource.assignedTo && (
                      <span className="text-muted-foreground">Assigné: {resource.assignedTo}</span>
                    )}
                    <div className="w-24">
                      <div className="mb-0.5 flex items-center justify-between">
                        <span className="text-muted-foreground">Utilisation</span>
                        <span className="font-medium">{resource.utilizationRate}%</span>
                      </div>
                      <Progress value={resource.utilizationRate} className="h-1" />
                    </div>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                        <MoreVertical className="h-3 w-3" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem className="text-xs">Voir détails</DropdownMenuItem>
                      <DropdownMenuItem className="text-xs">Modifier</DropdownMenuItem>
                      <DropdownMenuItem className="text-xs">Planifier maintenance</DropdownMenuItem>
                      <DropdownMenuItem className="text-xs text-destructive">Retirer</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </Card>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
