"use client"

import * as React from "react"
import {
  Package,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  FileText,
  Send,
  MapPin,
  User,
  Camera,
  Printer,
  Truck,
  Clock,
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
  YardDispatch,
  BackCargoManifest,
  ExitPass,
  YardDispatchStatus,
} from "@/lib/travelwiz-back-cargo-types"

interface YardDispatchInterfaceProps {
  backCargo: BackCargoManifest
  onSave?: (dispatch: Partial<YardDispatch>) => void
  onGenerateExitPass?: (backCargoId: string) => void
  onNotifyRecipient?: (recipient: string) => void
}

export function YardDispatchInterface({
  backCargo,
  onSave,
  onGenerateExitPass,
  onNotifyRecipient,
}: YardDispatchInterfaceProps) {
  const [dispatchNumber] = React.useState(`YD-${new Date().getFullYear()}-${Math.floor(Math.random() * 10000).toString().padStart(4, "0")}`)
  const [status, setStatus] = React.useState<YardDispatchStatus>("En attente réception")

  // Reception
  const [receptionDate, setReceptionDate] = React.useState(new Date().toISOString().split("T")[0])
  const [receptionTime, setReceptionTime] = React.useState(new Date().toTimeString().split(" ")[0].substring(0, 5))
  const [receivedBy, setReceivedBy] = React.useState("")

  // Verification
  const [verificationDone, setVerificationDone] = React.useState(false)
  const [discrepanciesFound, setDiscrepanciesFound] = React.useState(false)
  const [discrepanciesList, setDiscrepanciesList] = React.useState<string[]>([])
  const [newDiscrepancy, setNewDiscrepancy] = React.useState("")

  // Recipient
  const [recipient, setRecipient] = React.useState("")
  const [recipientService, setRecipientService] = React.useState("")
  const [recipientContact, setRecipientContact] = React.useState("")
  const [notificationSent, setNotificationSent] = React.useState(false)
  const [notificationMethod, setNotificationMethod] = React.useState<"Email" | "SMS" | "Email+SMS">("Email+SMS")

  // Withdrawal
  const [withdrawalDate, setWithdrawalDate] = React.useState("")
  const [withdrawalTime, setWithdrawalTime] = React.useState("")

  // Exit Pass (for subcontractors)
  const [exitPassRequired, setExitPassRequired] = React.useState(backCargo.type === "Matériel sous-traitant")
  const [exitPassGenerated, setExitPassGenerated] = React.useState(false)
  const [exitPassNumber, setExitPassNumber] = React.useState("")

  // Dispatch
  const [yardLocation, setYardLocation] = React.useState("")
  const [dispatchedAt, setDispatchedAt] = React.useState("")
  const [dispatchedBy, setDispatchedBy] = React.useState("")
  const [notes, setNotes] = React.useState("")

  // Auto-determine final destination based on type
  const finalDestination = React.useMemo(() => {
    switch (backCargo.type) {
      case "Déchets DIS":
        return "Zone déchets DIS"
      case "Déchets DIB":
        return "Zone déchets DIB"
      case "Déchets DMET":
        return "Zone déchets DMET"
      case "Matériel sous-traitant":
        return "Sous-traitant"
      case "Réintégration stock":
        return "Magasin"
      case "À rebuter":
      case "À ferrailler":
        return backCargo.hasScrapMention ? "Zone ferraille" : "Autre"
      case "Stockage Yard":
        return "Stockage Yard"
      default:
        return "Autre"
    }
  }, [backCargo.type, backCargo.hasScrapMention])

  const requiresSignature = ["Matériel sous-traitant", "Réintégration stock", "Stockage Yard"].includes(backCargo.type)
  const requiresApproval = backCargo.type === "À rebuter" || backCargo.type === "À ferrailler"
  const needsApprovalDueToMissingMention = (backCargo.type === "À rebuter" || backCargo.type === "À ferrailler") && !backCargo.hasScrapMention

  const addDiscrepancy = () => {
    if (newDiscrepancy.trim()) {
      setDiscrepanciesList([...discrepanciesList, newDiscrepancy])
      setNewDiscrepancy("")
      setDiscrepanciesFound(true)
    }
  }

  const removeDiscrepancy = (index: number) => {
    const updated = discrepanciesList.filter((_, i) => i !== index)
    setDiscrepanciesList(updated)
    setDiscrepanciesFound(updated.length > 0)
  }

  const handleNotifyRecipient = () => {
    if (!recipient || !recipientService) {
      alert("Veuillez renseigner le destinataire et le service")
      return
    }

    onNotifyRecipient?.(recipient)
    setNotificationSent(true)
    setStatus("Notifié")
  }

  const handleGenerateExitPass = () => {
    if (!exitPassRequired) return

    onGenerateExitPass?.(backCargo.id)
    setExitPassGenerated(true)
    setExitPassNumber(`LP-${new Date().getFullYear()}-${Math.floor(Math.random() * 10000).toString().padStart(4, "0")}`)
  }

  const handleDispatch = () => {
    if (!verificationDone) {
      alert("Veuillez d'abord compléter la vérification")
      return
    }

    if (needsApprovalDueToMissingMention && !backCargo.hasScrapMention) {
      alert('En attente de validation pour mention "à ferrailler" manquante')
      return
    }

    if (exitPassRequired && !exitPassGenerated) {
      alert("Veuillez générer le laissez-passer avant le dispatch")
      return
    }

    setDispatchedAt(new Date().toISOString())
    setDispatchedBy(receivedBy)
    setStatus("Dispatché")

    const dispatch: Partial<YardDispatch> = {
      dispatchNumber,
      backCargoId: backCargo.id,
      receptionDate,
      receptionTime,
      receivedBy,
      receptionLocation: "Zone Back Cargo",
      verificationDone,
      discrepanciesFound,
      discrepanciesList: discrepanciesFound ? discrepanciesList : undefined,
      recipient,
      recipientService,
      recipientContact: recipientContact || undefined,
      notifiedAt: notificationSent ? new Date().toISOString() : undefined,
      notificationMethod: notificationSent ? notificationMethod : undefined,
      withdrawalDate: withdrawalDate || undefined,
      withdrawalTime: withdrawalTime || undefined,
      exitPassNumber: exitPassGenerated ? exitPassNumber : undefined,
      finalDestination: finalDestination as any,
      dispatchedAt,
      dispatchedBy,
      yardLocation: yardLocation || undefined,
      status,
      notes: notes || undefined,
    }

    onSave?.(dispatch)
  }

  const getStatusColor = (status: YardDispatchStatus) => {
    switch (status) {
      case "Livré":
      case "Retiré":
      case "Dispatché":
        return "bg-green-500/10 text-green-700"
      case "Notifié":
      case "Vérifié":
        return "bg-blue-500/10 text-blue-700"
      case "En attente réception":
      case "En attente retrait":
        return "bg-yellow-500/10 text-yellow-700"
      case "En anomalie":
        return "bg-red-500/10 text-red-700"
      default:
        return "bg-gray-500/10 text-gray-700"
    }
  }

  return (
    <div className="space-y-4 p-4">
      {/* Header Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-full bg-purple-500/10 flex items-center justify-center">
                <Package className="h-6 w-6 text-purple-500" />
              </div>
              <div>
                <CardTitle className="text-lg">Dispatch Yard: {dispatchNumber}</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Retour N° {backCargo.backCargoNumber} - {backCargo.type}
                </p>
              </div>
            </div>
            <Badge className={getStatusColor(status)}>{status}</Badge>
          </div>
        </CardHeader>
      </Card>

      {/* Destination automatique */}
      <Alert>
        <MapPin className="h-4 w-4" />
        <AlertDescription className="text-sm">
          <strong>Destination automatique:</strong> {finalDestination}
          {needsApprovalDueToMissingMention && (
            <span className="text-red-600 ml-2">
              ⚠️ En attente validation (mention manquante)
            </span>
          )}
        </AlertDescription>
      </Alert>

      <Tabs defaultValue="reception" className="w-full">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="reception" className="text-xs">
            <Package className="h-3 w-3 mr-1" />
            Réception
          </TabsTrigger>
          <TabsTrigger value="verification" className="text-xs">
            <CheckCircle2 className="h-3 w-3 mr-1" />
            Vérification
          </TabsTrigger>
          <TabsTrigger value="notification" className="text-xs">
            <Send className="h-3 w-3 mr-1" />
            Notification
          </TabsTrigger>
          <TabsTrigger value="exitpass" className="text-xs" disabled={!exitPassRequired}>
            <FileText className="h-3 w-3 mr-1" />
            Laissez-passer
          </TabsTrigger>
          <TabsTrigger value="dispatch" className="text-xs">
            <Truck className="h-3 w-3 mr-1" />
            Dispatch
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: Reception */}
        <TabsContent value="reception" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <Package className="h-4 w-4" />
                Réception Zone Back Cargo
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Alert className="bg-blue-50 border-blue-200">
                <AlertCircle className="h-4 w-4 text-blue-600" />
                <AlertDescription className="text-xs text-blue-900">
                  Tous les retours site sont réceptionnés dans la <strong>Zone Back Cargo</strong> du Yard
                </AlertDescription>
              </Alert>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="recDate" className="text-xs">
                    Date de réception *
                  </Label>
                  <Input
                    id="recDate"
                    type="date"
                    value={receptionDate}
                    onChange={(e) => setReceptionDate(e.target.value)}
                    className="h-8 text-sm"
                  />
                </div>
                <div>
                  <Label htmlFor="recTime" className="text-xs">
                    Heure de réception *
                  </Label>
                  <Input
                    id="recTime"
                    type="time"
                    value={receptionTime}
                    onChange={(e) => setReceptionTime(e.target.value)}
                    className="h-8 text-sm"
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="receivedBy" className="text-xs">
                  Réceptionné par (Yard Officer) *
                </Label>
                <Input
                  id="receivedBy"
                  value={receivedBy}
                  onChange={(e) => setReceivedBy(e.target.value)}
                  placeholder="Nom du Yard Officer"
                  className="h-8 text-sm"
                />
              </div>

              {/* Cargo Details Summary */}
              <Separator />

              <div className="bg-muted/50 rounded-md p-3 space-y-2">
                <p className="text-xs font-medium">Détails du retour:</p>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-muted-foreground">Provenance:</span>
                    <span className="ml-2 font-medium">{backCargo.originSite}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Navire:</span>
                    <span className="ml-2 font-medium">{backCargo.vessel}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Colis:</span>
                    <span className="ml-2 font-medium">{backCargo.totalPackages}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Poids total:</span>
                    <span className="ml-2 font-medium">{backCargo.totalWeight} kg</span>
                  </div>
                </div>
              </div>

              <Button
                className="w-full"
                onClick={() => setStatus("Réceptionné")}
                disabled={!receivedBy || status !== "En attente réception"}
              >
                <CheckCircle2 className="h-4 w-4 mr-2" />
                Confirmer Réception
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 2: Verification */}
        <TabsContent value="verification" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4" />
                Vérification Bordereaux ↔ Colis
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center space-x-3 p-3 rounded-md bg-muted/50">
                <Checkbox
                  id="verificationDone"
                  checked={verificationDone}
                  onCheckedChange={(checked) => {
                    setVerificationDone(!!checked)
                    if (checked) setStatus("Vérifié")
                  }}
                  className="mt-0.5"
                />
                <div className="flex-1">
                  <Label htmlFor="verificationDone" className="text-sm font-medium cursor-pointer">
                    Vérification bordereaux ↔ colis physiques terminée
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Confirmer que tous les colis correspondent aux bordereaux
                  </p>
                </div>
              </div>

              <Separator />

              {/* Discrepancies */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label className="text-xs font-medium">Écarts détectés</Label>
                  <Badge variant={discrepanciesFound ? "destructive" : "secondary"} className="text-[10px]">
                    {discrepanciesList.length} écart(s)
                  </Badge>
                </div>

                <div className="space-y-2">
                  <div className="flex gap-2">
                    <Input
                      value={newDiscrepancy}
                      onChange={(e) => setNewDiscrepancy(e.target.value)}
                      placeholder="Décrire l'écart détecté"
                      className="h-8 text-xs flex-1"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault()
                          addDiscrepancy()
                        }
                      }}
                    />
                    <Button size="sm" variant="outline" onClick={addDiscrepancy} className="h-8">
                      Ajouter
                    </Button>
                  </div>

                  {discrepanciesList.length > 0 && (
                    <div className="space-y-1">
                      {discrepanciesList.map((disc, index) => (
                        <div
                          key={index}
                          className="flex items-center justify-between p-2 rounded-md border bg-red-50 border-red-200"
                        >
                          <span className="text-xs text-red-900">{disc}</span>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => removeDiscrepancy(index)}
                            className="h-6 w-6 p-0"
                          >
                            <XCircle className="h-3 w-3 text-red-500" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {verificationDone && !discrepanciesFound && (
                <Alert className="bg-green-50 border-green-200">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <AlertDescription className="text-xs text-green-900">
                    Vérification conforme - Aucun écart détecté
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>

          {/* Compliance Check */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                Vérification Conformité
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {backCargo.complianceRules.requiresMarking && (
                <div className="flex items-center gap-2 text-xs">
                  {backCargo.markedBins ? (
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                  ) : (
                    <XCircle className="h-4 w-4 text-red-500" />
                  )}
                  <span className={backCargo.markedBins ? "text-green-700" : "text-red-700"}>
                    Marquage des bacs
                  </span>
                </div>
              )}

              {backCargo.complianceRules.requiresInventory && (
                <div className="flex items-center gap-2 text-xs">
                  {backCargo.hasInventory ? (
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                  ) : (
                    <XCircle className="h-4 w-4 text-red-500" />
                  )}
                  <span className={backCargo.hasInventory ? "text-green-700" : "text-red-700"}>
                    Inventaire joint
                  </span>
                </div>
              )}

              {backCargo.complianceRules.requiresExitPass && (
                <div className="flex items-center gap-2 text-xs">
                  {backCargo.hasExitPass ? (
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                  ) : (
                    <XCircle className="h-4 w-4 text-red-500" />
                  )}
                  <span className={backCargo.hasExitPass ? "text-green-700" : "text-red-700"}>
                    Laissez-passer
                  </span>
                </div>
              )}

              {backCargo.complianceRules.requiresScrapMention && (
                <div className="flex items-center gap-2 text-xs">
                  {backCargo.hasScrapMention ? (
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                  ) : (
                    <XCircle className="h-4 w-4 text-red-500" />
                  )}
                  <span className={backCargo.hasScrapMention ? "text-green-700" : "text-red-700"}>
                    Mention "à rebuter/ferrailler"
                  </span>
                </div>
              )}

              {backCargo.discrepancies && backCargo.discrepancies.length > 0 && (
                <>
                  <Separator />
                  <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription className="text-xs">
                      <p className="font-medium mb-1">Problèmes détectés:</p>
                      <ul className="list-disc list-inside space-y-0.5">
                        {backCargo.discrepancies.map((disc, idx) => (
                          <li key={idx}>{disc}</li>
                        ))}
                      </ul>
                    </AlertDescription>
                  </Alert>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 3: Notification */}
        <TabsContent value="notification" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <User className="h-4 w-4" />
                Destinataire
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label htmlFor="recipient" className="text-xs">
                  Nom du destinataire *
                </Label>
                <Input
                  id="recipient"
                  value={recipient}
                  onChange={(e) => setRecipient(e.target.value)}
                  placeholder="Nom de la personne ou entreprise"
                  className="h-8 text-sm"
                />
              </div>

              <div>
                <Label htmlFor="recipientService" className="text-xs">
                  Service destinataire *
                </Label>
                <Input
                  id="recipientService"
                  value={recipientService}
                  onChange={(e) => setRecipientService(e.target.value)}
                  placeholder={
                    backCargo.type === "Matériel sous-traitant"
                      ? "Nom du sous-traitant"
                      : backCargo.type === "Réintégration stock"
                        ? "Magasin"
                        : "Service"
                  }
                  className="h-8 text-sm"
                />
              </div>

              <div>
                <Label htmlFor="recipientContact" className="text-xs">
                  Contact (Email ou Téléphone)
                </Label>
                <Input
                  id="recipientContact"
                  value={recipientContact}
                  onChange={(e) => setRecipientContact(e.target.value)}
                  placeholder="email@example.com ou +237..."
                  className="h-8 text-sm"
                />
              </div>

              <div>
                <Label htmlFor="notifMethod" className="text-xs">
                  Méthode de notification
                </Label>
                <Select value={notificationMethod} onValueChange={(v) => setNotificationMethod(v as any)}>
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Email">Email uniquement</SelectItem>
                    <SelectItem value="SMS">SMS uniquement</SelectItem>
                    <SelectItem value="Email+SMS">Email + SMS</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Button
                className="w-full"
                onClick={handleNotifyRecipient}
                disabled={!recipient || !recipientService || notificationSent}
              >
                <Send className="h-4 w-4 mr-2" />
                {notificationSent ? "Notification Envoyée" : "Envoyer Notification"}
              </Button>

              {notificationSent && (
                <Alert className="bg-green-50 border-green-200">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <AlertDescription className="text-xs text-green-900">
                    Notification envoyée par {notificationMethod} à {recipient}
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>

          {/* Withdrawal tracking */}
          {requiresSignature && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  Suivi du Retrait
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="withdrawalDate" className="text-xs">
                      Date de retrait
                    </Label>
                    <Input
                      id="withdrawalDate"
                      type="date"
                      value={withdrawalDate}
                      onChange={(e) => setWithdrawalDate(e.target.value)}
                      className="h-8 text-sm"
                    />
                  </div>
                  <div>
                    <Label htmlFor="withdrawalTime" className="text-xs">
                      Heure de retrait
                    </Label>
                    <Input
                      id="withdrawalTime"
                      type="time"
                      value={withdrawalTime}
                      onChange={(e) => setWithdrawalTime(e.target.value)}
                      className="h-8 text-sm"
                    />
                  </div>
                </div>

                {withdrawalDate && (
                  <Button
                    className="w-full"
                    variant="outline"
                    onClick={() => {
                      // Open signature capture
                      alert("Capture de signature - À implémenter")
                    }}
                  >
                    <User className="h-4 w-4 mr-2" />
                    Capturer Signature Destinataire
                  </Button>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Tab 4: Exit Pass (for subcontractors) */}
        <TabsContent value="exitpass" className="space-y-4">
          {exitPassRequired && (
            <>
              <Alert>
                <FileText className="h-4 w-4" />
                <AlertDescription className="text-sm">
                  Un <strong>laissez-passer</strong> est obligatoire pour le retour de matériel sous-traitant
                </AlertDescription>
              </Alert>

              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Génération Laissez-passer</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {!exitPassGenerated ? (
                    <>
                      <p className="text-xs text-muted-foreground">
                        Le laissez-passer sera initié par le chargé d'affaires PERENCO et nécessitera les signatures:
                      </p>
                      <ul className="text-xs space-y-1 list-disc list-inside">
                        <li>Sous-traitant ({backCargo.subcontractorName})</li>
                        <li>Yard Officer</li>
                      </ul>

                      <Button className="w-full" onClick={handleGenerateExitPass}>
                        <FileText className="h-4 w-4 mr-2" />
                        Générer le Laissez-passer
                      </Button>
                    </>
                  ) : (
                    <>
                      <Alert className="bg-green-50 border-green-200">
                        <CheckCircle2 className="h-4 w-4 text-green-600" />
                        <AlertDescription className="text-sm text-green-900">
                          Laissez-passer N° <strong>{exitPassNumber}</strong> généré avec succès
                        </AlertDescription>
                      </Alert>

                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-xs p-2 rounded bg-muted/50">
                          <span>Copie bleue au Magasin:</span>
                          <Badge variant="secondary" className="text-[10px]">
                            Automatique
                          </Badge>
                        </div>

                        <div className="flex gap-2">
                          <Button size="sm" variant="outline" className="flex-1">
                            <Printer className="h-3 w-3 mr-1" />
                            Imprimer
                          </Button>
                          <Button size="sm" variant="outline" className="flex-1">
                            <Send className="h-3 w-3 mr-1" />
                            Envoyer par Email
                          </Button>
                        </div>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        {/* Tab 5: Dispatch */}
        <TabsContent value="dispatch" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <Truck className="h-4 w-4" />
                Dispatch Final
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Alert>
                <MapPin className="h-4 w-4" />
                <AlertDescription className="text-sm">
                  Destination: <strong>{finalDestination}</strong>
                </AlertDescription>
              </Alert>

              {yardLocation === "" && finalDestination === "Stockage Yard" && (
                <div>
                  <Label htmlFor="yardLoc" className="text-xs">
                    Emplacement Yard *
                  </Label>
                  <Input
                    id="yardLoc"
                    value={yardLocation}
                    onChange={(e) => setYardLocation(e.target.value)}
                    placeholder="Ex: Zone A - Allée 3"
                    className="h-8 text-sm"
                  />
                </div>
              )}

              {needsApprovalDueToMissingMention && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription className="text-xs">
                    Dispatch bloqué: En attente validation pour mention "à ferrailler" manquante. Photos ont été
                    envoyées aux services concernés.
                  </AlertDescription>
                </Alert>
              )}

              <div>
                <Label htmlFor="notes" className="text-xs">
                  Notes de dispatch
                </Label>
                <Textarea
                  id="notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Notes ou observations sur le dispatch"
                  className="text-sm h-20 resize-none"
                />
              </div>

              <Button
                className="w-full"
                onClick={handleDispatch}
                disabled={
                  !verificationDone ||
                  needsApprovalDueToMissingMention ||
                  (exitPassRequired && !exitPassGenerated) ||
                  status === "Dispatché"
                }
              >
                <Truck className="h-4 w-4 mr-2" />
                {status === "Dispatché" ? "Dispatch Terminé" : "Confirmer Dispatch"}
              </Button>

              {status === "Dispatché" && (
                <Alert className="bg-green-50 border-green-200">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <AlertDescription className="text-sm text-green-900">
                    Dispatch effectué le {new Date(dispatchedAt).toLocaleString("fr-FR")} par {dispatchedBy}
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>

          {/* Summary */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Résumé du Dispatch</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">N° Dispatch:</span>
                <span className="font-medium">{dispatchNumber}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Type retour:</span>
                <span className="font-medium">{backCargo.type}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Destination:</span>
                <span className="font-medium">{finalDestination}</span>
              </div>
              {verificationDone && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Vérification:</span>
                  <Badge variant="secondary" className="text-[10px]">
                    {discrepanciesFound ? `${discrepanciesList.length} écart(s)` : "Conforme"}
                  </Badge>
                </div>
              )}
              {notificationSent && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Notification:</span>
                  <Badge variant="secondary" className="text-[10px]">
                    Envoyée ({notificationMethod})
                  </Badge>
                </div>
              )}
              {exitPassGenerated && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Laissez-passer:</span>
                  <Badge variant="secondary" className="text-[10px]">
                    {exitPassNumber}
                  </Badge>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
