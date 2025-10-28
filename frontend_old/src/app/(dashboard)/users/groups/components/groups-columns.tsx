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
import { Group } from "../data/schema"
import { DataTableColumnHeader } from "./data-table-column-header"

export function getColumns(
  onManagePermissions: (group: Group) => void,
  onEditGroup: (group: Group) => void,
  onDeleteGroup: (group: Group) => void
): ColumnDef<Group>[] {
  return [
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
        return <span className="font-medium">{row.original.name}</span>
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
      id: "parent",
      header: "Groupe parent",
      cell: ({ row }) => {
        const parent = row.original.parent
        return parent ? (
          <Badge variant="secondary" className="font-mono text-xs">
            {parent.name}
          </Badge>
        ) : (
          <span className="text-muted-foreground">-</span>
        )
      },
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
        const rowValue = row.getValue(id)
        return value.includes(String(rowValue))
      },
    },
    {
      id: "actions",
      cell: ({ row }) => {
        const group = row.original

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
              <DropdownMenuItem onClick={() => navigator.clipboard.writeText(group.id)}>
                Copier l&apos;ID
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => onEditGroup(group)}>
                Modifier
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onManagePermissions(group)}>
                Gérer les permissions
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive"
                onClick={() => onDeleteGroup(group)}
              >
                Supprimer
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )
      },
    },
  ]
}
