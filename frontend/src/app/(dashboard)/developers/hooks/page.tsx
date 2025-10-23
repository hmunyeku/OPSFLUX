"use client"

import { useState, useEffect, useMemo } from "react"
import { Info, Search, Filter, ArrowUpDown, Edit2, Trash2 } from "lucide-react"
import Link from "next/link"
import { useTranslation } from "@/hooks/use-translation"
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { useToast } from "@/hooks/use-toast"
import { getHooks, type Hook, updateHook, deleteHook } from "./data/hooks-api"
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
import { PermissionGuard } from "@/components/permission-guard"
import { usePermissions } from "@/hooks/use-permissions"
import { AddHook } from "./components/add-hook"
import { MutateHook } from "./components/mutate-hook"

export default function HooksPage() {
  return (
    <PermissionGuard permission="core.hooks.read">
      <HooksPageContent />
    </PermissionGuard>
  )
}

function HooksPageContent() {
  const { t } = useTranslation("core.developers")
  const { hasPermission } = usePermissions()
  const [hooks, setHooks] = useState<Hook[]>([])
  const [loading, setLoading] = useState(true)
  const [globalFilter, setGlobalFilter] = useState("")
  const [eventFilter, setEventFilter] = useState<string>("all")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [sorting, setSorting] = useState<SortingState>([])
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])
  const [editingHook, setEditingHook] = useState<Hook | null>(null)
  const [deletingHook, setDeletingHook] = useState<Hook | null>(null)
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
        title: t("hooks.success", "Succès"),
        description: `Hook ${hook.is_active ? t("hooks.deactivated", "désactivé") : t("hooks.activated", "activé")}`,
      })
      loadHooks()
    } catch (error) {
      toast({
        title: t("hooks.error", "Erreur"),
        description: error instanceof Error ? error.message : t("hooks.update_error", "Impossible de modifier le hook"),
        variant: "destructive",
      })
    }
  }

  const handleDeleteHook = async () => {
    if (!deletingHook) return

    try {
      await deleteHook(deletingHook.id)
      toast({
        title: t("hooks.deleted", "Hook supprimé"),
        description: t("hooks.deleted_desc", "Le hook a été supprimé avec succès"),
      })
      setDeletingHook(null)
      loadHooks()
    } catch (error) {
      toast({
        title: t("hooks.error", "Erreur"),
        description: error instanceof Error ? error.message : "Impossible de supprimer le hook",
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
              {t("hooks.column_name", "Nom")}
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
              {t("hooks.column_event", "Événement")}
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
        header: t("hooks.column_description", "Description"),
        cell: ({ row }) => (
          <div className="max-w-md text-sm text-muted-foreground">
            {row.getValue("description") || t("hooks.no_description", "Aucune description")}
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
              {t("hooks.column_priority", "Priorité")}
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
        header: t("hooks.column_action_types", "Types d'actions"),
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
        header: t("hooks.column_status", "Statut"),
        cell: ({ row }) => {
          const hook = row.original
          return (
            <Switch
              checked={hook.is_active}
              onCheckedChange={() => handleToggleActive(hook)}
              disabled={!hasPermission("core.hooks.update")}
            />
          )
        },
        filterFn: (row, id, value) => {
          if (value === "all") return true
          const isActive = row.getValue(id) as boolean
          return value === "active" ? isActive : !isActive
        },
      },
      {
        id: "row_actions",
        header: t("hooks.column_actions", "Actions"),
        cell: ({ row }) => {
          const hook = row.original
          return (
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setEditingHook(hook)}
                disabled={!hasPermission("core.hooks.update")}
              >
                <Edit2 className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setDeletingHook(hook)}
                disabled={!hasPermission("core.hooks.delete")}
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          )
        },
      },
    ],
    [handleToggleActive, hasPermission, setEditingHook, setDeletingHook]
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
              <Link href="/">{t("breadcrumb.home", "Accueil")}</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{t("breadcrumb.developers", "Développeurs")}</BreadcrumbPage>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{t("hooks.title", "Title")}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-2xl font-bold">{t("hooks.title", "Title")}</h2>
          <p className="text-muted-foreground text-sm">
            {t("hooks.description", "Description")}
          </p>
        </div>
        <AddHook onHookAdded={loadHooks} disabled={!hasPermission("core.hooks.create")} />
      </div>

      <div className="h-full flex-1">
        {loading ? (
          <div className="mt-6 text-center text-sm text-muted-foreground">{t("hooks.loading", "Loading")}</div>
        ) : hooks.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>{t("hooks.available", "Available")}</CardTitle>
              <CardDescription>
                {filteredHooks.length} {t("hooks.on", "On")} {hooks.length} hook{hooks.length > 1 ? "s" : ""} {t("hooks.displayed", "Displayed")}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Search and Filters */}
              <div className="flex flex-col md:flex-row gap-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder={t("hooks.search", "Search")}
                    value={globalFilter}
                    onChange={(e) => setGlobalFilter(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <div className="flex items-center gap-2 w-full md:w-auto">
                  <Filter className="h-4 w-4 text-muted-foreground" />
                  <Select value={eventFilter} onValueChange={setEventFilter}>
                    <SelectTrigger className="w-full md:w-[180px]">
                      <SelectValue placeholder={t("hooks.filter_event", "Événement")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{t("hooks.filter_all_events", "Tous les événements")}</SelectItem>
                      {uniqueEvents.map((event) => (
                        <SelectItem key={event} value={event}>
                          {event}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-full md:w-[150px]">
                      <SelectValue placeholder={t("hooks.filter_status", "Statut")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{t("hooks.filter_all", "Tous")}</SelectItem>
                      <SelectItem value="active">{t("hooks.filter_active", "Actif")}</SelectItem>
                      <SelectItem value="inactive">{t("hooks.filter_inactive", "Inactif")}</SelectItem>
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
                          {t("hooks.no_match", "Aucun hook ne correspond à votre recherche.")}
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
              <CardTitle>{t("hooks.no_hooks", "Aucun hook")}</CardTitle>
              <CardDescription>
                {t("hooks.no_hooks_desc", "Aucun hook n'a encore été créé. Créez votre premier hook pour automatiser des actions.")}
              </CardDescription>
            </CardHeader>
          </Card>
        )}
      </div>

      {/* Edit Hook Dialog */}
      {editingHook && (
        <MutateHook
          open={!!editingHook}
          setOpen={(open) => !open && setEditingHook(null)}
          currentHook={editingHook}
          onHookMutated={() => {
            setEditingHook(null)
            loadHooks()
          }}
        />
      )}

      {/* Delete Hook Dialog */}
      <AlertDialog open={!!deletingHook} onOpenChange={(open) => !open && setDeletingHook(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("hooks.delete_title", "Supprimer le hook")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("hooks.delete_confirm", `Êtes-vous sûr de vouloir supprimer le hook "${deletingHook?.name}" ? Cette action est irréversible.`)}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("hooks.cancel", "Annuler")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteHook} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {t("hooks.delete", "Supprimer")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
