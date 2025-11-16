"use client"

import type React from "react"

import { useState, useMemo } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  Plus,
  Download,
  Trash2,
  Save,
  X,
  FileSpreadsheet,
  Users,
  ChevronLeft,
  AlertCircle,
  LayoutGrid,
  Table2,
  ChevronDown,
  ChevronUp,
  GraduationCap,
  Award,
  Camera,
} from "lucide-react"

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer"
import Link from "next/link"

interface TeamMember {
  id: string
  lastName: string
  firstName: string
  company: string
  function: string
  site: string
  project: string
  accommodation: string
  startDate: string
  endDate: string
  trainings: Training[]
  certifications: Certification[]
  passportPhoto: string | null
  isFirstStay: boolean
  reason: string
  personWeightOutbound: string
  personWeightReturn: string
  baggageWeightOutbound: string
  baggageWeightReturn: string
  transportMethodOutbound: string
  transportMethodReturn: string
  pickupPoint: string
}

interface Training {
  id: string
  type: string
  obtainedDate: string
  validityDate: string
  mandatory: boolean
}

interface Certification {
  id: string
  type: string
  obtainedDate: string
  validityDate: string
}

export function TeamRequestContent() {
  const [commonData, setCommonData] = useState({
    site: "",
    project: "",
    accommodation: "",
    startDate: "",
    endDate: "",
    reason: "",
  })

  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([])
  const [uploadedFile, setUploadedFile] = useState<File | null>(null)
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null)
  const [validationErrors, setValidationErrors] = useState<Record<string, string[]>>({})
  const [viewMode, setViewMode] = useState<"grid" | "table">("grid")
  const [isCommonDataOpen, setIsCommonDataOpen] = useState(true)
  const [editingMemberId, setEditingMemberId] = useState<string | null>(null)
  const [showTrainingsDialog, setShowTrainingsDialog] = useState(false)
  const [showCertificationsDialog, setShowCertificationsDialog] = useState(false)
  const [showFiltersDrawer, setShowFiltersDrawer] = useState(false)
  const [filters, setFilters] = useState({
    site: "",
    status: "",
    isFirstStay: null as boolean | null,
  })

  const filteredMembers = useMemo(() => {
    return teamMembers.filter((member) => {
      if (filters.site && member.site !== filters.site) return false
      if (filters.isFirstStay !== null && member.isFirstStay !== filters.isFirstStay) return false
      // Add more filter conditions as needed
      return true
    })
  }, [teamMembers, filters])

  const autocompleteSuggestions = useMemo(() => {
    return {
      companies: Array.from(new Set(teamMembers.map((m) => m.company).filter(Boolean))),
      functions: Array.from(new Set(teamMembers.map((m) => m.function).filter(Boolean))),
      projects: Array.from(new Set(teamMembers.map((m) => m.project).filter(Boolean))),
      accommodations: Array.from(new Set(teamMembers.map((m) => m.accommodation).filter(Boolean))),
    }
  }, [teamMembers])

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    setUploadedFile(file)

    // Parse CSV/XLS file
    const reader = new FileReader()
    reader.onload = (e) => {
      const text = e.target?.result as string
      const lines = text.split("\n")

      const members: TeamMember[] = lines
        .slice(1)
        .filter((line) => line.trim())
        .map((line, index) => {
          const values = line.split(",").map((v) => v.trim())
          return {
            id: String(Date.now() + index),
            lastName: values[0] || "",
            firstName: values[1] || "",
            company: values[2] || "",
            function: values[3] || "",
            site: values[4] || "",
            project: values[5] || "",
            accommodation: values[6] || "",
            startDate: values[7] || "",
            endDate: values[8] || "",
            trainings: [],
            certifications: [],
            passportPhoto: null,
            isFirstStay: false,
            reason: "",
            personWeightOutbound: "",
            personWeightReturn: "",
            baggageWeightOutbound: "",
            baggageWeightReturn: "",
            transportMethodOutbound: "",
            transportMethodReturn: "",
            pickupPoint: "",
          }
        })

      setTeamMembers(members)
    }
    reader.readAsText(file)
  }

  const handleDownloadTemplate = () => {
    const template =
      "Nom,Prénom,Entreprise,Fonction,Site,Projet,Hébergement,Date début,Date fin\nDupont,Jean,TotalEnergies,Ingénieur,Platform Alpha,Project X,Cabine Standard,2024-04-01,2024-04-30\n"
    const blob = new Blob([template], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "template_demande_equipe.csv"
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleAddMember = () => {
    const newMember: TeamMember = {
      id: String(Date.now()),
      lastName: "",
      firstName: "",
      company: "",
      function: "",
      site: commonData.site,
      project: commonData.project,
      accommodation: commonData.accommodation,
      startDate: commonData.startDate,
      endDate: commonData.endDate,
      trainings: [
        { id: "1", type: "Induction", obtainedDate: "", validityDate: "", mandatory: true },
        { id: "2", type: "Visite Médicale", obtainedDate: "", validityDate: "", mandatory: true },
        { id: "3", type: "SST", obtainedDate: "", validityDate: "", mandatory: true },
      ],
      certifications: [],
      passportPhoto: null,
      isFirstStay: false,
      reason: commonData.reason,
      personWeightOutbound: "",
      personWeightReturn: "",
      baggageWeightOutbound: "",
      baggageWeightReturn: "",
      transportMethodOutbound: "",
      transportMethodReturn: "",
      pickupPoint: "",
    }
    setTeamMembers([...teamMembers, newMember])
    setSelectedMemberId(newMember.id)
  }

  const handleRemoveMember = (id: string) => {
    setTeamMembers(teamMembers.filter((m) => m.id !== id))
    if (selectedMemberId === id) {
      setSelectedMemberId(null)
    }
  }

  const handleUpdateMember = (id: string, field: keyof TeamMember, value: any) => {
    setTeamMembers(teamMembers.map((m) => (m.id === id ? { ...m, [field]: value } : m)))
  }

  const handleAddTraining = (memberId: string) => {
    setTeamMembers(
      teamMembers.map((m) =>
        m.id === memberId
          ? {
              ...m,
              trainings: [
                ...m.trainings,
                { id: String(Date.now()), type: "", obtainedDate: "", validityDate: "", mandatory: false },
              ],
            }
          : m,
      ),
    )
  }

  const handleRemoveTraining = (memberId: string, trainingId: string) => {
    setTeamMembers(
      teamMembers.map((m) =>
        m.id === memberId ? { ...m, trainings: m.trainings.filter((t) => t.id !== trainingId) } : m,
      ),
    )
  }

  const handleUpdateTraining = (memberId: string, trainingId: string, field: keyof Training, value: any) => {
    setTeamMembers(
      teamMembers.map((m) =>
        m.id === memberId
          ? {
              ...m,
              trainings: m.trainings.map((t) => (t.id === trainingId ? { ...t, [field]: value } : t)),
            }
          : m,
      ),
    )
  }

  const handleAddCertification = (memberId: string) => {
    setTeamMembers(
      teamMembers.map((m) =>
        m.id === memberId
          ? {
              ...m,
              certifications: [
                ...m.certifications,
                { id: String(Date.now()), type: "", obtainedDate: "", validityDate: "" },
              ],
            }
          : m,
      ),
    )
  }

  const handleRemoveCertification = (memberId: string, certId: string) => {
    setTeamMembers(
      teamMembers.map((m) =>
        m.id === memberId ? { ...m, certifications: m.certifications.filter((c) => c.id !== certId) } : m,
      ),
    )
  }

  const handleUpdateCertification = (memberId: string, certId: string, field: keyof Certification, value: any) => {
    setTeamMembers(
      teamMembers.map((m) =>
        m.id === memberId
          ? {
              ...m,
              certifications: m.certifications.map((c) => (c.id === certId ? { ...c, [field]: value } : c)),
            }
          : m,
      ),
    )
  }

  const validateMembers = () => {
    const errors: Record<string, string[]> = {}

    teamMembers.forEach((member) => {
      const memberErrors: string[] = []

      if (!member.lastName) memberErrors.push("Nom requis")
      if (!member.firstName) memberErrors.push("Prénom requis")
      if (!member.company) memberErrors.push("Entreprise requise")
      if (!member.function) memberErrors.push("Fonction requise")
      if (!member.site) memberErrors.push("Site requis")
      if (!member.project) memberErrors.push("Projet requis")
      if (!member.startDate) memberErrors.push("Date début requise")
      if (!member.endDate) memberErrors.push("Date fin requise")
      if (!member.reason) memberErrors.push("Motif requis")

      if (memberErrors.length > 0) {
        errors[member.id] = memberErrors
      }
    })

    setValidationErrors(errors)
    return Object.keys(errors).length === 0
  }

  const handleSubmit = () => {
    if (validateMembers()) {
      console.log("[v0] Submitting team request:", teamMembers)
      // TODO: Implement actual submission
    }
  }

  const handleApplyCommonData = () => {
    setTeamMembers(
      teamMembers.map((m) => ({
        ...m,
        site: commonData.site || m.site,
        project: commonData.project || m.project,
        accommodation: commonData.accommodation || m.accommodation,
        startDate: commonData.startDate || m.startDate,
        endDate: commonData.endDate || m.endDate,
        reason: commonData.reason || m.reason,
      })),
    )
  }

  const getInitials = (firstName: string, lastName: string) => {
    const first = firstName?.trim().charAt(0).toUpperCase() || ""
    const last = lastName?.trim().charAt(0).toUpperCase() || ""
    return first + last || "?"
  }

  const handleClearFilters = () => {
    setFilters({
      site: "",
      status: "",
      isFirstStay: null,
    })
  }

  const displayMembers = filteredMembers
  const selectedMember = displayMembers.find((m) => m.id === selectedMemberId)

  return (
    <div className="flex min-h-0 flex-1 flex-col max-w-full">
      {/* Header */}
      <div className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 flex-shrink-0">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3 sm:p-4">
          <div className="flex items-center gap-2 sm:gap-3 w-full sm:w-auto">
            <Link href="/pobvue/requests">
              <Button variant="ghost" size="sm" className="gap-1 sm:gap-2 h-8 sm:h-9">
                <ChevronLeft className="h-3 w-3 sm:h-4 sm:w-4" />
                <span className="text-xs sm:text-sm">Retour</span>
              </Button>
            </Link>
            <div className="flex-1 sm:flex-none">
              <h1 className="text-sm sm:text-lg font-semibold flex items-center gap-2">
                <Users className="h-4 w-4 sm:h-5 sm:w-5" />
                <span className="hidden sm:inline">Demande de mobilisation d'équipe</span>
                <span className="sm:hidden">Mob. équipe</span>
              </h1>
              <div className="flex items-center gap-2 mt-1">
                <Badge
                  variant="secondary"
                  className="text-[10px] cursor-pointer hover:bg-secondary/80"
                  onClick={() => handleClearFilters()}
                >
                  Total: {teamMembers.length}
                </Badge>
                {filters.site || filters.isFirstStay !== null ? (
                  <Badge
                    variant="secondary"
                    className="text-[10px] cursor-pointer hover:bg-secondary/80 bg-primary/10"
                    onClick={() => setShowFiltersDrawer(true)}
                  >
                    Filtrés: {filteredMembers.length}
                  </Badge>
                ) : null}
              </div>
            </div>
          </div>
          {/* Changed: Removed + button and three-dot menu */}
          <div className="flex items-center gap-2 w-full sm:w-auto flex-wrap">
            <div className="flex items-center border rounded-md">
              <Button
                size="sm"
                variant={viewMode === "grid" ? "default" : "ghost"}
                onClick={() => setViewMode("grid")}
                className="rounded-r-none h-8 w-8 p-0"
              >
                <LayoutGrid className="h-4 w-4" />
              </Button>
              <Button
                size="sm"
                variant={viewMode === "table" ? "default" : "ghost"}
                onClick={() => setViewMode("table")}
                className="rounded-l-none h-8 w-8 p-0"
              >
                <Table2 className="h-4 w-4" />
              </Button>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleDownloadTemplate}
              className="gap-1 sm:gap-2 bg-transparent h-8 text-xs sm:text-sm"
            >
              <Download className="h-3 w-3 sm:h-4 sm:w-4" />
              <span className="hidden sm:inline">Modèle CSV</span>
              <span className="sm:hidden">CSV</span>
            </Button>
            <Button
              size="sm"
              onClick={handleSubmit}
              disabled={teamMembers.length === 0}
              className="gap-1 sm:gap-2 h-8 text-xs sm:text-sm"
            >
              <Save className="h-3 w-3 sm:h-4 sm:w-4" />
              Soumettre {teamMembers.length > 0 && `(${teamMembers.length})`}
            </Button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="min-h-0 flex-1 overflow-hidden flex flex-col max-w-full">
        {/* Common Data Section */}
        <div className="border-b bg-muted/30 flex-shrink-0 max-w-full">
          <Collapsible open={isCommonDataOpen} onOpenChange={setIsCommonDataOpen}>
            <div className="p-2">
              <Card className="p-2">
                <div className="flex items-center justify-between mb-2">
                  <CollapsibleTrigger asChild>
                    <Button variant="ghost" size="sm" className="gap-2 p-0 h-auto hover:bg-transparent">
                      <div className="flex items-center gap-2">
                        {isCommonDataOpen ? (
                          <ChevronUp className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        )}
                        <div className="text-left">
                          <h3 className="text-xs font-semibold">Informations communes</h3>
                          <p className="text-[10px] text-muted-foreground">Appliquées à tous les membres</p>
                        </div>
                      </div>
                    </Button>
                  </CollapsibleTrigger>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleApplyCommonData}
                    disabled={teamMembers.length === 0}
                    className="gap-1 bg-transparent h-7 text-xs"
                  >
                    Appliquer à tous
                  </Button>
                </div>
                <CollapsibleContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    <div className="space-y-1">
                      <label className="text-[10px] font-medium">Site</label>
                      <select
                        className="w-full px-2 py-1 border rounded-md text-xs focus:outline-none focus:ring-2 focus:ring-primary"
                        value={commonData.site}
                        onChange={(e) => setCommonData({ ...commonData, site: e.target.value })}
                      >
                        <option value="">Sélectionner</option>
                        <option value="Platform Alpha">Platform Alpha</option>
                        <option value="Subsea Site Beta">Subsea Site Beta</option>
                        <option value="Drilling Site Gamma">Drilling Site Gamma</option>
                        <option value="Offshore Platform A">Offshore Platform A</option>
                        <option value="Offshore Platform B">Offshore Platform B</option>
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-medium">Projet</label>
                      <input
                        type="text"
                        list="projects-list"
                        className="w-full px-2 py-1 border rounded-md text-xs focus:outline-none focus:ring-2 focus:ring-primary"
                        value={commonData.project}
                        onChange={(e) => setCommonData({ ...commonData, project: e.target.value })}
                        placeholder="Nom du projet"
                      />
                      <datalist id="projects-list">
                        {autocompleteSuggestions.projects.map((project) => (
                          <option key={project} value={project} />
                        ))}
                      </datalist>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-medium">Date début</label>
                      <input
                        type="date"
                        className="w-full px-2 py-1 border rounded-md text-xs focus:outline-none focus:ring-2 focus:ring-primary"
                        value={commonData.startDate}
                        onChange={(e) => setCommonData({ ...commonData, startDate: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-medium">Date fin</label>
                      <input
                        type="date"
                        className="w-full px-2 py-1 border rounded-md text-xs focus:outline-none focus:ring-2 focus:ring-primary"
                        value={commonData.endDate}
                        onChange={(e) => setCommonData({ ...commonData, endDate: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1 md:col-span-2">
                      <label className="text-[10px] font-medium">Hébergement</label>
                      <input
                        type="text"
                        list="accommodations-list"
                        className="w-full px-2 py-1 border rounded-md text-xs focus:outline-none focus:ring-2 focus:ring-primary"
                        value={commonData.accommodation}
                        onChange={(e) => setCommonData({ ...commonData, accommodation: e.target.value })}
                        placeholder="Type d'hébergement"
                      />
                      <datalist id="accommodations-list">
                        {autocompleteSuggestions.accommodations.map((accommodation) => (
                          <option key={accommodation} value={accommodation} />
                        ))}
                      </datalist>
                    </div>
                    <div className="space-y-1 md:col-span-2">
                      <label className="text-[10px] font-medium">Motif</label>
                      <input
                        type="text"
                        className="w-full px-2 py-1 border rounded-md text-xs focus:outline-none focus:ring-2 focus:ring-primary"
                        value={commonData.reason}
                        onChange={(e) => setCommonData({ ...commonData, reason: e.target.value })}
                        placeholder="Motif du séjour"
                      />
                    </div>
                  </div>
                </CollapsibleContent>
              </Card>
            </div>
          </Collapsible>
        </div>

        {viewMode === "grid" ? (
          // Grid View
          <div className="min-h-0 flex-1 overflow-hidden flex flex-col lg:flex-row">
            {/* Left Panel - Members List */}
            <div className="w-full lg:w-80 lg:flex-none border-b lg:border-b-0 lg:border-r flex flex-col max-h-[40vh] lg:max-h-none flex-shrink-0">
              <div className="p-3 border-b">
                <div className="space-y-2">
                  <input
                    type="file"
                    id="team-file-upload"
                    accept=".csv,.xls,.xlsx"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                  <label htmlFor="team-file-upload">
                    <div className="flex items-center gap-2 px-3 py-2 border rounded-md hover:border-primary/50 transition-colors cursor-pointer text-sm">
                      <FileSpreadsheet className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      <span className="text-muted-foreground flex-1 truncate text-xs">
                        {uploadedFile ? uploadedFile.name : "Importer CSV/XLS"}
                      </span>
                      {uploadedFile && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={(e) => {
                            e.preventDefault()
                            setUploadedFile(null)
                          }}
                          className="h-6 w-6 p-0"
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </label>
                  <Button size="sm" variant="outline" onClick={handleAddMember} className="w-full gap-2 bg-transparent">
                    <Plus className="h-4 w-4" />
                    Ajouter membre
                  </Button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-2">
                {displayMembers.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-center p-6">
                    <Users className="h-12 w-12 text-muted-foreground/50 mb-3" />
                    <p className="text-sm font-medium text-muted-foreground mb-1">
                      {teamMembers.length === 0 ? "Aucun membre" : "Aucun résultat"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {teamMembers.length === 0
                        ? "Importez un fichier ou ajoutez manuellement"
                        : "Modifiez les filtres pour voir plus de résultats"}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-1">
                    {displayMembers.map((member) => (
                      <Card
                        key={member.id}
                        className={`p-3 cursor-pointer transition-colors ${
                          selectedMemberId === member.id ? "bg-primary/10 border-primary" : "hover:bg-muted/50"
                        }`}
                        onClick={() => setSelectedMemberId(member.id)}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-start gap-2 flex-1 min-w-0">
                            <Avatar className="h-9 w-9 flex-shrink-0">
                              <AvatarImage
                                src={member.passportPhoto || undefined}
                                alt={`${member.firstName} ${member.lastName}`}
                              />
                              <AvatarFallback className="text-xs">
                                {getInitials(member.firstName, member.lastName)}
                              </AvatarFallback>
                            </Avatar>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">
                                {member.firstName || member.lastName
                                  ? `${member.firstName} ${member.lastName}`.trim()
                                  : "Nouveau membre"}
                              </p>
                              <p className="text-xs text-muted-foreground truncate">{member.company || "Entreprise"}</p>
                              {validationErrors[member.id] && (
                                <Badge variant="secondary" className="bg-red-500/10 text-red-700 text-[10px] mt-1">
                                  <AlertCircle className="h-3 w-3 mr-1" />
                                  {validationErrors[member.id].length} erreur
                                  {validationErrors[member.id].length > 1 ? "s" : ""}
                                </Badge>
                              )}
                            </div>
                          </div>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={(e) => {
                              e.stopPropagation()
                              handleRemoveMember(member.id)
                            }}
                            className="h-7 w-7 p-0 text-destructive hover:bg-destructive/10 flex-shrink-0"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Right Panel - Member Details */}
            <div className="flex-1 min-w-0 overflow-y-auto">
              {!selectedMember ? (
                <div className="flex flex-col items-center justify-center h-full text-center p-12">
                  <Users className="h-16 w-16 text-muted-foreground/50 mb-4" />
                  <p className="text-lg font-medium text-muted-foreground mb-2">Sélectionnez un membre</p>
                  <p className="text-sm text-muted-foreground">
                    Cliquez sur un membre dans la liste pour modifier ses informations
                  </p>
                </div>
              ) : (
                <div className="p-6 space-y-6">
                  {validationErrors[selectedMember.id] && (
                    <Alert variant="destructive">
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription className="text-sm">
                        <strong>Champs manquants:</strong> {validationErrors[selectedMember.id].join(", ")}
                      </AlertDescription>
                    </Alert>
                  )}

                  <Tabs defaultValue="info" className="w-full">
                    <TabsList className="grid w-full grid-cols-4">
                      <TabsTrigger value="info">Informations</TabsTrigger>
                      <TabsTrigger value="stay">Séjour</TabsTrigger>
                      <TabsTrigger value="trainings">Formations</TabsTrigger>
                      <TabsTrigger value="certs">Certifications</TabsTrigger>
                    </TabsList>

                    <TabsContent value="info" className="space-y-4 mt-4">
                      <Card className="p-4">
                        <h3 className="text-sm font-semibold mb-3">Informations personnelles</h3>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <label className="text-sm font-medium">Nom *</label>
                            <input
                              type="text"
                              className="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                              value={selectedMember.lastName}
                              onChange={(e) => handleUpdateMember(selectedMember.id, "lastName", e.target.value)}
                              placeholder="Nom de famille"
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="text-sm font-medium">Prénom *</label>
                            <input
                              type="text"
                              className="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                              value={selectedMember.firstName}
                              onChange={(e) => handleUpdateMember(selectedMember.id, "firstName", e.target.value)}
                              placeholder="Prénom"
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="text-sm font-medium">Entreprise *</label>
                            <input
                              type="text"
                              list="companies-list"
                              className="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                              value={selectedMember.company}
                              onChange={(e) => handleUpdateMember(selectedMember.id, "company", e.target.value)}
                              placeholder="Nom de l'entreprise"
                            />
                            <datalist id="companies-list">
                              {autocompleteSuggestions.companies.map((company) => (
                                <option key={company} value={company} />
                              ))}
                            </datalist>
                          </div>
                          <div className="space-y-2">
                            <label className="text-sm font-medium">Fonction *</label>
                            <input
                              type="text"
                              list="functions-list"
                              className="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                              value={selectedMember.function}
                              onChange={(e) => handleUpdateMember(selectedMember.id, "function", e.target.value)}
                              placeholder="Fonction / Poste"
                            />
                            <datalist id="functions-list">
                              {autocompleteSuggestions.functions.map((func) => (
                                <option key={func} value={func} />
                              ))}
                            </datalist>
                          </div>
                          <div className="space-y-2 col-span-2">
                            <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
                              <input
                                type="checkbox"
                                className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                                checked={selectedMember.isFirstStay}
                                onChange={(e) => handleUpdateMember(selectedMember.id, "isFirstStay", e.target.checked)}
                              />
                              Première visite sur site
                            </label>
                          </div>
                        </div>
                      </Card>
                    </TabsContent>

                    <TabsContent value="stay" className="space-y-4 mt-4">
                      <Card className="p-4">
                        <h3 className="text-sm font-semibold mb-3">Détails du séjour</h3>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <label className="text-sm font-medium">Site *</label>
                            <select
                              className="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                              value={selectedMember.site}
                              onChange={(e) => handleUpdateMember(selectedMember.id, "site", e.target.value)}
                            >
                              <option value="">Sélectionner un site</option>
                              <option value="Platform Alpha">Platform Alpha</option>
                              <option value="Subsea Site Beta">Subsea Site Beta</option>
                              <option value="Drilling Site Gamma">Drilling Site Gamma</option>
                              <option value="Offshore Platform A">Offshore Platform A</option>
                              <option value="Offshore Platform B">Offshore Platform B</option>
                            </select>
                          </div>
                          <div className="space-y-2">
                            <label className="text-sm font-medium">Projet *</label>
                            <input
                              type="text"
                              list="projects-list-detail"
                              className="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                              value={selectedMember.project}
                              onChange={(e) => handleUpdateMember(selectedMember.id, "project", e.target.value)}
                              placeholder="Nom du projet"
                            />
                            <datalist id="projects-list-detail">
                              {autocompleteSuggestions.projects.map((project) => (
                                <option key={project} value={project} />
                              ))}
                            </datalist>
                          </div>
                          <div className="space-y-2">
                            <label className="text-sm font-medium">Hébergement</label>
                            <input
                              type="text"
                              list="accommodations-list-detail"
                              className="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                              value={selectedMember.accommodation}
                              onChange={(e) => handleUpdateMember(selectedMember.id, "accommodation", e.target.value)}
                              placeholder="Type d'hébergement"
                            />
                            <datalist id="accommodations-list-detail">
                              {autocompleteSuggestions.accommodations.map((accommodation) => (
                                <option key={accommodation} value={accommodation} />
                              ))}
                            </datalist>
                          </div>
                          <div className="space-y-2">
                            <label className="text-sm font-medium">Date début *</label>
                            <input
                              type="date"
                              className="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                              value={selectedMember.startDate}
                              onChange={(e) => handleUpdateMember(selectedMember.id, "startDate", e.target.value)}
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="text-sm font-medium">Date fin *</label>
                            <input
                              type="date"
                              className="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                              value={selectedMember.endDate}
                              onChange={(e) => handleUpdateMember(selectedMember.id, "endDate", e.target.value)}
                            />
                          </div>
                        </div>
                        <div className="mt-4 space-y-2">
                          <label className="text-sm font-medium">Motif du séjour *</label>
                          <textarea
                            className="w-full px-3 py-2 border rounded-md text-sm min-h-[100px] focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                            value={selectedMember.reason}
                            onChange={(e) => handleUpdateMember(selectedMember.id, "reason", e.target.value)}
                            placeholder="Décrivez le motif de la demande..."
                          />
                        </div>
                      </Card>

                      <Card className="p-4">
                        <h3 className="text-sm font-semibold mb-3">Données physiques</h3>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <label className="text-sm font-medium">Poids personne aller (kg)</label>
                            <input
                              type="number"
                              step="0.1"
                              className="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                              value={selectedMember.personWeightOutbound}
                              onChange={(e) =>
                                handleUpdateMember(selectedMember.id, "personWeightOutbound", e.target.value)
                              }
                              placeholder="Ex: 75"
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="text-sm font-medium">Poids personne retour (kg)</label>
                            <input
                              type="number"
                              step="0.1"
                              className="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                              value={selectedMember.personWeightReturn}
                              onChange={(e) =>
                                handleUpdateMember(selectedMember.id, "personWeightReturn", e.target.value)
                              }
                              placeholder="Ex: 75"
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="text-sm font-medium">Poids baggage aller (kg)</label>
                            <input
                              type="number"
                              step="0.1"
                              className="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                              value={selectedMember.baggageWeightOutbound}
                              onChange={(e) =>
                                handleUpdateMember(selectedMember.id, "baggageWeightOutbound", e.target.value)
                              }
                              placeholder="Ex: 20"
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="text-sm font-medium">Poids baggage retour (kg)</label>
                            <input
                              type="number"
                              step="0.1"
                              className="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                              value={selectedMember.baggageWeightReturn}
                              onChange={(e) =>
                                handleUpdateMember(selectedMember.id, "baggageWeightReturn", e.target.value)
                              }
                              placeholder="Ex: 20"
                            />
                          </div>
                        </div>
                      </Card>

                      <Card className="p-4">
                        <h3 className="text-sm font-semibold mb-3">Moyens de transport</h3>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <label className="text-sm font-medium">Moyen de départ (aller)</label>
                            <select
                              className="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                              value={selectedMember.transportMethodOutbound}
                              onChange={(e) =>
                                handleUpdateMember(selectedMember.id, "transportMethodOutbound", e.target.value)
                              }
                            >
                              <option value="">Sélectionner</option>
                              <option value="bateau">Bateau</option>
                              <option value="helico">Hélico</option>
                              <option value="vehicule">Véhicule</option>
                              <option value="surfer">Surfer</option>
                            </select>
                          </div>
                          <div className="space-y-2">
                            <label className="text-sm font-medium">Moyen de retour</label>
                            <select
                              className="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                              value={selectedMember.transportMethodReturn}
                              onChange={(e) =>
                                handleUpdateMember(selectedMember.id, "transportMethodReturn", e.target.value)
                              }
                            >
                              <option value="">Sélectionner</option>
                              <option value="bateau">Bateau</option>
                              <option value="helico">Hélico</option>
                              <option value="vehicule">Véhicule</option>
                              <option value="surfer">Surfer</option>
                            </select>
                          </div>
                          <div className="space-y-2 col-span-2">
                            <label className="text-sm font-medium">Point de ramassage</label>
                            <input
                              type="text"
                              className="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                              value={selectedMember.pickupPoint}
                              onChange={(e) => handleUpdateMember(selectedMember.id, "pickupPoint", e.target.value)}
                              placeholder="Ex: Port de Luanda, Aéroport..."
                            />
                          </div>
                        </div>
                      </Card>
                    </TabsContent>

                    <TabsContent value="trainings" className="space-y-4 mt-4">
                      <Card className="p-4">
                        <div className="flex items-center justify-between mb-3">
                          <h3 className="text-sm font-semibold">Formations et habilitations</h3>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleAddTraining(selectedMember.id)}
                            className="gap-2"
                          >
                            <Plus className="h-4 w-4" />
                            Ajouter
                          </Button>
                        </div>
                        <div className="space-y-3">
                          {selectedMember.trainings.map((training) => (
                            <div key={training.id} className="p-3 border rounded-md bg-muted/30 space-y-3">
                              <div className="flex items-start gap-2">
                                <div className="flex-1 space-y-3">
                                  <div className="space-y-1.5">
                                    <label className="text-xs font-medium">Type de formation</label>
                                    <input
                                      type="text"
                                      className="w-full px-2 py-1.5 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-background"
                                      value={training.type}
                                      onChange={(e) =>
                                        handleUpdateTraining(selectedMember.id, training.id, "type", e.target.value)
                                      }
                                      placeholder="Ex: Induction, SST..."
                                    />
                                  </div>
                                  <div className="grid grid-cols-2 gap-2">
                                    <div className="space-y-1.5">
                                      <label className="text-xs font-medium">Date obtention</label>
                                      <input
                                        type="date"
                                        className="w-full px-2 py-1.5 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-background"
                                        value={training.obtainedDate}
                                        onChange={(e) =>
                                          handleUpdateTraining(
                                            selectedMember.id,
                                            training.id,
                                            "obtainedDate",
                                            e.target.value,
                                          )
                                        }
                                      />
                                    </div>
                                    <div className="space-y-1.5">
                                      <label className="text-xs font-medium">Date validité</label>
                                      <input
                                        type="date"
                                        className="w-full px-2 py-1.5 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-background"
                                        value={training.validityDate}
                                        onChange={(e) =>
                                          handleUpdateTraining(
                                            selectedMember.id,
                                            training.id,
                                            "validityDate",
                                            e.target.value,
                                          )
                                        }
                                      />
                                    </div>
                                  </div>
                                </div>
                                {!training.mandatory && (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => handleRemoveTraining(selectedMember.id, training.id)}
                                    className="h-8 w-8 p-0 text-destructive hover:bg-destructive/10"
                                  >
                                    <X className="h-4 w-4" />
                                  </Button>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </Card>
                    </TabsContent>

                    <TabsContent value="certs" className="space-y-4 mt-4">
                      <Card className="p-4">
                        <div className="flex items-center justify-between mb-3">
                          <h3 className="text-sm font-semibold">Certifications</h3>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleAddCertification(selectedMember.id)}
                            className="gap-2"
                          >
                            <Plus className="h-4 w-4" />
                            Ajouter
                          </Button>
                        </div>
                        <div className="space-y-3">
                          {selectedMember.certifications.length === 0 ? (
                            <div className="text-sm text-muted-foreground text-center py-8 border-2 border-dashed rounded-md">
                              Aucune certification ajoutée
                            </div>
                          ) : (
                            selectedMember.certifications.map((cert) => (
                              <div key={cert.id} className="flex items-start gap-2 p-3 border rounded-md bg-muted/30">
                                <div className="flex-1 space-y-3">
                                  <div className="space-y-1.5">
                                    <label className="text-xs font-medium">Type de certification</label>
                                    <input
                                      type="text"
                                      className="w-full px-2 py-1.5 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-background"
                                      value={cert.type}
                                      onChange={(e) =>
                                        handleUpdateCertification(selectedMember.id, cert.id, "type", e.target.value)
                                      }
                                      placeholder="Ex: CACES, ATEX..."
                                    />
                                  </div>
                                  <div className="grid grid-cols-2 gap-2">
                                    <div className="space-y-1.5">
                                      <label className="text-xs font-medium">Date obtention</label>
                                      <input
                                        type="date"
                                        className="w-full px-2 py-1.5 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-background"
                                        value={cert.obtainedDate}
                                        onChange={(e) =>
                                          handleUpdateCertification(
                                            selectedMember.id,
                                            cert.id,
                                            "obtainedDate",
                                            e.target.value,
                                          )
                                        }
                                      />
                                    </div>
                                    <div className="space-y-1.5">
                                      <label className="text-xs font-medium">Date validité</label>
                                      <input
                                        type="date"
                                        className="w-full px-2 py-1.5 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-background"
                                        value={cert.validityDate}
                                        onChange={(e) =>
                                          handleUpdateCertification(
                                            selectedMember.id,
                                            cert.id,
                                            "validityDate",
                                            e.target.value,
                                          )
                                        }
                                      />
                                    </div>
                                  </div>
                                </div>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => handleRemoveCertification(selectedMember.id, cert.id)}
                                  className="h-8 w-8 p-0 text-destructive hover:bg-destructive/10"
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              </div>
                            ))
                          )}
                        </div>
                      </Card>
                    </TabsContent>
                  </Tabs>
                </div>
              )}
            </div>
          </div>
        ) : (
          // Table View
          <div className="min-h-0 min-w-0 flex-1 max-w-full overflow-hidden p-2 sm:p-3">
            <Card className="h-full max-w-full flex flex-col overflow-hidden shadow-sm p-3">
              <div className="p-2 border-b bg-background flex items-center gap-2 flex-wrap flex-shrink-0">
                <input
                  type="file"
                  id="team-file-upload-table"
                  accept=".csv,.xls,.xlsx"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <label htmlFor="team-file-upload-table">
                  <Button size="sm" variant="outline" className="gap-2 bg-transparent">
                    <FileSpreadsheet className="h-4 w-4" />
                    <span className="hidden sm:inline">Importer CSV/XLS</span>
                  </Button>
                </label>
                <Button size="sm" variant="outline" onClick={handleAddMember} className="gap-2 bg-transparent">
                  <Plus className="h-4 w-4" />
                  <span className="hidden sm:inline">Ajouter ligne</span>
                </Button>
              </div>

              <div className="flex-1 max-w-full overflow-auto">
                {displayMembers.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-center p-12">
                    <Table2 className="h-16 w-16 text-muted-foreground/50 mb-4" />
                    <p className="text-lg font-medium text-muted-foreground mb-2">
                      {teamMembers.length === 0 ? "Aucune donnée" : "Aucun résultat"}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {teamMembers.length === 0
                        ? "Importez un fichier CSV/XLS ou ajoutez des lignes manuellement"
                        : "Modifiez les filtres pour voir plus de résultats"}
                    </p>
                  </div>
                ) : (
                  <div className="min-w-max">
                    <table className="w-full border-collapse text-xs">
                      <thead className="sticky top-0 bg-muted z-10">
                        <tr>
                          <th className="border p-2 text-left font-medium w-8">#</th>
                          <th className="border p-2 text-center font-medium" style={{ width: "50px" }}>
                            Avatar
                          </th>
                          <th className="border p-2 text-left font-medium" style={{ width: "100px" }}>
                            Nom *
                          </th>
                          <th className="border p-2 text-left font-medium" style={{ width: "100px" }}>
                            Prénom *
                          </th>
                          <th className="border p-2 text-left font-medium" style={{ width: "120px" }}>
                            Entreprise *
                          </th>
                          <th className="border p-2 text-left font-medium" style={{ width: "100px" }}>
                            Fonction *
                          </th>
                          <th className="border p-2 text-left font-medium" style={{ width: "120px" }}>
                            Site *
                          </th>
                          <th className="border p-2 text-left font-medium" style={{ width: "100px" }}>
                            Projet *
                          </th>
                          <th className="border p-2 text-left font-medium" style={{ width: "100px" }}>
                            Hébergement
                          </th>
                          <th className="border p-2 text-left font-medium" style={{ width: "110px" }}>
                            Date début *
                          </th>
                          <th className="border p-2 text-left font-medium" style={{ width: "110px" }}>
                            Date fin *
                          </th>
                          <th className="border p-2 text-left font-medium" style={{ width: "150px" }}>
                            Motif *
                          </th>
                          <th className="border p-2 text-left font-medium" style={{ width: "80px" }}>
                            Poids P. (A)
                          </th>
                          <th className="border p-2 text-left font-medium" style={{ width: "80px" }}>
                            Poids P. (R)
                          </th>
                          <th className="border p-2 text-left font-medium" style={{ width: "80px" }}>
                            Poids B. (A)
                          </th>
                          <th className="border p-2 text-left font-medium" style={{ width: "80px" }}>
                            Poids B. (R)
                          </th>
                          <th className="border p-2 text-left font-medium" style={{ width: "100px" }}>
                            Transport (A)
                          </th>
                          <th className="border p-2 text-left font-medium" style={{ width: "100px" }}>
                            Transport (R)
                          </th>
                          <th className="border p-2 text-left font-medium" style={{ width: "120px" }}>
                            Point ramassage
                          </th>
                          <th className="border p-2 text-center font-medium" style={{ width: "80px" }}>
                            Formations
                          </th>
                          <th className="border p-2 text-center font-medium" style={{ width: "80px" }}>
                            Certifs
                          </th>
                          <th className="border p-2 text-center font-medium" style={{ width: "70px" }}>
                            1ère visite
                          </th>
                          <th className="border p-2 text-center font-medium" style={{ width: "70px" }}>
                            Passeport
                          </th>
                          <th className="border p-2 text-center font-medium w-16">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {displayMembers.map((member, index) => (
                          <tr key={member.id} className="hover:bg-muted/50">
                            <td className="border p-1 text-center text-muted-foreground">{index + 1}</td>
                            <td className="border p-1">
                              <div className="flex justify-center">
                                <Avatar className="h-8 w-8">
                                  <AvatarImage
                                    src={member.passportPhoto || undefined}
                                    alt={`${member.firstName} ${member.lastName}`}
                                  />
                                  <AvatarFallback className="text-[10px]">
                                    {getInitials(member.firstName, member.lastName)}
                                  </AvatarFallback>
                                </Avatar>
                              </div>
                            </td>
                            <td className="border p-1">
                              <input
                                type="text"
                                className="w-full px-2 py-1 text-xs border-0 focus:outline-none focus:ring-1 focus:ring-primary rounded"
                                value={member.lastName}
                                onChange={(e) => handleUpdateMember(member.id, "lastName", e.target.value)}
                                placeholder="Nom"
                              />
                            </td>
                            <td className="border p-1">
                              <input
                                type="text"
                                className="w-full px-2 py-1 text-xs border-0 focus:outline-none focus:ring-1 focus:ring-primary rounded"
                                value={member.firstName}
                                onChange={(e) => handleUpdateMember(member.id, "firstName", e.target.value)}
                                placeholder="Prénom"
                              />
                            </td>
                            <td className="border p-1">
                              <input
                                type="text"
                                list="companies-list-table"
                                className="w-full px-2 py-1 text-xs border-0 focus:outline-none focus:ring-1 focus:ring-primary rounded"
                                value={member.company}
                                onChange={(e) => handleUpdateMember(member.id, "company", e.target.value)}
                                placeholder="Entreprise"
                              />
                            </td>
                            <td className="border p-1">
                              <input
                                type="text"
                                list="functions-list-table"
                                className="w-full px-2 py-1 text-xs border-0 focus:outline-none focus:ring-1 focus:ring-primary rounded"
                                value={member.function}
                                onChange={(e) => handleUpdateMember(member.id, "function", e.target.value)}
                                placeholder="Fonction"
                              />
                            </td>
                            <td className="border p-1">
                              <select
                                className="w-full px-2 py-1 text-xs border-0 focus:outline-none focus:ring-1 focus:ring-primary rounded bg-background"
                                value={member.site}
                                onChange={(e) => handleUpdateMember(member.id, "site", e.target.value)}
                              >
                                <option value="">Sélectionner</option>
                                <option value="Platform Alpha">Platform Alpha</option>
                                <option value="Subsea Site Beta">Subsea Site Beta</option>
                                <option value="Drilling Site Gamma">Drilling Site Gamma</option>
                                <option value="Offshore Platform A">Offshore Platform A</option>
                                <option value="Offshore Platform B">Offshore Platform B</option>
                              </select>
                            </td>
                            <td className="border p-1">
                              <input
                                type="text"
                                list="projects-list-table"
                                className="w-full px-2 py-1 text-xs border-0 focus:outline-none focus:ring-1 focus:ring-primary rounded"
                                value={member.project}
                                onChange={(e) => handleUpdateMember(member.id, "project", e.target.value)}
                                placeholder="Projet"
                              />
                            </td>
                            <td className="border p-1">
                              <input
                                type="text"
                                list="accommodations-list-table"
                                className="w-full px-2 py-1 text-xs border-0 focus:outline-none focus:ring-1 focus:ring-primary rounded"
                                value={member.accommodation}
                                onChange={(e) => handleUpdateMember(member.id, "accommodation", e.target.value)}
                                placeholder="Hébergement"
                              />
                            </td>
                            <td className="border p-1">
                              <input
                                type="date"
                                className="w-full px-2 py-1 text-xs border-0 focus:outline-none focus:ring-1 focus:ring-primary rounded"
                                value={member.startDate}
                                onChange={(e) => handleUpdateMember(member.id, "startDate", e.target.value)}
                              />
                            </td>
                            <td className="border p-1">
                              <input
                                type="date"
                                className="w-full px-2 py-1 text-xs border-0 focus:outline-none focus:ring-1 focus:ring-primary rounded"
                                value={member.endDate}
                                onChange={(e) => handleUpdateMember(member.id, "endDate", e.target.value)}
                              />
                            </td>
                            <td className="border p-1">
                              <input
                                type="text"
                                className="w-full px-2 py-1 text-xs border-0 focus:outline-none focus:ring-1 focus:ring-primary rounded"
                                value={member.reason}
                                onChange={(e) => handleUpdateMember(member.id, "reason", e.target.value)}
                                placeholder="Motif"
                              />
                            </td>
                            <td className="border p-1">
                              <input
                                type="number"
                                step="0.1"
                                className="w-full px-2 py-1 text-xs border-0 focus:outline-none focus:ring-1 focus:ring-primary rounded"
                                value={member.personWeightOutbound}
                                onChange={(e) => handleUpdateMember(member.id, "personWeightOutbound", e.target.value)}
                                placeholder="kg"
                              />
                            </td>
                            <td className="border p-1">
                              <input
                                type="number"
                                step="0.1"
                                className="w-full px-2 py-1 text-xs border-0 focus:outline-none focus:ring-1 focus:ring-primary rounded"
                                value={member.personWeightReturn}
                                onChange={(e) => handleUpdateMember(member.id, "personWeightReturn", e.target.value)}
                                placeholder="kg"
                              />
                            </td>
                            <td className="border p-1">
                              <input
                                type="number"
                                step="0.1"
                                className="w-full px-2 py-1 text-xs border-0 focus:outline-none focus:ring-1 focus:ring-primary rounded"
                                value={member.baggageWeightOutbound}
                                onChange={(e) => handleUpdateMember(member.id, "baggageWeightOutbound", e.target.value)}
                                placeholder="kg"
                              />
                            </td>
                            <td className="border p-1">
                              <input
                                type="number"
                                step="0.1"
                                className="w-full px-2 py-1 text-xs border-0 focus:outline-none focus:ring-1 focus:ring-primary rounded"
                                value={member.baggageWeightReturn}
                                onChange={(e) => handleUpdateMember(member.id, "baggageWeightReturn", e.target.value)}
                                placeholder="kg"
                              />
                            </td>
                            <td className="border p-1">
                              <select
                                className="w-full px-2 py-1 text-xs border-0 focus:outline-none focus:ring-1 focus:ring-primary rounded bg-background"
                                value={member.transportMethodOutbound}
                                onChange={(e) =>
                                  handleUpdateMember(member.id, "transportMethodOutbound", e.target.value)
                                }
                              >
                                <option value="">-</option>
                                <option value="bateau">Bateau</option>
                                <option value="helico">Hélico</option>
                                <option value="vehicule">Véhicule</option>
                                <option value="surfer">Surfer</option>
                              </select>
                            </td>
                            <td className="border p-1">
                              <select
                                className="w-full px-2 py-1 text-xs border-0 focus:outline-none focus:ring-1 focus:ring-primary rounded bg-background"
                                value={member.transportMethodReturn}
                                onChange={(e) => handleUpdateMember(member.id, "transportMethodReturn", e.target.value)}
                              >
                                <option value="">-</option>
                                <option value="bateau">Bateau</option>
                                <option value="helico">Hélico</option>
                                <option value="vehicule">Véhicule</option>
                                <option value="surfer">Surfer</option>
                              </select>
                            </td>
                            <td className="border p-1">
                              <input
                                type="text"
                                className="w-full px-2 py-1 text-xs border-0 focus:outline-none focus:ring-1 focus:ring-primary rounded"
                                value={member.pickupPoint}
                                onChange={(e) => handleUpdateMember(member.id, "pickupPoint", e.target.value)}
                                placeholder="Point"
                              />
                            </td>
                            <td className="border p-1 text-center">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                  setEditingMemberId(member.id)
                                  setShowTrainingsDialog(true)
                                }}
                                className="h-7 w-full p-0 hover:bg-primary/10"
                              >
                                <Badge variant="secondary" className="text-[10px] gap-1">
                                  <GraduationCap className="h-3 w-3" />
                                  {member.trainings.length}
                                </Badge>
                              </Button>
                            </td>
                            <td className="border p-1 text-center">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                  setEditingMemberId(member.id)
                                  setShowCertificationsDialog(true)
                                }}
                                className="h-7 w-full p-0 hover:bg-primary/10"
                              >
                                <Badge variant="secondary" className="text-[10px] gap-1">
                                  <Award className="h-3 w-3" />
                                  {member.certifications.length}
                                </Badge>
                              </Button>
                            </td>
                            <td className="border p-1 text-center">
                              <input
                                type="checkbox"
                                className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                                checked={member.isFirstStay}
                                onChange={(e) => handleUpdateMember(member.id, "isFirstStay", e.target.checked)}
                              />
                            </td>
                            <td className="border p-1 text-center">
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 w-7 p-0 hover:bg-primary/10"
                                title="Upload passport photo"
                              >
                                <Camera className="h-3.5 w-3.5" />
                              </Button>
                            </td>
                            <td className="border p-1 text-center">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleRemoveMember(member.id)}
                                className="h-7 w-7 p-0 text-destructive hover:bg-destructive/10"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <datalist id="companies-list-table">
                      {autocompleteSuggestions.companies.map((company) => (
                        <option key={company} value={company} />
                      ))}
                    </datalist>
                    <datalist id="functions-list-table">
                      {autocompleteSuggestions.functions.map((func) => (
                        <option key={func} value={func} />
                      ))}
                    </datalist>
                    <datalist id="projects-list-table">
                      {autocompleteSuggestions.projects.map((project) => (
                        <option key={project} value={project} />
                      ))}
                    </datalist>
                    <datalist id="accommodations-list-table">
                      {autocompleteSuggestions.accommodations.map((accommodation) => (
                        <option key={accommodation} value={accommodation} />
                      ))}
                    </datalist>
                  </div>
                )}
              </div>
            </Card>
          </div>
        )}
      </div>

      <Drawer open={showFiltersDrawer} onOpenChange={setShowFiltersDrawer} direction="right">
        <DrawerContent className="fixed right-0 top-0 bottom-0 w-80 max-w-full">
          <DrawerHeader>
            <DrawerTitle>Filtres</DrawerTitle>
            <DrawerDescription>Filtrer les membres par critères</DrawerDescription>
          </DrawerHeader>
          <div className="p-4 space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Site</label>
              <select
                className="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                value={filters.site}
                onChange={(e) => setFilters({ ...filters, site: e.target.value })}
              >
                <option value="">Tous les sites</option>
                <option value="Platform Alpha">Platform Alpha</option>
                <option value="Subsea Site Beta">Subsea Site Beta</option>
                <option value="Drilling Site Gamma">Drilling Site Gamma</option>
                <option value="Offshore Platform A">Offshore Platform A</option>
                <option value="Offshore Platform B">Offshore Platform B</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Première visite</label>
              <select
                className="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                value={filters.isFirstStay === null ? "" : filters.isFirstStay.toString()}
                onChange={(e) =>
                  setFilters({
                    ...filters,
                    isFirstStay: e.target.value === "" ? null : e.target.value === "true",
                  })
                }
              >
                <option value="">Tous</option>
                <option value="true">Oui</option>
                <option value="false">Non</option>
              </select>
            </div>
            <div className="flex items-center justify-between pt-4 border-t">
              <p className="text-sm text-muted-foreground">
                {filteredMembers.length} résultat{filteredMembers.length > 1 ? "s" : ""}
              </p>
              <Button variant="outline" size="sm" onClick={handleClearFilters}>
                Réinitialiser
              </Button>
            </div>
          </div>
          <DrawerFooter>
            <DrawerClose asChild>
              <Button>Fermer</Button>
            </DrawerClose>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>

      {/* Trainings Dialog */}
      <Dialog open={showTrainingsDialog} onOpenChange={setShowTrainingsDialog}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Formations et habilitations</DialogTitle>
            <DialogDescription>
              Gérer les formations obligatoires et optionnelles pour{" "}
              {editingMemberId &&
                teamMembers.find((m) => m.id === editingMemberId) &&
                `${teamMembers.find((m) => m.id === editingMemberId)?.firstName} ${teamMembers.find((m) => m.id === editingMemberId)?.lastName}`}
            </DialogDescription>
          </DialogHeader>
          {editingMemberId && (
            <div className="space-y-3">
              {teamMembers
                .find((m) => m.id === editingMemberId)
                ?.trainings.map((training) => (
                  <div key={training.id} className="p-3 border rounded-md bg-muted/30 space-y-3">
                    <div className="flex items-start gap-2">
                      <div className="flex-1 space-y-3">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 space-y-1.5">
                            <label className="text-xs font-medium">Type de formation</label>
                            <input
                              type="text"
                              className="w-full px-2 py-1.5 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-background"
                              value={training.type}
                              onChange={(e) =>
                                handleUpdateTraining(editingMemberId, training.id, "type", e.target.value)
                              }
                              placeholder="Ex: Induction, SST..."
                            />
                          </div>
                          {training.mandatory && (
                            <Badge variant="secondary" className="bg-orange-500/10 text-orange-700 text-[10px] mt-5">
                              Obligatoire
                            </Badge>
                          )}
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1.5">
                            <label className="text-xs font-medium">Date obtention</label>
                            <input
                              type="date"
                              className="w-full px-2 py-1.5 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-background"
                              value={training.obtainedDate}
                              onChange={(e) =>
                                handleUpdateTraining(editingMemberId, training.id, "obtainedDate", e.target.value)
                              }
                            />
                          </div>
                          <div className="space-y-1.5">
                            <label className="text-xs font-medium">Date validité</label>
                            <input
                              type="date"
                              className="w-full px-2 py-1.5 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-background"
                              value={training.validityDate}
                              onChange={(e) =>
                                handleUpdateTraining(editingMemberId, training.id, "validityDate", e.target.value)
                              }
                            />
                          </div>
                        </div>
                      </div>
                      {!training.mandatory && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleRemoveTraining(editingMemberId, training.id)}
                          className="h-8 w-8 p-0 text-destructive hover:bg-destructive/10"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleAddTraining(editingMemberId)}
                className="w-full gap-2"
              >
                <Plus className="h-4 w-4" />
                Ajouter une formation
              </Button>
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setShowTrainingsDialog(false)}>Fermer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Certifications Dialog */}
      <Dialog open={showCertificationsDialog} onOpenChange={setShowCertificationsDialog}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Certifications</DialogTitle>
            <DialogDescription>
              Gérer les certifications pour{" "}
              {editingMemberId &&
                teamMembers.find((m) => m.id === editingMemberId) &&
                `${teamMembers.find((m) => m.id === editingMemberId)?.firstName} ${teamMembers.find((m) => m.id === editingMemberId)?.lastName}`}
            </DialogDescription>
          </DialogHeader>
          {editingMemberId && (
            <div className="space-y-3">
              {teamMembers.find((m) => m.id === editingMemberId)?.certifications.length === 0 ? (
                <div className="text-sm text-muted-foreground text-center py-8 border-2 border-dashed rounded-md">
                  Aucune certification ajoutée
                </div>
              ) : (
                teamMembers
                  .find((m) => m.id === editingMemberId)
                  ?.certifications.map((cert) => (
                    <div key={cert.id} className="flex items-start gap-2 p-3 border rounded-md bg-muted/30">
                      <div className="flex-1 space-y-3">
                        <div className="space-y-1.5">
                          <label className="text-xs font-medium">Type de certification</label>
                          <input
                            type="text"
                            className="w-full px-2 py-1.5 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-background"
                            value={cert.type}
                            onChange={(e) =>
                              handleUpdateCertification(editingMemberId, cert.id, "type", e.target.value)
                            }
                            placeholder="Ex: CACES, ATEX..."
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1.5">
                            <label className="text-xs font-medium">Date obtention</label>
                            <input
                              type="date"
                              className="w-full px-2 py-1.5 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-background"
                              value={cert.obtainedDate}
                              onChange={(e) =>
                                handleUpdateCertification(editingMemberId, cert.id, "obtainedDate", e.target.value)
                              }
                            />
                          </div>
                          <div className="space-y-1.5">
                            <label className="text-xs font-medium">Date validité</label>
                            <input
                              type="date"
                              className="w-full px-2 py-1.5 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-background"
                              value={cert.validityDate}
                              onChange={(e) =>
                                handleUpdateCertification(editingMemberId, cert.id, "validityDate", e.target.value)
                              }
                            />
                          </div>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleRemoveCertification(editingMemberId, cert.id)}
                        className="h-8 w-8 p-0 text-destructive hover:bg-destructive/10"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))
              )}
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleAddCertification(editingMemberId)}
                className="w-full gap-2"
              >
                <Plus className="h-4 w-4" />
                Ajouter une certification
              </Button>
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setShowCertificationsDialog(false)}>Fermer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
