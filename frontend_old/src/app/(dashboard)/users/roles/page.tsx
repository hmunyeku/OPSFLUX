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
import { Switch } from "@/components/ui/switch"
import {
  Search,
  Shield,
  Plus,
  Edit,
  Trash2,
  MoreVertical,
  Key,
  Users,
  ShieldCheck,
  AlertCircle,
  Crown
} from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Separator } from "@/components/ui/separator"
import { Role } from "./data/schema"
import { getRoles, toggleRoleActive } from "./data/roles-api"
import { CreateRoleDialog } from "./components/create-role-dialog"
import { EditRoleDialog } from "./components/edit-role-dialog"
import { DeleteRoleDialog } from "./components/delete-role-dialog"
import { ManagePermissionsDialog } from "./components/manage-permissions-dialog"
import { useToast } from "@/hooks/use-toast"

export default function RolesPage() {
  return (
    <PermissionGuard permission="roles.read">
      <RolesPageContent />
    </PermissionGuard>
  )
}

function RolesPageContent() {
  const { t } = useTranslation("core.roles")
  const { toast } = useToast()
  const [roles, setRoles] = useState<Role[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedRole, setSelectedRole] = useState<Role | null>(null)
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [isPermissionsDialogOpen, setIsPermissionsDialogOpen] = useState(false)

  const loadRoles = async () => {
    try {
      setIsLoading(true)
      const data = await getRoles(true)
      setRoles(data)
      if (!selectedRole && data.length > 0) {
        setSelectedRole(data[0])
      }
    } catch (error) {
      console.error('Failed to load roles:', error)
      toast({
        title: "Erreur",
        description: "Impossible de charger les rôles",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  const refreshRoles = async () => {
    try {
      const data = await getRoles(true)
      setRoles(data)
      if (selectedRole) {
        const updatedRole = data.find(r => r.id === selectedRole.id)
        if (updatedRole) {
          setSelectedRole(updatedRole)
        }
      }
    } catch (error) {
      console.error('Failed to refresh roles:', error)
    }
  }

  const handleToggleActive = async (role: Role, isActive: boolean) => {
    try {
      await toggleRoleActive(role.id, isActive)
      toast({
        title: "Succès",
        description: `Le rôle a été ${isActive ? 'activé' : 'désactivé'}`,
      })
      await refreshRoles()
    } catch (error) {
      toast({
        title: "Erreur",
        description: "Impossible de modifier l'état du rôle",
        variant: "destructive",
      })
    }
  }

  useEffect(() => {
    loadRoles()
  }, [])

  const filteredRoles = useMemo(() => {
    return roles.filter(role =>
      role.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      role.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      role.description?.toLowerCase().includes(searchQuery.toLowerCase())
    )
  }, [roles, searchQuery])

  const stats = useMemo(() => {
    const totalPermissions = roles.reduce((acc, role) => acc + (role.permissions?.length || 0), 0)
    const activeRoles = roles.filter(r => r.is_active).length
    const systemRoles = roles.filter(r => r.is_system).length
    const avgPermissionsPerRole = roles.length > 0 ? Math.round(totalPermissions / roles.length) : 0

    return {
      totalRoles: roles.length,
      activeRoles,
      systemRoles,
      totalPermissions,
      avgPermissionsPerRole,
    }
  }, [roles])

  const permissionsByModule = useMemo(() => {
    if (!selectedRole?.permissions) return {}

    return selectedRole.permissions.reduce((acc, permission) => {
      const moduleName = permission.module || 'Autre'
      if (!acc[moduleName]) {
        acc[moduleName] = []
      }
      acc[moduleName].push(permission)
      return acc
    }, {} as Record<string, typeof selectedRole.permissions>)
  }, [selectedRole])

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-[300px]" />
        <div className="grid gap-4 md:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
        <div className="grid gap-6 lg:grid-cols-[400px_1fr]">
          <Skeleton className="h-[600px]" />
          <Skeleton className="h-[600px]" />
        </div>
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
            <BreadcrumbPage>{t("breadcrumb.roles", "Rôles")}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">{t("page.title", "Rôles & Permissions")}</h2>
          <p className="text-muted-foreground">
            {t("page.description", "Gérez les rôles et leurs permissions associées")}
          </p>
        </div>
        <Button onClick={() => setIsCreateDialogOpen(true)} size="default">
          <Plus className="mr-2 h-4 w-4" />
          {t("action.create", "Créer un rôle")}
        </Button>
      </div>

      {/* Statistics Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t("stats.total_roles", "Total des rôles")}</CardTitle>
            <Shield className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalRoles}</div>
            <p className="text-xs text-muted-foreground">
              {stats.activeRoles} {t("stats.active_count", "actifs")}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t("stats.system_roles", "Rôles système")}</CardTitle>
            <Crown className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.systemRoles}</div>
            <p className="text-xs text-muted-foreground">
              {t("stats.protected_deletion", "Protégés contre la suppression")}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t("stats.total_permissions", "Total permissions")}</CardTitle>
            <Key className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalPermissions}</div>
            <p className="text-xs text-muted-foreground">
              {t("stats.assigned_all_roles", "Assignées à tous les rôles")}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t("stats.avg_per_role", "Moyenne par rôle")}</CardTitle>
            <ShieldCheck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.avgPermissionsPerRole}</div>
            <p className="text-xs text-muted-foreground">
              {t("stats.permissions_per_role", "Permissions par rôle")}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <div className="grid gap-6 lg:grid-cols-[400px_1fr]">
        {/* Left Panel - Roles List */}
        <Card className="lg:h-[calc(100vh-320px)]">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              {t("list.title", "Liste des rôles")}
            </CardTitle>
            <CardDescription>
              {filteredRoles.length} {filteredRoles.length > 1 ? t("list.roles_count", "rôles") : t("list.role_count", "rôle")}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder={t("list.search_placeholder", "Rechercher un rôle...")}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>

            {/* Roles List */}
            <ScrollArea className="h-[calc(100vh-500px)] pr-4">
              <div className="space-y-2">
                {filteredRoles.length === 0 ? (
                  <div className="py-12 text-center">
                    <Shield className="mx-auto h-12 w-12 text-muted-foreground/50" />
                    <p className="mt-4 text-sm text-muted-foreground">
                      {t("list.no_role_found", "Aucun rôle trouvé")}
                    </p>
                  </div>
                ) : (
                  filteredRoles.map((role) => (
                    <div
                      key={role.id}
                      className={`group/item rounded-lg border p-4 transition-all hover:shadow-md cursor-pointer ${
                        selectedRole?.id === role.id
                          ? "border-primary bg-accent shadow-md ring-1 ring-primary/20"
                          : "hover:border-primary/50"
                      }`}
                      onClick={() => setSelectedRole(role)}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 space-y-2">
                          <div className="flex items-center gap-2">
                            {role.is_system ? (
                              <Crown className="h-4 w-4 text-amber-500" />
                            ) : (
                              <Shield className="h-4 w-4 text-primary" />
                            )}
                            <p className="font-semibold leading-none">{role.name}</p>
                            {!role.is_active && (
                              <Badge variant="outline" className="text-xs">
                                {t("badge.inactive", "Inactif")}
                              </Badge>
                            )}
                          </div>

                          <p className="text-xs text-muted-foreground font-mono">
                            {role.code}
                          </p>

                          {role.description && (
                            <p className="text-xs text-muted-foreground line-clamp-2">
                              {role.description}
                            </p>
                          )}

                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="secondary" className="text-xs">
                              {role.permissions?.length || 0} {role.permissions?.length !== 1 ? t("badge.permissions", "permissions") : t("badge.permission", "permission")}
                            </Badge>
                            <Badge
                              variant={role.is_active ? "default" : "outline"}
                              className="text-xs"
                            >
                              {role.is_active ? t("badge.active", "Actif") : t("badge.inactive", "Inactif")}
                            </Badge>
                          </div>
                        </div>

                        <DropdownMenu>
                          <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0 opacity-0 group-hover/item:opacity-100 transition-opacity"
                            >
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-52">
                            <DropdownMenuItem
                              onClick={(e) => {
                                e.stopPropagation()
                                setSelectedRole(role)
                                setIsPermissionsDialogOpen(true)
                              }}
                            >
                              <Key className="mr-2 h-4 w-4" />
                              {t("action.manage_permissions", "Gérer les permissions")}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={(e) => {
                                e.stopPropagation()
                                setSelectedRole(role)
                                setIsEditDialogOpen(true)
                              }}
                            >
                              <Edit className="mr-2 h-4 w-4" />
                              {t("action.edit", "Modifier")}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            {!role.is_system && (
                              <DropdownMenuItem
                                className="text-destructive focus:text-destructive"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setSelectedRole(role)
                                  setIsDeleteDialogOpen(true)
                                }}
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                {t("action.delete", "Supprimer")}
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Right Panel - Role Details */}
        <Card className="lg:h-[calc(100vh-320px)]">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex-1 space-y-1">
                <CardTitle className="flex items-center gap-2">
                  {selectedRole?.is_system ? (
                    <Crown className="h-5 w-5 text-amber-500" />
                  ) : (
                    <Shield className="h-5 w-5" />
                  )}
                  {selectedRole ? selectedRole.name : t("details.no_role_selected", "Aucun rôle sélectionné")}
                </CardTitle>
                <CardDescription>
                  {selectedRole
                    ? `${selectedRole.permissions?.length || 0} ${selectedRole.permissions?.length !== 1 ? t("details.permissions_assigned", "permissions assignées") : t("details.permission_assigned", "permission assignée")}`
                    : t("details.select_role_to_view", "Sélectionnez un rôle pour voir les détails")
                  }
                </CardDescription>
              </div>

              {selectedRole && (
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={selectedRole.is_active}
                      onCheckedChange={(checked) => handleToggleActive(selectedRole, checked)}
                      disabled={selectedRole.is_system}
                    />
                    <span className="text-sm text-muted-foreground">
                      {selectedRole.is_active ? t("badge.active", "Actif") : t("badge.inactive", "Inactif")}
                    </span>
                  </div>
                  <Separator orientation="vertical" className="h-6" />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setIsEditDialogOpen(true)}
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                  {!selectedRole.is_system && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setIsDeleteDialogOpen(true)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                  <Button
                    size="sm"
                    onClick={() => setIsPermissionsDialogOpen(true)}
                  >
                    <Key className="mr-2 h-4 w-4" />
                    {t("action.permissions", "Permissions")}
                  </Button>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {!selectedRole ? (
              <div className="flex h-[calc(100vh-500px)] items-center justify-center">
                <div className="text-center">
                  <Shield className="mx-auto h-16 w-16 text-muted-foreground/30" />
                  <p className="mt-4 text-sm font-medium">{t("details.no_role_selected_title", "Aucun rôle sélectionné")}</p>
                  <p className="text-sm text-muted-foreground">
                    {t("details.select_role_from_list", "Sélectionnez un rôle dans la liste")}
                  </p>
                </div>
              </div>
            ) : (
              <ScrollArea className="h-[calc(100vh-500px)] pr-4">
                <div className="space-y-6">
                  {/* Role Information */}
                  <div className="rounded-lg border bg-card p-4">
                    <h3 className="mb-3 flex items-center gap-2 font-semibold">
                      <AlertCircle className="h-4 w-4" />
                      {t("details.role_info", "Informations du rôle")}
                    </h3>
                    <div className="space-y-3 text-sm">
                      <div className="flex items-start justify-between">
                        <span className="text-muted-foreground">{t("details.code_label", "Code :")}</span>
                        <code className="rounded bg-muted px-2 py-1 font-mono text-xs">
                          {selectedRole.code}
                        </code>
                      </div>
                      <Separator />
                      <div className="flex items-start justify-between">
                        <span className="text-muted-foreground">{t("details.name_label", "Nom :")}</span>
                        <span className="font-medium">{selectedRole.name}</span>
                      </div>
                      {selectedRole.description && (
                        <>
                          <Separator />
                          <div className="space-y-1">
                            <span className="text-muted-foreground">{t("details.description_label", "Description :")}</span>
                            <p className="text-sm">{selectedRole.description}</p>
                          </div>
                        </>
                      )}
                      <Separator />
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">{t("details.priority_label", "Priorité :")}</span>
                        <Badge variant="outline">{selectedRole.priority}</Badge>
                      </div>
                      <Separator />
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">{t("details.type_label", "Type :")}</span>
                        <Badge variant={selectedRole.is_system ? "default" : "secondary"}>
                          {selectedRole.is_system ? t("details.type_system", "Système") : t("details.type_custom", "Personnalisé")}
                        </Badge>
                      </div>
                    </div>
                  </div>

                  {/* Permissions */}
                  <div>
                    <div className="mb-4 flex items-center justify-between">
                      <h3 className="flex items-center gap-2 font-semibold">
                        <Key className="h-4 w-4" />
                        {t("details.assigned_permissions", "Permissions assignées")}
                      </h3>
                      {selectedRole.permissions && selectedRole.permissions.length > 0 && (
                        <Badge variant="secondary">
                          {selectedRole.permissions.length}
                        </Badge>
                      )}
                    </div>

                    {selectedRole.permissions && selectedRole.permissions.length > 0 ? (
                      <div className="space-y-3">
                        {Object.entries(permissionsByModule).map(([moduleName, permissions]) => (
                          <div key={moduleName} className="rounded-lg border overflow-hidden">
                            <div className="border-b bg-muted/50 px-4 py-2.5">
                              <div className="flex items-center justify-between">
                                <h4 className="text-sm font-semibold capitalize">{moduleName}</h4>
                                <Badge variant="outline" className="text-xs">
                                  {permissions.length}
                                </Badge>
                              </div>
                            </div>
                            <div className="divide-y">
                              {permissions.map((permission) => (
                                <div
                                  key={permission.id}
                                  className="flex items-start gap-3 p-3 hover:bg-accent/30 transition-colors"
                                >
                                  <Key className="h-4 w-4 mt-0.5 text-muted-foreground flex-shrink-0" />
                                  <div className="flex-1 min-w-0 space-y-1">
                                    <p className="text-sm font-medium leading-none">
                                      {permission.name}
                                    </p>
                                    <p className="text-xs font-mono text-muted-foreground">
                                      {permission.code}
                                    </p>
                                    {permission.description && (
                                      <p className="text-xs text-muted-foreground">
                                        {permission.description}
                                      </p>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="rounded-lg border bg-muted/20 p-12 text-center">
                        <Key className="mx-auto h-10 w-10 text-muted-foreground/50" />
                        <p className="mt-3 text-sm font-medium">{t("details.no_permissions", "Aucune permission")}</p>
                        <p className="text-sm text-muted-foreground">
                          {t("details.no_permissions_description", "Ce rôle n'a aucune permission assignée")}
                        </p>
                        <Button
                          variant="outline"
                          size="sm"
                          className="mt-4"
                          onClick={() => setIsPermissionsDialogOpen(true)}
                        >
                          {t("action.assign_permissions", "Assigner des permissions")}
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Dialogs */}
      <CreateRoleDialog
        open={isCreateDialogOpen}
        onOpenChange={setIsCreateDialogOpen}
        onSuccess={loadRoles}
      />

      {selectedRole && (
        <>
          <EditRoleDialog
            open={isEditDialogOpen}
            onOpenChange={setIsEditDialogOpen}
            role={selectedRole}
            onSuccess={refreshRoles}
          />
          <DeleteRoleDialog
            open={isDeleteDialogOpen}
            onOpenChange={setIsDeleteDialogOpen}
            role={selectedRole}
            onSuccess={loadRoles}
          />
          <ManagePermissionsDialog
            open={isPermissionsDialogOpen}
            onOpenChange={setIsPermissionsDialogOpen}
            roleId={selectedRole.id}
            roleName={selectedRole.name}
            currentPermissions={selectedRole.permissions || []}
            onSuccess={refreshRoles}
          />
        </>
      )}
    </div>
  )
}
