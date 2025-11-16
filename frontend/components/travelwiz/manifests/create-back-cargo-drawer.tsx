"use client"

import * as React from "react"
import { X, Plus, Trash2, Calendar as CalendarIcon, Loader2, Save, Package } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerTrigger, DrawerFooter } from "@/components/ui/drawer"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useToast } from "@/hooks/use-toast"
import { travelwizAPI } from "@/api/travelwiz"
import type {
  BackCargoTypeEnum,
  DestinationTypeEnum,
  VesselTypeEnum,
  PackagingTypeEnum,
  DestinationAreaEnum,
  CargoItemCreate,
  BackCargoManifestPublic,
} from "@/types/travelwiz"

interface CreateBackCargoDrawerProps {
  trigger?: React.ReactNode
  onSuccess?: (manifest: BackCargoManifestPublic) => void
}

interface CargoItem {
  item_number: string
  packaging: PackagingTypeEnum | ""
  packaging_number?: string
  quantity: number
  designation: string
  weight: number
  observations?: string
  cargo_win_number?: string
  cargo_nature?: string
  sap_code?: string
  sender?: string
  recipient?: string
  cargo_owner?: string
  slip_number?: string
  cost_imputation?: string
}

export function CreateBackCargoDrawer({ trigger, onSuccess }: CreateBackCargoDrawerProps) {
  const [open, setOpen] = React.useState(false)
  const [loading, setLoading] = React.useState(false)
  const { toast } = useToast()

  // Back Cargo specific fields
  const [type, setType] = React.useState<BackCargoTypeEnum | "">("")
  const [originSite, setOriginSite] = React.useState<DestinationTypeEnum | "">("")
  const [originRig, setOriginRig] = React.useState("")
  const [vessel, setVessel] = React.useState<VesselTypeEnum | "">("")
  const [arrivalDate, setArrivalDate] = React.useState("")
  const [companyMan, setCompanyMan] = React.useState("")
  const [omaaDelegate, setOmaaDelegate] = React.useState("")
  const [subcontractorName, setSubcontractorName] = React.useState("")

  // Compliance checkboxes
  const [hasInventory, setHasInventory] = React.useState(false)
  const [hasExitPass, setHasExitPass] = React.useState(false)
  const [markedBins, setMarkedBins] = React.useState(false)
  const [hasScrapMention, setHasScrapMention] = React.useState(false)
  const [hasYardStorageMention, setHasYardStorageMention] = React.useState(false)

  // Destination
  const [destinationService, setDestinationService] = React.useState("")
  const [destinationArea, setDestinationArea] = React.useState<DestinationAreaEnum | "">("")
  const [storageReason, setStorageReason] = React.useState("")

  const [notes, setNotes] = React.useState("")

  // Items
  const [items, setItems] = React.useState<CargoItem[]>([
    {
      item_number: "",
      packaging: "",
      quantity: 1,
      designation: "",
      weight: 0,
    },
  ])

  const addItem = () => {
    setItems([
      ...items,
      {
        item_number: "",
        packaging: "",
        quantity: 1,
        designation: "",
        weight: 0,
      },
    ])
  }

  const removeItem = (index: number) => {
    if (items.length > 1) {
      setItems(items.filter((_, i) => i !== index))
    }
  }

  const updateItem = (index: number, field: keyof CargoItem, value: any) => {
    const newItems = [...items]
    newItems[index] = { ...newItems[index], [field]: value }
    setItems(newItems)
  }

  const validateForm = () => {
    const errors: string[] = []

    if (!type) errors.push("Type de retour requis")
    if (!originSite) errors.push("Site d'origine requis")
    if (!vessel) errors.push("Navire requis")
    if (!arrivalDate) errors.push("Date d'arrivée requise")

    // Validate items
    items.forEach((item, index) => {
      if (!item.item_number) errors.push(`Article ${index + 1}: Numéro requis`)
      if (!item.packaging) errors.push(`Article ${index + 1}: Conditionnement requis`)
      if (!item.designation) errors.push(`Article ${index + 1}: Désignation requise`)
      if (item.weight <= 0) errors.push(`Article ${index + 1}: Poids invalide`)
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
      // Convert date to ISO format
      const arrivalISO = new Date(arrivalDate).toISOString()

      const completeItems: CargoItemCreate[] = items.map((item) => ({
        item_number: item.item_number || "",
        packaging: item.packaging as PackagingTypeEnum,
        packaging_number: item.packaging_number || null,
        quantity: item.quantity || 1,
        designation: item.designation || "",
        weight: item.weight || 0,
        observations: item.observations || null,
        cargo_win_number: item.cargo_win_number || null,
        cargo_nature: item.cargo_nature || null,
        sap_code: item.sap_code || null,
        sender: item.sender || null,
        recipient: item.recipient || null,
        cargo_owner: item.cargo_owner || null,
        slip_number: item.slip_number || null,
        cost_imputation: item.cost_imputation || null,
        picture_urls: null,
      }))

      const manifest = await travelwizAPI.createBackCargoManifest({
        type: type as BackCargoTypeEnum,
        origin_site: originSite as DestinationTypeEnum,
        origin_rig: originRig || null,
        vessel: vessel as VesselTypeEnum,
        arrival_date: arrivalISO,
        company_man: companyMan || null,
        omaa_delegate: omaaDelegate || null,
        subcontractor_name: subcontractorName || null,
        has_inventory: hasInventory,
        has_exit_pass: hasExitPass,
        marked_bins: markedBins,
        has_scrap_mention: hasScrapMention,
        has_yard_storage_mention: hasYardStorageMention,
        destination_service: destinationService || null,
        destination_area: destinationArea || null,
        storage_reason: storageReason || null,
        notes: notes || null,
        items: completeItems,
      })

      toast({
        title: "Retour site créé",
        description: `Le retour site ${manifest.back_cargo_number} a été créé avec succès.`,
      })

      onSuccess?.(manifest)
      setOpen(false)
      resetForm()
    } catch (error) {
      toast({
        title: "Erreur",
        description: error instanceof Error ? error.message : "Impossible de créer le retour site",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const resetForm = () => {
    setType("")
    setOriginSite("")
    setOriginRig("")
    setVessel("")
    setArrivalDate("")
    setCompanyMan("")
    setOmaaDelegate("")
    setSubcontractorName("")
    setHasInventory(false)
    setHasExitPass(false)
    setMarkedBins(false)
    setHasScrapMention(false)
    setHasYardStorageMention(false)
    setDestinationService("")
    setDestinationArea("")
    setStorageReason("")
    setNotes("")
    setItems([
      {
        item_number: "",
        packaging: "",
        quantity: 1,
        designation: "",
        weight: 0,
      },
    ])
  }

  const totalWeight = items.reduce((sum, item) => sum + (item.weight || 0), 0)
  const totalPackages = items.reduce((sum, item) => sum + (item.quantity || 0), 0)

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      {trigger && <DrawerTrigger asChild>{trigger}</DrawerTrigger>}
      <DrawerContent className="max-h-[95vh]">
        <DrawerHeader className="border-b">
          <div className="flex items-center justify-between">
            <DrawerTitle className="text-lg font-semibold">Nouveau Retour Site (Back Cargo)</DrawerTitle>
            <Button variant="ghost" size="icon" onClick={() => setOpen(false)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </DrawerHeader>

        <div className="overflow-y-auto p-4">
          <div className="space-y-4 max-w-5xl mx-auto">
            {/* Section 1: Informations Générales */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Informations Générales</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="type" className="text-xs">
                      Type de Retour <span className="text-red-500">*</span>
                    </Label>
                    <Select value={type} onValueChange={(val) => setType(val as BackCargoTypeEnum)}>
                      <SelectTrigger id="type" className="h-8 text-xs">
                        <SelectValue placeholder="Sélectionner le type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Déchets DIS">Déchets DIS</SelectItem>
                        <SelectItem value="Déchets DIB">Déchets DIB</SelectItem>
                        <SelectItem value="Déchets DMET">Déchets DMET</SelectItem>
                        <SelectItem value="Matériel sous-traitant">Matériel sous-traitant</SelectItem>
                        <SelectItem value="Réintégration stock">Réintégration stock</SelectItem>
                        <SelectItem value="À rebuter">À rebuter</SelectItem>
                        <SelectItem value="À ferrailler">À ferrailler</SelectItem>
                        <SelectItem value="Stockage Yard">Stockage Yard</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label htmlFor="originSite" className="text-xs">
                      Site d'Origine <span className="text-red-500">*</span>
                    </Label>
                    <Select value={originSite} onValueChange={(val) => setOriginSite(val as DestinationTypeEnum)}>
                      <SelectTrigger id="originSite" className="h-8 text-xs">
                        <SelectValue placeholder="Sélectionner le site" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Massongo">Massongo</SelectItem>
                        <SelectItem value="La Lobe">La Lobe</SelectItem>
                        <SelectItem value="Wouri">Wouri</SelectItem>
                        <SelectItem value="RDR">RDR</SelectItem>
                        <SelectItem value="Hili">Hili</SelectItem>
                        <SelectItem value="ADN 130">ADN 130</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label htmlFor="originRig" className="text-xs">
                      Appareil d'Origine
                    </Label>
                    <Input
                      id="originRig"
                      className="h-8 text-xs"
                      value={originRig}
                      onChange={(e) => setOriginRig(e.target.value)}
                      placeholder="Ex: RIG-001"
                    />
                  </div>

                  <div>
                    <Label htmlFor="vessel" className="text-xs">
                      Navire <span className="text-red-500">*</span>
                    </Label>
                    <Select value={vessel} onValueChange={(val) => setVessel(val as VesselTypeEnum)}>
                      <SelectTrigger id="vessel" className="h-8 text-xs">
                        <SelectValue placeholder="Sélectionner le navire" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Bourbon Liberty 234">Bourbon Liberty 234</SelectItem>
                        <SelectItem value="Skoul Gwen">Skoul Gwen</SelectItem>
                        <SelectItem value="Coastal Fighter">Coastal Fighter</SelectItem>
                        <SelectItem value="SURFER">SURFER</SelectItem>
                        <SelectItem value="VEDETE">VEDETE</SelectItem>
                        <SelectItem value="Wouri">Wouri</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label htmlFor="arrivalDate" className="text-xs">
                      Date d'Arrivée <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      id="arrivalDate"
                      type="date"
                      className="h-8 text-xs"
                      value={arrivalDate}
                      onChange={(e) => setArrivalDate(e.target.value)}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Section 2: Responsables et Signatures */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Responsables</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label htmlFor="companyMan" className="text-xs">
                      Company Man
                    </Label>
                    <Input
                      id="companyMan"
                      className="h-8 text-xs"
                      value={companyMan}
                      onChange={(e) => setCompanyMan(e.target.value)}
                      placeholder="Nom du Company Man"
                    />
                  </div>

                  <div>
                    <Label htmlFor="omaaDelegate" className="text-xs">
                      Délégué OMAA
                    </Label>
                    <Input
                      id="omaaDelegate"
                      className="h-8 text-xs"
                      value={omaaDelegate}
                      onChange={(e) => setOmaaDelegate(e.target.value)}
                      placeholder="Nom du délégué"
                    />
                  </div>

                  <div>
                    <Label htmlFor="subcontractorName" className="text-xs">
                      Sous-traitant
                    </Label>
                    <Input
                      id="subcontractorName"
                      className="h-8 text-xs"
                      value={subcontractorName}
                      onChange={(e) => setSubcontractorName(e.target.value)}
                      placeholder="Nom du sous-traitant"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Section 3: Conformité */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Contrôles de Conformité</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex items-center justify-between rounded-md border p-2">
                    <Label htmlFor="hasInventory" className="text-xs cursor-pointer">
                      Inventaire présent
                    </Label>
                    <Switch
                      id="hasInventory"
                      checked={hasInventory}
                      onCheckedChange={setHasInventory}
                    />
                  </div>

                  <div className="flex items-center justify-between rounded-md border p-2">
                    <Label htmlFor="hasExitPass" className="text-xs cursor-pointer">
                      Laissez-passer présent
                    </Label>
                    <Switch
                      id="hasExitPass"
                      checked={hasExitPass}
                      onCheckedChange={setHasExitPass}
                    />
                  </div>

                  <div className="flex items-center justify-between rounded-md border p-2">
                    <Label htmlFor="markedBins" className="text-xs cursor-pointer">
                      Bacs marqués
                    </Label>
                    <Switch id="markedBins" checked={markedBins} onCheckedChange={setMarkedBins} />
                  </div>

                  <div className="flex items-center justify-between rounded-md border p-2">
                    <Label htmlFor="hasScrapMention" className="text-xs cursor-pointer">
                      Mention "À rebuter"
                    </Label>
                    <Switch
                      id="hasScrapMention"
                      checked={hasScrapMention}
                      onCheckedChange={setHasScrapMention}
                    />
                  </div>

                  <div className="flex items-center justify-between rounded-md border p-2">
                    <Label htmlFor="hasYardStorageMention" className="text-xs cursor-pointer">
                      Mention "Stockage Yard"
                    </Label>
                    <Switch
                      id="hasYardStorageMention"
                      checked={hasYardStorageMention}
                      onCheckedChange={setHasYardStorageMention}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Section 4: Destination */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Destination</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label htmlFor="destinationService" className="text-xs">
                      Service Destinataire
                    </Label>
                    <Input
                      id="destinationService"
                      className="h-8 text-xs"
                      value={destinationService}
                      onChange={(e) => setDestinationService(e.target.value)}
                      placeholder="Service"
                    />
                  </div>

                  <div>
                    <Label htmlFor="destinationArea" className="text-xs">
                      Zone de Destination
                    </Label>
                    <Select
                      value={destinationArea}
                      onValueChange={(val) => setDestinationArea(val as DestinationAreaEnum)}
                    >
                      <SelectTrigger id="destinationArea" className="h-8 text-xs">
                        <SelectValue placeholder="Sélectionner la zone" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Magasin">Magasin</SelectItem>
                        <SelectItem value="Zone déchets">Zone déchets</SelectItem>
                        <SelectItem value="Zone ferraille">Zone ferraille</SelectItem>
                        <SelectItem value="Yard">Yard</SelectItem>
                        <SelectItem value="Sous-traitant">Sous-traitant</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label htmlFor="storageReason" className="text-xs">
                      Raison de Stockage
                    </Label>
                    <Input
                      id="storageReason"
                      className="h-8 text-xs"
                      value={storageReason}
                      onChange={(e) => setStorageReason(e.target.value)}
                      placeholder="Raison"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Section 5: Articles */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-sm">Articles</CardTitle>
                <Button size="sm" variant="outline" onClick={addItem} className="h-7 text-xs">
                  <Plus className="h-3 w-3 mr-1" />
                  Ajouter
                </Button>
              </CardHeader>
              <CardContent className="space-y-2">
                {items.map((item, index) => (
                  <div key={index} className="border rounded-md p-3 space-y-2">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold">Article {index + 1}</span>
                      {items.length > 1 && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => removeItem(index)}
                          className="h-6 w-6 p-0"
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      )}
                    </div>

                    <div className="grid grid-cols-4 gap-2">
                      <div>
                        <Label className="text-[10px]">N° Article *</Label>
                        <Input
                          className="h-7 text-xs"
                          value={item.item_number}
                          onChange={(e) => updateItem(index, "item_number", e.target.value)}
                          placeholder="N° Article"
                        />
                      </div>

                      <div>
                        <Label className="text-[10px]">Conditionnement *</Label>
                        <Select
                          value={item.packaging}
                          onValueChange={(val) => updateItem(index, "packaging", val)}
                        >
                          <SelectTrigger className="h-7 text-xs">
                            <SelectValue placeholder="Type" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Conteneur">Conteneur</SelectItem>
                            <SelectItem value="Porte-futs">Porte-futs</SelectItem>
                            <SelectItem value="Skid">Skid</SelectItem>
                            <SelectItem value="Rack gaz">Rack gaz</SelectItem>
                            <SelectItem value="Tool box">Tool box</SelectItem>
                            <SelectItem value="Panier">Panier</SelectItem>
                            <SelectItem value="Caisson">Caisson</SelectItem>
                            <SelectItem value="Porte-cuves">Porte-cuves</SelectItem>
                            <SelectItem value="Bac déchet">Bac déchet</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div>
                        <Label className="text-[10px]">Quantité *</Label>
                        <Input
                          type="number"
                          className="h-7 text-xs"
                          value={item.quantity}
                          onChange={(e) => updateItem(index, "quantity", parseInt(e.target.value) || 0)}
                          min="1"
                        />
                      </div>

                      <div>
                        <Label className="text-[10px]">Poids (kg) *</Label>
                        <Input
                          type="number"
                          className="h-7 text-xs"
                          value={item.weight}
                          onChange={(e) => updateItem(index, "weight", parseFloat(e.target.value) || 0)}
                          min="0"
                          step="0.1"
                        />
                      </div>

                      <div className="col-span-4">
                        <Label className="text-[10px]">Désignation *</Label>
                        <Input
                          className="h-7 text-xs"
                          value={item.designation}
                          onChange={(e) => updateItem(index, "designation", e.target.value)}
                          placeholder="Description de l'article"
                        />
                      </div>

                      <div className="col-span-4">
                        <Label className="text-[10px]">Observations</Label>
                        <Textarea
                          className="text-xs min-h-[50px]"
                          value={item.observations || ""}
                          onChange={(e) => updateItem(index, "observations", e.target.value)}
                          placeholder="Observations..."
                        />
                      </div>
                    </div>
                  </div>
                ))}

                <div className="flex items-center gap-4 pt-2 border-t">
                  <div className="flex items-center gap-2 text-xs">
                    <Package className="h-3 w-3 text-muted-foreground" />
                    <span className="font-semibold">{totalPackages}</span> colis
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="font-semibold">{totalWeight.toFixed(1)}</span> kg
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Section 6: Notes */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Notes & Observations</CardTitle>
              </CardHeader>
              <CardContent>
                <Textarea
                  className="text-xs"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Notes additionnelles..."
                  rows={3}
                />
              </CardContent>
            </Card>
          </div>
        </div>

        <DrawerFooter className="border-t">
          <div className="flex gap-2 max-w-5xl mx-auto w-full">
            <Button variant="outline" onClick={() => setOpen(false)} className="flex-1">
              Annuler
            </Button>
            <Button onClick={handleSave} disabled={loading} className="flex-1">
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Création...
                </>
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" />
                  Créer le Retour Site
                </>
              )}
            </Button>
          </div>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}
