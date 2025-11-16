"use client"

import * as React from "react"
import {
  Ship,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Camera,
  FileText,
  Send,
  Clock,
  Package,
  Scale,
  Image as ImageIcon,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import type {
  VesselArrival,
  UnloadingDiscrepancy,
  DiscrepancyType,
  VesselType,
} from "@/lib/travelwiz-back-cargo-types"

interface ArrivalControlInterfaceProps {
  vesselArrival: VesselArrival
  onSave?: (arrival: Partial<VesselArrival>) => void
  onGenerateReport?: () => void
}

const discrepancyTypes: DiscrepancyType[] = [
  "Colis manquant",
  "Colis endommagé",
  "Colis non manifesté",
  "Écart de poids",
  "Marquage incorrect",
  "Document manquant",
  "Élingage défectueux",
]

const severityLevels = ["Basse", "Moyenne", "Haute", "Critique"] as const

export function ArrivalControlInterface({
  vesselArrival,
  onSave,
  onGenerateReport,
}: ArrivalControlInterfaceProps) {
  const [inspector, setInspector] = React.useState(vesselArrival.inspector || "")
  const [inspectionStartTime, setInspectionStartTime] = React.useState(vesselArrival.inspectionStartTime || "")

  // Checklist state
  const [checksPerformed, setChecksPerformed] = React.useState(
    vesselArrival.checksPerformed || {
      bordereaux: false,
      physicalCountDone: false,
      weightVerified: false,
      slingingChecked: false,
      manifestCompared: false,
    }
  )

  // Discrepancies
  const [discrepancies, setDiscrepancies] = React.useState<UnloadingDiscrepancy[]>(
    vesselArrival.discrepancies || []
  )
  const [showAddDiscrepancy, setShowAddDiscrepancy] = React.useState(false)
  const [newDiscrepancy, setNewDiscrepancy] = React.useState<Partial<UnloadingDiscrepancy>>({
    type: "Colis manquant",
    description: "",
    severity: "Moyenne",
  })

  // Summary counts
  const [totalPackages, setTotalPackages] = React.useState(vesselArrival.totalPackages || 0)
  const [totalWeight, setTotalWeight] = React.useState(vesselArrival.totalWeight || 0)

  // Notes
  const [notes, setNotes] = React.useState(vesselArrival.notes || "")

  // Computed values
  const checksCompleted = Object.values(checksPerformed).filter(Boolean).length
  const totalChecks = Object.values(checksPerformed).length
  const checklistProgress = (checksCompleted / totalChecks) * 100

  const discrepanciesSummary = React.useMemo(() => {
    return {
      total: discrepancies.length,
      critical: discrepancies.filter((d) => d.severity === "Critique" || d.severity === "Haute").length,
      missingPackages: discrepancies.filter((d) => d.type === "Colis manquant").length,
      damagedPackages: discrepancies.filter((d) => d.type === "Colis endommagé").length,
      unmanifested: discrepancies.filter((d) => d.type === "Colis non manifesté").length,
      weightDiscrepancies: discrepancies.filter((d) => d.type === "Écart de poids").length,
    }
  }, [discrepancies])

  const allChecksDone = checksCompleted === totalChecks

  const handleCheckChange = (key: keyof typeof checksPerformed, checked: boolean) => {
    setChecksPerformed((prev) => ({
      ...prev,
      [key]: checked,
    }))
  }

  const addDiscrepancy = () => {
    if (!newDiscrepancy.description) {
      alert("Veuillez saisir une description de l'anomalie")
      return
    }

    const discrepancy: UnloadingDiscrepancy = {
      id: Date.now().toString(),
      type: newDiscrepancy.type as DiscrepancyType,
      description: newDiscrepancy.description,
      severity: newDiscrepancy.severity as any,
      detectedBy: inspector,
      detectedAt: new Date().toISOString(),
      manifestId: newDiscrepancy.manifestId,
      packageNumber: newDiscrepancy.packageNumber,
      expectedValue: newDiscrepancy.expectedValue,
      actualValue: newDiscrepancy.actualValue,
      photos: [],
      resolved: false,
    }

    setDiscrepancies([...discrepancies, discrepancy])
    setShowAddDiscrepancy(false)
    setNewDiscrepancy({
      type: "Colis manquant",
      description: "",
      severity: "Moyenne",
    })
  }

  const removeDiscrepancy = (id: string) => {
    setDiscrepancies(discrepancies.filter((d) => d.id !== id))
  }

  const handleSave = () => {
    const updatedArrival: Partial<VesselArrival> = {
      inspector,
      inspectionStartTime,
      inspectionEndTime: new Date().toISOString().split("T")[1].substring(0, 5),
      checksPerformed,
      totalPackages,
      totalWeight,
      discrepancies,
      notes,
      status: allChecksDone ? "Inspecté" : "En cours inspection",
    }

    onSave?.(updatedArrival)
  }

  const handleGenerateReport = () => {
    if (!allChecksDone) {
      alert("Veuillez compléter toutes les vérifications avant de générer le rapport")
      return
    }

    onGenerateReport?.()
  }

  return (
    <div className="space-y-4 p-4">
      {/* Header Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-full bg-blue-500/10 flex items-center justify-center">
                <Ship className="h-6 w-6 text-blue-500" />
              </div>
              <div>
                <CardTitle className="text-lg">{vesselArrival.vessel}</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Arrivée: {new Date(vesselArrival.arrivalDate).toLocaleDateString("fr-FR")} à{" "}
                  {vesselArrival.arrivalTime}
                </p>
              </div>
            </div>
            <Badge
              variant={
                vesselArrival.status === "Inspecté"
                  ? "default"
                  : vesselArrival.status === "En cours inspection"
                    ? "secondary"
                    : "outline"
              }
            >
              {vesselArrival.status}
            </Badge>
          </div>
        </CardHeader>
      </Card>

      {/* Inspector Info */}
      <Card>
        <CardContent className="pt-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="inspector" className="text-xs">
                Agent inspecteur *
              </Label>
              <Input
                id="inspector"
                value={inspector}
                onChange={(e) => setInspector(e.target.value)}
                placeholder="Nom de l'agent (Freight & Handling ou Yard)"
                className="h-8 text-sm"
              />
            </div>
            <div>
              <Label htmlFor="startTime" className="text-xs">
                Heure début inspection
              </Label>
              <Input
                id="startTime"
                type="time"
                value={inspectionStartTime}
                onChange={(e) => setInspectionStartTime(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="checklist" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="checklist" className="text-xs">
            <CheckCircle2 className="h-3 w-3 mr-1" />
            Contrôles
          </TabsTrigger>
          <TabsTrigger value="discrepancies" className="text-xs">
            <AlertTriangle className="h-3 w-3 mr-1" />
            Anomalies ({discrepancies.length})
          </TabsTrigger>
          <TabsTrigger value="summary" className="text-xs">
            <Package className="h-3 w-3 mr-1" />
            Résumé
          </TabsTrigger>
          <TabsTrigger value="report" className="text-xs">
            <FileText className="h-3 w-3 mr-1" />
            Rapport
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: Checklist */}
        <TabsContent value="checklist" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">Checklist de Contrôle</CardTitle>
                <div className="text-xs text-muted-foreground">
                  {checksCompleted}/{totalChecks} complété
                </div>
              </div>
              <div className="mt-2 h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary transition-all"
                  style={{ width: `${checklistProgress}%` }}
                />
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-start space-x-3 p-3 rounded-md hover:bg-muted/50 transition-colors">
                <Checkbox
                  id="bordereaux"
                  checked={checksPerformed.bordereaux}
                  onCheckedChange={(checked) => handleCheckChange("bordereaux", !!checked)}
                  className="mt-0.5"
                />
                <div className="flex-1">
                  <Label htmlFor="bordereaux" className="text-sm font-medium cursor-pointer">
                    Bordereaux récupérés
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Récupérer tous les bordereaux papier auprès du capitaine
                  </p>
                </div>
              </div>

              <Separator />

              <div className="flex items-start space-x-3 p-3 rounded-md hover:bg-muted/50 transition-colors">
                <Checkbox
                  id="physical"
                  checked={checksPerformed.physicalCountDone}
                  onCheckedChange={(checked) => handleCheckChange("physicalCountDone", !!checked)}
                  className="mt-0.5"
                />
                <div className="flex-1">
                  <Label htmlFor="physical" className="text-sm font-medium cursor-pointer">
                    Contrôle physique sur pont
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Vérifier physiquement tous les colis sur le pont du navire
                  </p>
                </div>
              </div>

              <Separator />

              <div className="flex items-start space-x-3 p-3 rounded-md hover:bg-muted/50 transition-colors">
                <Checkbox
                  id="weight"
                  checked={checksPerformed.weightVerified}
                  onCheckedChange={(checked) => handleCheckChange("weightVerified", !!checked)}
                  className="mt-0.5"
                />
                <div className="flex-1">
                  <Label htmlFor="weight" className="text-sm font-medium cursor-pointer">
                    Poids vérifiés
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Vérifier la conformité des poids déclarés
                  </p>
                </div>
              </div>

              <Separator />

              <div className="flex items-start space-x-3 p-3 rounded-md hover:bg-muted/50 transition-colors">
                <Checkbox
                  id="slinging"
                  checked={checksPerformed.slingingChecked}
                  onCheckedChange={(checked) => handleCheckChange("slingingChecked", !!checked)}
                  className="mt-0.5"
                />
                <div className="flex-1">
                  <Label htmlFor="slinging" className="text-sm font-medium cursor-pointer">
                    Élingages vérifiés
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Contrôler la conformité et la sécurité des élingages
                  </p>
                </div>
              </div>

              <Separator />

              <div className="flex items-start space-x-3 p-3 rounded-md hover:bg-muted/50 transition-colors">
                <Checkbox
                  id="manifest"
                  checked={checksPerformed.manifestCompared}
                  onCheckedChange={(checked) => handleCheckChange("manifestCompared", !!checked)}
                  className="mt-0.5"
                />
                <div className="flex-1">
                  <Label htmlFor="manifest" className="text-sm font-medium cursor-pointer">
                    Comparaison manifeste électronique
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Comparer le manifeste électronique avec la réalité physique
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Summary Inputs */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Résumé du Déchargement</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="packages" className="text-xs flex items-center gap-1">
                    <Package className="h-3 w-3" />
                    Nombre de colis reçus
                  </Label>
                  <Input
                    id="packages"
                    type="number"
                    min="0"
                    value={totalPackages}
                    onChange={(e) => setTotalPackages(parseInt(e.target.value) || 0)}
                    className="h-8 text-sm"
                  />
                </div>
                <div>
                  <Label htmlFor="weight" className="text-xs flex items-center gap-1">
                    <Scale className="h-3 w-3" />
                    Poids total (kg)
                  </Label>
                  <Input
                    id="weight"
                    type="number"
                    min="0"
                    step="0.1"
                    value={totalWeight}
                    onChange={(e) => setTotalWeight(parseFloat(e.target.value) || 0)}
                    className="h-8 text-sm"
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="notes" className="text-xs">
                  Notes / Observations
                </Label>
                <Textarea
                  id="notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Observations générales sur le déchargement"
                  className="text-sm h-20 resize-none"
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 2: Discrepancies */}
        <TabsContent value="discrepancies" className="space-y-4">
          {/* Add Discrepancy Button */}
          {!showAddDiscrepancy && (
            <Button variant="outline" onClick={() => setShowAddDiscrepancy(true)} className="w-full">
              <AlertTriangle className="h-4 w-4 mr-2" />
              Signaler une Anomalie
            </Button>
          )}

          {/* Add Discrepancy Form */}
          {showAddDiscrepancy && (
            <Card className="border-orange-200 bg-orange-50/50">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-orange-600" />
                  Nouvelle Anomalie
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <Label htmlFor="discType" className="text-xs">
                    Type d'anomalie *
                  </Label>
                  <Select
                    value={newDiscrepancy.type}
                    onValueChange={(value) => setNewDiscrepancy({ ...newDiscrepancy, type: value as DiscrepancyType })}
                  >
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {discrepancyTypes.map((type) => (
                        <SelectItem key={type} value={type} className="text-sm">
                          {type}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label htmlFor="manifest" className="text-xs">
                      N° Manifeste concerné
                    </Label>
                    <Input
                      id="manifest"
                      value={newDiscrepancy.manifestId}
                      onChange={(e) => setNewDiscrepancy({ ...newDiscrepancy, manifestId: e.target.value })}
                      placeholder="Ex: MAN-2025-0001"
                      className="h-7 text-xs"
                    />
                  </div>
                  <div>
                    <Label htmlFor="package" className="text-xs">
                      N° Colis concerné
                    </Label>
                    <Input
                      id="package"
                      value={newDiscrepancy.packageNumber}
                      onChange={(e) => setNewDiscrepancy({ ...newDiscrepancy, packageNumber: e.target.value })}
                      placeholder="Ex: 001"
                      className="h-7 text-xs"
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="description" className="text-xs">
                    Description détaillée *
                  </Label>
                  <Textarea
                    id="description"
                    value={newDiscrepancy.description}
                    onChange={(e) => setNewDiscrepancy({ ...newDiscrepancy, description: e.target.value })}
                    placeholder="Décrire précisément l'anomalie constatée"
                    className="text-xs h-16 resize-none"
                  />
                </div>

                <div>
                  <Label htmlFor="severity" className="text-xs">
                    Gravité
                  </Label>
                  <Select
                    value={newDiscrepancy.severity}
                    onValueChange={(value) => setNewDiscrepancy({ ...newDiscrepancy, severity: value as any })}
                  >
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {severityLevels.map((level) => (
                        <SelectItem key={level} value={level} className="text-sm">
                          {level}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex gap-2 pt-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setShowAddDiscrepancy(false)}
                    className="flex-1 h-8"
                  >
                    Annuler
                  </Button>
                  <Button size="sm" onClick={addDiscrepancy} className="flex-1 h-8">
                    Ajouter
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Discrepancies List */}
          {discrepancies.length > 0 ? (
            <div className="space-y-2">
              {discrepancies.map((disc) => (
                <Card
                  key={disc.id}
                  className={
                    disc.severity === "Critique"
                      ? "border-red-200 bg-red-50/50"
                      : disc.severity === "Haute"
                        ? "border-orange-200 bg-orange-50/50"
                        : ""
                  }
                >
                  <CardContent className="p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 space-y-1">
                        <div className="flex items-center gap-2">
                          <Badge
                            variant={disc.severity === "Critique" ? "destructive" : "secondary"}
                            className="text-[10px]"
                          >
                            {disc.type}
                          </Badge>
                          <Badge variant="outline" className="text-[10px]">
                            {disc.severity}
                          </Badge>
                          {disc.manifestId && (
                            <span className="text-[10px] text-muted-foreground">
                              Manifeste: {disc.manifestId}
                            </span>
                          )}
                          {disc.packageNumber && (
                            <span className="text-[10px] text-muted-foreground">
                              Colis: {disc.packageNumber}
                            </span>
                          )}
                        </div>
                        <p className="text-xs">{disc.description}</p>
                        <p className="text-[10px] text-muted-foreground">
                          Détecté par {disc.detectedBy} le{" "}
                          {new Date(disc.detectedAt).toLocaleString("fr-FR")}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => removeDiscrepancy(disc.id)}
                        className="h-6 w-6 p-0"
                      >
                        <XCircle className="h-3 w-3 text-red-500" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Alert>
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <AlertDescription className="text-sm text-green-900">
                Aucune anomalie détectée - Déchargement conforme
              </AlertDescription>
            </Alert>
          )}
        </TabsContent>

        {/* Tab 3: Summary */}
        <TabsContent value="summary" className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-2">
                  <div className="h-10 w-10 rounded-md bg-blue-500/10 flex items-center justify-center">
                    <Ship className="h-5 w-5 text-blue-500" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Manifestes attendus</p>
                    <p className="text-xl font-bold">{vesselArrival.expectedManifests.length}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-2">
                  <div className="h-10 w-10 rounded-md bg-green-500/10 flex items-center justify-center">
                    <CheckCircle2 className="h-5 w-5 text-green-500" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Manifestes reçus</p>
                    <p className="text-xl font-bold">{vesselArrival.receivedManifests.length}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-2">
                  <div className="h-10 w-10 rounded-md bg-purple-500/10 flex items-center justify-center">
                    <Package className="h-5 w-5 text-purple-500" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Colis reçus</p>
                    <p className="text-xl font-bold">{totalPackages}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-2">
                  <div className="h-10 w-10 rounded-md bg-orange-500/10 flex items-center justify-center">
                    <Scale className="h-5 w-5 text-orange-500" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Poids total</p>
                    <p className="text-xl font-bold">{totalWeight} kg</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Anomalies Summary */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                Résumé des Anomalies
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Total anomalies:</span>
                <span className="font-semibold">{discrepanciesSummary.total}</span>
              </div>
              <Separator />
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Anomalies critiques:</span>
                <Badge variant={discrepanciesSummary.critical > 0 ? "destructive" : "secondary"} className="text-xs">
                  {discrepanciesSummary.critical}
                </Badge>
              </div>
              <Separator />
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Colis manquants:</span>
                <span className="font-semibold">{discrepanciesSummary.missingPackages}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Colis endommagés:</span>
                <span className="font-semibold">{discrepanciesSummary.damagedPackages}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Colis non manifestés:</span>
                <span className="font-semibold">{discrepanciesSummary.unmanifested}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Écarts de poids:</span>
                <span className="font-semibold">{discrepanciesSummary.weightDiscrepancies}</span>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 4: Report */}
        <TabsContent value="report" className="space-y-4">
          <Alert>
            <FileText className="h-4 w-4" />
            <AlertDescription className="text-sm">
              Le rapport de déchargement sera généré automatiquement et diffusé aux destinataires (Hiérarchie, Yard,
              Sites, Destinataires).
            </AlertDescription>
          </Alert>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Destinataires du Rapport</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex items-center gap-2 text-sm">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                <span>Hiérarchie</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                <span>Yard</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                <span>Sites concernés</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                <span>Destinataires</span>
              </div>
            </CardContent>
          </Card>

          <Button
            className="w-full"
            onClick={handleGenerateReport}
            disabled={!allChecksDone}
          >
            <FileText className="h-4 w-4 mr-2" />
            Générer et Envoyer le Rapport
          </Button>

          {!allChecksDone && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription className="text-xs">
                Veuillez compléter toutes les vérifications de la checklist avant de générer le rapport.
              </AlertDescription>
            </Alert>
          )}
        </TabsContent>
      </Tabs>

      {/* Actions */}
      <div className="flex gap-2 pt-4 border-t sticky bottom-0 bg-background pb-4">
        <Button variant="outline" className="flex-1" onClick={handleSave} disabled={!inspector}>
          <CheckCircle2 className="h-4 w-4 mr-2" />
          Enregistrer la Progression
        </Button>
        <Button
          className="flex-1"
          onClick={handleGenerateReport}
          disabled={!allChecksDone}
        >
          <Send className="h-4 w-4 mr-2" />
          Terminer l'Inspection
        </Button>
      </div>
    </div>
  )
}
