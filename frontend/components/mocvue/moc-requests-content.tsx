"use client"

import { useState, useEffect } from "react"
import { useHeaderContext } from "@/components/header-context"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Filter, Grid3x3, List, MoreVertical, Calendar, Clock, Plus } from "lucide-react"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Progress } from "@/components/ui/progress"

type ViewMode = "grid" | "list"

type MOCStatus = "draft" | "submitted" | "in-review" | "approved" | "rejected" | "implemented" | "closed"
type MOCPriority = "low" | "medium" | "high" | "critical"
type ImpactLevel = "minor" | "moderate" | "major" | "critical"

interface MOCRequest {
  id: string
  title: string
  description: string
  status: MOCStatus
  priority: MOCPriority
  impact: ImpactLevel
  project: string
  requester: string
  assignedTo: string[]
  submittedDate: string
  reviewDate?: string
  implementationDate?: string
  progress: number
  category: string
  affectedSystems: string[]
}

const mockMOCRequests: MOCRequest[] = [
  {
    id: "MOC-2024-001",
    title: "Upgrade Control System to v5.2",
    description: "Upgrade the main control system to version 5.2 for improved performance and security",
    status: "in-review",
    priority: "high",
    impact: "major",
    project: "Platform Upgrade",
    requester: "John Smith",
    assignedTo: ["Sarah Johnson", "Mike Chen"],
    submittedDate: "2024-01-15",
    reviewDate: "2024-01-20",
    progress: 45,
    category: "Equipment",
    affectedSystems: ["Control System", "SCADA", "Safety Systems"],
  },
  {
    id: "MOC-2024-002",
    title: "Change Welding Procedure WPS-123",
    description: "Update welding procedure to comply with new API standards",
    status: "approved",
    priority: "critical",
    impact: "major",
    project: "Pipeline Installation",
    requester: "Emma Wilson",
    assignedTo: ["David Brown", "Lisa Anderson"],
    submittedDate: "2024-01-10",
    reviewDate: "2024-01-18",
    implementationDate: "2024-01-25",
    progress: 75,
    category: "Procedure",
    affectedSystems: ["Welding", "QA/QC"],
  },
  {
    id: "MOC-2024-003",
    title: "Install New Safety Valve SV-401",
    description: "Add additional safety valve to meet updated safety requirements",
    status: "submitted",
    priority: "high",
    impact: "moderate",
    project: "Safety Enhancement",
    requester: "Robert Taylor",
    assignedTo: ["Jennifer Lee"],
    submittedDate: "2024-01-22",
    progress: 15,
    category: "Equipment",
    affectedSystems: ["Safety Systems", "Pressure Relief"],
  },
  {
    id: "MOC-2024-004",
    title: "Update Emergency Response Plan",
    description: "Revise ERP to include new evacuation procedures",
    status: "draft",
    priority: "medium",
    impact: "minor",
    project: "HSE Compliance",
    requester: "Maria Garcia",
    assignedTo: [],
    submittedDate: "2024-01-25",
    progress: 5,
    category: "Documentation",
    affectedSystems: ["Emergency Response"],
  },
]

const statusColors: Record<MOCStatus, string> = {
  draft: "bg-gray-500/10 text-gray-700 dark:text-gray-400",
  submitted: "bg-blue-500/10 text-blue-700 dark:text-blue-400",
  "in-review": "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400",
  approved: "bg-green-500/10 text-green-700 dark:text-green-400",
  rejected: "bg-red-500/10 text-red-700 dark:text-red-400",
  implemented: "bg-purple-500/10 text-purple-700 dark:text-purple-400",
  closed: "bg-gray-500/10 text-gray-700 dark:text-gray-400",
}

const priorityColors: Record<MOCPriority, string> = {
  low: "bg-gray-500/10 text-gray-700 dark:text-gray-400",
  medium: "bg-blue-500/10 text-blue-700 dark:text-blue-400",
  high: "bg-orange-500/10 text-orange-700 dark:text-orange-400",
  critical: "bg-red-500/10 text-red-700 dark:text-red-400",
}

const impactColors: Record<ImpactLevel, string> = {
  minor: "bg-green-500/10 text-green-700 dark:text-green-400",
  moderate: "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400",
  major: "bg-orange-500/10 text-orange-700 dark:text-orange-400",
  critical: "bg-red-500/10 text-red-700 dark:text-red-400",
}

export function MOCRequestsContent() {
  const [viewMode, setViewMode] = useState<ViewMode>("grid")
  const [searchQuery, setSearchQuery] = useState("")
  const [requests] = useState<MOCRequest[]>(mockMOCRequests)
  const { setContextualHeader, clearContextualHeader } = useHeaderContext()

  useEffect(() => {
    setContextualHeader({
      searchPlaceholder: "Rechercher demandes MOC...",
      onSearchChange: setSearchQuery,
      contextualButtons: [
        {
          label: "Nouvelle demande MOC",
          icon: Plus,
          onClick: () => {
            console.log("New MOC request")
          },
        },
      ],
    })

    return () => clearContextualHeader()
  }, [setContextualHeader, clearContextualHeader])

  const filteredRequests = requests.filter(
    (request) =>
      request.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      request.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      request.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      request.project.toLowerCase().includes(searchQuery.toLowerCase()),
  )

  return (
    <div className="flex h-full flex-col gap-2 p-2 sm:p-3 md:p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Select defaultValue="all">
          <SelectTrigger className="h-8 w-[100px] text-xs sm:w-[120px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous statuts</SelectItem>
            <SelectItem value="draft">Brouillon</SelectItem>
            <SelectItem value="submitted">Soumis</SelectItem>
            <SelectItem value="in-review">En révision</SelectItem>
            <SelectItem value="approved">Approuvé</SelectItem>
            <SelectItem value="implemented">Implémenté</SelectItem>
          </SelectContent>
        </Select>
        <Select defaultValue="all-priority">
          <SelectTrigger className="h-8 w-[100px] text-xs sm:w-[120px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all-priority">Toutes priorités</SelectItem>
            <SelectItem value="critical">Critique</SelectItem>
            <SelectItem value="high">Haute</SelectItem>
            <SelectItem value="medium">Moyenne</SelectItem>
            <SelectItem value="low">Basse</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" className="h-8 gap-1.5 bg-transparent text-xs">
          <Filter className="h-3 w-3" />
          <span className="hidden sm:inline">Filtres</span>
        </Button>
        <div className="ml-auto flex items-center gap-0.5 rounded-md border p-0.5">
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
      </div>

      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
        <span>{filteredRequests.length} demandes MOC</span>
      </div>

      <div className="flex-1 overflow-auto">
        {viewMode === "grid" ? (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filteredRequests.map((request) => (
              <Card key={request.id} className="group relative flex flex-col gap-2 p-2 transition-all hover:shadow-md">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-mono text-muted-foreground">{request.id}</span>
                    </div>
                    <h3 className="mt-0.5 line-clamp-2 text-xs font-semibold">{request.title}</h3>
                    <p className="mt-1 line-clamp-2 text-[10px] text-muted-foreground">{request.description}</p>
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
                      <DropdownMenuItem className="text-xs">Télécharger PDF</DropdownMenuItem>
                      <DropdownMenuItem className="text-xs text-destructive">Annuler</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                <div className="flex flex-wrap gap-1">
                  <Badge variant="secondary" className={`h-4 px-1.5 text-[9px] ${statusColors[request.status]}`}>
                    {request.status}
                  </Badge>
                  <Badge variant="secondary" className={`h-4 px-1.5 text-[9px] ${priorityColors[request.priority]}`}>
                    {request.priority}
                  </Badge>
                  <Badge variant="secondary" className={`h-4 px-1.5 text-[9px] ${impactColors[request.impact]}`}>
                    Impact: {request.impact}
                  </Badge>
                </div>

                <div className="space-y-1 text-[10px]">
                  <div className="flex items-center gap-1 text-muted-foreground">
                    <span className="font-medium">Projet:</span>
                    <span>{request.project}</span>
                  </div>
                  <div className="flex items-center gap-1 text-muted-foreground">
                    <span className="font-medium">Catégorie:</span>
                    <span>{request.category}</span>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="text-muted-foreground">Progression</span>
                    <span className="font-medium">{request.progress}%</span>
                  </div>
                  <Progress value={request.progress} className="h-1.5" />
                </div>

                <div className="space-y-1 border-t pt-2 text-[10px]">
                  <div className="flex items-center gap-1.5">
                    <Calendar className="h-3 w-3 text-muted-foreground" />
                    <span className="text-muted-foreground">Soumis:</span>
                    <span>{new Date(request.submittedDate).toLocaleDateString("fr-FR")}</span>
                  </div>
                  {request.reviewDate && (
                    <div className="flex items-center gap-1.5">
                      <Clock className="h-3 w-3 text-muted-foreground" />
                      <span className="text-muted-foreground">Révision:</span>
                      <span>{new Date(request.reviewDate).toLocaleDateString("fr-FR")}</span>
                    </div>
                  )}
                </div>

                <div className="mt-auto flex items-center justify-between border-t pt-2">
                  <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                    <span>Demandeur:</span>
                    <span className="font-medium text-foreground">{request.requester}</span>
                  </div>
                  {request.assignedTo.length > 0 && (
                    <div className="flex -space-x-1">
                      {request.assignedTo.slice(0, 3).map((member, i) => (
                        <Avatar key={i} className="h-5 w-5 border-2 border-background">
                          <AvatarFallback className="text-[8px]">
                            {member
                              .split(" ")
                              .map((n) => n[0])
                              .join("")}
                          </AvatarFallback>
                        </Avatar>
                      ))}
                      {request.assignedTo.length > 3 && (
                        <div className="flex h-5 w-5 items-center justify-center rounded-full border-2 border-background bg-muted text-[8px]">
                          +{request.assignedTo.length - 3}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {request.affectedSystems.length > 0 && (
                  <div className="space-y-1 border-t pt-2">
                    <div className="text-[10px] font-medium text-muted-foreground">Systèmes affectés:</div>
                    <div className="flex flex-wrap gap-1">
                      {request.affectedSystems.slice(0, 3).map((system) => (
                        <Badge key={system} variant="outline" className="h-3.5 px-1 text-[9px]">
                          {system}
                        </Badge>
                      ))}
                      {request.affectedSystems.length > 3 && (
                        <Badge variant="outline" className="h-3.5 px-1 text-[9px]">
                          +{request.affectedSystems.length - 3}
                        </Badge>
                      )}
                    </div>
                  </div>
                )}
              </Card>
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <div className="min-w-[1400px] rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="h-8 text-[10px] font-semibold">ID</TableHead>
                    <TableHead className="h-8 text-[10px] font-semibold">Titre</TableHead>
                    <TableHead className="h-8 text-[10px] font-semibold">Statut</TableHead>
                    <TableHead className="h-8 text-[10px] font-semibold">Priorité</TableHead>
                    <TableHead className="h-8 text-[10px] font-semibold">Impact</TableHead>
                    <TableHead className="h-8 text-[10px] font-semibold">Projet</TableHead>
                    <TableHead className="h-8 text-[10px] font-semibold">Catégorie</TableHead>
                    <TableHead className="h-8 text-[10px] font-semibold">Progression</TableHead>
                    <TableHead className="h-8 text-[10px] font-semibold">Demandeur</TableHead>
                    <TableHead className="h-8 text-[10px] font-semibold">Assigné à</TableHead>
                    <TableHead className="h-8 text-[10px] font-semibold">Date soumission</TableHead>
                    <TableHead className="h-8 w-8"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRequests.map((request) => (
                    <TableRow key={request.id} className="group">
                      <TableCell className="py-1.5">
                        <span className="font-mono text-[10px] text-muted-foreground">{request.id}</span>
                      </TableCell>
                      <TableCell className="py-1.5">
                        <div className="flex flex-col gap-0.5">
                          <span className="text-xs font-medium">{request.title}</span>
                          <span className="line-clamp-1 text-[10px] text-muted-foreground">{request.description}</span>
                        </div>
                      </TableCell>
                      <TableCell className="py-1.5">
                        <Badge variant="secondary" className={`h-4 px-1.5 text-[9px] ${statusColors[request.status]}`}>
                          {request.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="py-1.5">
                        <Badge
                          variant="secondary"
                          className={`h-4 px-1.5 text-[9px] ${priorityColors[request.priority]}`}
                        >
                          {request.priority}
                        </Badge>
                      </TableCell>
                      <TableCell className="py-1.5">
                        <Badge variant="secondary" className={`h-4 px-1.5 text-[9px] ${impactColors[request.impact]}`}>
                          {request.impact}
                        </Badge>
                      </TableCell>
                      <TableCell className="py-1.5 text-xs text-muted-foreground">{request.project}</TableCell>
                      <TableCell className="py-1.5 text-xs text-muted-foreground">{request.category}</TableCell>
                      <TableCell className="py-1.5">
                        <div className="flex items-center gap-2">
                          <Progress value={request.progress} className="h-1.5 w-20" />
                          <span className="text-[10px] font-medium">{request.progress}%</span>
                        </div>
                      </TableCell>
                      <TableCell className="py-1.5 text-xs">{request.requester}</TableCell>
                      <TableCell className="py-1.5">
                        {request.assignedTo.length > 0 ? (
                          <div className="flex -space-x-1">
                            {request.assignedTo.slice(0, 3).map((member, i) => (
                              <Avatar key={i} className="h-5 w-5 border-2 border-background">
                                <AvatarFallback className="text-[8px]">
                                  {member
                                    .split(" ")
                                    .map((n) => n[0])
                                    .join("")}
                                </AvatarFallback>
                              </Avatar>
                            ))}
                            {request.assignedTo.length > 3 && (
                              <div className="flex h-5 w-5 items-center justify-center rounded-full border-2 border-background bg-muted text-[8px]">
                                +{request.assignedTo.length - 3}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-[10px] text-muted-foreground">Non assigné</span>
                        )}
                      </TableCell>
                      <TableCell className="py-1.5 text-[10px] text-muted-foreground">
                        {new Date(request.submittedDate).toLocaleDateString("fr-FR")}
                      </TableCell>
                      <TableCell className="py-1.5">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                              <MoreVertical className="h-3 w-3" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem className="text-xs">Voir détails</DropdownMenuItem>
                            <DropdownMenuItem className="text-xs">Modifier</DropdownMenuItem>
                            <DropdownMenuItem className="text-xs">Télécharger PDF</DropdownMenuItem>
                            <DropdownMenuItem className="text-xs text-destructive">Annuler</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
