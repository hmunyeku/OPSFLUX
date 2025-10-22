"use client"

import { ColumnDef } from "@tanstack/react-table"
import { Badge } from "@/components/ui/badge"
import { DataTableColumnHeader } from "./data-table-column-header"

export interface DatabaseTable {
  schema: string
  name: string
  size: string
  row_count: number
}

export const columns: ColumnDef<DatabaseTable>[] = [
  {
    accessorKey: "name",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Nom de la table" />
    ),
    cell: ({ row }) => (
      <span className="font-medium font-mono text-sm">{row.getValue("name")}</span>
    ),
    enableSorting: true,
    enableHiding: false,
  },
  {
    accessorKey: "schema",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Schéma" />
    ),
    cell: ({ row }) => (
      <Badge variant="outline" className="font-mono text-xs">
        {row.getValue("schema")}
      </Badge>
    ),
    enableSorting: true,
    filterFn: (row, id, value) => {
      return value.includes(row.getValue(id))
    },
  },
  {
    accessorKey: "row_count",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Nombre de lignes" />
    ),
    cell: ({ row }) => {
      const count = row.getValue("row_count") as number
      return (
        <span className="font-medium">
          {count.toLocaleString()}
        </span>
      )
    },
    enableSorting: true,
  },
  {
    accessorKey: "size",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Taille" />
    ),
    cell: ({ row }) => (
      <Badge variant="secondary">{row.getValue("size")}</Badge>
    ),
    enableSorting: false,
  },
]
