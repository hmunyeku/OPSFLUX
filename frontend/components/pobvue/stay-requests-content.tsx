"use client"

import { useState, useEffect } from "react"
import { mockStayRequests, type StayRequest } from "@/lib/pobvue-data"
import { StayRequestsApi, type StayRequest as ApiStayRequest } from "@/lib/stay-requests-api"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Plus,
  Filter,
  MapPin,
  Calendar,
  CheckCircle2,
  XCircle,
  Clock,
  MoreVertical,
  X,
  Send,
  LayoutGrid,
  TableIcon,
  Check,
  Ban,
  Camera,
  Upload,
  AlertTriangle,
  Building2,
  Users,
} from "lucide-react"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import type { DateRange } from "react-day-picker"
import { useHeaderContext } from "@/components/header-context"
import { ButtonGroup } from "@/components/ui/button-group"
import Link from "next/link"
import { ContactAutocomplete, type Contact } from "@/src/components/pobvue/contact-autocomplete"
import { LocationPicker, type Location } from "@/src/components/pobvue/location-picker"
import {
  isEndDateAfterStartDate,
  isDateExpired,
  getValidityDateClassName,
  getExpiredDateMessage,
  formatDateForInput,
  parseDateFromInput,
  getMinEndDate,
} from "@/src/lib/date-validations"

const statusColors = {
  draft: "bg-gray-500/10 text-gray-700 dark:text-gray-400",
  pending: "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400",
  "in-validation": "bg-blue-500/10 text-blue-700 dark:text-blue-400",
  approved: "bg-green-500/10 text-green-700 dark:text-green-700",
  rejected: "bg-red-500/10 text-red-700 dark:text-red-700",
  cancelled: "bg-gray-500/10 text-gray-700 dark:text-gray-400",
}

interface DatePeriod {
  id: string
  startDate: Date | undefined
  endDate: Date | undefined
}

interface TrainingDate {
  id: string
  type: string
  date: Date | undefined
  validity: Date | undefined
  mandatory: boolean
}

interface Certification {
  id: string
  type: string
  date: Date | undefined
  validity: Date | undefined
}

export function StayRequestsContent() {
  const [searchQuery, setSearchQuery] = useState("")
  const [requests, setRequests] = useState<StayRequest[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showNewRequestForm, setShowNewRequestForm] = useState(false)
  const [showSendLinkDialog, setShowSendLinkDialog] = useState(false)
  const [showFiltersDrawer, setShowFiltersDrawer] = useState(false)
  const [linkEmail, setLinkEmail] = useState("")
  const [viewMode, setViewMode] = useState<"grid" | "table">("grid")
  const [selectedRequests, setSelectedRequests] = useState<string[]>([])
  const [selectedRequest, setSelectedRequest] = useState<StayRequest | null>(null)
  const [showDetailDrawer, setShowDetailDrawer] = useState(false)
  const [showApprovalDialog, setShowApprovalDialog] = useState(false)
  const [approvalAction, setApprovalAction] = useState<"approve" | "reject">("approve")
  const [approvalNote, setApprovalNote] = useState("")
  const [activeStatusFilter, setActiveStatusFilter] = useState<string | null>(null)

  const [filters, setFilters] = useState({
    status: [] as string[],
    site: [] as string[],
    project: [] as string[],
    isFirstStay: null as boolean | null,
    dateRange: { from: undefined, to: undefined } as { from: Date | undefined; to: Date | undefined },
  })

  const [rejectionAlternativeDates, setRejectionAlternativeDates] = useState<DatePeriod[]>([])

  const { setContextualHeader, clearContextualHeader } = useHeaderContext()

  const [formData, setFormData] = useState({
    contact: null as Contact | null,
    function: "",
    contactFound: false,
    destinations: [] as string[],
    accommodation: "",
    project: "",
    costCenter: "",
    isFirstStay: false,
    pickupLocation: null as Location | null,
  })

  const [validationErrors, setValidationErrors] = useState({
    dates: "",
    trainings: [] as string[],
    contact: "",
  })

  const [dateRange, setDateRange] = useState<DateRange | undefined>()
  const [additionalPeriods, setAdditionalPeriods] = useState<DateRange[]>([])
  const [datePeriods, setDatePeriods] = useState<DatePeriod[]>([])

  const [trainingDates, setTrainingDates] = useState<TrainingDate[]>([
    { id: "1", type: "Induction", date: undefined, validity: undefined, mandatory: true },
    { id: "2", type: "Visite Médicale", date: undefined, validity: undefined, mandatory: true },
    { id: "3", type: "Lutte Incendie", date: undefined, validity: undefined, mandatory: true },
    { id: "4", type: "SST", date: undefined, validity: undefined, mandatory: true },
  ])

  const [certifications, setCertifications] = useState<Certification[]>([
    { id: "1", type: "", date: undefined, validity: undefined },
  ])

  // Load stay requests from API
  useEffect(() => {
    loadRequests()
  }, [])

  const loadRequests = async () => {
    try {
      setIsLoading(true)
      setError(null)
      const response = await StayRequestsApi.listStayRequests({ limit: 1000 })

      // Transform API requests to match component format
      const transformedRequests: StayRequest[] = response.data.map((apiReq) => ({
        id: apiReq.id,
        person: apiReq.person_name,
        site: apiReq.site,
        startDate: apiReq.start_date,
        endDate: apiReq.end_date,
        reason: apiReq.reason,
        status: apiReq.status as RequestStatus,
        createdAt: apiReq.created_at,
        validationLevel: apiReq.validation_level,
        totalLevels: apiReq.total_levels,
        validators: apiReq.validators.map((v) => ({
          name: v.validator_name,
          level: v.level,
          status: v.status as "pending" | "approved" | "rejected",
          date: v.validation_date || undefined,
        })),
        project: apiReq.project,
      }))

      setRequests(transformedRequests)
    } catch (err) {
      console.error('Failed to load stay requests:', err)
      setError('Échec du chargement des demandes. Utilisation des données de test.')
      // Fallback to mock data
      setRequests(mockStayRequests)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    console.log("[v0] Setting up header context for stay requests")
    setContextualHeader({
      searchPlaceholder: "Rechercher par nom, site, projet... (Ctrl+K)",
      searchValue: searchQuery,
      onSearchChange: setSearchQuery,
      customRender: (
        <ButtonGroup>
          <Button
            variant="outline"
            size="sm"
            className="h-9 w-9 p-0 bg-transparent"
            onClick={() => {
              console.log("[v0] Opening new request form")
              setShowNewRequestForm(true)
            }}
          >
            <Plus className="h-4 w-4" />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-9 w-9 p-0 bg-transparent">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild>
                <Link href="/pobvue/requests/team">
                  <Users className="h-4 w-4 mr-2" />
                  Mob. équipe
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setShowSendLinkDialog(true)}>
                <Send className="h-4 w-4 mr-2" />
                Envoyer lien
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setShowFiltersDrawer(true)}>
                <Filter className="h-4 w-4 mr-2" />
                Filtres
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </ButtonGroup>
      ),
    })

    return () => {
      clearContextualHeader()
    }
  }, [searchQuery, setContextualHeader, clearContextualHeader])

  const filteredRequests = requests.filter((req) => {
    const matchesSearch =
      req.person.toLowerCase().includes(searchQuery.toLowerCase()) ||
      req.site.toLowerCase().includes(searchQuery.toLowerCase()) ||
      req.project.toLowerCase().includes(searchQuery.toLowerCase())

    // Check active status filter from badges
    let matchesActiveStatus = true
    if (activeStatusFilter) {
      if (activeStatusFilter === "completed") {
        // Completed = approved and past end date
        matchesActiveStatus = req.status === "approved" && new Date(req.endDate) < new Date()
      } else {
        matchesActiveStatus = req.status === activeStatusFilter
      }
    }

    const matchesStatus = filters.status.length === 0 || filters.status.includes(req.status)
    const matchesSite = filters.site.length === 0 || filters.site.includes(req.site)
    const matchesProject = filters.project.length === 0 || filters.project.includes(req.project)
    const matchesDateRange =
      (!filters.dateRange.from || new Date(req.startDate) >= filters.dateRange.from) &&
      (!filters.dateRange.to || new Date(req.endDate) <= filters.dateRange.to)

    return matchesSearch && matchesActiveStatus && matchesStatus && matchesSite && matchesProject && matchesDateRange
  })

  const uniqueSites = Array.from(new Set(requests.map((r) => r.site)))
  const uniqueProjects = Array.from(new Set(requests.map((r) => r.project)))

  const handleStatusFilterClick = (status: string | null) => {
    if (activeStatusFilter === status) {
      // If clicking the same badge, clear the filter
      setActiveStatusFilter(null)
    } else {
      setActiveStatusFilter(status)
    }
  }

  const completedCount = requests.filter((r) => r.status === "approved" && new Date(r.endDate) < new Date()).length

  const handleToggleFilter = (filterType: keyof typeof filters, value: string) => {
    setFilters((prev) => {
      // Handle boolean filters separately
      if (filterType === "isFirstStay") {
        // Toggle between true, false, and null
        const currentVal = prev.isFirstStay
        const newVal = currentVal === null ? true : currentVal === true ? false : null
        return { ...prev, isFirstStay: newVal }
      }

      // Handle array filters (status, site, project)
      const currentValues = prev[filterType] as string[]
      const newValues = currentValues.includes(value)
        ? currentValues.filter((v) => v !== value)
        : [...currentValues, value]
      return { ...prev, [filterType]: newValues }
    })
  }

  const handleClearFilters = () => {
    setFilters({
      status: [],
      site: [],
      project: [],
      isFirstStay: null,
      dateRange: { from: undefined, to: undefined },
    })
    setActiveStatusFilter(null) // Reset active status filter
  }

  const activeFiltersCount =
    filters.status.length +
    filters.site.length +
    filters.project.length +
    (filters.isFirstStay !== null ? 1 : 0) +
    (filters.dateRange.from || filters.dateRange.to ? 1 : 0)

  const handleAddDatePeriod = () => {
    setDatePeriods([...datePeriods, { id: String(datePeriods.length + 1), startDate: undefined, endDate: undefined }])
  }

  const handleRemoveDatePeriod = (id: string) => {
    setDatePeriods(datePeriods.filter((p) => p.id !== id))
  }

  const handleAddPeriod = () => {
    setAdditionalPeriods([...additionalPeriods, { from: undefined, to: undefined }])
  }

  const handleRemovePeriod = (index: number) => {
    setAdditionalPeriods(additionalPeriods.filter((_, i) => i !== index))
  }

  const handleAddCertification = () => {
    setCertifications([
      ...certifications,
      { id: String(certifications.length + 1), type: "", date: undefined, validity: undefined },
    ])
  }

  const handleRemoveCertification = (id: string) => {
    setCertifications(certifications.filter((c) => c.id !== id))
  }

  const handleAddTraining = () => {
    setTrainingDates([
      ...trainingDates,
      { id: String(trainingDates.length + 1), type: "", date: undefined, validity: undefined, mandatory: false },
    ])
  }

  const handleRemoveTraining = (id: string) => {
    setTrainingDates(trainingDates.filter((t) => t.id !== id))
  }

  const handleSendLink = () => {
    console.log("[v0] Sending stay request link to:", linkEmail)
    // TODO: Implement actual email sending
    setShowSendLinkDialog(false)
    setLinkEmail("")
  }

  const handleCapturePassport = () => {
    console.log("[v0] Capturing passport photo")
    // TODO: Implement camera capture and AI extraction
  }

  const handleProjectChange = (project: string) => {
    setFormData({ ...formData, project, costCenter: project ? `CC-${project.substring(0, 3).toUpperCase()}` : "" })
  }

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedRequests(filteredRequests.map((r) => r.id))
    } else {
      setSelectedRequests([])
    }
  }

  const handleSelectRequest = (id: string, checked: boolean) => {
    if (checked) {
      setSelectedRequests([...selectedRequests, id])
    } else {
      setSelectedRequests(selectedRequests.filter((rid) => rid !== id))
    }
  }

  const handleBulkApprove = () => {
    console.log("[v0] Bulk approving requests:", selectedRequests)
    setSelectedRequests([])
  }

  const handleBulkReject = () => {
    console.log("[v0] Bulk rejecting requests:", selectedRequests)
    setSelectedRequests([])
  }

  const handleViewDetails = (request: StayRequest) => {
    setSelectedRequest(request)
    setShowDetailDrawer(true)
  }

  const handleOpenApprovalDialog = (action: "approve" | "reject") => {
    setApprovalAction(action)
    setApprovalNote("")
    setShowApprovalDialog(true)
  }

  const handleAddRejectionPeriod = () => {
    setRejectionAlternativeDates([
      ...rejectionAlternativeDates,
      { id: String(rejectionAlternativeDates.length + 1), startDate: undefined, endDate: undefined },
    ])
  }

  const handleRemoveRejectionPeriod = (id: string) => {
    setRejectionAlternativeDates(rejectionAlternativeDates.filter((p) => p.id !== id))
  }

  const handleConfirmApproval = () => {
    if (approvalAction === "approve") {
      console.log("[v0] Approving request:", selectedRequest?.id, "with note:", approvalNote)
      // TODO: Implement actual approval logic
    } else {
      console.log(
        "[v0] Rejecting request:",
        selectedRequest?.id,
        "with note:",
        approvalNote,
        "alternative dates:",
        rejectionAlternativeDates,
      )
      // TODO: Implement actual rejection logic
    }
    setShowApprovalDialog(false)
    setShowDetailDrawer(false) // Close detail drawer after confirmation
    setApprovalNote("")
    setRejectionAlternativeDates([]) // Clear alternative dates on confirm
  }

  const validateForm = (): boolean => {
    const errors = {
      dates: "",
      trainings: [] as string[],
      contact: "",
    }

    // Valider contact
    if (!formData.contact) {
      errors.contact = "Le contact est obligatoire"
    }

    // Valider les périodes
    const invalidPeriods = datePeriods.filter(
      (p) => !isEndDateAfterStartDate(p.startDate, p.endDate)
    )
    if (invalidPeriods.length > 0) {
      errors.dates = "Toutes les périodes doivent avoir une date de fin postérieure à la date de début"
    }

    // Vérifier qu'il y a au moins une période
    if (datePeriods.length === 0 || !datePeriods[0].startDate || !datePeriods[0].endDate) {
      errors.dates = "Au moins une période de séjour est requise"
    }

    // Valider formations obligatoires
    const missingTrainings = trainingDates
      .filter((t) => t.mandatory && (!t.date || !t.validity))
      .map((t) => t.type || "Formation")

    if (missingTrainings.length > 0) {
      errors.trainings = missingTrainings.map(
        (type) => `${type} : date et validité obligatoires`
      )
    }

    // Vérifier dates expirées
    const expiredTrainings = trainingDates
      .filter((t) => t.mandatory && t.validity && isDateExpired(t.validity))
      .map((t) => t.type || "Formation")

    if (expiredTrainings.length > 0) {
      errors.trainings.push(
        ...expiredTrainings.map((type) => `${type} : validité expirée`)
      )
    }

    setValidationErrors(errors)

    return !errors.contact && !errors.dates && errors.trainings.length === 0
  }

  // Loading state
  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent mb-4" />
          <p className="text-sm text-muted-foreground">Chargement des demandes de séjour...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      {/* Error message */}
      {error && (
        <div className="m-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="flex flex-col gap-3 p-3 sm:p-4">
          {/* Stats and view toggle */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm overflow-x-auto w-full sm:w-auto pb-1">
              <Button
                variant="ghost"
                size="sm"
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md whitespace-nowrap h-auto transition-colors ${
                  activeStatusFilter === null ? "bg-muted/80 hover:bg-muted" : "bg-muted/50 hover:bg-muted/70"
                }`}
                onClick={() => handleStatusFilterClick(null)}
              >
                <span className="text-muted-foreground">Total:</span>
                <span className="font-semibold">{requests.length}</span>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md whitespace-nowrap h-auto transition-colors ${
                  activeStatusFilter === "in-validation"
                    ? "bg-blue-500/20 hover:bg-blue-500/25"
                    : "bg-blue-500/10 hover:bg-blue-500/15"
                }`}
                onClick={() => handleStatusFilterClick("in-validation")}
              >
                <span className="text-muted-foreground">En validation:</span>
                <span className="font-semibold text-blue-600">
                  {requests.filter((r) => r.status === "in-validation").length}
                </span>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md whitespace-nowrap h-auto transition-colors ${
                  activeStatusFilter === "approved"
                    ? "bg-green-500/20 hover:bg-green-500/25"
                    : "bg-green-500/10 hover:bg-green-500/15"
                }`}
                onClick={() => handleStatusFilterClick("approved")}
              >
                <span className="text-muted-foreground">Approuvées:</span>
                <span className="font-semibold text-green-600">
                  {requests.filter((r) => r.status === "approved").length}
                </span>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md whitespace-nowrap h-auto transition-colors ${
                  activeStatusFilter === "pending"
                    ? "bg-yellow-500/20 hover:bg-yellow-500/25"
                    : "bg-yellow-500/10 hover:bg-yellow-500/15"
                }`}
                onClick={() => handleStatusFilterClick("pending")}
              >
                <span className="text-muted-foreground">En attente:</span>
                <span className="font-semibold text-yellow-600">
                  {requests.filter((r) => r.status === "pending").length}
                </span>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md whitespace-nowrap h-auto transition-colors ${
                  activeStatusFilter === "completed"
                    ? "bg-gray-500/20 hover:bg-gray-500/25"
                    : "bg-gray-500/10 hover:bg-gray-500/15"
                }`}
                onClick={() => handleStatusFilterClick("completed")}
              >
                <span className="text-muted-foreground">Terminées:</span>
                <span className="font-semibold text-gray-600">{completedCount}</span>
              </Button>
            </div>

            {/* View toggle */}
            <div className="flex items-center border rounded-md flex-shrink-0">
              <Button
                variant={viewMode === "grid" ? "secondary" : "ghost"}
                size="sm"
                className="h-9 rounded-r-none"
                onClick={() => setViewMode("grid")}
              >
                <LayoutGrid className="h-4 w-4" />
              </Button>
              <Button
                variant={viewMode === "table" ? "secondary" : "ghost"}
                size="sm"
                className="h-9 rounded-l-none"
                onClick={() => setViewMode("table")}
              >
                <TableIcon className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Bulk actions bar */}
          {selectedRequests.length > 0 && (
            <div className="flex items-center justify-between gap-2 p-2 rounded-md bg-primary/10 border border-primary/20">
              <span className="text-sm font-medium">
                {selectedRequests.length} demande{selectedRequests.length > 1 ? "s" : ""} sélectionnée
                {selectedRequests.length > 1 ? "s" : ""}
              </span>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" className="h-8 gap-1.5 bg-transparent" onClick={handleBulkApprove}>
                  <Check className="h-3.5 w-3.5" />
                  Approuver
                </Button>
                <Button size="sm" variant="outline" className="h-8 gap-1.5 bg-transparent" onClick={handleBulkReject}>
                  <Ban className="h-3.5 w-3.5" />
                  Rejeter
                </Button>
                <Button size="sm" variant="ghost" className="h-8" onClick={() => setSelectedRequests([])}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-auto p-3 sm:p-4">
        {viewMode === "grid" ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3">
            {filteredRequests.map((request) => (
              <Card
                key={request.id}
                className="p-2 hover:shadow-md transition-shadow cursor-pointer"
                onClick={() => handleViewDetails(request)}
              >
                <div className="flex items-start gap-1.5">
                  <Checkbox
                    checked={selectedRequests.includes(request.id)}
                    onCheckedChange={(checked) => handleSelectRequest(request.id, checked as boolean)}
                    onClick={(e) => e.stopPropagation()}
                    className="mt-0.5"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="mb-2">
                      {/* Name with full width */}
                      <div className="flex items-center gap-1.5 mb-1">
                        <h3 className="text-sm font-semibold truncate">{request.person}</h3>
                        {request.status === "rejected" || request.validationLevel < 2 ? (
                          <AlertTriangle
                            className="h-3.5 w-3.5 text-yellow-600 flex-shrink-0"
                            title="Attention requise"
                          />
                        ) : null}
                      </div>
                      {/* Project and badge on same line */}
                      <div className="flex items-center gap-2">
                        <p className="text-xs text-muted-foreground truncate flex-1">{request.project}</p>
                        <Badge
                          variant="secondary"
                          className={`text-[10px] px-1.5 py-0.5 flex-shrink-0 ${statusColors[request.status]}`}
                        >
                          {request.status}
                        </Badge>
                      </div>
                    </div>

                    <div className="space-y-1.5 text-xs text-muted-foreground">
                      <div className="flex items-center gap-1.5">
                        <MapPin className="h-3 w-3 flex-shrink-0" />
                        <span className="truncate">{request.site}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Calendar className="h-3 w-3 flex-shrink-0" />
                        <span className="truncate">
                          {new Date(request.startDate).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" })}{" "}
                          - {new Date(request.endDate).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" })}
                        </span>
                      </div>
                      {request.isFirstStay && (
                        <div className="flex items-center gap-1.5">
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0.5 bg-blue-500/10 text-blue-700">
                            Première visite
                          </Badge>
                        </div>
                      )}
                    </div>

                    <div className="mt-3">
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="text-muted-foreground">Validation</span>
                        <span className="font-medium">
                          {request.validationLevel}/{request.totalLevels}
                        </span>
                      </div>
                      <Progress value={(request.validationLevel / request.totalLevels) * 100} className="h-1.5" />
                      <div className="mt-2 flex gap-1">
                        {request.validators.map((validator, i) => (
                          <div
                            key={i}
                            className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] ${
                              validator.status === "approved"
                                ? "bg-green-500/20 text-green-700"
                                : validator.status === "rejected"
                                  ? "bg-red-500/20 text-red-700"
                                  : "bg-gray-500/20 text-gray-700"
                            }`}
                            title={`${validator.name} - ${validator.status}`}
                          >
                            {validator.status === "approved" ? (
                              <CheckCircle2 className="h-3 w-3" />
                            ) : validator.status === "rejected" ? (
                              <XCircle className="h-3 w-3" />
                            ) : (
                              <Clock className="h-3 w-3" />
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <div className="border rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">
                      <Checkbox
                        checked={selectedRequests.length === filteredRequests.length && filteredRequests.length > 0}
                        onCheckedChange={handleSelectAll}
                      />
                    </TableHead>
                    <TableHead>Personne</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead>Site</TableHead>
                    <TableHead>Projet</TableHead>
                    <TableHead>Dates</TableHead>
                    <TableHead>Validation</TableHead>
                    <TableHead className="w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRequests.map((request) => (
                    <TableRow
                      key={request.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => handleViewDetails(request)}
                    >
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={selectedRequests.includes(request.id)}
                          onCheckedChange={(checked) => handleSelectRequest(request.id, checked as boolean)}
                        />
                      </TableCell>
                      <TableCell className="font-medium">{request.person}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className={`text-xs ${statusColors[request.status]}`}>
                          {request.status}
                        </Badge>
                      </TableCell>
                      <TableCell>{request.site}</TableCell>
                      <TableCell>{request.project}</TableCell>
                      <TableCell className="text-sm">
                        {new Date(request.startDate).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" })} -{" "}
                        {new Date(request.endDate).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" })}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Progress
                            value={(request.validationLevel / request.totalLevels) * 100}
                            className="h-2 w-20"
                          />
                          <span className="text-xs text-muted-foreground whitespace-nowrap">
                            {request.validationLevel}/{request.totalLevels}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handleViewDetails(request)}>Voir détails</DropdownMenuItem>
                            <DropdownMenuItem>Modifier</DropdownMenuItem>
                            <DropdownMenuItem>Historique</DropdownMenuItem>
                            <DropdownMenuItem className="text-destructive">Annuler</DropdownMenuItem>
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

      <Sheet open={showNewRequestForm} onOpenChange={setShowNewRequestForm}>
        <SheetContent className="w-full sm:max-w-3xl overflow-y-auto">
          <SheetHeader className="px-6">
            <SheetTitle className="text-xl">Nouvelle demande d'avis de séjour</SheetTitle>
            <SheetDescription>Remplissez tous les champs requis pour créer une demande de séjour</SheetDescription>
          </SheetHeader>

          <div className="px-6 mt-6 space-y-6 pb-24">
            {/* Personal Information */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-semibold">Informations personnelles</h4>
                <span className="text-xs text-muted-foreground">* Champs obligatoires</span>
              </div>
              <Card className="p-4 shadow-sm">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Contact *</label>
                    <ContactAutocomplete
                      value={formData.contact}
                      onChange={(contact) => {
                        setFormData({
                          ...formData,
                          contact,
                          // Auto-fill avec les dernières informations
                          ...(contact?.lastProject && { project: contact.lastProject }),
                          ...(contact?.lastSite && { destinations: [contact.lastSite] }),
                          ...(contact?.lastAccommodation && { accommodation: contact.lastAccommodation }),
                        })
                        setValidationErrors({ ...validationErrors, contact: "" })
                      }}
                      placeholder="Rechercher un contact par nom, prénom ou entreprise"
                    />
                    {validationErrors.contact && (
                      <p className="text-xs text-red-600">{validationErrors.contact}</p>
                    )}
                  </div>

                  {formData.contact && (
                    <Card className="p-3 bg-muted/50">
                      <div className="text-xs space-y-1">
                        <div><strong>Nom complet :</strong> {formData.contact.firstName} {formData.contact.lastName}</div>
                        <div><strong>Entreprise :</strong> {formData.contact.company}</div>
                        {formData.contact.function && <div><strong>Fonction :</strong> {formData.contact.function}</div>}
                        {formData.contact.lastVisitDate && (
                          <div className="text-muted-foreground mt-2">
                            Dernier séjour : {new Date(formData.contact.lastVisitDate).toLocaleDateString("fr-FR")}
                          </div>
                        )}
                      </div>
                    </Card>
                  )}

                  <div className="space-y-2">
                    <label className="text-sm font-medium">Fonction *</label>
                    <input
                      type="text"
                      className="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                      value={formData.function}
                      onChange={(e) => setFormData({ ...formData, function: e.target.value })}
                      placeholder="Fonction / Poste"
                    />
                  </div>
                  <div className="flex items-center gap-2 pt-2">
                    <Checkbox
                      id="firstStay"
                      checked={formData.isFirstStay}
                      onCheckedChange={(checked) => setFormData({ ...formData, isFirstStay: checked as boolean })}
                    />
                    <label htmlFor="firstStay" className="text-sm cursor-pointer">
                      Premier séjour sur site
                    </label>
                  </div>
                </div>
              </Card>
            </div>

            {/* Stay Details */}
            <div className="space-y-3">
              <h4 className="text-sm font-semibold">Détails du séjour</h4>
              <Card className="p-4 shadow-sm">
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Site *</label>
                      <select
                        className="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                        value={formData.destinations[0] || ""}
                        onChange={(e) => setFormData({ ...formData, destinations: [e.target.value] })}
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
                      <label className="text-sm font-medium">Hébergement</label>
                      <input
                        type="text"
                        className="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                        value={formData.accommodation}
                        onChange={(e) => setFormData({ ...formData, accommodation: e.target.value })}
                        placeholder="Type d'hébergement"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Projet *</label>
                      <input
                        type="text"
                        className="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                        value={formData.project}
                        onChange={(e) => handleProjectChange(e.target.value)}
                        placeholder="Nom du projet"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Centre de coût</label>
                      <input
                        type="text"
                        className="w-full px-3 py-2 border rounded-md text-sm bg-muted"
                        value={formData.costCenter}
                        readOnly
                        placeholder="Généré automatiquement"
                      />
                    </div>
                  </div>
                  <div className="mt-4">
                    <LocationPicker
                      value={formData.pickupLocation}
                      onChange={(location) => setFormData({ ...formData, pickupLocation: location })}
                      label="Point de ramassage *"
                      placeholder="Sélectionner un point de ramassage"
                    />
                  </div>
                </div>
              </Card>
            </div>

            {/* Date Periods */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold">Périodes de séjour *</h4>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleAddDatePeriod}
                  className="h-8 gap-1.5 bg-transparent"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Ajouter période
                </Button>
              </div>
              <Card className="p-4 shadow-sm">
                <div className="space-y-3">
                  {datePeriods.length === 0 && (
                    <div className="text-sm text-muted-foreground text-center py-8 border-2 border-dashed rounded-md">
                      Aucune période ajoutée. Cliquez sur "Ajouter période" pour commencer.
                    </div>
                  )}
                  {datePeriods.map((period, index) => (
                    <div key={period.id} className="space-y-2">
                      <div className="flex items-end gap-2 p-3 border rounded-md bg-muted/30">
                        <div className="flex-1 grid grid-cols-2 gap-3">
                          <div className="space-y-1.5">
                            <label className="text-xs font-medium">Date début</label>
                            <input
                              type="date"
                              className="w-full px-2 py-1.5 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-background"
                              value={period.startDate ? formatDateForInput(period.startDate) : ""}
                              onChange={(e) => {
                                const newPeriods = [...datePeriods]
                                newPeriods[index].startDate = parseDateFromInput(e.target.value)
                                setDatePeriods(newPeriods)
                                // Clear error if dates become valid
                                if (newPeriods[index].endDate && isEndDateAfterStartDate(newPeriods[index].startDate, newPeriods[index].endDate)) {
                                  setValidationErrors({ ...validationErrors, dates: "" })
                                }
                              }}
                            />
                          </div>
                          <div className="space-y-1.5">
                            <label className="text-xs font-medium">Date fin</label>
                            <input
                              type="date"
                              className={`w-full px-2 py-1.5 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-background ${
                                !isEndDateAfterStartDate(period.startDate, period.endDate)
                                  ? "border-red-500 bg-red-50 dark:bg-red-950"
                                  : ""
                              }`}
                              min={getMinEndDate(period.startDate)}
                              value={period.endDate ? formatDateForInput(period.endDate) : ""}
                              onChange={(e) => {
                                const newPeriods = [...datePeriods]
                                newPeriods[index].endDate = parseDateFromInput(e.target.value)
                                setDatePeriods(newPeriods)
                                // Validate
                                if (!isEndDateAfterStartDate(newPeriods[index].startDate, newPeriods[index].endDate)) {
                                  setValidationErrors({
                                    ...validationErrors,
                                    dates: "La date de fin doit être postérieure à la date de début"
                                  })
                                } else {
                                  setValidationErrors({ ...validationErrors, dates: "" })
                                }
                              }}
                            />
                            {period.startDate && period.endDate && !isEndDateAfterStartDate(period.startDate, period.endDate) && (
                              <p className="text-xs text-red-600 font-medium">
                                La date de fin doit être après la date de début
                              </p>
                            )}
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleRemoveDatePeriod(period.id)}
                          className="h-8 w-8 p-0 text-destructive hover:bg-destructive/10"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
              {validationErrors.dates && (
                <Alert variant="destructive" className="mt-2">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>{validationErrors.dates}</AlertDescription>
                </Alert>
              )}
            </div>

            {/* Reason */}
            <div className="space-y-3">
              <h4 className="text-sm font-semibold">Motif du séjour *</h4>
              <Card className="p-4 shadow-sm">
                <textarea
                  className="w-full px-3 py-2 border rounded-md text-sm min-h-[100px] focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                  placeholder="Décrivez le motif de la demande de séjour..."
                />
              </Card>
            </div>

            {/* Training Dates */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold">Formations et habilitations</h4>
                <Button size="sm" variant="outline" onClick={handleAddTraining} className="h-8 gap-1.5 bg-transparent">
                  <Plus className="h-3.5 w-3.5" />
                  Ajouter
                </Button>
              </div>
              <Card className="p-4 shadow-sm">
                <div className="space-y-3">
                  {trainingDates.map((training, index) => (
                    <div key={training.id} className="p-3 border rounded-md bg-muted/30 space-y-3">
                      <div className="flex items-start gap-2">
                        <div className="flex-1 space-y-3">
                          <div className="space-y-1.5">
                            <label className="text-xs font-medium">
                              Type de formation {training.mandatory && <span className="text-red-500">*</span>}
                            </label>
                            <input
                              type="text"
                              className="w-full px-2 py-1.5 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-background"
                              value={training.type}
                              onChange={(e) => {
                                const newTrainings = [...trainingDates]
                                newTrainings[index].type = e.target.value
                                setTrainingDates(newTrainings)
                              }}
                              placeholder="Ex: Induction, SST..."
                            />
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div className="space-y-1.5">
                              <label className="text-xs font-medium">
                                Date obtention {training.mandatory && <span className="text-red-500">*</span>}
                              </label>
                              <input
                                type="date"
                                className="w-full px-2 py-1.5 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-background"
                                value={training.date ? formatDateForInput(training.date) : ""}
                                onChange={(e) => {
                                  const newTrainings = [...trainingDates]
                                  newTrainings[index].date = parseDateFromInput(e.target.value)
                                  setTrainingDates(newTrainings)
                                }}
                              />
                            </div>
                            <div className="space-y-1.5">
                              <label className="text-xs font-medium">
                                Date validité {training.mandatory && <span className="text-red-500">*</span>}
                              </label>
                              <input
                                type="date"
                                className={`w-full px-2 py-1.5 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-background ${
                                  getValidityDateClassName(training.validity)
                                }`}
                                value={training.validity ? formatDateForInput(training.validity) : ""}
                                onChange={(e) => {
                                  const newTrainings = [...trainingDates]
                                  newTrainings[index].validity = parseDateFromInput(e.target.value)
                                  setTrainingDates(newTrainings)
                                }}
                              />
                              {training.validity && getExpiredDateMessage(training.validity) && (
                                <p className={`text-xs font-medium ${
                                  isDateExpired(training.validity) ? "text-red-600" : "text-orange-600"
                                }`}>
                                  {getExpiredDateMessage(training.validity)}
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                        {!training.mandatory && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleRemoveTraining(training.id)}
                            className="h-8 w-8 p-0 text-destructive hover:bg-destructive/10"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <Checkbox
                          id={`mandatory-${training.id}`}
                          checked={training.mandatory}
                          onCheckedChange={(checked) => {
                            const newTrainings = [...trainingDates]
                            newTrainings[index].mandatory = checked as boolean
                            setTrainingDates(newTrainings)
                          }}
                        />
                        <label htmlFor={`mandatory-${training.id}`} className="text-xs cursor-pointer">
                          Formation obligatoire
                        </label>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
              {validationErrors.trainings.length > 0 && (
                <Alert variant="destructive" className="mt-2">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    <ul className="list-disc list-inside space-y-1">
                      {validationErrors.trainings.map((error, idx) => (
                        <li key={idx}>{error}</li>
                      ))}
                    </ul>
                  </AlertDescription>
                </Alert>
              )}
            </div>

            {/* Certifications */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold">Certifications</h4>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleAddCertification}
                  className="h-8 gap-1.5 bg-transparent"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Ajouter
                </Button>
              </div>
              <Card className="p-4 shadow-sm">
                <div className="space-y-3">
                  {certifications.map((cert, index) => (
                    <div key={cert.id} className="flex items-start gap-2 p-3 border rounded-md bg-muted/30">
                      <div className="flex-1 space-y-3">
                        <div className="space-y-1.5">
                          <label className="text-xs font-medium">Type de certification</label>
                          <input
                            type="text"
                            className="w-full px-2 py-1.5 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-background"
                            value={cert.type}
                            onChange={(e) => {
                              const newCerts = [...certifications]
                              newCerts[index].type = e.target.value
                              setCertifications(newCerts)
                            }}
                            placeholder="Ex: CACES, ATEX..."
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1.5">
                            <label className="text-xs font-medium">Date obtention</label>
                            <input
                              type="date"
                              className="w-full px-2 py-1.5 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-background"
                              value={cert.date ? cert.date.toISOString().split("T")[0] : ""}
                              onChange={(e) => {
                                const newCerts = [...certifications]
                                newCerts[index].date = e.target.value ? new Date(e.target.value) : undefined
                                setCertifications(newCerts)
                              }}
                            />
                          </div>
                          <div className="space-y-1.5">
                            <label className="text-xs font-medium">Date validité</label>
                            <input
                              type="date"
                              className="w-full px-2 py-1.5 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-background"
                              value={cert.validity ? cert.validity.toISOString().split("T")[0] : ""}
                              onChange={(e) => {
                                const newCerts = [...certifications]
                                newCerts[index].validity = e.target.value ? new Date(e.target.value) : undefined
                                setCertifications(newCerts)
                              }}
                            />
                          </div>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleRemoveCertification(cert.id)}
                        className="h-8 w-8 p-0 text-destructive hover:bg-destructive/10"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </Card>
            </div>

            {/* Passport Photo */}
            <div className="space-y-3">
              <h4 className="text-sm font-semibold">Passeport sécurité</h4>
              <Card className="p-4 shadow-sm">
                <p className="text-xs text-muted-foreground mb-4">
                  Capturez ou téléchargez une photo du passeport sécurité pour extraire automatiquement les informations
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <Button variant="outline" onClick={handleCapturePassport}>
                    <Camera className="h-4 w-4 mr-2" />
                    Prendre une photo
                  </Button>
                  <Button variant="outline">
                    <Upload className="h-4 w-4 mr-2" />
                    Télécharger
                  </Button>
                </div>
              </Card>
            </div>
          </div>

          <div className="sticky bottom-0 left-0 right-0 px-6 py-4 bg-background border-t shadow-lg">
            <div className="flex gap-3">
              <Button
                className="flex-1"
                onClick={async () => {
                  // Valider le formulaire
                  if (!validateForm()) {
                    alert("Veuillez corriger les erreurs avant de continuer")
                    return
                  }

                  try {
                    // Préparer les données pour l'API
                    const requestData = {
                      person_name: `${formData.contact?.firstName} ${formData.contact?.lastName}`,
                      company: formData.contact?.company || "",
                      function: formData.function,
                      site: formData.destinations[0] || "",
                      accommodation: formData.accommodation,
                      project: formData.project,
                      cost_center: formData.costCenter,
                      is_first_stay: formData.isFirstStay,
                      pickup_location: formData.pickupLocation?.name || "",
                      pickup_address: formData.pickupLocation?.address || "",
                      start_date: datePeriods[0]?.startDate?.toISOString() || "",
                      end_date: datePeriods[0]?.endDate?.toISOString() || "",
                      additional_periods: datePeriods.slice(1).map((p) => ({
                        start_date: p.startDate?.toISOString(),
                        end_date: p.endDate?.toISOString(),
                      })),
                      trainings: trainingDates.map((t) => ({
                        type: t.type,
                        training_date: t.date?.toISOString(),
                        validity_date: t.validity?.toISOString(),
                        mandatory: t.mandatory,
                      })),
                      certifications: certifications.map((c) => ({
                        type: c.type,
                        certification_date: c.date?.toISOString(),
                        validity_date: c.validity?.toISOString(),
                      })),
                    }

                    console.log("Creating stay request:", requestData)

                    // Appeler l'API
                    const response = await StayRequestsApi.createStayRequest(requestData)

                    console.log("Stay request created:", response)

                    // Recharger la liste
                    await loadRequests()

                    // Fermer le drawer
                    setShowNewRequestForm(false)

                    // Reset form
                    setFormData({
                      contact: null,
                      function: "",
                      contactFound: false,
                      destinations: [],
                      accommodation: "",
                      project: "",
                      costCenter: "",
                      isFirstStay: false,
                      pickupLocation: null,
                    })
                    setDatePeriods([{ id: "1", startDate: undefined, endDate: undefined }])
                    setTrainingDates([])
                    setCertifications([])
                    setValidationErrors({ dates: "", trainings: [], contact: "" })

                    alert("Avis de séjour créé avec succès !")
                  } catch (error) {
                    console.error("Error creating stay request:", error)
                    alert("Erreur lors de la création de l'avis de séjour. Vérifiez les données.")
                  }
                }}
              >
                Créer la demande
              </Button>
              <Button variant="outline" className="flex-1 bg-transparent" onClick={() => setShowNewRequestForm(false)}>
                Annuler
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={showDetailDrawer} onOpenChange={setShowDetailDrawer}>
        <SheetContent className="w-full sm:max-w-3xl overflow-y-auto">
          {selectedRequest && (
            <>
              <SheetHeader className="px-6">
                <div className="flex items-start gap-4">
                  {/* Person Avatar */}
                  <Avatar className="h-16 w-16 border-2">
                    <AvatarImage src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${selectedRequest.person}`} />
                    <AvatarFallback className="text-lg font-semibold">
                      {selectedRequest.person
                        .split(" ")
                        .map((n) => n[0])
                        .join("")}
                    </AvatarFallback>
                  </Avatar>

                  <div className="flex-1">
                    <div className="flex items-start justify-between">
                      <div>
                        <SheetTitle className="text-xl">{selectedRequest.person}</SheetTitle>
                        <SheetDescription className="flex items-center gap-2 mt-1">
                          <Building2 className="h-3.5 w-3.5" />
                          TotalEnergies • Ingénieur Maintenance
                        </SheetDescription>
                      </div>
                      <Badge
                        variant="secondary"
                        className={`${statusColors[selectedRequest.status]} text-xs px-2.5 py-1`}
                      >
                        {selectedRequest.status}
                      </Badge>
                    </div>
                  </div>
                </div>
              </SheetHeader>

              <div className="px-6 mt-6 space-y-4 pb-24">
                <Alert variant="destructive" className="border-red-500/50 bg-red-500/10">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle className="text-sm font-semibold">Statut: Sous surveillance</AlertTitle>
                  <AlertDescription className="text-xs">
                    Cette personne est actuellement sous surveillance suite à un incident de sécurité mineur le
                    12/03/2024. Validation niveau 3 requise.
                  </AlertDescription>
                </Alert>

                <Card className="p-4 shadow-sm bg-muted/30">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                    <div>
                      <span className="text-xs text-muted-foreground block mb-0.5">Site</span>
                      <p className="font-semibold text-xs flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        {selectedRequest.site}
                      </p>
                    </div>
                    <div>
                      <span className="text-xs text-muted-foreground block mb-0.5">Projet</span>
                      <p className="font-semibold text-xs">{selectedRequest.project}</p>
                    </div>
                    <div>
                      <span className="text-xs text-muted-foreground block mb-0.5">Période</span>
                      <p className="font-semibold text-xs flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {new Date(selectedRequest.startDate).toLocaleDateString("fr-FR", {
                          day: "2-digit",
                          month: "short",
                        })}{" "}
                        -{" "}
                        {new Date(selectedRequest.endDate).toLocaleDateString("fr-FR", {
                          day: "2-digit",
                          month: "short",
                        })}
                      </p>
                    </div>
                    <div>
                      <span className="text-xs text-muted-foreground block mb-0.5">Hébergement</span>
                      <p className="font-semibold text-xs">Cabine Standard</p>
                    </div>
                  </div>
                </Card>

                <div className="space-y-2">
                  <h4 className="text-sm font-semibold text-foreground">Historique des mobilisations</h4>
                  <Card className="p-3 shadow-sm">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between p-2 rounded-md bg-muted/50 text-xs">
                        <div className="flex items-center gap-2">
                          <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="font-medium">15/01/2024 - 28/02/2024</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground">{selectedRequest.site}</span>
                          <Badge variant="secondary" className="bg-green-500/10 text-green-700 text-[10px] h-5">
                            Complété
                          </Badge>
                        </div>
                      </div>
                      <div className="flex items-center justify-between p-2 rounded-md bg-muted/50 text-xs">
                        <div className="flex items-center gap-2">
                          <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="font-medium">10/10/2023 - 15/12/2023</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground">Offshore Platform A</span>
                          <Badge variant="secondary" className="bg-green-500/10 text-green-700 text-[10px] h-5">
                            Complété
                          </Badge>
                        </div>
                      </div>
                      <div className="flex items-center justify-between p-2 rounded-md bg-muted/50 text-xs">
                        <div className="flex items-center gap-2">
                          <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="font-medium">05/06/2023 - 20/08/2023</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground">Drilling Site Gamma</span>
                          <Badge variant="secondary" className="bg-green-500/10 text-green-700 text-[10px] h-5">
                            Complété
                          </Badge>
                        </div>
                      </div>
                    </div>
                  </Card>
                </div>

                {/* Compact Details */}
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold text-foreground">Détails du séjour</h4>
                  <Card className="p-3 shadow-sm">
                    <div className="space-y-2 text-xs">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Centre de coût</span>
                        <span className="font-medium font-mono">
                          CC-{selectedRequest.project.substring(0, 3).toUpperCase()}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Date de création</span>
                        <span className="font-medium">
                          {new Date(selectedRequest.createdAt).toLocaleDateString("fr-FR")}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Premier séjour</span>
                        <span className="font-medium">Non</span>
                      </div>
                    </div>
                    <div className="mt-3 pt-3 border-t">
                      <span className="text-xs text-muted-foreground block mb-1">Motif</span>
                      <p className="text-xs leading-relaxed">{selectedRequest.reason}</p>
                    </div>
                  </Card>
                </div>

                {/* Training & Certifications - Compact */}
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold text-foreground">Formations et habilitations</h4>
                  <Card className="p-3 shadow-sm">
                    <div className="space-y-1.5">
                      {[
                        { name: "Induction", obtained: "15/01/2024", validity: "15/01/2025", status: "valid" },
                        { name: "Visite Médicale", obtained: "10/02/2024", validity: "10/02/2025", status: "valid" },
                        { name: "SST", obtained: "20/03/2024", validity: "20/03/2026", status: "valid" },
                      ].map((training, i) => (
                        <div key={i} className="flex items-center justify-between p-2 rounded-md bg-muted/50">
                          <div className="flex-1">
                            <p className="text-xs font-medium">{training.name}</p>
                            <p className="text-[10px] text-muted-foreground">
                              {training.obtained} → {training.validity}
                            </p>
                          </div>
                          <Badge variant="secondary" className="bg-green-500/10 text-green-700 text-[10px] h-5">
                            Valide
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </Card>
                </div>

                <div className="space-y-2">
                  <h4 className="text-sm font-semibold text-foreground">Données physiques</h4>
                  <Card className="p-3 shadow-sm">
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div className="space-y-2">
                        <div className="flex justify-between p-2 rounded-md bg-muted/50">
                          <span className="text-muted-foreground">Poids personne (aller)</span>
                          <span className="font-medium">75 kg</span>
                        </div>
                        <div className="flex justify-between p-2 rounded-md bg-muted/50">
                          <span className="text-muted-foreground">Poids bagages (aller)</span>
                          <span className="font-medium">25 kg</span>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <div className="flex justify-between p-2 rounded-md bg-muted/50">
                          <span className="text-muted-foreground">Poids personne (retour)</span>
                          <span className="font-medium">75 kg</span>
                        </div>
                        <div className="flex justify-between p-2 rounded-md bg-muted/50">
                          <span className="text-muted-foreground">Poids bagages (retour)</span>
                          <span className="font-medium">20 kg</span>
                        </div>
                      </div>
                    </div>
                  </Card>
                </div>

                <div className="space-y-2">
                  <h4 className="text-sm font-semibold text-foreground">Moyens de transport</h4>
                  <Card className="p-3 shadow-sm">
                    <div className="space-y-2 text-xs">
                      <div className="flex justify-between p-2 rounded-md bg-muted/50">
                        <span className="text-muted-foreground">Moyen de départ (aller)</span>
                        <Badge variant="secondary" className="text-[10px] h-5">
                          Hélicoptère
                        </Badge>
                      </div>
                      <div className="flex justify-between p-2 rounded-md bg-muted/50">
                        <span className="text-muted-foreground">Moyen de retour</span>
                        <Badge variant="secondary" className="text-[10px] h-5">
                          Bateau
                        </Badge>
                      </div>
                      <div className="p-2 rounded-md bg-muted/50">
                        <span className="text-muted-foreground block mb-1">Point de ramassage</span>
                        <div className="flex items-start gap-1.5">
                          <MapPin className="h-3 w-3 text-muted-foreground flex-shrink-0 mt-0.5" />
                          <span className="font-medium text-xs">Port de Marseille, Quai 12, 13002 Marseille</span>
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-1">43.3047° N, 5.3756° E</p>
                      </div>
                    </div>
                  </Card>
                </div>

                <div className="space-y-2">
                  <h4 className="text-sm font-semibold text-foreground">Progression de validation</h4>
                  <Card className="p-3 shadow-sm">
                    <div className="mb-3">
                      <div className="flex items-center justify-between text-xs mb-1.5">
                        <span className="text-muted-foreground">
                          Niveau {selectedRequest.validationLevel} / {selectedRequest.totalLevels}
                        </span>
                        <span className="font-semibold">
                          {Math.round((selectedRequest.validationLevel / selectedRequest.totalLevels) * 100)}%
                        </span>
                      </div>
                      <Progress
                        value={(selectedRequest.validationLevel / selectedRequest.totalLevels) * 100}
                        className="h-1.5"
                      />
                    </div>
                    <div className="flex items-center gap-2 overflow-x-auto pb-1">
                      {selectedRequest.validators.map((validator, i) => (
                        <div
                          key={i}
                          className="flex items-center gap-2 p-2 rounded-md bg-muted/50 whitespace-nowrap flex-shrink-0"
                        >
                          <div
                            className={`flex h-7 w-7 items-center justify-center rounded-full flex-shrink-0 ${
                              validator.status === "approved"
                                ? "bg-green-500/20 text-green-700"
                                : validator.status === "rejected"
                                  ? "bg-red-500/20 text-red-700"
                                  : "bg-gray-500/20 text-gray-700"
                            }`}
                          >
                            {validator.status === "approved" ? (
                              <CheckCircle2 className="h-3.5 w-3.5" />
                            ) : validator.status === "rejected" ? (
                              <XCircle className="h-3.5 w-3.5" />
                            ) : (
                              <Clock className="h-3.5 w-3.5" />
                            )}
                          </div>
                          <div>
                            <p className="text-xs font-medium">{validator.name}</p>
                            <div className="flex items-center gap-1.5">
                              <p className="text-[10px] text-muted-foreground">Niv. {validator.level}</p>
                              <Badge
                                variant="secondary"
                                className={`text-[10px] h-4 px-1 ${
                                  validator.status === "approved"
                                    ? "bg-green-500/10 text-green-700"
                                    : validator.status === "rejected"
                                      ? "bg-red-500/10 text-red-700"
                                      : "bg-yellow-500/10 text-yellow-700"
                                }`}
                              >
                                {validator.status}
                              </Badge>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </Card>
                </div>
              </div>

              <div className="sticky bottom-0 left-0 right-0 px-6 py-4 bg-background border-t shadow-lg">
                <div className="flex gap-3">
                  <Button
                    variant="outline"
                    className="flex-1 bg-transparent"
                    onClick={() => {
                      setShowDetailDrawer(false)
                      setFormData({
                        lastName: selectedRequest.person.split(" ")[1] || "",
                        firstName: selectedRequest.person.split(" ")[0] || "",
                        company: "TotalEnergies",
                        function: "Ingénieur Maintenance",
                        contactFound: false,
                        destinations: [selectedRequest.site],
                        accommodation: "Cabine Standard",
                        project: selectedRequest.project,
                        costCenter: `CC-${selectedRequest.project.substring(0, 3).toUpperCase()}`,
                        isFirstStay: false,
                      })
                      setShowNewRequestForm(true)
                    }}
                  >
                    Modifier
                  </Button>
                  <Button className="flex-1" onClick={() => handleOpenApprovalDialog("approve")}>
                    <Check className="h-4 w-4 mr-2" />
                    Approuver
                  </Button>
                  <Button
                    variant="outline"
                    className="flex-1 bg-transparent"
                    onClick={() => handleOpenApprovalDialog("reject")}
                  >
                    <Ban className="h-4 w-4 mr-2" />
                    Rejeter
                  </Button>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      <Dialog open={showApprovalDialog} onOpenChange={setShowApprovalDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{approvalAction === "approve" ? "Approuver la demande" : "Refuser la demande"}</DialogTitle>
            <DialogDescription>
              {approvalAction === "approve"
                ? "Vous êtes sur le point d'approuver cette demande d'avis de séjour."
                : "Vous pouvez refuser avec une note ou proposer des dates alternatives."}
            </DialogDescription>
          </DialogHeader>

          {approvalAction === "approve" ? (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Note (optionnelle)</label>
                <textarea
                  className="w-full px-3 py-2 border rounded-md text-sm min-h-[100px] focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                  placeholder="Ajoutez une note ou un commentaire..."
                  value={approvalNote}
                  onChange={(e) => setApprovalNote(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">Cette note sera visible dans l'historique de validation</p>
              </div>
            </div>
          ) : (
            <Tabs defaultValue="note" className="py-4">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="note">Ajouter une note</TabsTrigger>
                <TabsTrigger value="dates">Proposer dates</TabsTrigger>
              </TabsList>
              <TabsContent value="note" className="space-y-4 mt-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Note de refus</label>
                  <textarea
                    className="w-full px-3 py-2 border rounded-md text-sm min-h-[120px] focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                    placeholder="Expliquez la raison du refus..."
                    value={approvalNote}
                    onChange={(e) => setApprovalNote(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">Cette note sera visible dans l'historique</p>
                </div>
              </TabsContent>
              <TabsContent value="dates" className="space-y-4 mt-4">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium">Périodes alternatives</label>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleAddRejectionPeriod}
                      className="h-7 gap-1 bg-transparent"
                    >
                      <Plus className="h-3 w-3" />
                      Ajouter
                    </Button>
                  </div>
                  {rejectionAlternativeDates.length === 0 ? (
                    <div className="text-sm text-muted-foreground text-center py-6 border-2 border-dashed rounded-md">
                      Aucune période proposée
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {rejectionAlternativeDates.map((period, index) => (
                        <div key={period.id} className="flex items-end gap-2 p-2 border rounded-md bg-muted/30">
                          <div className="flex-1 grid grid-cols-2 gap-2">
                            <div className="space-y-1">
                              <label className="text-xs font-medium">Début</label>
                              <input
                                type="date"
                                className="w-full px-2 py-1 border rounded-md text-xs focus:outline-none focus:ring-2 focus:ring-primary bg-background"
                                value={period.startDate ? period.startDate.toISOString().split("T")[0] : ""}
                                onChange={(e) => {
                                  const newPeriods = [...rejectionAlternativeDates]
                                  newPeriods[index].startDate = e.target.value ? new Date(e.target.value) : undefined
                                  setRejectionAlternativeDates(newPeriods)
                                }}
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="text-xs font-medium">Fin</label>
                              <input
                                type="date"
                                className="w-full px-2 py-1 border rounded-md text-xs focus:outline-none focus:ring-2 focus:ring-primary bg-background"
                                value={period.endDate ? period.endDate.toISOString().split("T")[0] : ""}
                                onChange={(e) => {
                                  const newPeriods = [...rejectionAlternativeDates]
                                  newPeriods[index].endDate = e.target.value ? new Date(e.target.value) : undefined
                                  setRejectionAlternativeDates(newPeriods)
                                }}
                              />
                            </div>
                          </div>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleRemoveRejectionPeriod(period.id)}
                            className="h-7 w-7 p-0 text-destructive"
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground">Proposez des périodes alternatives pour le séjour</p>
                </div>
              </TabsContent>
            </Tabs>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowApprovalDialog(false)
                setRejectionAlternativeDates([])
              }}
            >
              Annuler
            </Button>
            <Button onClick={handleConfirmApproval} variant={approvalAction === "approve" ? "default" : "destructive"}>
              {approvalAction === "approve" ? "Confirmer l'approbation" : "Confirmer le refus"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Sheet open={showFiltersDrawer} onOpenChange={setShowFiltersDrawer}>
        <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader className="px-6">
            <SheetTitle className="flex items-center gap-2">
              <Filter className="h-5 w-5" />
              Filtres
            </SheetTitle>
            <SheetDescription>Affinez votre recherche avec les filtres ci-dessous</SheetDescription>
          </SheetHeader>

          <div className="px-6 mt-6 space-y-4 pb-24">
            {activeFiltersCount > 0 && (
              <Card className="p-3 bg-primary/5 border-primary/20">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="bg-primary text-primary-foreground">
                      {activeFiltersCount}
                    </Badge>
                    <span className="text-sm font-medium">
                      Filtre{activeFiltersCount > 1 ? "s" : ""} actif{activeFiltersCount > 1 ? "s" : ""}
                    </span>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={handleClearFilters}
                    className="h-8 text-xs hover:bg-primary/10"
                  >
                    <X className="h-3.5 w-3.5 mr-1" />
                    Effacer
                  </Button>
                </div>
              </Card>
            )}

            <Card className="p-4 shadow-sm">
              <div className="space-y-3">
                <div className="flex items-center gap-2 pb-2 border-b">
                  <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
                  <h4 className="text-sm font-semibold">Statut</h4>
                </div>
                <div className="space-y-2">
                  {[
                    { value: "draft", label: "Brouillon", icon: Clock },
                    { value: "pending", label: "En attente", icon: Clock },
                    { value: "in-validation", label: "En validation", icon: Clock },
                    { value: "approved", label: "Approuvée", icon: CheckCircle2 },
                    { value: "rejected", label: "Rejetée", icon: XCircle },
                    { value: "cancelled", label: "Annulée", icon: Ban },
                  ].map((status) => {
                    const Icon = status.icon
                    return (
                      <div
                        key={status.value}
                        className={`flex items-center gap-2 p-2 rounded-md transition-colors ${
                          filters.status.includes(status.value) ? "bg-primary/10" : "hover:bg-muted/50"
                        }`}
                      >
                        <Checkbox
                          id={`status-${status.value}`}
                          checked={filters.status.includes(status.value)}
                          onCheckedChange={() => handleToggleFilter("status", status.value)}
                        />
                        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                        <label htmlFor={`status-${status.value}`} className="text-sm cursor-pointer flex-1">
                          {status.label}
                        </label>
                        <Badge
                          variant="secondary"
                          className={`text-xs ${statusColors[status.value as keyof typeof statusColors]}`}
                        >
                          {requests.filter((r) => r.status === status.value).length}
                        </Badge>
                      </div>
                    )
                  })}
                </div>
              </div>
            </Card>

            <Card className="p-4 shadow-sm">
              <div className="space-y-3">
                <div className="flex items-center gap-2 pb-2 border-b">
                  <MapPin className="h-4 w-4 text-muted-foreground" />
                  <h4 className="text-sm font-semibold">Site</h4>
                </div>
                <div className="space-y-2">
                  {uniqueSites.map((site) => (
                    <div
                      key={site}
                      className={`flex items-center gap-2 p-2 rounded-md transition-colors ${
                        filters.site.includes(site) ? "bg-primary/10" : "hover:bg-muted/50"
                      }`}
                    >
                      <Checkbox
                        id={`site-${site}`}
                        checked={filters.site.includes(site)}
                        onCheckedChange={() => handleToggleFilter("site", site)}
                      />
                      <label htmlFor={`site-${site}`} className="text-sm cursor-pointer flex-1">
                        {site}
                      </label>
                      <Badge variant="secondary" className="text-xs">
                        {requests.filter((r) => r.site === site).length}
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            </Card>

            <Card className="p-4 shadow-sm">
              <div className="space-y-3">
                <div className="flex items-center gap-2 pb-2 border-b">
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                  <h4 className="text-sm font-semibold">Projet</h4>
                </div>
                <div className="space-y-2">
                  {uniqueProjects.map((project) => (
                    <div
                      key={project}
                      className={`flex items-center gap-2 p-2 rounded-md transition-colors ${
                        filters.project.includes(project) ? "bg-primary/10" : "hover:bg-muted/50"
                      }`}
                    >
                      <Checkbox
                        id={`project-${project}`}
                        checked={filters.project.includes(project)}
                        onCheckedChange={() => handleToggleFilter("project", project)}
                      />
                      <label htmlFor={`project-${project}`} className="text-sm cursor-pointer flex-1 truncate">
                        {project}
                      </label>
                      <Badge variant="secondary" className="text-xs flex-shrink-0">
                        {requests.filter((r) => r.project === project).length}
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            </Card>

            <Card className="p-4 shadow-sm">
              <div className="space-y-3">
                <div className="flex items-center gap-2 pb-2 border-b">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  <h4 className="text-sm font-semibold">Premier séjour</h4>
                </div>
                <div className="space-y-2">
                  <div
                    className={`flex items-center gap-2 p-2 rounded-md transition-colors ${
                      filters.isFirstStay === true ? "bg-primary/10" : "hover:bg-muted/50"
                    }`}
                  >
                    <Checkbox
                      id="isFirstStay-true"
                      checked={filters.isFirstStay === true}
                      onCheckedChange={() => handleToggleFilter("isFirstStay", "true")}
                    />
                    <label htmlFor="isFirstStay-true" className="text-sm cursor-pointer flex-1">
                      Oui
                    </label>
                    <Badge variant="secondary" className="text-xs bg-blue-500/10 text-blue-700">
                      {requests.filter((r) => r.isFirstStay).length}
                    </Badge>
                  </div>
                  <div
                    className={`flex items-center gap-2 p-2 rounded-md transition-colors ${
                      filters.isFirstStay === false ? "bg-primary/10" : "hover:bg-muted/50"
                    }`}
                  >
                    <Checkbox
                      id="isFirstStay-false"
                      checked={filters.isFirstStay === false}
                      onCheckedChange={() => handleToggleFilter("isFirstStay", "false")}
                    />
                    <label htmlFor="isFirstStay-false" className="text-sm cursor-pointer flex-1">
                      Non
                    </label>
                    <Badge variant="secondary" className="text-xs">
                      {requests.filter((r) => !r.isFirstStay).length}
                    </Badge>
                  </div>
                </div>
              </div>
            </Card>

            <Card className="p-4 shadow-sm">
              <div className="space-y-3">
                <div className="flex items-center gap-2 pb-2 border-b">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <h4 className="text-sm font-semibold">Période</h4>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-muted-foreground">Date début</label>
                    <input
                      type="date"
                      className="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-background"
                      value={filters.dateRange.from ? filters.dateRange.from.toISOString().split("T")[0] : ""}
                      onChange={(e) =>
                        setFilters({
                          ...filters,
                          dateRange: {
                            ...filters.dateRange,
                            from: e.target.value ? new Date(e.target.value) : undefined,
                          },
                        })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-muted-foreground">Date fin</label>
                    <input
                      type="date"
                      className="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-background"
                      value={filters.dateRange.to ? filters.dateRange.to.toISOString().split("T")[0] : ""}
                      onChange={(e) =>
                        setFilters({
                          ...filters,
                          dateRange: {
                            ...filters.dateRange,
                            to: e.target.value ? new Date(e.target.value) : undefined,
                          },
                        })
                      }
                    />
                  </div>
                </div>
              </div>
            </Card>
          </div>

          <div className="sticky bottom-0 left-0 right-0 px-6 pt-4 pb-4 bg-background border-t shadow-lg">
            <div className="flex flex-col sm:flex-row gap-2">
              <Button className="flex-1 h-10" onClick={() => setShowFiltersDrawer(false)}>
                <Check className="h-4 w-4 mr-2" />
                Appliquer ({filteredRequests.length})
              </Button>
              <Button variant="outline" className="flex-1 h-10 bg-transparent" onClick={handleClearFilters}>
                <X className="h-4 w-4 mr-2" />
                Réinitialiser
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}
