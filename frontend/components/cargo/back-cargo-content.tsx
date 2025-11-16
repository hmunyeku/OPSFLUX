"use client"

import { useEffect, useState } from "react"
import { useHeaderContext } from "@/components/header-context"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import {
  PackageOpen,
  Filter,
  MoreVertical,
  Ship,
  Package,
  Weight,
  MapPin,
  AlertTriangle,
  CheckCircle2,
  Trash2,
  Recycle,
  Archive,
  FileCheck,
  Eye,
  Edit,
  Plus,
} from "lucide-react"
import { mockBackCargos, type BackCargo, type BackCargoType } from "@/lib/cargo-data"

const typeConfig: Record<BackCargoType, { label: string; icon: any; color: string }> = {
  "Déchets DIS": { label: "DIS", icon: AlertTriangle, color: "bg-red-500" },
  "Déchets DIB": { label: "DIB", icon: Trash2, color: "bg-orange-500" },
  "Déchets DMET": { label: "DMET", icon: Trash2, color: "bg-yellow-500" },
  "Matériel sous-traitant": { label: "Sous-traitant", icon: Package, color: "bg-blue-500" },
  "Réintégration stock": { label: "Réintégration", icon: Archive, color: "bg-green-500" },
  "À rebuter": { label: "Rebut", icon: Trash2, color: "bg-gray-500" },
  "À ferrailler": { label: "Ferraille", icon: Recycle, color: "bg-slate-500" },
  "Stockage Yard": { label: "Stockage", icon: Archive, color: "bg-purple-500" },
}

export function BackCargoContent() {
  const { setContextualHeader, clearContextualHeader } = useHeaderContext()
  const [backCargos] = useState<BackCargo[]>(mockBackCargos)
  const [searchQuery, setSearchQuery] = useState("")
  const [showNewDialog, setShowNewDialog] = useState(false)

  useEffect(() => {
    setContextualHeader({
      searchPlaceholder: "Rechercher par n° back cargo, site, navire...",
      onSearchChange: setSearchQuery,
      contextualButtons: [
        {
          label: "Nouveau Retour",
          icon: Plus,
          onClick: () => setShowNewDialog(true),
          variant: "default",
        },
      ],
    })

    return () => clearContextualHeader()
  }, [setContextualHeader, clearContextualHeader])

  const filteredBackCargos = backCargos.filter(
    (bc) =>
      bc.backCargoNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      bc.originSite.toLowerCase().includes(searchQuery.toLowerCase()) ||
      bc.vessel.toLowerCase().includes(searchQuery.toLowerCase()),
  )

  const stats = {
    total: backCargos.length,
    dechets: backCargos.filter((bc) => bc.type.includes("Déchets")).length,
    sousTraitant: backCargos.filter((bc) => bc.type === "Matériel sous-traitant").length,
    reintegration: backCargos.filter((bc) => bc.type === "Réintégration stock").length,
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b bg-background p-3">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold">Retours Site (Back Cargo)</h1>
            <p className="text-[10px] text-muted-foreground">
              Gestion des retours matériel et déchets depuis les sites
            </p>
          </div>
        </div>

        {/* Stats */}
        <div className="mt-3 grid grid-cols-4 gap-2 md:grid-cols-4">
          <Card className="p-2">
            <div className="flex items-center gap-2">
              <PackageOpen className="h-4 w-4 text-blue-500" />
              <div>
                <p className="text-[10px] text-muted-foreground">Total</p>
                <p className="text-sm font-semibold">{stats.total}</p>
              </div>
            </div>
          </Card>
          <Card className="p-2">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-red-500" />
              <div>
                <p className="text-[10px] text-muted-foreground">Déchets</p>
                <p className="text-sm font-semibold">{stats.dechets}</p>
              </div>
            </div>
          </Card>
          <Card className="p-2">
            <div className="flex items-center gap-2">
              <Package className="h-4 w-4 text-blue-500" />
              <div>
                <p className="text-[10px] text-muted-foreground">Sous-traitant</p>
                <p className="text-sm font-semibold">{stats.sousTraitant}</p>
              </div>
            </div>
          </Card>
          <Card className="p-2">
            <div className="flex items-center gap-2">
              <Archive className="h-4 w-4 text-green-500" />
              <div>
                <p className="text-[10px] text-muted-foreground">Réintégration</p>
                <p className="text-sm font-semibold">{stats.reintegration}</p>
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
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-3">
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filteredBackCargos.map((backCargo) => {
            const TypeIcon = typeConfig[backCargo.type].icon
            return (
              <Card key={backCargo.id} className="p-2 hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <div
                      className={`flex h-8 w-8 items-center justify-center rounded ${typeConfig[backCargo.type].color}/10`}
                    >
                      <TypeIcon className={`h-4 w-4 ${typeConfig[backCargo.type].color.replace("bg-", "text-")}`} />
                    </div>
                    <div>
                      <p className="text-[11px] font-semibold">{backCargo.backCargoNumber}</p>
                      <p className="text-[9px] text-muted-foreground">{backCargo.arrivalDate}</p>
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
                        <FileCheck className="mr-2 h-3 w-3" />
                        Valider
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                <div className="mt-2 space-y-1">
                  <Badge
                    variant="secondary"
                    className={`h-4 text-[9px] ${typeConfig[backCargo.type].color} text-white`}
                  >
                    {typeConfig[backCargo.type].label}
                  </Badge>

                  <div className="flex items-center gap-1 text-[10px]">
                    <MapPin className="h-3 w-3 text-muted-foreground" />
                    <span className="font-medium">{backCargo.originSite}</span>
                  </div>

                  <div className="flex items-center gap-1 text-[10px]">
                    <Ship className="h-3 w-3 text-muted-foreground" />
                    <span>{backCargo.vessel}</span>
                  </div>

                  <div className="mt-2 flex items-center justify-between border-t pt-1.5">
                    <div className="flex items-center gap-1 text-[10px]">
                      <Package className="h-3 w-3 text-muted-foreground" />
                      <span className="font-medium">{backCargo.totalPackages}</span>
                      <span className="text-muted-foreground">colis</span>
                    </div>
                    <div className="flex items-center gap-1 text-[10px]">
                      <Weight className="h-3 w-3 text-muted-foreground" />
                      <span className="font-medium">{backCargo.totalWeight}</span>
                      <span className="text-muted-foreground">kg</span>
                    </div>
                  </div>

                  {/* Compliance indicators */}
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {backCargo.hasInventory && (
                      <div className="flex items-center gap-0.5 text-[9px] text-green-600">
                        <CheckCircle2 className="h-2.5 w-2.5" />
                        <span>Inventaire</span>
                      </div>
                    )}
                    {backCargo.hasExitPass && (
                      <div className="flex items-center gap-0.5 text-[9px] text-green-600">
                        <CheckCircle2 className="h-2.5 w-2.5" />
                        <span>Laissez-passer</span>
                      </div>
                    )}
                    {backCargo.markedBins && (
                      <div className="flex items-center gap-0.5 text-[9px] text-green-600">
                        <CheckCircle2 className="h-2.5 w-2.5" />
                        <span>Marqué</span>
                      </div>
                    )}
                  </div>

                  {/* Discrepancies */}
                  {backCargo.discrepancies && backCargo.discrepancies.length > 0 && (
                    <div className="mt-1.5 rounded bg-yellow-500/10 p-1.5">
                      <div className="flex items-start gap-1">
                        <AlertTriangle className="h-3 w-3 text-yellow-600 mt-0.5" />
                        <div className="text-[9px] text-yellow-700">
                          {backCargo.discrepancies.map((d, i) => (
                            <p key={i}>{d}</p>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </Card>
            )
          })}
        </div>
      </div>
    </div>
  )
}
