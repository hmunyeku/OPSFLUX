"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { Plus, Search, Filter, CalendarIcon, Edit2, Trash2, Download, Upload } from "lucide-react"
import { format } from "date-fns"
import { fr } from "date-fns/locale"

interface RotationalAgent {
  id: string
  name: string
  company: string
  function: string
  rotation: string // e.g., "28/28", "42/42"
  nextMob: Date
  nextDemob: Date
  destination: string
  accommodation: string
  status: "active" | "on_leave" | "pending"
}

const mockAgents: RotationalAgent[] = [
  {
    id: "1",
    name: "Jean Dupont",
    company: "TotalEnergies",
    function: "Ingénieur",
    rotation: "28/28",
    nextMob: new Date(2025, 0, 15),
    nextDemob: new Date(2025, 1, 12),
    destination: "Douala",
    accommodation: "Hotel Sawa",
    status: "active",
  },
  {
    id: "2",
    name: "Marie Martin",
    company: "Schlumberger",
    function: "Technicienne",
    rotation: "42/42",
    nextMob: new Date(2025, 0, 20),
    nextDemob: new Date(2025, 2, 3),
    destination: "Offshore Platform A",
    accommodation: "Platform Quarters",
    status: "on_leave",
  },
]

export function PlanningRequestContent() {
  const [agents, setAgents] = useState<RotationalAgent[]>(mockAgents)
  const [searchQuery, setSearchQuery] = useState("")
  const [filterStatus, setFilterStatus] = useState<string>("all")
  const [isCreateOpen, setIsCreateOpen] = useState(false)

  const filteredAgents = agents.filter((agent) => {
    const matchesSearch =
      agent.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      agent.company.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesStatus = filterStatus === "all" || agent.status === filterStatus
    return matchesSearch && matchesStatus
  })

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "active":
        return <Badge variant="default">Sur site</Badge>
      case "on_leave":
        return <Badge variant="secondary">En congé</Badge>
      case "pending":
        return <Badge variant="outline">En attente</Badge>
      default:
        return null
    }
  }

  return (
    <div className="flex flex-col gap-4 md:gap-6 p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Planning Request</h1>
          <p className="text-sm md:text-base text-muted-foreground">
            Gestion des séjours des agents rotationnaires permanents
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm">
            <Download className="h-4 w-4 mr-2" />
            <span className="hidden sm:inline">Exporter</span>
          </Button>
          <Button variant="outline" size="sm">
            <Upload className="h-4 w-4 mr-2" />
            <span className="hidden sm:inline">Importer</span>
          </Button>
          <Sheet open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <SheetTrigger asChild>
              <Button size="sm">
                <Plus className="h-4 w-4 mr-2" />
                Nouvel Agent
              </Button>
            </SheetTrigger>
            <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
              <SheetHeader>
                <SheetTitle>Ajouter un Agent Rotationnaire</SheetTitle>
                <SheetDescription>
                  Configurez les informations de rotation pour un nouvel agent permanent
                </SheetDescription>
              </SheetHeader>
              <div className="space-y-6 py-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Informations Agent</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Nom complet</Label>
                        <Input placeholder="Jean Dupont" />
                      </div>
                      <div className="space-y-2">
                        <Label>Entreprise</Label>
                        <Input placeholder="TotalEnergies" />
                      </div>
                      <div className="space-y-2">
                        <Label>Fonction</Label>
                        <Input placeholder="Ingénieur" />
                      </div>
                      <div className="space-y-2">
                        <Label>Type de rotation</Label>
                        <Select>
                          <SelectTrigger>
                            <SelectValue placeholder="Sélectionner" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="28/28">28/28</SelectItem>
                            <SelectItem value="42/42">42/42</SelectItem>
                            <SelectItem value="56/56">56/56</SelectItem>
                            <SelectItem value="custom">Personnalisé</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Prochaine Rotation</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Date de mobilisation</Label>
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button variant="outline" className="w-full justify-start text-left bg-transparent">
                              <CalendarIcon className="mr-2 h-4 w-4" />
                              Sélectionner une date
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0">
                            <Calendar mode="single" />
                          </PopoverContent>
                        </Popover>
                      </div>
                      <div className="space-y-2">
                        <Label>Date de démobilisation</Label>
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button variant="outline" className="w-full justify-start text-left bg-transparent">
                              <CalendarIcon className="mr-2 h-4 w-4" />
                              Sélectionner une date
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0">
                            <Calendar mode="single" />
                          </PopoverContent>
                        </Popover>
                      </div>
                      <div className="space-y-2">
                        <Label>Destination</Label>
                        <Select>
                          <SelectTrigger>
                            <SelectValue placeholder="Sélectionner" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="douala">Douala</SelectItem>
                            <SelectItem value="kribi">Kribi</SelectItem>
                            <SelectItem value="platform-a">Offshore Platform A</SelectItem>
                            <SelectItem value="platform-b">Offshore Platform B</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Hébergement</Label>
                        <Select>
                          <SelectTrigger>
                            <SelectValue placeholder="Sélectionner" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="hotel-sawa">Hotel Sawa</SelectItem>
                            <SelectItem value="camp-base">Camp Base</SelectItem>
                            <SelectItem value="platform-quarters">Platform Quarters</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
                    Annuler
                  </Button>
                  <Button onClick={() => setIsCreateOpen(false)}>Enregistrer</Button>
                </div>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Rechercher un agent..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-full sm:w-[200px]">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Statut" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les statuts</SelectItem>
                <SelectItem value="active">Sur site</SelectItem>
                <SelectItem value="on_leave">En congé</SelectItem>
                <SelectItem value="pending">En attente</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Agents Table */}
      <Card>
        <CardHeader>
          <CardTitle>Agents Rotationnaires ({filteredAgents.length})</CardTitle>
          <CardDescription>Liste des agents permanents avec rotation planifiée</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[150px]">Agent</TableHead>
                  <TableHead className="min-w-[120px]">Entreprise</TableHead>
                  <TableHead className="min-w-[100px]">Fonction</TableHead>
                  <TableHead className="w-[80px]">Rotation</TableHead>
                  <TableHead className="min-w-[120px]">Prochaine Mob</TableHead>
                  <TableHead className="min-w-[120px]">Prochaine Demob</TableHead>
                  <TableHead className="min-w-[120px]">Destination</TableHead>
                  <TableHead className="w-[100px]">Statut</TableHead>
                  <TableHead className="w-[100px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredAgents.map((agent) => (
                  <TableRow key={agent.id}>
                    <TableCell className="font-medium">{agent.name}</TableCell>
                    <TableCell>{agent.company}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{agent.function}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{agent.rotation}</Badge>
                    </TableCell>
                    <TableCell className="text-sm">{format(agent.nextMob, "dd MMM yyyy", { locale: fr })}</TableCell>
                    <TableCell className="text-sm">{format(agent.nextDemob, "dd MMM yyyy", { locale: fr })}</TableCell>
                    <TableCell className="text-sm">{agent.destination}</TableCell>
                    <TableCell>{getStatusBadge(agent.status)}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost">
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <Button size="sm" variant="ghost">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
