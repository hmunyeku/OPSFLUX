"use client"

import * as React from "react"
import {
  Package,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  FileText,
  MapPin,
  User,
  Calendar,
  Loader2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { travelwizAPI } from "@/src/api/travelwiz"
import { YardDispatchStatusEnum, type YardDispatchPublic } from "@/types/travelwiz"
import { useHeaderContext } from "@/components/header-context"
import { useToast } from "@/hooks/use-toast"

export function YardDispatchContent() {
  const { setContextualHeader, clearContextualHeader } = useHeaderContext()
  const { toast } = useToast()
  const [searchQuery, setSearchQuery] = React.useState("")
  const [dispatches, setDispatches] = React.useState<YardDispatchPublic[]>([])
  const [loading, setLoading] = React.useState(true)
  const [selectedDispatch, setSelectedDispatch] = React.useState<YardDispatchPublic | null>(null)
  const [processing, setProcessing] = React.useState(false)

  // Fetch yard dispatches from API
  const fetchDispatches = React.useCallback(async () => {
    try {
      setLoading(true)
      const response = await travelwizAPI.getYardDispatches({
        limit: 100,
      })
      setDispatches(response.data)
    } catch (error) {
      console.error("Error fetching dispatches:", error)
      toast({
        title: "Erreur",
        description: "Impossible de charger les dispatches Yard",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }, [toast])

  React.useEffect(() => {
    fetchDispatches()
  }, [fetchDispatches])

  React.useEffect(() => {
    setContextualHeader({
      searchPlaceholder: "Rechercher par statut, zone...",
      onSearchChange: setSearchQuery,
    })

    return () => clearContextualHeader()
  }, [setContextualHeader, clearContextualHeader])

  const filteredDispatches = dispatches.filter((dispatch) => {
    const matchesSearch =
      dispatch.status.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (dispatch.dispatch_location || "").toLowerCase().includes(searchQuery.toLowerCase())
    return matchesSearch
  })

  const stats = {
    total: dispatches.length,
    pending: dispatches.filter(
      (d) =>
        d.status === YardDispatchStatusEnum.EN_ATTENTE_RECEPTION || d.status === YardDispatchStatusEnum.RECEPTIONNE
    ).length,
    verified: dispatches.filter((d) => d.status === YardDispatchStatusEnum.VERIFIE).length,
    dispatched: dispatches.filter((d) => d.status === YardDispatchStatusEnum.DISPATCHE).length,
    anomalies: dispatches.filter((d) => d.status === YardDispatchStatusEnum.EN_ANOMALIE).length,
  }

  const handleProcess = async (dispatch: YardDispatchPublic) => {
    setSelectedDispatch(dispatch)
    setProcessing(true)
  }

  const handleSaveDispatch = async (dispatchData: any) => {
    if (!selectedDispatch) return

    try {
      await travelwizAPI.updateYardDispatch(selectedDispatch.id, dispatchData)
      toast({
        title: "Succès",
        description: "Dispatch Yard mis à jour",
      })
      fetchDispatches()
      setProcessing(false)
      setSelectedDispatch(null)
    } catch (error) {
      toast({
        title: "Erreur",
        description: "Impossible de mettre à jour le dispatch",
        variant: "destructive",
      })
    }
  }

  if (processing && selectedDispatch) {
    return (
      <YardDispatchProcessPanel
        dispatch={selectedDispatch}
        onSave={handleSaveDispatch}
        onCancel={() => {
          setProcessing(false)
          setSelectedDispatch(null)
        }}
      />
    )
  }

  return (
    <div className="flex flex-col gap-3 p-3">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
        <Card className="p-2">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-blue-500/10">
              <Package className="h-3.5 w-3.5 text-blue-500" />
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground">Total</p>
              <p className="text-lg font-bold leading-none">{loading ? "..." : stats.total}</p>
            </div>
          </div>
        </Card>

        <Card className="p-2">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-yellow-500/10">
              <Calendar className="h-3.5 w-3.5 text-yellow-500" />
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground">En Attente</p>
              <p className="text-lg font-bold leading-none">{loading ? "..." : stats.pending}</p>
            </div>
          </div>
        </Card>

        <Card className="p-2">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-blue-500/10">
              <CheckCircle2 className="h-3.5 w-3.5 text-blue-500" />
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground">Vérifiés</p>
              <p className="text-lg font-bold leading-none">{loading ? "..." : stats.verified}</p>
            </div>
          </div>
        </Card>

        <Card className="p-2">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-green-500/10">
              <MapPin className="h-3.5 w-3.5 text-green-500" />
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground">Dispatchés</p>
              <p className="text-lg font-bold leading-none">{loading ? "..." : stats.dispatched}</p>
            </div>
          </div>
        </Card>

        <Card className="p-2">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-red-500/10">
              <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground">Anomalies</p>
              <p className="text-lg font-bold leading-none">{loading ? "..." : stats.anomalies}</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Loading State */}
      {loading && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Empty State */}
      {!loading && filteredDispatches.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12">
          <Package className="h-12 w-12 text-muted-foreground mb-4" />
          <p className="text-sm text-muted-foreground">Aucun dispatch Yard trouvé</p>
        </div>
      )}

      {/* Dispatches Grid */}
      {!loading && (
        <div className="grid grid-cols-1 gap-2 lg:grid-cols-2 xl:grid-cols-3">
          {filteredDispatches.map((dispatch) => (
            <Card key={dispatch.id} className="p-2 hover:shadow-md transition-shadow">
              <div className="flex flex-col gap-2">
                {/* Header */}
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-md bg-blue-500/10">
                      <Package className="h-4 w-4 text-blue-500" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold leading-none">Dispatch</p>
                      <p className="text-[10px] text-muted-foreground">{dispatch.back_cargo_id}</p>
                    </div>
                  </div>
                  <Badge
                    variant={
                      dispatch.status === YardDispatchStatusEnum.DISPATCHE
                        ? "default"
                        : dispatch.status === YardDispatchStatusEnum.EN_ANOMALIE
                        ? "destructive"
                        : "secondary"
                    }
                    className="h-5 text-[9px]"
                  >
                    {dispatch.status}
                  </Badge>
                </div>

                {/* Details */}
                <div className="grid grid-cols-2 gap-1.5 text-[10px]">
                  {dispatch.reception_date && (
                    <div>
                      <p className="text-muted-foreground">Réceptionné</p>
                      <p className="font-medium">{new Date(dispatch.reception_date).toLocaleDateString("fr-FR")}</p>
                    </div>
                  )}
                  {dispatch.yard_officer && (
                    <div>
                      <p className="text-muted-foreground">Agent Yard</p>
                      <p className="font-medium">{dispatch.yard_officer}</p>
                    </div>
                  )}
                  {dispatch.dispatch_location && (
                    <div>
                      <p className="text-muted-foreground">Emplacement</p>
                      <p className="font-medium">{dispatch.dispatch_location}</p>
                    </div>
                  )}
                  {dispatch.dispatch_zone && (
                    <div>
                      <p className="text-muted-foreground">Zone</p>
                      <p className="font-medium">{dispatch.dispatch_zone}</p>
                    </div>
                  )}
                </div>

                {/* Status Indicators */}
                <div className="flex items-center gap-1 text-[9px]">
                  {dispatch.verification_completed ? (
                    <CheckCircle2 className="h-3 w-3 text-green-500" />
                  ) : (
                    <XCircle className="h-3 w-3 text-gray-300" />
                  )}
                  <span className={dispatch.verification_completed ? "text-green-600" : "text-muted-foreground"}>
                    Vérifié
                  </span>
                  {dispatch.exit_pass_generated ? (
                    <CheckCircle2 className="h-3 w-3 text-green-500" />
                  ) : (
                    <XCircle className="h-3 w-3 text-gray-300" />
                  )}
                  <span className={dispatch.exit_pass_generated ? "text-green-600" : "text-muted-foreground"}>
                    Laissez-passer
                  </span>
                  {dispatch.notification_sent ? (
                    <CheckCircle2 className="h-3 w-3 text-green-500" />
                  ) : (
                    <XCircle className="h-3 w-3 text-gray-300" />
                  )}
                  <span className={dispatch.notification_sent ? "text-green-600" : "text-muted-foreground"}>
                    Notifié
                  </span>
                </div>

                {/* Anomalies */}
                {dispatch.verification_anomalies && dispatch.verification_anomalies.length > 0 && (
                  <div className="rounded-md bg-red-50 p-1.5">
                    <div className="flex items-start gap-1">
                      <AlertTriangle className="h-3 w-3 text-red-500 mt-0.5" />
                      <div className="flex-1">
                        <p className="text-[9px] font-medium text-red-700">Anomalies</p>
                        <p className="text-[9px] text-red-600">{dispatch.verification_anomalies.join(", ")}</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-1">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 flex-1 text-[10px] bg-transparent"
                    onClick={() => handleProcess(dispatch)}
                  >
                    Traiter
                  </Button>
                  {dispatch.exit_pass_url && (
                    <Button size="sm" variant="outline" className="h-6 px-2 bg-transparent">
                      <FileText className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

// Yard Dispatch Processing Panel
interface YardDispatchProcessPanelProps {
  dispatch: YardDispatchPublic
  onSave: (data: any) => void
  onCancel: () => void
}

function YardDispatchProcessPanel({ dispatch, onSave, onCancel }: YardDispatchProcessPanelProps) {
  const [status, setStatus] = React.useState(dispatch.status)
  const [receptionDate, setReceptionDate] = React.useState(dispatch.reception_date || "")
  const [yardOfficer, setYardOfficer] = React.useState(dispatch.yard_officer || "")
  const [verificationCompleted, setVerificationCompleted] = React.useState(dispatch.verification_completed)
  const [verificationNotes, setVerificationNotes] = React.useState(dispatch.verification_notes || "")
  const [isCompliant, setIsCompliant] = React.useState(dispatch.is_compliant)
  const [notificationSent, setNotificationSent] = React.useState(dispatch.notification_sent)
  const [notificationMethod, setNotificationMethod] = React.useState(dispatch.notification_method || "")
  const [exitPassGenerated, setExitPassGenerated] = React.useState(dispatch.exit_pass_generated)
  const [dispatchLocation, setDispatchLocation] = React.useState(dispatch.dispatch_location || "")
  const [dispatchZone, setDispatchZone] = React.useState(dispatch.dispatch_zone || "")
  const [dispatchNotes, setDispatchNotes] = React.useState(dispatch.dispatch_notes || "")

  const handleSubmit = () => {
    const data = {
      status,
      reception_date: receptionDate || undefined,
      yard_officer: yardOfficer || undefined,
      verification_completed: verificationCompleted,
      verification_notes: verificationNotes || undefined,
      is_compliant: isCompliant,
      notification_sent: notificationSent,
      notification_method: notificationMethod || undefined,
      exit_pass_generated: exitPassGenerated,
      dispatch_location: dispatchLocation || undefined,
      dispatch_zone: dispatchZone || undefined,
      dispatch_notes: dispatchNotes || undefined,
      dispatch_date: new Date().toISOString(),
    }

    onSave(data)
  }

  return (
    <div className="p-3 space-y-3 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Traitement Dispatch Yard</h2>
          <p className="text-xs text-muted-foreground">ID: {dispatch.back_cargo_id}</p>
        </div>
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Annuler
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Statut</CardTitle>
        </CardHeader>
        <CardContent>
          <Select value={status} onValueChange={(val) => setStatus(val as YardDispatchStatusEnum)}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={YardDispatchStatusEnum.EN_ATTENTE_RECEPTION}>En attente réception</SelectItem>
              <SelectItem value={YardDispatchStatusEnum.RECEPTIONNE}>Réceptionné</SelectItem>
              <SelectItem value={YardDispatchStatusEnum.VERIFIE}>Vérifié</SelectItem>
              <SelectItem value={YardDispatchStatusEnum.NOTIFIE}>Notifié</SelectItem>
              <SelectItem value={YardDispatchStatusEnum.EN_ATTENTE_RETRAIT}>En attente retrait</SelectItem>
              <SelectItem value={YardDispatchStatusEnum.RETIRE}>Retiré</SelectItem>
              <SelectItem value={YardDispatchStatusEnum.DISPATCHE}>Dispatché</SelectItem>
              <SelectItem value={YardDispatchStatusEnum.EN_ANOMALIE}>En anomalie</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Réception</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Date de Réception</Label>
              <Input
                type="datetime-local"
                className="h-8 text-xs"
                value={receptionDate}
                onChange={(e) => setReceptionDate(e.target.value)}
              />
            </div>
            <div>
              <Label className="text-xs">Agent Yard</Label>
              <Input
                className="h-8 text-xs"
                value={yardOfficer}
                onChange={(e) => setYardOfficer(e.target.value)}
                placeholder="Nom de l'agent"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Vérification</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between rounded-md border p-2">
            <Label className="text-xs cursor-pointer">Vérification terminée</Label>
            <Switch checked={verificationCompleted} onCheckedChange={setVerificationCompleted} />
          </div>
          <div className="flex items-center justify-between rounded-md border p-2">
            <Label className="text-xs cursor-pointer">Conforme</Label>
            <Switch checked={isCompliant} onCheckedChange={setIsCompliant} />
          </div>
          <div>
            <Label className="text-xs">Notes de Vérification</Label>
            <Textarea
              className="text-xs"
              value={verificationNotes}
              onChange={(e) => setVerificationNotes(e.target.value)}
              placeholder="Observations..."
              rows={3}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Notification & Laissez-passer</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between rounded-md border p-2">
            <Label className="text-xs cursor-pointer">Notification envoyée</Label>
            <Switch checked={notificationSent} onCheckedChange={setNotificationSent} />
          </div>
          <div>
            <Label className="text-xs">Méthode de Notification</Label>
            <Input
              className="h-8 text-xs"
              value={notificationMethod}
              onChange={(e) => setNotificationMethod(e.target.value)}
              placeholder="Email, Téléphone, etc."
            />
          </div>
          <div className="flex items-center justify-between rounded-md border p-2">
            <Label className="text-xs cursor-pointer">Laissez-passer généré</Label>
            <Switch checked={exitPassGenerated} onCheckedChange={setExitPassGenerated} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Dispatch Final</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Emplacement</Label>
              <Input
                className="h-8 text-xs"
                value={dispatchLocation}
                onChange={(e) => setDispatchLocation(e.target.value)}
                placeholder="Ex: Magasin A"
              />
            </div>
            <div>
              <Label className="text-xs">Zone</Label>
              <Input
                className="h-8 text-xs"
                value={dispatchZone}
                onChange={(e) => setDispatchZone(e.target.value)}
                placeholder="Ex: Zone 3"
              />
            </div>
          </div>
          <div>
            <Label className="text-xs">Notes de Dispatch</Label>
            <Textarea
              className="text-xs"
              value={dispatchNotes}
              onChange={(e) => setDispatchNotes(e.target.value)}
              placeholder="Notes..."
              rows={3}
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex gap-2">
        <Button variant="outline" onClick={onCancel} className="flex-1">
          Annuler
        </Button>
        <Button onClick={handleSubmit} className="flex-1">
          Enregistrer
        </Button>
      </div>
    </div>
  )
}
