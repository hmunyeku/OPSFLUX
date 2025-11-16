"use client"

import { useState, useEffect } from "react"
import {
  DatabaseApi,
  type DatabaseInfo,
  type BackupInfo,
  type SlowQuery,
  type ActiveConnection,
  type PostgresExtension,
  type DatabaseLog,
  type TableStats,
  type ScheduledBackup,
  type IndexSuggestion,
  type MonitoringMetrics,
  type AlertConfig,
  type QueryResponse,
} from "@/lib/database-api"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Separator } from "@/components/ui/separator"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  Database,
  Download,
  Trash2,
  Play,
  HardDrive,
  Activity,
  Clock,
  Loader2,
  Server,
  RefreshCw,
  MoreVertical,
  AlertCircle,
  FileArchive,
  ExternalLink,
  TrendingUp,
  Zap,
  BarChart3,
  Network,
  Puzzle,
  Wrench,
  FileText,
  ChevronDown,
  Search,
  Filter,
  Power,
  RotateCcw,
  Terminal,
  XCircle,
  Plus,
  Info,
  CheckCircle2,
  Calendar,
  Bell,
  Eye,
  Edit2,
  Settings,
  AlertTriangle,
  TrendingDown,
  Pause,
  CircleDot,
} from "lucide-react"
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, LineChart, Line } from "recharts"

export function SettingsDatabaseContent() {
  const [dbInfo, setDbInfo] = useState<DatabaseInfo | null>(null)
  const [backups, setBackups] = useState<BackupInfo[]>([])
  const [slowQueries, setSlowQueries] = useState<SlowQuery[]>([])
  const [activeConnections, setActiveConnections] = useState<ActiveConnection[]>([])
  const [extensions, setExtensions] = useState<PostgresExtension[]>([])
  const [logs, setLogs] = useState<DatabaseLog[]>([])
  const [tableStats, setTableStats] = useState<TableStats[]>([])
  const [scheduledBackups, setScheduledBackups] = useState<ScheduledBackup[]>([])
  const [indexSuggestions, setIndexSuggestions] = useState<IndexSuggestion[]>([])
  const [monitoringMetrics, setMonitoringMetrics] = useState<MonitoringMetrics[]>([])
  const [currentMetrics, setCurrentMetrics] = useState<MonitoringMetrics | null>(null)
  const [alerts, setAlerts] = useState<AlertConfig[]>([])
  const [queryResult, setQueryResult] = useState<QueryResponse | null>(null)

  const [isLoading, setIsLoading] = useState(true)
  const [isCreatingBackup, setIsCreatingBackup] = useState(false)
  const [isExecutingQuery, setIsExecutingQuery] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState("overview")
  const [autoRefresh, setAutoRefresh] = useState(false)

  // Dialogs
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [backupToDelete, setBackupToDelete] = useState<string | null>(null)
  const [restoreDialogOpen, setRestoreDialogOpen] = useState(false)
  const [backupToRestore, setBackupToRestore] = useState<string | null>(null)
  const [killConnectionDialog, setKillConnectionDialog] = useState(false)
  const [connectionToKill, setConnectionToKill] = useState<number | null>(null)
  const [createBackupDialog, setCreateBackupDialog] = useState(false)
  const [createScheduledBackupDialog, setCreateScheduledBackupDialog] = useState(false)
  const [editScheduledBackup, setEditScheduledBackup] = useState<ScheduledBackup | null>(null)
  const [createAlertDialog, setCreateAlertDialog] = useState(false)
  const [editAlert, setEditAlert] = useState<AlertConfig | null>(null)

  // Filters
  const [connectionFilter, setConnectionFilter] = useState("")
  const [logLevelFilter, setLogLevelFilter] = useState("all")
  const [extensionFilter, setExtensionFilter] = useState("all")
  const [queryInput, setQueryInput] = useState("")

  // Form states
  const [backupFormData, setBackupFormData] = useState({
    include_schema: true,
    include_data: true,
    description: "",
  })
  const [scheduledBackupFormData, setScheduledBackupFormData] = useState({
    name: "",
    schedule: "0 2 * * *",
    enabled: true,
    include_schema: true,
    include_data: true,
    retention_days: 7,
  })
  const [alertFormData, setAlertFormData] = useState({
    name: "",
    metric: "active_connections",
    threshold: 100,
    operator: "gt" as "gt" | "lt" | "eq",
    enabled: true,
    notification_channels: [] as string[],
  })

  useEffect(() => {
    loadData()
  }, [])

  useEffect(() => {
    if (activeTab !== "overview" && activeTab !== "backups") loadTabData(activeTab)
  }, [activeTab])

  useEffect(() => {
    if (!autoRefresh) return
    const interval = setInterval(() => {
      loadData()
      if (activeTab !== "overview" && activeTab !== "backups") loadTabData(activeTab)
    }, 10000) // refresh every 10s
    return () => clearInterval(interval)
  }, [autoRefresh, activeTab])

  const loadData = async () => {
    try {
      setIsLoading(true)
      setError(null)
      const [info, backupsData] = await Promise.all([
        DatabaseApi.getDatabaseInfo(),
        DatabaseApi.listBackups(),
      ])
      setDbInfo(info)
      setBackups(backupsData.backups)
    } catch (error) {
      setError("Erreur de chargement des données")
    } finally {
      setIsLoading(false)
    }
  }

  const loadTabData = async (tab: string) => {
    try {
      if (tab === "performance") {
        const [queries, tables, suggestions] = await Promise.all([
          DatabaseApi.getSlowQueries(10).catch(() => ({ queries: [], count: 0 })),
          DatabaseApi.getTableStats().catch(() => ({ tables: [], count: 0 })),
          DatabaseApi.getIndexSuggestions().catch(() => ({ suggestions: [], count: 0 })),
        ])
        setSlowQueries(queries.queries)
        setTableStats(tables.tables)
        setIndexSuggestions(suggestions.suggestions)
      } else if (tab === "connections") {
        const conns = await DatabaseApi.getActiveConnections().catch(() => ({ connections: [], count: 0 }))
        setActiveConnections(conns.connections)
      } else if (tab === "extensions") {
        const exts = await DatabaseApi.listExtensions().catch(() => ({ extensions: [], count: 0 }))
        setExtensions(exts.extensions)
      } else if (tab === "logs") {
        const logsData = await DatabaseApi.getLogs(logLevelFilter === "all" ? undefined : logLevelFilter, 50).catch(
          () => ({ logs: [], count: 0 })
        )
        setLogs(logsData.logs)
      } else if (tab === "scheduled") {
        const scheduled = await DatabaseApi.listScheduledBackups().catch(() => ({ schedules: [], count: 0 }))
        setScheduledBackups(scheduled.schedules)
      } else if (tab === "monitor") {
        const metricsData = await DatabaseApi.getMonitoringMetrics(24).catch(() => ({
          metrics: [],
          current: null as any,
        }))
        setMonitoringMetrics(metricsData.metrics)
        setCurrentMetrics(metricsData.current)
      } else if (tab === "alerts") {
        const alertsData = await DatabaseApi.listAlerts().catch(() => ({ alerts: [], count: 0 }))
        setAlerts(alertsData.alerts)
      }
    } catch (error) {
      console.error("Tab data load error:", error)
    }
  }

  const handleCreateBackup = async () => {
    try {
      setIsCreatingBackup(true)
      const backup = await DatabaseApi.createBackup(backupFormData)
      setSuccessMessage(`Backup créé: ${backup.filename}`)
      const backupsData = await DatabaseApi.listBackups()
      setBackups(backupsData.backups)
      setCreateBackupDialog(false)
      setBackupFormData({ include_schema: true, include_data: true, description: "" })
    } catch (error) {
      setError("Échec création backup")
    } finally {
      setIsCreatingBackup(false)
    }
  }

  const handleRestoreBackup = async () => {
    if (!backupToRestore) return
    try {
      await DatabaseApi.restoreBackup({ filename: backupToRestore })
      setSuccessMessage("Backup restauré avec succès")
      setRestoreDialogOpen(false)
      setBackupToRestore(null)
    } catch (error) {
      setError("Échec restauration backup")
    }
  }

  const handleDeleteBackup = async () => {
    if (!backupToDelete) return
    try {
      await DatabaseApi.deleteBackup(backupToDelete)
      setSuccessMessage("Backup supprimé")
      const backupsData = await DatabaseApi.listBackups()
      setBackups(backupsData.backups)
      setDeleteDialogOpen(false)
      setBackupToDelete(null)
    } catch (error) {
      setError("Échec suppression backup")
    }
  }

  const handleKillConnection = async () => {
    if (!connectionToKill) return
    try {
      await DatabaseApi.killConnection(connectionToKill)
      setSuccessMessage("Connexion terminée")
      const conns = await DatabaseApi.getActiveConnections()
      setActiveConnections(conns.connections)
      setKillConnectionDialog(false)
      setConnectionToKill(null)
    } catch (error) {
      setError("Échec kill connexion")
    }
  }

  const handleMaintenance = async (op: string) => {
    try {
      if (op === "vacuum") await DatabaseApi.runVacuum()
      else if (op === "analyze") await DatabaseApi.runAnalyze()
      else if (op === "reindex") await DatabaseApi.rebuildIndexes()
      setSuccessMessage(`${op.toUpperCase()} terminé avec succès`)
    } catch (error) {
      setError(`Échec ${op}`)
    }
  }

  const handleCreateScheduledBackup = async () => {
    try {
      await DatabaseApi.createScheduledBackup(scheduledBackupFormData)
      setSuccessMessage("Backup planifié créé")
      loadTabData("scheduled")
      setCreateScheduledBackupDialog(false)
      setScheduledBackupFormData({
        name: "",
        schedule: "0 2 * * *",
        enabled: true,
        include_schema: true,
        include_data: true,
        retention_days: 7,
      })
    } catch (error) {
      setError("Échec création backup planifié")
    }
  }

  const handleUpdateScheduledBackup = async () => {
    if (!editScheduledBackup) return
    try {
      await DatabaseApi.updateScheduledBackup(editScheduledBackup.id, scheduledBackupFormData)
      setSuccessMessage("Backup planifié mis à jour")
      loadTabData("scheduled")
      setEditScheduledBackup(null)
    } catch (error) {
      setError("Échec mise à jour backup planifié")
    }
  }

  const handleDeleteScheduledBackup = async (id: string) => {
    try {
      await DatabaseApi.deleteScheduledBackup(id)
      setSuccessMessage("Backup planifié supprimé")
      loadTabData("scheduled")
    } catch (error) {
      setError("Échec suppression backup planifié")
    }
  }

  const handleCreateAlert = async () => {
    try {
      await DatabaseApi.createAlert(alertFormData)
      setSuccessMessage("Alerte créée")
      loadTabData("alerts")
      setCreateAlertDialog(false)
      setAlertFormData({
        name: "",
        metric: "active_connections",
        threshold: 100,
        operator: "gt",
        enabled: true,
        notification_channels: [],
      })
    } catch (error) {
      setError("Échec création alerte")
    }
  }

  const handleUpdateAlert = async () => {
    if (!editAlert) return
    try {
      await DatabaseApi.updateAlert(editAlert.id, alertFormData)
      setSuccessMessage("Alerte mise à jour")
      loadTabData("alerts")
      setEditAlert(null)
    } catch (error) {
      setError("Échec mise à jour alerte")
    }
  }

  const handleDeleteAlert = async (id: string) => {
    try {
      await DatabaseApi.deleteAlert(id)
      setSuccessMessage("Alerte supprimée")
      loadTabData("alerts")
    } catch (error) {
      setError("Échec suppression alerte")
    }
  }

  const handleExecuteQuery = async () => {
    if (!queryInput.trim()) return
    try {
      setIsExecutingQuery(true)
      const result = await DatabaseApi.executeQuery(queryInput)
      setQueryResult(result)
      setSuccessMessage(`Requête exécutée: ${result.row_count} ligne(s)`)
    } catch (error) {
      setError("Échec exécution requête")
    } finally {
      setIsExecutingQuery(false)
    }
  }

  const connectionUsage = dbInfo ? Math.round((dbInfo.active_connections / dbInfo.total_connections) * 100) : 0
  const filteredConnections = activeConnections.filter(
    (c) =>
      !connectionFilter ||
      c.user.toLowerCase().includes(connectionFilter.toLowerCase()) ||
      c.database.toLowerCase().includes(connectionFilter.toLowerCase())
  )
  const filteredExtensions = extensions.filter(
    (e) =>
      extensionFilter === "all" ||
      (extensionFilter === "installed" && e.installed) ||
      (extensionFilter === "available" && !e.installed)
  )

  if (isLoading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <div className="text-center">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary mb-2" />
          <p className="text-sm text-muted-foreground">Chargement des données...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full overflow-auto">
      <TooltipProvider>
        <div className="flex flex-col gap-3 p-3 max-w-[1600px] mx-auto">
          {/* Compact Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold">PostgreSQL Database</h1>
              {dbInfo && (
                <p className="text-xs text-muted-foreground">
                  {dbInfo.database_name} • {dbInfo.postgres_version} • {dbInfo.server_host}:{dbInfo.server_port}
                </p>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-1.5 px-2 py-1 rounded-md border bg-muted/20">
                    <Switch checked={autoRefresh} onCheckedChange={setAutoRefresh} className="scale-75" />
                    <span className="text-[10px] font-medium">Auto</span>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="text-xs">Rafraîchissement automatique (10s)</p>
                </TooltipContent>
              </Tooltip>
              <Button size="sm" variant="outline" onClick={() => loadData()}>
                <RefreshCw className={`h-3.5 w-3.5 ${autoRefresh ? "animate-spin" : ""}`} />
              </Button>
              <Button size="sm" onClick={() => setCreateBackupDialog(true)} disabled={isCreatingBackup}>
                {isCreatingBackup ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Play className="h-3.5 w-3.5" />
                )}
                <span className="ml-1.5">Backup</span>
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" variant="outline">
                    <MoreVertical className="h-3.5 w-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuLabel className="text-xs">Outils Externes</DropdownMenuLabel>
                  <DropdownMenuItem
                    onClick={async () => {
                      try {
                        const response = await DatabaseApi.createAdminerToken()
                        window.open(response.adminer_url, "_blank")
                      } catch (e) {
                        setError("Échec ouverture Adminer")
                      }
                    }}
                  >
                    <ExternalLink className="mr-2 h-3.5 w-3.5" />
                    Ouvrir Adminer
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={async () => {
                      try {
                        const blob = await DatabaseApi.exportStats()
                        const url = URL.createObjectURL(blob)
                        const a = document.createElement("a")
                        a.href = url
                        a.download = `db-stats-${Date.now()}.json`
                        a.click()
                      } catch (e) {
                        setError("Échec export stats")
                      }
                    }}
                  >
                    <Download className="mr-2 h-3.5 w-3.5" />
                    Export Stats JSON
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel className="text-xs">Maintenance</DropdownMenuLabel>
                  <DropdownMenuItem onClick={() => handleMaintenance("vacuum")}>
                    <Wrench className="mr-2 h-3.5 w-3.5" />
                    Run VACUUM
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleMaintenance("analyze")}>
                    <BarChart3 className="mr-2 h-3.5 w-3.5" />
                    Run ANALYZE
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleMaintenance("reindex")}>
                    <Database className="mr-2 h-3.5 w-3.5" />
                    Run REINDEX
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {/* Alerts */}
          {error && (
            <div className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive flex items-center gap-2">
              <AlertCircle className="h-3.5 w-3.5" />
              {error}
              <button onClick={() => setError(null)} className="ml-auto">
                <XCircle className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
          {successMessage && (
            <div className="rounded-md bg-green-50 dark:bg-green-900/20 px-3 py-2 text-xs text-green-600 dark:text-green-400 flex items-center gap-2">
              <CheckCircle2 className="h-3.5 w-3.5" />
              {successMessage}
              <button onClick={() => setSuccessMessage(null)} className="ml-auto">
                <XCircle className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {/* Compact Metrics Grid */}
          {dbInfo && (
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
              <Card className="p-2.5 bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-950/50 dark:to-blue-900/30 border-blue-200 dark:border-blue-800">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-medium text-blue-700 dark:text-blue-300 uppercase">DB Size</span>
                  <HardDrive className="h-3 w-3 text-blue-500" />
                </div>
                <p className="text-lg font-bold text-blue-900 dark:text-blue-100">{dbInfo.database_size}</p>
                {dbInfo.database_size_bytes && (
                  <p className="text-[9px] text-blue-600 dark:text-blue-400">
                    {(dbInfo.database_size_bytes / (1024 * 1024)).toFixed(0)} MB
                  </p>
                )}
              </Card>

              <Card className="p-2.5 bg-gradient-to-br from-green-50 to-green-100 dark:from-green-950/50 dark:to-green-900/30 border-green-200 dark:border-green-800">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-medium text-green-700 dark:text-green-300 uppercase">Tables</span>
                  <Database className="h-3 w-3 text-green-500" />
                </div>
                <p className="text-lg font-bold text-green-900 dark:text-green-100">{dbInfo.total_tables}</p>
              </Card>

              <Card className="p-2.5 bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-950/50 dark:to-purple-900/30 border-purple-200 dark:border-purple-800">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-medium text-purple-700 dark:text-purple-300 uppercase">
                    Connexions
                  </span>
                  <Activity className="h-3 w-3 text-purple-500" />
                </div>
                <p className="text-lg font-bold text-purple-900 dark:text-purple-100">
                  {dbInfo.active_connections}/{dbInfo.total_connections}
                </p>
                <Progress value={connectionUsage} className="h-1 mt-1" />
                <p className="text-[9px] text-purple-600 dark:text-purple-400 mt-0.5">{connectionUsage}% utilisé</p>
              </Card>

              <Card className="p-2.5 bg-gradient-to-br from-orange-50 to-orange-100 dark:from-orange-950/50 dark:to-orange-900/30 border-orange-200 dark:border-orange-800">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-medium text-orange-700 dark:text-orange-300 uppercase">
                    Cache Hit
                  </span>
                  <Zap className="h-3 w-3 text-orange-500" />
                </div>
                <p className="text-lg font-bold text-orange-900 dark:text-orange-100">
                  {dbInfo.cache_hit_ratio ? `${(dbInfo.cache_hit_ratio * 100).toFixed(1)}%` : "N/A"}
                </p>
                {dbInfo.cache_hit_ratio && dbInfo.cache_hit_ratio > 0.95 && (
                  <Badge variant="outline" className="text-[9px] h-4 px-1 border-green-500 text-green-600">
                    Excellent
                  </Badge>
                )}
              </Card>

              <Card className="p-2.5 bg-gradient-to-br from-cyan-50 to-cyan-100 dark:from-cyan-950/50 dark:to-cyan-900/30 border-cyan-200 dark:border-cyan-800">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-medium text-cyan-700 dark:text-cyan-300 uppercase">Backups</span>
                  <FileArchive className="h-3 w-3 text-cyan-500" />
                </div>
                <p className="text-lg font-bold text-cyan-900 dark:text-cyan-100">{backups.length}</p>
                {dbInfo.last_backup && (
                  <p className="text-[9px] text-cyan-600 dark:text-cyan-400">
                    Dernier: {new Date(dbInfo.last_backup).toLocaleDateString("fr-FR")}
                  </p>
                )}
              </Card>

              <Card className="p-2.5 bg-gradient-to-br from-pink-50 to-pink-100 dark:from-pink-950/50 dark:to-pink-900/30 border-pink-200 dark:border-pink-800">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-medium text-pink-700 dark:text-pink-300 uppercase">Uptime</span>
                  <Clock className="h-3 w-3 text-pink-500" />
                </div>
                <p className="text-sm font-bold text-pink-900 dark:text-pink-100">{dbInfo.uptime || "N/A"}</p>
              </Card>
            </div>
          )}

          {/* Compact Tabs */}
          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-2">
            <TabsList className="h-8 p-0.5 bg-muted/50">
              <TabsTrigger value="overview" className="text-xs h-7 px-2">
                <Eye className="h-3 w-3 mr-1" />
                Vue
              </TabsTrigger>
              <TabsTrigger value="backups" className="text-xs h-7 px-2">
                <FileArchive className="h-3 w-3 mr-1" />
                Backups
                <Badge variant="secondary" className="ml-1 h-4 px-1 text-[10px]">
                  {backups.length}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="scheduled" className="text-xs h-7 px-2">
                <Calendar className="h-3 w-3 mr-1" />
                Planifiés
              </TabsTrigger>
              <TabsTrigger value="performance" className="text-xs h-7 px-2">
                <TrendingUp className="h-3 w-3 mr-1" />
                Performance
              </TabsTrigger>
              <TabsTrigger value="connections" className="text-xs h-7 px-2">
                <Network className="h-3 w-3 mr-1" />
                Connexions
                <Badge variant="secondary" className="ml-1 h-4 px-1 text-[10px]">
                  {activeConnections.length}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="extensions" className="text-xs h-7 px-2">
                <Puzzle className="h-3 w-3 mr-1" />
                Extensions
              </TabsTrigger>
              <TabsTrigger value="monitor" className="text-xs h-7 px-2">
                <BarChart3 className="h-3 w-3 mr-1" />
                Monitoring
              </TabsTrigger>
              <TabsTrigger value="alerts" className="text-xs h-7 px-2">
                <Bell className="h-3 w-3 mr-1" />
                Alertes
              </TabsTrigger>
              <TabsTrigger value="logs" className="text-xs h-7 px-2">
                <FileText className="h-3 w-3 mr-1" />
                Logs
              </TabsTrigger>
            </TabsList>

            {/* OVERVIEW TAB */}
            <TabsContent value="overview" className="mt-2 space-y-2">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
                {/* Query Executor */}
                <Card className="p-3">
                  <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                    <Terminal className="h-3.5 w-3.5" />
                    Query Executor
                    <Badge variant="outline" className="text-[9px] h-4 px-1">
                      Read-only
                    </Badge>
                  </h3>
                  <div className="space-y-2">
                    <Textarea
                      placeholder="SELECT * FROM users LIMIT 10;"
                      value={queryInput}
                      onChange={(e) => setQueryInput(e.target.value)}
                      className="h-20 text-xs font-mono"
                    />
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        className="h-7 text-xs"
                        onClick={handleExecuteQuery}
                        disabled={isExecutingQuery || !queryInput.trim()}
                      >
                        {isExecutingQuery ? (
                          <Loader2 className="h-3 w-3 animate-spin mr-1" />
                        ) : (
                          <Play className="h-3 w-3 mr-1" />
                        )}
                        Exécuter
                      </Button>
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setQueryInput("")}>
                        Clear
                      </Button>
                    </div>
                    {queryResult && (
                      <div className="border rounded-md p-2 max-h-40 overflow-auto">
                        <p className="text-[10px] text-muted-foreground mb-1">
                          {queryResult.row_count} ligne(s) • {queryResult.columns.length} colonne(s)
                        </p>
                        <div className="overflow-x-auto">
                          <table className="w-full text-[10px]">
                            <thead>
                              <tr className="border-b">
                                {queryResult.columns.map((col) => (
                                  <th key={col} className="text-left px-2 py-1 font-medium">
                                    {col}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {queryResult.rows.slice(0, 10).map((row, i) => (
                                <tr key={i} className="border-b">
                                  {queryResult.columns.map((col) => (
                                    <td key={col} className="px-2 py-1">
                                      {String(row[col] ?? "null")}
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                </Card>

                {/* Server Info */}
                <Card className="p-3">
                  <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                    <Server className="h-3.5 w-3.5" />
                    Informations Serveur
                  </h3>
                  {dbInfo && (
                    <div className="space-y-2">
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <span className="text-muted-foreground">Host:</span>
                          <p className="font-mono text-[10px]">
                            {dbInfo.server_host}:{dbInfo.server_port}
                          </p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Database:</span>
                          <p className="font-mono text-[10px]">{dbInfo.database_name}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Version:</span>
                          <p className="text-[10px]">{dbInfo.postgres_version}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Total Tables:</span>
                          <p className="text-[10px]">{dbInfo.total_tables}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">DB Size:</span>
                          <p className="text-[10px]">{dbInfo.database_size}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Cache Hit Ratio:</span>
                          <p className="text-[10px]">
                            {dbInfo.cache_hit_ratio ? `${(dbInfo.cache_hit_ratio * 100).toFixed(2)}%` : "N/A"}
                          </p>
                        </div>
                      </div>
                      <Separator />
                      <div className="space-y-1">
                        <div className="flex justify-between text-xs">
                          <span className="text-muted-foreground">Connexions Actives:</span>
                          <span className="font-medium">
                            {dbInfo.active_connections} / {dbInfo.total_connections}
                          </span>
                        </div>
                        <Progress value={connectionUsage} className="h-1.5" />
                      </div>
                    </div>
                  )}
                </Card>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                {/* Quick Actions */}
                <Card className="p-3">
                  <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                    <Zap className="h-3.5 w-3.5" />
                    Actions Rapides
                  </h3>
                  <div className="space-y-1.5">
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full justify-start h-8 text-xs"
                      onClick={() => setCreateBackupDialog(true)}
                    >
                      <Play className="h-3 w-3 mr-2" />
                      Créer Backup
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full justify-start h-8 text-xs"
                      onClick={() => setActiveTab("scheduled")}
                    >
                      <Calendar className="h-3 w-3 mr-2" />
                      Backups Planifiés
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full justify-start h-8 text-xs"
                      onClick={() => handleMaintenance("vacuum")}
                    >
                      <Wrench className="h-3 w-3 mr-2" />
                      Run VACUUM
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full justify-start h-8 text-xs"
                      onClick={() => setActiveTab("connections")}
                    >
                      <Network className="h-3 w-3 mr-2" />
                      Voir Connexions
                    </Button>
                  </div>
                </Card>

                {/* Derniers Backups */}
                <Card className="p-3">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-semibold flex items-center gap-2">
                      <FileArchive className="h-3.5 w-3.5" />
                      Derniers Backups
                    </h3>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 text-xs"
                      onClick={() => setActiveTab("backups")}
                    >
                      Tout voir
                    </Button>
                  </div>
                  <div className="space-y-1">
                    {backups.length === 0 ? (
                      <div className="text-center py-4">
                        <FileArchive className="h-6 w-6 text-muted-foreground mx-auto mb-1" />
                        <p className="text-xs text-muted-foreground">Aucun backup</p>
                        <Button
                          size="sm"
                          variant="outline"
                          className="mt-2 h-7 text-xs"
                          onClick={() => setCreateBackupDialog(true)}
                        >
                          Créer maintenant
                        </Button>
                      </div>
                    ) : (
                      backups.slice(0, 4).map((backup) => (
                        <div
                          key={backup.filename}
                          className="flex items-center justify-between text-xs py-1 border-b last:border-0"
                        >
                          <span className="truncate flex-1 font-mono text-[10px]">
                            {backup.filename.slice(0, 25)}...
                          </span>
                          <span className="text-muted-foreground text-[10px]">{backup.size}</span>
                        </div>
                      ))
                    )}
                  </div>
                </Card>

                {/* System Status */}
                <Card className="p-3">
                  <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                    <Activity className="h-3.5 w-3.5" />
                    État Système
                  </h3>
                  {dbInfo && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">Cache Hit Ratio:</span>
                        <Badge
                          variant={
                            dbInfo.cache_hit_ratio && dbInfo.cache_hit_ratio > 0.95
                              ? "default"
                              : dbInfo.cache_hit_ratio && dbInfo.cache_hit_ratio > 0.85
                                ? "secondary"
                                : "destructive"
                          }
                          className="text-[9px] h-4 px-1"
                        >
                          {dbInfo.cache_hit_ratio ? `${(dbInfo.cache_hit_ratio * 100).toFixed(1)}%` : "N/A"}
                        </Badge>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">Connexions:</span>
                        <Badge
                          variant={connectionUsage > 80 ? "destructive" : connectionUsage > 60 ? "secondary" : "default"}
                          className="text-[9px] h-4 px-1"
                        >
                          {connectionUsage}%
                        </Badge>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">Uptime:</span>
                        <span className="text-[10px] font-mono">{dbInfo.uptime || "N/A"}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">Backups:</span>
                        <Badge
                          variant={backups.length === 0 ? "destructive" : "default"}
                          className="text-[9px] h-4 px-1"
                        >
                          {backups.length}
                        </Badge>
                      </div>
                    </div>
                  )}
                </Card>
              </div>
            </TabsContent>

            {/* BACKUPS TAB */}
            <TabsContent value="backups" className="mt-2">
              <Card>
                <div className="border-b px-3 py-2 flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold">Sauvegardes de la Base de Données</h3>
                    <p className="text-[10px] text-muted-foreground">{backups.length} backup(s) disponible(s)</p>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => setCreateBackupDialog(true)}
                    disabled={isCreatingBackup}
                    className="h-7 text-xs"
                  >
                    <Plus className="h-3 w-3 mr-1" />
                    Nouveau Backup
                  </Button>
                </div>
                <div className="max-h-[450px] overflow-y-auto">
                  {backups.length === 0 ? (
                    <div className="text-center py-12">
                      <FileArchive className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                      <p className="text-sm font-medium mb-1">Aucun backup disponible</p>
                      <p className="text-xs text-muted-foreground mb-4">
                        Créez votre premier backup pour sécuriser vos données
                      </p>
                      <Button size="sm" onClick={() => setCreateBackupDialog(true)}>
                        <Plus className="h-3 w-3 mr-1" />
                        Créer un Backup
                      </Button>
                    </div>
                  ) : (
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-muted/50 backdrop-blur">
                        <tr>
                          <th className="text-left px-3 py-1.5 font-medium">Fichier</th>
                          <th className="text-left px-3 py-1.5 font-medium">Base</th>
                          <th className="text-left px-3 py-1.5 font-medium">Date de Création</th>
                          <th className="text-left px-3 py-1.5 font-medium">Taille</th>
                          <th className="text-right px-3 py-1.5 font-medium">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {backups.map((backup) => (
                          <tr key={backup.filename} className="hover:bg-muted/30 transition-colors">
                            <td className="px-3 py-2 font-mono text-[10px]">{backup.filename}</td>
                            <td className="px-3 py-2 text-[10px]">{backup.database_name}</td>
                            <td className="px-3 py-2 text-muted-foreground text-[10px]">
                              {new Date(backup.created_at).toLocaleString("fr-FR", {
                                dateStyle: "short",
                                timeStyle: "short",
                              })}
                            </td>
                            <td className="px-3 py-2 text-[10px]">
                              <Badge variant="outline" className="text-[9px] h-4 px-1">
                                {backup.size}
                              </Badge>
                            </td>
                            <td className="px-3 py-2">
                              <div className="flex items-center justify-end gap-0.5">
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="h-6 w-6 p-0"
                                      onClick={async () => {
                                        const blob = await DatabaseApi.downloadBackup(backup.filename)
                                        const url = URL.createObjectURL(blob)
                                        const a = document.createElement("a")
                                        a.href = url
                                        a.download = backup.filename
                                        a.click()
                                      }}
                                    >
                                      <Download className="h-3 w-3" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p className="text-xs">Télécharger</p>
                                  </TooltipContent>
                                </Tooltip>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="h-6 w-6 p-0"
                                      onClick={() => {
                                        setBackupToRestore(backup.filename)
                                        setRestoreDialogOpen(true)
                                      }}
                                    >
                                      <RotateCcw className="h-3 w-3" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p className="text-xs">Restaurer</p>
                                  </TooltipContent>
                                </Tooltip>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                                      onClick={() => {
                                        setBackupToDelete(backup.filename)
                                        setDeleteDialogOpen(true)
                                      }}
                                    >
                                      <Trash2 className="h-3 w-3" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p className="text-xs">Supprimer</p>
                                  </TooltipContent>
                                </Tooltip>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </Card>
            </TabsContent>

            {/* SCHEDULED BACKUPS TAB */}
            <TabsContent value="scheduled" className="mt-2">
              <Card>
                <div className="border-b px-3 py-2 flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold">Backups Planifiés</h3>
                    <p className="text-[10px] text-muted-foreground">Automatisation des sauvegardes</p>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => setCreateScheduledBackupDialog(true)}
                    className="h-7 text-xs"
                  >
                    <Plus className="h-3 w-3 mr-1" />
                    Nouveau
                  </Button>
                </div>
                <div className="max-h-[450px] overflow-y-auto">
                  {scheduledBackups.length === 0 ? (
                    <div className="text-center py-12">
                      <Calendar className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                      <p className="text-sm font-medium mb-1">Aucun backup planifié</p>
                      <p className="text-xs text-muted-foreground mb-4">
                        Automatisez vos sauvegardes avec des planifications récurrentes
                      </p>
                      <Button size="sm" onClick={() => setCreateScheduledBackupDialog(true)}>
                        <Plus className="h-3 w-3 mr-1" />
                        Créer une Planification
                      </Button>
                    </div>
                  ) : (
                    <div className="p-2 space-y-2">
                      {scheduledBackups.map((schedule) => (
                        <Card key={schedule.id} className="p-3">
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <h4 className="text-sm font-medium">{schedule.name}</h4>
                                <Badge
                                  variant={schedule.enabled ? "default" : "secondary"}
                                  className="text-[9px] h-4 px-1"
                                >
                                  {schedule.enabled ? "Actif" : "Pausé"}
                                </Badge>
                              </div>
                              <div className="grid grid-cols-2 gap-2 text-xs">
                                <div>
                                  <span className="text-muted-foreground">Schedule:</span>
                                  <p className="font-mono text-[10px]">{schedule.schedule}</p>
                                </div>
                                <div>
                                  <span className="text-muted-foreground">Rétention:</span>
                                  <p className="text-[10px]">{schedule.retention_days} jours</p>
                                </div>
                                {schedule.last_run && (
                                  <div>
                                    <span className="text-muted-foreground">Dernière exec:</span>
                                    <p className="text-[10px]">
                                      {new Date(schedule.last_run).toLocaleDateString("fr-FR")}
                                    </p>
                                  </div>
                                )}
                                {schedule.next_run && (
                                  <div>
                                    <span className="text-muted-foreground">Prochaine exec:</span>
                                    <p className="text-[10px]">
                                      {new Date(schedule.next_run).toLocaleDateString("fr-FR")}
                                    </p>
                                  </div>
                                )}
                              </div>
                              <div className="flex items-center gap-2 mt-2">
                                {schedule.include_schema && (
                                  <Badge variant="outline" className="text-[9px] h-4 px-1">
                                    Schema
                                  </Badge>
                                )}
                                {schedule.include_data && (
                                  <Badge variant="outline" className="text-[9px] h-4 px-1">
                                    Data
                                  </Badge>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-1">
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 w-7 p-0"
                                onClick={() => {
                                  setEditScheduledBackup(schedule)
                                  setScheduledBackupFormData({
                                    name: schedule.name,
                                    schedule: schedule.schedule,
                                    enabled: schedule.enabled,
                                    include_schema: schedule.include_schema,
                                    include_data: schedule.include_data,
                                    retention_days: schedule.retention_days,
                                  })
                                }}
                              >
                                <Edit2 className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 w-7 p-0 text-destructive"
                                onClick={() => handleDeleteScheduledBackup(schedule.id)}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </div>
                        </Card>
                      ))}
                    </div>
                  )}
                </div>
              </Card>
            </TabsContent>

            {/* PERFORMANCE TAB */}
            <TabsContent value="performance" className="mt-2 space-y-2">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
                {/* Slow Queries */}
                <Card>
                  <div className="border-b px-3 py-2">
                    <h3 className="text-sm font-semibold">Requêtes Lentes</h3>
                    <p className="text-[10px] text-muted-foreground">Top 10 des requêtes les plus lentes</p>
                  </div>
                  <div className="p-2 space-y-1 max-h-[350px] overflow-y-auto">
                    {slowQueries.length === 0 ? (
                      <div className="text-center py-8">
                        <TrendingUp className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                        <p className="text-xs text-muted-foreground">Aucune donnée disponible</p>
                      </div>
                    ) : (
                      slowQueries.map((q, i) => (
                        <div key={i} className="p-2 rounded border bg-muted/20 hover:bg-muted/40 transition-colors">
                          <code className="text-[10px] block truncate mb-1 font-mono">{q.query}</code>
                          <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                            <span>{q.calls} appels</span>
                            <span>{q.mean_time.toFixed(2)}ms moy</span>
                            <span className="font-medium">{q.total_time.toFixed(2)}ms total</span>
                          </div>
                          <Progress value={(q.mean_time / 1000) * 100} className="h-0.5 mt-1" />
                        </div>
                      ))
                    )}
                  </div>
                </Card>

                {/* Table Stats */}
                <Card>
                  <div className="border-b px-3 py-2">
                    <h3 className="text-sm font-semibold">Top Tables</h3>
                    <p className="text-[10px] text-muted-foreground">Tables par taille</p>
                  </div>
                  <div className="max-h-[350px] overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-muted/50">
                        <tr>
                          <th className="text-left px-2 py-1 font-medium">Table</th>
                          <th className="text-right px-2 py-1 font-medium">Rows</th>
                          <th className="text-right px-2 py-1 font-medium">Size</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {tableStats.slice(0, 15).map((t, i) => (
                          <tr key={i} className="hover:bg-muted/30">
                            <td className="px-2 py-1 font-mono text-[10px]">{t.table_name}</td>
                            <td className="px-2 py-1 text-right">{t.row_count.toLocaleString()}</td>
                            <td className="px-2 py-1 text-right">
                              <Badge variant="outline" className="text-[9px] h-4 px-1">
                                {t.size}
                              </Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              </div>

              {/* Index Suggestions */}
              {indexSuggestions.length > 0 && (
                <Card>
                  <div className="border-b px-3 py-2">
                    <h3 className="text-sm font-semibold flex items-center gap-2">
                      <AlertTriangle className="h-3.5 w-3.5 text-orange-500" />
                      Suggestions d'Index
                    </h3>
                    <p className="text-[10px] text-muted-foreground">
                      Améliorez les performances en créant ces index
                    </p>
                  </div>
                  <div className="p-2 space-y-1">
                    {indexSuggestions.map((suggestion, i) => (
                      <div key={i} className="p-2 rounded border flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-0.5">
                            <Badge
                              variant={
                                suggestion.impact === "high"
                                  ? "destructive"
                                  : suggestion.impact === "medium"
                                    ? "default"
                                    : "secondary"
                              }
                              className="text-[9px] h-4 px-1"
                            >
                              {suggestion.impact}
                            </Badge>
                            <code className="text-xs font-mono">
                              {suggestion.table_name}.{suggestion.column_name}
                            </code>
                          </div>
                          <p className="text-[10px] text-muted-foreground">{suggestion.reason}</p>
                        </div>
                        <Info className="h-3.5 w-3.5 text-muted-foreground" />
                      </div>
                    ))}
                  </div>
                </Card>
              )}
            </TabsContent>

            {/* CONNECTIONS TAB */}
            <TabsContent value="connections" className="mt-2">
              <Card>
                <div className="border-b px-3 py-2 flex items-center gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-2 top-1.5 h-3 w-3 text-muted-foreground" />
                    <Input
                      placeholder="Filtrer par user ou database..."
                      value={connectionFilter}
                      onChange={(e) => setConnectionFilter(e.target.value)}
                      className="h-7 text-xs pl-7"
                    />
                  </div>
                  <Button size="sm" variant="outline" onClick={() => loadTabData("connections")} className="h-7">
                    <RefreshCw className="h-3 w-3" />
                  </Button>
                </div>
                <div className="max-h-[450px] overflow-y-auto">
                  {filteredConnections.length === 0 ? (
                    <div className="text-center py-12">
                      <Network className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                      <p className="text-sm font-medium mb-1">Aucune connexion active</p>
                      <p className="text-xs text-muted-foreground">Toutes les connexions ont été fermées</p>
                    </div>
                  ) : (
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-muted/50 backdrop-blur">
                        <tr>
                          <th className="text-left px-2 py-1 font-medium">PID</th>
                          <th className="text-left px-2 py-1 font-medium">User</th>
                          <th className="text-left px-2 py-1 font-medium">DB</th>
                          <th className="text-left px-2 py-1 font-medium">App</th>
                          <th className="text-left px-2 py-1 font-medium">State</th>
                          <th className="text-left px-2 py-1 font-medium">Query</th>
                          <th className="text-right px-2 py-1 font-medium">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {filteredConnections.map((conn) => (
                          <tr key={conn.pid} className="hover:bg-muted/30 transition-colors">
                            <td className="px-2 py-1.5 font-mono text-[10px]">{conn.pid}</td>
                            <td className="px-2 py-1.5 text-[10px]">{conn.user}</td>
                            <td className="px-2 py-1.5 font-mono text-[10px]">{conn.database}</td>
                            <td className="px-2 py-1.5 text-[10px] truncate max-w-[100px]">
                              {conn.application_name}
                            </td>
                            <td className="px-2 py-1.5">
                              <Badge
                                variant={conn.state === "active" ? "default" : "secondary"}
                                className="text-[9px] h-4 px-1"
                              >
                                {conn.state}
                              </Badge>
                            </td>
                            <td className="px-2 py-1.5">
                              <code className="text-[10px] truncate block max-w-xs">{conn.query}</code>
                            </td>
                            <td className="px-2 py-1.5 text-right">
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                                    onClick={() => {
                                      setConnectionToKill(conn.pid)
                                      setKillConnectionDialog(true)
                                    }}
                                  >
                                    <Power className="h-3 w-3" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p className="text-xs">Terminer la connexion</p>
                                </TooltipContent>
                              </Tooltip>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </Card>
            </TabsContent>

            {/* EXTENSIONS TAB */}
            <TabsContent value="extensions" className="mt-2">
              <Card>
                <div className="border-b px-3 py-2 flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold">Extensions PostgreSQL</h3>
                    <p className="text-[10px] text-muted-foreground">Gérer les extensions de la base</p>
                  </div>
                  <Select value={extensionFilter} onValueChange={setExtensionFilter}>
                    <SelectTrigger className="w-32 h-7 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Toutes</SelectItem>
                      <SelectItem value="installed">Installées</SelectItem>
                      <SelectItem value="available">Disponibles</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="max-h-[450px] overflow-y-auto p-2 space-y-1">
                  {filteredExtensions.length === 0 ? (
                    <div className="text-center py-12">
                      <Puzzle className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                      <p className="text-sm font-medium mb-1">Aucune extension</p>
                      <p className="text-xs text-muted-foreground">Aucune extension ne correspond au filtre</p>
                    </div>
                  ) : (
                    filteredExtensions.map((ext) => (
                      <div
                        key={ext.name}
                        className="flex items-center justify-between p-2.5 rounded border hover:bg-muted/20 transition-colors"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="text-xs font-medium">{ext.name}</span>
                            <Badge
                              variant={ext.installed ? "default" : "outline"}
                              className="text-[9px] h-4 px-1"
                            >
                              {ext.installed ? "Installée" : "Disponible"}
                            </Badge>
                            <span className="text-[10px] text-muted-foreground">v{ext.version}</span>
                          </div>
                          <p className="text-[10px] text-muted-foreground truncate">
                            {ext.description || "Aucune description"}
                          </p>
                        </div>
                        {ext.installed ? (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs ml-2"
                            onClick={async () => {
                              try {
                                await DatabaseApi.uninstallExtension(ext.name)
                                setSuccessMessage(`Extension ${ext.name} désinstallée`)
                                loadTabData("extensions")
                              } catch (e) {
                                setError(`Échec désinstallation ${ext.name}`)
                              }
                            }}
                          >
                            <Trash2 className="h-3 w-3 mr-1" />
                            Désinstaller
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            className="h-7 text-xs ml-2"
                            onClick={async () => {
                              try {
                                await DatabaseApi.installExtension(ext.name)
                                setSuccessMessage(`Extension ${ext.name} installée`)
                                loadTabData("extensions")
                              } catch (e) {
                                setError(`Échec installation ${ext.name}`)
                              }
                            }}
                          >
                            <Download className="h-3 w-3 mr-1" />
                            Installer
                          </Button>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </Card>
            </TabsContent>

            {/* MONITORING TAB */}
            <TabsContent value="monitor" className="mt-2 space-y-2">
              {/* Current Metrics */}
              {currentMetrics && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  <Card className="p-2.5">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] font-medium text-muted-foreground uppercase">
                        Connexions Actives
                      </span>
                      <Activity className="h-3 w-3 text-blue-500" />
                    </div>
                    <p className="text-lg font-bold">{currentMetrics.active_connections}</p>
                    <p className="text-[9px] text-muted-foreground">
                      {currentMetrics.idle_connections} inactives
                    </p>
                  </Card>

                  <Card className="p-2.5">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] font-medium text-muted-foreground uppercase">Taille DB</span>
                      <HardDrive className="h-3 w-3 text-green-500" />
                    </div>
                    <p className="text-lg font-bold">
                      {(currentMetrics.database_size_bytes / (1024 * 1024 * 1024)).toFixed(2)} GB
                    </p>
                  </Card>

                  <Card className="p-2.5">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] font-medium text-muted-foreground uppercase">Cache Hit</span>
                      <Zap className="h-3 w-3 text-orange-500" />
                    </div>
                    <p className="text-lg font-bold">{(currentMetrics.cache_hit_ratio * 100).toFixed(1)}%</p>
                  </Card>

                  <Card className="p-2.5">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] font-medium text-muted-foreground uppercase">TPS</span>
                      <TrendingUp className="h-3 w-3 text-purple-500" />
                    </div>
                    <p className="text-lg font-bold">{currentMetrics.transactions_per_second.toFixed(0)}</p>
                    <p className="text-[9px] text-muted-foreground">
                      {currentMetrics.queries_per_second.toFixed(0)} QPS
                    </p>
                  </Card>
                </div>
              )}

              {/* Charts */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
                <Card className="p-3">
                  <h3 className="text-sm font-semibold mb-3">Connexions (24h)</h3>
                  <ResponsiveContainer width="100%" height={200}>
                    <AreaChart data={monitoringMetrics}>
                      <defs>
                        <linearGradient id="connections" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#8884d8" stopOpacity={0.8} />
                          <stop offset="95%" stopColor="#8884d8" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis
                        dataKey="timestamp"
                        tickFormatter={(value) => new Date(value).toLocaleTimeString("fr-FR", { hour: "2-digit" })}
                        className="text-xs"
                      />
                      <YAxis className="text-xs" />
                      <RechartsTooltip contentStyle={{ fontSize: "12px" }} />
                      <Area
                        type="monotone"
                        dataKey="active_connections"
                        stroke="#8884d8"
                        fillOpacity={1}
                        fill="url(#connections)"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </Card>

                <Card className="p-3">
                  <h3 className="text-sm font-semibold mb-3">Cache Hit Ratio (24h)</h3>
                  <ResponsiveContainer width="100%" height={200}>
                    <LineChart data={monitoringMetrics}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis
                        dataKey="timestamp"
                        tickFormatter={(value) => new Date(value).toLocaleTimeString("fr-FR", { hour: "2-digit" })}
                        className="text-xs"
                      />
                      <YAxis className="text-xs" domain={[0, 1]} tickFormatter={(value) => `${(value * 100).toFixed(0)}%`} />
                      <RechartsTooltip contentStyle={{ fontSize: "12px" }} formatter={(value: any) => `${(value * 100).toFixed(2)}%`} />
                      <Line type="monotone" dataKey="cache_hit_ratio" stroke="#82ca9d" strokeWidth={2} />
                    </LineChart>
                  </ResponsiveContainer>
                </Card>

                <Card className="p-3">
                  <h3 className="text-sm font-semibold mb-3">Transactions par Seconde (24h)</h3>
                  <ResponsiveContainer width="100%" height={200}>
                    <AreaChart data={monitoringMetrics}>
                      <defs>
                        <linearGradient id="transactions" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#ffc658" stopOpacity={0.8} />
                          <stop offset="95%" stopColor="#ffc658" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis
                        dataKey="timestamp"
                        tickFormatter={(value) => new Date(value).toLocaleTimeString("fr-FR", { hour: "2-digit" })}
                        className="text-xs"
                      />
                      <YAxis className="text-xs" />
                      <RechartsTooltip contentStyle={{ fontSize: "12px" }} />
                      <Area
                        type="monotone"
                        dataKey="transactions_per_second"
                        stroke="#ffc658"
                        fillOpacity={1}
                        fill="url(#transactions)"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </Card>

                <Card className="p-3">
                  <h3 className="text-sm font-semibold mb-3">Taille Base de Données (24h)</h3>
                  <ResponsiveContainer width="100%" height={200}>
                    <LineChart data={monitoringMetrics}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis
                        dataKey="timestamp"
                        tickFormatter={(value) => new Date(value).toLocaleTimeString("fr-FR", { hour: "2-digit" })}
                        className="text-xs"
                      />
                      <YAxis
                        className="text-xs"
                        tickFormatter={(value) => `${(value / (1024 * 1024 * 1024)).toFixed(1)}GB`}
                      />
                      <RechartsTooltip
                        contentStyle={{ fontSize: "12px" }}
                        formatter={(value: any) => `${(value / (1024 * 1024 * 1024)).toFixed(2)} GB`}
                      />
                      <Line type="monotone" dataKey="database_size_bytes" stroke="#ff7c7c" strokeWidth={2} />
                    </LineChart>
                  </ResponsiveContainer>
                </Card>
              </div>
            </TabsContent>

            {/* ALERTS TAB */}
            <TabsContent value="alerts" className="mt-2">
              <Card>
                <div className="border-b px-3 py-2 flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold">Configuration des Alertes</h3>
                    <p className="text-[10px] text-muted-foreground">Surveillez les métriques critiques</p>
                  </div>
                  <Button size="sm" onClick={() => setCreateAlertDialog(true)} className="h-7 text-xs">
                    <Plus className="h-3 w-3 mr-1" />
                    Nouvelle Alerte
                  </Button>
                </div>
                <div className="max-h-[450px] overflow-y-auto">
                  {alerts.length === 0 ? (
                    <div className="text-center py-12">
                      <Bell className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                      <p className="text-sm font-medium mb-1">Aucune alerte configurée</p>
                      <p className="text-xs text-muted-foreground mb-4">
                        Créez des alertes pour être notifié des problèmes
                      </p>
                      <Button size="sm" onClick={() => setCreateAlertDialog(true)}>
                        <Plus className="h-3 w-3 mr-1" />
                        Créer une Alerte
                      </Button>
                    </div>
                  ) : (
                    <div className="p-2 space-y-2">
                      {alerts.map((alert) => (
                        <Card key={alert.id} className="p-3">
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <h4 className="text-sm font-medium">{alert.name}</h4>
                                <Badge
                                  variant={alert.enabled ? "default" : "secondary"}
                                  className="text-[9px] h-4 px-1"
                                >
                                  {alert.enabled ? "Actif" : "Désactivé"}
                                </Badge>
                              </div>
                              <div className="grid grid-cols-2 gap-2 text-xs">
                                <div>
                                  <span className="text-muted-foreground">Métrique:</span>
                                  <p className="text-[10px] font-mono">{alert.metric}</p>
                                </div>
                                <div>
                                  <span className="text-muted-foreground">Condition:</span>
                                  <p className="text-[10px]">
                                    {alert.operator === "gt"
                                      ? ">"
                                      : alert.operator === "lt"
                                        ? "<"
                                        : "="}{" "}
                                    {alert.threshold}
                                  </p>
                                </div>
                              </div>
                              {alert.notification_channels.length > 0 && (
                                <div className="mt-2">
                                  <span className="text-xs text-muted-foreground">Canaux:</span>
                                  <div className="flex gap-1 mt-0.5">
                                    {alert.notification_channels.map((channel) => (
                                      <Badge key={channel} variant="outline" className="text-[9px] h-4 px-1">
                                        {channel}
                                      </Badge>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                            <div className="flex items-center gap-1">
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 w-7 p-0"
                                onClick={() => {
                                  setEditAlert(alert)
                                  setAlertFormData({
                                    name: alert.name,
                                    metric: alert.metric,
                                    threshold: alert.threshold,
                                    operator: alert.operator,
                                    enabled: alert.enabled,
                                    notification_channels: alert.notification_channels,
                                  })
                                }}
                              >
                                <Edit2 className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 w-7 p-0 text-destructive"
                                onClick={() => handleDeleteAlert(alert.id)}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </div>
                        </Card>
                      ))}
                    </div>
                  )}
                </div>
              </Card>
            </TabsContent>

            {/* LOGS TAB */}
            <TabsContent value="logs" className="mt-2">
              <Card>
                <div className="border-b px-3 py-2 flex items-center justify-between">
                  <h3 className="text-sm font-semibold">Logs PostgreSQL</h3>
                  <div className="flex items-center gap-2">
                    <Select
                      value={logLevelFilter}
                      onValueChange={(v) => {
                        setLogLevelFilter(v)
                        loadTabData("logs")
                      }}
                    >
                      <SelectTrigger className="w-28 h-7 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Tous</SelectItem>
                        <SelectItem value="ERROR">ERROR</SelectItem>
                        <SelectItem value="WARNING">WARNING</SelectItem>
                        <SelectItem value="INFO">INFO</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button size="sm" variant="outline" onClick={() => loadTabData("logs")} className="h-7">
                      <RefreshCw className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
                <div className="max-h-[450px] overflow-y-auto p-2 space-y-1">
                  {logs.length === 0 ? (
                    <div className="text-center py-12">
                      <FileText className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                      <p className="text-sm font-medium mb-1">Aucun log disponible</p>
                      <p className="text-xs text-muted-foreground">Les logs apparaîtront ici</p>
                    </div>
                  ) : (
                    logs.map((log, i) => (
                      <div
                        key={i}
                        className="p-2 rounded border text-xs hover:bg-muted/20 transition-colors"
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <Badge
                            variant={
                              log.level === "ERROR"
                                ? "destructive"
                                : log.level === "WARNING"
                                  ? "default"
                                  : "secondary"
                            }
                            className="text-[9px] h-4 px-1"
                          >
                            {log.level}
                          </Badge>
                          <span className="text-[10px] text-muted-foreground">
                            {new Date(log.timestamp).toLocaleString("fr-FR", {
                              timeStyle: "short",
                              dateStyle: "short",
                            })}
                          </span>
                        </div>
                        <p className="text-[10px] font-mono">{log.message}</p>
                        {log.detail && (
                          <p className="text-[9px] text-muted-foreground mt-1 pl-2 border-l-2">
                            {log.detail}
                          </p>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </Card>
            </TabsContent>
          </Tabs>
        </div>

        {/* Dialogs */}

        {/* Create Backup Dialog */}
        <Dialog open={createBackupDialog} onOpenChange={setCreateBackupDialog}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Créer un Backup</DialogTitle>
              <DialogDescription className="text-xs">
                Sauvegarder la base de données {dbInfo?.database_name}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label htmlFor="include-schema" className="text-xs">
                  Inclure le schéma
                </Label>
                <Switch
                  id="include-schema"
                  checked={backupFormData.include_schema}
                  onCheckedChange={(checked) =>
                    setBackupFormData({ ...backupFormData, include_schema: checked })
                  }
                />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="include-data" className="text-xs">
                  Inclure les données
                </Label>
                <Switch
                  id="include-data"
                  checked={backupFormData.include_data}
                  onCheckedChange={(checked) =>
                    setBackupFormData({ ...backupFormData, include_data: checked })
                  }
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="description" className="text-xs">
                  Description (optionnel)
                </Label>
                <Textarea
                  id="description"
                  placeholder="Notes sur ce backup..."
                  value={backupFormData.description}
                  onChange={(e) => setBackupFormData({ ...backupFormData, description: e.target.value })}
                  className="text-xs h-20"
                />
              </div>
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button size="sm" variant="outline" onClick={() => setCreateBackupDialog(false)}>
                Annuler
              </Button>
              <Button size="sm" onClick={handleCreateBackup} disabled={isCreatingBackup}>
                {isCreatingBackup && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
                Créer
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Backup Dialog */}
        <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="text-base">Supprimer le backup</DialogTitle>
              <DialogDescription className="text-xs">{backupToDelete}</DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button size="sm" variant="outline" onClick={() => setDeleteDialogOpen(false)}>
                Annuler
              </Button>
              <Button size="sm" variant="destructive" onClick={handleDeleteBackup}>
                Supprimer
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Restore Backup Dialog */}
        <Dialog open={restoreDialogOpen} onOpenChange={setRestoreDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="text-base">Restaurer le backup</DialogTitle>
              <DialogDescription className="text-xs">
                {backupToRestore}
                <br />
                <span className="text-destructive">Attention: Cette action remplacera les données actuelles</span>
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button size="sm" variant="outline" onClick={() => setRestoreDialogOpen(false)}>
                Annuler
              </Button>
              <Button size="sm" variant="destructive" onClick={handleRestoreBackup}>
                Restaurer
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Kill Connection Dialog */}
        <Dialog open={killConnectionDialog} onOpenChange={setKillConnectionDialog}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="text-base">Terminer la connexion</DialogTitle>
              <DialogDescription className="text-xs">PID: {connectionToKill}</DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button size="sm" variant="outline" onClick={() => setKillConnectionDialog(false)}>
                Annuler
              </Button>
              <Button size="sm" variant="destructive" onClick={handleKillConnection}>
                Terminer
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Create/Edit Scheduled Backup Dialog */}
        <Dialog
          open={createScheduledBackupDialog || !!editScheduledBackup}
          onOpenChange={(open) => {
            if (!open) {
              setCreateScheduledBackupDialog(false)
              setEditScheduledBackup(null)
            }
          }}
        >
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>{editScheduledBackup ? "Modifier" : "Créer"} un Backup Planifié</DialogTitle>
              <DialogDescription className="text-xs">
                Automatisez vos sauvegardes avec une planification récurrente
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="schedule-name" className="text-xs">
                  Nom
                </Label>
                <Input
                  id="schedule-name"
                  placeholder="Backup quotidien"
                  value={scheduledBackupFormData.name}
                  onChange={(e) =>
                    setScheduledBackupFormData({ ...scheduledBackupFormData, name: e.target.value })
                  }
                  className="text-xs h-8"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="schedule-cron" className="text-xs">
                  Planification (cron)
                </Label>
                <Input
                  id="schedule-cron"
                  placeholder="0 2 * * *"
                  value={scheduledBackupFormData.schedule}
                  onChange={(e) =>
                    setScheduledBackupFormData({ ...scheduledBackupFormData, schedule: e.target.value })
                  }
                  className="text-xs h-8 font-mono"
                />
                <p className="text-[10px] text-muted-foreground">Exemple: 0 2 * * * = tous les jours à 2h</p>
              </div>
              <div className="space-y-1">
                <Label htmlFor="retention" className="text-xs">
                  Rétention (jours)
                </Label>
                <Input
                  id="retention"
                  type="number"
                  value={scheduledBackupFormData.retention_days}
                  onChange={(e) =>
                    setScheduledBackupFormData({
                      ...scheduledBackupFormData,
                      retention_days: parseInt(e.target.value),
                    })
                  }
                  className="text-xs h-8"
                />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="schedule-schema" className="text-xs">
                  Inclure le schéma
                </Label>
                <Switch
                  id="schedule-schema"
                  checked={scheduledBackupFormData.include_schema}
                  onCheckedChange={(checked) =>
                    setScheduledBackupFormData({ ...scheduledBackupFormData, include_schema: checked })
                  }
                />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="schedule-data" className="text-xs">
                  Inclure les données
                </Label>
                <Switch
                  id="schedule-data"
                  checked={scheduledBackupFormData.include_data}
                  onCheckedChange={(checked) =>
                    setScheduledBackupFormData({ ...scheduledBackupFormData, include_data: checked })
                  }
                />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="schedule-enabled" className="text-xs">
                  Actif
                </Label>
                <Switch
                  id="schedule-enabled"
                  checked={scheduledBackupFormData.enabled}
                  onCheckedChange={(checked) =>
                    setScheduledBackupFormData({ ...scheduledBackupFormData, enabled: checked })
                  }
                />
              </div>
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setCreateScheduledBackupDialog(false)
                  setEditScheduledBackup(null)
                }}
              >
                Annuler
              </Button>
              <Button
                size="sm"
                onClick={editScheduledBackup ? handleUpdateScheduledBackup : handleCreateScheduledBackup}
              >
                {editScheduledBackup ? "Mettre à jour" : "Créer"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Create/Edit Alert Dialog */}
        <Dialog
          open={createAlertDialog || !!editAlert}
          onOpenChange={(open) => {
            if (!open) {
              setCreateAlertDialog(false)
              setEditAlert(null)
            }
          }}
        >
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>{editAlert ? "Modifier" : "Créer"} une Alerte</DialogTitle>
              <DialogDescription className="text-xs">
                Être notifié lorsqu'une métrique dépasse un seuil
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="alert-name" className="text-xs">
                  Nom de l'alerte
                </Label>
                <Input
                  id="alert-name"
                  placeholder="Connexions élevées"
                  value={alertFormData.name}
                  onChange={(e) => setAlertFormData({ ...alertFormData, name: e.target.value })}
                  className="text-xs h-8"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="alert-metric" className="text-xs">
                  Métrique
                </Label>
                <Select
                  value={alertFormData.metric}
                  onValueChange={(value) => setAlertFormData({ ...alertFormData, metric: value })}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active_connections">Connexions actives</SelectItem>
                    <SelectItem value="database_size_bytes">Taille DB (bytes)</SelectItem>
                    <SelectItem value="cache_hit_ratio">Cache hit ratio</SelectItem>
                    <SelectItem value="transactions_per_second">Transactions/sec</SelectItem>
                    <SelectItem value="queries_per_second">Requêtes/sec</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label htmlFor="alert-operator" className="text-xs">
                    Opérateur
                  </Label>
                  <Select
                    value={alertFormData.operator}
                    onValueChange={(value: "gt" | "lt" | "eq") =>
                      setAlertFormData({ ...alertFormData, operator: value })
                    }
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="gt">Supérieur à {">"}</SelectItem>
                      <SelectItem value="lt">Inférieur à {"<"}</SelectItem>
                      <SelectItem value="eq">Égal à =</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="alert-threshold" className="text-xs">
                    Seuil
                  </Label>
                  <Input
                    id="alert-threshold"
                    type="number"
                    value={alertFormData.threshold}
                    onChange={(e) =>
                      setAlertFormData({ ...alertFormData, threshold: parseFloat(e.target.value) })
                    }
                    className="text-xs h-8"
                  />
                </div>
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="alert-enabled" className="text-xs">
                  Actif
                </Label>
                <Switch
                  id="alert-enabled"
                  checked={alertFormData.enabled}
                  onCheckedChange={(checked) => setAlertFormData({ ...alertFormData, enabled: checked })}
                />
              </div>
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setCreateAlertDialog(false)
                  setEditAlert(null)
                }}
              >
                Annuler
              </Button>
              <Button size="sm" onClick={editAlert ? handleUpdateAlert : handleCreateAlert}>
                {editAlert ? "Mettre à jour" : "Créer"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </TooltipProvider>
    </div>
  )
}
