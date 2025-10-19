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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Search, Shield, Key, Plus, Edit, Trash2, MoreVertical, Lock, Unlock } from "lucide-react"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { Role } from "../roles/data/schema"
import { getRoles } from "../roles/data/roles-api"
import { CreateRoleDialog } from "../roles/components/create-role-dialog"
import { EditRoleDialog } from "../roles/components/edit-role-dialog"
import { DeleteRoleDialog } from "../roles/components/delete-role-dialog"
import { ManagePermissionsDialog } from "../roles/components/manage-permissions-dialog"

export default function RBACPage() {
  const { t } = useTranslation("core.rbac")
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
      // Auto-select first role if none selected
      if (!selectedRole && data.length > 0) {
        setSelectedRole(data[0])
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to load roles:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const refreshRoles = async () => {
    try {
      const data = await getRoles(true)
      setRoles(data)
      // Update selected role with fresh data
      if (selectedRole) {
        const updatedRole = data.find(r => r.id === selectedRole.id)
        if (updatedRole) {
          setSelectedRole(updatedRole)
        }
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to refresh roles:', error)
    }
  }

  const handleManagePermissions = () => {
    if (selectedRole) {
      setIsPermissionsDialogOpen(true)
    }
  }

  const handleEditRole = () => {
    if (selectedRole) {
      setIsEditDialogOpen(true)
    }
  }

  const handleDeleteRole = () => {
    if (selectedRole) {
      setIsDeleteDialogOpen(true)
    }
  }

  useEffect(() => {
    loadRoles()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const filteredRoles = roles.filter(role =>
    role.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    role.description?.toLowerCase().includes(searchQuery.toLowerCase())
  )

  // Calculate statistics
  const stats = useMemo(() => {
    const totalPermissions = roles.reduce((acc, role) => acc + (role.permissions?.length || 0), 0)
    const systemRoles = roles.filter(r => r.is_system).length
    const customRoles = roles.length - systemRoles

    return {
      totalRoles: roles.length,
      totalPermissions,
      systemRoles,
      customRoles,
    }
  }, [roles])

  // Group permissions by module
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
        <div className="grid gap-4 md:grid-cols-[350px_1fr]">
          <Skeleton className="h-[600px]" />
          <Skeleton className="h-[600px]" />
        </div>
      </div>
    )
  }

  return (
    <PermissionGuard permission="roles.read">
      <div className="mb-6 flex flex-col gap-4">
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
              <BreadcrumbPage>{t("breadcrumb.rbac", "RBAC")}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold tracking-tight">{t("page.title", "Titre")}</h2>
          <Button onClick={() => setIsCreateDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            {t("roles.create", "Create")}
          </Button>
        </div>
      </div>

      {/* Statistics Cards */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t("roles.total", "Total")}</CardTitle>
            <Shield className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalRoles}</div>
            <p className="text-xs text-muted-foreground">
              {stats.systemRoles} {t("roles.system", "System")}, {stats.customRoles} {t("roles.custom", "Custom")}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t("permissions.title", "Title")}</CardTitle>
            <Key className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalPermissions}</div>
            <p className="text-xs text-muted-foreground">
              {t("permissions.assigned_to_roles", "Assigned to roles")}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t("roles.system_roles", "System roles")}</CardTitle>
            <Lock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.systemRoles}</div>
            <p className="text-xs text-muted-foreground">
              {t("roles.not_modifiable", "Not modifiable")}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t("roles.custom_roles", "Custom roles")}</CardTitle>
            <Unlock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.customRoles}</div>
            <p className="text-xs text-muted-foreground">
              {t("roles.modifiable", "Modifiable")}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-[350px_1fr]">
        {/* Left Panel - Roles List */}
        <Card className="lg:h-[calc(100vh-200px)] lg:sticky lg:top-4">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              {t("roles.list", "List")}
            </CardTitle>
            <CardDescription>
              {t("roles.select_description", "Select description")}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder={t("field.search_role", "Search role")}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>

            {/* Roles List */}
            <ScrollArea className="h-[500px] pr-4">
              <div className="space-y-2">
                {filteredRoles.length === 0 ? (
                  <div className="py-8 text-center text-sm text-muted-foreground">
                    {t("message.no_role_found", "No role found")}
                  </div>
                ) : (
                  filteredRoles.map((role) => (
                    <div
                      key={role.id}
                      className={`group/item rounded-lg border p-3 transition-all hover:shadow-sm ${
                        selectedRole?.id === role.id ? "border-primary bg-accent shadow-sm" : ""
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div
                          className="flex-1 space-y-1 cursor-pointer"
                          onClick={() => setSelectedRole(role)}
                        >
                          <div className="flex items-center gap-2">
                            {role.is_system ? (
                              <Lock className="h-4 w-4 text-amber-500" />
                            ) : (
                              <Shield className="h-4 w-4 text-primary" />
                            )}
                            <p className="font-medium leading-none">{role.name}</p>
                          </div>
                          {role.description && (
                            <p className="text-xs text-muted-foreground line-clamp-2">
                              {role.description}
                            </p>
                          )}
                          <div className="flex flex-wrap items-center gap-2 text-xs">
                            <Badge variant="outline" className="text-xs whitespace-nowrap">
                              {role.permissions?.length || 0} perm{role.permissions?.length > 1 ? 's' : ''}
                            </Badge>
                            {role.is_system && (
                              <Badge variant="secondary" className="text-xs whitespace-nowrap">
                                Système
                              </Badge>
                            )}
                          </div>
                        </div>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0 opacity-0 group-hover/item:opacity-100 transition-opacity"
                              onClick={(e) => {
                                e.stopPropagation()
                                setSelectedRole(role)
                              }}
                            >
                              <MoreVertical className="h-4 w-4" />
                              <span className="sr-only">Actions</span>
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-48">
                            <DropdownMenuItem
                              onClick={() => {
                                setSelectedRole(role)
                                handleManagePermissions()
                              }}
                            >
                              <Key className="mr-2 h-4 w-4" />
                              Gérer les permissions
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => {
                                setSelectedRole(role)
                                handleEditRole()
                              }}
                            >
                              <Edit className="mr-2 h-4 w-4" />
                              Modifier le rôle
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              disabled={role.is_system}
                              onClick={() => {
                                setSelectedRole(role)
                                handleDeleteRole()
                              }}
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Supprimer le rôle
                            </DropdownMenuItem>
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

        {/* Right Panel - Role Permissions */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <CardTitle className="flex items-center gap-2">
                  <Key className="h-5 w-5" />
                  {selectedRole ? selectedRole.name : "Aucun rôle sélectionné"}
                </CardTitle>
                <CardDescription>
                  {selectedRole
                    ? `${selectedRole.permissions?.length || 0} permission(s)`
                    : "Sélectionnez un rôle pour voir ses permissions"
                  }
                </CardDescription>
              </div>
              {selectedRole && (
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleEditRole}
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleDeleteRole}
                    disabled={selectedRole.is_system}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleManagePermissions}
                  >
                    Gérer les permissions
                  </Button>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {!selectedRole ? (
              <div className="flex h-[500px] items-center justify-center">
                <div className="text-center">
                  <Shield className="mx-auto h-12 w-12 text-muted-foreground" />
                  <p className="mt-4 text-sm text-muted-foreground">
                    Sélectionnez un rôle dans la liste de gauche
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Role Info */}
                <div className="rounded-lg border p-4">
                  <h3 className="mb-2 font-semibold">Informations du rôle</h3>
                  <div className="space-y-2 text-sm">
                    <div>
                      <span className="text-muted-foreground">Nom : </span>
                      <span className="font-medium">{selectedRole.name}</span>
                    </div>
                    {selectedRole.description && (
                      <div>
                        <span className="text-muted-foreground">Description : </span>
                        <span>{selectedRole.description}</span>
                      </div>
                    )}
                    <div>
                      <span className="text-muted-foreground">Priorité : </span>
                      <span className="font-medium">{selectedRole.priority}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Type : </span>
                      <span className="font-medium">
                        {selectedRole.is_system ? "Rôle système" : "Rôle personnalisé"}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Permissions by Module */}
                <div>
                  <div className="mb-4 flex items-center justify-between">
                    <h3 className="font-semibold">Permissions du rôle</h3>
                    {selectedRole.permissions && selectedRole.permissions.length > 0 && (
                      <Badge variant="secondary">
                        {selectedRole.permissions.length} permission(s)
                      </Badge>
                    )}
                  </div>
                  {selectedRole.permissions && selectedRole.permissions.length > 0 ? (
                    <Accordion type="multiple" className="space-y-2">
                      {Object.entries(permissionsByModule).map(([module, permissions]) => (
                        <AccordionItem key={module} value={module} className="rounded-lg border">
                          <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-accent/50 transition-colors">
                            <div className="flex items-center justify-between w-full pr-4">
                              <div className="flex items-center gap-2">
                                <Shield className="h-4 w-4 text-muted-foreground" />
                                <h4 className="text-sm font-medium">{module}</h4>
                              </div>
                              <Badge variant="outline" className="text-xs">
                                {permissions.length} permission(s)
                              </Badge>
                            </div>
                          </AccordionTrigger>
                          <AccordionContent className="px-4 pb-4 pt-2">
                            <div className="grid gap-3">
                              {permissions.map((permission) => (
                                <div
                                  key={permission.id}
                                  className="flex items-start gap-3 rounded-lg border p-3 hover:bg-accent/50 transition-colors"
                                >
                                  <Key className="h-4 w-4 mt-0.5 text-muted-foreground" />
                                  <div className="flex-1 space-y-1">
                                    <p className="text-sm font-medium leading-none">
                                      {permission.name}
                                    </p>
                                    {permission.description && (
                                      <p className="text-xs text-muted-foreground">
                                        {permission.description}
                                      </p>
                                    )}
                                    <div className="flex items-center gap-2 mt-1">
                                      <Badge variant="secondary" className="text-xs">
                                        {permission.code}
                                      </Badge>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </AccordionContent>
                        </AccordionItem>
                      ))}
                    </Accordion>
                  ) : (
                    <div className="rounded-lg border p-8 text-center">
                      <Key className="mx-auto h-8 w-8 text-muted-foreground" />
                      <p className="mt-2 text-sm text-muted-foreground">
                        Aucune permission assignée à ce rôle
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-4"
                        onClick={handleManagePermissions}
                      >
                        Ajouter des permissions
                      </Button>
                    </div>
                  )}
                </div>
              </div>
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
          <ManagePermissionsDialog
            open={isPermissionsDialogOpen}
            onOpenChange={setIsPermissionsDialogOpen}
            roleId={selectedRole.id}
            roleName={selectedRole.name}
            currentPermissions={selectedRole.permissions || []}
            onSuccess={refreshRoles}
          />
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
        </>
      )}
    </PermissionGuard>
  )
}
