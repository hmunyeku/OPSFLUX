"use client"

import { useState, useMemo, useEffect } from "react"
import { users as mockUsers, roles, groups, type UserStatus, type User as MockUser } from "@/lib/user-management-data"
import { UsersApi, type User as ApiUser } from "@/lib/users-api"
import { useHeaderContext } from "@/components/header-context"
import { useAuth } from "@/lib/auth-context"
import { UserAccountsFilters } from "./user-accounts-filters"
import { UserGridView } from "./user-grid-view"
import { UserTableView } from "./user-table-view"
import { UserDetailDrawer } from "./user-detail-drawer"
import { UserEditDrawer } from "./user-edit-drawer"
import { AddUserDrawer } from "./add-user-drawer"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { ButtonGroup } from "@/components/ui/button-group"
import { Plus, Loader2, LayoutGrid, Table, Filter, ArrowUpDown, RefreshCw, MoreVertical } from "lucide-react"

// Type alias for compatibility
type User = MockUser

export type ViewMode = "grid" | "table"
export type SortOption = "name-asc" | "name-desc" | "date-newest" | "date-oldest" | "last-active" | "role"

export interface UserFilter {
  status?: UserStatus[]
  roles?: string[]
  groups?: string[]
  accountType?: string[]
  twoFactor?: boolean
  search?: string
}

export function UserAccountsContent() {
  const [viewMode, setViewMode] = useState<ViewMode>("grid")
  const [sortBy, setSortBy] = useState<SortOption>("name-asc")
  const [filters, setFilters] = useState<UserFilter>({})
  const [selectedUsers, setSelectedUsers] = useState<string[]>([])
  const [isFilterDrawerOpen, setIsFilterDrawerOpen] = useState(false)
  const [selectedUser, setSelectedUser] = useState<User | null>(null)
  const [isDetailDrawerOpen, setIsDetailDrawerOpen] = useState(false)
  const [isEditDrawerOpen, setIsEditDrawerOpen] = useState(false)
  const [isAddDrawerOpen, setIsAddDrawerOpen] = useState(false)
  const [users, setUsers] = useState<User[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const { setContextualHeader, clearContextualHeader } = useHeaderContext()
  const { user: currentUser, isLoading: authLoading } = useAuth()

  // Load users from API only when authentication is complete
  useEffect(() => {
    if (!authLoading && currentUser) {
      loadUsers()
    } else if (!authLoading && !currentUser) {
      // Not authenticated, use mock data
      setUsers(mockUsers)
      setIsLoading(false)
    }
  }, [authLoading, currentUser])

  const loadUsers = async () => {
    try {
      setIsLoading(true)
      setError(null)
      const response = await UsersApi.getUsers({ with_rbac: true, limit: 1000 })

      // Transform API users to match mock user format
      const transformedUsers: User[] = response.data.map((apiUser) => ({
        id: apiUser.id,
        firstName: apiUser.full_name?.split(' ')[0] || apiUser.email.split('@')[0],
        lastName: apiUser.full_name?.split(' ').slice(1).join(' ') || '',
        email: apiUser.email,
        avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${apiUser.email}`,
        role: apiUser.is_superuser ? 'Admin' : 'User',
        department: 'Unknown',
        jobTitle: 'Unknown',
        location: 'Unknown',
        status: apiUser.is_active ? 'active' : 'inactive' as UserStatus,
        joinDate: apiUser.created_at || new Date().toISOString(),
        lastActive: apiUser.updated_at || apiUser.created_at || new Date().toISOString(),
        roles: apiUser.roles?.map(r => r.id) || [],
        groups: apiUser.groups?.map(g => g.id) || [],
        permissions: [],
        accountType: 'local' as const,
        twoFactorEnabled: false,
        bio: '',
        phone: '',
      }))

      setUsers(transformedUsers)
    } catch (err) {
      console.error('Failed to load users:', err)
      setError('Échec du chargement des utilisateurs. Utilisation des données de test.')
      // Fallback to mock data
      setUsers(mockUsers)
    } finally {
      setIsLoading(false)
    }
  }

  const filteredUsers = useMemo(() => {
    let filtered = [...users]

    if (filters.search) {
      const search = filters.search.toLowerCase()
      filtered = filtered.filter(
        (user) =>
          user.firstName.toLowerCase().includes(search) ||
          user.lastName.toLowerCase().includes(search) ||
          user.email.toLowerCase().includes(search) ||
          user.department.toLowerCase().includes(search) ||
          user.jobTitle.toLowerCase().includes(search),
      )
    }

    if (filters.status && filters.status.length > 0) {
      filtered = filtered.filter((user) => filters.status!.includes(user.status))
    }

    if (filters.roles && filters.roles.length > 0) {
      filtered = filtered.filter((user) => user.roles.some((role) => filters.roles!.includes(role)))
    }

    if (filters.groups && filters.groups.length > 0) {
      filtered = filtered.filter((user) => user.groups.some((group) => filters.groups!.includes(group)))
    }

    if (filters.accountType && filters.accountType.length > 0) {
      filtered = filtered.filter((user) => filters.accountType!.includes(user.accountType))
    }

    if (filters.twoFactor !== undefined) {
      filtered = filtered.filter((user) => user.twoFactorEnabled === filters.twoFactor)
    }

    filtered.sort((a, b) => {
      switch (sortBy) {
        case "name-asc":
          return `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`)
        case "name-desc":
          return `${b.firstName} ${b.lastName}`.localeCompare(`${a.firstName} ${a.lastName}`)
        case "date-newest": {
          const dateA = new Date(a.joinDate).getTime()
          const dateB = new Date(b.joinDate).getTime()
          if (isNaN(dateA) && isNaN(dateB)) return 0
          if (isNaN(dateA)) return 1
          if (isNaN(dateB)) return -1
          return dateB - dateA
        }
        case "date-oldest": {
          const dateA = new Date(a.joinDate).getTime()
          const dateB = new Date(b.joinDate).getTime()
          if (isNaN(dateA) && isNaN(dateB)) return 0
          if (isNaN(dateA)) return 1
          if (isNaN(dateB)) return -1
          return dateA - dateB
        }
        case "last-active": {
          const dateA = new Date(a.lastActive).getTime()
          const dateB = new Date(b.lastActive).getTime()
          if (isNaN(dateA) && isNaN(dateB)) return 0
          if (isNaN(dateA)) return 1
          if (isNaN(dateB)) return -1
          return dateB - dateA
        }
        case "role":
          return a.role.localeCompare(b.role)
        default:
          return 0
      }
    })

    return filtered
  }, [users, filters, sortBy])

  const activeFilterCount = useMemo(() => {
    let count = 0
    if (filters.status && filters.status.length > 0) count += filters.status.length
    if (filters.roles && filters.roles.length > 0) count += filters.roles.length
    if (filters.groups && filters.groups.length > 0) count += filters.groups.length
    if (filters.accountType && filters.accountType.length > 0) count += filters.accountType.length
    if (filters.twoFactor !== undefined) count += 1
    return count
  }, [filters])

  const handleClearFilters = () => {
    setFilters({})
  }

  const handleRemoveFilter = (filterType: keyof UserFilter, value?: any) => {
    setFilters((prev) => {
      const newFilters = { ...prev }
      if (filterType === "status" && Array.isArray(newFilters.status)) {
        newFilters.status = newFilters.status.filter((s) => s !== value)
        if (newFilters.status.length === 0) delete newFilters.status
      } else if (filterType === "roles" && Array.isArray(newFilters.roles)) {
        newFilters.roles = newFilters.roles.filter((r) => r !== value)
        if (newFilters.roles.length === 0) delete newFilters.roles
      } else if (filterType === "groups" && Array.isArray(newFilters.groups)) {
        newFilters.groups = newFilters.groups.filter((g) => g !== value)
        if (newFilters.groups.length === 0) delete newFilters.groups
      } else if (filterType === "accountType" && Array.isArray(newFilters.accountType)) {
        newFilters.accountType = newFilters.accountType.filter((a) => a !== value)
        if (newFilters.accountType.length === 0) delete newFilters.accountType
      } else {
        delete newFilters[filterType]
      }
      return newFilters
    })
  }

  const handleViewUser = (user: User) => {
    setSelectedUser(user)
    setIsDetailDrawerOpen(true)
  }

  const handleEditUser = (user: User) => {
    setSelectedUser(user)
    setIsEditDrawerOpen(true)
  }

  // Configure contextual header
  useEffect(() => {
    setContextualHeader({
      searchPlaceholder: "Rechercher des utilisateurs... (Ctrl+K)",
      searchValue: filters.search || "",
      onSearchChange: (value) => setFilters((prev) => ({ ...prev, search: value })),
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
              variant={viewMode === "table" ? "secondary" : "ghost"}
              size="sm"
              className="h-9 rounded-l-none"
              onClick={() => setViewMode("table")}
            >
              <Table className="h-4 w-4" />
            </Button>
          </div>

          {/* Filters Button */}
          <Button variant="outline" size="sm" className="h-9 bg-transparent" onClick={() => setIsFilterDrawerOpen(true)}>
            <Filter className="h-4 w-4" />
            {activeFilterCount > 0 && (
              <span className="ml-2 rounded-full bg-primary px-2 py-0.5 text-xs text-primary-foreground">
                {activeFilterCount}
              </span>
            )}
          </Button>

          {/* Sort Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-9 bg-transparent">
                <ArrowUpDown className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setSortBy("name-asc")}>Nom (A-Z)</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSortBy("name-desc")}>Nom (Z-A)</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSortBy("date-newest")}>Date d'ajout (Plus récent)</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSortBy("date-oldest")}>Date d'ajout (Plus ancien)</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSortBy("last-active")}>Dernière activité</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSortBy("role")}>Rôle</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Refresh Button */}
          <Button variant="outline" size="sm" className="h-9 w-9 p-0 bg-transparent" onClick={loadUsers} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>

          {/* Add Button */}
          <Button variant="outline" size="sm" className="h-9 w-9 p-0 bg-transparent" onClick={() => setIsAddDrawerOpen(true)}>
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
              <DropdownMenuItem>Importer des utilisateurs</DropdownMenuItem>
              <DropdownMenuItem>Exporter les utilisateurs</DropdownMenuItem>
              <DropdownMenuItem>Historique des modifications</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </ButtonGroup>
      ),
    })

    return () => {
      clearContextualHeader()
    }
  }, [filters.search, viewMode, sortBy, activeFilterCount, isLoading, selectedUsers.length, setContextualHeader, clearContextualHeader])

  return (
    <div className="flex h-full flex-col">

      {activeFilterCount > 0 && (
        <div className="border-b bg-muted/30 px-3 py-2 sm:px-4 sm:py-3 md:px-6">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium sm:text-sm">Filtres actifs :</span>
            {filters.status?.map((status) => (
              <Button
                key={status}
                variant="secondary"
                size="sm"
                className="h-7"
                onClick={() => handleRemoveFilter("status", status)}
              >
                Statut : {status === 'active' ? 'Actif' : status === 'inactive' ? 'Inactif' : status === 'pending' ? 'En attente' : status}
                <span className="ml-2">×</span>
              </Button>
            ))}
            {filters.roles?.map((roleId) => {
              const role = roles.find((r) => r.id === roleId)
              return (
                <Button
                  key={roleId}
                  variant="secondary"
                  size="sm"
                  className="h-7"
                  onClick={() => handleRemoveFilter("roles", roleId)}
                >
                  Rôle : {role?.name}
                  <span className="ml-2">×</span>
                </Button>
              )
            })}
            {filters.groups?.map((groupId) => {
              const group = groups.find((g) => g.id === groupId)
              return (
                <Button
                  key={groupId}
                  variant="secondary"
                  size="sm"
                  className="h-7"
                  onClick={() => handleRemoveFilter("groups", groupId)}
                >
                  Groupe : {group?.name}
                  <span className="ml-2">×</span>
                </Button>
              )
            })}
            <Button variant="ghost" size="sm" className="h-7" onClick={handleClearFilters}>
              Tout effacer
            </Button>
            <span className="ml-auto text-sm text-muted-foreground">
              <strong>{filteredUsers.length}</strong> utilisateur{filteredUsers.length > 1 ? 's' : ''}
            </span>
          </div>
        </div>
      )}

      {/* Error message */}
      {error && (
        <div className="border-b bg-destructive/10 px-6 py-3">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="flex h-full items-center justify-center">
            <div className="text-center">
              <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary mb-4" />
              <p className="text-sm text-muted-foreground">Chargement des utilisateurs...</p>
            </div>
          </div>
        ) : viewMode === "grid" ? (
          <UserGridView
            users={filteredUsers}
            selectedUsers={selectedUsers}
            onSelectUser={(userId) => {
              setSelectedUsers((prev) =>
                prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId],
              )
            }}
            onSelectAll={(selected) => {
              setSelectedUsers(selected ? filteredUsers.map((u) => u.id) : [])
            }}
            onViewUser={handleViewUser}
            onEditUser={handleEditUser}
          />
        ) : (
          <UserTableView
            users={filteredUsers}
            selectedUsers={selectedUsers}
            onSelectUser={(userId) => {
              setSelectedUsers((prev) =>
                prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId],
              )
            }}
            onSelectAll={(selected) => {
              setSelectedUsers(selected ? filteredUsers.map((u) => u.id) : [])
            }}
            onViewUser={handleViewUser}
            onEditUser={handleEditUser}
          />
        )}
      </div>

      <UserAccountsFilters
        open={isFilterDrawerOpen}
        onOpenChange={setIsFilterDrawerOpen}
        filters={filters}
        onFiltersChange={setFilters}
      />

      <UserDetailDrawer user={selectedUser} open={isDetailDrawerOpen} onOpenChange={setIsDetailDrawerOpen} />

      <UserEditDrawer user={selectedUser} open={isEditDrawerOpen} onOpenChange={setIsEditDrawerOpen} />

      <AddUserDrawer open={isAddDrawerOpen} onOpenChange={setIsAddDrawerOpen} />
    </div>
  )
}
