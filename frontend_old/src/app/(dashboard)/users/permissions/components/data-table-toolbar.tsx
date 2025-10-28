"use client"

import { Cross2Icon } from "@radix-ui/react-icons"
import { Table } from "@tanstack/react-table"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { DataTableFacetedFilter } from "./data-table-faceted-filter"
import { DataTableViewOptions } from "./data-table-view-options"
import { Permission } from "../data/schema"

interface Props<TData> {
  table: Table<TData>
}

export function DataTableToolbar<TData>({ table }: Props<TData>) {
  const isFiltered = table.getState().columnFilters.length > 0

  // Extract unique modules from the data
  const modules = Array.from(
    new Set(
      (table.options.data as Permission[]).map((permission) => permission.module)
    )
  ).map((module) => ({
    label: module.charAt(0).toUpperCase() + module.slice(1),
    value: module,
  }))

  const statuses = [
    { label: "Actif", value: "true" },
    { label: "Inactif", value: "false" },
  ]

  return (
    <div className="flex items-center justify-between">
      <div className="flex flex-1 flex-col-reverse items-start gap-y-2 sm:flex-row sm:items-center sm:space-x-2">
        <Input
          placeholder="Rechercher une permission..."
          value={(table.getColumn("name")?.getFilterValue() as string) ?? ""}
          onChange={(event) =>
            table.getColumn("name")?.setFilterValue(event.target.value)
          }
          className="h-8 w-[150px] lg:w-[250px]"
        />
        <div className="flex gap-x-2">
          {table.getColumn("module") && (
            <DataTableFacetedFilter
              column={table.getColumn("module")}
              title="Module"
              options={modules}
            />
          )}
          {table.getColumn("is_active") && (
            <DataTableFacetedFilter
              column={table.getColumn("is_active")}
              title="Statut"
              options={statuses}
            />
          )}
        </div>
        {isFiltered && (
          <Button
            variant="ghost"
            onClick={() => table.resetColumnFilters()}
            className="h-8 px-2 lg:px-3"
          >
            Réinitialiser
            <Cross2Icon className="ml-2 h-4 w-4" />
          </Button>
        )}
      </div>
      <DataTableViewOptions table={table} />
    </div>
  )
}
