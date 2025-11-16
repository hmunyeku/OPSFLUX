"use client"

import { useState, useMemo, useEffect } from "react"
import { groups as mockGroups } from "@/lib/user-management-data"
import { GroupsApi, type Group as ApiGroup } from "@/lib/groups-api"
import { useHeaderContext } from "@/components/header-context"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { ButtonGroup } from "@/components/ui/button-group"
import { GroupsGridView } from "./groups-grid-view"
import { GroupsListView } from "./groups-list-view"
import { Plus, LayoutGrid, List, ArrowUpDown, RefreshCw, MoreVertical, Loader2 } from "lucide-react"

// Type for compatibility with existing components
type Group = {
  id: string
  name: string
  description: string
  memberCount: number
  type: string
  createdAt: string
  lastActive: string
  avatar?: string
}

type ViewMode = "grid" | "list"
type SortOption = "name" | "members" | "created" | "activity"

export function GroupsTeamsContent() {
  const [viewMode, setViewMode] = useState<ViewMode>("grid")
  const [sortBy, setSortBy] = useState<SortOption>("name")
  const [searchQuery, setSearchQuery] = useState("")
  const [groups, setGroups] = useState<Group[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const { setContextualHeader, clearContextualHeader } = useHeaderContext()

  // Load groups from API
  useEffect(() => {
    loadGroups()
  }, [])

  const loadGroups = async () => {
    try {
      setIsLoading(true)
      setError(null)
      const response = await GroupsApi.getGroups({ with_members: true, limit: 1000 })

      // Transform API groups to match UI format
      const transformedGroups: Group[] = response.data.map((apiGroup) => ({
        id: apiGroup.id,
        name: apiGroup.name,
        description: apiGroup.description || '',
        memberCount: apiGroup.member_count || 0,
        type: 'custom',
        createdAt: apiGroup.created_at,
        lastActive: apiGroup.updated_at || apiGroup.created_at,
        avatar: `https://api.dicebear.com/7.x/initials/svg?seed=${apiGroup.name}`,
      }))

      setGroups(transformedGroups)
    } catch (err) {
      console.error('Failed to load groups:', err)
      setError('Échec du chargement des groupes. Utilisation des données de test.')
      // Fallback to mock data
      setGroups(mockGroups)
    } finally {
      setIsLoading(false)
    }
  }

  const filteredGroups = useMemo(() => {
    let filtered = [...groups]

    // Apply search
    if (searchQuery) {
      const search = searchQuery.toLowerCase()
      filtered = filtered.filter(
        (group) =>
          group.name.toLowerCase().includes(search) ||
          group.description.toLowerCase().includes(search) ||
          group.type.toLowerCase().includes(search),
      )
    }

    // Apply sorting
    filtered.sort((a, b) => {
      switch (sortBy) {
        case "name":
          return a.name.localeCompare(b.name)
        case "members":
          return b.memberCount - a.memberCount
        case "created":
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        case "activity":
          return new Date(b.lastActive).getTime() - new Date(a.lastActive).getTime()
        default:
          return 0
      }
    })

    return filtered
  }, [groups, searchQuery, sortBy])

  // Configure contextual header
  useEffect(() => {
    setContextualHeader({
      searchPlaceholder: "Rechercher des groupes... (Ctrl+K)",
      searchValue: searchQuery,
      onSearchChange: setSearchQuery,
      customRender: (
        <ButtonGroup>
          {/* View Toggle */}
          <div className="flex items-center rounded-md border">
            <Button
              variant={viewMode === "grid" ? "secondary" : "ghost"}
              size="sm"
              className="h-9 rounded-r-none"
              onClick={() => setViewMode("grid")}
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === "list" ? "secondary" : "ghost"}
              size="sm"
              className="h-9 rounded-l-none border-l"
              onClick={() => setViewMode("list")}
            >
              <List className="h-4 w-4" />
            </Button>
          </div>

          {/* Sort Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-9 bg-transparent">
                <ArrowUpDown className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setSortBy("name")}>Nom</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSortBy("members")}>Nombre de membres</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSortBy("created")}>Date de création</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSortBy("activity")}>Dernière activité</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Refresh Button */}
          <Button variant="outline" size="sm" className="h-9 w-9 p-0 bg-transparent" onClick={loadGroups} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>

          {/* Add Button */}
          <Button variant="outline" size="sm" className="h-9 w-9 p-0 bg-transparent">
            <Plus className="h-4 w-4" />
          </Button>

          {/* More Actions Menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-9 w-9 p-0 bg-transparent">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem>Importer des groupes</DropdownMenuItem>
              <DropdownMenuItem>Exporter les groupes</DropdownMenuItem>
              <DropdownMenuItem>Historique des modifications</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </ButtonGroup>
      ),
    })

    return () => {
      clearContextualHeader()
    }
  }, [searchQuery, viewMode, sortBy, isLoading, setContextualHeader, clearContextualHeader])

  return (
    <div className="flex h-full flex-col">

      {/* Error message */}
      {error && (
        <div className="border-b bg-destructive/10 px-6 py-3">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      {/* Content Area */}
      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="flex h-full items-center justify-center">
            <div className="text-center">
              <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary mb-4" />
              <p className="text-sm text-muted-foreground">Chargement des groupes...</p>
            </div>
          </div>
        ) : viewMode === "grid" ? (
          <GroupsGridView groups={filteredGroups} />
        ) : (
          <GroupsListView groups={filteredGroups} />
        )}
      </div>
    </div>
  )
}
