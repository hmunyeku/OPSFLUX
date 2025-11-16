"use client"

import * as React from "react"
import { Plus, Trash2, Save, X, Package, AlertCircle, Upload, CheckCircle2, MapPin, Ship } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Alert, AlertDescription } from "@/components/ui/alert"
import type {
  BackCargoManifest,
  CargoItem,
  BackCargoType,
  DestinationType,
  VesselType,
  PackagingType,
  ComplianceRules,
} from "@/lib/travelwiz-back-cargo-types"
import {
  generateBackCargoNumber,
  generatePackageQRCode,
  getComplianceRules,
  getDestinationArea,
  isBackCargoCompliant,
} from "@/lib/travelwiz-back-cargo-types"

interface CreateBackCargoDrawerProps {
  trigger?: React.ReactNode
  onSave?: (backCargo: Partial<BackCargoManifest>) => void
}

const backCargoTypes: BackCargoType[] = [
  "Déchets DIS",
  "Déchets DIB",
  "Déchets DMET",
  "Matériel sous-traitant",
  "Réintégration stock",
  "À rebuter",
  "À ferrailler",
  "Stockage Yard",
]

const originSites: DestinationType[] = ["Massongo", "La Lobe", "Wouri", "RDR", "Hili", "ADN 130"]

const vessels: VesselType[] = [
  "Bourbon Liberty 234",
  "Skoul Gwen",
  "Coastal Fighter",
  "SURFER",
  "VEDETE",
  "Wouri",
]

const packagingTypes: PackagingType[] = [
  "Conteneur",
  "Porte-futs",
  "Skid",
  "Rack gaz",
  "Tool box",
  "Panier",
  "Caisson",
  "Porte-cuves",
  "Bac déchet",
]

export function CreateBackCargoDrawer({ trigger, onSave }: CreateBackCargoDrawerProps) {
  const [open, setOpen] = React.useState(false)
  const [backCargoNumber] = React.useState(generateBackCargoNumber())

  // Form state
  const [type, setType] = React.useState<BackCargoType>("Déchets DIS")
  const [originSite, setOriginSite] = React.useState<DestinationType>("Massongo")
  const [originRig, setOriginRig] = React.useState("")
  const [vessel, setVessel] = React.useState<VesselType>("Bourbon Liberty 234")
  const [arrivalDate, setArrivalDate] = React.useState("")
  const [companyMan, setCompanyMan] = React.useState("")
  const [omaaDelegate, setOmaaDelegate] = React.useState("")
  const [subcontractorName, setSubcontractorName] = React.useState("")
  const [destinationService, setDestinationService] = React.useState("")
  const [storageReason, setStorageReason] = React.useState("")
  const [notes, setNotes] = React.useState("")

  // Compliance checkboxes
  const [hasInventory, setHasInventory] = React.useState(false)
  const [hasExitPass, setHasExitPass] = React.useState(false)
  const [markedBins, setMarkedBins] = React.useState(false)
  const [hasScrapMention, setHasScrapMention] = React.useState(false)
  const [hasYardStorageMention, setHasYardStorageMention] = React.useState(false)

  // Items
  const [items, setItems] = React.useState<Partial<CargoItem>[]>([
    {
      id: "1",
      itemNumber: "001",
      packaging: "Panier",
      quantity: 1,
      designation: "",
      weight: 0,
      observations: "",
    },
  ])

  // Get compliance rules for selected type
  const complianceRules = React.useMemo(() => getComplianceRules(type), [type])
  const destinationArea = React.useMemo(() => getDestinationArea(type), [type])

  // Computed values
  const totalWeight = items.reduce((sum, item) => sum + (item.weight || 0) * (item.quantity || 1), 0)
  const totalPackages = items.reduce((sum, item) => sum + (item.quantity || 0), 0)

  // Reset form when type changes
  React.useEffect(() => {
    // Reset compliance fields
    setHasInventory(false)
    setHasExitPass(false)
    setMarkedBins(false)
    setHasScrapMention(false)
    setHasYardStorageMention(false)
    setSubcontractorName("")
    setStorageReason("")
    setDestinationService("")
  }, [type])

  const addItem = () => {
    const newItemNumber = (items.length + 1).toString().padStart(3, "0")
    setItems([
      ...items,
      {
        id: Date.now().toString(),
        itemNumber: newItemNumber,
        packaging: "Panier",
        quantity: 1,
        designation: "",
        weight: 0,
        observations: "",
      },
    ])
  }

  const removeItem = (id: string) => {
    if (items.length > 1) {
      setItems(items.filter((item) => item.id !== id))
    }
  }

  const updateItem = (id: string, field: keyof CargoItem, value: any) => {
    setItems(items.map((item) => (item.id === id ? { ...item, [field]: value } : item)))
  }

  const validateForm = (): { valid: boolean; errors: string[] } => {
    const errors: string[] = []

    if (!originSite) errors.push("Site de provenance requis")
    if (!vessel) errors.push("Navire requis")
    if (!arrivalDate) errors.push("Date d'arrivée requise")
    if (!companyMan) errors.push("Company Man requis")

    // Type-specific validations
    if (complianceRules.requiresMarking && !markedBins) {
      errors.push("Marquage des bacs obligatoire")
    }

    if (complianceRules.requiresInventory && !hasInventory) {
      errors.push("Inventaire obligatoire")
    }

    if (complianceRules.requiresExitPass && !hasExitPass) {
      errors.push("Laissez-passer obligatoire")
    }

    if (complianceRules.requiresScrapMention && !hasScrapMention) {
      errors.push('Mention "à rebuter/ferrailler" obligatoire')
    }

    if (complianceRules.requiresStorageJustification && !storageReason) {
      errors.push("Justification de stockage obligatoire")
    }

    if (complianceRules.requiresYardStorageMention && !hasYardStorageMention) {
      errors.push('Mention "stockage Yard" obligatoire')
    }

    if (type === "Matériel sous-traitant" && !subcontractorName) {
      errors.push("Nom du sous-traitant requis")
    }

    if ((type === "Déchets DIS" || type === "Déchets DIB" || type === "Déchets DMET") && !omaaDelegate) {
      errors.push("Délégué OMAA requis pour les déchets")
    }

    if (complianceRules.requiresSapCodes && items.some((item) => !item.sapCode)) {
      errors.push("Codes SAP obligatoires pour tous les articles")
    }

    items.forEach((item, index) => {
      if (!item.designation) errors.push(`Article ${index + 1}: Désignation requise`)
      if (!item.weight || item.weight <= 0) errors.push(`Article ${index + 1}: Poids invalide`)
      if (!item.quantity || item.quantity <= 0) errors.push(`Article ${index + 1}: Quantité invalide`)
    })

    return {
      valid: errors.length === 0,
      errors,
    }
  }

  const handleSave = () => {
    const validation = validateForm()

    if (!validation.valid) {
      alert("Erreurs de validation:\n" + validation.errors.join("\n"))
      return
    }

    const completeItems: CargoItem[] = items.map((item) => ({
      id: item.id || Date.now().toString(),
      itemNumber: item.itemNumber || "",
      packaging: item.packaging || "Panier",
      quantity: item.quantity || 1,
      designation: item.designation || "",
      weight: item.weight || 0,
      observations: item.observations,
      sapCode: item.sapCode,
      qrCode: generatePackageQRCode(backCargoNumber, item.itemNumber || ""),
    }))

    const backCargo: Partial<BackCargoManifest> = {
      backCargoNumber,
      type,
      status: "Brouillon",
      originSite,
      originRig: originRig || undefined,
      vessel,
      arrivalDate,
      items: completeItems,
      totalWeight,
      totalPackages,
      companyMan,
      omaaDelegate: omaaDelegate || undefined,
      subcontractorName: subcontractorName || undefined,
      complianceRules,
      hasInventory,
      hasExitPass,
      markedBins,
      hasScrapMention,
      hasYardStorageMention,
      destinationService: destinationService || undefined,
      destinationArea,
      storageReason: storageReason || undefined,
      notes: notes || undefined,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    // Check compliance
    const compliance = isBackCargoCompliant(backCargo as BackCargoManifest)
    if (!compliance.compliant) {
      backCargo.discrepancies = compliance.issues
      backCargo.pendingApproval = true
    }

    onSave?.(backCargo)
    setOpen(false)
    resetForm()
  }

  const resetForm = () => {
    setType("Déchets DIS")
    setOriginSite("Massongo")
    setOriginRig("")
    setVessel("Bourbon Liberty 234")
    setArrivalDate("")
    setCompanyMan("")
    setOmaaDelegate("")
    setSubcontractorName("")
    setDestinationService("")
    setStorageReason("")
    setNotes("")
    setHasInventory(false)
    setHasExitPass(false)
    setMarkedBins(false)
    setHasScrapMention(false)
    setHasYardStorageMention(false)
    setItems([
      {
        id: "1",
        itemNumber: "001",
        packaging: "Panier",
        quantity: 1,
        designation: "",
        weight: 0,
        observations: "",
      },
    ])
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        {trigger || (
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            Nouveau Retour Site
          </Button>
        )}
      </SheetTrigger>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Créer un Retour Site (Back Cargo)
          </SheetTitle>
          <SheetDescription>
            Remplissez les informations pour créer un nouveau bordereau de retour site
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {/* Back Cargo Number & Type */}
          <Card>
            <CardContent className="pt-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">N° Retour</p>
                  <p className="text-2xl font-bold text-primary">{backCargoNumber}</p>
                </div>
                <Badge variant="outline" className="text-xs">
                  Brouillon
                </Badge>
              </div>

              <div>
                <Label htmlFor="type" className="text-xs">
                  Type de retour *
                </Label>
                <Select value={type} onValueChange={(t) => setType(t as BackCargoType)}>
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {backCargoTypes.map((t) => (
                      <SelectItem key={t} value={t} className="text-sm">
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Destination automatique */}
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription className="text-xs">
                  Destination automatique: <strong>{destinationArea}</strong>
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>

          {/* Origine et Transport */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <MapPin className="h-4 w-4" />
                Origine et Transport
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="origin" className="text-xs">
                    Site de provenance *
                  </Label>
                  <Select value={originSite} onValueChange={(s) => setOriginSite(s as DestinationType)}>
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {originSites.map((s) => (
                        <SelectItem key={s} value={s} className="text-sm">
                          {s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="rig" className="text-xs">
                    Rig de provenance
                  </Label>
                  <Input
                    id="rig"
                    value={originRig}
                    onChange={(e) => setOriginRig(e.target.value)}
                    placeholder="Ex: RIG-045"
                    className="h-8 text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="vessel" className="text-xs">
                    Navire *
                  </Label>
                  <Select value={vessel} onValueChange={(v) => setVessel(v as VesselType)}>
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {vessels.map((v) => (
                        <SelectItem key={v} value={v} className="text-sm">
                          {v}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="arrival" className="text-xs">
                    Date d'arrivée prévue *
                  </Label>
                  <Input
                    id="arrival"
                    type="date"
                    value={arrivalDate}
                    onChange={(e) => setArrivalDate(e.target.value)}
                    className="h-8 text-sm"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Validations et Signatures */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Validations et Signatures</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label htmlFor="companyMan" className="text-xs">
                  Company Man (site) *
                </Label>
                <Input
                  id="companyMan"
                  value={companyMan}
                  onChange={(e) => setCompanyMan(e.target.value)}
                  placeholder="Nom du Company Man"
                  className="h-8 text-sm"
                />
              </div>

              {(type === "Déchets DIS" || type === "Déchets DIB" || type === "Déchets DMET") && (
                <div>
                  <Label htmlFor="omaa" className="text-xs">
                    Délégué OMAA * <Badge variant="secondary" className="text-[9px] ml-1">Requis pour déchets</Badge>
                  </Label>
                  <Input
                    id="omaa"
                    value={omaaDelegate}
                    onChange={(e) => setOmaaDelegate(e.target.value)}
                    placeholder="Nom du délégué OMAA"
                    className="h-8 text-sm"
                  />
                </div>
              )}

              {type === "Matériel sous-traitant" && (
                <div>
                  <Label htmlFor="subcontractor" className="text-xs">
                    Nom du sous-traitant * <Badge variant="secondary" className="text-[9px] ml-1">Requis</Badge>
                  </Label>
                  <Input
                    id="subcontractor"
                    value={subcontractorName}
                    onChange={(e) => setSubcontractorName(e.target.value)}
                    placeholder="Ex: Schlumberger, Halliburton"
                    className="h-8 text-sm"
                  />
                </div>
              )}
            </CardContent>
          </Card>

          {/* Règles de Conformité */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4" />
                Règles de Conformité
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {complianceRules.requiresMarking && (
                <div className="flex items-center space-x-2">
                  <Checkbox id="marking" checked={markedBins} onCheckedChange={(checked) => setMarkedBins(!!checked)} />
                  <Label htmlFor="marking" className="text-xs cursor-pointer">
                    Tous les bacs sont marqués (site/rig de provenance) *
                  </Label>
                </div>
              )}

              {complianceRules.requiresShipmentSlip && (
                <Alert className="bg-blue-50 border-blue-200">
                  <AlertCircle className="h-4 w-4 text-blue-600" />
                  <AlertDescription className="text-xs text-blue-900">
                    Bordereau d'expédition obligatoire - Sera généré automatiquement
                  </AlertDescription>
                </Alert>
              )}

              {complianceRules.requiresInventory && (
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="inventory"
                    checked={hasInventory}
                    onCheckedChange={(checked) => setHasInventory(!!checked)}
                  />
                  <Label htmlFor="inventory" className="text-xs cursor-pointer">
                    Inventaire détaillé joint *
                  </Label>
                </div>
              )}

              {complianceRules.requiresExitPass && (
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="exitPass"
                    checked={hasExitPass}
                    onCheckedChange={(checked) => setHasExitPass(!!checked)}
                  />
                  <Label htmlFor="exitPass" className="text-xs cursor-pointer">
                    Laissez-passer de retrait joint *
                  </Label>
                </div>
              )}

              {complianceRules.requiresBlueCopyToStore && (
                <Alert className="bg-blue-50 border-blue-200">
                  <AlertCircle className="h-4 w-4 text-blue-600" />
                  <AlertDescription className="text-xs text-blue-900">
                    Copie bleue du laissez-passer sera remise automatiquement au Magasin
                  </AlertDescription>
                </Alert>
              )}

              {complianceRules.requiresScrapMention && (
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="scrapMention"
                    checked={hasScrapMention}
                    onCheckedChange={(checked) => setHasScrapMention(!!checked)}
                  />
                  <Label htmlFor="scrapMention" className="text-xs cursor-pointer">
                    Mention "à rebuter et/ou à ferrailler" sur bordereau *
                  </Label>
                </div>
              )}

              {complianceRules.requiresPhotosIfMentionMissing && !hasScrapMention && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription className="text-xs">
                    Si mention manquante: photos obligatoires + validation requise avant dispatch
                  </AlertDescription>
                </Alert>
              )}

              {complianceRules.requiresYardStorageMention && (
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="yardMention"
                    checked={hasYardStorageMention}
                    onCheckedChange={(checked) => setHasYardStorageMention(!!checked)}
                  />
                  <Label htmlFor="yardMention" className="text-xs cursor-pointer">
                    Mention "stockage Yard" sur bordereau *
                  </Label>
                </div>
              )}

              {complianceRules.requiresStorageJustification && (
                <div>
                  <Label htmlFor="storageReason" className="text-xs">
                    Justification de stockage Yard *
                  </Label>
                  <Textarea
                    id="storageReason"
                    value={storageReason}
                    onChange={(e) => setStorageReason(e.target.value)}
                    placeholder="Ex: Équipement en attente maintenance - Non géré SAP"
                    className="text-xs h-16 resize-none"
                  />
                </div>
              )}

              {complianceRules.requiresDedicatedStorage && (
                <Alert className="bg-orange-50 border-orange-200">
                  <AlertCircle className="h-4 w-4 text-orange-600" />
                  <AlertDescription className="text-xs text-orange-900">
                    Zone de stockage dédiée sera assignée automatiquement ({type})
                  </AlertDescription>
                </Alert>
              )}

              {type === "Réintégration stock" && (
                <div>
                  <Label htmlFor="destService" className="text-xs">
                    Service destinataire
                  </Label>
                  <Input
                    id="destService"
                    value={destinationService}
                    onChange={(e) => setDestinationService(e.target.value)}
                    placeholder="Magasin"
                    className="h-8 text-sm"
                    disabled
                  />
                  <p className="text-[10px] text-muted-foreground mt-1">Destination automatique: Magasin</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Liste du Matériel */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Package className="h-4 w-4" />
                  Liste du Matériel
                </CardTitle>
                <Button size="sm" variant="outline" onClick={addItem} className="h-7 text-xs">
                  <Plus className="h-3 w-3 mr-1" />
                  Ajouter
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {items.map((item, index) => (
                <div key={item.id} className="border rounded-md p-3 space-y-2">
                  <div className="flex items-center justify-between mb-2">
                    <Badge variant="outline" className="text-[10px]">
                      Article {item.itemNumber}
                    </Badge>
                    {items.length > 1 && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => removeItem(item.id!)}
                        className="h-6 w-6 p-0"
                      >
                        <Trash2 className="h-3 w-3 text-red-500" />
                      </Button>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-[10px]">Type d'emballage *</Label>
                      <Select
                        value={item.packaging}
                        onValueChange={(v) => updateItem(item.id!, "packaging", v)}
                      >
                        <SelectTrigger className="h-7 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {packagingTypes.map((p) => (
                            <SelectItem key={p} value={p} className="text-xs">
                              {p}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid grid-cols-2 gap-1">
                      <div>
                        <Label className="text-[10px]">Quantité *</Label>
                        <Input
                          type="number"
                          min="1"
                          value={item.quantity}
                          onChange={(e) => updateItem(item.id!, "quantity", parseInt(e.target.value) || 1)}
                          className="h-7 text-xs"
                        />
                      </div>
                      <div>
                        <Label className="text-[10px]">Poids (kg) *</Label>
                        <Input
                          type="number"
                          min="0"
                          step="0.1"
                          value={item.weight}
                          onChange={(e) => updateItem(item.id!, "weight", parseFloat(e.target.value) || 0)}
                          className="h-7 text-xs"
                        />
                      </div>
                    </div>
                  </div>

                  <div>
                    <Label className="text-[10px]">Désignation *</Label>
                    <Input
                      value={item.designation}
                      onChange={(e) => updateItem(item.id!, "designation", e.target.value)}
                      placeholder="Description détaillée"
                      className="h-7 text-xs"
                    />
                  </div>

                  {complianceRules.requiresSapCodes && (
                    <div>
                      <Label className="text-[10px]">
                        Code Article SAP * <Badge variant="secondary" className="text-[9px] ml-1">Requis</Badge>
                      </Label>
                      <Input
                        value={item.sapCode}
                        onChange={(e) => updateItem(item.id!, "sapCode", e.target.value)}
                        placeholder="Ex: MAT-12345"
                        className="h-7 text-xs"
                      />
                    </div>
                  )}

                  <div>
                    <Label className="text-[10px]">Observations</Label>
                    <Textarea
                      value={item.observations}
                      onChange={(e) => updateItem(item.id!, "observations", e.target.value)}
                      placeholder="Observations particulières"
                      className="text-xs h-12 resize-none"
                    />
                  </div>
                </div>
              ))}

              <div className="bg-muted/50 rounded-md p-2 space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Nombre total de colis:</span>
                  <span className="font-semibold">{totalPackages}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Poids total:</span>
                  <span className="font-semibold">{totalWeight.toFixed(1)} kg</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Notes */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Notes / Observations</CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Informations complémentaires"
                className="text-sm h-20 resize-none"
              />
            </CardContent>
          </Card>

          {/* Actions */}
          <div className="flex gap-2 pt-4 border-t sticky bottom-0 bg-background pb-4">
            <Button variant="outline" className="flex-1" onClick={() => setOpen(false)}>
              <X className="h-4 w-4 mr-2" />
              Annuler
            </Button>
            <Button className="flex-1" onClick={handleSave}>
              <Save className="h-4 w-4 mr-2" />
              Enregistrer
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
