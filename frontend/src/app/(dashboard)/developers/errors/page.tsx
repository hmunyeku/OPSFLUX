"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import {
  getErrorLogs,
  getErrorStats,
  updateErrorLog,
  deleteErrorLog,
  type ErrorLog,
  type ErrorStats,
  type ErrorLogFilters,
  ErrorSeverity,
  ErrorStatus,
  ErrorSource,
} from "@/api/error-tracking"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  AlertCircle,
  AlertTriangle,
  Info,
  Bug,
  XCircle,
  CheckCircle,
  Clock,
  Trash2,
  RefreshCw,
  Search,
} from "lucide-react"
import { formatDistanceToNow } from "date-fns"
import { fr } from "date-fns/locale"

export default function ErrorTrackingPage() {
  const router = useRouter()
  const [errors, setErrors] = useState<ErrorLog[]>([])
  const [stats, setStats] = useState<ErrorStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [total, setTotal] = useState(0)

  // Filters
  const [filters, setFilters] = useState<ErrorLogFilters>({
    skip: 0,
    limit: 50,
  })
  const [searchQuery, setSearchQuery] = useState("")

  useEffect(() => {
    loadData()
  }, [filters])

  async function loadData() {
    setLoading(true)
    try {
      const [errorsData, statsData] = await Promise.all([
        getErrorLogs(filters),
        getErrorStats(7),
      ])
      setErrors(errorsData.data)
      setTotal(errorsData.count)
      setStats(statsData)
    } catch (error) {
      console.error("Failed to load error tracking data:", error)
    } finally {
      setLoading(false)
    }
  }

  function handleSearch() {
    setFilters({ ...filters, search: searchQuery, skip: 0 })
  }

  function getSeverityIcon(severity: ErrorSeverity) {
    switch (severity) {
      case ErrorSeverity.CRITICAL:
        return <XCircle className="h-4 w-4 text-red-500" />
      case ErrorSeverity.ERROR:
        return <AlertCircle className="h-4 w-4 text-orange-500" />
      case ErrorSeverity.WARNING:
        return <AlertTriangle className="h-4 w-4 text-yellow-500" />
      case ErrorSeverity.INFO:
        return <Info className="h-4 w-4 text-blue-500" />
      case ErrorSeverity.DEBUG:
        return <Bug className="h-4 w-4 text-gray-500" />
    }
  }

  function getSeverityBadge(severity: ErrorSeverity) {
    const variants: Record<ErrorSeverity, string> = {
      [ErrorSeverity.CRITICAL]: "bg-red-100 text-red-800 border-red-300",
      [ErrorSeverity.ERROR]: "bg-orange-100 text-orange-800 border-orange-300",
      [ErrorSeverity.WARNING]: "bg-yellow-100 text-yellow-800 border-yellow-300",
      [ErrorSeverity.INFO]: "bg-blue-100 text-blue-800 border-blue-300",
      [ErrorSeverity.DEBUG]: "bg-gray-100 text-gray-800 border-gray-300",
    }
    return <Badge className={variants[severity]}>{severity.toUpperCase()}</Badge>
  }

  function getStatusBadge(status: ErrorStatus) {
    const variants: Record<ErrorStatus, { class: string; icon: any }> = {
      [ErrorStatus.OPEN]: { class: "bg-red-100 text-red-800", icon: <AlertCircle className="h-3 w-3" /> },
      [ErrorStatus.IN_PROGRESS]: { class: "bg-blue-100 text-blue-800", icon: <Clock className="h-3 w-3" /> },
      [ErrorStatus.RESOLVED]: { class: "bg-green-100 text-green-800", icon: <CheckCircle className="h-3 w-3" /> },
      [ErrorStatus.IGNORED]: { class: "bg-gray-100 text-gray-800", icon: <XCircle className="h-3 w-3" /> },
    }
    const variant = variants[status]
    return (
      <Badge className={`${variant.class} flex items-center gap-1`}>
        {variant.icon}
        {status.replace("_", " ").toUpperCase()}
      </Badge>
    )
  }

  async function handleDelete(errorId: string) {
    if (!confirm("Êtes-vous sûr de vouloir supprimer cette erreur ?")) return
    try {
      await deleteErrorLog(errorId)
      loadData()
    } catch (error) {
      console.error("Failed to delete error:", error)
    }
  }

  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center h-64">
          <RefreshCw className="h-8 w-8 animate-spin text-gray-400" />
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Error Tracking</h1>
          <p className="text-muted-foreground">
            Surveillance et gestion des erreurs applicatives
          </p>
        </div>
        <Button onClick={loadData} variant="outline" size="sm">
          <RefreshCw className="h-4 w-4 mr-2" />
          Actualiser
        </Button>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Erreurs (7j)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.total_errors}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Erreurs Ouvertes
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">{stats.open_errors}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Erreurs Critiques
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-orange-600">{stats.critical_errors}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Erreurs Résolues
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{stats.resolved_errors}</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Filtres</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* Search */}
            <div className="md:col-span-2 flex gap-2">
              <Input
                placeholder="Rechercher par message ou type d'erreur..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              />
              <Button onClick={handleSearch} size="icon">
                <Search className="h-4 w-4" />
              </Button>
            </div>

            {/* Severity */}
            <Select
              value={filters.severity || "all"}
              onValueChange={(value) =>
                setFilters({ ...filters, severity: value === "all" ? undefined : value as ErrorSeverity, skip: 0 })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Sévérité" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes sévérités</SelectItem>
                <SelectItem value={ErrorSeverity.CRITICAL}>Critical</SelectItem>
                <SelectItem value={ErrorSeverity.ERROR}>Error</SelectItem>
                <SelectItem value={ErrorSeverity.WARNING}>Warning</SelectItem>
                <SelectItem value={ErrorSeverity.INFO}>Info</SelectItem>
                <SelectItem value={ErrorSeverity.DEBUG}>Debug</SelectItem>
              </SelectContent>
            </Select>

            {/* Status */}
            <Select
              value={filters.status || "all"}
              onValueChange={(value) =>
                setFilters({ ...filters, status: value === "all" ? undefined : value as ErrorStatus, skip: 0 })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Statut" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous statuts</SelectItem>
                <SelectItem value={ErrorStatus.OPEN}>Open</SelectItem>
                <SelectItem value={ErrorStatus.IN_PROGRESS}>In Progress</SelectItem>
                <SelectItem value={ErrorStatus.RESOLVED}>Resolved</SelectItem>
                <SelectItem value={ErrorStatus.IGNORED}>Ignored</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Errors Table */}
      <Card>
        <CardHeader>
          <CardTitle>Erreurs ({total})</CardTitle>
          <CardDescription>
            Liste des erreurs enregistrées dans le système
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Sévérité</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Message</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Occurrences</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead>Dernière vue</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {errors.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                    Aucune erreur trouvée
                  </TableCell>
                </TableRow>
              ) : (
                errors.map((error) => (
                  <TableRow
                    key={error.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => router.push(`/developers/errors/${error.id}`)}
                  >
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {getSeverityIcon(error.severity)}
                        {getSeverityBadge(error.severity)}
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-sm">{error.error_type}</TableCell>
                    <TableCell className="max-w-md truncate">{error.message}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{error.source}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{error.occurrence_count}</Badge>
                    </TableCell>
                    <TableCell>{getStatusBadge(error.status)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDistanceToNow(new Date(error.last_seen_at), {
                        addSuffix: true,
                        locale: fr,
                      })}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleDelete(error.id)
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
