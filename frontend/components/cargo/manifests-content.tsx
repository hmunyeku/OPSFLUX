"use client"

import { useEffect, useState } from "react"
import { useHeaderContext } from "@/components/header-context"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import {
  FileText,
  Filter,
  MoreVertical,
  Ship,
  Package,
  Weight,
  Calendar,
  MapPin,
  User,
  CheckCircle2,
  Clock,
  Eye,
  Edit,
  Trash2,
  Download,
  Send,
  Plus,
} from "lucide-react"
import { mockManifests, type LoadingManifest, type ManifestStatus } from "@/lib/cargo-data"

const statusConfig: Record<ManifestStatus, { label: string; color: string }> = {
  Brouillon: { label: "Brouillon", color: "bg-gray-500" },
  "En attente validation": { label: "En attente", color: "bg-yellow-500" },
  Validé: { label: "Validé", color: "bg-green-500" },
  Chargé: { label: "Chargé", color: "bg-blue-500" },
  "En transit": { label: "En transit", color: "bg-purple-500" },
  Livré: { label: "Livré", color: "bg-emerald-500" },
  Annulé: { label: "Annulé", color: "bg-red-500" },
}

export function ManifestsContent() {
  const { setContextualHeader, clearContextualHeader } = useHeaderContext()
  const [manifests] = useState<LoadingManifest[]>(mockManifests)
  const [searchQuery, setSearchQuery] = useState("")
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid")
  const [showNewDialog, setShowNewDialog] = useState(false)

  useEffect(() => {
    setContextualHeader({
      searchPlaceholder: "Rechercher par n° manifeste, destination, navire...",
      onSearchChange: setSearchQuery,
      contextualButtons: [
        {
          label: "Nouveau Manifeste",
          icon: Plus,
          onClick: () => setShowNewDialog(true),
          variant: "default",
        },
      ],
    })

    return () => clearContextualHeader()
  }, [setContextualHeader, clearContextualHeader])

  const filteredManifests = manifests.filter(
    (m) =>
      m.manifestNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.destination.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.vessel.toLowerCase().includes(searchQuery.toLowerCase()),
  )

  const stats = {
    total: manifests.length,
    enAttente: manifests.filter((m) => m.status === "En attente validation").length,
    enTransit: manifests.filter((m) => m.status === "En transit").length,
    livres: manifests.filter((m) => m.status === "Livré").length,
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b bg-background p-3">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold">Manifestes de Chargement</h1>
            <p className="text-[10px] text-muted-foreground">Gestion des bordereaux d'expédition bateau</p>
          </div>
        </div>

        {/* Stats */}
        <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
          <Card className="p-2">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-blue-500" />
              <div>
                <p className="text-[10px] text-muted-foreground">Total</p>
                <p className="text-sm font-semibold">{stats.total}</p>
              </div>
            </div>
          </Card>
          <Card className="p-2">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-yellow-500" />
              <div>
                <p className="text-[10px] text-muted-foreground">En attente</p>
                <p className="text-sm font-semibold">{stats.enAttente}</p>
              </div>
            </div>
          </Card>
          <Card className="p-2">
            <div className="flex items-center gap-2">
              <Ship className="h-4 w-4 text-purple-500" />
              <div>
                <p className="text-[10px] text-muted-foreground">En transit</p>
                <p className="text-sm font-semibold">{stats.enTransit}</p>
              </div>
            </div>
          </Card>
          <Card className="p-2">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-500" />
              <div>
                <p className="text-[10px] text-muted-foreground">Livrés</p>
                <p className="text-sm font-semibold">{stats.livres}</p>
              </div>
            </div>
          </Card>
        </div>

        {/* Toolbar */}
        <div className="mt-3 flex items-center gap-2">
          <Button variant="outline" size="sm" className="h-7 text-[11px] bg-transparent">
            <Filter className="mr-1 h-3 w-3" />
            Filtres
          </Button>
          <div className="flex gap-1 ml-auto">
            <Button
              variant={viewMode === "grid" ? "default" : "outline"}
              size="sm"
              className="h-7 w-7 p-0"
              onClick={() => setViewMode("grid")}
            >
              <Package className="h-3 w-3" />
            </Button>
            <Button
              variant={viewMode === "list" ? "default" : "outline"}
              size="sm"
              className="h-7 w-7 p-0"
              onClick={() => setViewMode("list")}
            >
              <FileText className="h-3 w-3" />
            </Button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-3">
        {viewMode === "grid" ? (
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filteredManifests.map((manifest) => (
              <Card key={manifest.id} className="p-2 hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded bg-blue-500/10">
                      <FileText className="h-4 w-4 text-blue-500" />
                    </div>
                    <div>
                      <p className="text-[11px] font-semibold">{manifest.manifestNumber}</p>
                      <p className="text-[9px] text-muted-foreground">{manifest.emitterDate}</p>
                    </div>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                        <MoreVertical className="h-3 w-3" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="text-[11px]">
                      <DropdownMenuItem>
                        <Eye className="mr-2 h-3 w-3" />
                        Voir détails
                      </DropdownMenuItem>
                      <DropdownMenuItem>
                        <Edit className="mr-2 h-3 w-3" />
                        Modifier
                      </DropdownMenuItem>
                      <DropdownMenuItem>
                        <Download className="mr-2 h-3 w-3" />
                        Télécharger PDF
                      </DropdownMenuItem>
                      <DropdownMenuItem>
                        <Send className="mr-2 h-3 w-3" />
                        Envoyer
                      </DropdownMenuItem>
                      <DropdownMenuItem className="text-red-600">
                        <Trash2 className="mr-2 h-3 w-3" />
                        Supprimer
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                <div className="mt-2 space-y-1">
                  <div className="flex items-center gap-1.5">
                    <Badge
                      variant="secondary"
                      className={`h-4 text-[9px] ${statusConfig[manifest.status].color} text-white`}
                    >
                      {statusConfig[manifest.status].label}
                    </Badge>
                  </div>

                  <div className="flex items-center gap-1 text-[10px]">
                    <Ship className="h-3 w-3 text-muted-foreground" />
                    <span className="font-medium">{manifest.vessel}</span>
                  </div>

                  <div className="flex items-center gap-1 text-[10px]">
                    <MapPin className="h-3 w-3 text-muted-foreground" />
                    <span>{manifest.pickupLocation}</span>
                    <span className="text-muted-foreground">→</span>
                    <span className="font-medium">{manifest.destination}</span>
                  </div>

                  <div className="flex items-center gap-1 text-[10px]">
                    <Calendar className="h-3 w-3 text-muted-foreground" />
                    <span>Livraison: {manifest.requestedDeliveryDate}</span>
                  </div>

                  <div className="flex items-center gap-1 text-[10px]">
                    <User className="h-3 w-3 text-muted-foreground" />
                    <span>{manifest.recipientName || manifest.service}</span>
                  </div>

                  <div className="mt-2 flex items-center justify-between border-t pt-1.5">
                    <div className="flex items-center gap-1 text-[10px]">
                      <Package className="h-3 w-3 text-muted-foreground" />
                      <span className="font-medium">{manifest.totalPackages}</span>
                      <span className="text-muted-foreground">colis</span>
                    </div>
                    <div className="flex items-center gap-1 text-[10px]">
                      <Weight className="h-3 w-3 text-muted-foreground" />
                      <span className="font-medium">{manifest.totalWeight}</span>
                      <span className="text-muted-foreground">kg</span>
                    </div>
                  </div>

                  {/* Validation status */}
                  <div className="mt-1.5 flex gap-1">
                    {manifest.loadingValidation?.status === "Validé" && (
                      <div className="flex items-center gap-0.5 text-[9px] text-green-600">
                        <CheckCircle2 className="h-2.5 w-2.5" />
                        <span>Chargement</span>
                      </div>
                    )}
                    {manifest.vesselValidation?.status === "Validé" && (
                      <div className="flex items-center gap-0.5 text-[9px] text-green-600">
                        <CheckCircle2 className="h-2.5 w-2.5" />
                        <span>Navire</span>
                      </div>
                    )}
                    {manifest.unloadingValidation?.status === "Validé" && (
                      <div className="flex items-center gap-0.5 text-[9px] text-green-600">
                        <CheckCircle2 className="h-2.5 w-2.5" />
                        <span>Déchargement</span>
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <div className="space-y-1">
            {filteredManifests.map((manifest) => (
              <Card key={manifest.id} className="p-2 hover:bg-accent/50 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="flex h-7 w-7 items-center justify-center rounded bg-blue-500/10">
                    <FileText className="h-3.5 w-3.5 text-blue-500" />
                  </div>

                  <div className="flex-1 grid grid-cols-8 gap-2 text-[10px]">
                    <div>
                      <p className="font-semibold">{manifest.manifestNumber}</p>
                      <p className="text-[9px] text-muted-foreground">{manifest.emitterDate}</p>
                    </div>

                    <div>
                      <Badge
                        variant="secondary"
                        className={`h-4 text-[9px] ${statusConfig[manifest.status].color} text-white`}
                      >
                        {statusConfig[manifest.status].label}
                      </Badge>
                    </div>

                    <div>
                      <p className="font-medium">{manifest.vessel}</p>
                      <p className="text-[9px] text-muted-foreground">Navire</p>
                    </div>

                    <div>
                      <p className="font-medium">{manifest.destination}</p>
                      <p className="text-[9px] text-muted-foreground">Destination</p>
                    </div>

                    <div>
                      <p className="font-medium">{manifest.recipientName || manifest.service}</p>
                      <p className="text-[9px] text-muted-foreground">Destinataire</p>
                    </div>

                    <div>
                      <p className="font-medium">{manifest.requestedDeliveryDate}</p>
                      <p className="text-[9px] text-muted-foreground">Livraison</p>
                    </div>

                    <div>
                      <p className="font-medium">{manifest.totalPackages} colis</p>
                      <p className="text-[9px] text-muted-foreground">{manifest.totalWeight} kg</p>
                    </div>

                    <div className="flex items-center gap-1">
                      {manifest.loadingValidation?.status === "Validé" && (
                        <CheckCircle2 className="h-3 w-3 text-green-600" title="Chargement validé" />
                      )}
                      {manifest.vesselValidation?.status === "Validé" && (
                        <Ship className="h-3 w-3 text-green-600" title="Navire validé" />
                      )}
                      {manifest.unloadingValidation?.status === "Validé" && (
                        <Package className="h-3 w-3 text-green-600" title="Déchargement validé" />
                      )}
                    </div>
                  </div>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                        <MoreVertical className="h-3 w-3" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="text-[11px]">
                      <DropdownMenuItem>
                        <Eye className="mr-2 h-3 w-3" />
                        Voir détails
                      </DropdownMenuItem>
                      <DropdownMenuItem>
                        <Edit className="mr-2 h-3 w-3" />
                        Modifier
                      </DropdownMenuItem>
                      <DropdownMenuItem>
                        <Download className="mr-2 h-3 w-3" />
                        Télécharger PDF
                      </DropdownMenuItem>
                      <DropdownMenuItem>
                        <Send className="mr-2 h-3 w-3" />
                        Envoyer
                      </DropdownMenuItem>
                      <DropdownMenuItem className="text-red-600">
                        <Trash2 className="mr-2 h-3 w-3" />
                        Supprimer
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
