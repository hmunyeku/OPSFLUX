"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Search, Users, FolderTree, Shield, Plus, Edit, Trash2 } from "lucide-react"
import { Group } from "./data/schema"
import { getGroups } from "./data/groups-api"
import { CreateGroupDialog } from "./components/create-group-dialog"
import { EditGroupDialog } from "./components/edit-group-dialog"
import { DeleteGroupDialog } from "./components/delete-group-dialog"
import { ManagePermissionsDialog } from "./components/manage-permissions-dialog"

export default function GroupsPage() {
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
    <>
      <div className="mb-6 flex flex-col gap-4">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href="/">Accueil</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href="/users">Utilisateurs</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Groupes</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Groupes d&apos;utilisateurs</h2>
            <p className="text-sm text-muted-foreground">
              Organisez vos utilisateurs en groupes avec des permissions communes
            </p>
          </div>
          <Button onClick={() => setIsCreateDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Créer un groupe
          </Button>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-[350px_1fr]">
        {/* Left Panel - Groups Tree */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FolderTree className="h-5 w-5" />
              Arborescence des groupes
            </CardTitle>
            <CardDescription>
              Sélectionnez un groupe pour voir ses détails
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Rechercher un groupe..."
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
                    Aucun groupe trouvé
                  </div>
                ) : (
                  filteredGroups.map((group) => (
                    <div
                      key={group.id}
                      onClick={() => setSelectedGroup(group)}
                      className={`cursor-pointer rounded-lg border p-3 transition-colors hover:bg-accent ${
                        selectedGroup?.id === group.id ? "border-primary bg-accent" : ""
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 space-y-1">
                          <div className="flex items-center gap-2">
                            <Users className="h-4 w-4 text-muted-foreground" />
                            <p className="font-medium leading-none">{group.name}</p>
                          </div>
                          {group.description && (
                            <p className="text-xs text-muted-foreground line-clamp-2">
                              {group.description}
                            </p>
                          )}
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Badge variant="secondary" className="text-xs">
                              {group.users_count || 0} utilisateur(s)
                            </Badge>
                            <Badge variant="outline" className="text-xs">
                              {group.permissions?.length || 0} permission(s)
                            </Badge>
                          </div>
                        </div>
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

                {/* Permissions Table */}
                <div>
                  <h3 className="mb-4 font-semibold">Permissions du groupe</h3>
                  {selectedGroup.permissions && selectedGroup.permissions.length > 0 ? (
                    <div className="rounded-lg border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Nom de la permission</TableHead>
                            <TableHead>Description</TableHead>
                            <TableHead className="w-[100px]">Type</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {selectedGroup.permissions.map((permission) => (
                            <TableRow key={permission.id}>
                              <TableCell className="font-medium">{permission.name}</TableCell>
                              <TableCell className="text-muted-foreground">
                                {permission.description || "-"}
                              </TableCell>
                              <TableCell>
                                <Badge variant="outline">{permission.resource}</Badge>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
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
            onSuccess={loadGroups}
          />
          <EditGroupDialog
            open={isEditDialogOpen}
            onOpenChange={setIsEditDialogOpen}
            group={selectedGroup}
            groups={groups}
            onSuccess={loadGroups}
          />
          <DeleteGroupDialog
            open={isDeleteDialogOpen}
            onOpenChange={setIsDeleteDialogOpen}
            group={selectedGroup}
            onSuccess={loadGroups}
          />
        </>
      )}
    </>
  )
}
