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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Search, Shield, Key, Plus, Edit, Trash2, MoreVertical, Lock, Unlock, Filter, X, Users, UserCheck } from "lucide-react"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"
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
  const [filterType, setFilterType] = useState<"all" | "system" | "custom">("all")
  const [activeTab, setActiveTab] = useState<"list" | "details">("list")
  const [isRoleSheetOpen, setIsRoleSheetOpen] = useState(false)

  const loadRoles = async () => {
    try {
      setIsLoading(true)
      const data = await getRoles(true)
      setRoles(data)
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to load roles:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleRoleSelect = (role: Role) => {
    setSelectedRole(role)
    setIsRoleSheetOpen(true)
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

  const filteredRoles = useMemo(() => {
    return roles.filter(role => {
      // Filter by search query
      const matchesSearch = role.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        role.description?.toLowerCase().includes(searchQuery.toLowerCase())

      // Filter by type
      const matchesType = filterType === "all" ||
        (filterType === "system" && role.is_system) ||
        (filterType === "custom" && !role.is_system)

      return matchesSearch && matchesType
    })
  }, [roles, searchQuery, filterType])

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
      <div className="space-y-4 p-4">
        <Skeleton className="h-6 w-[200px]" />
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
        </div>
        <Skeleton className="h-[500px] w-full" />
      </div>
    )
  }

  return (
    <PermissionGuard permission="roles.read">
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div className="flex flex-col gap-3 p-4 sm:px-6">
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

            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <h1 className="text-2xl font-bold">{t("page.title", "Rôles & Permissions")}</h1>
              <Button onClick={() => setIsCreateDialogOpen(true)} size="sm" className="w-full sm:w-auto">
                <Plus className="mr-2 h-4 w-4" />
                {t("roles.create", "Nouveau rôle")}
              </Button>
            </div>

            {/* Stats - Always visible, responsive grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
              <Card className="bg-muted/50">
                <CardContent className="p-3 sm:p-4">
                  <div className="flex items-center gap-2">
                    <Shield className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-xs text-muted-foreground">Rôles</p>
                      <p className="text-lg sm:text-xl font-bold">{stats.totalRoles}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card className="bg-purple-50/50 dark:bg-purple-950/20">
                <CardContent className="p-3 sm:p-4">
                  <div className="flex items-center gap-2">
                    <Key className="h-4 w-4 text-purple-600" />
                    <div>
                      <p className="text-xs text-muted-foreground">Permissions</p>
                      <p className="text-lg sm:text-xl font-bold text-purple-600">{stats.totalPermissions}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card className="bg-amber-50/50 dark:bg-amber-950/20">
                <CardContent className="p-3 sm:p-4">
                  <div className="flex items-center gap-2">
                    <Lock className="h-4 w-4 text-amber-600" />
                    <div>
                      <p className="text-xs text-muted-foreground">Système</p>
                      <p className="text-lg sm:text-xl font-bold text-amber-600">{stats.systemRoles}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card className="bg-primary/5">
                <CardContent className="p-3 sm:p-4">
                  <div className="flex items-center gap-2">
                    <Unlock className="h-4 w-4 text-primary" />
                    <div>
                      <p className="text-xs text-muted-foreground">Perso</p>
                      <p className="text-lg sm:text-xl font-bold text-primary">{stats.customRoles}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 overflow-auto">
          <div className="p-4 sm:p-6 space-y-4">
            {/* Search */}
            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder={t("field.search_role", "Rechercher par nom ou description...")}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 pr-10"
              />
              {searchQuery && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 p-0"
                  onClick={() => setSearchQuery("")}
                >
                  <X className="h-3 w-3" />
                </Button>
              )}
            </div>

            {/* Filter Chips */}
            <div className="flex flex-wrap gap-2 mb-4">
              <Button
                variant={filterType === "all" ? "default" : "outline"}
                size="sm"
                onClick={() => setFilterType("all")}
                className="text-xs"
              >
                {t("filter.all", "Tous")} ({roles.length})
              </Button>
              <Button
                variant={filterType === "system" ? "default" : "outline"}
                size="sm"
                onClick={() => setFilterType("system")}
                className="text-xs gap-1.5"
              >
                <Lock className="h-3 w-3" />
                {t("filter.system", "Système")} ({stats.systemRoles})
              </Button>
              <Button
                variant={filterType === "custom" ? "default" : "outline"}
                size="sm"
                onClick={() => setFilterType("custom")}
                className="text-xs gap-1.5"
              >
                <Unlock className="h-3 w-3" />
                {t("filter.custom", "Perso")} ({stats.customRoles})
              </Button>
            </div>

            {/* Roles Grid */}
            {filteredRoles.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="mx-auto w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
                  <Shield className="h-8 w-8 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-semibold mb-2">
                  {t("message.no_role_found", "Aucun rôle trouvé")}
                </h3>
                <p className="text-sm text-muted-foreground mb-6">
                  {roles.length === 0
                    ? t("message.no_roles_yet", "Commencez par créer votre premier rôle")
                    : t("message.try_different_search", "Essayez une autre recherche ou filtre")}
                </p>
                {roles.length === 0 && (
                  <Button onClick={() => setIsCreateDialogOpen(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    {t("action.create_first_role", "Créer votre premier rôle")}
                  </Button>
                )}
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {filteredRoles.map((role) => (
                  <Card
                    key={role.id}
                    className="cursor-pointer transition-all hover:shadow-md hover:border-primary/50"
                    onClick={() => handleRoleSelect(role)}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3 mb-3">
                        <div className={cn(
                          "flex-shrink-0 w-10 h-10 rounded flex items-center justify-center",
                          role.is_system ? "bg-amber-100 dark:bg-amber-900/30" : "bg-primary/10"
                        )}>
                          {role.is_system ? (
                            <Lock className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                          ) : (
                            <Shield className="h-5 w-5 text-primary" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="font-semibold text-sm truncate mb-1">
                            {role.name}
                          </h4>
                          {role.description && (
                            <p className="text-xs text-muted-foreground line-clamp-2">
                              {role.description}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 pt-3 border-t">
                        <Badge variant="secondary" className="text-[10px] py-1 px-2 flex-1">
                          <Key className="h-3 w-3 mr-1" />
                          {role.permissions?.length || 0} perms
                        </Badge>
                        <Badge variant="outline" className="text-[10px] py-1 px-2">
                          P:{role.priority}
                        </Badge>
                        {role.is_system && (
                          <Badge variant="outline" className="text-[10px] py-1 px-2 border-amber-300 text-amber-700 dark:text-amber-400">
                            <Lock className="h-3 w-3 mr-1" />
                            Sys
                          </Badge>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </div>
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

      {/* Role Details Sheet */}
      <Sheet open={isRoleSheetOpen} onOpenChange={setIsRoleSheetOpen}>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
          {selectedRole && (
            <>
              <SheetHeader>
                <div className="flex items-center gap-3 pb-4">
                  <div className={cn(
                    "flex-shrink-0 w-14 h-14 rounded-lg flex items-center justify-center",
                    selectedRole.is_system ? "bg-amber-100 dark:bg-amber-900/30" : "bg-primary/10"
                  )}>
                    {selectedRole.is_system ? (
                      <Lock className="h-7 w-7 text-amber-600 dark:text-amber-400" />
                    ) : (
                      <Shield className="h-7 w-7 text-primary" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <SheetTitle className="text-xl truncate">
                      {selectedRole.name}
                    </SheetTitle>
                    <p className="text-sm text-muted-foreground">
                      {selectedRole.permissions?.length || 0} permission{(selectedRole.permissions?.length || 0) > 1 ? 's' : ''}
                      {selectedRole.is_system && " • Rôle système"}
                    </p>
                  </div>
                </div>
              </SheetHeader>

              <div className="space-y-6 pt-4">
                {/* Action Buttons */}
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setIsRoleSheetOpen(false)
                      setIsEditDialogOpen(true)
                    }}
                  >
                    <Edit className="h-4 w-4 mr-2" />
                    {t("action.edit", "Modifier")}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setIsRoleSheetOpen(false)
                      setIsPermissionsDialogOpen(true)
                    }}
                  >
                    <Key className="h-4 w-4 mr-2" />
                    {t("action.manage_permissions", "Permissions")}
                  </Button>
                </div>

                {/* Role Info */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">{t("details.role_info", "Informations")}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div>
                      <span className="text-xs text-muted-foreground">{t("details.name_label", "Nom")}</span>
                      <p className="text-sm font-medium mt-1">{selectedRole.name}</p>
                    </div>
                    {selectedRole.description && (
                      <div className="pt-3 border-t">
                        <span className="text-xs text-muted-foreground">{t("details.description_label", "Description")}</span>
                        <p className="text-sm mt-1">{selectedRole.description}</p>
                      </div>
                    )}
                    <div className="pt-3 border-t">
                      <span className="text-xs text-muted-foreground">{t("details.priority_label", "Priorité")}</span>
                      <p className="text-sm font-medium mt-1">{selectedRole.priority}</p>
                    </div>
                    <div className="pt-3 border-t">
                      <span className="text-xs text-muted-foreground">{t("details.type_label", "Type")}</span>
                      <p className="text-sm font-medium mt-1 flex items-center gap-2">
                        {selectedRole.is_system ? (
                          <>
                            <Lock className="h-3.5 w-3.5 text-amber-600" />
                            <span>{t("details.system_role", "Système")}</span>
                          </>
                        ) : (
                          <>
                            <Unlock className="h-3.5 w-3.5 text-primary" />
                            <span>{t("details.custom_role", "Personnalisé")}</span>
                          </>
                        )}
                      </p>
                    </div>
                  </CardContent>
                </Card>

                {/* Permissions */}
                <div>
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="text-sm font-semibold">
                      {t("details.role_permissions", "Permissions")}
                    </h3>
                    {selectedRole.permissions && selectedRole.permissions.length > 0 && (
                      <Badge variant="secondary">
                        {selectedRole.permissions.length}
                      </Badge>
                    )}
                  </div>
                  {selectedRole.permissions && selectedRole.permissions.length > 0 ? (
                    <Accordion type="multiple" defaultValue={Object.keys(permissionsByModule).slice(0, 2)} className="space-y-2">
                      {Object.entries(permissionsByModule).map(([module, permissions]) => (
                        <AccordionItem
                          key={module}
                          value={module}
                          className="rounded-md border"
                        >
                          <AccordionTrigger className="px-3 py-2 hover:no-underline hover:bg-accent/50">
                            <div className="flex items-center gap-2">
                              <Shield className="h-4 w-4 text-primary" />
                              <div className="text-left">
                                <h4 className="text-sm font-semibold">{module}</h4>
                                <p className="text-xs text-muted-foreground">
                                  {permissions.length} permission{permissions.length > 1 ? 's' : ''}
                                </p>
                              </div>
                            </div>
                          </AccordionTrigger>
                          <AccordionContent className="px-3 pb-3">
                            <div className="space-y-2">
                              {permissions.map((permission) => (
                                <div
                                  key={permission.id}
                                  className="flex items-start gap-2 rounded-md border p-2 text-sm"
                                >
                                  <Key className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                                  <div className="flex-1 min-w-0">
                                    <p className="font-medium">{permission.name}</p>
                                    {permission.description && (
                                      <p className="text-xs text-muted-foreground mt-1">
                                        {permission.description}
                                      </p>
                                    )}
                                    <Badge variant="outline" className="text-[10px] font-mono mt-2">
                                      {permission.code}
                                    </Badge>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </AccordionContent>
                        </AccordionItem>
                      ))}
                    </Accordion>
                  ) : (
                    <Card className="bg-muted/50">
                      <CardContent className="p-6 text-center">
                        <Shield className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                        <p className="text-sm font-medium mb-1">{t("details.no_permissions_title", "Aucune permission")}</p>
                        <p className="text-xs text-muted-foreground mb-4">{t("details.no_permissions_assigned", "Ce rôle n'a pas encore de permissions")}</p>
                        <Button
                          size="sm"
                          onClick={() => {
                            setIsRoleSheetOpen(false)
                            setIsPermissionsDialogOpen(true)
                          }}
                        >
                          <Plus className="h-4 w-4 mr-2" />
                          {t("action.add_permissions", "Ajouter")}
                        </Button>
                      </CardContent>
                    </Card>
                  )}
                </div>

                {/* Danger Zone */}
                {!selectedRole.is_system && (
                  <div className="pt-6 border-t">
                    <Button
                      variant="destructive"
                      className="w-full"
                      onClick={() => {
                        setIsRoleSheetOpen(false)
                        setIsDeleteDialogOpen(true)
                      }}
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      {t("action.delete", "Supprimer le rôle")}
                    </Button>
                  </div>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </PermissionGuard>
  )
}
