"use client"

import * as React from "react"
import {
  Ship,
  Clock,
  Package,
  CheckCircle2,
  XCircle,
  AlertCircle,
  FileText,
  Plus,
  Loader2,
  Search,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Separator } from "@/components/ui/separator"
import { travelwizAPI } from "@/api/travelwiz"
import {
  VesselArrivalStatusEnum,
  VesselTypeEnum,
  type VesselArrivalPublic,
} from "@/types/travelwiz"
import { useHeaderContext } from "@/components/header-context"
import { useToast } from "@/hooks/use-toast"

export function VesselArrivalsContent() {
  const { setContextualHeader, clearContextualHeader } = useHeaderContext()
  const { toast } = useToast()
  const [searchQuery, setSearchQuery] = React.useState("")
  const [arrivals, setArrivals] = React.useState<VesselArrivalPublic[]>([])
  const [loading, setLoading] = React.useState(true)
  const [selectedArrival, setSelectedArrival] = React.useState<VesselArrivalPublic | null>(null)
  const [inspecting, setInspecting] = React.useState(false)

  // Fetch vessel arrivals from API
  const fetchArrivals = React.useCallback(async () => {
    try {
      setLoading(true)
      const response = await travelwizAPI.getVesselArrivals({
        limit: 100,
        upcoming_days: 30,
      })
      setArrivals(response.data)
    } catch (error) {
      console.error("Error fetching arrivals:", error)
      toast({
        title: "Erreur",
        description: "Impossible de charger les arrivées de navires",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }, [toast])

  React.useEffect(() => {
    fetchArrivals()
  }, [fetchArrivals])

  React.useEffect(() => {
    setContextualHeader({
      searchPlaceholder: "Rechercher par navire, statut...",
      onSearchChange: setSearchQuery,
      contextualButtons: [
        {
          label: "Nouvelle Arrivée",
          icon: Plus,
          onClick: () => {
            // Create new arrival logic
          },
          variant: "default",
        },
      ],
    })

    return () => clearContextualHeader()
  }, [setContextualHeader, clearContextualHeader])

  const filteredArrivals = arrivals.filter((arrival) => {
    const matchesSearch =
      arrival.vessel.toLowerCase().includes(searchQuery.toLowerCase()) ||
      arrival.status.toLowerCase().includes(searchQuery.toLowerCase())
    return matchesSearch
  })

  const stats = {
    total: arrivals.length,
    expected: arrivals.filter(
      (a) => a.status === VesselArrivalStatusEnum.ATTENDU || a.status === VesselArrivalStatusEnum.EN_APPROCHE
    ).length,
    arrived: arrivals.filter(
      (a) =>
        a.status === VesselArrivalStatusEnum.AMARRE ||
        a.status === VesselArrivalStatusEnum.EN_COURS_INSPECTION ||
        a.status === VesselArrivalStatusEnum.INSPECTE
    ).length,
    completed: arrivals.filter(
      (a) => a.status === VesselArrivalStatusEnum.DECHARGE || a.status === VesselArrivalStatusEnum.DISPATCHE
    ).length,
  }

  const handleInspect = async (arrival: VesselArrivalPublic) => {
    setSelectedArrival(arrival)
    setInspecting(true)
  }

  const handleSaveInspection = async (inspection: any) => {
    if (!selectedArrival) return

    try {
      await travelwizAPI.updateVesselArrival(selectedArrival.id, inspection)
      toast({
        title: "Succès",
        description: "Inspection enregistrée",
      })
      fetchArrivals()
      setInspecting(false)
      setSelectedArrival(null)
    } catch (error) {
      toast({
        title: "Erreur",
        description: "Impossible d'enregistrer l'inspection",
        variant: "destructive",
      })
    }
  }

  if (inspecting && selectedArrival) {
    return (
      <VesselInspectionPanel
        arrival={selectedArrival}
        onSave={handleSaveInspection}
        onCancel={() => {
          setInspecting(false)
          setSelectedArrival(null)
        }}
      />
    )
  }

  return (
    <div className="flex flex-col gap-3 p-3">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <Card className="p-2">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-blue-500/10">
              <Ship className="h-3.5 w-3.5 text-blue-500" />
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
              <Clock className="h-3.5 w-3.5 text-yellow-500" />
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground">Attendus</p>
              <p className="text-lg font-bold leading-none">{loading ? "..." : stats.expected}</p>
            </div>
          </div>
        </Card>

        <Card className="p-2">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-orange-500/10">
              <AlertCircle className="h-3.5 w-3.5 text-orange-500" />
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground">Arrivés</p>
              <p className="text-lg font-bold leading-none">{loading ? "..." : stats.arrived}</p>
            </div>
          </div>
        </Card>

        <Card className="p-2">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-green-500/10">
              <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground">Complétés</p>
              <p className="text-lg font-bold leading-none">{loading ? "..." : stats.completed}</p>
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
      {!loading && filteredArrivals.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12">
          <Ship className="h-12 w-12 text-muted-foreground mb-4" />
          <p className="text-sm text-muted-foreground">Aucune arrivée de navire trouvée</p>
        </div>
      )}

      {/* Arrivals Grid */}
      {!loading && (
        <div className="grid grid-cols-1 gap-2 lg:grid-cols-2 xl:grid-cols-3">
          {filteredArrivals.map((arrival) => (
            <Card key={arrival.id} className="p-2 hover:shadow-md transition-shadow">
              <div className="flex flex-col gap-2">
                {/* Header */}
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-md bg-blue-500/10">
                      <Ship className="h-4 w-4 text-blue-500" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold leading-none">{arrival.vessel}</p>
                      <p className="text-[10px] text-muted-foreground">
                        ETA: {new Date(arrival.eta).toLocaleString("fr-FR")}
                      </p>
                    </div>
                  </div>
                  <Badge
                    variant={
                      arrival.status === VesselArrivalStatusEnum.DECHARGE ||
                      arrival.status === VesselArrivalStatusEnum.DISPATCHE
                        ? "default"
                        : arrival.status === VesselArrivalStatusEnum.AMARRE
                        ? "secondary"
                        : "outline"
                    }
                    className="h-5 text-[9px]"
                  >
                    {arrival.status}
                  </Badge>
                </div>

                {/* Counters */}
                <div className="grid grid-cols-3 gap-1.5 text-[10px]">
                  <div>
                    <p className="text-muted-foreground">Manifestes</p>
                    <p className="font-medium">
                      {arrival.received_manifests}/{arrival.expected_manifests}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Colis</p>
                    <p className="font-medium">
                      {arrival.received_packages}/{arrival.expected_packages}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Poids (kg)</p>
                    <p className="font-medium">
                      {arrival.received_weight.toFixed(0)}/{arrival.expected_weight.toFixed(0)}
                    </p>
                  </div>
                </div>

                {/* Inspection Checklist */}
                <div className="flex items-center gap-1 text-[9px]">
                  <CheckCircle2
                    className={`h-3 w-3 ${arrival.physical_check_completed ? "text-green-500" : "text-gray-300"}`}
                  />
                  <span className={arrival.physical_check_completed ? "text-green-600" : "text-muted-foreground"}>
                    Contrôle
                  </span>
                  <CheckCircle2
                    className={`h-3 w-3 ${arrival.slips_recovered ? "text-green-500" : "text-gray-300"}`}
                  />
                  <span className={arrival.slips_recovered ? "text-green-600" : "text-muted-foreground"}>
                    Bordereaux
                  </span>
                  <CheckCircle2
                    className={`h-3 w-3 ${arrival.unloading_completed ? "text-green-500" : "text-gray-300"}`}
                  />
                  <span className={arrival.unloading_completed ? "text-green-600" : "text-muted-foreground"}>
                    Déchargement
                  </span>
                </div>

                {/* Actions */}
                <div className="flex gap-1">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 flex-1 text-[10px] bg-transparent"
                    onClick={() => handleInspect(arrival)}
                  >
                    <Search className="h-3 w-3 mr-1" />
                    Inspecter
                  </Button>
                  {arrival.report_generated && (
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

// Vessel Inspection Panel Component
interface VesselInspectionPanelProps {
  arrival: VesselArrivalPublic
  onSave: (inspection: any) => void
  onCancel: () => void
}

function VesselInspectionPanel({ arrival, onSave, onCancel }: VesselInspectionPanelProps) {
  const [ata, setAta] = React.useState(arrival.ata || "")
  const [receivedManifests, setReceivedManifests] = React.useState(arrival.received_manifests)
  const [receivedPackages, setReceivedPackages] = React.useState(arrival.received_packages)
  const [receivedWeight, setReceivedWeight] = React.useState(arrival.received_weight)
  const [physicalCheckCompleted, setPhysicalCheckCompleted] = React.useState(arrival.physical_check_completed)
  const [slipsRecovered, setSlipsRecovered] = React.useState(arrival.slips_recovered)
  const [weightsVerified, setWeightsVerified] = React.useState(arrival.weights_verified)
  const [riggingsVerified, setRiggingsVerified] = React.useState(arrival.riggings_verified)
  const [manifestCompared, setManifestCompared] = React.useState(arrival.manifest_compared)
  const [inspectorName, setInspectorName] = React.useState(arrival.inspector_name || "")
  const [inspectionNotes, setInspectionNotes] = React.useState(arrival.inspection_notes || "")
  const [unloadingCompleted, setUnloadingCompleted] = React.useState(arrival.unloading_completed)
  const [unloadingNotes, setUnloadingNotes] = React.useState(arrival.unloading_notes || "")

  const handleSubmit = () => {
    const inspection = {
      ata: ata || undefined,
      received_manifests: receivedManifests,
      received_packages: receivedPackages,
      received_weight: receivedWeight,
      physical_check_completed: physicalCheckCompleted,
      slips_recovered: slipsRecovered,
      weights_verified: weightsVerified,
      riggings_verified: riggingsVerified,
      manifest_compared: manifestCompared,
      inspector_name: inspectorName || undefined,
      inspection_date: new Date().toISOString(),
      inspection_notes: inspectionNotes || undefined,
      unloading_completed: unloadingCompleted,
      unloading_notes: unloadingNotes || undefined,
      status: unloadingCompleted ? VesselArrivalStatusEnum.DECHARGE : VesselArrivalStatusEnum.INSPECTE,
    }

    onSave(inspection)
  }

  return (
    <div className="p-3 space-y-3 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Inspection: {arrival.vessel}</h2>
          <p className="text-xs text-muted-foreground">
            ETA: {new Date(arrival.eta).toLocaleString("fr-FR")}
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Annuler
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Arrivée Réelle</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label className="text-xs">Heure d'Arrivée Réelle (ATA)</Label>
            <Input
              type="datetime-local"
              className="h-8 text-xs"
              value={ata}
              onChange={(e) => setAta(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Quantités Reçues</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label className="text-xs">Manifestes Reçus</Label>
              <Input
                type="number"
                className="h-8 text-xs"
                value={receivedManifests}
                onChange={(e) => setReceivedManifests(parseInt(e.target.value) || 0)}
              />
              <p className="text-[10px] text-muted-foreground mt-1">Attendu: {arrival.expected_manifests}</p>
            </div>
            <div>
              <Label className="text-xs">Colis Reçus</Label>
              <Input
                type="number"
                className="h-8 text-xs"
                value={receivedPackages}
                onChange={(e) => setReceivedPackages(parseInt(e.target.value) || 0)}
              />
              <p className="text-[10px] text-muted-foreground mt-1">Attendu: {arrival.expected_packages}</p>
            </div>
            <div>
              <Label className="text-xs">Poids Reçu (kg)</Label>
              <Input
                type="number"
                className="h-8 text-xs"
                value={receivedWeight}
                onChange={(e) => setReceivedWeight(parseFloat(e.target.value) || 0)}
                step="0.1"
              />
              <p className="text-[10px] text-muted-foreground mt-1">
                Attendu: {arrival.expected_weight.toFixed(0)} kg
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Contrôles d'Inspection</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex items-center justify-between rounded-md border p-2">
            <Label className="text-xs cursor-pointer">Contrôle physique effectué</Label>
            <Switch checked={physicalCheckCompleted} onCheckedChange={setPhysicalCheckCompleted} />
          </div>
          <div className="flex items-center justify-between rounded-md border p-2">
            <Label className="text-xs cursor-pointer">Bordereaux récupérés</Label>
            <Switch checked={slipsRecovered} onCheckedChange={setSlipsRecovered} />
          </div>
          <div className="flex items-center justify-between rounded-md border p-2">
            <Label className="text-xs cursor-pointer">Poids vérifiés</Label>
            <Switch checked={weightsVerified} onCheckedChange={setWeightsVerified} />
          </div>
          <div className="flex items-center justify-between rounded-md border p-2">
            <Label className="text-xs cursor-pointer">Élingages vérifiés</Label>
            <Switch checked={riggingsVerified} onCheckedChange={setRiggingsVerified} />
          </div>
          <div className="flex items-center justify-between rounded-md border p-2">
            <Label className="text-xs cursor-pointer">Manifestes comparés</Label>
            <Switch checked={manifestCompared} onCheckedChange={setManifestCompared} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Informations d'Inspection</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label className="text-xs">Nom de l'Inspecteur</Label>
            <Input
              className="h-8 text-xs"
              value={inspectorName}
              onChange={(e) => setInspectorName(e.target.value)}
              placeholder="Nom de l'inspecteur"
            />
          </div>
          <div>
            <Label className="text-xs">Notes d'Inspection</Label>
            <Textarea
              className="text-xs"
              value={inspectionNotes}
              onChange={(e) => setInspectionNotes(e.target.value)}
              placeholder="Observations lors de l'inspection..."
              rows={3}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Déchargement</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between rounded-md border p-2">
            <Label className="text-xs cursor-pointer">Déchargement terminé</Label>
            <Switch checked={unloadingCompleted} onCheckedChange={setUnloadingCompleted} />
          </div>
          <div>
            <Label className="text-xs">Notes de Déchargement</Label>
            <Textarea
              className="text-xs"
              value={unloadingNotes}
              onChange={(e) => setUnloadingNotes(e.target.value)}
              placeholder="Observations lors du déchargement..."
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
          Enregistrer l'Inspection
        </Button>
      </div>
    </div>
  )
}
