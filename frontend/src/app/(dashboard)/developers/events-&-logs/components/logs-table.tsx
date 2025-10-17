"use client"

import { useEffect, useState, useMemo } from "react"
import { ArrowUpDown } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import LongText from "@/components/long-text"
import { getLevelVariant } from "../data/data"
import { getAuditLogs, type AuditLog } from "../data/audit-api"
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  SortingState,
  PaginationState,
} from "@tanstack/react-table"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { IconChevronLeft, IconChevronRight, IconChevronsLeft, IconChevronsRight } from "@tabler/icons-react"

interface Props {
  searchVal: string
  levelFilter?: string[]
  eventTypeFilter?: string[]
}

export default function LogsTable({ searchVal, levelFilter = [], eventTypeFilter = [] }: Props) {
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [total, setTotal] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [sorting, setSorting] = useState<SortingState>([])
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 10,
  })

  // Define columns
  const columns = useMemo<ColumnDef<AuditLog>[]>(
    () => [
      {
        accessorKey: "timestamp",
        header: ({ column }) => {
          return (
            <Button
              variant="ghost"
              size="sm"
              className="-ml-3 h-8"
              onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            >
              Timestamp
              <ArrowUpDown className="ml-2 h-4 w-4" />
            </Button>
          )
        },
        cell: ({ row }) => {
          const timestamp = row.getValue("timestamp") as string
          return (
            <div className="font-medium min-w-[180px]">
              <LongText>{new Date(timestamp).toLocaleString()}</LongText>
            </div>
          )
        },
        enableSorting: true,
      },
      {
        accessorKey: "level",
        header: ({ column }) => {
          return (
            <Button
              variant="ghost"
              size="sm"
              className="-ml-3 h-8"
              onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            >
              Niveau
              <ArrowUpDown className="ml-2 h-4 w-4" />
            </Button>
          )
        },
        cell: ({ row }) => {
          const level = row.getValue("level") as AuditLog["level"]
          return (
            <Badge variant={getLevelVariant(level)}>
              {level}
            </Badge>
          )
        },
        enableSorting: true,
      },
      {
        accessorKey: "event_type",
        header: "Type",
        cell: ({ row }) => {
          const eventType = row.getValue("event_type") as string
          return eventType ? (
            <Badge variant="outline">{eventType}</Badge>
          ) : null
        },
      },
      {
        accessorKey: "message",
        header: "Message",
        cell: ({ row }) => {
          const message = row.getValue("message") as string
          return <LongText>{message}</LongText>
        },
      },
      {
        accessorKey: "source",
        header: "Source",
        cell: ({ row }) => {
          const source = row.getValue("source") as string
          return <div className="min-w-[120px]">{source}</div>
        },
      },
    ],
    []
  )

  const table = useReactTable({
    data: logs,
    columns,
    state: {
      sorting,
      pagination,
    },
    pageCount: Math.ceil(total / pagination.pageSize),
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    manualPagination: true,
  })

  useEffect(() => {
    const fetchLogs = async () => {
      setIsLoading(true)
      try {
        const response = await getAuditLogs({
          skip: pagination.pageIndex * pagination.pageSize,
          limit: pagination.pageSize,
          search: searchVal || undefined,
          level: levelFilter.length > 0 ? levelFilter.join(",") : undefined,
          event_type: eventTypeFilter.length > 0 ? eventTypeFilter.join(",") : undefined,
        })
        setLogs(response.data)
        setTotal(response.total)
      } catch (_error) {
        // Silently handle error
        setLogs([])
        setTotal(0)
      } finally {
        setIsLoading(false)
      }
    }

    fetchLogs()
  }, [searchVal, levelFilter, eventTypeFilter, pagination.pageIndex, pagination.pageSize])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <p className="text-muted-foreground">Chargement des logs...</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id} className="pl-4">
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id} className="pl-4">
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-24 text-center"
                >
                  Aucun log ne correspond à votre recherche.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between px-2 pb-3">
        <div className="flex items-center space-x-2">
          <p className="text-sm text-muted-foreground">
            Lignes par page
          </p>
          <Select
            value={`${pagination.pageSize}`}
            onValueChange={(value) => {
              setPagination({
                pageIndex: 0,
                pageSize: Number(value),
              })
            }}
          >
            <SelectTrigger className="h-8 w-[70px]">
              <SelectValue placeholder={pagination.pageSize} />
            </SelectTrigger>
            <SelectContent side="top">
              {[10, 20, 30, 50, 100].map((pageSize) => (
                <SelectItem key={pageSize} value={`${pageSize}`}>
                  {pageSize}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center space-x-6 lg:space-x-8">
          <div className="flex w-[100px] items-center justify-center text-sm font-medium">
            Page {pagination.pageIndex + 1} sur{" "}
            {Math.max(1, Math.ceil(total / pagination.pageSize))}
          </div>
          <div className="flex items-center space-x-2">
            <Button
              variant="outline"
              className="h-8 w-8 p-0"
              onClick={() => setPagination({ ...pagination, pageIndex: 0 })}
              disabled={pagination.pageIndex === 0}
            >
              <span className="sr-only">Aller à la première page</span>
              <IconChevronsLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              className="h-8 w-8 p-0"
              onClick={() => setPagination({ ...pagination, pageIndex: pagination.pageIndex - 1 })}
              disabled={pagination.pageIndex === 0}
            >
              <span className="sr-only">Aller à la page précédente</span>
              <IconChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              className="h-8 w-8 p-0"
              onClick={() => setPagination({ ...pagination, pageIndex: pagination.pageIndex + 1 })}
              disabled={pagination.pageIndex >= Math.ceil(total / pagination.pageSize) - 1}
            >
              <span className="sr-only">Aller à la page suivante</span>
              <IconChevronRight className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              className="h-8 w-8 p-0"
              onClick={() => setPagination({ ...pagination, pageIndex: Math.ceil(total / pagination.pageSize) - 1 })}
              disabled={pagination.pageIndex >= Math.ceil(total / pagination.pageSize) - 1}
            >
              <span className="sr-only">Aller à la dernière page</span>
              <IconChevronsRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="text-sm text-muted-foreground">
          {total} log{total > 1 ? "s" : ""} au total
        </div>
      </div>
    </div>
  )
}
