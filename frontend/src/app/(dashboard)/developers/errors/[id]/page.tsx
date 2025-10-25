"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import {
  getErrorLog,
  updateErrorLog,
  deleteErrorLog,
  type ErrorLog,
  ErrorStatus,
  ErrorSeverity,
} from "@/api/error-tracking"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  AlertCircle,
  AlertTriangle,
  Info,
  Bug,
  XCircle,
  CheckCircle,
  Clock,
  ArrowLeft,
  Trash2,
  Save,
  Calendar,
  User,
  FileCode,
  Globe,
  Monitor,
} from "lucide-react"
import { formatDistanceToNow, format } from "date-fns"
import { fr } from "date-fns/locale"

interface ErrorDetailPageProps {
  params: {
    id: string
  }
}

export default function ErrorDetailPage({ params }: ErrorDetailPageProps) {
  const router = useRouter()
  const [error, setError] = useState<ErrorLog | null>(null)
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState<ErrorStatus>(ErrorStatus.OPEN)
  const [resolutionNotes, setResolutionNotes] = useState("")
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    loadError()
  }, [params.id])

  async function loadError() {
    setLoading(true)
    try {
      const data = await getErrorLog(params.id)
      setError(data)
      setStatus(data.status)
      setResolutionNotes(data.resolution_notes || "")
    } catch (error) {
      console.error("Failed to load error:", error)
    } finally {
      setLoading(false)
    }
  }

  async function handleUpdate() {
    if (!error) return
    setSaving(true)
    try {
      await updateErrorLog(error.id, {
        status,
        resolution_notes: resolutionNotes || undefined,
      })
      await loadError()
    } catch (error) {
      console.error("Failed to update error:", error)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!error) return
    if (!confirm("Êtes-vous sûr de vouloir supprimer cette erreur ?")) return
    try {
      await deleteErrorLog(error.id)
      router.push("/developers/errors")
    } catch (error) {
      console.error("Failed to delete error:", error)
    }
  }

  function getSeverityIcon(severity: ErrorSeverity) {
    switch (severity) {
      case ErrorSeverity.CRITICAL:
        return <XCircle className="h-5 w-5 text-red-500" />
      case ErrorSeverity.ERROR:
        return <AlertCircle className="h-5 w-5 text-orange-500" />
      case ErrorSeverity.WARNING:
        return <AlertTriangle className="h-5 w-5 text-yellow-500" />
      case ErrorSeverity.INFO:
        return <Info className="h-5 w-5 text-blue-500" />
      case ErrorSeverity.DEBUG:
        return <Bug className="h-5 w-5 text-gray-500" />
    }
  }

  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900" />
        </div>
      </div>
    )
  }

  if (!error) {
    return (
      <div className="container mx-auto p-6">
        <div className="text-center">
          <h2 className="text-2xl font-bold">Erreur non trouvée</h2>
          <Button onClick={() => router.push("/developers/errors")} className="mt-4">
            Retour à la liste
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              {getSeverityIcon(error.severity)}
              <h1 className="text-2xl font-bold">{error.error_type}</h1>
            </div>
            <p className="text-muted-foreground text-sm">ID: {error.id}</p>
          </div>
        </div>
        <Button variant="destructive" onClick={handleDelete}>
          <Trash2 className="h-4 w-4 mr-2" />
          Supprimer
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Error Message */}
          <Card>
            <CardHeader>
              <CardTitle>Message d'erreur</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm font-mono bg-muted p-4 rounded-md">{error.message}</p>
            </CardContent>
          </Card>

          {/* Stack Trace */}
          {error.stacktrace && (
            <Card>
              <CardHeader>
                <CardTitle>Stack Trace</CardTitle>
              </CardHeader>
              <CardContent>
                <pre className="text-xs font-mono bg-muted p-4 rounded-md overflow-x-auto max-h-96">
                  {error.stacktrace}
                </pre>
              </CardContent>
            </Card>
          )}

          {/* Technical Context */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileCode className="h-5 w-5" />
                Contexte Technique
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {error.file_path && (
                <div className="grid grid-cols-4 gap-2">
                  <div className="font-semibold text-sm">Fichier:</div>
                  <div className="col-span-3 font-mono text-sm">{error.file_path}</div>
                </div>
              )}
              {error.line_number && (
                <div className="grid grid-cols-4 gap-2">
                  <div className="font-semibold text-sm">Ligne:</div>
                  <div className="col-span-3 font-mono text-sm">{error.line_number}</div>
                </div>
              )}
              {error.function_name && (
                <div className="grid grid-cols-4 gap-2">
                  <div className="font-semibold text-sm">Fonction:</div>
                  <div className="col-span-3 font-mono text-sm">{error.function_name}</div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* User Context */}
          {(error.request_path || error.user_agent || error.ip_address) && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Globe className="h-5 w-5" />
                  Contexte Utilisateur
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {error.request_path && (
                  <div className="grid grid-cols-4 gap-2">
                    <div className="font-semibold text-sm">URL:</div>
                    <div className="col-span-3 font-mono text-sm">{error.request_path}</div>
                  </div>
                )}
                {error.request_method && (
                  <div className="grid grid-cols-4 gap-2">
                    <div className="font-semibold text-sm">Méthode:</div>
                    <div className="col-span-3">
                      <Badge variant="outline">{error.request_method}</Badge>
                    </div>
                  </div>
                )}
                {error.ip_address && (
                  <div className="grid grid-cols-4 gap-2">
                    <div className="font-semibold text-sm">IP:</div>
                    <div className="col-span-3 font-mono text-sm">{error.ip_address}</div>
                  </div>
                )}
                {error.user_agent && (
                  <div className="grid grid-cols-4 gap-2">
                    <div className="font-semibold text-sm">User Agent:</div>
                    <div className="col-span-3 font-mono text-xs break-all">
                      {error.user_agent}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Extra Data */}
          {error.extra_data && Object.keys(error.extra_data).length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Données Supplémentaires</CardTitle>
              </CardHeader>
              <CardContent>
                <pre className="text-xs font-mono bg-muted p-4 rounded-md overflow-x-auto">
                  {JSON.stringify(error.extra_data, null, 2)}
                </pre>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Info Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Monitor className="h-5 w-5" />
                Informations
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <div className="text-sm font-semibold mb-1">Sévérité</div>
                <Badge
                  className={
                    error.severity === ErrorSeverity.CRITICAL
                      ? "bg-red-100 text-red-800"
                      : error.severity === ErrorSeverity.ERROR
                      ? "bg-orange-100 text-orange-800"
                      : error.severity === ErrorSeverity.WARNING
                      ? "bg-yellow-100 text-yellow-800"
                      : "bg-blue-100 text-blue-800"
                  }
                >
                  {error.severity.toUpperCase()}
                </Badge>
              </div>

              <div>
                <div className="text-sm font-semibold mb-1">Source</div>
                <Badge variant="outline">{error.source}</Badge>
              </div>

              <div>
                <div className="text-sm font-semibold mb-1">Occurrences</div>
                <Badge variant="secondary" className="text-lg">
                  {error.occurrence_count}
                </Badge>
              </div>

              <div>
                <div className="text-sm font-semibold mb-1 flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  Première occurrence
                </div>
                <div className="text-sm text-muted-foreground">
                  {format(new Date(error.created_at), "PPpp", { locale: fr })}
                </div>
              </div>

              <div>
                <div className="text-sm font-semibold mb-1 flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  Dernière occurrence
                </div>
                <div className="text-sm text-muted-foreground">
                  {formatDistanceToNow(new Date(error.last_seen_at), {
                    addSuffix: true,
                    locale: fr,
                  })}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Resolution Card */}
          <Card>
            <CardHeader>
              <CardTitle>Résolution</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-semibold mb-2 block">Statut</label>
                <Select value={status} onValueChange={(value) => setStatus(value as ErrorStatus)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ErrorStatus.OPEN}>Open</SelectItem>
                    <SelectItem value={ErrorStatus.IN_PROGRESS}>In Progress</SelectItem>
                    <SelectItem value={ErrorStatus.RESOLVED}>Resolved</SelectItem>
                    <SelectItem value={ErrorStatus.IGNORED}>Ignored</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm font-semibold mb-2 block">Notes de résolution</label>
                <Textarea
                  value={resolutionNotes}
                  onChange={(e) => setResolutionNotes(e.target.value)}
                  placeholder="Décrivez comment cette erreur a été résolue..."
                  rows={4}
                />
              </div>

              <Button onClick={handleUpdate} disabled={saving} className="w-full">
                <Save className="h-4 w-4 mr-2" />
                {saving ? "Enregistrement..." : "Enregistrer"}
              </Button>

              {error.resolved_at && (
                <div className="pt-4 border-t">
                  <div className="text-sm font-semibold mb-1 flex items-center gap-1 text-green-700">
                    <CheckCircle className="h-3 w-3" />
                    Résolue
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {format(new Date(error.resolved_at), "PPpp", { locale: fr })}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
