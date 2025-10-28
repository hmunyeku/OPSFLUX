"use client"

import { ColumnDef } from "@tanstack/react-table"
import { Badge } from "@/components/ui/badge"
import { DataTableColumnHeader } from "./data-table-column-header"

export interface DatabaseTable {
  table_schema: string
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
      <div className="flex flex-col gap-1">
        <span className="font-medium font-mono">{row.getValue("name")}</span>
        <div className="flex gap-1.5 items-center sm:hidden">
          <Badge variant="outline" className="font-mono text-[10px] h-4 px-1">
            {row.getValue("table_schema")}
          </Badge>
          <Badge variant="secondary" className="text-[10px] h-4 px-1">
            {row.getValue("size")}
          </Badge>
        </div>
      </div>
    ),
    enableSorting: true,
    enableHiding: false,
  },
  {
    accessorKey: "table_schema",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Schéma" />
    ),
    cell: ({ row }) => (
      <Badge variant="outline" className="font-mono text-[10px] h-5 px-1.5 hidden sm:inline-flex">
        {row.getValue("table_schema")}
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
      <DataTableColumnHeader column={column} title="Lignes" />
    ),
    cell: ({ row }) => {
      const count = row.getValue("row_count") as number
      return (
        <span className="font-medium">
          {count.toLocaleString('fr-FR')}
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
      <Badge variant="secondary" className="text-[10px] h-5 px-1.5 hidden sm:inline-flex">
        {row.getValue("size")}
      </Badge>
    ),
    enableSorting: false,
  },
]
