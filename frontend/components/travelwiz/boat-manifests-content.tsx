"use client"

import * as React from "react"
import { Filter, Download, Ship, CheckCircle2, Clock, AlertCircle, Package, Plus, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { travelwizAPI } from "@/src/api/travelwiz"
import { ManifestStatusEnum, type LoadingManifestPublic } from "@/types/travelwiz"
import { useHeaderContext } from "@/components/header-context"
import { useToast } from "@/hooks/use-toast"
import { CreateLoadingManifestDrawer } from "./manifests/create-loading-manifest-drawer"
import { usePermissions } from "@/lib/permissions-context"

export function BoatManifestsContent() {
  const { setContextualHeader, clearContextualHeader } = useHeaderContext()
  const { toast } = useToast()
  const { hasPermission } = usePermissions()
  const [searchQuery, setSearchQuery] = React.useState("")
  const [statusFilter, setStatusFilter] = React.useState<string>("all")
  const [manifests, setManifests] = React.useState<LoadingManifestPublic[]>([])
  const [loading, setLoading] = React.useState(true)
  const [showNewDialog, setShowNewDialog] = React.useState(false)

  // Fetch manifests from API
  const fetchManifests = React.useCallback(async () => {
    try {
      setLoading(true)
      const response = await travelwizAPI.getLoadingManifests({
        limit: 100,
        status: statusFilter !== "all" ? (statusFilter as ManifestStatusEnum) : undefined,
      })
      setManifests(response.data)
    } catch (error) {
      console.error("Error fetching manifests:", error)
      toast({
        title: "Erreur",
        description: "Impossible de charger les manifestes",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }, [statusFilter]) // eslint-disable-line react-hooks/exhaustive-deps

  React.useEffect(() => {
    fetchManifests()
  }, [fetchManifests])

  React.useEffect(() => {
    const buttons = []

    // Only add "Nouveau Manifeste" button if user has permission
    if (hasPermission("travelwiz_manifests", "create")) {
      buttons.push({
        label: "Nouveau Manifeste",
        icon: Plus,
        onClick: () => setShowNewDialog(true),
        variant: "default" as const,
      })
    }

    setContextualHeader({
      searchPlaceholder: "Rechercher par N° manifeste, navire, destination...",
      onSearchChange: setSearchQuery,
      contextualButtons: buttons,
    })

    return () => clearContextualHeader()
  }, [setContextualHeader, clearContextualHeader, hasPermission])

  const filteredManifests = manifests.filter((manifest) => {
    const matchesSearch =
      manifest.manifest_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
      manifest.vessel.toLowerCase().includes(searchQuery.toLowerCase()) ||
      manifest.destination.toLowerCase().includes(searchQuery.toLowerCase())
    return matchesSearch
  })

  const stats = {
    total: manifests.length,
    pending: manifests.filter((m) =>
      m.status === ManifestStatusEnum.BROUILLON ||
      m.status === ManifestStatusEnum.EN_ATTENTE_VALIDATION
    ).length,
    inProgress: manifests.filter((m) =>
      m.status === ManifestStatusEnum.VALIDE ||
      m.status === ManifestStatusEnum.CHARGE ||
      m.status === ManifestStatusEnum.EN_TRANSIT
    ).length,
    completed: manifests.filter((m) =>
      m.status === ManifestStatusEnum.LIVRE ||
      m.status === ManifestStatusEnum.DECHARGE
    ).length,
  }

  const handleManifestCreated = React.useCallback((manifest: LoadingManifestPublic) => {
    fetchManifests()
    toast({
      title: "Succès",
      description: `Manifeste ${manifest.manifest_number} créé avec succès`,
    })
  }, [fetchManifests, toast])

  return (
    <>
      <CreateLoadingManifestDrawer
        trigger={null}
        onSuccess={handleManifestCreated}
      />
      <div className="flex flex-col gap-3 p-3">
        {/* KPI Cards */}
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <Card className="p-2">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-md bg-blue-500/10">
                <Ship className="h-3.5 w-3.5 text-blue-500" />
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground leading-none">Total Manifestes</p>
                <p className="text-base font-bold leading-none mt-0.5">{loading ? "..." : stats.total}</p>
              </div>
            </div>
          </Card>
          <Card className="p-2">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-md bg-yellow-500/10">
                <Clock className="h-3.5 w-3.5 text-yellow-500" />
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground leading-none">En Attente</p>
                <p className="text-base font-bold leading-none mt-0.5">{loading ? "..." : stats.pending}</p>
              </div>
            </div>
          </Card>
          <Card className="p-2">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-md bg-orange-500/10">
                <AlertCircle className="h-3.5 w-3.5 text-orange-500" />
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground leading-none">En Cours</p>
                <p className="text-base font-bold leading-none mt-0.5">{loading ? "..." : stats.inProgress}</p>
              </div>
            </div>
          </Card>
          <Card className="p-2">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-md bg-green-500/10">
                <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground leading-none">Complétés</p>
                <p className="text-base font-bold leading-none mt-0.5">{loading ? "..." : stats.completed}</p>
              </div>
            </div>
          </Card>
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-8 w-[180px] text-xs">
              <SelectValue placeholder="Statut" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les statuts</SelectItem>
              <SelectItem value={ManifestStatusEnum.BROUILLON}>Brouillon</SelectItem>
              <SelectItem value={ManifestStatusEnum.EN_ATTENTE_VALIDATION}>En attente</SelectItem>
              <SelectItem value={ManifestStatusEnum.VALIDE}>Validé</SelectItem>
              <SelectItem value={ManifestStatusEnum.EN_TRANSIT}>En transit</SelectItem>
              <SelectItem value={ManifestStatusEnum.LIVRE}>Livré</SelectItem>
            </SelectContent>
          </Select>
          <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs bg-transparent">
            <Filter className="h-3 w-3" />
            Filtres
          </Button>
        </div>

        {/* Loading State */}
        {loading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {/* Manifests Grid */}
        {!loading && (
          <div className="grid grid-cols-1 gap-2 lg:grid-cols-2 xl:grid-cols-3">
            {filteredManifests.length === 0 ? (
              <div className="col-span-full flex flex-col items-center justify-center py-12">
                <Ship className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-sm text-muted-foreground">Aucun manifeste trouvé</p>
                <p className="text-xs text-muted-foreground">Créez votre premier manifeste de chargement</p>
              </div>
            ) : (
              filteredManifests.map((manifest) => (
                <Card key={manifest.id} className="p-2 hover:shadow-md transition-shadow">
                  <div className="flex flex-col gap-2">
                    {/* Header */}
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-blue-500/10">
                          <Ship className="h-4 w-4 text-blue-500" />
                        </div>
                        <div>
                          <p className="text-xs font-semibold leading-none">{manifest.manifest_number}</p>
                          <p className="text-[10px] text-muted-foreground">{manifest.vessel}</p>
                        </div>
                      </div>
                      <Badge
                        variant={
                          manifest.status === ManifestStatusEnum.LIVRE ||
                          manifest.status === ManifestStatusEnum.DECHARGE
                            ? "default"
                            : manifest.status === ManifestStatusEnum.EN_TRANSIT ||
                              manifest.status === ManifestStatusEnum.CHARGE
                            ? "secondary"
                            : "outline"
                        }
                        className="h-5 text-[9px]"
                      >
                        {manifest.status}
                      </Badge>
                    </div>

                    {/* Details */}
                    <div className="grid grid-cols-2 gap-1.5 text-[10px]">
                      <div>
                        <p className="text-muted-foreground">Départ</p>
                        <p className="font-medium">{manifest.pickup_location}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Destination</p>
                        <p className="font-medium">{manifest.destination}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Date Disponibilité</p>
                        <p className="font-medium">
                          {new Date(manifest.availability_date).toLocaleDateString("fr-FR")}
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Date Livraison</p>
                        <p className="font-medium">
                          {new Date(manifest.requested_delivery_date).toLocaleDateString("fr-FR")}
                        </p>
                      </div>
                    </div>

                    {/* Items Count */}
                    <div className="flex items-center gap-1.5 rounded-md bg-muted/50 p-1.5">
                      <Package className="h-3 w-3 text-muted-foreground" />
                      <span className="text-[10px] font-medium">{manifest.total_packages} colis</span>
                      <span className="text-[10px] text-muted-foreground">
                        • {manifest.total_weight.toFixed(0)} kg
                      </span>
                    </div>

                    {/* Validation Status */}
                    <div className="flex items-center gap-1 text-[9px]">
                      <CheckCircle2
                        className={`h-3 w-3 ${manifest.loading_validation ? "text-green-500" : "text-gray-300"}`}
                      />
                      <span className={manifest.loading_validation ? "text-green-600" : "text-muted-foreground"}>
                        Chargement
                      </span>
                      <CheckCircle2
                        className={`h-3 w-3 ${manifest.vessel_validation ? "text-green-500" : "text-gray-300"}`}
                      />
                      <span className={manifest.vessel_validation ? "text-green-600" : "text-muted-foreground"}>
                        Navire
                      </span>
                      <CheckCircle2
                        className={`h-3 w-3 ${manifest.unloading_validation ? "text-green-500" : "text-gray-300"}`}
                      />
                      <span className={manifest.unloading_validation ? "text-green-600" : "text-muted-foreground"}>
                        Déchargement
                      </span>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-1">
                      <Button size="sm" variant="outline" className="h-6 flex-1 text-[10px] bg-transparent">
                        Voir Détails
                      </Button>
                      <Button size="sm" variant="outline" className="h-6 px-2 bg-transparent">
                        <Download className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                </Card>
              ))
            )}
          </div>
        )}
      </div>
    </>
  )
}
