"use client"

import { useState } from "react"
import { mockPOBAssignments, type POBAssignment } from "@/lib/organizer-data"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Search, Plus, Filter, MapPin, Calendar, Briefcase, MoreVertical } from "lucide-react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"

const statusColors = {
  scheduled: "bg-blue-500/10 text-blue-700 dark:text-blue-400",
  "on-site": "bg-green-500/10 text-green-700 dark:text-green-400",
  completed: "bg-gray-500/10 text-gray-700 dark:text-gray-400",
  cancelled: "bg-red-500/10 text-red-700 dark:text-red-400",
}

export function POBContent() {
  const [searchQuery, setSearchQuery] = useState("")
  const [assignments] = useState<POBAssignment[]>(mockPOBAssignments)

  const filteredAssignments = assignments.filter(
    (assignment) =>
      assignment.person.toLowerCase().includes(searchQuery.toLowerCase()) ||
      assignment.site.toLowerCase().includes(searchQuery.toLowerCase()) ||
      assignment.project.toLowerCase().includes(searchQuery.toLowerCase()),
  )

  return (
    <div className="flex h-full flex-col gap-2 p-2">
      {/* Toolbar */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Rechercher assignations POB..."
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
            <SelectItem value="all">Tous sites</SelectItem>
            <SelectItem value="alpha">Platform Alpha</SelectItem>
            <SelectItem value="beta">Subsea Site Beta</SelectItem>
            <SelectItem value="gamma">Drilling Site Gamma</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs bg-transparent">
          <Filter className="h-3 w-3" />
          Filtres
        </Button>
        <Button size="sm" className="h-8 gap-1.5 text-xs">
          <Plus className="h-3 w-3" />
          Nouvelle assignation
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-2">
        <Card className="p-2">
          <div className="text-[10px] text-muted-foreground">Total Assignations</div>
          <div className="text-xl font-bold">{assignments.length}</div>
        </Card>
        <Card className="p-2">
          <div className="text-[10px] text-muted-foreground">Sur Site</div>
          <div className="text-xl font-bold text-green-600">
            {assignments.filter((a) => a.status === "on-site").length}
          </div>
        </Card>
        <Card className="p-2">
          <div className="text-[10px] text-muted-foreground">Planifiées</div>
          <div className="text-xl font-bold text-blue-600">
            {assignments.filter((a) => a.status === "scheduled").length}
          </div>
        </Card>
        <Card className="p-2">
          <div className="text-[10px] text-muted-foreground">Sites Actifs</div>
          <div className="text-xl font-bold">{new Set(assignments.map((a) => a.site)).size}</div>
        </Card>
      </div>

      {/* Assignments List */}
      <div className="flex-1 overflow-auto">
        <div className="space-y-1">
          {filteredAssignments.map((assignment) => (
            <Card key={assignment.id} className="group flex items-center gap-3 p-2 transition-all hover:shadow-md">
              <Avatar className="h-8 w-8 shrink-0">
                <AvatarFallback className="text-[10px]">
                  {assignment.person
                    .split(" ")
                    .map((n) => n[0])
                    .join("")}
                </AvatarFallback>
              </Avatar>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="text-xs font-semibold">{assignment.person}</h3>
                  <Badge variant="secondary" className={`h-4 px-1.5 text-[9px] ${statusColors[assignment.status]}`}>
                    {assignment.status}
                  </Badge>
                </div>
                <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <Briefcase className="h-3 w-3" />
                    <span>{assignment.role}</span>
                  </div>
                  <span>•</span>
                  <span>{assignment.project}</span>
                </div>
              </div>

              <div className="flex items-center gap-4 text-[10px]">
                <div className="flex items-center gap-1 text-muted-foreground">
                  <MapPin className="h-3 w-3" />
                  <span>{assignment.site}</span>
                </div>
                <div className="flex items-center gap-1 text-muted-foreground">
                  <Calendar className="h-3 w-3" />
                  <span>
                    {new Date(assignment.startDate).toLocaleDateString("fr-FR")} -{" "}
                    {new Date(assignment.endDate).toLocaleDateString("fr-FR")}
                  </span>
                </div>
                <Badge variant="outline" className="h-5 px-2 text-[10px]">
                  {assignment.rotation}
                </Badge>
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
                  <DropdownMenuItem className="text-xs">Changer statut</DropdownMenuItem>
                  <DropdownMenuItem className="text-xs text-destructive">Annuler</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </Card>
          ))}
        </div>
      </div>
    </div>
  )
}
