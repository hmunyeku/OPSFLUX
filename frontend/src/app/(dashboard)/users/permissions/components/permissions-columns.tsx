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
import { Permission } from "../data/schema"
import { DataTableColumnHeader } from "./data-table-column-header"

export function getColumns(
  onEditPermission: (permission: Permission) => void,
  onDeletePermission: (permission: Permission) => void
): ColumnDef<Permission>[] {
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
        const permission = row.original
        return (
          <div className="flex items-center gap-2">
            <span className="font-medium">{permission.name}</span>
            {permission.is_default && (
              <Badge variant="secondary" className="text-xs">
                Par défaut
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
      accessorKey: "module",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Module" />
      ),
      cell: ({ row }) => (
        <Badge variant="outline" className="capitalize">
          {row.getValue("module")}
        </Badge>
      ),
      filterFn: (row, id, value) => {
        return value.includes(row.getValue(id))
      },
      enableSorting: true,
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
        const permission = row.original

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
              <DropdownMenuItem
                onClick={() => navigator.clipboard.writeText(permission.id)}
              >
                Copier l&apos;ID
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => onEditPermission(permission)}>
                Modifier
              </DropdownMenuItem>
              {!permission.is_default && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-destructive"
                    onClick={() => onDeletePermission(permission)}
                  >
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
}
