"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Permission } from "../../permissions/data/schema"
import { getPermissions } from "../../permissions/data/permissions-api"
import { PermissionsTable } from "../../permissions/components/permissions-table"
import { getColumns } from "../../permissions/components/permissions-columns"
import { CreatePermissionDialog } from "../../permissions/components/create-permission-dialog"
import { EditPermissionDialog } from "../../permissions/components/edit-permission-dialog"
import { DeletePermissionDialog } from "../../permissions/components/delete-permission-dialog"

export function PermissionsSection() {
  const [permissions, setPermissions] = useState<Permission[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [selectedPermission, setSelectedPermission] = useState<Permission | null>(null)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)

  const loadPermissions = async () => {
    try {
      setIsLoading(true)
      const data = await getPermissions()
      setPermissions(data)
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to load permissions:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleEditPermission = (permission: Permission) => {
    setSelectedPermission(permission)
    setIsEditDialogOpen(true)
  }

  const handleDeletePermission = (permission: Permission) => {
    setSelectedPermission(permission)
    setIsDeleteDialogOpen(true)
  }

  useEffect(() => {
    loadPermissions()
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
          <h3 className="text-lg font-semibold">Gestion des permissions</h3>
          <p className="text-sm text-muted-foreground">
            Définissez les permissions disponibles dans le système
          </p>
        </div>
        <Button onClick={() => setIsCreateDialogOpen(true)}>
          Créer une permission
        </Button>
      </div>

      <PermissionsTable
        columns={getColumns(handleEditPermission, handleDeletePermission)}
        data={permissions}
      />

      <CreatePermissionDialog
        open={isCreateDialogOpen}
        onOpenChange={setIsCreateDialogOpen}
        onSuccess={loadPermissions}
      />

      {selectedPermission && (
        <>
          <EditPermissionDialog
            open={isEditDialogOpen}
            onOpenChange={setIsEditDialogOpen}
            permission={selectedPermission}
            onSuccess={loadPermissions}
          />
          <DeletePermissionDialog
            open={isDeleteDialogOpen}
            onOpenChange={setIsDeleteDialogOpen}
            permission={selectedPermission}
            onSuccess={loadPermissions}
          />
        </>
      )}
    </>
  )
}
