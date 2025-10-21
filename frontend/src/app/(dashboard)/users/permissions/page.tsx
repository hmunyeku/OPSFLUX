"use client"

import { useEffect, useState, useMemo } from "react"
import Link from "next/link"
import { PermissionGuard } from "@/components/permission-guard"
import { useTranslation } from "@/hooks/use-translation"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Search,
  Key,
  Plus,
  Edit,
  Trash2,
  MoreVertical,
  Shield,
  Package,
  CheckCircle2,
  XCircle,
  Filter,
  Layers
} from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Permission } from "./data/schema"
import { getPermissions } from "./data/permissions-api"
import { CreatePermissionDialog } from "./components/create-permission-dialog"
import { EditPermissionDialog } from "./components/edit-permission-dialog"
import { DeletePermissionDialog } from "./components/delete-permission-dialog"
import { useToast } from "@/hooks/use-toast"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

export default function PermissionsPage() {
  return (
    <PermissionGuard permission="permissions.read">
      <PermissionsPageContent />
    </PermissionGuard>
  )
}

function PermissionsPageContent() {
  const { t } = useTranslation("core.permissions")
  const { toast } = useToast()
  const [permissions, setPermissions] = useState<Permission[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedModule, setSelectedModule] = useState<string>("all")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [selectedPermission, setSelectedPermission] = useState<Permission | null>(null)
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)

  const loadPermissions = async () => {
    try {
      setIsLoading(true)
      const data = await getPermissions()
      setPermissions(data)
    } catch (error) {
      console.error('Failed to load permissions:', error)
      toast({
        title: "Erreur",
        description: "Impossible de charger les permissions",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadPermissions()
  }, [])

  // Group permissions by module
  const permissionsByModule = useMemo(() => {
    return permissions.reduce((acc, permission) => {
      const moduleName = permission.module || 'Autre'
      if (!acc[moduleName]) {
        acc[moduleName] = []
      }
      acc[moduleName].push(permission)
      return acc
    }, {} as Record<string, Permission[]>)
  }, [permissions])

  // Get unique modules
  const modules = useMemo(() => {
    return Object.keys(permissionsByModule).sort()
  }, [permissionsByModule])

  // Filter permissions
  const filteredPermissions = useMemo(() => {
    let filtered = permissions

    // Filter by search
    if (searchQuery) {
      filtered = filtered.filter(p =>
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.description?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    }

    // Filter by module
    if (selectedModule !== "all") {
      filtered = filtered.filter(p => p.module === selectedModule)
    }

    // Filter by status
    if (statusFilter === "active") {
      filtered = filtered.filter(p => p.is_active)
    } else if (statusFilter === "inactive") {
      filtered = filtered.filter(p => !p.is_active)
    }

    return filtered
  }, [permissions, searchQuery, selectedModule, statusFilter])

  // Group filtered permissions by module
  const filteredByModule = useMemo(() => {
    return filteredPermissions.reduce((acc, permission) => {
      const moduleName = permission.module || 'Autre'
      if (!acc[moduleName]) {
        acc[moduleName] = []
      }
      acc[moduleName].push(permission)
      return acc
    }, {} as Record<string, Permission[]>)
  }, [filteredPermissions])

  // Statistics
  const stats = useMemo(() => {
    const activePermissions = permissions.filter(p => p.is_active).length
    const defaultPermissions = permissions.filter(p => p.is_default).length
    const customPermissions = permissions.filter(p => !p.is_default).length

    return {
      total: permissions.length,
      active: activePermissions,
      inactive: permissions.length - activePermissions,
      default: defaultPermissions,
      custom: customPermissions,
      modules: modules.length,
    }
  }, [permissions, modules])

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-[300px]" />
        <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
        <Skeleton className="h-[600px]" />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Breadcrumb */}
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/">{t("breadcrumb.home", "Accueil")}</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/users">{t("breadcrumb.users", "Utilisateurs")}</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{t("breadcrumb.permissions", "Permissions")}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">{t("page.title", "Catalogue des Permissions")}</h2>
          <p className="text-muted-foreground">
            {t("page.description", "Explorez et gérez toutes les permissions du système")}
          </p>
        </div>
        <Button onClick={() => setIsCreateDialogOpen(true)} size="default">
          <Plus className="mr-2 h-4 w-4" />
          {t("action.create", "Créer une permission")}
        </Button>
      </div>

      {/* Statistics Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total permissions</CardTitle>
            <Key className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
            <p className="text-xs text-muted-foreground">
              Dans {stats.modules} modules
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Permissions actives</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.active}</div>
            <p className="text-xs text-muted-foreground">
              {stats.inactive} inactives
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Par défaut</CardTitle>
            <Shield className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.default}</div>
            <p className="text-xs text-muted-foreground">
              Permissions système
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Personnalisées</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.custom}</div>
            <p className="text-xs text-muted-foreground">
              Créées manuellement
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Filtres
          </CardTitle>
          <CardDescription>
            Affinez la recherche de permissions
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Rechercher une permission..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>

            <Select value={selectedModule} onValueChange={setSelectedModule}>
              <SelectTrigger>
                <SelectValue placeholder="Tous les modules" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les modules</SelectItem>
                {modules.map((module) => (
                  <SelectItem key={module} value={module}>
                    {module} ({permissionsByModule[module].length})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Tous les statuts" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les statuts</SelectItem>
                <SelectItem value="active">Actives uniquement</SelectItem>
                <SelectItem value="inactive">Inactives uniquement</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {(searchQuery || selectedModule !== "all" || statusFilter !== "all") && (
            <div className="mt-4 flex items-center gap-2">
              <Badge variant="secondary">
                {filteredPermissions.length} résultat{filteredPermissions.length > 1 ? 's' : ''}
              </Badge>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSearchQuery("")
                  setSelectedModule("all")
                  setStatusFilter("all")
                }}
              >
                Réinitialiser les filtres
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Permissions List by Module */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Layers className="h-5 w-5" />
            Permissions par module
          </CardTitle>
          <CardDescription>
            {Object.keys(filteredByModule).length} module{Object.keys(filteredByModule).length > 1 ? 's' : ''}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {Object.keys(filteredByModule).length === 0 ? (
            <div className="py-16 text-center">
              <Key className="mx-auto h-16 w-16 text-muted-foreground/30" />
              <p className="mt-4 text-sm font-medium">Aucune permission trouvée</p>
              <p className="text-sm text-muted-foreground">
                Essayez d'ajuster vos filtres
              </p>
            </div>
          ) : (
            <ScrollArea className="h-[600px] pr-4">
              <div className="space-y-4">
                {Object.entries(filteredByModule).sort(([a], [b]) => a.localeCompare(b)).map(([moduleName, modulePermissions]) => (
                  <div key={moduleName} className="rounded-lg border overflow-hidden">
                    <div className="border-b bg-gradient-to-r from-muted/80 to-muted/40 px-5 py-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <Package className="h-5 w-5 text-primary" />
                          <div>
                            <h3 className="font-semibold capitalize">{moduleName}</h3>
                            <p className="text-xs text-muted-foreground">
                              {modulePermissions.length} permission{modulePermissions.length > 1 ? 's' : ''}
                            </p>
                          </div>
                        </div>
                        <Badge variant="outline">
                          {modulePermissions.filter(p => p.is_active).length} actives
                        </Badge>
                      </div>
                    </div>

                    <div className="divide-y">
                      {modulePermissions.map((permission) => (
                        <div
                          key={permission.id}
                          className="group flex items-start justify-between gap-4 p-4 hover:bg-accent/30 transition-colors"
                        >
                          <div className="flex items-start gap-3 flex-1 min-w-0">
                            <Key className="h-4 w-4 mt-1 text-muted-foreground flex-shrink-0" />
                            <div className="flex-1 min-w-0 space-y-1.5">
                              <div className="flex items-center gap-2 flex-wrap">
                                <p className="text-sm font-semibold">{permission.name}</p>
                                {permission.is_default && (
                                  <Badge variant="secondary" className="text-xs">
                                    Système
                                  </Badge>
                                )}
                                {permission.is_active ? (
                                  <Badge variant="outline" className="text-xs gap-1">
                                    <CheckCircle2 className="h-3 w-3 text-green-500" />
                                    Active
                                  </Badge>
                                ) : (
                                  <Badge variant="outline" className="text-xs gap-1">
                                    <XCircle className="h-3 w-3 text-muted-foreground" />
                                    Inactive
                                  </Badge>
                                )}
                              </div>
                              <code className="block text-xs text-muted-foreground font-mono bg-muted/50 px-2 py-0.5 rounded w-fit">
                                {permission.code}
                              </code>
                              {permission.description && (
                                <p className="text-xs text-muted-foreground leading-relaxed">
                                  {permission.description}
                                </p>
                              )}
                            </div>
                          </div>

                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                              >
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-48">
                              <DropdownMenuItem
                                onClick={() => {
                                  setSelectedPermission(permission)
                                  setIsEditDialogOpen(true)
                                }}
                              >
                                <Edit className="mr-2 h-4 w-4" />
                                Modifier
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              {!permission.is_default && (
                                <DropdownMenuItem
                                  className="text-destructive focus:text-destructive"
                                  onClick={() => {
                                    setSelectedPermission(permission)
                                    setIsDeleteDialogOpen(true)
                                  }}
                                >
                                  <Trash2 className="mr-2 h-4 w-4" />
                                  Supprimer
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      {/* Dialogs */}
      <CreatePermissionDialog
        open={isCreateDialogOpen}
        onOpenChange={setIsCreateDialogOpen}
        onSuccess={loadPermissions}
      />

      {selectedPermission && (
        <>
          <EditPermissionDialog
            open={isEditDialogOpen}
            onOpenChange={setIsEditDialogOpen}
            permission={selectedPermission}
            onSuccess={loadPermissions}
          />
          <DeletePermissionDialog
            open={isDeleteDialogOpen}
            onOpenChange={setIsDeleteDialogOpen}
            permission={selectedPermission}
            onSuccess={loadPermissions}
          />
        </>
      )}
    </div>
  )
}
