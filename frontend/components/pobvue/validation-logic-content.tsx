"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { useHeaderContext } from "@/components/header-context"
import { ButtonGroup } from "@/components/ui/button-group"
import { Progress } from "@/components/ui/progress"
import { Alert, AlertDescription } from "@/components/ui/alert"
import Link from "next/link"
import {
  Plus,
  Trash2,
  Save,
  X,
  Calendar,
  Users,
  FolderKanban,
  Briefcase,
  AlertCircle,
  Plane,
  Bus,
  UserCheck,
  Users2,
  Edit,
  CheckCircle2,
  XCircle,
  Clock,
  FileCheck,
  FileX,
  ArrowRight,
  AlertTriangle,
  BarChart3,
  Activity,
} from "lucide-react"

// Types (keeping same as before)
interface Criterion {
  id: string
  type:
    | "total-period"
    | "business-unit"
    | "project"
    | "job-category"
    | "priority"
    | "outbound-transport"
    | "return-transport"
  period?: "day" | "week" | "month" | "custom"
  customPeriod?: { start: string; end: string }
  limit: number
  appliesTo: "mobilize" | "total"
}

interface Validator {
  type: "role" | "person"
  value: string
}

interface Workflow {
  projectManagerValidation: boolean
  level1Validator?: Validator
  level2Validator?: Validator
  level3Validator?: Validator
}

interface ValidationLogic {
  id: string
  name: string
  description: string
  periodicity: "permanent" | "temporary"
  applicationPeriod?: { start: string; end: string }
  status: "active" | "disabled"
  isDefault: boolean
  reservedPOB: number
  criteria: Criterion[]
  workflow: Workflow
  notifications: {
    validated: { enabled: boolean; template: string }
    rejected: { enabled: boolean; template: string }
    rescheduled: { enabled: boolean; template: string }
  }
  stats?: {
    pendingRequests: number
    approvedRequests: number
    rejectedRequests: number
    avgValidationTime: number
    approvalRate: number
    lastUsed?: string
  }
}

const mockValidationLogics: ValidationLogic[] = [
  {
    id: "1",
    name: "Logique Standard",
    description: "Logique de validation par défaut pour les demandes de séjour",
    periodicity: "permanent",
    status: "active",
    isDefault: true,
    reservedPOB: 50,
    criteria: [
      { id: "c1", type: "total-period", period: "week", limit: 100, appliesTo: "mobilize" },
      { id: "c2", type: "business-unit", limit: 30, appliesTo: "total" },
    ],
    workflow: {
      projectManagerValidation: true,
      level1Validator: { type: "role", value: "supervisor" },
      level2Validator: { type: "role", value: "manager" },
    },
    notifications: {
      validated: { enabled: true, template: "template-validation-approved" },
      rejected: { enabled: true, template: "template-validation-rejected" },
      rescheduled: { enabled: false, template: "" },
    },
    stats: {
      pendingRequests: 12,
      approvedRequests: 248,
      rejectedRequests: 15,
      avgValidationTime: 6.5,
      approvalRate: 94.3,
      lastUsed: "2025-01-03T10:30:00",
    },
  },
  {
    id: "2",
    name: "Logique Haute Saison",
    description: "Logique appliquée pendant les périodes de forte activité",
    periodicity: "temporary",
    applicationPeriod: { start: "2025-06-01", end: "2025-08-31" },
    status: "active",
    isDefault: false,
    reservedPOB: 30,
    criteria: [
      { id: "c3", type: "total-period", period: "day", limit: 20, appliesTo: "mobilize" },
      { id: "c4", type: "project", limit: 15, appliesTo: "total" },
    ],
    workflow: {
      projectManagerValidation: false,
      level1Validator: { type: "person", value: "Jean Dupont" },
    },
    notifications: {
      validated: { enabled: true, template: "template-validation-approved" },
      rejected: { enabled: true, template: "template-validation-rejected" },
      rescheduled: { enabled: true, template: "template-validation-rescheduled" },
    },
    stats: {
      pendingRequests: 0,
      approvedRequests: 142,
      rejectedRequests: 8,
      avgValidationTime: 4.2,
      approvalRate: 94.7,
      lastUsed: "2024-08-30T18:45:00",
    },
  },
]

const emailTemplates = [
  { id: "template-validation-approved", name: "Validation Approuvée" },
  { id: "template-validation-rejected", name: "Validation Rejetée" },
  { id: "template-validation-rescheduled", name: "Validation Reprogrammée" },
  { id: "template-custom-1", name: "Template Personnalisé 1" },
]

const criterionTypeLabels = {
  "total-period": "Nombre total par période",
  "business-unit": "Nombre par Business Unit",
  project: "Nombre par projet",
  "job-category": "Nombre par corps de métier",
  priority: "Priorité",
  "outbound-transport": "Par moyen de transport à l'aller",
  "return-transport": "Par moyen de transport au retour",
}

const criterionTypeIcons = {
  "total-period": Calendar,
  "business-unit": Users,
  project: FolderKanban,
  "job-category": Briefcase,
  priority: AlertCircle,
  "outbound-transport": Plane,
  "return-transport": Bus,
}

const mockRoles = [
  { id: "supervisor", name: "Superviseur" },
  { id: "manager", name: "Manager" },
  { id: "director", name: "Directeur" },
  { id: "admin", name: "Administrateur" },
]

const mockPersons = [
  { id: "1", name: "Jean Dupont" },
  { id: "2", name: "Marie Martin" },
  { id: "3", name: "Pierre Durand" },
  { id: "4", name: "Sophie Bernard" },
]

export function ValidationLogicContent() {
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedLogicId, setSelectedLogicId] = useState<string>("1")
  const [editingLogic, setEditingLogic] = useState<ValidationLogic | null>(null)
  const [showEditDrawer, setShowEditDrawer] = useState(false)

  const { setContextualHeader, clearContextualHeader } = useHeaderContext()

  const selectedLogic = mockValidationLogics.find((l) => l.id === selectedLogicId)

  useEffect(() => {
    setContextualHeader({
      searchPlaceholder: "Rechercher une logique...",
      searchValue: searchQuery,
      onSearchChange: setSearchQuery,
      customRender: (
        <ButtonGroup>
          <Button
            variant="outline"
            size="sm"
            className="h-9 gap-2 bg-transparent"
            onClick={() => {
              setEditingLogic({
                id: `new-${Date.now()}`,
                name: "",
                description: "",
                periodicity: "permanent",
                status: "active",
                isDefault: false,
                reservedPOB: 0,
                criteria: [],
                workflow: { projectManagerValidation: false },
                notifications: {
                  validated: { enabled: false, template: "" },
                  rejected: { enabled: false, template: "" },
                  rescheduled: { enabled: false, template: "" },
                },
              })
              setShowEditDrawer(true)
            }}
          >
            <Plus className="h-4 w-4" />
            Nouveau
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-9 gap-2 bg-transparent"
            onClick={handleEdit}
            disabled={!selectedLogic}
          >
            <Edit className="h-4 w-4" />
            Modifier
          </Button>
          <Link href="/pobvue/validations">
            <Button variant="outline" size="sm" className="h-9 gap-2 bg-transparent">
              <FileCheck className="h-4 w-4" />
              Voir validations
            </Button>
          </Link>
        </ButtonGroup>
      ),
    })

    return () => {
      clearContextualHeader()
    }
  }, [searchQuery, selectedLogic, setContextualHeader, clearContextualHeader])

  const filteredLogics = mockValidationLogics.filter(
    (logic) =>
      logic.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      logic.description.toLowerCase().includes(searchQuery.toLowerCase()),
  )

  const handleSelectLogic = (logicId: string) => {
    setSelectedLogicId(logicId)
  }

  const handleEdit = () => {
    if (selectedLogic) {
      setEditingLogic({ ...selectedLogic })
      setShowEditDrawer(true)
    }
  }

  const handleAddCriterion = () => {
    if (!editingLogic) return
    const newCriterion: Criterion = {
      id: `c${Date.now()}`,
      type: "total-period",
      period: "week",
      limit: 0,
      appliesTo: "mobilize",
    }
    setEditingLogic({ ...editingLogic, criteria: [...editingLogic.criteria, newCriterion] })
  }

  const handleRemoveCriterion = (criterionId: string) => {
    if (!editingLogic) return
    setEditingLogic({
      ...editingLogic,
      criteria: editingLogic.criteria.filter((c) => c.id !== criterionId),
    })
  }

  const handleUpdateCriterion = (criterionId: string, updates: Partial<Criterion>) => {
    if (!editingLogic) return
    setEditingLogic({
      ...editingLogic,
      criteria: editingLogic.criteria.map((c) => (c.id === criterionId ? { ...c, ...updates } : c)),
    })
  }

  const handleSave = () => {
    console.log("Saving validation logic:", editingLogic)
    setShowEditDrawer(false)
    setEditingLogic(null)
    // TODO: Save to backend
  }

  const handleCancel = () => {
    setShowEditDrawer(false)
    setEditingLogic(null)
  }

  const isExpiringSoon = (logic: ValidationLogic): boolean => {
    if (logic.periodicity === "permanent" || !logic.applicationPeriod) return false
    const endDate = new Date(logic.applicationPeriod.end)
    const now = new Date()
    const daysUntilExpiry = Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    return daysUntilExpiry > 0 && daysUntilExpiry <= 30
  }

  const getDaysUntilExpiry = (logic: ValidationLogic): number => {
    if (logic.periodicity === "permanent" || !logic.applicationPeriod) return 0
    const endDate = new Date(logic.applicationPeriod.end)
    const now = new Date()
    return Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
  }

  // Calculate overall stats
  const overallStats = {
    pending: mockValidationLogics.reduce((sum, l) => sum + (l.stats?.pendingRequests || 0), 0),
    approved: mockValidationLogics.reduce((sum, l) => sum + (l.stats?.approvedRequests || 0), 0),
    rejected: mockValidationLogics.reduce((sum, l) => sum + (l.stats?.rejectedRequests || 0), 0),
  }

  return (
    <div className="flex flex-col h-full">
      {/* Compact Stats Bar */}
      <div className="border-b bg-muted/30 px-4 py-2">
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              <Clock className="h-4 w-4 text-yellow-600" />
              <span className="text-xs text-muted-foreground">En attente:</span>
              <span className="font-semibold">{overallStats.pending}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <FileCheck className="h-4 w-4 text-green-600" />
              <span className="text-xs text-muted-foreground">Approuvées:</span>
              <span className="font-semibold text-green-600">{overallStats.approved}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <FileX className="h-4 w-4 text-red-600" />
              <span className="text-xs text-muted-foreground">Rejetées:</span>
              <span className="font-semibold text-red-600">{overallStats.rejected}</span>
            </div>
          </div>
          <Badge variant="outline" className="text-xs">
            {filteredLogics.length} logique(s)
          </Badge>
        </div>
      </div>

      {/* Content - Split View */}
      <div className="flex-1 overflow-hidden flex flex-col lg:flex-row">
        {/* Left Panel - Logic Cards Grid */}
        <div className="w-full lg:w-[60%] border-r">
          <ScrollArea className="h-full">
            <div className="p-3 space-y-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {filteredLogics.map((logic) => {
                  const expiringSoon = isExpiringSoon(logic)
                  const daysLeft = getDaysUntilExpiry(logic)

                  return (
                    <Card
                      key={logic.id}
                      className={`cursor-pointer transition-all hover:shadow-sm ${
                        selectedLogicId === logic.id ? "ring-2 ring-primary" : ""
                      }`}
                      onClick={() => handleSelectLogic(logic.id)}
                    >
                      <CardContent className="p-3 space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="font-medium text-sm line-clamp-1">{logic.name}</h3>
                          {logic.status === "active" ? (
                            <CheckCircle2 className="h-3.5 w-3.5 text-green-600 flex-shrink-0" />
                          ) : (
                            <XCircle className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                          )}
                        </div>

                        {expiringSoon && (
                          <Alert className="py-1 px-2 border-yellow-500/50 bg-yellow-500/10">
                            <AlertTriangle className="h-3 w-3 text-yellow-600" />
                            <AlertDescription className="text-[10px]">Expire dans {daysLeft}j</AlertDescription>
                          </Alert>
                        )}

                        <p className="text-xs text-muted-foreground line-clamp-2">{logic.description}</p>

                        <div className="flex flex-wrap gap-1">
                          {logic.isDefault && (
                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">
                              Défaut
                            </Badge>
                          )}
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">
                            {logic.periodicity === "permanent" ? "Permanente" : "Temporaire"}
                          </Badge>
                        </div>

                        {logic.stats && (
                          <div className="pt-1.5 border-t space-y-1.5">
                            <div className="flex items-center justify-between text-xs">
                              <span className="text-muted-foreground text-[10px]">Taux d'approbation</span>
                              <span className="font-medium text-green-600 text-xs">{logic.stats.approvalRate}%</span>
                            </div>
                            <Progress value={logic.stats.approvalRate} className="h-1" />

                            <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                              <span>En attente: {logic.stats.pendingRequests}</span>
                              <span>Moy: {logic.stats.avgValidationTime}h</span>
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  )
                })}
              </div>
            </div>
          </ScrollArea>
        </div>

        {/* Right Panel - Logic Details */}
        <div className="flex-1 hidden lg:block">
          <ScrollArea className="h-full">
            {selectedLogic ? (
              <div className="p-3 space-y-2">
                <div>
                  <h2 className="text-lg font-semibold">{selectedLogic.name}</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">{selectedLogic.description}</p>
                </div>

                {isExpiringSoon(selectedLogic) && (
                  <Alert className="border-yellow-500/50 bg-yellow-500/10 py-2">
                    <AlertTriangle className="h-3.5 w-3.5 text-yellow-600" />
                    <AlertDescription className="text-xs">
                      Expire dans {getDaysUntilExpiry(selectedLogic)} jour(s)
                    </AlertDescription>
                  </Alert>
                )}

                {selectedLogic.stats && (
                  <Card className="border-primary/20">
                    <CardContent className="p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium">Statistiques</span>
                        <Link href={`/pobvue/validations?logic=${selectedLogic.id}`}>
                          <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2">
                            Voir détails
                            <ArrowRight className="h-3 w-3 ml-1" />
                          </Button>
                        </Link>
                      </div>

                      <div className="grid grid-cols-3 gap-2 text-center">
                        <div className="p-2 rounded bg-yellow-500/10">
                          <p className="text-lg font-bold">{selectedLogic.stats.pendingRequests}</p>
                          <p className="text-[10px] text-muted-foreground">En attente</p>
                        </div>
                        <div className="p-2 rounded bg-green-500/10">
                          <p className="text-lg font-bold text-green-600">{selectedLogic.stats.approvedRequests}</p>
                          <p className="text-[10px] text-muted-foreground">Approuvées</p>
                        </div>
                        <div className="p-2 rounded bg-red-500/10">
                          <p className="text-lg font-bold text-red-600">{selectedLogic.stats.rejectedRequests}</p>
                          <p className="text-[10px] text-muted-foreground">Rejetées</p>
                        </div>
                      </div>

                      <div>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-muted-foreground text-[10px]">Taux d'approbation</span>
                          <span className="font-medium text-green-600">{selectedLogic.stats.approvalRate}%</span>
                        </div>
                        <Progress value={selectedLogic.stats.approvalRate} className="h-1.5" />
                      </div>
                    </CardContent>
                  </Card>
                )}

                <Separator />

                <div className="space-y-2">
                  <h3 className="text-xs font-semibold">Configuration</h3>

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-muted-foreground text-[10px]">Périodicité</span>
                      <p className="font-medium">{selectedLogic.periodicity === "permanent" ? "Permanente" : "Temporaire"}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground text-[10px]">POB réservés</span>
                      <p className="font-medium">{selectedLogic.reservedPOB}</p>
                    </div>
                  </div>

                  {selectedLogic.periodicity === "temporary" && selectedLogic.applicationPeriod && (
                    <div className="text-xs">
                      <span className="text-muted-foreground text-[10px]">Période d'application</span>
                      <p className="font-medium">
                        {new Date(selectedLogic.applicationPeriod.start).toLocaleDateString("fr-FR")} -{" "}
                        {new Date(selectedLogic.applicationPeriod.end).toLocaleDateString("fr-FR")}
                      </p>
                    </div>
                  )}
                </div>

                <Separator />

                <div className="space-y-1.5">
                  <h3 className="text-xs font-semibold">Critères ({selectedLogic.criteria.length})</h3>
                  {selectedLogic.criteria.map((criterion, index) => {
                    const Icon = criterionTypeIcons[criterion.type]
                    return (
                      <div key={criterion.id} className="flex items-center gap-2 p-2 rounded-lg bg-muted/50 text-xs">
                        <Icon className="h-3 w-3 text-primary flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-xs truncate">{criterionTypeLabels[criterion.type]}</p>
                          <p className="text-[10px] text-muted-foreground">Limite: {criterion.limit}</p>
                        </div>
                      </div>
                    )
                  })}
                </div>

                <Separator />

                <div className="space-y-1.5">
                  <h3 className="text-xs font-semibold">Workflow</h3>
                  <div className="space-y-1">
                    {selectedLogic.workflow.projectManagerValidation && (
                      <div className="flex items-center gap-1.5 text-xs">
                        <CheckCircle2 className="h-3 w-3 text-green-600" />
                        <span>Validation chef de projet</span>
                      </div>
                    )}
                    {selectedLogic.workflow.level1Validator && (
                      <div className="flex items-center gap-1.5 text-xs">
                        <UserCheck className="h-3 w-3 text-primary" />
                        <span>Niveau 1: {selectedLogic.workflow.level1Validator.value}</span>
                      </div>
                    )}
                    {selectedLogic.workflow.level2Validator && (
                      <div className="flex items-center gap-1.5 text-xs">
                        <Users2 className="h-3 w-3 text-primary" />
                        <span>Niveau 2: {selectedLogic.workflow.level2Validator.value}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                <p className="text-xs">Sélectionnez une logique</p>
              </div>
            )}
          </ScrollArea>
        </div>
      </div>

      {/* Edit Drawer - Repensé avec Accordion */}
      <Sheet open={showEditDrawer} onOpenChange={setShowEditDrawer}>
        <SheetContent side="right" className="w-full sm:max-w-xl p-0 flex flex-col">
          <SheetHeader className="px-4 py-3 border-b">
            <SheetTitle className="text-base">
              {editingLogic?.id.startsWith("new-") ? "Nouvelle logique" : "Modifier la logique"}
            </SheetTitle>
          </SheetHeader>

          {editingLogic && (
            <ScrollArea className="flex-1">
              <div className="px-4 py-3">
                <Accordion type="multiple" defaultValue={["general", "criteria", "workflow"]} className="space-y-2">
                  {/* General Info */}
                  <AccordionItem value="general" className="border rounded-lg px-3">
                    <AccordionTrigger className="text-sm font-medium py-2 hover:no-underline">
                      Informations générales
                    </AccordionTrigger>
                    <AccordionContent className="space-y-3 pt-2 pb-3">
                      <div className="space-y-1.5">
                        <Label htmlFor="name" className="text-xs">
                          Nom
                        </Label>
                        <Input
                          id="name"
                          value={editingLogic.name}
                          onChange={(e) => setEditingLogic({ ...editingLogic, name: e.target.value })}
                          className="h-8 text-sm"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <Label htmlFor="description" className="text-xs">
                          Description
                        </Label>
                        <Textarea
                          id="description"
                          value={editingLogic.description}
                          onChange={(e) => setEditingLogic({ ...editingLogic, description: e.target.value })}
                          rows={2}
                          className="text-xs"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1.5">
                          <Label htmlFor="reserved-pob" className="text-xs">
                            POB réservés
                          </Label>
                          <Input
                            id="reserved-pob"
                            type="number"
                            value={editingLogic.reservedPOB}
                            onChange={(e) =>
                              setEditingLogic({ ...editingLogic, reservedPOB: Number.parseInt(e.target.value) || 0 })
                            }
                            className="h-8 text-sm"
                          />
                        </div>

                        <div className="space-y-1.5">
                          <Label className="text-xs">Statut</Label>
                          <div className="flex items-center space-x-2 h-8">
                            <Switch
                              checked={editingLogic.status === "active"}
                              onCheckedChange={(checked) =>
                                setEditingLogic({ ...editingLogic, status: checked ? "active" : "disabled" })
                              }
                            />
                            <Label className="text-xs">{editingLogic.status === "active" ? "Active" : "Désactivée"}</Label>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center space-x-2">
                        <Switch
                          checked={editingLogic.isDefault}
                          onCheckedChange={(checked) => setEditingLogic({ ...editingLogic, isDefault: checked })}
                        />
                        <Label className="text-xs">Logique par défaut</Label>
                      </div>

                      <div className="space-y-1.5">
                        <Label className="text-xs">Périodicité</Label>
                        <RadioGroup
                          value={editingLogic.periodicity}
                          onValueChange={(value: "permanent" | "temporary") =>
                            setEditingLogic({ ...editingLogic, periodicity: value })
                          }
                        >
                          <div className="flex items-center space-x-2">
                            <RadioGroupItem value="permanent" id="edit-permanent" />
                            <Label htmlFor="edit-permanent" className="text-xs font-normal">
                              Permanente
                            </Label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <RadioGroupItem value="temporary" id="edit-temporary" />
                            <Label htmlFor="edit-temporary" className="text-xs font-normal">
                              Temporaire
                            </Label>
                          </div>
                        </RadioGroup>
                      </div>

                      {editingLogic.periodicity === "temporary" && (
                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1.5">
                            <Label htmlFor="edit-start-date" className="text-xs">
                              Début
                            </Label>
                            <Input
                              id="edit-start-date"
                              type="date"
                              value={editingLogic.applicationPeriod?.start || ""}
                              onChange={(e) =>
                                setEditingLogic({
                                  ...editingLogic,
                                  applicationPeriod: { ...editingLogic.applicationPeriod!, start: e.target.value },
                                })
                              }
                              className="h-8 text-sm"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label htmlFor="edit-end-date" className="text-xs">
                              Fin
                            </Label>
                            <Input
                              id="edit-end-date"
                              type="date"
                              value={editingLogic.applicationPeriod?.end || ""}
                              onChange={(e) =>
                                setEditingLogic({
                                  ...editingLogic,
                                  applicationPeriod: { ...editingLogic.applicationPeriod!, end: e.target.value },
                                })
                              }
                              className="h-8 text-sm"
                            />
                          </div>
                        </div>
                      )}
                    </AccordionContent>
                  </AccordionItem>

                  {/* Criteria */}
                  <AccordionItem value="criteria" className="border rounded-lg px-3">
                    <AccordionTrigger className="text-sm font-medium py-2 hover:no-underline">
                      <div className="flex items-center justify-between w-full pr-2">
                        <span>Critères de validation</span>
                        <Badge variant="secondary" className="text-[10px]">
                          {editingLogic.criteria.length}
                        </Badge>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="space-y-2 pt-2 pb-3">
                      <Button size="sm" variant="outline" onClick={handleAddCriterion} className="w-full h-7 text-xs">
                        <Plus className="h-3 w-3 mr-1.5" />
                        Ajouter un critère
                      </Button>

                      {editingLogic.criteria.map((criterion, index) => {
                        const Icon = criterionTypeIcons[criterion.type]
                        return (
                          <Card key={criterion.id} className="border">
                            <CardContent className="p-2 space-y-2">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-1.5">
                                  <Icon className="h-3 w-3 text-primary" />
                                  <span className="text-xs font-medium">Critère {index + 1}</span>
                                </div>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => handleRemoveCriterion(criterion.id)}
                                  className="h-6 w-6 p-0"
                                >
                                  <Trash2 className="h-3 w-3 text-destructive" />
                                </Button>
                              </div>

                              <div className="grid grid-cols-2 gap-2">
                                <div className="space-y-1">
                                  <Label className="text-[10px]">Type</Label>
                                  <Select
                                    value={criterion.type}
                                    onValueChange={(value: Criterion["type"]) =>
                                      handleUpdateCriterion(criterion.id, { type: value })
                                    }
                                  >
                                    <SelectTrigger className="h-7 text-xs">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {Object.entries(criterionTypeLabels).map(([value, label]) => (
                                        <SelectItem key={value} value={value} className="text-xs">
                                          {label}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>

                                {criterion.type === "total-period" && (
                                  <div className="space-y-1">
                                    <Label className="text-[10px]">Période</Label>
                                    <Select
                                      value={criterion.period}
                                      onValueChange={(value: Criterion["period"]) =>
                                        handleUpdateCriterion(criterion.id, { period: value })
                                      }
                                    >
                                      <SelectTrigger className="h-7 text-xs">
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="day" className="text-xs">
                                          Jour
                                        </SelectItem>
                                        <SelectItem value="week" className="text-xs">
                                          Semaine
                                        </SelectItem>
                                        <SelectItem value="month" className="text-xs">
                                          Mois
                                        </SelectItem>
                                      </SelectContent>
                                    </Select>
                                  </div>
                                )}

                                <div className="space-y-1">
                                  <Label className="text-[10px]">Limite</Label>
                                  <Input
                                    type="number"
                                    value={criterion.limit}
                                    onChange={(e) =>
                                      handleUpdateCriterion(criterion.id, { limit: Number.parseInt(e.target.value) || 0 })
                                    }
                                    className="h-7 text-xs"
                                  />
                                </div>

                                <div className="space-y-1">
                                  <Label className="text-[10px]">S'applique à</Label>
                                  <Select
                                    value={criterion.appliesTo}
                                    onValueChange={(value: "mobilize" | "total") =>
                                      handleUpdateCriterion(criterion.id, { appliesTo: value })
                                    }
                                  >
                                    <SelectTrigger className="h-7 text-xs">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="mobilize" className="text-xs">
                                        POB à mobiliser
                                      </SelectItem>
                                      <SelectItem value="total" className="text-xs">
                                        POB total
                                      </SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        )
                      })}
                    </AccordionContent>
                  </AccordionItem>

                  {/* Workflow */}
                  <AccordionItem value="workflow" className="border rounded-lg px-3">
                    <AccordionTrigger className="text-sm font-medium py-2 hover:no-underline">Workflow</AccordionTrigger>
                    <AccordionContent className="space-y-3 pt-2 pb-3">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs">Validation chef de projet</Label>
                        <Switch
                          checked={editingLogic.workflow.projectManagerValidation}
                          onCheckedChange={(checked) =>
                            setEditingLogic({
                              ...editingLogic,
                              workflow: { ...editingLogic.workflow, projectManagerValidation: checked },
                            })
                          }
                        />
                      </div>

                      <Separator />

                      {/* Level 1 */}
                      <div className="space-y-2">
                        <Label className="text-xs font-medium">Validateur niveau 1</Label>
                        <div className="grid grid-cols-2 gap-2">
                          <Select
                            value={editingLogic.workflow.level1Validator?.type || "role"}
                            onValueChange={(value: "role" | "person") =>
                              setEditingLogic({
                                ...editingLogic,
                                workflow: {
                                  ...editingLogic.workflow,
                                  level1Validator: { type: value, value: "" },
                                },
                              })
                            }
                          >
                            <SelectTrigger className="h-7 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="role" className="text-xs">
                                Rôle
                              </SelectItem>
                              <SelectItem value="person" className="text-xs">
                                Personne
                              </SelectItem>
                            </SelectContent>
                          </Select>

                          <Select
                            value={editingLogic.workflow.level1Validator?.value || ""}
                            onValueChange={(value) =>
                              setEditingLogic({
                                ...editingLogic,
                                workflow: {
                                  ...editingLogic.workflow,
                                  level1Validator: { ...editingLogic.workflow.level1Validator!, value },
                                },
                              })
                            }
                          >
                            <SelectTrigger className="h-7 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {editingLogic.workflow.level1Validator?.type === "role"
                                ? mockRoles.map((role) => (
                                    <SelectItem key={role.id} value={role.id} className="text-xs">
                                      {role.name}
                                    </SelectItem>
                                  ))
                                : mockPersons.map((person) => (
                                    <SelectItem key={person.id} value={person.name} className="text-xs">
                                      {person.name}
                                    </SelectItem>
                                  ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      {/* Level 2 */}
                      <div className="space-y-2">
                        <Label className="text-xs font-medium">Validateur niveau 2</Label>
                        <div className="grid grid-cols-2 gap-2">
                          <Select
                            value={editingLogic.workflow.level2Validator?.type || "role"}
                            onValueChange={(value: "role" | "person") =>
                              setEditingLogic({
                                ...editingLogic,
                                workflow: {
                                  ...editingLogic.workflow,
                                  level2Validator: { type: value, value: "" },
                                },
                              })
                            }
                          >
                            <SelectTrigger className="h-7 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="role" className="text-xs">
                                Rôle
                              </SelectItem>
                              <SelectItem value="person" className="text-xs">
                                Personne
                              </SelectItem>
                            </SelectContent>
                          </Select>

                          <Select
                            value={editingLogic.workflow.level2Validator?.value || ""}
                            onValueChange={(value) =>
                              setEditingLogic({
                                ...editingLogic,
                                workflow: {
                                  ...editingLogic.workflow,
                                  level2Validator: { ...editingLogic.workflow.level2Validator!, value },
                                },
                              })
                            }
                          >
                            <SelectTrigger className="h-7 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {editingLogic.workflow.level2Validator?.type === "role"
                                ? mockRoles.map((role) => (
                                    <SelectItem key={role.id} value={role.id} className="text-xs">
                                      {role.name}
                                    </SelectItem>
                                  ))
                                : mockPersons.map((person) => (
                                    <SelectItem key={person.id} value={person.name} className="text-xs">
                                      {person.name}
                                    </SelectItem>
                                  ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </AccordionContent>
                  </AccordionItem>

                  {/* Notifications */}
                  <AccordionItem value="notifications" className="border rounded-lg px-3">
                    <AccordionTrigger className="text-sm font-medium py-2 hover:no-underline">Notifications</AccordionTrigger>
                    <AccordionContent className="space-y-3 pt-2 pb-3">
                      {/* Validated */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label className="text-xs">Demandes validées</Label>
                          <Switch
                            checked={editingLogic.notifications.validated.enabled}
                            onCheckedChange={(checked) =>
                              setEditingLogic({
                                ...editingLogic,
                                notifications: {
                                  ...editingLogic.notifications,
                                  validated: { ...editingLogic.notifications.validated, enabled: checked },
                                },
                              })
                            }
                          />
                        </div>
                        {editingLogic.notifications.validated.enabled && (
                          <Select
                            value={editingLogic.notifications.validated.template}
                            onValueChange={(value) =>
                              setEditingLogic({
                                ...editingLogic,
                                notifications: {
                                  ...editingLogic.notifications,
                                  validated: { ...editingLogic.notifications.validated, template: value },
                                },
                              })
                            }
                          >
                            <SelectTrigger className="h-7 text-xs">
                              <SelectValue placeholder="Template" />
                            </SelectTrigger>
                            <SelectContent>
                              {emailTemplates.map((template) => (
                                <SelectItem key={template.id} value={template.id} className="text-xs">
                                  {template.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      </div>

                      <Separator />

                      {/* Rejected */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label className="text-xs">Demandes rejetées</Label>
                          <Switch
                            checked={editingLogic.notifications.rejected.enabled}
                            onCheckedChange={(checked) =>
                              setEditingLogic({
                                ...editingLogic,
                                notifications: {
                                  ...editingLogic.notifications,
                                  rejected: { ...editingLogic.notifications.rejected, enabled: checked },
                                },
                              })
                            }
                          />
                        </div>
                        {editingLogic.notifications.rejected.enabled && (
                          <Select
                            value={editingLogic.notifications.rejected.template}
                            onValueChange={(value) =>
                              setEditingLogic({
                                ...editingLogic,
                                notifications: {
                                  ...editingLogic.notifications,
                                  rejected: { ...editingLogic.notifications.rejected, template: value },
                                },
                              })
                            }
                          >
                            <SelectTrigger className="h-7 text-xs">
                              <SelectValue placeholder="Template" />
                            </SelectTrigger>
                            <SelectContent>
                              {emailTemplates.map((template) => (
                                <SelectItem key={template.id} value={template.id} className="text-xs">
                                  {template.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      </div>

                      <Separator />

                      {/* Rescheduled */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label className="text-xs">Demandes reprogrammées</Label>
                          <Switch
                            checked={editingLogic.notifications.rescheduled.enabled}
                            onCheckedChange={(checked) =>
                              setEditingLogic({
                                ...editingLogic,
                                notifications: {
                                  ...editingLogic.notifications,
                                  rescheduled: { ...editingLogic.notifications.rescheduled, enabled: checked },
                                },
                              })
                            }
                          />
                        </div>
                        {editingLogic.notifications.rescheduled.enabled && (
                          <Select
                            value={editingLogic.notifications.rescheduled.template}
                            onValueChange={(value) =>
                              setEditingLogic({
                                ...editingLogic,
                                notifications: {
                                  ...editingLogic.notifications,
                                  rescheduled: { ...editingLogic.notifications.rescheduled, template: value },
                                },
                              })
                            }
                          >
                            <SelectTrigger className="h-7 text-xs">
                              <SelectValue placeholder="Template" />
                            </SelectTrigger>
                            <SelectContent>
                              {emailTemplates.map((template) => (
                                <SelectItem key={template.id} value={template.id} className="text-xs">
                                  {template.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              </div>
            </ScrollArea>
          )}

          {/* Sticky Footer */}
          <div className="border-t px-4 py-2 bg-background">
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={handleCancel} className="h-8">
                <X className="h-3 w-3 mr-1.5" />
                Annuler
              </Button>
              <Button size="sm" onClick={handleSave} className="h-8">
                <Save className="h-3 w-3 mr-1.5" />
                Enregistrer
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}
