"use client"

import { useState, useEffect, useMemo } from "react"
import { Info, Search, Filter, ArrowUpDown } from "lucide-react"
import Link from "next/link"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { useToast } from "@/hooks/use-toast"
import { getHooks, type Hook, updateHook } from "./data/hooks-api"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Switch } from "@/components/ui/switch"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
  SortingState,
  ColumnFiltersState,
} from "@tanstack/react-table"

export default function HooksPage() {
  const [hooks, setHooks] = useState<Hook[]>([])
  const [loading, setLoading] = useState(true)
  const [globalFilter, setGlobalFilter] = useState("")
  const [eventFilter, setEventFilter] = useState<string>("all")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [sorting, setSorting] = useState<SortingState>([])
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])
  const { toast } = useToast()

  const loadHooks = async () => {
    setLoading(true)
    try {
      const data = await getHooks()
      setHooks(data)
    } catch (error) {
      toast({
        title: "Erreur",
        description: error instanceof Error ? error.message : "Impossible de charger les hooks",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadHooks()
  }, [])

  const handleToggleActive = async (hook: Hook) => {
    try {
      await updateHook(hook.id, { is_active: !hook.is_active })
      toast({
        title: "Succès",
        description: `Hook ${hook.is_active ? "désactivé" : "activé"}`,
      })
      loadHooks()
    } catch (error) {
      toast({
        title: "Erreur",
        description: error instanceof Error ? error.message : "Impossible de modifier le hook",
        variant: "destructive",
      })
    }
  }

  // Get unique events for filter
  const uniqueEvents = useMemo(() => {
    const events = Array.from(new Set(hooks.map(h => h.event)))
    return events.sort()
  }, [hooks])

  // Define columns for the data table
  const columns = useMemo<ColumnDef<Hook>[]>(
    () => [
      {
        accessorKey: "name",
        header: ({ column }) => {
          return (
            <Button
              variant="ghost"
              size="sm"
              className="-ml-3 h-8"
              onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            >
              Nom
              <ArrowUpDown className="ml-2 h-4 w-4" />
            </Button>
          )
        },
        cell: ({ row }) => (
          <div className="font-medium min-w-[200px]">{row.getValue("name")}</div>
        ),
        enableSorting: true,
      },
      {
        accessorKey: "event",
        header: ({ column }) => {
          return (
            <Button
              variant="ghost"
              size="sm"
              className="-ml-3 h-8"
              onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            >
              Événement
              <ArrowUpDown className="ml-2 h-4 w-4" />
            </Button>
          )
        },
        cell: ({ row }) => (
          <Badge variant="outline">{row.getValue("event")}</Badge>
        ),
        enableSorting: true,
        filterFn: (row, id, value) => {
          if (value === "all") return true
          return row.getValue(id) === value
        },
      },
      {
        accessorKey: "description",
        header: "Description",
        cell: ({ row }) => (
          <div className="max-w-md text-sm text-muted-foreground">
            {row.getValue("description") || "Aucune description"}
          </div>
        ),
      },
      {
        accessorKey: "priority",
        header: ({ column }) => {
          return (
            <Button
              variant="ghost"
              size="sm"
              className="-ml-3 h-8"
              onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            >
              Priorité
              <ArrowUpDown className="ml-2 h-4 w-4" />
            </Button>
          )
        },
        cell: ({ row }) => {
          const priority = row.getValue("priority") as number
          return (
            <Badge variant={priority > 50 ? "default" : "secondary"}>
              {priority}
            </Badge>
          )
        },
        enableSorting: true,
      },
      {
        accessorKey: "actions",
        header: "Actions",
        cell: ({ row }) => {
          const actions = row.getValue("actions") as Hook["actions"]
          return (
            <div className="flex flex-wrap gap-1">
              {actions.map((action, idx) => (
                <Badge key={idx} variant="secondary" className="text-xs">
                  {action.type.replace("_", " ")}
                </Badge>
              ))}
            </div>
          )
        },
      },
      {
        accessorKey: "is_active",
        header: "Statut",
        cell: ({ row }) => {
          const hook = row.original
          return (
            <Switch
              checked={hook.is_active}
              onCheckedChange={() => handleToggleActive(hook)}
            />
          )
        },
        filterFn: (row, id, value) => {
          if (value === "all") return true
          const isActive = row.getValue(id) as boolean
          return value === "active" ? isActive : !isActive
        },
      },
    ],
    [handleToggleActive]
  )

  // Apply filters
  const filteredHooks = useMemo(() => {
    return hooks.filter(hook => {
      const matchesSearch =
        hook.name.toLowerCase().includes(globalFilter.toLowerCase()) ||
        hook.event.toLowerCase().includes(globalFilter.toLowerCase()) ||
        (hook.description && hook.description.toLowerCase().includes(globalFilter.toLowerCase()))

      const matchesEvent = eventFilter === "all" || hook.event === eventFilter
      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "active" && hook.is_active) ||
        (statusFilter === "inactive" && !hook.is_active)

      return matchesSearch && matchesEvent && matchesStatus
    })
  }, [hooks, globalFilter, eventFilter, statusFilter])

  const table = useReactTable({
    data: filteredHooks,
    columns,
    state: {
      sorting,
      columnFilters,
      globalFilter,
    },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  return (
    <div className="flex w-full flex-1 flex-col gap-2">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/">Accueil</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Développeurs</BreadcrumbPage>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Hooks & Triggers</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-2xl font-bold">Hooks & Triggers</h2>
          <p className="text-muted-foreground text-sm">
            Hooks système pour automatiser vos workflows
          </p>
        </div>
      </div>

      <Alert>
        <Info className="h-4 w-4" />
        <AlertTitle>Hooks système</AlertTitle>
        <AlertDescription>
          Les hooks sont créés automatiquement par le système. Vous pouvez les activer/désactiver selon vos besoins.
        </AlertDescription>
      </Alert>

      <div className="h-full flex-1">
        {loading ? (
          <div className="mt-6 text-center text-sm text-muted-foreground">Chargement...</div>
        ) : hooks.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>Hooks système disponibles</CardTitle>
              <CardDescription>
                {filteredHooks.length} sur {hooks.length} hook{hooks.length > 1 ? "s" : ""} affiché{filteredHooks.length > 1 ? "s" : ""}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Search and Filters */}
              <div className="flex flex-col md:flex-row gap-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Rechercher un hook..."
                    value={globalFilter}
                    onChange={(e) => setGlobalFilter(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <div className="flex items-center gap-2 w-full md:w-auto">
                  <Filter className="h-4 w-4 text-muted-foreground" />
                  <Select value={eventFilter} onValueChange={setEventFilter}>
                    <SelectTrigger className="w-full md:w-[180px]">
                      <SelectValue placeholder="Événement" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Tous les événements</SelectItem>
                      {uniqueEvents.map((event) => (
                        <SelectItem key={event} value={event}>
                          {event}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-full md:w-[150px]">
                      <SelectValue placeholder="Statut" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Tous</SelectItem>
                      <SelectItem value="active">Actif</SelectItem>
                      <SelectItem value="inactive">Inactif</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Data Table */}
              <div className="rounded-lg border">
                <Table>
                  <TableHeader>
                    {table.getHeaderGroups().map((headerGroup) => (
                      <TableRow key={headerGroup.id}>
                        {headerGroup.headers.map((header) => (
                          <TableHead key={header.id}>
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
                            <TableCell key={cell.id}>
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
                          Aucun hook ne correspond à votre recherche.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Aucun hook système</CardTitle>
              <CardDescription>
                Les hooks seront créés automatiquement par le système lors de l&apos;installation de modules.
              </CardDescription>
            </CardHeader>
          </Card>
        )}
      </div>
    </div>
  )
}
