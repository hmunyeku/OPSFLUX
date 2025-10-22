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
      {/* Compact Header */}
      <div className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-10">
        <div className="flex flex-col gap-2 px-4 py-3">
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
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-bold">{t("page.title", "Rôles & Permissions")}</h1>

              {/* Inline stats */}
              <div className="hidden lg:flex items-center gap-3 text-sm text-muted-foreground border-l pl-4 ml-2">
                <div className="flex items-center gap-1.5">
                  <Shield className="h-3.5 w-3.5" />
                  <span className="font-medium">{stats.totalRoles}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Key className="h-3.5 w-3.5" />
                  <span className="font-medium">{stats.totalPermissions}</span>
                </div>
                <div className="flex items-center gap-1.5 text-amber-600">
                  <Lock className="h-3.5 w-3.5" />
                  <span className="font-medium">{stats.systemRoles}</span>
                </div>
                <div className="flex items-center gap-1.5 text-primary">
                  <Unlock className="h-3.5 w-3.5" />
                  <span className="font-medium">{stats.customRoles}</span>
                </div>
              </div>
            </div>

            <Button onClick={() => setIsCreateDialogOpen(true)} size="sm">
              <Plus className="mr-2 h-4 w-4" />
              {t("roles.create", "Nouveau rôle")}
            </Button>
          </div>
        </div>
      </div>

      {/* Main Content - Fullwidth Layout */}
      <div className="flex h-[calc(100vh-140px)] overflow-hidden">
        {/* Left Sidebar - Roles List */}
        <div className="w-full lg:w-72 border-r flex flex-col bg-muted/20">
          {/* Sidebar Header */}
          <div className="p-3 border-b bg-background/50">
            <h2 className="font-semibold text-xs mb-2 uppercase tracking-wide text-muted-foreground">{t("roles.list", "Rôles")}</h2>
            {/* Search and Filters */}
            <div className="space-y-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder={t("field.search_role", "Rechercher...")}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 pr-10 h-9"
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
              <div className="flex flex-wrap gap-1.5">
                <Button
                  variant={filterType === "all" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setFilterType("all")}
                  className="h-8 text-xs"
                >
                  {t("filter.all", "Tous")} ({roles.length})
                </Button>
                <Button
                  variant={filterType === "system" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setFilterType("system")}
                  className="h-8 text-xs gap-1.5"
                >
                  <Lock className="h-3 w-3" />
                  {t("filter.system", "Système")} ({stats.systemRoles})
                </Button>
                <Button
                  variant={filterType === "custom" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setFilterType("custom")}
                  className="h-8 text-xs gap-1.5"
                >
                  <Unlock className="h-3 w-3" />
                  {t("filter.custom", "Perso")} ({stats.customRoles})
                </Button>
              </div>
            </div>

          </div>

          {/* Roles List */}
          <ScrollArea className="flex-1 px-3 py-2">
            <div className="space-y-1">
              {filteredRoles.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  {t("message.no_role_found", "Aucun rôle trouvé")}
                </div>
              ) : (
                filteredRoles.map((role) => (
                  <div
                    key={role.id}
                    onClick={() => {
                      setSelectedRole(role)
                      if (window.innerWidth < 1024) setActiveTab("details")
                    }}
                    className={cn(
                      "group/item rounded-md border p-2 cursor-pointer transition-all",
                      "hover:shadow-sm hover:border-primary/50",
                      selectedRole?.id === role.id ? "border-primary bg-accent/50 shadow-sm" : "hover:bg-accent/30"
                    )}
                  >
                    {/* Header with icon and title */}
                    <div className="flex items-start gap-2 mb-1">
                      <div className={cn(
                        "flex-shrink-0 w-7 h-7 rounded flex items-center justify-center",
                        role.is_system ? "bg-amber-100 dark:bg-amber-900/30" : "bg-primary/10"
                      )}>
                        {role.is_system ? (
                          <Lock className="h-3 w-3 text-amber-600 dark:text-amber-400" />
                        ) : (
                          <Shield className="h-3 w-3 text-primary" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <h4 className="font-semibold text-sm truncate">{role.name}</h4>
                          {/* Quick Actions */}
                          <div className="flex items-center gap-1 opacity-0 group-hover/item:opacity-100 transition-opacity">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0"
                              onClick={(e) => {
                                e.stopPropagation()
                                setSelectedRole(role)
                                handleManagePermissions()
                              }}
                              title={t("action.manage_permissions", "Permissions")}
                            >
                              <Key className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0"
                              onClick={(e) => {
                                e.stopPropagation()
                                setSelectedRole(role)
                                handleEditRole()
                              }}
                              title={t("action.edit", "Modifier")}
                            >
                              <Edit className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                              disabled={role.is_system}
                              onClick={(e) => {
                                e.stopPropagation()
                                setSelectedRole(role)
                                handleDeleteRole()
                              }}
                              title={t("action.delete", "Supprimer")}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                        {role.description && (
                          <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                            {role.description}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Footer with badges */}
                    <div className="flex flex-wrap items-center gap-1 mt-1.5 pt-1.5 border-t">
                      <Badge
                        variant={(role.permissions?.length || 0) > 0 ? "secondary" : "outline"}
                        className={cn(
                          "text-[10px] font-medium",
                          (role.permissions?.length || 0) === 0 && "border-destructive/50 text-destructive"
                        )}
                      >
                        <Key className="h-3 w-3 mr-1" />
                        {role.permissions?.length || 0} {t("permissions.count", "perm")}{role.permissions?.length > 1 ? 's' : ''}
                      </Badge>
                      <Badge variant="outline" className="text-[10px] font-medium">
                        {t("roles.badge.priority", "Priorité")} {role.priority}
                      </Badge>
                      {role.is_system && (
                        <Badge variant="outline" className="text-[10px] border-amber-300 text-amber-700 dark:text-amber-400">
                          <Lock className="h-3 w-3 mr-1" />
                          {t("roles.badge.system", "Système")}
                        </Badge>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
        </div>

        {/* Right Panel - Role Permissions */}
        <div className="flex-1 flex flex-col bg-background overflow-hidden">
          {/* Header */}
          <div className="border-b bg-background/50 px-4 py-3">
            <div className="flex items-center justify-between gap-4">
              <div className="flex-1 min-w-0">
                <h2 className="flex items-center gap-2 text-lg font-bold truncate">
                  <Key className="h-5 w-5 flex-shrink-0 text-primary" />
                  <span className="truncate">{selectedRole ? selectedRole.name : t("message.no_role_selected", "Aucun rôle")}</span>
                </h2>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {selectedRole
                    ? `${selectedRole.permissions?.length || 0} ${t("message.permissions", "permission")}${(selectedRole.permissions?.length || 0) > 1 ? 's' : ''}`
                    : t("message.select_role_to_view", "Sélectionnez un rôle")
                  }
                </p>
              </div>
              {selectedRole && (
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleEditRole}
                  >
                    <Edit className="h-4 w-4 mr-2" />
                    {t("action.edit", "Modifier")}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleDeleteRole}
                    disabled={selectedRole.is_system}
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    {t("action.delete", "Supprimer")}
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleManagePermissions}
                  >
                    <Key className="h-4 w-4 mr-2" />
                    {t("action.manage_permissions", "Permissions")}
                  </Button>
                </div>
              )}
            </div>
          </div>

          {/* Content */}
          <ScrollArea className="flex-1">
            <div className="px-4 py-4">
              {!selectedRole ? (
                <div className="flex h-[400px] items-center justify-center">
                  <div className="text-center max-w-md px-4">
                    <div className="mx-auto w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                      <Shield className="h-10 w-10 text-primary/60" />
                    </div>
                    <h3 className="text-lg font-semibold mb-2">
                      {t("message.no_role_selected_title", "Sélectionnez un rôle")}
                    </h3>
                    <p className="text-sm text-muted-foreground mb-6">
                      {t("message.select_role_from_list", "Choisissez un rôle dans la liste pour voir ses détails et permissions")}
                    </p>
                    {roles.length === 0 && (
                      <Button onClick={() => setIsCreateDialogOpen(true)}>
                        <Plus className="h-4 w-4 mr-2" />
                        {t("action.create_first_role", "Créer votre premier rôle")}
                      </Button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Role Info */}
                  <div className="border-b pb-4">
                    <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {t("details.role_info", "Informations")}
                    </h3>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <span className="text-xs text-muted-foreground">{t("details.name_label", "Nom")}</span>
                        <p className="text-sm font-medium mt-1">{selectedRole.name}</p>
                      </div>
                      <div>
                        <span className="text-xs text-muted-foreground">{t("details.priority_label", "Priorité")}</span>
                        <p className="text-sm font-medium mt-1">{selectedRole.priority}</p>
                      </div>
                      {selectedRole.description && (
                        <div className="sm:col-span-2">
                          <span className="text-xs text-muted-foreground">{t("details.description_label", "Description")}</span>
                          <p className="text-sm mt-1">{selectedRole.description}</p>
                        </div>
                      )}
                      <div>
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
                    </div>
                  </div>

                  {/* Permissions by Module */}
                  <div>
                    <div className="mb-3 flex items-center justify-between">
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {t("details.role_permissions", "Permissions")}
                      </h3>
                      {selectedRole.permissions && selectedRole.permissions.length > 0 && (
                        <Badge variant="secondary">
                          {selectedRole.permissions.length}
                        </Badge>
                      )}
                    </div>
                    {selectedRole.permissions && selectedRole.permissions.length > 0 ? (
                      <Accordion type="multiple" defaultValue={Object.keys(permissionsByModule).slice(0, 2)} className="space-y-1.5">
                        {Object.entries(permissionsByModule).map(([module, permissions]) => (
                          <AccordionItem
                            key={module}
                            value={module}
                            className="rounded-md border overflow-hidden"
                          >
                            <AccordionTrigger className="px-3 py-2.5 hover:no-underline hover:bg-accent/50 transition-colors [&[data-state=open]]:bg-accent">
                              <div className="flex items-center justify-between w-full pr-3">
                                <div className="flex items-center gap-2.5">
                                  <div className="flex-shrink-0 w-7 h-7 rounded bg-primary/10 flex items-center justify-center">
                                    <Shield className="h-3.5 w-3.5 text-primary" />
                                  </div>
                                  <div className="text-left">
                                    <h4 className="text-sm font-semibold">{module}</h4>
                                    <p className="text-[10px] text-muted-foreground">
                                      {permissions.length} {t("permissions.count", "permission")}{permissions.length > 1 ? 's' : ''}
                                    </p>
                                  </div>
                                </div>
                              </div>
                            </AccordionTrigger>
                            <AccordionContent className="px-3 pb-3 pt-1.5">
                              <div className="space-y-1.5">
                                {permissions.map((permission) => (
                                  <div
                                    key={permission.id}
                                    className="flex items-start gap-2.5 rounded-md border p-2.5 hover:bg-accent/30 transition-colors"
                                  >
                                    <div className="flex-shrink-0 w-5 h-5 rounded bg-primary/10 flex items-center justify-center mt-0.5">
                                      <Key className="h-3 w-3 text-primary" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <p className="text-sm font-medium leading-tight">
                                        {permission.name}
                                      </p>
                                      {permission.description && (
                                        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
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
                      <div className="rounded-lg border p-8 text-center bg-accent/20">
                        <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-3">
                          <Key className="h-6 w-6 text-primary/60" />
                        </div>
                        <p className="text-sm font-medium text-foreground mb-1">
                          {t("details.no_permissions_title", "Aucune permission")}
                        </p>
                        <p className="text-xs text-muted-foreground mb-4">
                          {t("details.no_permissions_assigned", "Ce rôle n'a pas encore de permissions assignées")}
                        </p>
                        <Button
                          variant="default"
                          size="sm"
                          onClick={handleManagePermissions}
                        >
                          <Plus className="h-4 w-4 mr-2" />
                          {t("action.add_permissions", "Ajouter des permissions")}
                        </Button>
                      </div>
                    )}
                  </div>

                  {/* Users Section - TODO: This would require backend support to get users by role */}
                  <div className="pt-6 border-t">
                    <div className="mb-4 flex items-center justify-between">
                      <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                        {t("details.role_users", "Utilisateurs")}
                      </h3>
                    </div>
                    <div className="rounded-lg border p-6 bg-accent/20">
                      <div className="flex items-center justify-center gap-3">
                        <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                          <UserCheck className="h-6 w-6 text-primary/60" />
                        </div>
                        <div className="text-center">
                          <p className="text-xs text-muted-foreground">
                            {t("details.users_info_coming_soon", "Informations utilisateurs à venir")}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>
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
    </PermissionGuard>
  )
}
