"use client"

import { useState, useEffect } from "react"
import { Database, Server, HardDrive, Activity, ExternalLink, Key, Download, Trash2, Plus, RefreshCw } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { useToast } from "@/hooks/use-toast"
import { Skeleton } from "@/components/ui/skeleton"
import { DatabaseService, BackupInfo } from "@/api/database"
import { DatabaseTablesTable } from "./components/database-tables-table"
import { columns } from "./components/database-tables-columns"
import { adminerWindowManager } from "@/lib/adminer-windows"
import ContentSection from "../components/content-section"
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

interface DatabaseInfo {
  database_name: string
  server_host: string
  server_port: number
  total_tables: number
  database_size: string
  total_connections: number
  active_connections: number
  last_backup: string | null
  postgres_version: string
}

interface DatabaseTable {
  schema: string
  name: string
  size: string
  row_count: number
}

interface RecentActivity {
  pid: number
  user: string
  application: string
  client_address: string | null
  state: string
  query: string
  timestamp: string | null
}

export default function DatabasePage() {
  const { toast } = useToast()
  const [isGeneratingToken, setIsGeneratingToken] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [dbInfo, setDbInfo] = useState<DatabaseInfo | null>(null)
  const [tablesData, setTablesData] = useState<{ tables: DatabaseTable[]; count: number } | null>(null)
  const [activityData, setActivityData] = useState<{ activities: RecentActivity[]; count: number } | null>(null)

  // Backup states
  const [backups, setBackups] = useState<BackupInfo[]>([])
  const [loadingBackups, setLoadingBackups] = useState(false)
  const [creatingBackup, setCreatingBackup] = useState(false)
  const [deleteBackupFilename, setDeleteBackupFilename] = useState<string | null>(null)

  const fetchData = async () => {
    setLoading(true)
    setError(false)
    try {
      const [info, tables, activity] = await Promise.all([
        DatabaseService.getDatabaseInfo(),
        DatabaseService.getDatabaseTables(),
        DatabaseService.getRecentActivity({ limit: 5 })
      ])
      setDbInfo(info as DatabaseInfo)
      setTablesData(tables as { tables: DatabaseTable[]; count: number })
      setActivityData(activity as { activities: RecentActivity[]; count: number })
    } catch (err) {
      setError(true)
      toast({
        title: "Erreur",
        description: "Impossible de charger les informations de la base de données",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const fetchBackups = async () => {
    setLoadingBackups(true)
    try {
      const data = await DatabaseService.listBackups()
      setBackups(data.backups)
    } catch (err: any) {
      // Don't show error toast if it's a permission issue
      if (!err.message?.includes("permission")) {
        toast({
          title: "Erreur",
          description: "Impossible de charger les sauvegardes",
          variant: "destructive",
        })
      }
    } finally {
      setLoadingBackups(false)
    }
  }

  useEffect(() => {
    fetchData()
    fetchBackups()
  }, [])

  const handleOpenAdminer = async () => {
    setIsGeneratingToken(true)
    try {
      const data = await DatabaseService.createAdminerToken()
      const adminerWindow = window.open(data.adminer_url, "_blank")

      // Track the window for security (will be closed on logout)
      if (adminerWindow) {
        adminerWindowManager.addWindow(adminerWindow)
      }

      toast({
        title: "Connexion sécurisée",
        description: "Adminer ouvert. Il se fermera automatiquement à la déconnexion.",
      })
    } catch (error: any) {
      toast({
        title: "Erreur",
        description: error.message || "Impossible de générer le token",
        variant: "destructive",
      })
    } finally {
      setIsGeneratingToken(false)
    }
  }

  const handleCreateBackup = async () => {
    setCreatingBackup(true)
    try {
      await DatabaseService.createBackup()
      toast({
        title: "Sauvegarde créée",
        description: "La sauvegarde a été créée avec succès",
      })
      await fetchBackups()
    } catch (error: any) {
      toast({
        title: "Erreur",
        description: error.message || "Impossible de créer la sauvegarde",
        variant: "destructive",
      })
    } finally {
      setCreatingBackup(false)
    }
  }

  const handleDownloadBackup = async (filename: string) => {
    try {
      await DatabaseService.downloadBackup(filename)
      toast({
        title: "Téléchargement démarré",
        description: "Le téléchargement de la sauvegarde a commencé",
      })
    } catch (error: any) {
      toast({
        title: "Erreur",
        description: error.message || "Impossible de télécharger la sauvegarde",
        variant: "destructive",
      })
    }
  }

  const handleDeleteBackup = async (filename: string) => {
    try {
      await DatabaseService.deleteBackup(filename)
      toast({
        title: "Sauvegarde supprimée",
        description: "La sauvegarde a été supprimée avec succès",
      })
      setDeleteBackupFilename(null)
      await fetchBackups()
    } catch (error: any) {
      toast({
        title: "Erreur",
        description: error.message || "Impossible de supprimer la sauvegarde",
        variant: "destructive",
      })
    }
  }

  if (error) {
    return (
      <ContentSection
        title="Base de données"
        desc="Informations et gestion de la base de données PostgreSQL"
        className="w-full lg:max-w-full"
      >
        <div className="flex h-[450px] items-center justify-center">
          <div className="text-center">
            <p className="text-sm text-muted-foreground">Impossible de charger les informations de la base de données</p>
            <p className="text-xs text-muted-foreground mt-2">Vous n&apos;avez peut-être pas les permissions nécessaires</p>
          </div>
        </div>
      </ContentSection>
    )
  }

  return (
    <ContentSection
      title="Base de données"
      desc="Informations et gestion de la base de données PostgreSQL"
      className="w-full lg:max-w-full"
    >
      <div className="space-y-4">

        {/* Database Overview - Ultra compact like storage/queue */}
        <div className="grid gap-2 grid-cols-2 sm:grid-cols-4">
          <Card>
            <CardContent className="p-3">
              <div className="flex items-center gap-2">
                <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Database className="h-4 w-4 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] text-muted-foreground font-medium mb-1">Database</p>
                  {loading ? (
                    <Skeleton className="h-5 w-16" />
                  ) : (
                    <div className="text-base font-bold truncate">{dbInfo?.database_name}</div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-3">
              <div className="flex items-center gap-2">
                <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
                  <Server className="h-4 w-4 text-blue-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] text-muted-foreground font-medium mb-1">Serveur</p>
                  {loading ? (
                    <Skeleton className="h-5 w-16" />
                  ) : (
                    <div className="text-base font-bold truncate">{dbInfo?.server_host}</div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-3">
              <div className="flex items-center gap-2">
                <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-purple-500/10 flex items-center justify-center">
                  <HardDrive className="h-4 w-4 text-purple-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] text-muted-foreground font-medium mb-1">Taille</p>
                  {loading ? (
                    <Skeleton className="h-5 w-16" />
                  ) : (
                    <div className="text-base font-bold">{dbInfo?.database_size}</div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-3">
              <div className="flex items-center gap-2">
                <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-green-500/10 flex items-center justify-center">
                  <Activity className="h-4 w-4 text-green-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] text-muted-foreground font-medium mb-1">Connexions</p>
                  {loading ? (
                    <Skeleton className="h-5 w-10" />
                  ) : (
                    <div className="text-base font-bold">{dbInfo?.total_connections}</div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Adminer Access */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Accès Adminer</CardTitle>
            <CardDescription className="text-xs">
              Connexion automatique sécurisée (token 30min)
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <Button onClick={handleOpenAdminer} disabled={isGeneratingToken} size="sm" className="w-full sm:w-auto">
              <Key className="mr-2 h-4 w-4" />
              {isGeneratingToken ? "Génération..." : "Ouvrir Adminer"}
              <ExternalLink className="ml-2 h-4 w-4" />
            </Button>
          </CardContent>
        </Card>

        {/* Backups Section */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <CardTitle className="text-base">Sauvegardes</CardTitle>
                <CardDescription className="text-xs">
                  Gérez les sauvegardes de votre base de données
                </CardDescription>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={fetchBackups}
                  disabled={loadingBackups}
                >
                  <RefreshCw className={`h-4 w-4 ${loadingBackups ? "animate-spin" : ""}`} />
                  <span className="ml-2 hidden sm:inline">Actualiser</span>
                </Button>
                <Button
                  size="sm"
                  onClick={handleCreateBackup}
                  disabled={creatingBackup}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  {creatingBackup ? "Création..." : "Nouvelle"}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {loadingBackups ? (
              <div className="flex items-center justify-center py-8">
                <RefreshCw className="h-6 w-6 animate-spin" />
              </div>
            ) : backups.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Database className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p className="text-sm">Aucune sauvegarde disponible</p>
                <p className="text-xs mt-1">Créez votre première sauvegarde</p>
              </div>
            ) : (
              <div className="space-y-2">
                {backups.map((backup) => (
                  <div
                    key={backup.filename}
                    className="flex items-center gap-2 p-2.5 border rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-muted/50 flex items-center justify-center">
                      <Database className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{backup.filename}</p>
                      <div className="flex flex-wrap gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
                        <span>{backup.size}</span>
                        <span className="hidden sm:inline">•</span>
                        <span className="truncate">
                          {new Date(backup.created_at).toLocaleString('fr-FR', {
                            day: '2-digit',
                            month: '2-digit',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </span>
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0"
                        onClick={() => handleDownloadBackup(backup.filename)}
                      >
                        <Download className="h-3.5 w-3.5" />
                        <span className="sr-only">Télécharger</span>
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0"
                        onClick={() => setDeleteBackupFilename(backup.filename)}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        <span className="sr-only">Supprimer</span>
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Tables List */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Tables de la base de données</CardTitle>
            <CardDescription className="text-xs">
              {tablesData?.count || 0} table{(tablesData?.count || 0) !== 1 ? 's' : ''} dans la base
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <RefreshCw className="h-6 w-6 animate-spin" />
              </div>
            ) : (
              <DatabaseTablesTable columns={columns} data={tablesData?.tables || []} />
            )}
          </CardContent>
        </Card>

        {/* Recent Activity */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Activité récente</CardTitle>
            <CardDescription className="text-xs">Dernières opérations sur la base de données</CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <RefreshCw className="h-6 w-6 animate-spin" />
              </div>
            ) : activityData?.activities.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Activity className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p className="text-sm">Aucune activité récente</p>
              </div>
            ) : (
              <div className="space-y-2">
                {activityData?.activities.map((activity) => (
                  <div key={activity.pid} className="p-2.5 border rounded-lg space-y-2">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge
                          variant={activity.state === "active" ? "default" : "secondary"}
                          className="text-[10px] h-5 px-1.5"
                        >
                          {activity.state}
                        </Badge>
                        <span className="text-sm font-medium">{activity.user}</span>
                        {activity.client_address && (
                          <span className="text-xs text-muted-foreground">({activity.client_address})</span>
                        )}
                      </div>
                      {activity.timestamp && (
                        <span className="text-xs text-muted-foreground">
                          {new Date(activity.timestamp).toLocaleString('fr-FR', {
                            day: '2-digit',
                            month: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </span>
                      )}
                    </div>
                    {activity.query && (
                      <p className="text-xs text-muted-foreground font-mono bg-muted p-2 rounded break-all">
                        {activity.query.length > 150 ? activity.query.substring(0, 150) + '...' : activity.query}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Delete Confirmation Dialog */}
        <AlertDialog open={!!deleteBackupFilename} onOpenChange={(open) => !open && setDeleteBackupFilename(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Confirmer la suppression</AlertDialogTitle>
              <AlertDialogDescription>
                Êtes-vous sûr de vouloir supprimer la sauvegarde <strong>{deleteBackupFilename}</strong> ?
                Cette action est irréversible.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Annuler</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => deleteBackupFilename && handleDeleteBackup(deleteBackupFilename)}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Supprimer
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </ContentSection>
  )
}
