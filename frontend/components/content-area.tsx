"use client"

import * as React from "react"
import { Grid, List, Filter, RefreshCw, Download, Plus, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { DataGrid } from "./data-grid"
import { DataList } from "./data-list"
import { SkeletonGrid } from "./skeleton-grid"
import { SkeletonList } from "./skeleton-list"
import { EmptyState } from "./empty-state"
import { useFilters } from "./filter-context"
import { mockShipments } from "@/lib/mock-data"

export function ContentArea() {
  const [viewMode, setViewMode] = React.useState<"grid" | "list">("grid")
  const { filters, removeFilter, clearFilters } = useFilters()
  const [isLoading, setIsLoading] = React.useState(false)
  const [isEmpty, setIsEmpty] = React.useState(false)

  const handleRefresh = () => {
    setIsLoading(true)
    setTimeout(() => setIsLoading(false), 1500)
  }

  React.useEffect(() => {
    const handleToggleView = () => {
      setViewMode((prev) => (prev === "grid" ? "list" : "grid"))
    }

    const handleRefreshEvent = () => {
      handleRefresh()
    }

    window.addEventListener("toggleView", handleToggleView)
    window.addEventListener("refresh", handleRefreshEvent)

    return () => {
      window.removeEventListener("toggleView", handleToggleView)
      window.removeEventListener("refresh", handleRefreshEvent)
    }
  }, [])

  const filteredCount = mockShipments.length

  return (
    <div className="container max-w-[1600px] mx-auto p-6">
      {/* Page Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h1 className="text-2xl font-bold">Expéditions</h1>
            <p className="text-sm text-muted-foreground">Gérez et suivez toutes vos expéditions en temps réel</p>
          </div>
          <div className="flex items-center gap-2">
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Nouvelle Expédition
            </Button>
            <Button variant="outline">
              <Download className="h-4 w-4 mr-2" />
              Exporter
            </Button>
          </div>
        </div>

        {/* Toolbar */}
        <div className="flex items-center justify-between mt-4">
          <div className="flex items-center gap-2">
            <div className="flex items-center border rounded-lg">
              <Button
                variant={viewMode === "grid" ? "secondary" : "ghost"}
                size="icon"
                className="h-8 w-8 rounded-r-none"
                onClick={() => setViewMode("grid")}
                title="Vue Grille (Ctrl+G)"
              >
                <Grid className="h-4 w-4" />
              </Button>
              <Button
                variant={viewMode === "list" ? "secondary" : "ghost"}
                size="icon"
                className="h-8 w-8 rounded-l-none"
                onClick={() => setViewMode("list")}
                title="Vue Liste (Ctrl+G)"
              >
                <List className="h-4 w-4" />
              </Button>
            </div>
            <Button variant="outline" size="sm">
              <Filter className="h-4 w-4 mr-2" />
              Filtres
              {filters.length > 0 && (
                <Badge variant="secondary" className="ml-2 h-5 px-1.5 text-[10px]">
                  {filters.length}
                </Badge>
              )}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={isLoading}
              title="Actualiser (Ctrl+R)"
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
              Actualiser
            </Button>
          </div>
        </div>

        {/* Active Filters */}
        {filters.length > 0 && (
          <div className="flex items-center gap-2 mt-3 flex-wrap">
            <span className="text-sm text-muted-foreground">Filtres actifs:</span>
            {filters.map((filter, index) => (
              <Badge
                key={index}
                variant="secondary"
                className="gap-1 pr-1 cursor-pointer hover:bg-secondary/80 transition-colors"
              >
                <span className="text-xs">
                  {filter.label}: {filter.value}
                </span>
                <button
                  onClick={() => removeFilter(index)}
                  className="ml-1 rounded-full hover:bg-background/50 p-0.5 transition-colors"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
            <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={clearFilters}>
              Effacer tout
            </Button>
            <span className="ml-auto text-sm">
              <strong>{filteredCount}</strong> résultats
            </span>
          </div>
        )}
      </div>

      {/* Content */}
      {isLoading ? (
        viewMode === "grid" ? (
          <SkeletonGrid />
        ) : (
          <SkeletonList />
        )
      ) : isEmpty ? (
        <EmptyState
          title="Aucune expédition"
          description="Vous n'avez pas encore créé d'expédition. Commencez par créer votre première expédition."
          actionLabel="Créer une expédition"
          onAction={() => console.log("[v0] Create shipment")}
        />
      ) : viewMode === "grid" ? (
        <DataGrid />
      ) : (
        <DataList />
      )}
    </div>
  )
}
