"use client"

import { useState, useEffect, useCallback } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { mockDashboards } from "@/lib/dashboard-data"
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
  Calendar,
  Plus,
} from "lucide-react"
import { useHeaderContext } from "@/components/header-context"
import Link from "next/link"

export function GalleryContent() {
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid")
  const [searchQuery, setSearchQuery] = useState("")
  const headerContext = useHeaderContext()

  const handleNewDashboard = useCallback(() => {
    window.location.href = "/new"
  }, [])

  const handleToggleView = useCallback(() => {
    setViewMode((prev) => (prev === "grid" ? "list" : "grid"))
  }, [])

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

  const mandatoryDashboards = mockDashboards.filter((d) => d.type === "mandatory")
  const personalDashboards = mockDashboards.filter((d) => d.type === "personal")

  const filteredMandatory = mandatoryDashboards.filter((d) => d.name.toLowerCase().includes(searchQuery.toLowerCase()))
  const filteredPersonal = personalDashboards.filter((d) => d.name.toLowerCase().includes(searchQuery.toLowerCase()))

  const allFiltered = [...filteredMandatory, ...filteredPersonal]

  return (
    <div className="flex h-full flex-col gap-3 p-3">
      {viewMode === "list" ? (
        <div className="flex-1 overflow-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[300px]">Nom</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Widgets</TableHead>
                <TableHead>Créé par</TableHead>
                <TableHead>Mis à jour</TableHead>
                <TableHead className="w-[100px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {allFiltered.map((dashboard) => (
                <TableRow key={dashboard.id} className="group">
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-semibold">{dashboard.name}</span>
                        {dashboard.isDefault && (
                          <Badge variant="secondary" className="h-4 px-1.5 text-[9px]">
                            Défaut
                          </Badge>
                        )}
                      </div>
                      <p className="text-[10px] text-muted-foreground line-clamp-1">{dashboard.description}</p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      {dashboard.type === "mandatory" && (
                        <Badge variant="outline" className="h-4 gap-0.5 px-1.5 text-[9px]">
                          <Lock className="h-2.5 w-2.5" />
                          Oblig.
                        </Badge>
                      )}
                      {dashboard.shared && (
                        <Badge variant="outline" className="h-4 gap-0.5 px-1.5 text-[9px]">
                          <Share2 className="h-2.5 w-2.5" />
                          Partagé
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="text-xs">{dashboard.widgets.length}</span>
                  </TableCell>
                  <TableCell>
                    <span className="text-xs text-muted-foreground">{dashboard.createdBy}</span>
                  </TableCell>
                  <TableCell>
                    <span className="text-xs text-muted-foreground">{dashboard.updatedAt}</span>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0" asChild>
                        <Link href="/">
                          <Eye className="h-3 w-3" />
                        </Link>
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                            <MoreVertical className="h-3 w-3" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-40">
                          <DropdownMenuItem asChild>
                            <Link
                              href={`/dashboard/${dashboard.id}/edit`}
                              className="flex cursor-pointer items-center text-xs"
                            >
                              <Edit className="mr-2 h-3 w-3" />
                              Modifier
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuItem className="text-xs">
                            <Copy className="mr-2 h-3 w-3" />
                            Dupliquer
                          </DropdownMenuItem>
                          <DropdownMenuItem className="text-xs">
                            <Share2 className="mr-2 h-3 w-3" />
                            Partager
                          </DropdownMenuItem>
                          {dashboard.type === "personal" && (
                            <DropdownMenuItem className="text-xs text-destructive">
                              <Trash2 className="mr-2 h-3 w-3" />
                              Supprimer
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {allFiltered.length === 0 && (
            <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
              Aucun dashboard trouvé
            </div>
          )}
        </div>
      ) : (
        <div className="flex-1 overflow-auto">
          <div className="space-y-4">
            {/* Mandatory Dashboards Section */}
            {filteredMandatory.length > 0 && (
              <div>
                <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                  <Lock className="h-3.5 w-3.5" />
                  <span>Dashboards Obligatoires</span>
                  <Badge variant="secondary" className="h-4 px-1.5 text-[9px]">
                    {filteredMandatory.length}
                  </Badge>
                </div>
                <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
                  {filteredMandatory.map((dashboard) => (
                    <DashboardCard key={dashboard.id} dashboard={dashboard} />
                  ))}
                </div>
              </div>
            )}

            {/* Personal Dashboards Section */}
            {filteredPersonal.length > 0 && (
              <div>
                <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                  <Star className="h-3.5 w-3.5" />
                  <span>Dashboards Personnels</span>
                  <Badge variant="secondary" className="h-4 px-1.5 text-[9px]">
                    {filteredPersonal.length}
                  </Badge>
                </div>
                <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
                  {filteredPersonal.map((dashboard) => (
                    <DashboardCard key={dashboard.id} dashboard={dashboard} />
                  ))}
                </div>
              </div>
            )}

            {/* Empty state */}
            {filteredMandatory.length === 0 && filteredPersonal.length === 0 && (
              <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
                Aucun dashboard trouvé
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function DashboardCard({ dashboard }: { dashboard: (typeof mockDashboards)[0] }) {
  return (
    <Card className="group relative flex flex-col gap-2 p-2 transition-all hover:shadow-md">
      {/* Title and menu */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="text-xs font-semibold leading-tight">{dashboard.name}</h3>
          <p className="mt-0.5 line-clamp-2 text-[10px] text-muted-foreground">{dashboard.description}</p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-5 w-5 p-0 opacity-0 group-hover:opacity-100">
              <MoreVertical className="h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40">
            <DropdownMenuItem asChild>
              <Link href={`/dashboard/${dashboard.id}/edit`} className="flex cursor-pointer items-center text-xs">
                <Edit className="mr-2 h-3 w-3" />
                Modifier
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem className="text-xs">
              <Copy className="mr-2 h-3 w-3" />
              Dupliquer
            </DropdownMenuItem>
            <DropdownMenuItem className="text-xs">
              <Share2 className="mr-2 h-3 w-3" />
              Partager
            </DropdownMenuItem>
            {dashboard.type === "personal" && (
              <DropdownMenuItem className="text-xs text-destructive">
                <Trash2 className="mr-2 h-3 w-3" />
                Supprimer
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Badges */}
      <div className="flex flex-wrap gap-1">
        {dashboard.isDefault && (
          <Badge variant="secondary" className="h-4 px-1.5 text-[9px]">
            Défaut
          </Badge>
        )}
        {dashboard.type === "mandatory" && (
          <Badge variant="outline" className="h-4 gap-0.5 px-1.5 text-[9px]">
            <Lock className="h-2.5 w-2.5" />
            Oblig.
          </Badge>
        )}
        {dashboard.shared && (
          <Badge variant="outline" className="h-4 gap-0.5 px-1.5 text-[9px]">
            <Share2 className="h-2.5 w-2.5" />
            Partagé
          </Badge>
        )}
      </div>

      {/* Meta info */}
      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
        <span>{dashboard.widgets.length} widgets</span>
      </div>

      {/* Footer with date and creator */}
      <div className="flex items-center justify-between border-t pt-2">
        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <Calendar className="h-3 w-3" />
          <span>{dashboard.updatedAt}</span>
        </div>
        <span className="text-[10px] text-muted-foreground">{dashboard.createdBy}</span>
      </div>

      {/* Hover action button */}
      <Button
        variant="secondary"
        size="sm"
        className="h-6 w-full gap-1 text-[10px] opacity-0 transition-opacity group-hover:opacity-100"
        asChild
      >
        <Link href="/">
          <Eye className="h-3 w-3" />
          Ouvrir
        </Link>
      </Button>
    </Card>
  )
}
