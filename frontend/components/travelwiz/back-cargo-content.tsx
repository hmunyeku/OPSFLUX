"use client"

import * as React from "react"
import { Filter, AlertTriangle, CheckCircle2, XCircle, Package, Trash2, Plus, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { travelwizAPI } from "@/api/travelwiz"
import { BackCargoTypeEnum, type BackCargoManifestPublic } from "@/types/travelwiz"
import { useHeaderContext } from "@/components/header-context"
import { useToast } from "@/hooks/use-toast"
import { CreateBackCargoDrawer } from "./manifests/create-back-cargo-drawer"
import { usePermissions } from "@/lib/permissions-context"

export function BackCargoContent() {
  const { setContextualHeader, clearContextualHeader } = useHeaderContext()
  const { toast } = useToast()
  const { hasPermission } = usePermissions()
  const [searchQuery, setSearchQuery] = React.useState("")
  const [typeFilter, setTypeFilter] = React.useState<string>("all")
  const [manifests, setManifests] = React.useState<BackCargoManifestPublic[]>([])
  const [loading, setLoading] = React.useState(true)
  const [showNewDialog, setShowNewDialog] = React.useState(false)

  // Fetch back cargo manifests from API
  const fetchManifests = React.useCallback(async () => {
    try {
      setLoading(true)
      const response = await travelwizAPI.getBackCargoManifests({
        limit: 100,
        type: typeFilter !== "all" ? (typeFilter as BackCargoTypeEnum) : undefined,
      })
      setManifests(response.data)
    } catch (error) {
      console.error("Error fetching back cargo:", error)
      toast({
        title: "Erreur",
        description: "Impossible de charger les retours site",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }, [typeFilter, toast])

  React.useEffect(() => {
    fetchManifests()
  }, [fetchManifests])

  React.useEffect(() => {
    const buttons = []

    // Only add "Nouveau Retour" button if user has permission
    if (hasPermission("travelwiz_back_cargo", "create")) {
      buttons.push({
        label: "Nouveau Retour",
        icon: Plus,
        onClick: () => setShowNewDialog(true),
        variant: "default" as const,
      })
    }

    setContextualHeader({
      searchPlaceholder: "Rechercher par N° back cargo, type, origine...",
      onSearchChange: setSearchQuery,
      contextualButtons: buttons,
    })

    return () => clearContextualHeader()
  }, [setContextualHeader, clearContextualHeader, hasPermission])

  const filteredManifests = manifests.filter((manifest) => {
    const matchesSearch =
      manifest.back_cargo_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
      manifest.type.toLowerCase().includes(searchQuery.toLowerCase()) ||
      manifest.origin_site.toLowerCase().includes(searchQuery.toLowerCase())
    return matchesSearch
  })

  const stats = {
    total: manifests.length,
    waste: manifests.filter((m) =>
      m.type === BackCargoTypeEnum.DECHETS_DIS ||
      m.type === BackCargoTypeEnum.DECHETS_DIB ||
      m.type === BackCargoTypeEnum.DECHETS_DMET
    ).length,
    subcontractor: manifests.filter((m) => m.type === BackCargoTypeEnum.MATERIEL_SOUS_TRAITANT).length,
    reintegration: manifests.filter((m) => m.type === BackCargoTypeEnum.REINTEGRATION_STOCK).length,
    scrap: manifests.filter((m) =>
      m.type === BackCargoTypeEnum.A_REBUTER || m.type === BackCargoTypeEnum.A_FERRAILLER
    ).length,
  }

  const handleManifestCreated = (manifest: BackCargoManifestPublic) => {
    fetchManifests()
    toast({
      title: "Succès",
      description: `Retour site ${manifest.back_cargo_number} créé avec succès`,
    })
  }

  return (
    <>
      <CreateBackCargoDrawer trigger={null} onSuccess={handleManifestCreated} />
      <div className="flex flex-col gap-3 p-3">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
        <Card className="p-2">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-blue-500/10">
              <Package className="h-3.5 w-3.5 text-blue-500" />
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground leading-none">Total Retours</p>
              <p className="text-base font-bold leading-none mt-0.5">{stats.total}</p>
            </div>
          </div>
        </Card>
        <Card className="p-2">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-red-500/10">
              <Trash2 className="h-3.5 w-3.5 text-red-500" />
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground leading-none">Déchets</p>
              <p className="text-base font-bold leading-none mt-0.5">{stats.waste}</p>
            </div>
          </div>
        </Card>
        <Card className="p-2">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-purple-500/10">
              <Package className="h-3.5 w-3.5 text-purple-500" />
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground leading-none">Sous-traitant</p>
              <p className="text-base font-bold leading-none mt-0.5">{stats.subcontractor}</p>
            </div>
          </div>
        </Card>
        <Card className="p-2">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-green-500/10">
              <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground leading-none">Réintégration</p>
              <p className="text-base font-bold leading-none mt-0.5">{stats.reintegration}</p>
            </div>
          </div>
        </Card>
        <Card className="p-2">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-orange-500/10">
              <AlertTriangle className="h-3.5 w-3.5 text-orange-500" />
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground leading-none">Rebut</p>
              <p className="text-base font-bold leading-none mt-0.5">{stats.scrap}</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-2">
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="h-8 w-[160px] text-xs">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les types</SelectItem>
            <SelectItem value="waste-dis">Déchets DIS</SelectItem>
            <SelectItem value="waste-dib">Déchets DIB</SelectItem>
            <SelectItem value="waste-dmet">Déchets DMET</SelectItem>
            <SelectItem value="subcontractor">Sous-traitant</SelectItem>
            <SelectItem value="reintegration">Réintégration</SelectItem>
            <SelectItem value="scrap">Rebut/Ferraille</SelectItem>
            <SelectItem value="yard-storage">Stockage Yard</SelectItem>
          </SelectContent>
        </Select>
        <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs bg-transparent">
          <Filter className="h-3 w-3" />
          Filtres
        </Button>
      </div>

      {/* Back Cargo Grid */}
      <div className="grid grid-cols-1 gap-2 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {loading && (
          <div className="col-span-full flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {!loading && filteredManifests.length === 0 && (
          <div className="col-span-full flex flex-col items-center justify-center py-12">
            <Package className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-sm text-muted-foreground">Aucun retour site trouvé</p>
            <p className="text-xs text-muted-foreground">Créez votre premier retour site</p>
          </div>
        )}

        {!loading && filteredManifests.map((manifest) => (
          <Card key={manifest.id} className="p-2 hover:shadow-md transition-shadow">
            <div className="flex flex-col gap-2">
              {/* Header */}
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-semibold leading-none">{manifest.back_cargo_number}</p>
                  <p className="text-[10px] text-muted-foreground">{manifest.type}</p>
                </div>
                <Badge
                  variant={
                    manifest.type.includes("Déchets")
                      ? "destructive"
                      : manifest.type === "Réintégration stock"
                        ? "default"
                        : "secondary"
                  }
                  className="h-5 text-[9px]"
                >
                  {manifest.type}
                </Badge>
              </div>

              {/* Details */}
              <div className="grid grid-cols-2 gap-1.5 text-[10px]">
                <div>
                  <p className="text-muted-foreground">Origine</p>
                  <p className="font-medium">{manifest.origin_site}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Poids Total</p>
                  <p className="font-medium">{manifest.total_weight.toFixed(0)} kg</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Date Arrivée</p>
                  <p className="font-medium">{new Date(manifest.arrival_date).toLocaleDateString("fr-FR")}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Colis</p>
                  <p className="font-medium">{manifest.total_packages} colis</p>
                </div>
              </div>

              {/* Compliance Indicators */}
              <div className="flex items-center gap-1 text-[9px]">
                {manifest.has_inventory ? (
                  <CheckCircle2 className="h-3 w-3 text-green-500" />
                ) : (
                  <XCircle className="h-3 w-3 text-red-500" />
                )}
                <span className={manifest.has_inventory ? "text-green-600" : "text-red-600"}>Inventaire</span>
                {manifest.has_exit_pass ? (
                  <CheckCircle2 className="h-3 w-3 text-green-500" />
                ) : (
                  <XCircle className="h-3 w-3 text-red-500" />
                )}
                <span className={manifest.has_exit_pass ? "text-green-600" : "text-red-600"}>Laissez-passer</span>
                {manifest.marked_bins ? (
                  <CheckCircle2 className="h-3 w-3 text-green-500" />
                ) : (
                  <XCircle className="h-3 w-3 text-red-500" />
                )}
                <span className={manifest.marked_bins ? "text-green-600" : "text-red-600"}>Marquage</span>
              </div>

              {/* Anomalies */}
              {manifest.discrepancies && manifest.discrepancies.length > 0 && (
                <div className="rounded-md bg-red-50 p-1.5">
                  <div className="flex items-start gap-1">
                    <AlertTriangle className="h-3 w-3 text-red-500 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-[9px] font-medium text-red-700">Anomalies détectées</p>
                      <p className="text-[9px] text-red-600">{manifest.discrepancies.join(", ")}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-1">
                <Button size="sm" variant="outline" className="h-6 flex-1 text-[10px] bg-transparent">
                  Voir Détails
                </Button>
                <Button size="sm" variant="outline" className="h-6 px-2 bg-transparent">
                  <CheckCircle2 className="h-3 w-3" />
                </Button>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
    </>
  )
}
