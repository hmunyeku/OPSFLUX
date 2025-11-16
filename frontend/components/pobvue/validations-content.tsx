"use client"

import { useState, useEffect, type ReactElement } from "react"
import { mockStayRequests, type StayRequest } from "@/lib/pobvue-data"
import { StayRequestsApi, type StayRequest as ApiStayRequest } from "@/lib/stay-requests-api"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import {
  CheckCircle2,
  XCircle,
  Clock,
  MapPin,
  Calendar,
  AlertTriangle,
  Check,
  Ban,
  CalendarClock,
  FileText,
  User,
  ChevronLeft,
  ChevronRight,
  Download,
  Filter,
  ChevronsUp,
  ChevronsDown,
  SplitSquareVertical,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Trash2,
  ChevronDown,
  Users,
} from "lucide-react"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useHeaderContext } from "@/components/header-context"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { ButtonGroup } from "@/components/ui/button-group"

const statusColors = {
  draft: "bg-gray-500/10 text-gray-700 dark:text-gray-400",
  pending: "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400",
  "in-validation": "bg-blue-500/10 text-blue-700 dark:text-blue-400",
  approved: "bg-green-500/10 text-green-700 dark:text-green-700",
  rejected: "bg-red-500/10 text-red-700 dark:text-red-700",
  cancelled: "bg-gray-500/10 text-gray-700 dark:text-gray-400",
}

const priorityColors = {
  low: "bg-gray-500/10 text-gray-700",
  medium: "bg-yellow-500/10 text-yellow-700",
  high: "bg-orange-500/10 text-orange-700",
  urgent: "bg-red-500/10 text-red-700",
}

type LayoutMode = "top-full" | "split" | "bottom-full"

type SortField = "person" | "priority" | "status" | "project" | "destination" | "dates"
type SortDirection = "asc" | "desc" | null

type ValidationRequest = StayRequest & {
  type?: "individual" | "team"
  teamName?: string
  teamId?: string // Added to track team membership
  members?: StayRequest[]
  _apiValidators?: any[] // Store original API validators for API calls
}

const createMockTeamRequests = (): ValidationRequest[] => {
  const individualRequests = mockStayRequests.map((r) => ({ ...r, type: "individual" as const }))

  // Create a team request
  const teamRequest: ValidationRequest = {
    id: "team-001",
    type: "team",
    teamName: "Équipe Maintenance Alpha",
    person: "Équipe Maintenance Alpha",
    project: "Offshore Platform Upgrade",
    site: "Platform Alpha",
    startDate: "2025-03-01",
    endDate: "2025-03-14",
    status: "in-validation",
    validationLevel: 1,
    totalLevels: 3,
    validators: [
      { name: "Sophie Martin", level: 1, status: "approved" },
      { name: "Marc Dubois", level: 2, status: "pending" },
      { name: "Claire Rousseau", level: 3, status: "pending" },
    ],
    isFirstStay: false,
    members: [
      {
        id: "team-001-member-1",
        person: "Jean Dupont",
        project: "Offshore Platform Upgrade",
        site: "Platform Alpha",
        startDate: "2025-03-01",
        endDate: "2025-03-14",
        status: "in-validation",
        validationLevel: 1,
        totalLevels: 3,
        validators: [
          { name: "Sophie Martin", level: 1, status: "approved" },
          { name: "Marc Dubois", level: 2, status: "pending" },
          { name: "Claire Rousseau", level: 3, status: "pending" },
        ],
        isFirstStay: true,
      },
      {
        id: "team-001-member-2",
        person: "Paul Martin",
        project: "Offshore Platform Upgrade",
        site: "Platform Alpha",
        startDate: "2025-03-01",
        endDate: "2025-03-14",
        status: "in-validation",
        validationLevel: 1,
        totalLevels: 3,
        validators: [
          { name: "Sophie Martin", level: 1, status: "approved" },
          { name: "Marc Dubois", level: 2, status: "pending" },
          { name: "Claire Rousseau", level: 3, status: "pending" },
        ],
        isFirstStay: false,
      },
      {
        id: "team-001-member-3",
        person: "Sophie Bernard",
        project: "Offshore Platform Upgrade",
        site: "Platform Alpha",
        startDate: "2025-03-01",
        endDate: "2025-03-14",
        status: "in-validation",
        validationLevel: 1,
        totalLevels: 3,
        validators: [
          { name: "Sophie Martin", level: 1, status: "approved" },
          { name: "Marc Dubois", level: 2, status: "pending" },
          { name: "Claire Rousseau", level: 3, status: "pending" },
        ],
        isFirstStay: false,
      },
    ],
  }

  return [teamRequest, ...individualRequests]
}

export function ValidationsContent() {
  const [searchQuery, setSearchQuery] = useState("")
  const [allRequests, setAllRequests] = useState<ValidationRequest[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedRequest, setSelectedRequest] = useState<ValidationRequest | null>(null)
  const [validationNote, setValidationNote] = useState("")
  const [alternativeDates, setAlternativeDates] = useState<{ start: string; end: string }>({ start: "", end: "" })
  const [isPanelCollapsed, setIsPanelCollapsed] = useState(false)
  const [layoutMode, setLayoutMode] = useState<LayoutMode>("split")

  const [selectedPendingIds, setSelectedPendingIds] = useState<Set<string>>(new Set())
  const [selectedValidatedIds, setSelectedValidatedIds] = useState<Set<string>>(new Set())

  const [expandedPendingTeamIds, setExpandedPendingTeamIds] = useState<Set<string>>(new Set())
  const [expandedValidatedTeamIds, setExpandedValidatedTeamIds] = useState<Set<string>>(new Set())

  const [pendingSortField, setPendingSortField] = useState<SortField | null>(null)
  const [pendingSortDirection, setPendingSortDirection] = useState<SortDirection>(null)
  const [validatedSortField, setValidatedSortField] = useState<SortField | null>(null)
  const [validatedSortDirection, setValidatedSortDirection] = useState<SortDirection>(null)

  const { setContextualHeader, clearContextualHeader } = useHeaderContext()

  // Load validations from API
  useEffect(() => {
    loadValidations()
  }, [])

  const loadValidations = async () => {
    try {
      setIsLoading(true)
      setError(null)

      // Load all stay requests
      const response = await StayRequestsApi.listStayRequests({ limit: 1000 })

      // Transform API requests to component format
      const transformedRequests: ValidationRequest[] = response.data
        .filter(req => req.status === 'in-validation' || req.status === 'pending' || req.status === 'approved' || req.status === 'rejected')
        .map((apiReq) => ({
          id: apiReq.id,
          type: "individual" as const,
          person: apiReq.person_name,
          site: apiReq.site,
          startDate: apiReq.start_date,
          endDate: apiReq.end_date,
          reason: apiReq.reason,
          status: apiReq.status as any,
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
          isFirstStay: false,
          _apiValidators: apiReq.validators, // Store original validators for API calls
        }))

      setAllRequests(transformedRequests)
    } catch (err) {
      console.error('Failed to load validations:', err)
      setError('Échec du chargement des validations. Utilisation des données de test.')
      // Fallback to mock data
      setAllRequests(createMockTeamRequests())
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    setContextualHeader({
      searchPlaceholder: "Rechercher par nom, projet, site... (Ctrl+K)",
      searchValue: searchQuery,
      onSearchChange: setSearchQuery,
      customRender: (
        <ButtonGroup>
          <Button variant="outline" size="sm">
            <Filter className="h-4 w-4 mr-2" />
            Filtres
          </Button>
          <Button variant="outline" size="sm">
            <Download className="h-4 w-4 mr-2" />
            Exporter
          </Button>
        </ButtonGroup>
      ),
    })

    return () => {
      clearContextualHeader()
    }
  }, [searchQuery, setContextualHeader, clearContextualHeader])

  const pendingRequests = allRequests.filter((r) => r.status === "in-validation" || r.status === "pending")
  const processedRequests = allRequests.filter((r) => r.status === "approved" || r.status === "rejected")

  const filteredPendingRequests = pendingRequests.filter(
    (req) =>
      req.person.toLowerCase().includes(searchQuery.toLowerCase()) ||
      req.site.toLowerCase().includes(searchQuery.toLowerCase()) ||
      req.project.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (req.teamName?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false),
  )

  const filteredProcessedRequests = processedRequests.filter(
    (req) =>
      req.person.toLowerCase().includes(searchQuery.toLowerCase()) ||
      req.site.toLowerCase().includes(searchQuery.toLowerCase()) ||
      req.project.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (req.teamName?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false),
  )

  const sortRequests = (
    requests: ValidationRequest[],
    sortField: SortField | null,
    sortDirection: SortDirection,
  ): ValidationRequest[] => {
    if (!sortField || !sortDirection) return requests

    return [...requests].sort((a, b) => {
      let aValue: any
      let bValue: any

      switch (sortField) {
        case "person":
          aValue = a.type === "team" ? a.teamName : a.person
          bValue = b.type === "team" ? b.teamName : b.person
          break
        case "priority":
          const priorityOrder = { urgent: 4, high: 3, medium: 2, low: 1 }
          aValue = priorityOrder[getPriority(a)]
          bValue = priorityOrder[getPriority(b)]
          break
        case "status":
          aValue = a.status
          bValue = b.status
          break
        case "project":
          aValue = a.project
          bValue = b.project
          break
        case "destination":
          aValue = a.site
          bValue = b.site
          break
        case "dates":
          aValue = new Date(a.startDate).getTime()
          bValue = new Date(b.startDate).getTime()
          break
        default:
          return 0
      }

      if (aValue < bValue) return sortDirection === "asc" ? -1 : 1
      if (aValue > bValue) return sortDirection === "asc" ? 1 : -1
      return 0
    })
  }

  const sortedPendingRequests = sortRequests(filteredPendingRequests, pendingSortField, pendingSortDirection)
  const sortedProcessedRequests = sortRequests(filteredProcessedRequests, validatedSortField, validatedSortDirection)

  const handleSelectPending = (id: string, checked: boolean, request?: ValidationRequest) => {
    const newSelected = new Set(selectedPendingIds)

    // If it's a team, select/deselect all members
    if (request?.type === "team" && request.members) {
      if (checked) {
        newSelected.add(id)
        request.members.forEach((member) => newSelected.add(member.id))
      } else {
        newSelected.delete(id)
        request.members.forEach((member) => newSelected.delete(member.id))
      }
    } else {
      if (checked) {
        newSelected.add(id)
      } else {
        newSelected.delete(id)
      }
    }

    setSelectedPendingIds(newSelected)
  }

  const handleSelectAllPending = (checked: boolean) => {
    if (checked) {
      setSelectedPendingIds(new Set(sortedPendingRequests.map((r) => r.id)))
    } else {
      setSelectedPendingIds(new Set())
    }
  }

  const handleSelectValidated = (id: string, checked: boolean, request?: ValidationRequest) => {
    const newSelected = new Set(selectedValidatedIds)

    // If it's a team, select/deselect all members
    if (request?.type === "team" && request.members) {
      if (checked) {
        newSelected.add(id)
        request.members.forEach((member) => newSelected.add(member.id))
      } else {
        newSelected.delete(id)
        request.members.forEach((member) => newSelected.delete(member.id))
      }
    } else {
      if (checked) {
        newSelected.add(id)
      } else {
        newSelected.delete(id)
      }
    }

    setSelectedValidatedIds(newSelected)
  }

  const handleSelectAllValidated = (checked: boolean) => {
    if (checked) {
      setSelectedValidatedIds(new Set(sortedProcessedRequests.map((r) => r.id)))
    } else {
      setSelectedValidatedIds(new Set())
    }
  }

  const validateRequest = async (requestId: string) => {
    try {
      const request = allRequests.find((r) => r.id === requestId)
      if (!request || !request._apiValidators) {
        console.error('Request not found or missing API validators')
        return
      }

      // Find the current user's validator entry (assuming first pending validator for now)
      const myValidator = request._apiValidators.find((v: any) => v.status === 'pending')
      if (!myValidator) {
        console.error('No pending validator found for this request')
        return
      }

      // Call API to approve
      await StayRequestsApi.approveRequest(myValidator.id, validationNote || undefined)

      // Reload validations to get updated data
      await loadValidations()

      // Clear selection and note
      if (selectedRequest?.id === requestId) {
        setSelectedRequest(null)
      }
      setValidationNote('')
    } catch (err) {
      console.error('Failed to approve request:', err)
      setError('Échec de l\'approbation de la demande')
    }
  }

  const rejectRequest = async (requestId: string) => {
    try {
      const request = allRequests.find((r) => r.id === requestId)
      if (!request || !request._apiValidators) {
        console.error('Request not found or missing API validators')
        return
      }

      // Find the current user's validator entry (assuming first pending validator for now)
      const myValidator = request._apiValidators.find((v: any) => v.status === 'pending')
      if (!myValidator) {
        console.error('No pending validator found for this request')
        return
      }

      // Call API to reject
      await StayRequestsApi.rejectRequest(myValidator.id, validationNote || undefined)

      // Reload validations to get updated data
      await loadValidations()

      // Clear selection and note
      if (selectedRequest?.id === requestId) {
        setSelectedRequest(null)
      }
      setValidationNote('')
    } catch (err) {
      console.error('Failed to reject request:', err)
      setError('Échec du rejet de la demande')
    }
  }

  const cancelValidation = (requestId: string) => {
    setAllRequests((prev) => {
      const newRequests = [...prev]
      const requestIndex = newRequests.findIndex((r) => r.id === requestId)

      if (requestIndex === -1) {
        const teamIndex = newRequests.findIndex(
          (r) =>
            r.type === "team" &&
            (r.status === "approved" || r.status === "rejected") &&
            r.members?.some((m) => m.id === requestId),
        )

        if (teamIndex !== -1) {
          const team = newRequests[teamIndex]
          if (team.members) {
            const memberIndex = team.members.findIndex((m) => m.id === requestId)
            if (memberIndex !== -1) {
              // Move member back to pending
              const pendingMember = { ...team.members[memberIndex], status: "in-validation" as const }

              // Remove member from processed team
              const updatedMembers = team.members.filter((m) => m.id !== requestId)

              if (updatedMembers.length === 0) {
                // Remove processed team if empty
                newRequests.splice(teamIndex, 1)
              } else {
                newRequests[teamIndex] = { ...team, members: updatedMembers }
              }

              // Find or create pending team
              const originalTeamId = team.id.replace("-processed", "")
              const pendingTeamIndex = newRequests.findIndex(
                (r) =>
                  r.type === "team" &&
                  (r.status === "in-validation" || r.status === "pending") &&
                  (r.id === originalTeamId || r.teamName === team.teamName),
              )

              if (pendingTeamIndex !== -1) {
                // Add to existing pending team
                const pendingTeam = newRequests[pendingTeamIndex]
                newRequests[pendingTeamIndex] = {
                  ...pendingTeam,
                  members: [...(pendingTeam.members || []), pendingMember],
                }
              } else {
                // Create new pending team
                newRequests.push({
                  ...team,
                  id: originalTeamId,
                  status: "in-validation",
                  members: [pendingMember],
                })
              }
            }
          }
        }
        return newRequests
      }

      const request = newRequests[requestIndex]

      if (request.type === "team" && request.members) {
        // Move entire team back to pending
        const pendingMembers = request.members.map((m) => ({ ...m, status: "in-validation" as const }))
        newRequests[requestIndex] = {
          ...request,
          status: "in-validation",
          members: pendingMembers,
        }
      } else {
        // Move individual request back to pending
        newRequests[requestIndex] = { ...request, status: "in-validation" }
      }

      return newRequests
    })

    if (selectedRequest?.id === requestId) {
      setSelectedRequest(null)
    }
  }

  const handleBulkApprove = () => {
    selectedPendingIds.forEach((id) => validateRequest(id))
    setSelectedPendingIds(new Set())
  }

  const handleBulkReject = () => {
    selectedPendingIds.forEach((id) => rejectRequest(id))
    setSelectedPendingIds(new Set())
  }

  const handleBulkExport = (ids: Set<string>) => {
    console.log("[v0] Bulk exporting requests:", Array.from(ids))
  }

  const handleBulkDelete = (ids: Set<string>) => {
    console.log("[v0] Bulk deleting requests:", Array.from(ids))
  }

  const handleSort = (field: SortField, isPending: boolean) => {
    if (isPending) {
      if (pendingSortField === field) {
        // Cycle through: asc -> desc -> null
        if (pendingSortDirection === "asc") {
          setPendingSortDirection("desc")
        } else if (pendingSortDirection === "desc") {
          setPendingSortField(null)
          setPendingSortDirection(null)
        }
      } else {
        setPendingSortField(field)
        setPendingSortDirection("asc")
      }
    } else {
      if (validatedSortField === field) {
        if (validatedSortDirection === "asc") {
          setValidatedSortDirection("desc")
        } else if (validatedSortDirection === "desc") {
          setValidatedSortField(null)
          setValidatedSortDirection(null)
        }
      } else {
        setValidatedSortField(field)
        setValidatedSortDirection("asc")
      }
    }
  }

  const SortIcon = ({
    field,
    currentField,
    direction,
  }: { field: SortField; currentField: SortField | null; direction: SortDirection }) => {
    if (currentField !== field) return <ArrowUpDown className="h-3 w-3 text-muted-foreground" />
    if (direction === "asc") return <ArrowUp className="h-3 w-3" />
    if (direction === "desc") return <ArrowDown className="h-3 w-3" />
    return <ArrowUpDown className="h-3 w-3 text-muted-foreground" />
  }

  const handleSelectRequest = (request: StayRequest) => {
    setSelectedRequest(request as ValidationRequest)
    setValidationNote("")
    setAlternativeDates({ start: "", end: "" })
  }

  const handleApprove = () => {
    if (!selectedRequest) return
    validateRequest(selectedRequest.id)
    setValidationNote("")
  }

  const handleReject = () => {
    if (!selectedRequest) return
    rejectRequest(selectedRequest.id)
    setValidationNote("")
  }

  const handleCancelValidation = () => {
    if (!selectedRequest) return
    cancelValidation(selectedRequest.id)
    setValidationNote("")
  }

  const handleReschedule = () => {
    if (!selectedRequest) return
    console.log("[v0] Rescheduling request:", selectedRequest.id, "with dates:", alternativeDates)
    setAlternativeDates({ start: "", end: "" })
  }

  const getPriority = (request: StayRequest): "low" | "medium" | "high" | "urgent" => {
    if (request.status === "rejected") return "urgent"
    if (request.validationLevel === 0) return "high"
    if (request.validationLevel < 2) return "medium"
    return "low"
  }

  const getTeamCheckboxState = (team: ValidationRequest, selectedIds: Set<string>) => {
    if (!team.members) return { checked: false, indeterminate: false }

    const selectedMemberCount = team.members.filter((m) => selectedIds.has(m.id)).length
    const allSelected = selectedMemberCount === team.members.length
    const someSelected = selectedMemberCount > 0 && selectedMemberCount < team.members.length

    return {
      checked: allSelected,
      indeterminate: someSelected,
    }
  }

  const toggleExpandTeam = (teamId: string, isPending: boolean) => {
    if (isPending) {
      const newExpanded = new Set(expandedPendingTeamIds)
      if (newExpanded.has(teamId)) {
        newExpanded.delete(teamId)
      } else {
        newExpanded.add(teamId)
      }
      setExpandedPendingTeamIds(newExpanded)
    } else {
      const newExpanded = new Set(expandedValidatedTeamIds)
      if (newExpanded.has(teamId)) {
        newExpanded.delete(teamId)
      } else {
        newExpanded.add(teamId)
      }
      setExpandedValidatedTeamIds(newExpanded)
    }
  }

  const renderTableRows = (
    requests: ValidationRequest[],
    isPending: boolean,
    selectedIds: Set<string>,
    expandedTeamIds: Set<string>,
  ) => {
    const rows: ReactElement[] = []

    requests.forEach((request) => {
      const priority = getPriority(request)
      const isTeam = request.type === "team"
      const isExpanded = isTeam && expandedTeamIds.has(request.id)
      const teamCheckboxState = isTeam ? getTeamCheckboxState(request, selectedIds) : null

      // Render team or individual row
      rows.push(
        <TableRow
          key={request.id}
          className={`cursor-pointer hover:bg-muted/50 ${selectedRequest?.id === request.id ? "bg-muted" : ""} ${selectedIds.has(request.id) ? "bg-blue-500/5" : ""} ${isTeam ? "font-medium" : ""}`}
          onClick={() => handleSelectRequest(request)}
        >
          <TableCell onClick={(e) => e.stopPropagation()}>
            <Checkbox
              checked={teamCheckboxState?.checked || selectedIds.has(request.id)}
              // @ts-ignore - indeterminate is supported
              indeterminate={teamCheckboxState?.indeterminate}
              onCheckedChange={(checked) =>
                isPending
                  ? handleSelectPending(request.id, checked as boolean, request)
                  : handleSelectValidated(request.id, checked as boolean, request)
              }
            />
          </TableCell>
          <TableCell onClick={(e) => e.stopPropagation()}>
            {isTeam ? (
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0"
                  onClick={(e) => {
                    e.stopPropagation()
                    toggleExpandTeam(request.id, isPending)
                  }}
                >
                  {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                </Button>
              </div>
            ) : (
              <Avatar className="h-8 w-8">
                <AvatarImage src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${request.person}`} />
                <AvatarFallback className="text-xs">
                  {request.person
                    .split(" ")
                    .map((n) => n[0])
                    .join("")}
                </AvatarFallback>
              </Avatar>
            )}
          </TableCell>
          <TableCell className="font-medium">
            <div className="flex items-center gap-2">
              {isTeam && <Users className="h-4 w-4 text-blue-600" />}
              {isTeam ? request.teamName : request.person}
              {isTeam && request.members && (
                <Badge variant="secondary" className="text-xs bg-blue-500/10 text-blue-700">
                  {request.members.length} membres
                </Badge>
              )}
            </div>
          </TableCell>
          <TableCell>
            <Badge variant="secondary" className={`text-xs ${priorityColors[priority]}`}>
              {priority}
            </Badge>
          </TableCell>
          <TableCell>
            <Badge variant="secondary" className={`text-xs ${statusColors[request.status]}`}>
              {request.status}
            </Badge>
          </TableCell>
          <TableCell className="text-sm">{request.project}</TableCell>
          <TableCell className="text-sm">{request.site}</TableCell>
          <TableCell className="text-sm">Cabine Standard</TableCell>
          <TableCell className="text-sm whitespace-nowrap">
            {new Date(request.startDate).toLocaleDateString("fr-FR", {
              day: "2-digit",
              month: "short",
            })}{" "}
            - {new Date(request.endDate).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" })}
          </TableCell>
        </TableRow>,
      )

      // Render member rows if team is expanded
      if (isTeam && isExpanded && request.members) {
        request.members.forEach((member) => {
          const memberPriority = getPriority(member)
          const isMemberSelected = selectedIds.has(member.id)

          rows.push(
            <TableRow
              key={member.id}
              className={`cursor-pointer hover:bg-muted/50 ${selectedRequest?.id === member.id ? "bg-muted" : ""} ${isMemberSelected ? "bg-blue-500/5" : ""}`}
              onClick={() => handleSelectRequest(member)}
            >
              <TableCell onClick={(e) => e.stopPropagation()}>
                <div className="pl-6">
                  <Checkbox
                    checked={isMemberSelected}
                    onCheckedChange={(checked) =>
                      isPending
                        ? handleSelectPending(member.id, checked as boolean)
                        : handleSelectValidated(member.id, checked as boolean)
                    }
                  />
                </div>
              </TableCell>
              <TableCell>
                <div className="pl-6">
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${member.person}`} />
                    <AvatarFallback className="text-xs">
                      {member.person
                        .split(" ")
                        .map((n) => n[0])
                        .join("")}
                    </AvatarFallback>
                  </Avatar>
                </div>
              </TableCell>
              <TableCell className="pl-6 text-sm text-muted-foreground">{member.person}</TableCell>
              <TableCell>
                <Badge variant="secondary" className={`text-xs ${priorityColors[memberPriority]}`}>
                  {memberPriority}
                </Badge>
              </TableCell>
              <TableCell>
                <Badge variant="secondary" className={`text-xs ${statusColors[member.status]}`}>
                  {member.status}
                </Badge>
              </TableCell>
              <TableCell className="text-sm">{member.project}</TableCell>
              <TableCell className="text-sm">{member.site}</TableCell>
              <TableCell className="text-sm">Cabine Standard</TableCell>
              <TableCell className="text-sm whitespace-nowrap">
                {new Date(member.startDate).toLocaleDateString("fr-FR", {
                  day: "2-digit",
                  month: "short",
                })}{" "}
                - {new Date(member.endDate).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" })}
              </TableCell>
            </TableRow>,
          )
        })
      }
    })

    return rows
  }

  // Loading state
  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent mb-4" />
          <p className="text-sm text-muted-foreground">Chargement des validations...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] max-w-full overflow-hidden">
      {/* Error message */}
      {error && (
        <Alert variant="destructive" className="mx-6 mt-4">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Erreur</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <div className="border-b bg-background px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Validations</h1>
            <p className="text-sm text-muted-foreground mt-1">Gérez les demandes de séjour en attente de validation</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="bg-yellow-500/10 text-yellow-700">
              {pendingRequests.length} en attente
            </Badge>
            <Badge variant="secondary" className="bg-green-500/10 text-green-700">
              {processedRequests.length} traitées
            </Badge>
          </div>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 flex flex-col border-r min-w-0">
          <div
            className={`flex flex-col border-b overflow-hidden transition-all ${
              layoutMode === "bottom-full" ? "flex-none" : "flex-1"
            }`}
          >
            <div className="border-b bg-muted/30 px-4 py-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <h3 className="text-sm font-semibold">En attente de validation</h3>
                  <Badge variant="secondary" className="bg-yellow-500/10 text-yellow-700">
                    {sortedPendingRequests.length}
                  </Badge>
                  {selectedPendingIds.size > 0 && (
                    <>
                      <Badge variant="secondary" className="bg-blue-500/10 text-blue-700">
                        {selectedPendingIds.size} sélectionnée{selectedPendingIds.size > 1 ? "s" : ""}
                      </Badge>
                      <ButtonGroup>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs bg-transparent"
                          onClick={handleBulkApprove}
                        >
                          <Check className="h-3 w-3 mr-1" />
                          Valider
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs bg-transparent"
                          onClick={handleBulkReject}
                        >
                          <Ban className="h-3 w-3 mr-1" />
                          Refuser
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs bg-transparent"
                          onClick={() => handleBulkExport(selectedPendingIds)}
                        >
                          <Download className="h-3 w-3 mr-1" />
                          Exporter
                        </Button>
                      </ButtonGroup>
                    </>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant={layoutMode === "top-full" ? "default" : "ghost"}
                    size="sm"
                    className="h-6 w-6 p-0"
                    onClick={() => setLayoutMode("top-full")}
                    title="Agrandir le haut"
                  >
                    <ChevronsUp className="h-3 w-3" />
                  </Button>
                  <Button
                    variant={layoutMode === "split" ? "default" : "ghost"}
                    size="sm"
                    className="h-6 w-6 p-0"
                    onClick={() => setLayoutMode("split")}
                    title="Mode fractionné"
                  >
                    <SplitSquareVertical className="h-3 w-3" />
                  </Button>
                  <Button
                    variant={layoutMode === "bottom-full" ? "default" : "ghost"}
                    size="sm"
                    className="h-6 w-6 p-0"
                    onClick={() => setLayoutMode("bottom-full")}
                    title="Agrandir le bas"
                  >
                    <ChevronsDown className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            </div>
            {layoutMode !== "bottom-full" && (
              <div className="flex-1 overflow-auto">
                <Table>
                  <TableHeader className="sticky top-0 bg-background z-10">
                    <TableRow>
                      <TableHead className="w-12">
                        <Checkbox
                          checked={
                            sortedPendingRequests.length > 0 && selectedPendingIds.size === sortedPendingRequests.length
                          }
                          onCheckedChange={handleSelectAllPending}
                        />
                      </TableHead>
                      <TableHead className="w-12"></TableHead>
                      <TableHead>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 px-2 hover:bg-muted"
                          onClick={() => handleSort("person", true)}
                        >
                          Personne
                          <SortIcon field="person" currentField={pendingSortField} direction={pendingSortDirection} />
                        </Button>
                      </TableHead>
                      <TableHead>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 px-2 hover:bg-muted"
                          onClick={() => handleSort("priority", true)}
                        >
                          Priorité
                          <SortIcon field="priority" currentField={pendingSortField} direction={pendingSortDirection} />
                        </Button>
                      </TableHead>
                      <TableHead>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 px-2 hover:bg-muted"
                          onClick={() => handleSort("status", true)}
                        >
                          Statut
                          <SortIcon field="status" currentField={pendingSortField} direction={pendingSortDirection} />
                        </Button>
                      </TableHead>
                      <TableHead>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 px-2 hover:bg-muted"
                          onClick={() => handleSort("project", true)}
                        >
                          Projet
                          <SortIcon field="project" currentField={pendingSortField} direction={pendingSortDirection} />
                        </Button>
                      </TableHead>
                      <TableHead>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 px-2 hover:bg-muted"
                          onClick={() => handleSort("destination", true)}
                        >
                          Destination
                          <SortIcon
                            field="destination"
                            currentField={pendingSortField}
                            direction={pendingSortDirection}
                          />
                        </Button>
                      </TableHead>
                      <TableHead>Hébergement</TableHead>
                      <TableHead>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 px-2 hover:bg-muted"
                          onClick={() => handleSort("dates", true)}
                        >
                          Dates
                          <SortIcon field="dates" currentField={pendingSortField} direction={pendingSortDirection} />
                        </Button>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {renderTableRows(sortedPendingRequests, true, selectedPendingIds, expandedPendingTeamIds)}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>

          <div
            className={`flex flex-col overflow-hidden transition-all ${
              layoutMode === "top-full" ? "flex-none" : "flex-1"
            }`}
          >
            <div className="border-b bg-muted/30 px-4 py-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <h3 className="text-sm font-semibold">Demandes traitées</h3>
                  <Badge variant="secondary" className="bg-green-500/10 text-green-700">
                    {sortedProcessedRequests.length}
                  </Badge>
                  {selectedValidatedIds.size > 0 && (
                    <>
                      <Badge variant="secondary" className="bg-blue-500/10 text-blue-700">
                        {selectedValidatedIds.size} sélectionnée{selectedValidatedIds.size > 1 ? "s" : ""}
                      </Badge>
                      <ButtonGroup>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs bg-transparent"
                          onClick={() => handleBulkExport(selectedValidatedIds)}
                        >
                          <Download className="h-3 w-3 mr-1" />
                          Exporter
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs bg-transparent"
                          onClick={() => handleBulkDelete(selectedValidatedIds)}
                        >
                          <Trash2 className="h-3 w-3 mr-1" />
                          Supprimer
                        </Button>
                      </ButtonGroup>
                    </>
                  )}
                </div>
              </div>
            </div>
            {layoutMode !== "top-full" && (
              <div className="flex-1 overflow-auto">
                <Table>
                  <TableHeader className="sticky top-0 bg-background z-10">
                    <TableRow>
                      <TableHead className="w-12">
                        <Checkbox
                          checked={
                            sortedProcessedRequests.length > 0 &&
                            selectedValidatedIds.size === sortedProcessedRequests.length
                          }
                          onCheckedChange={handleSelectAllValidated}
                        />
                      </TableHead>
                      <TableHead className="w-12"></TableHead>
                      <TableHead>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 px-2 hover:bg-muted"
                          onClick={() => handleSort("person", false)}
                        >
                          Personne
                          <SortIcon
                            field="person"
                            currentField={validatedSortField}
                            direction={validatedSortDirection}
                          />
                        </Button>
                      </TableHead>
                      <TableHead>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 px-2 hover:bg-muted"
                          onClick={() => handleSort("priority", false)}
                        >
                          Priorité
                          <SortIcon
                            field="priority"
                            currentField={validatedSortField}
                            direction={validatedSortDirection}
                          />
                        </Button>
                      </TableHead>
                      <TableHead>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 px-2 hover:bg-muted"
                          onClick={() => handleSort("status", false)}
                        >
                          Statut
                          <SortIcon
                            field="status"
                            currentField={validatedSortField}
                            direction={validatedSortDirection}
                          />
                        </Button>
                      </TableHead>
                      <TableHead>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 px-2 hover:bg-muted"
                          onClick={() => handleSort("project", false)}
                        >
                          Projet
                          <SortIcon
                            field="project"
                            currentField={validatedSortField}
                            direction={validatedSortDirection}
                          />
                        </Button>
                      </TableHead>
                      <TableHead>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 px-2 hover:bg-muted"
                          onClick={() => handleSort("destination", false)}
                        >
                          Destination
                          <SortIcon
                            field="destination"
                            currentField={validatedSortField}
                            direction={validatedSortDirection}
                          />
                        </Button>
                      </TableHead>
                      <TableHead>Hébergement</TableHead>
                      <TableHead>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 px-2 hover:bg-muted"
                          onClick={() => handleSort("dates", false)}
                        >
                          Dates
                          <SortIcon
                            field="dates"
                            currentField={validatedSortField}
                            direction={validatedSortDirection}
                          />
                        </Button>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {renderTableRows(sortedProcessedRequests, false, selectedValidatedIds, expandedValidatedTeamIds)}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </div>

        <div
          className={`relative flex flex-col bg-muted/20 transition-all duration-300 overflow-visible ${
            isPanelCollapsed ? "w-0" : "w-full sm:w-[400px]"
          } min-w-0`}
        >
          <Button
            variant="ghost"
            size="sm"
            className={`absolute ${
              isPanelCollapsed ? "-left-6" : "left-0"
            } top-1/2 -translate-y-1/2 z-20 h-8 w-6 rounded-md border bg-background/95 backdrop-blur-sm shadow-sm hover:bg-muted hover:shadow-md transition-all`}
            onClick={() => setIsPanelCollapsed(!isPanelCollapsed)}
          >
            {isPanelCollapsed ? <ChevronLeft className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          </Button>

          {!isPanelCollapsed && (
            <>
              {selectedRequest ? (
                <>
                  <div className="border-b bg-background px-4 py-3">
                    <div className="flex items-start gap-3">
                      <Avatar className="h-12 w-12 border-2">
                        <AvatarImage
                          src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${selectedRequest.person}`}
                        />
                        <AvatarFallback>
                          {selectedRequest.person
                            .split(" ")
                            .map((n) => n[0])
                            .join("")}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-sm truncate">{selectedRequest.person}</h3>
                        <p className="text-xs text-muted-foreground">TotalEnergies • Ingénieur</p>
                        <Badge
                          variant="secondary"
                          className={`${statusColors[selectedRequest.status]} text-xs mt-1 inline-block`}
                        >
                          {selectedRequest.status}
                        </Badge>
                      </div>
                    </div>
                  </div>

                  <div className="flex-1 overflow-auto p-4 space-y-4">
                    {selectedRequest.status === "rejected" && (
                      <Alert variant="destructive" className="border-red-500/50 bg-red-500/10">
                        <AlertTriangle className="h-4 w-4" />
                        <AlertTitle className="text-sm font-semibold">Demande rejetée</AlertTitle>
                        <AlertDescription className="text-xs">
                          Cette demande a été rejetée. Consultez les notes pour plus d'informations.
                        </AlertDescription>
                      </Alert>
                    )}

                    <Card className="p-3 shadow-sm">
                      <div className="flex items-center gap-2 mb-3">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                        <h4 className="text-sm font-semibold">Résumé</h4>
                      </div>
                      <div className="space-y-2 text-xs">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Projet</span>
                          <span className="font-medium">{selectedRequest.project}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Site</span>
                          <span className="font-medium flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            {selectedRequest.site}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Période</span>
                          <span className="font-medium flex items-center gap-1">
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
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Hébergement</span>
                          <span className="font-medium">Cabine Standard</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Priorité</span>
                          <Badge
                            variant="secondary"
                            className={`text-xs ${priorityColors[getPriority(selectedRequest)]}`}
                          >
                            {getPriority(selectedRequest)}
                          </Badge>
                        </div>
                      </div>
                    </Card>

                    <Card className="p-3 shadow-sm">
                      <div className="flex items-center gap-2 mb-3">
                        <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
                        <h4 className="text-sm font-semibold">Niveau de validation</h4>
                      </div>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">
                            Niveau {selectedRequest.validationLevel} / {selectedRequest.totalLevels}
                          </span>
                          <span className="font-semibold">
                            {Math.round((selectedRequest.validationLevel / selectedRequest.totalLevels) * 100)}%
                          </span>
                        </div>
                        <Progress
                          value={(selectedRequest.validationLevel / selectedRequest.totalLevels) * 100}
                          className="h-2"
                        />
                        <div className="flex flex-wrap gap-2 mt-3">
                          {selectedRequest.validators.map((validator, i) => (
                            <div
                              key={i}
                              className={`flex items-center gap-2 p-2 rounded-md text-xs flex-1 min-w-[120px] ${
                                validator.status === "approved"
                                  ? "bg-green-500/10"
                                  : validator.status === "rejected"
                                    ? "bg-red-500/10"
                                    : "bg-gray-500/10"
                              }`}
                            >
                              <div
                                className={`flex h-6 w-6 items-center justify-center rounded-full flex-shrink-0 ${
                                  validator.status === "approved"
                                    ? "bg-green-500/20 text-green-700"
                                    : validator.status === "rejected"
                                      ? "bg-red-500/20 text-red-700"
                                      : "bg-gray-500/20 text-gray-700"
                                }`}
                              >
                                {validator.status === "approved" ? (
                                  <CheckCircle2 className="h-3 w-3" />
                                ) : validator.status === "rejected" ? (
                                  <XCircle className="h-3 w-3" />
                                ) : (
                                  <Clock className="h-3 w-3" />
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="font-medium truncate">{validator.name}</p>
                                <p className="text-[10px] text-muted-foreground">Niveau {validator.level}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </Card>

                    <Card className="p-3 shadow-sm">
                      <div className="flex items-center gap-2 mb-3">
                        <AlertTriangle className="h-4 w-4 text-yellow-600" />
                        <h4 className="text-sm font-semibold">Informations importantes</h4>
                      </div>
                      <div className="space-y-2 text-xs">
                        <div className="p-2 rounded-md bg-yellow-500/10 border border-yellow-500/20">
                          <p className="font-medium text-yellow-700">Premier séjour sur site</p>
                          <p className="text-muted-foreground mt-1">
                            Cette personne n'a jamais été mobilisée sur ce site. Vérifier les formations obligatoires.
                          </p>
                        </div>
                        <div className="p-2 rounded-md bg-blue-500/10 border border-blue-500/20">
                          <p className="font-medium text-blue-700">Formations à jour</p>
                          <p className="text-muted-foreground mt-1">
                            Toutes les formations obligatoires sont valides jusqu'au 15/01/2025.
                          </p>
                        </div>
                      </div>
                    </Card>

                    <Card className="p-3 shadow-sm">
                      <div className="flex items-center gap-2 mb-3">
                        <User className="h-4 w-4 text-muted-foreground" />
                        <h4 className="text-sm font-semibold">Note de validation</h4>
                      </div>
                      <Textarea
                        placeholder="Ajoutez une note ou un commentaire..."
                        className="min-h-[100px] text-xs resize-none"
                        value={validationNote}
                        onChange={(e) => setValidationNote(e.target.value)}
                      />
                    </Card>

                    <Card className="p-3 shadow-sm">
                      <div className="flex items-center gap-2 mb-3">
                        <CalendarClock className="h-4 w-4 text-muted-foreground" />
                        <h4 className="text-sm font-semibold">Reprogrammer (optionnel)</h4>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <label className="text-xs font-medium text-muted-foreground">Nouvelle date début</label>
                          <input
                            type="date"
                            className="w-full px-2 py-1.5 border rounded-md text-xs focus:outline-none focus:ring-2 focus:ring-primary"
                            value={alternativeDates.start}
                            onChange={(e) => setAlternativeDates({ ...alternativeDates, start: e.target.value })}
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs font-medium text-muted-foreground">Nouvelle date fin</label>
                          <input
                            type="date"
                            className="w-full px-2 py-1.5 border rounded-md text-xs focus:outline-none focus:ring-2 focus:ring-primary"
                            value={alternativeDates.end}
                            onChange={(e) => setAlternativeDates({ ...alternativeDates, end: e.target.value })}
                          />
                        </div>
                      </div>
                    </Card>
                  </div>

                  <div className="border-t bg-background p-4 space-y-2">
                    {selectedRequest.status === "in-validation" || selectedRequest.status === "pending" ? (
                      <>
                        <Button className="w-full" onClick={handleApprove}>
                          <Check className="h-4 w-4 mr-2" />
                          Valider
                        </Button>
                        <div className="grid grid-cols-2 gap-2">
                          <Button variant="outline" onClick={handleReject}>
                            <Ban className="h-4 w-4 mr-2" />
                            Refuser
                          </Button>
                          <Button variant="outline" onClick={handleReschedule}>
                            <CalendarClock className="h-4 w-4 mr-2" />
                            Reprogrammer
                          </Button>
                        </div>
                      </>
                    ) : (
                      <>
                        <Button className="w-full bg-transparent" variant="outline" onClick={handleCancelValidation}>
                          <XCircle className="h-4 w-4 mr-2" />
                          Annuler la validation
                        </Button>
                        <p className="text-xs text-center text-muted-foreground">
                          Cette demande sera remise en attente de validation
                        </p>
                      </>
                    )}
                  </div>
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center p-8">
                  <div className="text-center space-y-2">
                    <FileText className="h-12 w-12 text-muted-foreground mx-auto" />
                    <p className="text-sm text-muted-foreground">Sélectionnez une demande pour voir les détails</p>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
