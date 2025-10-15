"use client"

import { ColumnDef } from "@tanstack/react-table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { IconDots } from "@tabler/icons-react"
import { Role } from "../data/schema"
import { DataTableColumnHeader } from "./data-table-column-header"

export const columns: ColumnDef<Role>[] = [
  {
    accessorKey: "code",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Code" />
    ),
    cell: ({ row }) => (
      <span className="font-mono text-sm">{row.getValue("code")}</span>
    ),
    enableSorting: true,
    enableHiding: false,
  },
  {
    accessorKey: "name",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Nom" />
    ),
    cell: ({ row }) => {
      const role = row.original
      return (
        <div className="flex items-center gap-2">
          <span className="font-medium">{role.name}</span>
          {role.is_system && (
            <Badge variant="outline" className="text-xs">
              Système
            </Badge>
          )}
        </div>
      )
    },
    enableSorting: true,
  },
  {
    accessorKey: "description",
    header: "Description",
    cell: ({ row }) => (
      <span className="max-w-xs truncate block">
        {row.getValue("description") || "-"}
      </span>
    ),
  },
  {
    accessorKey: "priority",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Priorité" />
    ),
    cell: ({ row }) => (
      <Badge variant="secondary">{row.getValue("priority")}</Badge>
    ),
    enableSorting: true,
  },
  {
    id: "permissions",
    header: "Permissions",
    cell: ({ row }) => {
      const permissions = row.original.permissions || []
      return (
        <Badge variant="outline" className="font-medium">
          {permissions.length}
        </Badge>
      )
    },
  },
  {
    accessorKey: "is_active",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Statut" />
    ),
    cell: ({ row }) => {
      const isActive = row.getValue("is_active")
      return isActive ? (
        <Badge variant="default" className="bg-green-500">
          Actif
        </Badge>
      ) : (
        <Badge variant="secondary">Inactif</Badge>
      )
    },
    filterFn: (row, id, value) => {
      return value.includes(row.getValue(id))
    },
  },
  {
    id: "actions",
    cell: ({ row, table }) => {
      const role = row.original
      const meta = table.options.meta as { onManagePermissions: (role: Role) => void }

      return (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-8 w-8 p-0">
              <span className="sr-only">Ouvrir le menu</span>
              <IconDots className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Actions</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => navigator.clipboard.writeText(role.id)}>
              Copier l&apos;ID
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem>Voir les détails</DropdownMenuItem>
            <DropdownMenuItem onClick={() => meta?.onManagePermissions(role)}>
              Gérer les permissions
            </DropdownMenuItem>
            {!role.is_system && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-destructive">
                  Supprimer
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )
    },
  },
]
