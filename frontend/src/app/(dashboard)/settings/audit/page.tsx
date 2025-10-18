"use client"

import { useEffect, useState, useMemo } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  SortingState,
} from "@tanstack/react-table"
import {
  IconRefresh,
  IconSearch,
  IconFilter,
  IconChartBar,
  IconAlertCircle,
  IconInfoCircle,
  IconAlertTriangle,
  IconBug,
  IconArrowsSort,
} from "@tabler/icons-react"
import ContentSection from "../components/content-section"
import { useToast } from "@/hooks/use-toast"
import { getAuditLogs, getAuditStats, type AuditLog, type AuditStats } from "@/api/audit"
import { useTranslation } from "@/hooks/use-translation"
import { PermissionGuard } from "@/components/permission-guard"
import { format } from "date-fns"
import { fr } from "date-fns/locale"

export default function AuditPage() {
  return (
    <PermissionGuard permission="core.audit.read">
      <AuditPageContent />
    </PermissionGuard>
  )
}

function AuditPageContent() {
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [stats, setStats] = useState<AuditStats | null>(null)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(0)
  const [pageSize] = useState(20)
  const [sorting, setSorting] = useState<SortingState>([])

  // Filtres
  const [levelFilter, setLevelFilter] = useState<string>("all")
  const [eventTypeFilter, setEventTypeFilter] = useState<string>("all")
  const [searchQuery, setSearchQuery] = useState("")

  const { toast } = useToast()
  const { t } = useTranslation("core.audit")

  const fetchData = async () => {
    setLoading(true)
    try {
      const [logsData, statsData] = await Promise.all([
        getAuditLogs({
          skip: page * pageSize,
          limit: pageSize,
          level: levelFilter === "all" ? undefined : levelFilter,
          event_type: eventTypeFilter === "all" ? undefined : eventTypeFilter,
          search: searchQuery || undefined,
        }),
        getAuditStats(),
      ])
      setLogs(logsData.data)
      setTotal(logsData.total)
      setStats(statsData)
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Erreur",
        description: "Impossible de charger les logs d'audit",
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [page, pageSize, levelFilter, eventTypeFilter])

  const handleSearch = () => {
    setPage(0)
    fetchData()
  }

  const handleSearchKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch()
    }
  }

  // Colonnes du tableau
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
              Date
              <IconArrowsSort className="ml-2 h-4 w-4" />
            </Button>
          )
        },
        cell: ({ row }) => (
          <div className="text-sm">
            {format(new Date(row.original.timestamp), "dd/MM/yyyy HH:mm:ss", { locale: fr })}
          </div>
        ),
        enableSorting: true,
      },
      {
        accessorKey: "level",
        header: "Niveau",
        cell: ({ row }) => {
          const level = row.original.level
          const variants = {
            INFO: { color: "bg-blue-600", icon: IconInfoCircle },
            WARN: { color: "bg-amber-600", icon: IconAlertTriangle },
            ERROR: { color: "bg-red-600", icon: IconAlertCircle },
            DEBUG: { color: "bg-gray-600", icon: IconBug },
          }
          const variant = variants[level]
          const Icon = variant.icon
          return (
            <Badge variant="default" className={variant.color}>
              <Icon className="mr-1 h-3 w-3" />
              {level}
            </Badge>
          )
        },
      },
      {
        accessorKey: "event_type",
        header: "Type",
        cell: ({ row }) => (
          <Badge variant="outline">
            {row.original.event_type}
          </Badge>
        ),
      },
      {
        accessorKey: "message",
        header: "Message",
        cell: ({ row }) => (
          <div className="max-w-md truncate text-sm">
            {row.original.message}
          </div>
        ),
      },
      {
        accessorKey: "source",
        header: "Source",
        cell: ({ row }) => (
          <div className="text-sm text-muted-foreground">
            {row.original.source}
          </div>
        ),
      },
      {
        accessorKey: "method",
        header: "Méthode",
        cell: ({ row }) => (
          row.original.method ? (
            <Badge variant="secondary" className="font-mono text-xs">
              {row.original.method}
            </Badge>
          ) : null
        ),
      },
      {
        accessorKey: "status_code",
        header: "Status",
        cell: ({ row }) => {
          const status = row.original.status_code
          if (!status) return null

          const statusColor = status >= 500 ? "text-red-600" :
                              status >= 400 ? "text-amber-600" :
                              status >= 300 ? "text-blue-600" :
                              "text-green-600"

          return (
            <span className={`font-mono text-sm ${statusColor}`}>
              {status}
            </span>
          )
        },
      },
    ],
    []
  )

  const table = useReactTable({
    data: logs,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    state: {
      sorting,
    },
    onSortingChange: setSorting,
  })

  if (loading && !logs.length) {
    return (
      <ContentSection
        title="Logs d'audit"
        desc="Consultez l'historique des événements système"
        className="w-full lg:max-w-full"
      >
        <div className="flex items-center justify-center py-8">
          <IconRefresh className="h-6 w-6 animate-spin" />
        </div>
      </ContentSection>
    )
  }

  const totalPages = Math.ceil(total / pageSize)

  return (
    <ContentSection
      title="Logs d'audit"
      desc="Consultez l'historique des événements système"
      className="w-full lg:max-w-full"
    >
      <div className="space-y-6">
        {/* Statistiques */}
        {stats && (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">INFO</CardTitle>
                <IconInfoCircle className="h-4 w-4 text-blue-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.levels.INFO.toLocaleString()}</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">WARN</CardTitle>
                <IconAlertTriangle className="h-4 w-4 text-amber-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.levels.WARN.toLocaleString()}</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">ERROR</CardTitle>
                <IconAlertCircle className="h-4 w-4 text-red-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.levels.ERROR.toLocaleString()}</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">DEBUG</CardTitle>
                <IconBug className="h-4 w-4 text-gray-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.levels.DEBUG.toLocaleString()}</div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Filtres et recherche */}
        <Card>
          <CardHeader>
            <CardTitle>Filtres</CardTitle>
            <CardDescription>Filtrer et rechercher dans les logs</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1">
                <div className="relative">
                  <IconSearch className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Rechercher dans les messages..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyPress={handleSearchKeyPress}
                    className="pl-10"
                  />
                </div>
              </div>

              <div className="flex gap-2">
                <Select value={levelFilter} onValueChange={setLevelFilter}>
                  <SelectTrigger className="w-[150px]">
                    <IconFilter className="mr-2 h-4 w-4" />
                    <SelectValue placeholder="Niveau" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tous les niveaux</SelectItem>
                    <SelectItem value="INFO">INFO</SelectItem>
                    <SelectItem value="WARN">WARN</SelectItem>
                    <SelectItem value="ERROR">ERROR</SelectItem>
                    <SelectItem value="DEBUG">DEBUG</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={eventTypeFilter} onValueChange={setEventTypeFilter}>
                  <SelectTrigger className="w-[150px]">
                    <IconFilter className="mr-2 h-4 w-4" />
                    <SelectValue placeholder="Type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tous les types</SelectItem>
                    <SelectItem value="API">API</SelectItem>
                    <SelectItem value="AUTH">AUTH</SelectItem>
                    <SelectItem value="CRUD">CRUD</SelectItem>
                    <SelectItem value="SYSTEM">SYSTEM</SelectItem>
                  </SelectContent>
                </Select>

                <Button onClick={handleSearch} variant="default">
                  <IconSearch className="mr-2 h-4 w-4" />
                  Rechercher
                </Button>

                <Button onClick={fetchData} variant="outline" size="icon">
                  <IconRefresh className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Tableau des logs */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Logs récents</CardTitle>
                <CardDescription>
                  {total} log{total > 1 ? 's' : ''} au total
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border">
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
                        Aucun log trouvé
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between mt-4">
              <div className="text-sm text-muted-foreground">
                Page {page + 1} sur {totalPages}
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(Math.max(0, page - 1))}
                  disabled={page === 0}
                >
                  Précédent
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
                  disabled={page >= totalPages - 1}
                >
                  Suivant
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </ContentSection>
  )
}
