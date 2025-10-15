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
import { Permission } from "./data/schema"
import { getPermissions } from "./data/permissions-api"
import { PermissionsTable } from "./components/permissions-table"
import { getColumns } from "./components/permissions-columns"
import { CreatePermissionDialog } from "./components/create-permission-dialog"
import { EditPermissionDialog } from "./components/edit-permission-dialog"
import { DeletePermissionDialog } from "./components/delete-permission-dialog"

export default function PermissionsPage() {
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
              <BreadcrumbPage>Permissions</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="flex-none text-xl font-bold tracking-tight">Permissions</h2>
            <p className="text-sm text-muted-foreground">
              Gérez les permissions système
            </p>
          </div>
          <Button onClick={() => setIsCreateDialogOpen(true)}>
            Créer une permission
          </Button>
        </div>
      </div>
      <div className="flex-1">
        <PermissionsTable
          columns={getColumns(handleEditPermission, handleDeletePermission)}
          data={permissions}
        />
      </div>

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
