"use client"

import * as React from "react"
import { Plus, Trash2, Save, X, Package, Ship, MapPin, Calendar, User, Building2, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { useToast } from "@/hooks/use-toast"
import { travelwizAPI } from "@/api/travelwiz"
import {
  PackagingTypeEnum,
  DestinationTypeEnum,
  VesselTypeEnum,
  SourceTypeEnum,
} from "@/types/travelwiz"
import type {
  CargoItemCreate,
  LoadingManifestPublic,
} from "@/types/travelwiz"

interface CreateLoadingManifestDrawerProps {
  trigger?: React.ReactNode
  onSuccess?: (manifest: LoadingManifestPublic) => void
}

const packagingTypes = [
  PackagingTypeEnum.CONTENEUR,
  PackagingTypeEnum.PORTE_FUTS,
  PackagingTypeEnum.SKID,
  PackagingTypeEnum.RACK_GAZ,
  PackagingTypeEnum.TOOL_BOX,
  PackagingTypeEnum.PANIER,
  PackagingTypeEnum.CAISSON,
  PackagingTypeEnum.PORTE_CUVES,
  PackagingTypeEnum.BAC_DECHET,
]

const destinations = [
  DestinationTypeEnum.MASSONGO,
  DestinationTypeEnum.LA_LOBE,
  DestinationTypeEnum.WOURI,
  DestinationTypeEnum.RDR,
  DestinationTypeEnum.HILI,
  DestinationTypeEnum.ADN_130,
]

const vessels = [
  VesselTypeEnum.BOURBON_LIBERTY,
  VesselTypeEnum.SKOUL_GWEN,
  VesselTypeEnum.COASTAL_FIGHTER,
  VesselTypeEnum.SURFER,
  VesselTypeEnum.VEDETE,
  VesselTypeEnum.WOURI,
]

const sources = [
  SourceTypeEnum.MAGASIN,
  SourceTypeEnum.YARD,
  SourceTypeEnum.PRESTATAIRE,
]

const destinationCodes: Record<DestinationTypeEnum, string> = {
  [DestinationTypeEnum.MASSONGO]: "MSG",
  [DestinationTypeEnum.LA_LOBE]: "PAP",
  [DestinationTypeEnum.WOURI]: "WRI",
  [DestinationTypeEnum.RDR]: "RDR",
  [DestinationTypeEnum.HILI]: "HILI",
  [DestinationTypeEnum.ADN_130]: "ADN130",
}

const destinationColors: Record<DestinationTypeEnum, string> = {
  [DestinationTypeEnum.MASSONGO]: "#FF6B6B",
  [DestinationTypeEnum.LA_LOBE]: "#4ECDC4",
  [DestinationTypeEnum.WOURI]: "#45B7D1",
  [DestinationTypeEnum.RDR]: "#FFA07A",
  [DestinationTypeEnum.HILI]: "#98D8C8",
  [DestinationTypeEnum.ADN_130]: "#F7DC6F",
}

export function CreateLoadingManifestDrawer({ trigger, onSuccess }: CreateLoadingManifestDrawerProps) {
  const [open, setOpen] = React.useState(false)
  const [loading, setLoading] = React.useState(false)
  const { toast } = useToast()

  // Form state
  const [pickupLocation, setPickupLocation] = React.useState("Wouri")
  const [availabilityDate, setAvailabilityDate] = React.useState("")
  const [requestedDeliveryDate, setRequestedDeliveryDate] = React.useState("")
  const [vessel, setVessel] = React.useState<VesselTypeEnum>(VesselTypeEnum.SURFER)
  const [destination, setDestination] = React.useState<DestinationTypeEnum>(DestinationTypeEnum.MASSONGO)
  const [service, setService] = React.useState("")
  const [recipientName, setRecipientName] = React.useState("")
  const [recipientContact, setRecipientContact] = React.useState("")
  const [source, setSource] = React.useState<SourceTypeEnum>(SourceTypeEnum.MAGASIN)
  const [externalProvider, setExternalProvider] = React.useState("")
  const [emitterService, setEmitterService] = React.useState("")
  const [emitterName, setEmitterName] = React.useState("")
  const [emitterContact, setEmitterContact] = React.useState("")
  const [notes, setNotes] = React.useState("")

  // Items state
  const [items, setItems] = React.useState<Partial<CargoItemCreate>[]>([
    {
      item_number: "001",
      packaging: PackagingTypeEnum.TOOL_BOX,
      quantity: 1,
      designation: "",
      weight: 0,
      observations: "",
    },
  ])

  // Computed values
  const totalWeight = items.reduce((sum, item) => sum + (item.weight || 0) * (item.quantity || 1), 0)
  const totalPackages = items.reduce((sum, item) => sum + (item.quantity || 0), 0)
  const destinationCode = destinationCodes[destination]
  const destinationColor = destinationColors[destination]

  const addItem = () => {
    const newItemNumber = (items.length + 1).toString().padStart(3, "0")
    setItems([
      ...items,
      {
        item_number: newItemNumber,
        packaging: PackagingTypeEnum.TOOL_BOX,
        quantity: 1,
        designation: "",
        weight: 0,
        observations: "",
      },
    ])
  }

  const removeItem = (itemNumber: string) => {
    if (items.length > 1) {
      setItems(items.filter((item) => item.item_number !== itemNumber))
    }
  }

  const updateItem = (itemNumber: string, field: keyof CargoItemCreate, value: any) => {
    setItems(items.map((item) => (item.item_number === itemNumber ? { ...item, [field]: value } : item)))
  }

  const validateForm = (): { valid: boolean; errors: string[] } => {
    const errors: string[] = []

    if (!pickupLocation) errors.push("Lieu de prise en charge requis")
    if (!availabilityDate) errors.push("Date de mise à disposition requise")
    if (!requestedDeliveryDate) errors.push("Date de livraison souhaitée requise")
    if (!vessel) errors.push("Navire requis")
    if (!destination) errors.push("Destination requise")
    if (!service) errors.push("Service destinataire requis")
    if (!recipientName) errors.push("Nom du destinataire requis")
    if (!source) errors.push("Source requise")
    if (source === SourceTypeEnum.PRESTATAIRE && !externalProvider) errors.push("Nom du prestataire requis")
    if (!emitterService) errors.push("Service émetteur requis")
    if (!emitterName) errors.push("Nom du demandeur requis")

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

  const handleSave = async () => {
    const validation = validateForm()

    if (!validation.valid) {
      toast({
        title: "Erreurs de validation",
        description: validation.errors.join(", "),
        variant: "destructive",
      })
      return
    }

    setLoading(true)

    try {
      // Prepare items with all required fields
      const completeItems: CargoItemCreate[] = items.map((item) => ({
        item_number: item.item_number || "",
        packaging: item.packaging || PackagingTypeEnum.TOOL_BOX,
        quantity: item.quantity || 1,
        designation: item.designation || "",
        weight: item.weight || 0,
        observations: item.observations || null,
        packaging_number: null,
        cargo_win_number: null,
        cargo_nature: null,
        sap_code: null,
        sender: source === SourceTypeEnum.MAGASIN ? "Magasin Wouri" : source === SourceTypeEnum.YARD ? "Yard Wouri" : externalProvider,
        recipient: `${service} - ${recipientName}`,
        cargo_owner: null,
        slip_number: null,
        cost_imputation: null,
        picture_urls: null,
      }))

      // Format dates to ISO string format
      const availabilityISO = new Date(availabilityDate + "T00:00:00").toISOString()
      const requestedDeliveryISO = new Date(requestedDeliveryDate + "T00:00:00").toISOString()
      const emitterDateISO = new Date().toISOString()

      // Call API to create manifest
      const manifest = await travelwizAPI.createLoadingManifest({
        pickup_location: pickupLocation,
        availability_date: availabilityISO,
        requested_delivery_date: requestedDeliveryISO,
        vessel,
        destination,
        destination_code: destinationCode,
        service,
        recipient_name: recipientName,
        recipient_contact: recipientContact || null,
        source,
        external_provider: source === SourceTypeEnum.PRESTATAIRE ? externalProvider : null,
        emitter_service: emitterService,
        emitter_name: emitterName,
        emitter_contact: emitterContact || null,
        emitter_date: emitterDateISO,
        notes: notes || null,
        items: completeItems,
      })

      toast({
        title: "Manifeste créé",
        description: `Le manifeste ${manifest.manifest_number} a été créé avec succès.`,
      })

      onSuccess?.(manifest)
      setOpen(false)
      resetForm()
    } catch (error) {
      console.error("Error creating manifest:", error)
      toast({
        title: "Erreur",
        description: error instanceof Error ? error.message : "Impossible de créer le manifeste",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const resetForm = () => {
    setPickupLocation("Wouri")
    setAvailabilityDate("")
    setRequestedDeliveryDate("")
    setVessel(VesselTypeEnum.SURFER)
    setDestination(DestinationTypeEnum.MASSONGO)
    setService("")
    setRecipientName("")
    setRecipientContact("")
    setSource(SourceTypeEnum.MAGASIN)
    setExternalProvider("")
    setEmitterService("")
    setEmitterName("")
    setEmitterContact("")
    setNotes("")
    setItems([
      {
        item_number: "001",
        packaging: PackagingTypeEnum.TOOL_BOX,
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
            Nouveau Manifeste
          </Button>
        )}
      </SheetTrigger>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Ship className="h-5 w-5" />
            Créer un Manifeste de Chargement
          </SheetTitle>
          <SheetDescription>
            Remplissez les informations pour créer un nouveau manifeste de chargement bateau
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {/* Status Badge */}
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Nouveau Manifeste de Chargement</p>
                  <p className="text-xs text-muted-foreground">Le numéro sera généré automatiquement</p>
                </div>
                <Badge variant="outline" className="text-xs">
                  Brouillon
                </Badge>
              </div>
            </CardContent>
          </Card>

          {/* Section 1: Informations Générales */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <MapPin className="h-4 w-4" />
                Informations Générales
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="pickup" className="text-xs">
                    Lieu de prise en charge *
                  </Label>
                  <Input
                    id="pickup"
                    value={pickupLocation}
                    onChange={(e) => setPickupLocation(e.target.value)}
                    placeholder="Ex: Wouri"
                    className="h-8 text-sm"
                  />
                </div>
                <div>
                  <Label htmlFor="availability" className="text-xs">
                    Date de mise à disposition *
                  </Label>
                  <Input
                    id="availability"
                    type="date"
                    value={availabilityDate}
                    onChange={(e) => setAvailabilityDate(e.target.value)}
                    className="h-8 text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="delivery" className="text-xs">
                    Date de livraison souhaitée *
                  </Label>
                  <Input
                    id="delivery"
                    type="date"
                    value={requestedDeliveryDate}
                    onChange={(e) => setRequestedDeliveryDate(e.target.value)}
                    className="h-8 text-sm"
                  />
                </div>
                <div>
                  <Label htmlFor="vessel" className="text-xs">
                    Navire souhaité *
                  </Label>
                  <Select value={vessel} onValueChange={(v) => setVessel(v as VesselTypeEnum)}>
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
              </div>

              <div>
                <Label htmlFor="destination" className="text-xs">
                  Destination *
                </Label>
                <Select value={destination} onValueChange={(d) => setDestination(d as DestinationTypeEnum)}>
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {destinations.map((d) => (
                      <SelectItem key={d} value={d} className="text-sm">
                        <div className="flex items-center gap-2">
                          <div
                            className="h-3 w-3 rounded-full border"
                            style={{ backgroundColor: destinationColors[d] }}
                          />
                          <span>{d}</span>
                          <Badge variant="outline" className="text-[10px] ml-1">
                            {destinationCodes[d]}
                          </Badge>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[10px] text-muted-foreground mt-1">
                  Code: {destinationCode} • Couleur étiquette:{" "}
                  <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: destinationColor }} />
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Section 2: Service et Destinataire */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <User className="h-4 w-4" />
                Service et Destinataire
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label htmlFor="service" className="text-xs">
                  Service destinataire *
                </Label>
                <Input
                  id="service"
                  value={service}
                  onChange={(e) => setService(e.target.value)}
                  placeholder="Ex: Production, Maintenance, E-LINE"
                  className="h-8 text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="recipient" className="text-xs">
                    Nom de la personne concernée *
                  </Label>
                  <Input
                    id="recipient"
                    value={recipientName}
                    onChange={(e) => setRecipientName(e.target.value)}
                    placeholder="Ex: NKOLO J"
                    className="h-8 text-sm"
                  />
                </div>
                <div>
                  <Label htmlFor="recipientContact" className="text-xs">
                    Contact destinataire
                  </Label>
                  <Input
                    id="recipientContact"
                    value={recipientContact}
                    onChange={(e) => setRecipientContact(e.target.value)}
                    placeholder="Téléphone ou email"
                    className="h-8 text-sm"
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="source" className="text-xs">
                  Source *
                </Label>
                <Select value={source} onValueChange={(s) => setSource(s as SourceTypeEnum)}>
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {sources.map((s) => (
                      <SelectItem key={s} value={s} className="text-sm">
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {source === SourceTypeEnum.PRESTATAIRE && (
                <div>
                  <Label htmlFor="provider" className="text-xs">
                    Nom du prestataire *
                  </Label>
                  <Input
                    id="provider"
                    value={externalProvider}
                    onChange={(e) => setExternalProvider(e.target.value)}
                    placeholder="Ex: Air Liquide, Schlumberger"
                    className="h-8 text-sm"
                  />
                </div>
              )}
            </CardContent>
          </Card>

          {/* Section 3: Liste du Matériel */}
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
                <div key={item.item_number} className="border rounded-md p-3 space-y-2">
                  <div className="flex items-center justify-between mb-2">
                    <Badge variant="outline" className="text-[10px]">
                      Article {item.item_number}
                    </Badge>
                    {items.length > 1 && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => removeItem(item.item_number!)}
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
                        onValueChange={(v) => updateItem(item.item_number!, "packaging", v)}
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
                          onChange={(e) => updateItem(item.item_number!, "quantity", parseInt(e.target.value) || 1)}
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
                          onChange={(e) => updateItem(item.item_number!, "weight", parseFloat(e.target.value) || 0)}
                          className="h-7 text-xs"
                        />
                      </div>
                    </div>
                  </div>

                  <div>
                    <Label className="text-[10px]">Désignation *</Label>
                    <Input
                      value={item.designation}
                      onChange={(e) => updateItem(item.item_number!, "designation", e.target.value)}
                      placeholder="Description détaillée du matériel"
                      className="h-7 text-xs"
                    />
                  </div>

                  <div>
                    <Label className="text-[10px]">Observations</Label>
                    <Textarea
                      value={item.observations || ""}
                      onChange={(e) => updateItem(item.item_number!, "observations", e.target.value)}
                      placeholder="Observations particulières"
                      className="text-xs h-16 resize-none"
                    />
                  </div>

                  <div className="text-[10px] text-muted-foreground pt-1 border-t">
                    Poids total: <span className="font-medium">{((item.weight || 0) * (item.quantity || 1)).toFixed(1)} kg</span>
                  </div>
                </div>
              ))}

              <Separator />

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

          {/* Section 4: Informations Administratives */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Building2 className="h-4 w-4" />
                Informations Administratives
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label htmlFor="emitterService" className="text-xs">
                  Service émetteur *
                </Label>
                <Input
                  id="emitterService"
                  value={emitterService}
                  onChange={(e) => setEmitterService(e.target.value)}
                  placeholder="Ex: Expédition, Logistique"
                  className="h-8 text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="emitter" className="text-xs">
                    Nom du demandeur *
                  </Label>
                  <Input
                    id="emitter"
                    value={emitterName}
                    onChange={(e) => setEmitterName(e.target.value)}
                    placeholder="Ex: MBALLA E"
                    className="h-8 text-sm"
                  />
                </div>
                <div>
                  <Label htmlFor="emitterContact" className="text-xs">
                    Contact émetteur
                  </Label>
                  <Input
                    id="emitterContact"
                    value={emitterContact}
                    onChange={(e) => setEmitterContact(e.target.value)}
                    placeholder="Téléphone ou email"
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
                  placeholder="Informations complémentaires"
                  className="text-sm h-20 resize-none"
                />
              </div>

              <div className="text-xs text-muted-foreground">
                <div className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  Date de création: {new Date().toLocaleDateString("fr-FR")}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Actions */}
          <div className="flex gap-2 pt-4 border-t sticky bottom-0 bg-background pb-4">
            <Button variant="outline" className="flex-1" onClick={() => setOpen(false)} disabled={loading}>
              <X className="h-4 w-4 mr-2" />
              Annuler
            </Button>
            <Button className="flex-1" onClick={handleSave} disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Enregistrement...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  Enregistrer
                </>
              )}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
