"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Role } from "../../roles/data/schema"
import { getRoles } from "../../roles/data/roles-api"
import { RolesTable } from "../../roles/components/roles-table"
import { getColumns } from "../../roles/components/roles-columns"
import { CreateRoleDialog } from "../../roles/components/create-role-dialog"
import { ManagePermissionsDialog } from "../../roles/components/manage-permissions-dialog"
import { EditRoleDialog } from "../../roles/components/edit-role-dialog"
import { DeleteRoleDialog } from "../../roles/components/delete-role-dialog"
import { ManageMembersDialog } from "../../roles/components/manage-members-dialog"

export function RolesSection() {
  const [roles, setRoles] = useState<Role[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [selectedRole, setSelectedRole] = useState<Role | null>(null)
  const [isPermissionsDialogOpen, setIsPermissionsDialogOpen] = useState(false)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [isMembersDialogOpen, setIsMembersDialogOpen] = useState(false)

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

  const handleManagePermissions = (role: Role) => {
    setSelectedRole(role)
    setIsPermissionsDialogOpen(true)
  }

  const handleEditRole = (role: Role) => {
    setSelectedRole(role)
    setIsEditDialogOpen(true)
  }

  const handleDeleteRole = (role: Role) => {
    setSelectedRole(role)
    setIsDeleteDialogOpen(true)
  }

  const handleManageMembers = (role: Role) => {
    setSelectedRole(role)
    setIsMembersDialogOpen(true)
  }

  useEffect(() => {
    loadRoles()
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
          <h3 className="text-lg font-semibold">Gestion des rôles</h3>
          <p className="text-sm text-muted-foreground">
            Créez et gérez les rôles de votre système
          </p>
        </div>
        <Button onClick={() => setIsCreateDialogOpen(true)}>
          Créer un rôle
        </Button>
      </div>

      <RolesTable
        columns={getColumns(handleManagePermissions, handleEditRole, handleDeleteRole, handleManageMembers)}
        data={roles}
      />

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
            onSuccess={loadRoles}
          />
          <EditRoleDialog
            open={isEditDialogOpen}
            onOpenChange={setIsEditDialogOpen}
            role={selectedRole}
            onSuccess={loadRoles}
          />
          <DeleteRoleDialog
            open={isDeleteDialogOpen}
            onOpenChange={setIsDeleteDialogOpen}
            role={selectedRole}
            onSuccess={loadRoles}
          />
          <ManageMembersDialog
            open={isMembersDialogOpen}
            onOpenChange={setIsMembersDialogOpen}
            roleId={selectedRole.id}
            roleName={selectedRole.name}
            currentMembers={[]}
            onSuccess={loadRoles}
          />
        </>
      )}
    </>
  )
}
