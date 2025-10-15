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
import { Skeleton } from "@/components/ui/skeleton"
import { Group } from "./data/schema"
import { getGroups } from "./data/groups-api"
import { GroupsTable } from "./components/groups-table"
import { getColumns } from "./components/groups-columns"
import { CreateGroupDialog } from "./components/create-group-dialog"
import { EditGroupDialog } from "./components/edit-group-dialog"
import { DeleteGroupDialog } from "./components/delete-group-dialog"
import { ManagePermissionsDialog } from "./components/manage-permissions-dialog"

export default function GroupsPage() {
  const [groups, setGroups] = useState<Group[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null)
  const [isPermissionsDialogOpen, setIsPermissionsDialogOpen] = useState(false)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)

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

  const handleManagePermissions = (group: Group) => {
    setSelectedGroup(group)
    setIsPermissionsDialogOpen(true)
  }

  const handleEditGroup = (group: Group) => {
    setSelectedGroup(group)
    setIsEditDialogOpen(true)
  }

  const handleDeleteGroup = (group: Group) => {
    setSelectedGroup(group)
    setIsDeleteDialogOpen(true)
  }

  useEffect(() => {
    loadGroups()
  }, [])

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-[300px]" />
        <Skeleton className="h-[600px] w-full" />
      </div>
    )
  }

  return (
    <>
      <div className="mb-4 flex flex-col gap-2">
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
              <BreadcrumbPage>Groupes d&apos;utilisateurs</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="flex-none text-xl font-bold tracking-tight">
              Groupes d&apos;utilisateurs
            </h2>
            <p className="text-sm text-muted-foreground">
              Gérez les groupes utilisateurs et leurs permissions
            </p>
          </div>
          <Button onClick={() => setIsCreateDialogOpen(true)}>
            Créer un groupe
          </Button>
        </div>
      </div>
      <div className="flex-1">
        <GroupsTable
          columns={getColumns(handleManagePermissions, handleEditGroup, handleDeleteGroup)}
          data={groups}
        />
      </div>

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
