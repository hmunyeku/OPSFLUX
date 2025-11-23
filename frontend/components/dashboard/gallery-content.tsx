"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Skeleton } from "@/components/ui/skeleton"
import { useDashboards, useDashboardMutations } from "@/hooks/use-dashboards"
import { Dashboard } from "@/api/dashboards"
import {
  MoreVertical,
  Eye,
  Edit,
  Copy,
  Trash2,
  Share2,
  Lock,
  Star,
  LayoutGrid,
  List,
  Plus,
  Clock,
  FolderOpen,
  ChevronRight,
  Grid3x3,
  AlertCircle,
  RefreshCw,
} from "lucide-react"
import { useHeaderContext } from "@/components/header-context"
import Link from "next/link"
import { cn } from "@/lib/utils"

type FilterTab = "all" | "favorites" | "recent"

// Gradient colors for dashboard cards
const gradients = [
  "from-blue-500/80 to-indigo-600/80",
  "from-violet-500/80 to-purple-600/80",
  "from-emerald-500/80 to-teal-600/80",
  "from-orange-500/80 to-red-500/80",
  "from-pink-500/80 to-rose-600/80",
  "from-cyan-500/80 to-blue-600/80",
]

function getGradient(id: string): string {
  const index = id.charCodeAt(0) % gradients.length
  return gradients[index]
}

// Menu parent labels
const menuParentLabels: Record<string, string> = {
  pilotage: "Pilotage",
  tiers: "Tiers",
  projects: "Projets",
  organizer: "Organiseur",
  redacteur: "Rédacteur",
  pobvue: "POBVue",
  travelwiz: "TravelWiz",
  mocvue: "MOCVue",
  cleanvue: "CleanVue",
  powertrace: "PowerTrace",
}

export function GalleryContent() {
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid")
  const [searchQuery, setSearchQuery] = useState("")
  const [activeTab, setActiveTab] = useState<FilterTab>("all")
  const [favorites, setFavorites] = useState<Set<string>>(new Set())
  const headerContext = useHeaderContext()

  const { dashboards, isLoading, error, refetch } = useDashboards({ search: searchQuery })
  const { toggleFavorite: toggleFavoriteApi, deleteDashboard, cloneDashboard } = useDashboardMutations()

  const handleNewDashboard = useCallback(() => {
    window.location.href = "/new"
  }, [])

  const handleToggleView = useCallback(() => {
    setViewMode((prev) => (prev === "grid" ? "list" : "grid"))
  }, [])

  const toggleFavorite = useCallback(async (id: string) => {
    try {
      const isFavorite = await toggleFavoriteApi(id)
      setFavorites((prev) => {
        const next = new Set(prev)
        if (isFavorite) {
          next.add(id)
        } else {
          next.delete(id)
        }
        return next
      })
    } catch {
      // Toggle locally anyway for better UX
      setFavorites((prev) => {
        const next = new Set(prev)
        if (next.has(id)) {
          next.delete(id)
        } else {
          next.add(id)
        }
        return next
      })
    }
  }, [toggleFavoriteApi])

  const handleDelete = useCallback(async (id: string) => {
    if (!confirm("Supprimer ce dashboard ?")) return
    try {
      await deleteDashboard(id)
      refetch()
    } catch {
      // Error handled in mutation
    }
  }, [deleteDashboard, refetch])

  const handleClone = useCallback(async (dashboard: Dashboard) => {
    const newName = prompt("Nom du nouveau dashboard:", `${dashboard.name} (copie)`)
    if (!newName) return
    try {
      await cloneDashboard(dashboard.id, newName)
      refetch()
    } catch {
      // Error handled in mutation
    }
  }, [cloneDashboard, refetch])

  useEffect(() => {
    headerContext.setContextualHeader({
      searchPlaceholder: "Rechercher des dashboards...",
      searchValue: searchQuery,
      onSearchChange: setSearchQuery,
      contextualButtons: [
        {
          label: "Nouveau",
          icon: Plus,
          onClick: handleNewDashboard,
          variant: "default",
        },
        {
          label: viewMode === "grid" ? "Liste" : "Grille",
          icon: viewMode === "grid" ? List : LayoutGrid,
          onClick: handleToggleView,
          variant: "ghost",
        },
      ],
    })

    return () => {
      headerContext.clearContextualHeader()
    }
  }, [searchQuery, viewMode, handleNewDashboard, handleToggleView])

  // Filter dashboards based on tab
  const filteredDashboards = useMemo(() => {
    let filtered = dashboards

    switch (activeTab) {
      case "favorites":
        filtered = filtered.filter((d) => favorites.has(d.id))
        break
      case "recent":
        filtered = [...filtered].sort((a, b) =>
          new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
        ).slice(0, 6)
        break
    }

    return filtered
  }, [dashboards, activeTab, favorites])

  // Stats
  const stats = useMemo(() => ({
    total: dashboards.length,
    favorites: dashboards.filter((d) => favorites.has(d.id)).length,
    public: dashboards.filter((d) => d.is_public).length,
  }), [dashboards, favorites])

  // Loading skeleton
  if (isLoading) {
    return (
      <TooltipProvider>
        <div className="flex h-full flex-col">
          <div className="bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 border-b">
            <div className="px-6 py-8">
              <Skeleton className="h-8 w-48 mb-2" />
              <Skeleton className="h-4 w-64 mb-6" />
              <div className="grid grid-cols-4 gap-4">
                {[1, 2, 3, 4].map((i) => (
                  <Skeleton key={i} className="h-20" />
                ))}
              </div>
            </div>
          </div>
          <div className="px-6 py-4 border-b">
            <Skeleton className="h-10 w-96" />
          </div>
          <div className="p-6">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <Skeleton key={i} className="h-64" />
              ))}
            </div>
          </div>
        </div>
      </TooltipProvider>
    )
  }

  // Error state
  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4">
        <div className="h-16 w-16 rounded-2xl bg-red-100 dark:bg-red-900/50 flex items-center justify-center">
          <AlertCircle className="h-8 w-8 text-red-600" />
        </div>
        <h3 className="text-lg font-semibold">Erreur de chargement</h3>
        <p className="text-sm text-muted-foreground max-w-sm text-center">{error}</p>
        <Button onClick={() => refetch()} variant="outline" className="gap-2">
          <RefreshCw className="h-4 w-4" />
          Réessayer
        </Button>
      </div>
    )
  }

  return (
    <TooltipProvider>
      <div className="flex h-full flex-col">
        {/* Hero Section */}
        <div className="bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 border-b">
          <div className="px-6 py-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h1 className="text-xl font-bold tracking-tight">Mes Dashboards</h1>
                <p className="text-sm text-muted-foreground">
                  Créez et gérez vos tableaux de bord personnalisés
                </p>
              </div>
              <Button
                onClick={handleNewDashboard}
                size="sm"
                className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-lg shadow-blue-500/25"
              >
                <Plus className="h-4 w-4 mr-2" />
                Nouveau
              </Button>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-3 gap-3">
              <Card className="p-3 bg-white/60 dark:bg-slate-800/60 backdrop-blur border-0 shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-lg bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center">
                    <LayoutGrid className="h-4 w-4 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-xl font-bold">{stats.total}</p>
                    <p className="text-xs text-muted-foreground">Total</p>
                  </div>
                </div>
              </Card>
              <Card className="p-3 bg-white/60 dark:bg-slate-800/60 backdrop-blur border-0 shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-lg bg-amber-100 dark:bg-amber-900/50 flex items-center justify-center">
                    <Star className="h-4 w-4 text-amber-600" />
                  </div>
                  <div>
                    <p className="text-xl font-bold">{stats.favorites}</p>
                    <p className="text-xs text-muted-foreground">Favoris</p>
                  </div>
                </div>
              </Card>
              <Card className="p-3 bg-white/60 dark:bg-slate-800/60 backdrop-blur border-0 shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-lg bg-green-100 dark:bg-green-900/50 flex items-center justify-center">
                    <Share2 className="h-4 w-4 text-green-600" />
                  </div>
                  <div>
                    <p className="text-xl font-bold">{stats.public}</p>
                    <p className="text-xs text-muted-foreground">Publics</p>
                  </div>
                </div>
              </Card>
            </div>
          </div>
        </div>

        {/* Filters Bar */}
        <div className="px-6 py-3 border-b bg-background">
          <div className="flex items-center justify-between">
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as FilterTab)}>
              <TabsList className="bg-muted/50 h-8">
                <TabsTrigger value="all" className="gap-1.5 h-7 text-xs">
                  <LayoutGrid className="h-3.5 w-3.5" />
                  Tous
                </TabsTrigger>
                <TabsTrigger value="favorites" className="gap-1.5 h-7 text-xs">
                  <Star className="h-3.5 w-3.5" />
                  Favoris
                </TabsTrigger>
                <TabsTrigger value="recent" className="gap-1.5 h-7 text-xs">
                  <Clock className="h-3.5 w-3.5" />
                  Récents
                </TabsTrigger>
              </TabsList>
            </Tabs>
            <span className="text-xs text-muted-foreground">
              {filteredDashboards.length} dashboard{filteredDashboards.length !== 1 ? "s" : ""}
            </span>
          </div>
        </div>

        {/* Content */}
        <ScrollArea className="flex-1">
          <div className="p-6">
            {filteredDashboards.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 text-center">
                <div className="h-16 w-16 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-4">
                  <FolderOpen className="h-8 w-8 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-semibold mb-2">Aucun dashboard trouvé</h3>
                <p className="text-sm text-muted-foreground mb-4 max-w-sm">
                  {activeTab === "favorites"
                    ? "Marquez des dashboards comme favoris pour les retrouver ici"
                    : "Créez votre premier dashboard pour commencer"
                  }
                </p>
                {activeTab === "all" && (
                  <Button onClick={handleNewDashboard}>
                    <Plus className="h-4 w-4 mr-2" />
                    Créer un dashboard
                  </Button>
                )}
              </div>
            ) : viewMode === "list" ? (
              <div className="rounded-xl border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="w-[40px]"></TableHead>
                      <TableHead className="w-[300px]">Nom</TableHead>
                      <TableHead>Module</TableHead>
                      <TableHead>Mis à jour</TableHead>
                      <TableHead className="w-[100px]">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredDashboards.map((dashboard) => (
                      <TableRow key={dashboard.id} className="group">
                        <TableCell>
                          <button
                            type="button"
                            onClick={() => toggleFavorite(dashboard.id)}
                            className="p-1 hover:bg-accent rounded"
                            title={favorites.has(dashboard.id) ? "Retirer des favoris" : "Ajouter aux favoris"}
                          >
                            <Star
                              className={cn(
                                "h-4 w-4 transition-colors",
                                favorites.has(dashboard.id)
                                  ? "fill-amber-400 text-amber-400"
                                  : "text-muted-foreground hover:text-amber-400"
                              )}
                            />
                          </button>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-0.5">
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{dashboard.name}</span>
                              {dashboard.is_home_page && (
                                <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
                                  Accueil
                                </Badge>
                              )}
                            </div>
                            {dashboard.description && (
                              <p className="text-xs text-muted-foreground line-clamp-1">
                                {dashboard.description}
                              </p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-[10px]">
                            {menuParentLabels[dashboard.menu_parent] || dashboard.menu_parent}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <span className="text-xs text-muted-foreground">
                            {new Date(dashboard.updated_at).toLocaleDateString("fr-FR")}
                          </span>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" asChild>
                                  <Link href={`/dashboards/${dashboard.id}`}>
                                    <Eye className="h-3.5 w-3.5" />
                                  </Link>
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Voir</TooltipContent>
                            </Tooltip>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                                  <MoreVertical className="h-3.5 w-3.5" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-44">
                                <DropdownMenuItem asChild>
                                  <Link href={`/dashboard/${dashboard.id}/edit`} className="flex cursor-pointer items-center">
                                    <Edit className="mr-2 h-4 w-4" />
                                    Modifier
                                  </Link>
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleClone(dashboard)}>
                                  <Copy className="mr-2 h-4 w-4" />
                                  Dupliquer
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem className="text-destructive" onClick={() => handleDelete(dashboard.id)}>
                                  <Trash2 className="mr-2 h-4 w-4" />
                                  Supprimer
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {filteredDashboards.map((dashboard) => (
                  <DashboardCard
                    key={dashboard.id}
                    dashboard={dashboard}
                    isFavorite={favorites.has(dashboard.id)}
                    onToggleFavorite={() => toggleFavorite(dashboard.id)}
                    onClone={() => handleClone(dashboard)}
                    onDelete={() => handleDelete(dashboard.id)}
                  />
                ))}
              </div>
            )}
          </div>
        </ScrollArea>
      </div>
    </TooltipProvider>
  )
}

interface DashboardCardProps {
  dashboard: Dashboard
  isFavorite: boolean
  onToggleFavorite: () => void
  onClone: () => void
  onDelete: () => void
}

function DashboardCard({ dashboard, isFavorite, onToggleFavorite, onClone, onDelete }: DashboardCardProps) {
  const gradient = getGradient(dashboard.id)

  return (
    <Card className="group relative overflow-hidden transition-all hover:shadow-xl hover:-translate-y-1">
      {/* Header with gradient */}
      <div className={cn("relative h-28 bg-gradient-to-br", gradient)}>
        {/* Module badge */}
        <div className="absolute top-2 left-2">
          <Badge className="h-5 px-1.5 text-[10px] bg-white/90 text-slate-700 hover:bg-white/90">
            {menuParentLabels[dashboard.menu_parent] || dashboard.menu_parent}
          </Badge>
        </div>

        {/* Favorite button */}
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            onToggleFavorite()
          }}
          className="absolute top-2 right-2 p-1.5 rounded-full bg-black/20 hover:bg-black/30 transition-colors"
          title={isFavorite ? "Retirer des favoris" : "Ajouter aux favoris"}
        >
          <Star
            className={cn(
              "h-4 w-4 transition-colors",
              isFavorite ? "fill-amber-400 text-amber-400" : "text-white"
            )}
          />
        </button>

        {/* Home badge */}
        {dashboard.is_home_page && (
          <div className="absolute bottom-2 left-2">
            <Badge className="h-5 gap-1 px-1.5 text-[10px] bg-white/90 text-violet-700 hover:bg-white/90">
              <Lock className="h-3 w-3" />
              Accueil
            </Badge>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-3">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold text-sm truncate">{dashboard.name}</h3>
            {dashboard.description && (
              <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                {dashboard.description}
              </p>
            )}
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <MoreVertical className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem asChild>
                <Link href={`/dashboard/${dashboard.id}/edit`} className="flex cursor-pointer items-center">
                  <Edit className="mr-2 h-4 w-4" />
                  Modifier
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onClone}>
                <Copy className="mr-2 h-4 w-4" />
                Dupliquer
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-destructive" onClick={onDelete}>
                <Trash2 className="mr-2 h-4 w-4" />
                Supprimer
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Meta info */}
        <div className="flex items-center gap-3 text-xs text-muted-foreground mt-2 pt-2 border-t">
          <div className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            <span>{new Date(dashboard.updated_at).toLocaleDateString("fr-FR")}</span>
          </div>
        </div>

        {/* Hover action */}
        <Button
          variant="default"
          size="sm"
          className="w-full mt-3 gap-2 h-8 text-xs opacity-0 group-hover:opacity-100 transition-opacity bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700"
          asChild
        >
          <Link href={`/dashboards/${dashboard.id}`}>
            <Eye className="h-3.5 w-3.5" />
            Ouvrir
            <ChevronRight className="h-3.5 w-3.5 ml-auto" />
          </Link>
        </Button>
      </div>
    </Card>
  )
}
