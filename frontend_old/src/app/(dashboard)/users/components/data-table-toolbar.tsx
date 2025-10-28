"use client"

import { Cross2Icon } from "@radix-ui/react-icons"
import { Table } from "@tanstack/react-table"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { DataTableFacetedFilter } from "./data-table-faceted-filter"
import { DataTableViewOptions } from "./data-table-view-options"
import { UserPrimaryActions } from "./user-primary-actions"
import { useEffect, useState } from "react"
import { IconShield, IconUserShield, IconUsersGroup, IconCash } from "@tabler/icons-react"
import { useTranslation } from "@/hooks/use-translation"

interface Props<TData> {
  table: Table<TData>
  onUserCreated?: () => void
}

interface Role {
  id: string
  name: string
  code: string
}

const roleIcons: Record<string, typeof IconShield> = {
  superadmin: IconShield,
  admin: IconUserShield,
  manager: IconUsersGroup,
  cashier: IconCash,
}

export function DataTableToolbar<TData>({ table, onUserCreated }: Props<TData>) {
  const { t } = useTranslation("core.users")
  const isFiltered = table.getState().columnFilters.length > 0
  const [roles, setRoles] = useState<Array<{ label: string; value: string; icon?: typeof IconShield }>>([])

  useEffect(() => {
    const fetchRoles = async () => {
      try {
        const token = localStorage.getItem("access_token")
        if (!token) return

        const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/roles/`, {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          cache: "no-store",
        })

        if (response.ok) {
          const result = await response.json()
          const rolesData = result.data || []
          const roleOptions = rolesData.map((role: Role) => ({
            label: role.name,
            value: role.code,
            icon: roleIcons[role.code.toLowerCase()] || IconUserShield,
          }))
          setRoles(roleOptions)
        }
      } catch {
        // Silently fail, use empty array
      }
    }

    fetchRoles()
  }, [])

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center sm:space-x-2">
        <Input
          placeholder={t("filter.search", "Rechercher")}
          value={(table.getColumn("email")?.getFilterValue() as string) ?? ""}
          onChange={(event) =>
            table.getColumn("email")?.setFilterValue(event.target.value)
          }
          className="h-8 w-full sm:w-[200px] lg:w-[250px]"
        />
        <div className="flex flex-wrap gap-2">
          {table.getColumn("status") && (
            <DataTableFacetedFilter
              column={table.getColumn("status")}
              title={t("field.status", "Statut")}
              options={[
                { label: t("status.active", "Actif"), value: "active" },
                { label: t("status.inactive", "Inactif"), value: "inactive" },
                { label: t("status.invited", "Invité"), value: "invited" },
                { label: t("status.suspended", "Suspendu"), value: "suspended" },
              ]}
            />
          )}
          {table.getColumn("role") && roles.length > 0 && (
            <DataTableFacetedFilter
              column={table.getColumn("role")}
              title={t("field.role", "Rôle")}
              options={roles}
            />
          )}
          {isFiltered && (
            <Button
              variant="ghost"
              onClick={() => table.resetColumnFilters()}
              className="h-8 px-2 lg:px-3"
            >
              {t("filter.reset", "Réinitialiser")}
              <Cross2Icon className="ml-2 h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 self-end sm:self-auto">
        <UserPrimaryActions onUserCreated={onUserCreated} />
        <DataTableViewOptions table={table} />
      </div>
    </div>
  )
}
