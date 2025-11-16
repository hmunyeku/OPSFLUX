"use client"

import { useState, useEffect } from "react"
import { mockRoles } from "@/lib/user-management-data"
import { RolesApi, type Role as ApiRole } from "@/lib/roles-api"
import { RoleDetails } from "./role-details"
import { CreateRoleDrawer } from "./create-role-drawer"
import { useHeaderContext } from "@/components/header-context"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Plus, Shield, Users, Crown, UserCog, Eye, Lock, MoreVertical, Loader2 } from "lucide-react"
import { ButtonGroup } from "@/components/ui/button-group"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"

// Type for compatibility with existing components
type Role = {
  id: string
  name: string
  description: string
  permissions: any[]
  userCount: number
  type: 'system' | 'custom'
}

export function RolesPermissionsContent() {
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null)
  const [isCreateDrawerOpen, setIsCreateDrawerOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [roles, setRoles] = useState<Role[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const { setContextualHeader, clearContextualHeader } = useHeaderContext()

  // Load roles from API
  useEffect(() => {
    loadRoles()
  }, [])

  const loadRoles = async () => {
    try {
      setIsLoading(true)
      setError(null)
      const response = await RolesApi.getRoles({ with_permissions: true, limit: 1000 })

      // Transform API roles to match UI format
      const transformedRoles: Role[] = response.data.map((apiRole) => ({
        id: apiRole.id,
        name: apiRole.name,
        description: apiRole.description || '',
        permissions: apiRole.permissions || [],
        userCount: apiRole.user_count || 0,
        type: 'custom' as const, // All roles are custom for now
      }))

      setRoles(transformedRoles)
    } catch (err) {
      console.error('Failed to load roles:', err)
      setError('Échec du chargement des rôles. Utilisation des données de test.')
      // Fallback to mock data
      setRoles(mockRoles)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    setContextualHeader({
      searchPlaceholder: "Rechercher un rôle... (Ctrl+K)",
      searchValue: searchQuery,
      onSearchChange: setSearchQuery,
      customRender: (
        <ButtonGroup>
          <Button
            variant="outline"
            size="sm"
            className="h-9 w-9 p-0 bg-transparent"
            onClick={() => setIsCreateDrawerOpen(true)}
          >
            <Plus className="h-4 w-4" />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-9 w-9 p-0 bg-transparent">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem>Exporter les rôles</DropdownMenuItem>
              <DropdownMenuItem>Importer des rôles</DropdownMenuItem>
              <DropdownMenuItem>Historique des modifications</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </ButtonGroup>
      ),
    })

    return () => {
      clearContextualHeader()
    }
  }, [searchQuery, setContextualHeader, clearContextualHeader])

  const selectedRole = roles.find((role) => role.id === selectedRoleId)

  const getRoleIcon = (roleName: string) => {
    const name = roleName.toLowerCase()
    if (name.includes("super") || name.includes("admin")) return Crown
    if (name.includes("manager") || name.includes("gestionnaire")) return UserCog
    if (name.includes("user") || name.includes("utilisateur")) return Users
    if (name.includes("guest") || name.includes("invité")) return Eye
    return Shield
  }

  const getRoleColor = (roleName: string) => {
    const name = roleName.toLowerCase()
    if (name.includes("super")) return "bg-purple-500/10 text-purple-700 border-purple-500/20"
    if (name.includes("admin")) return "bg-red-500/10 text-red-700 border-red-500/20"
    if (name.includes("manager") || name.includes("gestionnaire"))
      return "bg-blue-500/10 text-blue-700 border-blue-500/20"
    if (name.includes("user") || name.includes("utilisateur"))
      return "bg-green-500/10 text-green-700 border-green-500/20"
    if (name.includes("guest") || name.includes("invité")) return "bg-gray-500/10 text-gray-700 border-gray-500/20"
    return "bg-orange-500/10 text-orange-700 border-orange-500/20"
  }

  const filteredRoles = roles.filter(
    (role) =>
      role.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      role.description.toLowerCase().includes(searchQuery.toLowerCase()),
  )

  const totalUsers = roles.reduce((acc, r) => acc + r.userCount, 0)
  const systemRoles = roles.filter((r) => r.type === "system").length
  const customRoles = roles.filter((r) => r.type === "custom").length

  return (
    <div className="flex h-full flex-col">
      <div className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="flex flex-col gap-2 p-3">
          <div className="flex items-center gap-2 text-sm overflow-x-auto w-full pb-1">
            <Button
              variant="ghost"
              size="sm"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md whitespace-nowrap h-auto transition-colors bg-muted/80 hover:bg-muted"
            >
              <span className="text-muted-foreground">Total rôles:</span>
              <span className="font-semibold">{roles.length}</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md whitespace-nowrap h-auto transition-colors bg-blue-500/10 hover:bg-blue-500/15"
            >
              <span className="text-muted-foreground">Système:</span>
              <span className="font-semibold text-blue-600">{systemRoles}</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md whitespace-nowrap h-auto transition-colors bg-orange-500/10 hover:bg-orange-500/15"
            >
              <span className="text-muted-foreground">Personnalisés:</span>
              <span className="font-semibold text-orange-600">{customRoles}</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md whitespace-nowrap h-auto transition-colors bg-green-500/10 hover:bg-green-500/15"
            >
              <span className="text-muted-foreground">Utilisateurs:</span>
              <span className="font-semibold text-green-600">{totalUsers}</span>
            </Button>
          </div>
        </div>
      </div>

      {/* Error message */}
      {error && (
        <div className="border-b bg-destructive/10 px-6 py-3">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      <div className="flex-1 overflow-auto p-3">
        {isLoading ? (
          <div className="flex h-full items-center justify-center">
            <div className="text-center">
              <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary mb-4" />
              <p className="text-sm text-muted-foreground">Chargement des rôles...</p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-2">
            {filteredRoles.map((role) => {
            const Icon = getRoleIcon(role.name)
            const colorClass = getRoleColor(role.name)
            const permissionCount = role.permissions.length
            const totalPermissions = 50
            const coverage = Math.round((permissionCount / totalPermissions) * 100)

            return (
              <Card
                key={role.id}
                className="p-2 hover:shadow-md transition-shadow cursor-pointer group"
                onClick={() => setSelectedRoleId(role.id)}
              >
                <div className="flex items-start gap-2">
                  <div className={`p-1.5 rounded-md ${colorClass} flex-shrink-0`}>
                    <Icon className="h-3.5 w-3.5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-1">
                      <h3 className="text-xs font-semibold truncate">{role.name}</h3>
                      {role.type === "system" && <Lock className="h-2.5 w-2.5 text-muted-foreground flex-shrink-0" />}
                    </div>
                    <p className="text-[10px] text-muted-foreground line-clamp-2 leading-relaxed mb-2">
                      {role.description}
                    </p>

                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-[10px]">
                        <span className="text-muted-foreground">Utilisateurs</span>
                        <span className="font-semibold">{role.userCount}</span>
                      </div>
                      <div className="flex items-center justify-between text-[10px]">
                        <span className="text-muted-foreground">Permissions</span>
                        <span className="font-semibold">{permissionCount}</span>
                      </div>
                      <div className="flex items-center justify-between text-[10px]">
                        <span className="text-muted-foreground">Couverture</span>
                        <span className="font-semibold">{coverage}%</span>
                      </div>
                    </div>

                    <div className="mt-2 h-1 bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-primary transition-all" style={{ width: `${coverage}%` }} />
                    </div>
                  </div>
                </div>
              </Card>
            )
            })}
          </div>
        )}
      </div>

      {selectedRole && (
        <RoleDetails
          role={selectedRole}
          open={!!selectedRoleId}
          onOpenChange={(open) => !open && setSelectedRoleId(null)}
        />
      )}

      <CreateRoleDrawer open={isCreateDrawerOpen} onOpenChange={setIsCreateDrawerOpen} />
    </div>
  )
}
