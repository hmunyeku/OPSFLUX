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
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Search, Users, FolderTree, Shield, Plus, Edit, Trash2, MoreVertical, Key, UserCheck, X, UserPlus } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { cn } from "@/lib/utils"
import { Group } from "./data/schema"
import { getGroups } from "./data/groups-api"
import { CreateGroupDialog } from "./components/create-group-dialog"
import { EditGroupDialog } from "./components/edit-group-dialog"
import { DeleteGroupDialog } from "./components/delete-group-dialog"
import { ManagePermissionsDialog } from "./components/manage-permissions-dialog"
import { ManageMembersDialog } from "./components/manage-members-dialog"

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
  const [isMembersDialogOpen, setIsMembersDialogOpen] = useState(false)
  const [isGroupSheetOpen, setIsGroupSheetOpen] = useState(false)

  const loadGroups = async () => {
    try {
      setIsLoading(true)
      const data = await getGroups(true)
      setGroups(data)
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to load groups:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleGroupSelect = (group: Group) => {
    setSelectedGroup(group)
    setIsGroupSheetOpen(true)
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
    <PermissionGuard permission="groups.read">
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
                  <BreadcrumbPage>{t("breadcrumb.groups", "Groupes")}</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>

            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <h1 className="text-2xl font-bold">{t("page.title", "Groupes")}</h1>
              <Button onClick={() => setIsCreateDialogOpen(true)} size="sm" className="w-full sm:w-auto">
                <Plus className="mr-2 h-4 w-4" />
                {t("action.create_group", "Nouveau groupe")}
              </Button>
            </div>

            {/* Stats - Always visible, responsive grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
              <Card className="bg-muted/50">
                <CardContent className="p-3 sm:p-4">
                  <div className="flex items-center gap-2">
                    <FolderTree className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-xs text-muted-foreground">Groupes</p>
                      <p className="text-lg sm:text-xl font-bold">{stats.totalGroups}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card className="bg-blue-50/50 dark:bg-blue-950/20">
                <CardContent className="p-3 sm:p-4">
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-blue-600" />
                    <div>
                      <p className="text-xs text-muted-foreground">Utilisateurs</p>
                      <p className="text-lg sm:text-xl font-bold text-blue-600">{stats.totalUsers}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card className="bg-purple-50/50 dark:bg-purple-950/20">
                <CardContent className="p-3 sm:p-4">
                  <div className="flex items-center gap-2">
                    <Shield className="h-4 w-4 text-purple-600" />
                    <div>
                      <p className="text-xs text-muted-foreground">Permissions</p>
                      <p className="text-lg sm:text-xl font-bold text-purple-600">{stats.totalPermissions}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card className="bg-primary/5">
                <CardContent className="p-3 sm:p-4">
                  <div className="flex items-center gap-2">
                    <UserCheck className="h-4 w-4 text-primary" />
                    <div>
                      <p className="text-xs text-muted-foreground">Avec perms</p>
                      <p className="text-lg sm:text-xl font-bold text-primary">{stats.groupsWithPermissions}</p>
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
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder={t("action.search", "Rechercher par nom ou description...")}
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

            {/* Groups Grid */}
            {filteredGroups.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="mx-auto w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
                  <FolderTree className="h-8 w-8 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-semibold mb-2">
                  {t("message.no_group_found", "Aucun groupe trouvé")}
                </h3>
                <p className="text-sm text-muted-foreground mb-6">
                  {groups.length === 0
                    ? t("message.no_groups_yet", "Commencez par créer votre premier groupe")
                    : t("message.try_different_search", "Essayez une autre recherche")}
                </p>
                {groups.length === 0 && (
                  <Button onClick={() => setIsCreateDialogOpen(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    {t("action.create_first_group", "Créer votre premier groupe")}
                  </Button>
                )}
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {filteredGroups.map((group) => (
                  <Card
                    key={group.id}
                    className="cursor-pointer transition-all hover:shadow-md hover:border-primary/50"
                    onClick={() => handleGroupSelect(group)}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3 mb-3">
                        <div className="flex-shrink-0 w-10 h-10 rounded bg-primary/10 flex items-center justify-center">
                          <FolderTree className="h-5 w-5 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="font-semibold text-sm truncate mb-1">
                            {group.name}
                          </h4>
                          {group.description && (
                            <p className="text-xs text-muted-foreground line-clamp-2">
                              {group.description}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 pt-3 border-t">
                        <Badge
                          variant="secondary"
                          className="text-[10px] py-1 px-2 cursor-pointer hover:bg-purple-100 hover:text-purple-700 dark:hover:bg-purple-900/30 transition-colors"
                          onClick={(e) => {
                            e.stopPropagation()
                            setSelectedGroup(group)
                            setIsPermissionsDialogOpen(true)
                          }}
                        >
                          <Key className="h-3 w-3 mr-1" />
                          {group.permissions?.length || 0} perms
                        </Badge>
                        <Badge
                          variant="outline"
                          className="text-[10px] py-1 px-2 cursor-pointer hover:bg-blue-100 hover:text-blue-700 dark:hover:bg-blue-900/30 transition-colors"
                          onClick={(e) => {
                            e.stopPropagation()
                            setSelectedGroup(group)
                            setIsMembersDialogOpen(true)
                          }}
                        >
                          <Users className="h-3 w-3 mr-1" />
                          {group.users_count || 0}
                        </Badge>
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
            onOpenChange={(open) => {
              setIsPermissionsDialogOpen(open)
              // Ne pas fermer le drawer du groupe quand on ferme le dialog
              // Le drawer reste ouvert pour voir les changements
            }}
            groupId={selectedGroup.id}
            groupName={selectedGroup.name}
            currentPermissions={selectedGroup.permissions || []}
            onSuccess={async () => {
              // Actualiser les données du groupe
              await refreshGroups()
              // Garder le drawer ouvert
              setIsGroupSheetOpen(true)
            }}
          />
          <ManageMembersDialog
            open={isMembersDialogOpen}
            onOpenChange={(open) => {
              setIsMembersDialogOpen(open)
              // Ne pas fermer le drawer du groupe quand on ferme le dialog
            }}
            groupId={selectedGroup.id}
            groupName={selectedGroup.name}
            currentMembers={[]}
            onSuccess={async () => {
              // Actualiser les données du groupe
              await refreshGroups()
              // Garder le drawer ouvert
              setIsGroupSheetOpen(true)
            }}
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

      {/* Group Details Sheet */}
      <Sheet open={isGroupSheetOpen} onOpenChange={setIsGroupSheetOpen}>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
          {selectedGroup && (
            <>
              <SheetHeader>
                <div className="flex items-center gap-3 pb-4">
                  <div className="flex-shrink-0 w-14 h-14 rounded-lg bg-primary/10 flex items-center justify-center">
                    <FolderTree className="h-7 w-7 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <SheetTitle className="text-xl truncate">
                      {selectedGroup.name}
                    </SheetTitle>
                    <p className="text-sm text-muted-foreground">
                      {selectedGroup.permissions?.length || 0} permission{(selectedGroup.permissions?.length || 0) > 1 ? 's' : ''} • {selectedGroup.users_count || 0} membre{(selectedGroup.users_count || 0) > 1 ? 's' : ''}
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
                      setIsGroupSheetOpen(false)
                      setIsEditDialogOpen(true)
                    }}
                  >
                    <Edit className="h-4 w-4 mr-2" />
                    {t("action.edit", "Modifier")}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setIsGroupSheetOpen(false)
                      setIsPermissionsDialogOpen(true)
                    }}
                  >
                    <Key className="h-4 w-4 mr-2" />
                    {t("action.manage_permissions", "Permissions")}
                  </Button>
                </div>

                {/* Group Info */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">{t("details.group_info", "Informations")}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div>
                      <span className="text-xs text-muted-foreground">{t("details.name_label", "Nom")}</span>
                      <p className="text-sm font-medium mt-1">{selectedGroup.name}</p>
                    </div>
                    {selectedGroup.description && (
                      <div className="pt-3 border-t">
                        <span className="text-xs text-muted-foreground">{t("details.description_label", "Description")}</span>
                        <p className="text-sm mt-1">{selectedGroup.description}</p>
                      </div>
                    )}
                    <div className="pt-3 border-t">
                      <span className="text-xs text-muted-foreground">{t("details.users_count_label", "Utilisateurs")}</span>
                      <p className="text-sm font-medium mt-1 flex items-center gap-2">
                        <Users className="h-3.5 w-3.5 text-primary" />
                        <span>{selectedGroup.users_count || 0}</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="ml-auto h-7 text-xs"
                          onClick={() => {
                            setIsGroupSheetOpen(false)
                            setIsMembersDialogOpen(true)
                          }}
                        >
                          {t("action.manage_members", "Gérer")}
                        </Button>
                      </p>
                    </div>
                  </CardContent>
                </Card>

                {/* Permissions */}
                <div>
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="text-sm font-semibold">
                      {t("details.group_permissions", "Permissions")}
                    </h3>
                    {selectedGroup.permissions && selectedGroup.permissions.length > 0 && (
                      <Badge variant="secondary">
                        {selectedGroup.permissions.length}
                      </Badge>
                    )}
                  </div>
                  {selectedGroup.permissions && selectedGroup.permissions.length > 0 ? (
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
                        <p className="text-xs text-muted-foreground mb-4">{t("details.no_permissions_assigned", "Ce groupe n'a pas encore de permissions")}</p>
                        <Button
                          size="sm"
                          onClick={() => {
                            setIsGroupSheetOpen(false)
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
                <div className="pt-6 border-t">
                  <Button
                    variant="destructive"
                    className="w-full"
                    onClick={() => {
                      setIsGroupSheetOpen(false)
                      setIsDeleteDialogOpen(true)
                    }}
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    {t("action.delete", "Supprimer le groupe")}
                  </Button>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </PermissionGuard>
  )
}
