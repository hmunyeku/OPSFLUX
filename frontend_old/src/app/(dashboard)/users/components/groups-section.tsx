"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Group } from "../groups/data/schema"
import { getGroups } from "../groups/data/groups-api"
import { GroupsTable } from "../groups/components/groups-table"
import { getColumns } from "../groups/components/groups-columns"
import { CreateGroupDialog } from "../groups/components/create-group-dialog"
import { EditGroupDialog } from "../groups/components/edit-group-dialog"
import { DeleteGroupDialog } from "../groups/components/delete-group-dialog"
import { ManagePermissionsDialog } from "../groups/components/manage-permissions-dialog"

export function GroupsSection() {
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
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-[500px] w-full" />
      </div>
    )
  }

  return (
    <>
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Groupes d&apos;utilisateurs</h3>
          <p className="text-sm text-muted-foreground">
            Organisez vos utilisateurs en groupes avec des permissions communes
          </p>
        </div>
        <Button onClick={() => setIsCreateDialogOpen(true)}>
          Créer un groupe
        </Button>
      </div>

      <GroupsTable
        columns={getColumns(handleManagePermissions, handleEditGroup, handleDeleteGroup)}
        data={groups}
      />

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
