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
      {/* Compact Header with Inline Stats */}
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
                <BreadcrumbPage>{t("breadcrumb.groups", "Groupes")}</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-bold">{t("page.title", "Groupes")}</h1>

              {/* Inline stats */}
              <div className="hidden lg:flex items-center gap-3 text-sm text-muted-foreground border-l pl-4 ml-2">
                <div className="flex items-center gap-1.5">
                  <FolderTree className="h-3.5 w-3.5" />
                  <span className="font-medium">{stats.totalGroups}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Users className="h-3.5 w-3.5" />
                  <span className="font-medium">{stats.totalUsers}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Shield className="h-3.5 w-3.5" />
                  <span className="font-medium">{stats.totalPermissions}</span>
                </div>
                <div className="flex items-center gap-1.5 text-primary">
                  <UserCheck className="h-3.5 w-3.5" />
                  <span className="font-medium">{stats.groupsWithPermissions}</span>
                </div>
              </div>
            </div>

            <Button onClick={() => setIsCreateDialogOpen(true)} size="sm">
              <Plus className="mr-2 h-4 w-4" />
              {t("action.create_group", "Nouveau groupe")}
            </Button>
          </div>
        </div>
      </div>

      {/* Main Content - Fullwidth Layout */}
      <div className="flex h-[calc(100vh-140px)] overflow-hidden">
        {/* Left Sidebar - Groups List */}
        <div className="w-full lg:w-72 border-r flex flex-col bg-muted/20 overflow-hidden">
          {/* Sidebar Header */}
          <div className="p-3 border-b bg-background/50">
            <h2 className="font-semibold text-xs mb-2 uppercase tracking-wide text-muted-foreground">{t("page.tree_title", "Groupes")}</h2>
            {/* Search and Filters */}
            <div className="space-y-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder={t("action.search", "Rechercher...")}
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
            </div>
          </div>

          {/* Groups List */}
          <ScrollArea className="flex-1 px-3 py-2">
            <div className="space-y-1 max-w-full">
              {filteredGroups.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  {t("message.no_group_found", "Aucun groupe trouvé")}
                </div>
              ) : (
                filteredGroups.map((group) => (
                  <div
                    key={group.id}
                    onClick={() => setSelectedGroup(group)}
                    className={cn(
                      "group/item rounded-md border p-1.5 cursor-pointer transition-all max-w-full overflow-hidden",
                      "hover:shadow-sm hover:border-primary/50",
                      selectedGroup?.id === group.id ? "border-primary bg-accent/50 shadow-sm" : "hover:bg-accent/30"
                    )}
                  >
                    {/* Header with icon and title */}
                    <div className="flex items-start gap-1.5 min-w-0">
                      <div className="flex-shrink-0 w-6 h-6 rounded bg-primary/10 flex items-center justify-center">
                        <FolderTree className="h-3 w-3 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0 overflow-hidden">
                        <div className="flex items-start justify-between gap-1 min-w-0">
                          <h4 className="font-semibold text-xs truncate flex-1 min-w-0">{group.name}</h4>
                          {/* Quick Actions */}
                          <div className="flex items-center gap-0.5 opacity-0 group-hover/item:opacity-100 transition-opacity flex-shrink-0">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-5 w-5 p-0"
                              onClick={(e) => {
                                e.stopPropagation()
                                setSelectedGroup(group)
                                handleManagePermissions()
                              }}
                              title={t("action.manage_permissions", "Permissions")}
                            >
                              <Key className="h-2.5 w-2.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-5 w-5 p-0"
                              onClick={(e) => {
                                e.stopPropagation()
                                setSelectedGroup(group)
                                handleEditGroup()
                              }}
                              title={t("action.edit", "Modifier")}
                            >
                              <Edit className="h-2.5 w-2.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-5 w-5 p-0 text-destructive hover:text-destructive"
                              onClick={(e) => {
                                e.stopPropagation()
                                setSelectedGroup(group)
                                handleDeleteGroup()
                              }}
                              title={t("action.delete", "Supprimer")}
                            >
                              <Trash2 className="h-2.5 w-2.5" />
                            </Button>
                          </div>
                        </div>
                        {group.description && (
                          <p className="text-[10px] text-muted-foreground line-clamp-1 mt-0.5 overflow-hidden">
                            {group.description}
                          </p>
                        )}
                        {/* Footer with badges inline */}
                        <div className="flex items-center gap-1 mt-1 overflow-hidden">
                          <Badge variant="secondary" className="text-[9px] py-0 px-1 h-4 font-medium flex-shrink-0">
                            <Users className="h-2.5 w-2.5 mr-0.5" />
                            {group.users_count || 0}
                          </Badge>
                          <Badge variant="outline" className="text-[9px] py-0 px-1 h-4 font-medium flex-shrink-0">
                            <Key className="h-2.5 w-2.5 mr-0.5" />
                            {group.permissions?.length || 0}
                          </Badge>
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
        </div>

        {/* Right Panel - Group Details & Permissions */}
        <div className="flex-1 flex flex-col bg-background overflow-hidden">
          {/* Header */}
          <div className="border-b bg-background/50 px-4 py-3">
            <div className="flex items-center justify-between gap-4">
              <div className="flex-1 min-w-0">
                <h2 className="flex items-center gap-2 text-lg font-bold truncate">
                  <FolderTree className="h-5 w-5 flex-shrink-0 text-primary" />
                  <span className="truncate">{selectedGroup ? selectedGroup.name : t("message.no_group_selected", "Aucun groupe")}</span>
                </h2>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {selectedGroup
                    ? `${selectedGroup.permissions?.length || 0} ${t("message.permissions", "permission")}${(selectedGroup.permissions?.length || 0) > 1 ? 's' : ''} • ${selectedGroup.users_count || 0} ${t("message.users", "utilisateur")}${(selectedGroup.users_count || 0) > 1 ? 's' : ''}`
                    : t("message.select_group_to_view", "Sélectionnez un groupe")
                  }
                </p>
              </div>
              {selectedGroup && (
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleEditGroup}
                  >
                    <Edit className="h-4 w-4 mr-2" />
                    {t("action.edit", "Modifier")}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleDeleteGroup}
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
              {!selectedGroup ? (
                <div className="flex h-[400px] items-center justify-center">
                  <div className="text-center max-w-md px-4">
                    <div className="mx-auto w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                      <FolderTree className="h-10 w-10 text-primary/60" />
                    </div>
                    <h3 className="text-lg font-semibold mb-2">
                      {t("message.no_group_selected_title", "Sélectionnez un groupe")}
                    </h3>
                    <p className="text-sm text-muted-foreground mb-6">
                      {t("message.select_group_from_list", "Choisissez un groupe dans la liste pour voir ses détails, permissions et membres")}
                    </p>
                    {groups.length === 0 && (
                      <Button onClick={() => setIsCreateDialogOpen(true)}>
                        <Plus className="h-4 w-4 mr-2" />
                        {t("action.create_first_group", "Créer votre premier groupe")}
                      </Button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Group Info */}
                  <div className="border-b pb-4">
                    <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {t("details.group_info", "Informations")}
                    </h3>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <span className="text-xs text-muted-foreground">{t("details.name_label", "Nom")}</span>
                        <p className="text-sm font-medium mt-1">{selectedGroup.name}</p>
                      </div>
                      <div>
                        <span className="text-xs text-muted-foreground">{t("details.users_count_label", "Utilisateurs")}</span>
                        <p className="text-sm font-medium mt-1 flex items-center gap-2">
                          <Users className="h-3.5 w-3.5 text-primary" />
                          <span>{selectedGroup.users_count || 0}</span>
                        </p>
                      </div>
                      {selectedGroup.description && (
                        <div className="sm:col-span-2">
                          <span className="text-xs text-muted-foreground">{t("details.description_label", "Description")}</span>
                          <p className="text-sm mt-1">{selectedGroup.description}</p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Permissions by Module */}
                  <div>
                    <div className="mb-3 flex items-center justify-between">
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {t("details.group_permissions", "Permissions")}
                      </h3>
                      {selectedGroup.permissions && selectedGroup.permissions.length > 0 && (
                        <Badge variant="secondary">
                          {selectedGroup.permissions.length}
                        </Badge>
                      )}
                    </div>
                    {selectedGroup.permissions && selectedGroup.permissions.length > 0 ? (
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
                          <Shield className="h-6 w-6 text-primary/60" />
                        </div>
                        <p className="text-sm font-medium text-foreground mb-1">
                          {t("details.no_permissions_title", "Aucune permission")}
                        </p>
                        <p className="text-xs text-muted-foreground mb-4">
                          {t("details.no_permissions_assigned", "Ce groupe n'a pas encore de permissions assignées")}
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

                  {/* Members Section */}
                  <div>
                    <div className="mb-4 flex items-center justify-between">
                      <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                        {t("details.group_members", "Membres")}
                      </h3>
                      <div className="flex items-center gap-2">
                        {selectedGroup.users_count ? (
                          <Badge variant="secondary">
                            {selectedGroup.users_count}
                          </Badge>
                        ) : null}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setIsMembersDialogOpen(true)}
                        >
                          <UserPlus className="h-3.5 w-3.5 mr-2" />
                          {t("action.manage_members", "Gérer")}
                        </Button>
                      </div>
                    </div>
                    {selectedGroup.users_count && selectedGroup.users_count > 0 ? (
                      <div className="rounded-lg border p-6 bg-accent/20">
                        <div className="flex items-center justify-center gap-3">
                          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                            <Users className="h-6 w-6 text-primary" />
                          </div>
                          <div className="text-center">
                            <p className="text-2xl font-bold">{selectedGroup.users_count}</p>
                            <p className="text-xs text-muted-foreground">
                              {selectedGroup.users_count > 1 ? t("details.members_plural", "membres") : t("details.members_singular", "membre")}
                            </p>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="rounded-lg border p-8 text-center bg-accent/20">
                        <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-3">
                          <Users className="h-6 w-6 text-primary/60" />
                        </div>
                        <p className="text-sm font-medium text-foreground mb-1">
                          {t("details.no_members_title", "Aucun membre")}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {t("details.no_members_description", "Ce groupe n'a pas encore de membres")}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>
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
            onOpenChange={setIsPermissionsDialogOpen}
            groupId={selectedGroup.id}
            groupName={selectedGroup.name}
            currentPermissions={selectedGroup.permissions || []}
            onSuccess={refreshGroups}
          />
          <ManageMembersDialog
            open={isMembersDialogOpen}
            onOpenChange={setIsMembersDialogOpen}
            groupId={selectedGroup.id}
            groupName={selectedGroup.name}
            currentMembers={[]}
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
