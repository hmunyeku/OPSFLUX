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
import { Search, Users, FolderTree, Shield, Plus, Edit, Trash2, MoreVertical, Key, UserCheck } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Group } from "./data/schema"
import { getGroups } from "./data/groups-api"
import { CreateGroupDialog } from "./components/create-group-dialog"
import { EditGroupDialog } from "./components/edit-group-dialog"
import { DeleteGroupDialog } from "./components/delete-group-dialog"
import { ManagePermissionsDialog } from "./components/manage-permissions-dialog"

export default function GroupsPage() {
  const { t } = useTranslation("core.groups")
  const [groups, setGroups] = useState<Group[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null)
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [isPermissionsDialogOpen, setIsPermissionsDialogOpen] = useState(false)

  const loadGroups = async () => {
    try {
      setIsLoading(true)
      const data = await getGroups(true)
      setGroups(data)
      // Auto-select first group if none selected
      if (!selectedGroup && data.length > 0) {
        setSelectedGroup(data[0])
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to load groups:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const refreshGroups = async () => {
    try {
      const data = await getGroups(true)
      setGroups(data)
      // Update selected group with fresh data
      if (selectedGroup) {
        const updatedGroup = data.find(g => g.id === selectedGroup.id)
        if (updatedGroup) {
          setSelectedGroup(updatedGroup)
        }
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to refresh groups:', error)
    }
  }

  const handleManagePermissions = () => {
    if (selectedGroup) {
      setIsPermissionsDialogOpen(true)
    }
  }

  const handleEditGroup = () => {
    if (selectedGroup) {
      setIsEditDialogOpen(true)
    }
  }

  const handleDeleteGroup = () => {
    if (selectedGroup) {
      setIsDeleteDialogOpen(true)
    }
  }

  useEffect(() => {
    loadGroups()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const filteredGroups = groups.filter(group =>
    group.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    group.description?.toLowerCase().includes(searchQuery.toLowerCase())
  )

  // Calculate statistics
  const stats = useMemo(() => {
    const totalUsers = groups.reduce((acc, group) => acc + (group.users_count || 0), 0)
    const totalPermissions = groups.reduce((acc, group) => acc + (group.permissions?.length || 0), 0)
    const groupsWithPermissions = groups.filter(g => g.permissions && g.permissions.length > 0).length

    return {
      totalGroups: groups.length,
      totalUsers,
      totalPermissions,
      groupsWithPermissions,
    }
  }, [groups])

  // Group permissions by module
  const permissionsByModule = useMemo(() => {
    if (!selectedGroup?.permissions) return {}

    return selectedGroup.permissions.reduce((acc, permission) => {
      const moduleName = permission.module || 'Autre'
      if (!acc[moduleName]) {
        acc[moduleName] = []
      }
      acc[moduleName].push(permission)
      return acc
    }, {} as Record<string, typeof selectedGroup.permissions>)
  }, [selectedGroup])

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
    <PermissionGuard permission="groups.read">
      <div className="mb-6 flex flex-col gap-4">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href="/">{t("breadcrumb.home")}</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href="/users">{t("breadcrumb.users")}</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>{t("breadcrumb.groups")}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold tracking-tight">{t("page.title")}</h2>
          <Button onClick={() => setIsCreateDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            {t("action.create")}
          </Button>
        </div>
      </div>

      {/* Statistics Cards */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t("stats.total_groups")}</CardTitle>
            <FolderTree className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalGroups}</div>
            <p className="text-xs text-muted-foreground">
              {stats.groupsWithPermissions} {t("stats.with_permissions")}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t("stats.total_users")}</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalUsers}</div>
            <p className="text-xs text-muted-foreground">
              {t("stats.in_all_groups")}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t("stats.permissions")}</CardTitle>
            <Shield className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalPermissions}</div>
            <p className="text-xs text-muted-foreground">
              {t("stats.assigned_to_groups")}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t("stats.active_groups")}</CardTitle>
            <UserCheck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.groupsWithPermissions}</div>
            <p className="text-xs text-muted-foreground">
              {t("stats.with_configured_access")}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-[350px_1fr]">
        {/* Left Panel - Groups Tree */}
        <Card className="lg:h-[calc(100vh-200px)] lg:sticky lg:top-4">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FolderTree className="h-5 w-5" />
              {t("page.tree_title")}
            </CardTitle>
            <CardDescription>
              {t("page.select_group")}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder={t("action.search")}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>

            {/* Groups List */}
            <ScrollArea className="h-[500px] pr-4">
              <div className="space-y-2">
                {filteredGroups.length === 0 ? (
                  <div className="py-8 text-center text-sm text-muted-foreground">
                    {t("message.no_group_found")}
                  </div>
                ) : (
                  filteredGroups.map((group) => (
                    <div
                      key={group.id}
                      className={`group/item rounded-lg border p-3 transition-all hover:shadow-sm ${
                        selectedGroup?.id === group.id ? "border-primary bg-accent shadow-sm" : ""
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div
                          className="flex-1 space-y-1 cursor-pointer"
                          onClick={() => setSelectedGroup(group)}
                        >
                          <div className="flex items-center gap-2">
                            <FolderTree className="h-4 w-4 text-primary" />
                            <p className="font-medium leading-none">{group.name}</p>
                          </div>
                          {group.description && (
                            <p className="text-xs text-muted-foreground line-clamp-2">
                              {group.description}
                            </p>
                          )}
                          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                            <Badge variant="secondary" className="text-xs whitespace-nowrap">
                              {group.users_count || 0} user{group.users_count > 1 ? 's' : ''}
                            </Badge>
                            <Badge variant="outline" className="text-xs whitespace-nowrap">
                              {group.permissions?.length || 0} perm{group.permissions?.length > 1 ? 's' : ''}
                            </Badge>
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
                                setSelectedGroup(group)
                              }}
                            >
                              <MoreVertical className="h-4 w-4" />
                              <span className="sr-only">Actions</span>
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-48">
                            <DropdownMenuItem
                              onClick={() => {
                                setSelectedGroup(group)
                                handleManagePermissions()
                              }}
                            >
                              <Shield className="mr-2 h-4 w-4" />
                              Gérer les permissions
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => {
                                setSelectedGroup(group)
                                handleEditGroup()
                              }}
                            >
                              <Edit className="mr-2 h-4 w-4" />
                              Modifier le groupe
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() => setIsCreateDialogOpen(true)}
                            >
                              <Plus className="mr-2 h-4 w-4" />
                              Créer un sous-groupe
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() => {
                                setSelectedGroup(group)
                                handleDeleteGroup()
                              }}
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Supprimer le groupe
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

        {/* Right Panel - Group Details & Permissions */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <CardTitle className="flex items-center gap-2">
                  <Shield className="h-5 w-5" />
                  {selectedGroup ? selectedGroup.name : "Aucun groupe sélectionné"}
                </CardTitle>
                <CardDescription>
                  {selectedGroup
                    ? `${selectedGroup.permissions?.length || 0} permission(s) • ${selectedGroup.users_count || 0} utilisateur(s)`
                    : "Sélectionnez un groupe pour voir ses permissions"
                  }
                </CardDescription>
              </div>
              {selectedGroup && (
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleEditGroup}
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleDeleteGroup}
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
            {!selectedGroup ? (
              <div className="flex h-[500px] items-center justify-center">
                <div className="text-center">
                  <FolderTree className="mx-auto h-12 w-12 text-muted-foreground" />
                  <p className="mt-4 text-sm text-muted-foreground">
                    Sélectionnez un groupe dans la liste de gauche
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Group Info */}
                <div className="rounded-lg border p-4">
                  <h3 className="mb-2 font-semibold">Informations du groupe</h3>
                  <div className="space-y-2 text-sm">
                    <div>
                      <span className="text-muted-foreground">Nom : </span>
                      <span className="font-medium">{selectedGroup.name}</span>
                    </div>
                    {selectedGroup.description && (
                      <div>
                        <span className="text-muted-foreground">Description : </span>
                        <span>{selectedGroup.description}</span>
                      </div>
                    )}
                    <div>
                      <span className="text-muted-foreground">Nombre d&apos;utilisateurs : </span>
                      <span className="font-medium">{selectedGroup.users_count || 0}</span>
                    </div>
                  </div>
                </div>

                {/* Permissions by Module */}
                <div>
                  <div className="mb-4 flex items-center justify-between">
                    <h3 className="font-semibold">Permissions du groupe</h3>
                    {selectedGroup.permissions && selectedGroup.permissions.length > 0 && (
                      <Badge variant="secondary">
                        {selectedGroup.permissions.length} permission(s)
                      </Badge>
                    )}
                  </div>
                  {selectedGroup.permissions && selectedGroup.permissions.length > 0 ? (
                    <div className="space-y-4">
                      {Object.entries(permissionsByModule).map(([moduleName, permissions]) => (
                        <div key={moduleName} className="rounded-lg border">
                          <div className="border-b bg-muted/50 px-4 py-2">
                            <div className="flex items-center justify-between">
                              <h4 className="text-sm font-medium">{moduleName}</h4>
                              <Badge variant="outline" className="text-xs">
                                {permissions.length}
                              </Badge>
                            </div>
                          </div>
                          <div className="p-4">
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
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-lg border p-8 text-center">
                      <Shield className="mx-auto h-8 w-8 text-muted-foreground" />
                      <p className="mt-2 text-sm text-muted-foreground">
                        Aucune permission assignée à ce groupe
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
      <CreateGroupDialog
        open={isCreateDialogOpen}
        onOpenChange={setIsCreateDialogOpen}
        onSuccess={loadGroups}
        groups={groups}
      />

      {selectedGroup && (
        <>
          <ManagePermissionsDialog
            open={isPermissionsDialogOpen}
            onOpenChange={setIsPermissionsDialogOpen}
            groupId={selectedGroup.id}
            groupName={selectedGroup.name}
            currentPermissions={selectedGroup.permissions || []}
            onSuccess={refreshGroups}
          />
          <EditGroupDialog
            open={isEditDialogOpen}
            onOpenChange={setIsEditDialogOpen}
            group={selectedGroup}
            groups={groups}
            onSuccess={refreshGroups}
          />
          <DeleteGroupDialog
            open={isDeleteDialogOpen}
            onOpenChange={setIsDeleteDialogOpen}
            group={selectedGroup}
            onSuccess={loadGroups}
          />
        </>
      )}
    </PermissionGuard>
  )
}
