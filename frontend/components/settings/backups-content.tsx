"use client"

import { useState, useEffect } from "react"
import {
  BackupsApi,
  type Backup,
  type ScheduledBackup,
  type DiskSpaceResponse,
  type BackupEstimateResponse,
} from "@/lib/backups-api"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Progress } from "@/components/ui/progress"
import {
  Download,
  Database,
  HardDrive,
  Clock,
  CheckCircle2,
  AlertCircle,
  Play,
  Trash2,
  Loader2,
  RefreshCw,
  Calendar,
  Plus,
  Edit2,
  RotateCcw,
  XCircle,
  FolderArchive,
  Settings,
  Archive,
  TrendingUp,
  AlertTriangle,
  Info,
  FileArchive,
} from "lucide-react"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

export function BackupsContent() {
  // State
  const [backups, setBackups] = useState<Backup[]>([])
  const [scheduledBackups, setScheduledBackups] = useState<ScheduledBackup[]>([])
  const [diskSpace, setDiskSpace] = useState<DiskSpaceResponse | null>(null)
  const [estimate, setEstimate] = useState<BackupEstimateResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isCreatingBackup, setIsCreatingBackup] = useState(false)
  const [autoRefresh, setAutoRefresh] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  // Dialogs
  const [createBackupDialog, setCreateBackupDialog] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [backupToDelete, setBackupToDelete] = useState<string | null>(null)
  const [restoreDialogOpen, setRestoreDialogOpen] = useState(false)
  const [backupToRestore, setBackupToRestore] = useState<Backup | null>(null)
  const [createScheduledDialog, setCreateScheduledDialog] = useState(false)
  const [editScheduledBackup, setEditScheduledBackup] = useState<ScheduledBackup | null>(null)

  // Form data
  const [backupFormData, setBackupFormData] = useState({
    name: "",
    description: "",
    backup_type: "full",
    includes_database: true,
    includes_storage: true,
    includes_config: true,
  })
  const [restoreFormData, setRestoreFormData] = useState({
    restore_database: true,
    restore_storage: true,
    restore_config: true,
  })
  const [scheduledFormData, setScheduledFormData] = useState({
    name: "",
    description: "",
    backup_type: "full",
    includes_database: true,
    includes_storage: true,
    includes_config: true,
    schedule_frequency: "daily",
    schedule_time: "02:00",
    schedule_day: null as number | null,
    is_active: true,
  })

  useEffect(() => {
    loadData()
  }, [])

  useEffect(() => {
    if (!autoRefresh) return
    const interval = setInterval(loadData, 30000) // refresh every 30s
    return () => clearInterval(interval)
  }, [autoRefresh])

  const loadData = async () => {
    try {
      setIsLoading(true)
      setError(null)
      const [backupsData, scheduledData, diskSpaceData] = await Promise.all([
        BackupsApi.listBackups(),
        BackupsApi.listScheduledBackups().catch(() => ({ data: [], count: 0 })),
        BackupsApi.getDiskSpace().catch(() => null),
      ])
      setBackups(backupsData.data)
      setScheduledBackups(scheduledData.data)
      setDiskSpace(diskSpaceData)
    } catch (error) {
      console.error("Failed to load backups data:", error)
      setError("Erreur de chargement des données")
    } finally {
      setIsLoading(false)
    }
  }

  const loadEstimate = async () => {
    try {
      const estimateData = await BackupsApi.estimateBackupSize({
        includes_database: backupFormData.includes_database,
        includes_storage: backupFormData.includes_storage,
        includes_config: backupFormData.includes_config,
      })
      setEstimate(estimateData)
    } catch (error) {
      console.error("Failed to estimate backup:", error)
    }
  }

  useEffect(() => {
    if (createBackupDialog) {
      loadEstimate()
    }
  }, [
    createBackupDialog,
    backupFormData.includes_database,
    backupFormData.includes_storage,
    backupFormData.includes_config,
  ])

  const handleCreateBackup = async () => {
    try {
      setIsCreatingBackup(true)
      setError(null)
      const backup = await BackupsApi.createBackup({
        name: backupFormData.name,
        description: backupFormData.description || null,
        backup_type: backupFormData.backup_type,
        includes_database: backupFormData.includes_database,
        includes_storage: backupFormData.includes_storage,
        includes_config: backupFormData.includes_config,
      })
      setSuccessMessage(`Backup créé: ${backup.name}`)
      await loadData()
      setCreateBackupDialog(false)
      setBackupFormData({
        name: "",
        description: "",
        backup_type: "full",
        includes_database: true,
        includes_storage: true,
        includes_config: true,
      })
    } catch (error) {
      console.error("Failed to create backup:", error)
      setError("Échec de la création du backup")
    } finally {
      setIsCreatingBackup(false)
    }
  }

  const handleDeleteBackup = async () => {
    if (!backupToDelete) return
    try {
      await BackupsApi.deleteBackup(backupToDelete)
      setSuccessMessage("Backup supprimé avec succès")
      await loadData()
      setDeleteDialogOpen(false)
      setBackupToDelete(null)
    } catch (error) {
      console.error("Failed to delete backup:", error)
      setError("Échec de la suppression du backup")
    }
  }

  const handleRestoreBackup = async () => {
    if (!backupToRestore) return
    try {
      await BackupsApi.restoreBackup({
        backup_id: backupToRestore.id,
        restore_database: restoreFormData.restore_database,
        restore_storage: restoreFormData.restore_storage,
        restore_config: restoreFormData.restore_config,
      })
      setSuccessMessage("Backup restauré avec succès (en cours en arrière-plan)")
      setRestoreDialogOpen(false)
      setBackupToRestore(null)
      setRestoreFormData({ restore_database: true, restore_storage: true, restore_config: true })
    } catch (error) {
      console.error("Failed to restore backup:", error)
      setError("Échec de la restauration du backup")
    }
  }

  const handleCreateScheduled = async () => {
    try {
      await BackupsApi.createScheduledBackup(scheduledFormData)
      setSuccessMessage("Backup planifié créé avec succès")
      await loadData()
      setCreateScheduledDialog(false)
      setScheduledFormData({
        name: "",
        description: "",
        backup_type: "full",
        includes_database: true,
        includes_storage: true,
        includes_config: true,
        schedule_frequency: "daily",
        schedule_time: "02:00",
        schedule_day: null,
        is_active: true,
      })
    } catch (error) {
      console.error("Failed to create scheduled backup:", error)
      setError("Échec de la création du backup planifié")
    }
  }

  const handleUpdateScheduled = async () => {
    if (!editScheduledBackup) return
    try {
      await BackupsApi.updateScheduledBackup(editScheduledBackup.id, scheduledFormData)
      setSuccessMessage("Backup planifié mis à jour")
      await loadData()
      setEditScheduledBackup(null)
    } catch (error) {
      console.error("Failed to update scheduled backup:", error)
      setError("Échec de la mise à jour du backup planifié")
    }
  }

  const handleDeleteScheduled = async (id: string) => {
    try {
      await BackupsApi.deleteScheduledBackup(id)
      setSuccessMessage("Backup planifié supprimé")
      await loadData()
    } catch (error) {
      console.error("Failed to delete scheduled backup:", error)
      setError("Échec de la suppression du backup planifié")
    }
  }

  const handleDownloadBackup = async (backupId: string, backupName: string) => {
    try {
      const blob = await BackupsApi.downloadBackup(backupId)
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `${backupName}.tar.gz`
      a.click()
      setSuccessMessage("Téléchargement démarré")
    } catch (error) {
      console.error("Failed to download backup:", error)
      setError("Échec du téléchargement")
    }
  }

  // Calculate stats
  const completedBackups = backups.filter((b) => b.status === "completed")
  const totalSize = completedBackups.reduce((acc, backup) => acc + (backup.file_size || 0), 0)
  const lastBackup = completedBackups.length > 0 ? completedBackups[0] : null
  const successRate =
    backups.length > 0 ? ((completedBackups.length / backups.length) * 100).toFixed(0) : "0"

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 B"
    const k = 1024
    const sizes = ["B", "KB", "MB", "GB", "TB"]
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i]
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "completed":
        return (
          <Badge variant="default" className="bg-green-500 text-[9px] h-4 px-1">
            <CheckCircle2 className="mr-1 h-2.5 w-2.5" />
            Terminé
          </Badge>
        )
      case "in_progress":
        return (
          <Badge variant="default" className="bg-blue-500 text-[9px] h-4 px-1">
            <Loader2 className="mr-1 h-2.5 w-2.5 animate-spin" />
            En cours
          </Badge>
        )
      case "pending":
        return (
          <Badge variant="secondary" className="text-[9px] h-4 px-1">
            <Clock className="mr-1 h-2.5 w-2.5" />
            En attente
          </Badge>
        )
      case "failed":
        return (
          <Badge variant="destructive" className="text-[9px] h-4 px-1">
            <AlertCircle className="mr-1 h-2.5 w-2.5" />
            Échec
          </Badge>
        )
      default:
        return <Badge variant="outline" className="text-[9px] h-4 px-1">{status}</Badge>
    }
  }

  if (isLoading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <div className="text-center">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary mb-2" />
          <p className="text-sm text-muted-foreground">Chargement des sauvegardes système...</p>
        </div>
      </div>
    )
  }

  return (
    <TooltipProvider>
      <div className="space-y-4">
        {/* Error and success messages */}
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

        {/* Stats Cards */}
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-5">
          <Card className="p-3 bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-950/50 dark:to-blue-900/30 border-blue-200 dark:border-blue-800">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-blue-100 dark:bg-blue-900 p-2 text-blue-500">
                <Clock className="h-4 w-4" />
              </div>
              <div>
                <p className="text-[10px] text-blue-700 dark:text-blue-300 font-medium">Dernier Backup</p>
                <p className="text-sm font-bold text-blue-900 dark:text-blue-100">
                  {lastBackup
                    ? new Date(lastBackup.completed_at!).toLocaleDateString("fr-FR", {
                        day: "2-digit",
                        month: "2-digit",
                      })
                    : "Aucun"}
                </p>
              </div>
            </div>
          </Card>

          <Card className="p-3 bg-gradient-to-br from-green-50 to-green-100 dark:from-green-950/50 dark:to-green-900/30 border-green-200 dark:border-green-800">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-green-100 dark:bg-green-900 p-2 text-green-500">
                <HardDrive className="h-4 w-4" />
              </div>
              <div>
                <p className="text-[10px] text-green-700 dark:text-green-300 font-medium">Taille Totale</p>
                <p className="text-sm font-bold text-green-900 dark:text-green-100">{formatBytes(totalSize)}</p>
              </div>
            </div>
          </Card>

          <Card className="p-3 bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-950/50 dark:to-purple-900/30 border-purple-200 dark:border-purple-800">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-purple-100 dark:bg-purple-900 p-2 text-purple-500">
                <Archive className="h-4 w-4" />
              </div>
              <div>
                <p className="text-[10px] text-purple-700 dark:text-purple-300 font-medium">Sauvegardes</p>
                <p className="text-sm font-bold text-purple-900 dark:text-purple-100">{backups.length}</p>
              </div>
            </div>
          </Card>

          <Card className="p-3 bg-gradient-to-br from-emerald-50 to-emerald-100 dark:from-emerald-950/50 dark:to-emerald-900/30 border-emerald-200 dark:border-emerald-800">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-emerald-100 dark:bg-emerald-900 p-2 text-emerald-500">
                <TrendingUp className="h-4 w-4" />
              </div>
              <div>
                <p className="text-[10px] text-emerald-700 dark:text-emerald-300 font-medium">Taux de Succès</p>
                <p className="text-sm font-bold text-emerald-900 dark:text-emerald-100">{successRate}%</p>
              </div>
            </div>
          </Card>

          <Card className="p-3 bg-gradient-to-br from-orange-50 to-orange-100 dark:from-orange-950/50 dark:to-orange-900/30 border-orange-200 dark:border-orange-800">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-orange-100 dark:bg-orange-900 p-2 text-orange-500">
                <Calendar className="h-4 w-4" />
              </div>
              <div>
                <p className="text-[10px] text-orange-700 dark:text-orange-300 font-medium">Planifiés</p>
                <p className="text-sm font-bold text-orange-900 dark:text-orange-100">{scheduledBackups.length}</p>
              </div>
            </div>
          </Card>
        </div>

        {/* Disk Space Card */}
        {diskSpace && (
          <Card className="p-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <HardDrive className="h-4 w-4" />
                Espace Disque
              </h3>
              {diskSpace.percent_used > 90 && (
                <Badge variant="destructive" className="text-[9px] h-4 px-1">
                  <AlertTriangle className="mr-1 h-2.5 w-2.5" />
                  Espace faible
                </Badge>
              )}
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Utilisé:</span>
                <span className="font-medium">
                  {diskSpace.used_formatted} / {diskSpace.total_formatted}
                </span>
              </div>
              <Progress
                value={diskSpace.percent_used}
                className={`h-2 ${diskSpace.percent_used > 90 ? "bg-red-100" : ""}`}
              />
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Disponible:</span>
                <span className="font-medium">{diskSpace.available_formatted}</span>
              </div>
            </div>
          </Card>
        )}

        {/* Actions Bar */}
        <Card className="p-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Switch checked={autoRefresh} onCheckedChange={setAutoRefresh} className="scale-90" />
              <span className="text-xs text-muted-foreground">Auto-refresh (30s)</span>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={loadData} className="h-8">
                <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${autoRefresh ? "animate-spin" : ""}`} />
                Rafraîchir
              </Button>
              <Button size="sm" onClick={() => setCreateBackupDialog(true)} className="h-8">
                <Play className="h-3.5 w-3.5 mr-1.5" />
                Créer Backup
              </Button>
            </div>
          </div>
        </Card>

        {/* Tabs */}
        <Tabs defaultValue="backups" className="space-y-3">
          <TabsList className="h-9">
            <TabsTrigger value="backups" className="text-xs">
              <FileArchive className="h-3 w-3 mr-1.5" />
              Sauvegardes ({backups.length})
            </TabsTrigger>
            <TabsTrigger value="scheduled" className="text-xs">
              <Calendar className="h-3 w-3 mr-1.5" />
              Planifications ({scheduledBackups.length})
            </TabsTrigger>
          </TabsList>

          {/* Backups Tab */}
          <TabsContent value="backups" className="space-y-0">
            <Card className="p-4">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold">Historique des Sauvegardes Système</h3>
                  <p className="text-[10px] text-muted-foreground">
                    Base de données, fichiers storage et configuration
                  </p>
                </div>
                <Badge variant="secondary" className="text-[10px]">
                  {backups.length} backup(s)
                </Badge>
              </div>
              {backups.length === 0 ? (
                <div className="text-center py-12">
                  <Archive className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                  <p className="text-sm font-medium mb-1">Aucun backup disponible</p>
                  <p className="text-xs text-muted-foreground mb-4">
                    Créez votre première sauvegarde système
                  </p>
                  <Button size="sm" onClick={() => setCreateBackupDialog(true)}>
                    <Plus className="h-3 w-3 mr-1" />
                    Créer un Backup
                  </Button>
                </div>
              ) : (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="h-8 text-[10px]">Nom</TableHead>
                        <TableHead className="h-8 text-[10px]">Type</TableHead>
                        <TableHead className="h-8 text-[10px]">Contenu</TableHead>
                        <TableHead className="h-8 text-[10px]">Taille</TableHead>
                        <TableHead className="h-8 text-[10px]">Date</TableHead>
                        <TableHead className="h-8 text-[10px]">Statut</TableHead>
                        <TableHead className="h-8 text-[10px] text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {backups.map((backup) => (
                        <TableRow key={backup.id} className="text-xs">
                          <TableCell className="font-medium text-[10px] py-2">{backup.name}</TableCell>
                          <TableCell className="py-2">
                            <Badge variant="outline" className="text-[9px]">
                              {backup.backup_type}
                            </Badge>
                          </TableCell>
                          <TableCell className="py-2">
                            <div className="flex gap-1">
                              {backup.includes_database && (
                                <Tooltip>
                                  <TooltipTrigger>
                                    <Badge variant="outline" className="text-[9px] h-4 px-1">
                                      <Database className="h-2.5 w-2.5" />
                                    </Badge>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p className="text-xs">Base de données</p>
                                  </TooltipContent>
                                </Tooltip>
                              )}
                              {backup.includes_storage && (
                                <Tooltip>
                                  <TooltipTrigger>
                                    <Badge variant="outline" className="text-[9px] h-4 px-1">
                                      <FolderArchive className="h-2.5 w-2.5" />
                                    </Badge>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p className="text-xs">Fichiers storage</p>
                                  </TooltipContent>
                                </Tooltip>
                              )}
                              {backup.includes_config && (
                                <Tooltip>
                                  <TooltipTrigger>
                                    <Badge variant="outline" className="text-[9px] h-4 px-1">
                                      <Settings className="h-2.5 w-2.5" />
                                    </Badge>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p className="text-xs">Configuration</p>
                                  </TooltipContent>
                                </Tooltip>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="py-2 text-[10px]">
                            {backup.file_size ? formatBytes(backup.file_size) : "-"}
                          </TableCell>
                          <TableCell className="py-2 text-muted-foreground text-[10px]">
                            {backup.completed_at
                              ? new Date(backup.completed_at).toLocaleString("fr-FR", {
                                  dateStyle: "short",
                                  timeStyle: "short",
                                })
                              : new Date(backup.created_at).toLocaleString("fr-FR", {
                                  dateStyle: "short",
                                  timeStyle: "short",
                                })}
                          </TableCell>
                          <TableCell className="py-2">{getStatusBadge(backup.status)}</TableCell>
                          <TableCell className="py-2 text-right">
                            <div className="flex justify-end gap-1">
                              {backup.status === "completed" && (
                                <>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        className="h-6 w-6 p-0"
                                        onClick={() => handleDownloadBackup(backup.id, backup.name)}
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
                                          setBackupToRestore(backup)
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
                                </>
                              )}

                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                                    onClick={() => {
                                      setBackupToDelete(backup.id)
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
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </Card>
          </TabsContent>

          {/* Scheduled Backups Tab */}
          <TabsContent value="scheduled" className="space-y-0">
            <Card className="p-4">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold">Sauvegardes Planifiées</h3>
                  <p className="text-[10px] text-muted-foreground">Automatisation des sauvegardes système</p>
                </div>
                <Button size="sm" onClick={() => setCreateScheduledDialog(true)} className="h-7">
                  <Plus className="h-3 w-3 mr-1" />
                  Nouvelle Planification
                </Button>
              </div>
              {scheduledBackups.length === 0 ? (
                <div className="text-center py-12">
                  <Calendar className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                  <p className="text-sm font-medium mb-1">Aucune planification</p>
                  <p className="text-xs text-muted-foreground mb-4">
                    Automatisez vos sauvegardes avec des planifications récurrentes
                  </p>
                  <Button size="sm" onClick={() => setCreateScheduledDialog(true)}>
                    <Plus className="h-3 w-3 mr-1" />
                    Créer une Planification
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  {scheduledBackups.map((schedule) => (
                    <Card key={schedule.id} className="p-3">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <h4 className="text-sm font-medium">{schedule.name}</h4>
                            <Badge
                              variant={schedule.is_active ? "default" : "secondary"}
                              className="text-[9px] h-4 px-1"
                            >
                              {schedule.is_active ? "Actif" : "Inactif"}
                            </Badge>
                            <Badge variant="outline" className="text-[9px] h-4 px-1">
                              {schedule.backup_type}
                            </Badge>
                          </div>
                          <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs mb-2">
                            <div>
                              <span className="text-muted-foreground">Fréquence:</span>
                              <p className="text-[10px] capitalize">{schedule.schedule_frequency}</p>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Heure:</span>
                              <p className="font-mono text-[10px]">{schedule.schedule_time}</p>
                            </div>
                            {schedule.last_run_at && (
                              <div>
                                <span className="text-muted-foreground">Dernière exec:</span>
                                <p className="text-[10px]">
                                  {new Date(schedule.last_run_at).toLocaleDateString("fr-FR")}
                                </p>
                              </div>
                            )}
                            {schedule.next_run_at && (
                              <div>
                                <span className="text-muted-foreground">Prochaine exec:</span>
                                <p className="text-[10px]">
                                  {new Date(schedule.next_run_at).toLocaleDateString("fr-FR")}
                                </p>
                              </div>
                            )}
                            <div>
                              <span className="text-muted-foreground">Exécutions:</span>
                              <p className="text-[10px]">
                                {schedule.successful_runs}/{schedule.total_runs}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            {schedule.includes_database && (
                              <Badge variant="outline" className="text-[9px] h-4 px-1">
                                <Database className="mr-1 h-2.5 w-2.5" />
                                DB
                              </Badge>
                            )}
                            {schedule.includes_storage && (
                              <Badge variant="outline" className="text-[9px] h-4 px-1">
                                <FolderArchive className="mr-1 h-2.5 w-2.5" />
                                Storage
                              </Badge>
                            )}
                            {schedule.includes_config && (
                              <Badge variant="outline" className="text-[9px] h-4 px-1">
                                <Settings className="mr-1 h-2.5 w-2.5" />
                                Config
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
                              setScheduledFormData({
                                name: schedule.name,
                                description: schedule.description || "",
                                backup_type: schedule.backup_type,
                                includes_database: schedule.includes_database,
                                includes_storage: schedule.includes_storage,
                                includes_config: schedule.includes_config,
                                schedule_frequency: schedule.schedule_frequency,
                                schedule_time: schedule.schedule_time,
                                schedule_day: schedule.schedule_day,
                                is_active: schedule.is_active,
                              })
                            }}
                          >
                            <Edit2 className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 w-7 p-0 text-destructive"
                            onClick={() => handleDeleteScheduled(schedule.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </Card>
          </TabsContent>
        </Tabs>

        {/* Dialogs */}

        {/* Create Backup Dialog */}
        <Dialog open={createBackupDialog} onOpenChange={setCreateBackupDialog}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Créer une Sauvegarde Système</DialogTitle>
              <DialogDescription className="text-xs">
                Sauvegarde complète: base de données + fichiers storage + configuration
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="backup-name" className="text-xs">
                  Nom du backup
                </Label>
                <Input
                  id="backup-name"
                  placeholder="backup-system-2025-01-30"
                  value={backupFormData.name}
                  onChange={(e) => setBackupFormData({ ...backupFormData, name: e.target.value })}
                  className="text-xs h-8"
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="backup-desc" className="text-xs">
                  Description (optionnel)
                </Label>
                <Textarea
                  id="backup-desc"
                  placeholder="Notes sur ce backup..."
                  value={backupFormData.description}
                  onChange={(e) => setBackupFormData({ ...backupFormData, description: e.target.value })}
                  className="text-xs h-16"
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="backup-type" className="text-xs">
                  Type de backup
                </Label>
                <Select
                  value={backupFormData.backup_type}
                  onValueChange={(value) => setBackupFormData({ ...backupFormData, backup_type: value })}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="full">Complet</SelectItem>
                    <SelectItem value="incremental">Incrémental</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-medium">Contenu à sauvegarder</Label>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Database className="h-3.5 w-3.5 text-muted-foreground" />
                      <Label htmlFor="include-db" className="text-xs">
                        Base de données
                      </Label>
                    </div>
                    <Switch
                      id="include-db"
                      checked={backupFormData.includes_database}
                      onCheckedChange={(checked) =>
                        setBackupFormData({ ...backupFormData, includes_database: checked })
                      }
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <FolderArchive className="h-3.5 w-3.5 text-muted-foreground" />
                      <Label htmlFor="include-storage" className="text-xs">
                        Fichiers storage (uploads utilisateurs)
                      </Label>
                    </div>
                    <Switch
                      id="include-storage"
                      checked={backupFormData.includes_storage}
                      onCheckedChange={(checked) =>
                        setBackupFormData({ ...backupFormData, includes_storage: checked })
                      }
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Settings className="h-3.5 w-3.5 text-muted-foreground" />
                      <Label htmlFor="include-config" className="text-xs">
                        Configuration système
                      </Label>
                    </div>
                    <Switch
                      id="include-config"
                      checked={backupFormData.includes_config}
                      onCheckedChange={(checked) =>
                        setBackupFormData({ ...backupFormData, includes_config: checked })
                      }
                    />
                  </div>
                </div>
              </div>

              {/* Estimation */}
              {estimate && (
                <div className="rounded-md border bg-muted/20 p-3 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Taille estimée:</span>
                    <span className="font-medium">{estimate.estimated_size_formatted}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Espace requis:</span>
                    <span className="font-medium">{estimate.required_space_formatted}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Espace disponible:</span>
                    <span className={estimate.has_enough_space ? "font-medium" : "font-medium text-destructive"}>
                      {estimate.disk_space.available_formatted}
                    </span>
                  </div>
                  {!estimate.has_enough_space && (
                    <div className="flex items-center gap-2 text-xs text-destructive">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      <span>Espace disque insuffisant</span>
                    </div>
                  )}
                </div>
              )}
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button size="sm" variant="outline" onClick={() => setCreateBackupDialog(false)}>
                Annuler
              </Button>
              <Button
                size="sm"
                onClick={handleCreateBackup}
                disabled={isCreatingBackup || !backupFormData.name || (estimate && !estimate.has_enough_space)}
              >
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
              <DialogDescription className="text-xs">
                Cette action est irréversible. Le fichier de sauvegarde sera définitivement supprimé.
              </DialogDescription>
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
              <DialogTitle className="text-base flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-destructive" />
                Restaurer le backup
              </DialogTitle>
              <DialogDescription className="text-xs">
                {backupToRestore?.name}
                <br />
                <span className="text-destructive font-medium">
                  ATTENTION: Cette action remplacera les données existantes !
                </span>
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2 py-2">
              <Label className="text-xs font-medium">Éléments à restaurer:</Label>
              <div className="space-y-2">
                {backupToRestore?.includes_database && (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Database className="h-3.5 w-3.5 text-muted-foreground" />
                      <Label htmlFor="restore-db" className="text-xs">
                        Base de données
                      </Label>
                    </div>
                    <Switch
                      id="restore-db"
                      checked={restoreFormData.restore_database}
                      onCheckedChange={(checked) =>
                        setRestoreFormData({ ...restoreFormData, restore_database: checked })
                      }
                    />
                  </div>
                )}
                {backupToRestore?.includes_storage && (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <FolderArchive className="h-3.5 w-3.5 text-muted-foreground" />
                      <Label htmlFor="restore-storage" className="text-xs">
                        Fichiers storage
                      </Label>
                    </div>
                    <Switch
                      id="restore-storage"
                      checked={restoreFormData.restore_storage}
                      onCheckedChange={(checked) =>
                        setRestoreFormData({ ...restoreFormData, restore_storage: checked })
                      }
                    />
                  </div>
                )}
                {backupToRestore?.includes_config && (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Settings className="h-3.5 w-3.5 text-muted-foreground" />
                      <Label htmlFor="restore-config" className="text-xs">
                        Configuration
                      </Label>
                    </div>
                    <Switch
                      id="restore-config"
                      checked={restoreFormData.restore_config}
                      onCheckedChange={(checked) =>
                        setRestoreFormData({ ...restoreFormData, restore_config: checked })
                      }
                    />
                  </div>
                )}
              </div>
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button size="sm" variant="outline" onClick={() => setRestoreDialogOpen(false)}>
                Annuler
              </Button>
              <Button size="sm" variant="destructive" onClick={handleRestoreBackup}>
                <RotateCcw className="mr-2 h-3 w-3" />
                Restaurer
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Create/Edit Scheduled Backup Dialog */}
        <Dialog
          open={createScheduledDialog || !!editScheduledBackup}
          onOpenChange={(open) => {
            if (!open) {
              setCreateScheduledDialog(false)
              setEditScheduledBackup(null)
            }
          }}
        >
          <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editScheduledBackup ? "Modifier" : "Créer"} une Planification</DialogTitle>
              <DialogDescription className="text-xs">
                Automatisez les sauvegardes système avec une planification récurrente
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="sched-name" className="text-xs">
                  Nom de la planification
                </Label>
                <Input
                  id="sched-name"
                  placeholder="Backup quotidien"
                  value={scheduledFormData.name}
                  onChange={(e) => setScheduledFormData({ ...scheduledFormData, name: e.target.value })}
                  className="text-xs h-8"
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="sched-desc" className="text-xs">
                  Description (optionnel)
                </Label>
                <Input
                  id="sched-desc"
                  placeholder="Backup automatique..."
                  value={scheduledFormData.description}
                  onChange={(e) => setScheduledFormData({ ...scheduledFormData, description: e.target.value })}
                  className="text-xs h-8"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label htmlFor="sched-freq" className="text-xs">
                    Fréquence
                  </Label>
                  <Select
                    value={scheduledFormData.schedule_frequency}
                    onValueChange={(value) =>
                      setScheduledFormData({ ...scheduledFormData, schedule_frequency: value })
                    }
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="daily">Quotidien</SelectItem>
                      <SelectItem value="weekly">Hebdomadaire</SelectItem>
                      <SelectItem value="monthly">Mensuel</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label htmlFor="sched-time" className="text-xs">
                    Heure
                  </Label>
                  <Input
                    id="sched-time"
                    type="time"
                    value={scheduledFormData.schedule_time}
                    onChange={(e) => setScheduledFormData({ ...scheduledFormData, schedule_time: e.target.value })}
                    className="text-xs h-8"
                  />
                </div>
              </div>

              {scheduledFormData.schedule_frequency !== "daily" && (
                <div className="space-y-1">
                  <Label htmlFor="sched-day" className="text-xs">
                    {scheduledFormData.schedule_frequency === "weekly" ? "Jour de la semaine" : "Jour du mois"}
                  </Label>
                  {scheduledFormData.schedule_frequency === "weekly" ? (
                    <Select
                      value={scheduledFormData.schedule_day?.toString() || "1"}
                      onValueChange={(value) =>
                        setScheduledFormData({ ...scheduledFormData, schedule_day: parseInt(value) })
                      }
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="0">Dimanche</SelectItem>
                        <SelectItem value="1">Lundi</SelectItem>
                        <SelectItem value="2">Mardi</SelectItem>
                        <SelectItem value="3">Mercredi</SelectItem>
                        <SelectItem value="4">Jeudi</SelectItem>
                        <SelectItem value="5">Vendredi</SelectItem>
                        <SelectItem value="6">Samedi</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      id="sched-day"
                      type="number"
                      min="1"
                      max="31"
                      value={scheduledFormData.schedule_day || 1}
                      onChange={(e) =>
                        setScheduledFormData({ ...scheduledFormData, schedule_day: parseInt(e.target.value) })
                      }
                      className="text-xs h-8"
                    />
                  )}
                </div>
              )}

              <div className="space-y-2">
                <Label className="text-xs font-medium">Contenu</Label>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="sched-db" className="text-xs">
                      Base de données
                    </Label>
                    <Switch
                      id="sched-db"
                      checked={scheduledFormData.includes_database}
                      onCheckedChange={(checked) =>
                        setScheduledFormData({ ...scheduledFormData, includes_database: checked })
                      }
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label htmlFor="sched-storage" className="text-xs">
                      Fichiers storage
                    </Label>
                    <Switch
                      id="sched-storage"
                      checked={scheduledFormData.includes_storage}
                      onCheckedChange={(checked) =>
                        setScheduledFormData({ ...scheduledFormData, includes_storage: checked })
                      }
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label htmlFor="sched-config" className="text-xs">
                      Configuration
                    </Label>
                    <Switch
                      id="sched-config"
                      checked={scheduledFormData.includes_config}
                      onCheckedChange={(checked) =>
                        setScheduledFormData({ ...scheduledFormData, includes_config: checked })
                      }
                    />
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <Label htmlFor="sched-active" className="text-xs">
                  Planification active
                </Label>
                <Switch
                  id="sched-active"
                  checked={scheduledFormData.is_active}
                  onCheckedChange={(checked) => setScheduledFormData({ ...scheduledFormData, is_active: checked })}
                />
              </div>
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setCreateScheduledDialog(false)
                  setEditScheduledBackup(null)
                }}
              >
                Annuler
              </Button>
              <Button
                size="sm"
                onClick={editScheduledBackup ? handleUpdateScheduled : handleCreateScheduled}
                disabled={!scheduledFormData.name}
              >
                {editScheduledBackup ? "Mettre à jour" : "Créer"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  )
}
