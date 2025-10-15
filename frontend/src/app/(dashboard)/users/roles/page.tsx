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
import { Role } from "./data/schema"
import { getRoles } from "./data/roles-api"
import { RolesTable } from "./components/roles-table"
import { columns } from "./components/roles-columns"
import { CreateRoleDialog } from "./components/create-role-dialog"
import { ManagePermissionsDialog } from "./components/manage-permissions-dialog"

export default function RolesPage() {
  const [roles, setRoles] = useState<Role[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [selectedRole, setSelectedRole] = useState<Role | null>(null)
  const [isPermissionsDialogOpen, setIsPermissionsDialogOpen] = useState(false)

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

  useEffect(() => {
    loadRoles()
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
              <BreadcrumbPage>Rôles</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="flex-none text-xl font-bold tracking-tight">Rôles</h2>
            <p className="text-sm text-muted-foreground">
              Gérez les rôles et leurs permissions
            </p>
          </div>
          <Button onClick={() => setIsCreateDialogOpen(true)}>
            Créer un rôle
          </Button>
        </div>
      </div>
      <div className="flex-1">
        <RolesTable
          columns={columns}
          data={roles}
          onManagePermissions={handleManagePermissions}
        />
      </div>

      <CreateRoleDialog
        open={isCreateDialogOpen}
        onOpenChange={setIsCreateDialogOpen}
        onSuccess={loadRoles}
      />

      {selectedRole && (
        <ManagePermissionsDialog
          open={isPermissionsDialogOpen}
          onOpenChange={setIsPermissionsDialogOpen}
          roleId={selectedRole.id}
          roleName={selectedRole.name}
          currentPermissions={selectedRole.permissions || []}
          onSuccess={loadRoles}
        />
      )}
    </>
  )
}
