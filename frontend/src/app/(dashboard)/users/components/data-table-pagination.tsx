"use client"

import {
  ChevronLeftIcon,
  ChevronRightIcon,
  DoubleArrowLeftIcon,
  DoubleArrowRightIcon,
} from "@radix-ui/react-icons"
import { Table } from "@tanstack/react-table"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useTranslation } from "@/hooks/use-translation"

interface Props<TData> {
  table: Table<TData>
}

export function DataTablePagination<TData>({ table }: Props<TData>) {
  const { t } = useTranslation("core.users")

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between px-2">
      <div className="text-muted-foreground hidden flex-1 text-sm md:block">
        {table.getFilteredSelectedRowModel().rows.length} {t("pagination.of", "sur")}{" "}
        {table.getFilteredRowModel().rows.length} {t("pagination.selected", "sélectionné(s)")}
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:space-x-4 lg:space-x-6">
        <div className="flex items-center justify-between sm:justify-start space-x-2">
          <p className="text-sm font-medium whitespace-nowrap">{t("pagination.rows_per_page", "Lignes")}</p>
          <Select
            value={`${table.getState().pagination.pageSize}`}
            onValueChange={(value) => {
              table.setPageSize(Number(value))
            }}
          >
            <SelectTrigger className="h-8 w-[70px]">
              <SelectValue placeholder={table.getState().pagination.pageSize} />
            </SelectTrigger>
            <SelectContent side="top">
              {[10, 20, 30, 40, 50].map((pageSize) => (
                <SelectItem key={pageSize} value={`${pageSize}`}>
                  {pageSize}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center justify-between sm:justify-center gap-2">
          <div className="flex text-sm font-medium whitespace-nowrap">
            {t("pagination.page", "Page")} {table.getState().pagination.pageIndex + 1} {t("pagination.of", "sur")}{" "}
            {table.getPageCount()}
          </div>
          <div className="flex items-center space-x-2">
            <Button
              variant="outline"
              className="hidden h-8 w-8 p-0 lg:flex"
              onClick={() => table.setPageIndex(0)}
              disabled={!table.getCanPreviousPage()}
            >
              <span className="sr-only">{t("pagination.first_page", "Première page")}</span>
              <DoubleArrowLeftIcon className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              className="h-8 w-8 p-0"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
            >
              <span className="sr-only">{t("pagination.previous_page", "Page précédente")}</span>
              <ChevronLeftIcon className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              className="h-8 w-8 p-0"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
            >
              <span className="sr-only">{t("pagination.next_page", "Page suivante")}</span>
              <ChevronRightIcon className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              className="hidden h-8 w-8 p-0 lg:flex"
              onClick={() => table.setPageIndex(table.getPageCount() - 1)}
              disabled={!table.getCanNextPage()}
            >
              <span className="sr-only">{t("pagination.last_page", "Dernière page")}</span>
              <DoubleArrowRightIcon className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
