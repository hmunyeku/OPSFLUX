"use client"

import { useCallback, useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
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
} from "@tabler/icons-react"
import ContentSection from "../components/content-section"
import { useToast } from "@/hooks/use-toast"
import {
  getBackups,
  createBackup,
  downloadBackup,
  restoreBackup,
  deleteBackup,
  type Backup,
  type BackupCreate,
  type BackupRestore,
} from "./data/backups-api"
import { PermissionGuard } from "@/components/permission-guard"
import { usePermissions } from "@/hooks/use-permissions"
import { formatDistanceToNow } from "date-fns"
import { fr } from "date-fns/locale"

export default function BackupsPage() {
  return (
    <PermissionGuard permission="core.backups.read">
      <BackupsPageContent />
    </PermissionGuard>
  )
}

function BackupsPageContent() {
  const { hasPermission } = usePermissions()
  const [backups, setBackups] = useState<Backup[]>([])
  const [loading, setLoading] = useState(true)
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [restoreDialogOpen, setRestoreDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [selectedBackup, setSelectedBackup] = useState<Backup | null>(null)
  const [creating, setCreating] = useState(false)
  const [restoring, setRestoring] = useState(false)
  const { toast } = useToast()

  const [newBackup, setNewBackup] = useState<BackupCreate>({
    name: "",
    description: "",
    backup_type: "full",
    includes_database: true,
    includes_storage: true,
    includes_config: true,
  })

  const [restoreOptions, setRestoreOptions] = useState<BackupRestore>({
    backup_id: "",
    restore_database: true,
    restore_storage: true,
    restore_config: true,
  })

  const fetchBackups = useCallback(async () => {
    setLoading(true)
    try {
      const data = await getBackups({ limit: 100 })
      setBackups(data.data)
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Erreur",
        description: "Impossible de charger les backups",
      })
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    fetchBackups()
    // Auto-refresh every 10 seconds to see status updates
    const interval = setInterval(fetchBackups, 10000)
    return () => clearInterval(interval)
  }, [fetchBackups])

  const handleCreateBackup = async () => {
    if (!newBackup.name.trim()) {
      toast({
        variant: "destructive",
        title: "Erreur",
        description: "Le nom du backup est requis",
      })
      return
    }

    setCreating(true)
    try {
      await createBackup(newBackup)
      toast({
        title: "Backup créé",
        description: "Le backup a été créé avec succès et est en cours de traitement",
      })
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
      toast({
        variant: "destructive",
        title: "Erreur",
        description: error instanceof Error ? error.message : "Impossible de créer le backup",
      })
    } finally {
      setCreating(false)
    }
  }

  const handleDownload = async (backup: Backup) => {
    try {
      await downloadBackup(backup.id)
      toast({
        title: "Téléchargement démarré",
        description: "Le fichier de backup va être téléchargé",
      })
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Erreur",
        description: "Impossible de télécharger le backup",
      })
    }
  }

  const handleRestoreBackup = async () => {
    if (!selectedBackup) return

    setRestoring(true)
    try {
      await restoreBackup(selectedBackup.id, restoreOptions)
      toast({
        title: "Restauration démarrée",
        description: "La restauration du backup a été lancée en arrière-plan",
      })
      setRestoreDialogOpen(false)
      setSelectedBackup(null)
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Erreur",
        description: error instanceof Error ? error.message : "Impossible de restaurer le backup",
      })
    } finally {
      setRestoring(false)
    }
  }

  const handleDeleteBackup = async () => {
    if (!selectedBackup) return

    try {
      await deleteBackup(selectedBackup.id)
      toast({
        title: "Backup supprimé",
        description: "Le backup a été supprimé avec succès",
      })
      setDeleteDialogOpen(false)
      setSelectedBackup(null)
      fetchBackups()
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Erreur",
        description: "Impossible de supprimer le backup",
      })
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
      <Badge variant={config.variant} className="flex items-center gap-1">
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
      title="Backups & Restore"
      description="Gérez les sauvegardes de votre système (base de données, fichiers et configuration)"
    >
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2">
            <Button onClick={fetchBackups} variant="outline" size="sm">
              <IconRefresh className="h-4 w-4 mr-2" />
              Actualiser
            </Button>
          </div>
          {hasPermission("core.backups.create") && (
            <Button onClick={() => setCreateDialogOpen(true)}>
              <IconPlus className="h-4 w-4 mr-2" />
              Créer un backup
            </Button>
          )}
        </div>

        {loading ? (
          <Card>
            <CardContent className="py-8">
              <div className="flex items-center justify-center">
                <IconLoader className="h-6 w-6 animate-spin" />
                <span className="ml-2">Chargement...</span>
              </div>
            </CardContent>
          </Card>
        ) : backups.length === 0 ? (
          <Card>
            <CardContent className="py-8">
              <div className="text-center text-muted-foreground">
                <IconDatabase className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p>Aucun backup disponible</p>
                <p className="text-sm">Créez votre premier backup pour sauvegarder vos données</p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {backups.map((backup) => (
              <Card key={backup.id}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <CardTitle className="text-lg">{backup.name}</CardTitle>
                      {backup.description && (
                        <CardDescription>{backup.description}</CardDescription>
                      )}
                    </div>
                    {getStatusBadge(backup.status)}
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-4">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      <div>
                        <p className="text-muted-foreground">Type</p>
                        <p className="font-medium capitalize">{backup.backup_type}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Taille totale</p>
                        <p className="font-medium">{formatBytes(backup.file_size)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Créé</p>
                        <p className="font-medium">
                          {formatDistanceToNow(new Date(backup.created_at), {
                            addSuffix: true,
                            locale: fr,
                          })}
                        </p>
                      </div>
                      {backup.completed_at && (
                        <div>
                          <p className="text-muted-foreground">Terminé</p>
                          <p className="font-medium">
                            {formatDistanceToNow(new Date(backup.completed_at), {
                              addSuffix: true,
                              locale: fr,
                            })}
                          </p>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      {backup.includes_database && (
                        <Badge variant="outline">
                          Base de données ({formatBytes(backup.database_size)})
                        </Badge>
                      )}
                      {backup.includes_storage && (
                        <Badge variant="outline">
                          Fichiers ({formatBytes(backup.storage_size)})
                        </Badge>
                      )}
                      {backup.includes_config && (
                        <Badge variant="outline">
                          Configuration ({formatBytes(backup.config_size)})
                        </Badge>
                      )}
                    </div>

                    {backup.error_message && (
                      <div className="text-sm text-destructive bg-destructive/10 p-2 rounded">
                        {backup.error_message}
                      </div>
                    )}

                    <div className="flex items-center gap-2 pt-2">
                      {backup.status === "completed" && (
                        <>
                          {hasPermission("core.backups.download") && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleDownload(backup)}
                            >
                              <IconDownload className="h-4 w-4 mr-2" />
                              Télécharger
                            </Button>
                          )}
                          {hasPermission("core.backups.restore") && (
                            <Button
                              variant="outline"
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
                            >
                              <IconRestore className="h-4 w-4 mr-2" />
                              Restaurer
                            </Button>
                          )}
                        </>
                      )}
                      {hasPermission("core.backups.delete") && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setSelectedBackup(backup)
                            setDeleteDialogOpen(true)
                          }}
                        >
                          <IconTrash className="h-4 w-4 mr-2" />
                          Supprimer
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Create Backup Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Créer un nouveau backup</DialogTitle>
            <DialogDescription>
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
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
              Annuler
            </Button>
            <Button onClick={handleCreateBackup} disabled={creating}>
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
    </ContentSection>
  )
}
