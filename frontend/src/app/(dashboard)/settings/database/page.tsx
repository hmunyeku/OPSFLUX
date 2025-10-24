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
    <div className="space-y-3">
      <div>
        <h3 className="text-base font-medium">Base de données</h3>
        <p className="text-xs text-muted-foreground">
          Informations et gestion de la base de données PostgreSQL
        </p>
      </div>

      <Separator />

      {/* Database Overview - Compact */}
      <div className="grid gap-2 grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1.5 p-3">
            <CardTitle className="text-xs font-medium">Base de données</CardTitle>
            <Database className="h-3.5 w-3.5 text-muted-foreground" />
          </CardHeader>
          <CardContent className="p-3 pt-0">
            {loading ? (
              <Skeleton className="h-5 w-24" />
            ) : (
              <div className="text-lg font-bold truncate">{dbInfo?.database_name}</div>
            )}
            {loading ? (
              <Skeleton className="h-3 w-20 mt-0.5" />
            ) : (
              <p className="text-[10px] text-muted-foreground truncate">{dbInfo?.postgres_version}</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1.5 p-3">
            <CardTitle className="text-xs font-medium">Serveur</CardTitle>
            <Server className="h-3.5 w-3.5 text-muted-foreground" />
          </CardHeader>
          <CardContent className="p-3 pt-0">
            {loading ? (
              <Skeleton className="h-5 w-24" />
            ) : (
              <div className="text-lg font-bold truncate">{dbInfo?.server_host}</div>
            )}
            {loading ? (
              <Skeleton className="h-3 w-16 mt-0.5" />
            ) : (
              <p className="text-[10px] text-muted-foreground">Port {dbInfo?.server_port}</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1.5 p-3">
            <CardTitle className="text-xs font-medium">Taille</CardTitle>
            <HardDrive className="h-3.5 w-3.5 text-muted-foreground" />
          </CardHeader>
          <CardContent className="p-3 pt-0">
            {loading ? (
              <Skeleton className="h-5 w-16" />
            ) : (
              <div className="text-lg font-bold">{dbInfo?.database_size}</div>
            )}
            {loading ? (
              <Skeleton className="h-3 w-20 mt-0.5" />
            ) : (
              <p className="text-[10px] text-muted-foreground">{dbInfo?.total_tables} tables</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1.5 p-3">
            <CardTitle className="text-xs font-medium">Connexions</CardTitle>
            <Activity className="h-3.5 w-3.5 text-muted-foreground" />
          </CardHeader>
          <CardContent className="p-3 pt-0">
            {loading ? (
              <Skeleton className="h-5 w-10" />
            ) : (
              <div className="text-lg font-bold">{dbInfo?.total_connections}</div>
            )}
            {loading ? (
              <Skeleton className="h-3 w-16 mt-0.5" />
            ) : (
              <p className="text-[10px] text-muted-foreground">{dbInfo?.active_connections} actives</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Adminer Access - Compact */}
      <Card>
        <CardHeader className="p-3 pb-2">
          <CardTitle className="text-sm">Accès Adminer</CardTitle>
          <CardDescription className="text-xs">
            Connexion automatique sécurisée (token 30min)
          </CardDescription>
        </CardHeader>
        <CardContent className="p-3 pt-0">
          <Button onClick={handleOpenAdminer} disabled={isGeneratingToken} size="sm" className="w-full sm:w-auto h-8">
            <Key className="mr-1.5 h-3.5 w-3.5" />
            <span className="text-xs">{isGeneratingToken ? "Génération..." : "Ouvrir Adminer"}</span>
            <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
          </Button>
        </CardContent>
      </Card>

      {/* Backups Section - Compact */}
      <Card>
        <CardHeader className="p-3 pb-2">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle className="text-sm">Sauvegardes</CardTitle>
              <CardDescription className="text-xs">
                Gérez les sauvegardes de votre base de données
              </CardDescription>
            </div>
            <div className="flex gap-1.5 flex-wrap">
              <Button
                variant="outline"
                size="sm"
                onClick={fetchBackups}
                disabled={loadingBackups}
                className="h-7 text-xs flex-1 sm:flex-none"
              >
                <RefreshCw className={`h-3 w-3 ${loadingBackups ? "animate-spin" : ""}`} />
                <span className="ml-1.5 sm:hidden">Actualiser</span>
              </Button>
              <Button
                size="sm"
                onClick={handleCreateBackup}
                disabled={creatingBackup}
                className="h-7 text-xs flex-1 sm:flex-none"
              >
                <Plus className="mr-1.5 h-3 w-3" />
                {creatingBackup ? "Création..." : "Nouvelle"}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-3 pt-0">
          {loadingBackups ? (
            <div className="space-y-1.5">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : backups.length === 0 ? (
            <div className="text-center py-6">
              <p className="text-xs text-muted-foreground">Aucune sauvegarde disponible</p>
              <p className="text-[10px] text-muted-foreground mt-1">
                Créez votre première sauvegarde
              </p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {backups.map((backup) => (
                <div
                  key={backup.filename}
                  className="flex flex-col sm:flex-row sm:items-center gap-2 p-2 border rounded hover:bg-muted/50 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <Database className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                      <span className="text-xs font-medium truncate">{backup.filename}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <span className="text-[10px] text-muted-foreground">
                        {new Date(backup.created_at).toLocaleString('fr-FR', {
                          day: '2-digit',
                          month: '2-digit',
                          year: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </span>
                      <Badge variant="secondary" className="text-[9px] h-4 px-1">
                        {backup.size}
                      </Badge>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 self-end sm:self-center">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDownloadBackup(backup.filename)}
                      className="h-6 w-6 p-0 flex-1 sm:flex-none sm:w-6"
                    >
                      <Download className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setDeleteBackupFilename(backup.filename)}
                      className="h-6 w-6 p-0 flex-1 sm:flex-none sm:w-6"
                    >
                      <Trash2 className="h-3 w-3 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tables List - Compact */}
      <Card>
        <CardHeader className="p-3 pb-2">
          <CardTitle className="text-sm">Tables de la base de données</CardTitle>
          <CardDescription className="text-xs">Liste complète avec filtres et tri</CardDescription>
        </CardHeader>
        <CardContent className="p-3 pt-0">
          {loading ? (
            <div className="space-y-1.5">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : (
            <DatabaseTablesTable columns={columns} data={tablesData?.tables || []} />
          )}
        </CardContent>
      </Card>

      {/* Recent Activity - Compact */}
      <Card>
        <CardHeader className="p-3 pb-2">
          <CardTitle className="text-sm">Activité récente</CardTitle>
          <CardDescription className="text-xs">Dernières opérations</CardDescription>
        </CardHeader>
        <CardContent className="p-3 pt-0">
          {loading ? (
            <div className="space-y-1.5">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : activityData?.activities.length === 0 ? (
            <p className="text-xs text-muted-foreground">Aucune activité récente</p>
          ) : (
            <div className="space-y-1.5">
              {activityData?.activities.map((activity) => (
                <div key={activity.pid} className="p-2 border rounded space-y-1.5">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1.5">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <Badge variant={activity.state === "active" ? "default" : "secondary"} className="text-[9px] h-4 px-1">
                        {activity.state}
                      </Badge>
                      <span className="text-xs font-medium">{activity.user}</span>
                      {activity.client_address && (
                        <span className="text-[10px] text-muted-foreground">({activity.client_address})</span>
                      )}
                    </div>
                    {activity.timestamp && (
                      <span className="text-[10px] text-muted-foreground whitespace-nowrap">
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
                    <p className="text-[10px] text-muted-foreground font-mono bg-muted p-1.5 rounded break-all">
                      {activity.query.length > 200 ? activity.query.substring(0, 200) + '...' : activity.query}
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
