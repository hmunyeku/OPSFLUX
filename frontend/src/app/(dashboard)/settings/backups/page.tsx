"use client"

import { useCallback, useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { cn } from "@/lib/utils"
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
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
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
import {
  IconDatabase,
  IconDownload,
  IconTrash,
  IconRefresh,
  IconRestore,
  IconPlus,
  IconClock,
  IconCheck,
  IconX,
  IconLoader,
  IconLayoutGrid,
  IconList,
  IconCalendar,
  IconDots,
} from "@tabler/icons-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import ContentSection from "../components/content-section"
import {
  getBackups,
  createBackup,
  downloadBackup,
  restoreBackup,
  deleteBackup,
  estimateBackupSize,
  getScheduledBackups,
  createScheduledBackup,
  deleteScheduledBackup,
  updateScheduledBackup,
  type Backup,
  type BackupCreate,
  type BackupRestore,
  type BackupEstimateResponse,
  type ScheduledBackup,
  type ScheduledBackupCreate,
} from "./data/backups-api"
import { PermissionGuard } from "@/components/permission-guard"
import { usePermissions } from "@/hooks/use-permissions"
import { formatDistanceToNow } from "date-fns"
import { fr } from "date-fns/locale"
import { useTranslation } from "@/hooks/use-translation"
import { EmptyState } from "@/components/empty-state"
import { DataLoadingState } from "@/components/data-loading-state"
import {
  showLoadError,
  showCreateSuccess,
  showDeleteSuccess,
  showErrorToast,
  showSuccessToast,
  showInfoToast,
} from "@/lib/toast-helpers"

type ViewMode = "grid" | "table"

interface ScheduledBackup {
  name: string
  description: string
  backup_type: "full" | "incremental"
  includes_database: boolean
  includes_storage: boolean
  includes_config: boolean
  schedule_frequency: "daily" | "weekly" | "monthly"
  schedule_time: string
  schedule_day?: number
  is_active: boolean
}

export default function BackupsPage() {
  return (
    <PermissionGuard permission="core.backups.read">
      <BackupsPageContent />
    </PermissionGuard>
  )
}

function BackupsPageContent() {
  const { hasPermission } = usePermissions()
  const { t } = useTranslation("core.backups")
  const [backups, setBackups] = useState<Backup[]>([])
  const [scheduledBackups, setScheduledBackups] = useState<ScheduledBackup[]>([])
  const [loading, setLoading] = useState(true)
  const [scheduledLoading, setScheduledLoading] = useState(true)
  const [viewMode, setViewMode] = useState<ViewMode>("grid")
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false)
  const [restoreDialogOpen, setRestoreDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deleteScheduledDialogOpen, setDeleteScheduledDialogOpen] = useState(false)
  const [selectedBackup, setSelectedBackup] = useState<Backup | null>(null)
  const [selectedScheduled, setSelectedScheduled] = useState<ScheduledBackup | null>(null)
  const [creating, setCreating] = useState(false)
  const [restoring, setRestoring] = useState(false)
  const [scheduling, setScheduling] = useState(false)

  const [newBackup, setNewBackup] = useState<BackupCreate>({
    name: "",
    description: "",
    backup_type: "full",
    includes_database: true,
    includes_storage: true,
    includes_config: true,
  })

  const [scheduledBackup, setScheduledBackup] = useState<ScheduledBackup>({
    name: "",
    description: "",
    backup_type: "full",
    includes_database: true,
    includes_storage: true,
    includes_config: true,
    schedule_frequency: "daily",
    schedule_time: "02:00",
    is_active: true,
  })

  const [restoreOptions, setRestoreOptions] = useState<BackupRestore>({
    backup_id: "",
    restore_database: true,
    restore_storage: true,
    restore_config: true,
  })

  const [estimating, setEstimating] = useState(false)
  const [estimation, setEstimation] = useState<BackupEstimateResponse | null>(null)

  // Fetch size estimation when dialog opens or checkboxes change
  useEffect(() => {
    if (createDialogOpen) {
      const fetchEstimation = async () => {
        setEstimating(true)
        try {
          const estimate = await estimateBackupSize({
            includes_database: newBackup.includes_database,
            includes_storage: newBackup.includes_storage,
            includes_config: newBackup.includes_config,
          })
          setEstimation(estimate)
        } catch (error) {
          console.error("Failed to estimate backup size:", error)
          setEstimation(null)
        } finally {
          setEstimating(false)
        }
      }
      fetchEstimation()
    }
  }, [createDialogOpen, newBackup.includes_database, newBackup.includes_storage, newBackup.includes_config])

  const fetchBackups = useCallback(async () => {
    setLoading(true)
    try {
      const data = await getBackups({ limit: 100 })
      setBackups(data.data)
    } catch (error) {
      showLoadError("les sauvegardes", fetchBackups)
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchScheduledBackups = useCallback(async () => {
    setScheduledLoading(true)
    try {
      const data = await getScheduledBackups({ limit: 100 })
      setScheduledBackups(data.data)
    } catch (error) {
      showLoadError("les sauvegardes programmées", fetchScheduledBackups)
    } finally {
      setScheduledLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchBackups()
    fetchScheduledBackups()
    const interval = setInterval(() => {
      fetchBackups()
      fetchScheduledBackups()
    }, 10000)
    return () => clearInterval(interval)
  }, [fetchBackups, fetchScheduledBackups])

  const handleCreateBackup = async () => {
    if (!newBackup.name.trim()) {
      showErrorToast(
        t("create.validation.title", "Erreur de validation"),
        t("create.validation.name_required", "Le nom du backup est requis")
      )
      return
    }

    setCreating(true)
    try {
      await createBackup(newBackup)
      showCreateSuccess(t("entity.backup", "Le backup"))
      setCreateDialogOpen(false)
      setNewBackup({
        name: "",
        description: "",
        backup_type: "full",
        includes_database: true,
        includes_storage: true,
        includes_config: true,
      })
      fetchBackups()
    } catch (error) {
      showErrorToast(
        t("create.error.title", "Échec de la création"),
        error,
        handleCreateBackup
      )
    } finally {
      setCreating(false)
    }
  }

  const handleScheduleBackup = async () => {
    if (!scheduledBackup.name.trim()) {
      showErrorToast(
        t("schedule.validation.title", "Erreur de validation"),
        t("schedule.validation.name_required", "Le nom de la planification est requis")
      )
      return
    }

    setScheduling(true)
    try {
      const scheduleData: ScheduledBackupCreate = {
        name: scheduledBackup.name,
        description: scheduledBackup.description,
        backup_type: scheduledBackup.backup_type,
        includes_database: scheduledBackup.includes_database,
        includes_storage: scheduledBackup.includes_storage,
        includes_config: scheduledBackup.includes_config,
        schedule_frequency: scheduledBackup.schedule_frequency,
        schedule_time: scheduledBackup.schedule_time,
        schedule_day: scheduledBackup.schedule_day,
        is_active: scheduledBackup.is_active,
      }

      await createScheduledBackup(scheduleData)
      showCreateSuccess(t("entity.schedule", "La planification"))
      setScheduleDialogOpen(false)
      setScheduledBackup({
        name: "",
        description: "",
        backup_type: "full",
        includes_database: true,
        includes_storage: true,
        includes_config: true,
        schedule_frequency: "daily",
        schedule_time: "02:00",
        is_active: true,
      })
      fetchScheduledBackups()
    } catch (error) {
      showErrorToast(
        t("schedule.error.title", "Échec de la planification"),
        error
      )
    } finally {
      setScheduling(false)
    }
  }

  const handleDownload = async (backup: Backup) => {
    try {
      await downloadBackup(backup.id)
      showInfoToast(
        t("download.started.title", "Téléchargement démarré"),
        t("download.started.description", "Le fichier de backup va être téléchargé")
      )
    } catch (error) {
      showErrorToast(
        t("download.error.title", "Échec du téléchargement"),
        error,
        () => handleDownload(backup)
      )
    }
  }

  const handleRestoreBackup = async () => {
    if (!selectedBackup) return

    setRestoring(true)
    try {
      await restoreBackup(selectedBackup.id, restoreOptions)
      showSuccessToast(
        t("restore.started.title", "Restauration démarrée"),
        t("restore.started.description", "La restauration du backup a été lancée en arrière-plan")
      )
      setRestoreDialogOpen(false)
      setSelectedBackup(null)
    } catch (error) {
      showErrorToast(
        t("restore.error.title", "Échec de la restauration"),
        error,
        handleRestoreBackup
      )
    } finally {
      setRestoring(false)
    }
  }

  const handleDeleteBackup = async () => {
    if (!selectedBackup) return

    try {
      await deleteBackup(selectedBackup.id)
      showDeleteSuccess(t("entity.backup", "Le backup"))
      setDeleteDialogOpen(false)
      setSelectedBackup(null)
      fetchBackups()
    } catch (error) {
      showErrorToast(
        t("delete.error.title", "Échec de la suppression"),
        error,
        handleDeleteBackup
      )
    }
  }

  const handleDeleteScheduled = async () => {
    if (!selectedScheduled) return

    try {
      await deleteScheduledBackup(selectedScheduled.id)
      showDeleteSuccess(t("entity.scheduled", "La planification"))
      setDeleteScheduledDialogOpen(false)
      setSelectedScheduled(null)
      fetchScheduledBackups()
    } catch (error) {
      showErrorToast(
        t("delete.error.title", "Échec de la suppression"),
        error,
        handleDeleteScheduled
      )
    }
  }

  const handleToggleScheduled = async (scheduled: ScheduledBackup) => {
    try {
      await updateScheduledBackup(scheduled.id, { is_active: !scheduled.is_active })
      showSuccessToast(
        scheduled.is_active ? "Planification désactivée" : "Planification activée",
        ""
      )
      fetchScheduledBackups()
    } catch (error) {
      showErrorToast("Erreur", error)
    }
  }

  const getStatusBadge = (status: Backup["status"]) => {
    const variants = {
      pending: { variant: "secondary" as const, icon: IconClock, label: "En attente" },
      in_progress: { variant: "default" as const, icon: IconLoader, label: "En cours" },
      completed: { variant: "default" as const, icon: IconCheck, label: "Terminé" },
      failed: { variant: "destructive" as const, icon: IconX, label: "Échec" },
    }

    const config = variants[status]
    const Icon = config.icon

    return (
      <Badge variant={config.variant} className="flex items-center gap-1 w-fit">
        <Icon className={`h-3 w-3 ${status === "in_progress" ? "animate-spin" : ""}`} />
        {config.label}
      </Badge>
    )
  }

  const formatBytes = (bytes?: number) => {
    if (!bytes) return "0 B"
    const k = 1024
    const sizes = ["B", "KB", "MB", "GB", "TB"]
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`
  }

  return (
    <ContentSection
      title={t("title", "Sauvegardes & Restauration")}
      desc={t("description", "Gérez les sauvegardes de votre système (base de données, fichiers et configuration)")}
      className="lg:max-w-full"
    >
      <Tabs defaultValue="backups" className="space-y-4">
        <TabsList>
          <TabsTrigger value="backups">Sauvegardes</TabsTrigger>
          <TabsTrigger value="scheduled">Programmation</TabsTrigger>
        </TabsList>

        <TabsContent value="backups" className="space-y-4">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 p-4 rounded-lg border bg-muted/30 shadow-sm">
            <div className="flex items-center gap-2 flex-wrap">
              <Button onClick={fetchBackups} variant="outline" size="sm" className="shadow-sm hover:shadow transition-shadow">
                <IconRefresh className="h-4 w-4 mr-2" />
                Actualiser
              </Button>
              <div className="flex items-center gap-0 border rounded-md shadow-sm bg-background">
                <Button
                  variant={viewMode === "grid" ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => setViewMode("grid")}
                  className="rounded-r-none transition-all"
                >
                  <IconLayoutGrid className="h-4 w-4" />
                </Button>
                <Button
                  variant={viewMode === "table" ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => setViewMode("table")}
                  className="rounded-l-none transition-all"
                >
                  <IconList className="h-4 w-4" />
                </Button>
              </div>
            </div>
            {hasPermission("core.backups.create") && (
              <Button onClick={() => setCreateDialogOpen(true)} className="shadow-sm hover:shadow-md transition-shadow w-full sm:w-auto">
                <IconPlus className="h-4 w-4 mr-2" />
                Créer un backup
              </Button>
            )}
          </div>

          <DataLoadingState
            loading={loading}
            empty={backups.length === 0}
            emptyIcon={IconDatabase}
            emptyTitle={t("backups.empty_title", "Aucune sauvegarde")}
            emptyDescription={t("backups.empty_desc", "Créez votre première sauvegarde pour protéger vos données")}
            emptyAction={
              hasPermission("core.backups.create") && (
                <Button onClick={() => setCreateDialogOpen(true)}>
                  <IconPlus className="h-4 w-4 mr-2" />
                  {t("backups.create", "Créer une sauvegarde")}
                </Button>
              )
            }
            skeletonCount={3}
            skeletonClassName="h-32 w-full"
          >
            {viewMode === "grid" ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-2">
              {backups.map((backup) => (
                <Card key={backup.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="p-2 space-y-1">
                    {/* Row 1: Name + Status */}
                    <div className="flex items-center justify-between gap-1">
                      <h3 className="font-semibold text-xs line-clamp-1 flex-1" title={backup.name}>
                        {backup.name}
                      </h3>
                      {getStatusBadge(backup.status)}
                    </div>

                    {/* Row 2: Type + Size + Content */}
                    <div className="flex items-center gap-1 text-[10px]">
                      <Badge variant="secondary" className="capitalize text-[10px] h-4 px-1.5">
                        {backup.backup_type}
                      </Badge>
                      <span className="font-mono text-muted-foreground">{formatBytes(backup.file_size)}</span>
                      <div className="flex items-center gap-0.5 ml-auto">
                        {backup.includes_database && <span title="Base de données">🗄️</span>}
                        {backup.includes_storage && <span title="Stockage">📁</span>}
                        {backup.includes_config && <span title="Configuration">⚙️</span>}
                      </div>
                    </div>

                    {/* Row 3: Date + Menu */}
                    <div className="flex items-center justify-between gap-1 text-[10px]">
                      <div className="flex items-center gap-1 text-muted-foreground flex-1 min-w-0">
                        <IconClock className="h-2.5 w-2.5 flex-shrink-0" />
                        <span className="truncate">
                          {formatDistanceToNow(new Date(backup.created_at), {
                            addSuffix: true,
                            locale: fr,
                          })}
                        </span>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-5 w-5 p-0">
                            <IconDots className="h-3.5 w-3.5" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {backup.status === "completed" && (
                            <>
                              {hasPermission("core.backups.download") && (
                                <DropdownMenuItem onClick={() => handleDownload(backup)}>
                                  <IconDownload className="h-4 w-4 mr-2" />
                                  Télécharger
                                </DropdownMenuItem>
                              )}
                              {hasPermission("core.backups.restore") && (
                                <DropdownMenuItem onClick={() => {
                                  setSelectedBackup(backup)
                                  setRestoreOptions({
                                    backup_id: backup.id,
                                    restore_database: backup.includes_database,
                                    restore_storage: backup.includes_storage,
                                    restore_config: backup.includes_config,
                                  })
                                  setRestoreDialogOpen(true)
                                }}>
                                  <IconRestore className="h-4 w-4 mr-2" />
                                  Restaurer
                                </DropdownMenuItem>
                              )}
                              {hasPermission("core.backups.delete") && (
                                <>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    onClick={() => {
                                      setSelectedBackup(backup)
                                      setDeleteDialogOpen(true)
                                    }}
                                    className="text-destructive focus:text-destructive"
                                  >
                                    <IconTrash className="h-4 w-4 mr-2" />
                                    Supprimer
                                  </DropdownMenuItem>
                                </>
                              )}
                            </>
                          )}
                          {backup.status !== "completed" && hasPermission("core.backups.delete") && (
                            <DropdownMenuItem
                              onClick={() => {
                                setSelectedBackup(backup)
                                setDeleteDialogOpen(true)
                              }}
                              className="text-destructive focus:text-destructive"
                            >
                              <IconTrash className="h-4 w-4 mr-2" />
                              Supprimer
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>

                    {/* Error message */}
                    {backup.error_message && (
                      <div className="text-[10px] text-destructive bg-destructive/10 border border-destructive/20 p-1 rounded">
                        <p className="line-clamp-1" title={backup.error_message}>⚠️ {backup.error_message}</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card className="w-full shadow-sm overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="w-[25%] font-semibold">Nom</TableHead>
                    <TableHead className="w-[10%] font-semibold">Type</TableHead>
                    <TableHead className="w-[12%] font-semibold">Statut</TableHead>
                    <TableHead className="w-[18%] font-semibold">Contenu</TableHead>
                    <TableHead className="w-[10%] font-semibold">Taille</TableHead>
                    <TableHead className="w-[15%] font-semibold">Créé</TableHead>
                    <TableHead className="w-[10%] text-right font-semibold">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {backups.map((backup) => (
                    <TableRow key={backup.id} className="hover:bg-muted/50 transition-colors duration-200">
                      <TableCell>
                        <div>
                          <p className="font-medium">{backup.name}</p>
                          {backup.description && (
                            <p className="text-xs text-muted-foreground line-clamp-1">{backup.description}</p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="capitalize text-xs">
                          {backup.backup_type}
                        </Badge>
                      </TableCell>
                      <TableCell>{getStatusBadge(backup.status)}</TableCell>
                      <TableCell>
                        <div className="flex gap-1.5 flex-wrap">
                          {backup.includes_database && <Badge variant="outline" className="text-xs h-5">DB</Badge>}
                          {backup.includes_storage && <Badge variant="outline" className="text-xs h-5">Files</Badge>}
                          {backup.includes_config && <Badge variant="outline" className="text-xs h-5">Config</Badge>}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm font-mono">{formatBytes(backup.file_size)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDistanceToNow(new Date(backup.created_at), {
                          addSuffix: true,
                          locale: fr,
                        })}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-1">
                          {backup.status === "completed" && (
                            <>
                              {hasPermission("core.backups.download") && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleDownload(backup)}
                                  title="Télécharger"
                                  className="hover:bg-primary/10 transition-all hover:scale-105"
                                >
                                  <IconDownload className="h-4 w-4" />
                                </Button>
                              )}
                              {hasPermission("core.backups.restore") && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    setSelectedBackup(backup)
                                    setRestoreOptions({
                                      backup_id: backup.id,
                                      restore_database: backup.includes_database,
                                      restore_storage: backup.includes_storage,
                                      restore_config: backup.includes_config,
                                    })
                                    setRestoreDialogOpen(true)
                                  }}
                                  title="Restaurer"
                                  className="hover:bg-primary/10 transition-all hover:scale-105"
                                >
                                  <IconRestore className="h-4 w-4" />
                                </Button>
                              )}
                            </>
                          )}
                          {hasPermission("core.backups.delete") && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setSelectedBackup(backup)
                                setDeleteDialogOpen(true)
                              }}
                              title="Supprimer"
                              className="text-destructive hover:text-destructive hover:bg-destructive/10 transition-all hover:scale-105"
                            >
                              <IconTrash className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
            )}
          </DataLoadingState>
        </TabsContent>

        <TabsContent value="scheduled" className="space-y-4">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 p-4 rounded-lg border bg-muted/30 shadow-sm">
            <p className="text-sm text-muted-foreground leading-relaxed">
              Programmez des sauvegardes automatiques régulières pour protéger vos données
            </p>
            {hasPermission("core.backups.create") && (
              <Button onClick={() => setScheduleDialogOpen(true)} className="shadow-sm hover:shadow-md transition-shadow w-full sm:w-auto">
                <IconCalendar className="h-4 w-4 mr-2" />
                Programmer une sauvegarde
              </Button>
            )}
          </div>

          <DataLoadingState
            loading={scheduledLoading}
            empty={scheduledBackups.length === 0}
            emptyIcon={IconCalendar}
            emptyTitle="Aucune sauvegarde programmée"
            emptyDescription="Créez une planification pour automatiser vos sauvegardes et protéger vos données en continu"
            emptyAction={
              hasPermission("core.backups.create") && (
                <Button onClick={() => setScheduleDialogOpen(true)}>
                  <IconCalendar className="h-4 w-4 mr-2" />
                  Programmer une sauvegarde
                </Button>
              )
            }
            skeletonCount={2}
            skeletonClassName="h-32 w-full"
          >
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-2">
              {scheduledBackups.map((scheduled) => (
                <Card key={scheduled.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="p-2 space-y-1">
                    {/* Row 1: Name + Status */}
                    <div className="flex items-center justify-between gap-1">
                      <h3 className="font-semibold text-xs line-clamp-1 flex-1" title={scheduled.name}>
                        {scheduled.name}
                      </h3>
                      <Badge variant={scheduled.is_active ? "default" : "secondary"} className="text-[10px] h-4 px-1.5">
                        {scheduled.is_active ? "Actif" : "Inactif"}
                      </Badge>
                    </div>

                    {/* Row 2: Description */}
                    {scheduled.description && (
                      <p className="text-[10px] text-muted-foreground line-clamp-1" title={scheduled.description}>
                        {scheduled.description}
                      </p>
                    )}

                    {/* Row 3: Frequency + Time + Content */}
                    <div className="flex items-center gap-1 text-[10px]">
                      <Badge variant="secondary" className="capitalize text-[10px] h-4 px-1.5">
                        {scheduled.schedule_frequency === "daily" && "Quotidienne"}
                        {scheduled.schedule_frequency === "weekly" && "Hebdomadaire"}
                        {scheduled.schedule_frequency === "monthly" && "Mensuelle"}
                      </Badge>
                      <div className="flex items-center gap-0.5 text-muted-foreground">
                        <IconClock className="h-2.5 w-2.5" />
                        <span>{scheduled.schedule_time}</span>
                      </div>
                      <div className="flex items-center gap-0.5 ml-auto">
                        {scheduled.includes_database && <span title="Base de données">🗄️</span>}
                        {scheduled.includes_storage && <span title="Stockage">📁</span>}
                        {scheduled.includes_config && <span title="Configuration">⚙️</span>}
                      </div>
                    </div>

                    {/* Row 4: Next run + Stats + Menu */}
                    <div className="flex items-center justify-between gap-1 text-[10px]">
                      <div className="flex items-center gap-1 text-muted-foreground flex-1 min-w-0">
                        {scheduled.next_run_at && (
                          <span className="truncate">
                            ⏰ {formatDistanceToNow(new Date(scheduled.next_run_at), { addSuffix: true, locale: fr })}
                          </span>
                        )}
                        {scheduled.total_runs > 0 && (
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <span className="text-green-600 dark:text-green-400">✓{scheduled.successful_runs}</span>
                            {scheduled.failed_runs > 0 && (
                              <span className="text-destructive">✗{scheduled.failed_runs}</span>
                            )}
                          </div>
                        )}
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-5 w-5 p-0">
                            <IconDots className="h-3.5 w-3.5" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleToggleScheduled(scheduled)}>
                            {scheduled.is_active ? (
                              <>
                                <IconX className="h-4 w-4 mr-2" />
                                Désactiver
                              </>
                            ) : (
                              <>
                                <IconCheck className="h-4 w-4 mr-2" />
                                Activer
                              </>
                            )}
                          </DropdownMenuItem>
                          {hasPermission("core.backups.delete") && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() => {
                                  setSelectedScheduled(scheduled)
                                  setDeleteScheduledDialogOpen(true)
                                }}
                                className="text-destructive focus:text-destructive"
                              >
                                <IconTrash className="h-4 w-4 mr-2" />
                                Supprimer
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </DataLoadingState>
        </TabsContent>
      </Tabs>

      {/* Create Backup Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="text-xl">Créer un nouveau backup</DialogTitle>
            <DialogDescription className="text-base">
              Sauvegardez votre base de données, vos fichiers et votre configuration
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Nom du backup *</Label>
              <Input
                id="name"
                value={newBackup.name}
                onChange={(e) => setNewBackup({ ...newBackup, name: e.target.value })}
                placeholder="backup-production-2024"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Input
                id="description"
                value={newBackup.description}
                onChange={(e) => setNewBackup({ ...newBackup, description: e.target.value })}
                placeholder="Backup avant mise à jour..."
              />
            </div>
            <div className="space-y-2">
              <Label>Éléments à inclure</Label>
              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="includes_database"
                    checked={newBackup.includes_database}
                    onCheckedChange={(checked) =>
                      setNewBackup({ ...newBackup, includes_database: !!checked })
                    }
                  />
                  <Label htmlFor="includes_database" className="font-normal">
                    Base de données (PostgreSQL)
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="includes_storage"
                    checked={newBackup.includes_storage}
                    onCheckedChange={(checked) =>
                      setNewBackup({ ...newBackup, includes_storage: !!checked })
                    }
                  />
                  <Label htmlFor="includes_storage" className="font-normal">
                    Fichiers uploadés (storage)
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="includes_config"
                    checked={newBackup.includes_config}
                    onCheckedChange={(checked) =>
                      setNewBackup({ ...newBackup, includes_config: !!checked })
                    }
                  />
                  <Label htmlFor="includes_config" className="font-normal">
                    Configuration de l'application
                  </Label>
                </div>
              </div>
            </div>
            {estimation && !estimating && (
              <div className="mt-4 p-4 bg-muted rounded-lg space-y-3 border shadow-sm animate-in fade-in slide-in-from-top-2 duration-300">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground font-medium">Taille estimée:</span>
                  <span className="font-semibold">{estimation.estimated_size_formatted}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground font-medium">Espace disponible:</span>
                  <span className="font-semibold">{estimation.disk_space.available_formatted}</span>
                </div>
                <div className="pt-2 border-t">
                  {!estimation.has_enough_space && (
                    <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 p-2 rounded">
                      <IconX className="h-4 w-4 flex-shrink-0" />
                      <span className="font-medium">Espace disque insuffisant pour créer cette sauvegarde</span>
                    </div>
                  )}
                  {estimation.has_enough_space && (
                    <div className="flex items-center gap-2 text-sm text-green-600 bg-green-50 dark:bg-green-950/20 p-2 rounded">
                      <IconCheck className="h-4 w-4 flex-shrink-0" />
                      <span className="font-medium">Espace disque suffisant</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)} className="shadow-sm">
              Annuler
            </Button>
            <Button onClick={handleCreateBackup} disabled={creating || !estimation?.has_enough_space} className="shadow-sm">
              {creating ? (
                <>
                  <IconLoader className="h-4 w-4 mr-2 animate-spin" />
                  Création...
                </>
              ) : (
                <>
                  <IconPlus className="h-4 w-4 mr-2" />
                  Créer le backup
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Schedule Backup Dialog */}
      <Dialog open={scheduleDialogOpen} onOpenChange={setScheduleDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl">Programmer une sauvegarde automatique</DialogTitle>
            <DialogDescription className="text-base">
              Configurez une sauvegarde récurrente selon vos besoins
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="schedule-name">Nom de la planification *</Label>
                <Input
                  id="schedule-name"
                  value={scheduledBackup.name}
                  onChange={(e) => setScheduledBackup({ ...scheduledBackup, name: e.target.value })}
                  placeholder="Sauvegarde quotidienne"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="schedule-type">Type de sauvegarde</Label>
                <Select
                  value={scheduledBackup.backup_type}
                  onValueChange={(value: "full" | "incremental") =>
                    setScheduledBackup({ ...scheduledBackup, backup_type: value })
                  }
                >
                  <SelectTrigger id="schedule-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="full">Complète</SelectItem>
                    <SelectItem value="incremental">Incrémentale</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="schedule-description">Description</Label>
              <Input
                id="schedule-description"
                value={scheduledBackup.description}
                onChange={(e) => setScheduledBackup({ ...scheduledBackup, description: e.target.value })}
                placeholder="Sauvegarde automatique tous les jours à 2h du matin"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="frequency">Fréquence</Label>
                <Select
                  value={scheduledBackup.schedule_frequency}
                  onValueChange={(value: "daily" | "weekly" | "monthly") =>
                    setScheduledBackup({ ...scheduledBackup, schedule_frequency: value })
                  }
                >
                  <SelectTrigger id="frequency">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily">Quotidienne</SelectItem>
                    <SelectItem value="weekly">Hebdomadaire</SelectItem>
                    <SelectItem value="monthly">Mensuelle</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="time">Heure d'exécution</Label>
                <Input
                  id="time"
                  type="time"
                  value={scheduledBackup.schedule_time}
                  onChange={(e) => setScheduledBackup({ ...scheduledBackup, schedule_time: e.target.value })}
                />
              </div>
            </div>

            {scheduledBackup.schedule_frequency === "weekly" && (
              <div className="space-y-2">
                <Label htmlFor="day">Jour de la semaine</Label>
                <Select
                  value={scheduledBackup.schedule_day?.toString() || "1"}
                  onValueChange={(value) =>
                    setScheduledBackup({ ...scheduledBackup, schedule_day: parseInt(value) })
                  }
                >
                  <SelectTrigger id="day">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">Lundi</SelectItem>
                    <SelectItem value="2">Mardi</SelectItem>
                    <SelectItem value="3">Mercredi</SelectItem>
                    <SelectItem value="4">Jeudi</SelectItem>
                    <SelectItem value="5">Vendredi</SelectItem>
                    <SelectItem value="6">Samedi</SelectItem>
                    <SelectItem value="0">Dimanche</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {scheduledBackup.schedule_frequency === "monthly" && (
              <div className="space-y-2">
                <Label htmlFor="day-month">Jour du mois</Label>
                <Input
                  id="day-month"
                  type="number"
                  min="1"
                  max="31"
                  value={scheduledBackup.schedule_day || 1}
                  onChange={(e) =>
                    setScheduledBackup({ ...scheduledBackup, schedule_day: parseInt(e.target.value) })
                  }
                />
              </div>
            )}

            <div className="space-y-2">
              <Label>Éléments à sauvegarder</Label>
              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="schedule-db"
                    checked={scheduledBackup.includes_database}
                    onCheckedChange={(checked) =>
                      setScheduledBackup({ ...scheduledBackup, includes_database: !!checked })
                    }
                  />
                  <Label htmlFor="schedule-db" className="font-normal">
                    Base de données (PostgreSQL)
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="schedule-storage"
                    checked={scheduledBackup.includes_storage}
                    onCheckedChange={(checked) =>
                      setScheduledBackup({ ...scheduledBackup, includes_storage: !!checked })
                    }
                  />
                  <Label htmlFor="schedule-storage" className="font-normal">
                    Fichiers uploadés (storage)
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="schedule-config"
                    checked={scheduledBackup.includes_config}
                    onCheckedChange={(checked) =>
                      setScheduledBackup({ ...scheduledBackup, includes_config: !!checked })
                    }
                  />
                  <Label htmlFor="schedule-config" className="font-normal">
                    Configuration de l'application
                  </Label>
                </div>
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setScheduleDialogOpen(false)} className="shadow-sm" disabled={scheduling}>
              Annuler
            </Button>
            <Button onClick={handleScheduleBackup} disabled={scheduling} className="shadow-sm">
              {scheduling ? (
                <>
                  <IconLoader className="h-4 w-4 mr-2 animate-spin" />
                  Programmation...
                </>
              ) : (
                <>
                  <IconCalendar className="h-4 w-4 mr-2" />
                  Programmer
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Restore Backup Dialog */}
      <AlertDialog open={restoreDialogOpen} onOpenChange={setRestoreDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restaurer le backup</AlertDialogTitle>
            <AlertDialogDescription>
              Cette action va restaurer les éléments sélectionnés depuis le backup &quot;{selectedBackup?.name}&quot;.
              Les données actuelles seront remplacées.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2 my-4">
            {selectedBackup?.includes_database && (
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="restore_database"
                  checked={restoreOptions.restore_database}
                  onCheckedChange={(checked) =>
                    setRestoreOptions({ ...restoreOptions, restore_database: !!checked })
                  }
                />
                <Label htmlFor="restore_database" className="font-normal">
                  Restaurer la base de données
                </Label>
              </div>
            )}
            {selectedBackup?.includes_storage && (
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="restore_storage"
                  checked={restoreOptions.restore_storage}
                  onCheckedChange={(checked) =>
                    setRestoreOptions({ ...restoreOptions, restore_storage: !!checked })
                  }
                />
                <Label htmlFor="restore_storage" className="font-normal">
                  Restaurer les fichiers
                </Label>
              </div>
            )}
            {selectedBackup?.includes_config && (
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="restore_config"
                  checked={restoreOptions.restore_config}
                  onCheckedChange={(checked) =>
                    setRestoreOptions({ ...restoreOptions, restore_config: !!checked })
                  }
                />
                <Label htmlFor="restore_config" className="font-normal">
                  Restaurer la configuration
                </Label>
              </div>
            )}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={handleRestoreBackup} disabled={restoring}>
              {restoring ? (
                <>
                  <IconLoader className="h-4 w-4 mr-2 animate-spin" />
                  Restauration...
                </>
              ) : (
                <>
                  <IconRestore className="h-4 w-4 mr-2" />
                  Restaurer
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Backup Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer le backup</AlertDialogTitle>
            <AlertDialogDescription>
              Êtes-vous sûr de vouloir supprimer le backup &quot;{selectedBackup?.name}&quot; ?
              Cette action est irréversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteBackup}>
              <IconTrash className="h-4 w-4 mr-2" />
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Scheduled Backup Dialog */}
      <AlertDialog open={deleteScheduledDialogOpen} onOpenChange={setDeleteScheduledDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer la planification</AlertDialogTitle>
            <AlertDialogDescription>
              Êtes-vous sûr de vouloir supprimer la planification &quot;{selectedScheduled?.name}&quot; ?
              Cette action est irréversible. Les sauvegardes déjà créées ne seront pas supprimées.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteScheduled}>
              <IconTrash className="h-4 w-4 mr-2" />
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ContentSection>
  )
}
