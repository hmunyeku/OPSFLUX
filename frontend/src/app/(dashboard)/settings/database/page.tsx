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
      <div className="flex h-[450px] items-center justify-center">
        <div className="text-center">
          <p className="text-sm text-muted-foreground">Impossible de charger les informations de la base de données</p>
          <p className="text-xs text-muted-foreground mt-2">Vous n&apos;avez peut-être pas les permissions nécessaires</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">Base de données</h3>
        <p className="text-sm text-muted-foreground">
          Informations et gestion de la base de données PostgreSQL
        </p>
      </div>

      <Separator />

      {/* Database Overview */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Base de données</CardTitle>
            <Database className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-6 w-32" />
            ) : (
              <div className="text-2xl font-bold">{dbInfo?.database_name}</div>
            )}
            {loading ? (
              <Skeleton className="h-4 w-24 mt-1" />
            ) : (
              <p className="text-xs text-muted-foreground">{dbInfo?.postgres_version}</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Serveur</CardTitle>
            <Server className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-6 w-32" />
            ) : (
              <div className="text-2xl font-bold">{dbInfo?.server_host}</div>
            )}
            {loading ? (
              <Skeleton className="h-4 w-16 mt-1" />
            ) : (
              <p className="text-xs text-muted-foreground">Port {dbInfo?.server_port}</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Taille</CardTitle>
            <HardDrive className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-6 w-20" />
            ) : (
              <div className="text-2xl font-bold">{dbInfo?.database_size}</div>
            )}
            {loading ? (
              <Skeleton className="h-4 w-24 mt-1" />
            ) : (
              <p className="text-xs text-muted-foreground">{dbInfo?.total_tables} tables</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Connexions</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-6 w-12" />
            ) : (
              <div className="text-2xl font-bold">{dbInfo?.total_connections}</div>
            )}
            {loading ? (
              <Skeleton className="h-4 w-20 mt-1" />
            ) : (
              <p className="text-xs text-muted-foreground">{dbInfo?.active_connections} actives</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Adminer Access */}
      <Card>
        <CardHeader>
          <CardTitle>Accès Adminer</CardTitle>
          <CardDescription>
            Ouvrez Adminer avec une connexion automatique sécurisée (token temporaire de 30 minutes)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={handleOpenAdminer} disabled={isGeneratingToken} className="w-full sm:w-auto">
            <Key className="mr-2 h-4 w-4" />
            {isGeneratingToken ? "Génération du token..." : "Ouvrir Adminer"}
            <ExternalLink className="ml-2 h-4 w-4" />
          </Button>
        </CardContent>
      </Card>

      {/* Backups Section */}
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle>Sauvegardes</CardTitle>
              <CardDescription>
                Gérez les sauvegardes de votre base de données
              </CardDescription>
            </div>
            <div className="flex gap-2 flex-wrap">
              <Button
                variant="outline"
                size="sm"
                onClick={fetchBackups}
                disabled={loadingBackups}
                className="flex-1 sm:flex-none"
              >
                <RefreshCw className={`h-4 w-4 ${loadingBackups ? "animate-spin" : ""}`} />
                <span className="ml-2 sm:hidden">Actualiser</span>
              </Button>
              <Button
                size="sm"
                onClick={handleCreateBackup}
                disabled={creatingBackup}
                className="flex-1 sm:flex-none"
              >
                <Plus className="mr-2 h-4 w-4" />
                {creatingBackup ? "Création..." : "Nouvelle sauvegarde"}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loadingBackups ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : backups.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-sm text-muted-foreground">Aucune sauvegarde disponible</p>
              <p className="text-xs text-muted-foreground mt-1">
                Créez votre première sauvegarde en cliquant sur le bouton ci-dessus
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {backups.map((backup) => (
                <div
                  key={backup.filename}
                  className="flex flex-col sm:flex-row sm:items-center gap-3 p-3 border rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Database className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      <span className="text-sm font-medium truncate">{backup.filename}</span>
                    </div>
                    <div className="flex items-center gap-3 mt-1 flex-wrap">
                      <span className="text-xs text-muted-foreground">
                        {new Date(backup.created_at).toLocaleString()}
                      </span>
                      <Badge variant="secondary" className="text-xs">
                        {backup.size}
                      </Badge>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 self-end sm:self-center">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDownloadBackup(backup.filename)}
                      className="flex-1 sm:flex-none"
                    >
                      <Download className="h-4 w-4" />
                      <span className="ml-2 sm:hidden">Télécharger</span>
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setDeleteBackupFilename(backup.filename)}
                      className="flex-1 sm:flex-none"
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                      <span className="ml-2 sm:hidden">Supprimer</span>
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
        <CardHeader>
          <CardTitle>Tables de la base de données</CardTitle>
          <CardDescription>Liste complète des tables avec filtres et tri</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : (
            <DatabaseTablesTable columns={columns} data={tablesData?.tables || []} />
          )}
        </CardContent>
      </Card>

      {/* Recent Activity */}
      <Card>
        <CardHeader>
          <CardTitle>Activité récente</CardTitle>
          <CardDescription>Dernières opérations sur la base de données</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : activityData?.activities.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucune activité récente</p>
          ) : (
            <div className="space-y-2">
              {activityData?.activities.map((activity) => (
                <div key={activity.pid} className="p-3 border rounded-lg space-y-2">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant={activity.state === "active" ? "default" : "secondary"}>
                        {activity.state}
                      </Badge>
                      <span className="text-sm font-medium">{activity.user}</span>
                      {activity.client_address && (
                        <span className="text-xs text-muted-foreground">({activity.client_address})</span>
                      )}
                    </div>
                    {activity.timestamp && (
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(activity.timestamp).toLocaleString()}
                      </span>
                    )}
                  </div>
                  {activity.query && (
                    <p className="text-xs text-muted-foreground font-mono bg-muted p-2 rounded break-all">
                      {activity.query}
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
  )
}
