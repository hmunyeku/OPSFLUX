"use client"

import * as React from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog"
import {
  Package,
  Upload,
  Play,
  Pause,
  Trash2,
  Settings,
  Download,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Loader2,
  RefreshCw,
} from "lucide-react"
import { ModulesApi, type ModulePublic, type ModuleStatus } from "@/lib/modules-api"
import { useToast } from "@/hooks/use-toast"
import { PermissionGuard } from "@/components/permission-guard"
import { usePermissions } from "@/lib/permissions-context"

export function SettingsModulesContent() {
  const { toast } = useToast()
  const { hasPermission } = usePermissions()
  const [modules, setModules] = React.useState<ModulePublic[]>([])
  const [loading, setLoading] = React.useState(true)
  const [uploadDialogOpen, setUploadDialogOpen] = React.useState(false)
  const [selectedFile, setSelectedFile] = React.useState<File | null>(null)
  const [uploading, setUploading] = React.useState(false)
  const [actioningModuleId, setActioningModuleId] = React.useState<string | null>(null)

  React.useEffect(() => {
    fetchModules()
  }, [])

  const fetchModules = async () => {
    try {
      setLoading(true)
      const response = await ModulesApi.getModules({ limit: 100 })
      setModules(response.data)
    } catch (error) {
      console.error("Error fetching modules:", error)
      toast({
        title: "Erreur",
        description: "Impossible de charger les modules",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      if (!file.name.endsWith('.zip')) {
        toast({
          title: "Erreur",
          description: "Le fichier doit être au format ZIP",
          variant: "destructive",
        })
        return
      }
      setSelectedFile(file)
      setUploadDialogOpen(true)
    }
  }

  const handleUpload = async () => {
    if (!selectedFile) return

    try {
      setUploading(true)
      const response = await ModulesApi.installModule(selectedFile)

      if (response.success) {
        toast({
          title: "Succès",
          description: response.message,
        })
        setUploadDialogOpen(false)
        setSelectedFile(null)
        fetchModules()
      } else {
        toast({
          title: "Erreur",
          description: response.message,
          variant: "destructive",
        })
      }
    } catch (error: any) {
      console.error("Error installing module:", error)
      toast({
        title: "Erreur",
        description: error.message || "Impossible d'installer le module",
        variant: "destructive",
      })
    } finally {
      setUploading(false)
    }
  }

  const handleActivate = async (moduleId: string) => {
    try {
      setActioningModuleId(moduleId)
      await ModulesApi.activateModule(moduleId)
      toast({
        title: "Succès",
        description: "Module activé avec succès",
      })
      fetchModules()
    } catch (error) {
      console.error("Error activating module:", error)
      toast({
        title: "Erreur",
        description: "Impossible d'activer le module",
        variant: "destructive",
      })
    } finally {
      setActioningModuleId(null)
    }
  }

  const handleDeactivate = async (moduleId: string) => {
    try {
      setActioningModuleId(moduleId)
      await ModulesApi.deactivateModule(moduleId)
      toast({
        title: "Succès",
        description: "Module désactivé avec succès",
      })
      fetchModules()
    } catch (error) {
      console.error("Error deactivating module:", error)
      toast({
        title: "Erreur",
        description: "Impossible de désactiver le module",
        variant: "destructive",
      })
    } finally {
      setActioningModuleId(null)
    }
  }

  const handleUninstall = async (moduleId: string, moduleName: string) => {
    if (!confirm(`Êtes-vous sûr de vouloir désinstaller le module "${moduleName}" ? Cette action est irréversible.`)) {
      return
    }

    try {
      setActioningModuleId(moduleId)
      await ModulesApi.uninstallModule(moduleId)
      toast({
        title: "Succès",
        description: "Module désinstallé avec succès",
      })
      fetchModules()
    } catch (error) {
      console.error("Error uninstalling module:", error)
      toast({
        title: "Erreur",
        description: "Impossible de désinstaller le module",
        variant: "destructive",
      })
    } finally {
      setActioningModuleId(null)
    }
  }

  const getStatusBadge = (status: ModuleStatus) => {
    const variants = {
      installed: { variant: "secondary" as const, icon: AlertCircle, label: "Installé" },
      active: { variant: "default" as const, icon: CheckCircle2, label: "Actif" },
      disabled: { variant: "outline" as const, icon: XCircle, label: "Désactivé" },
    }
    const config = variants[status]
    const Icon = config.icon
    return (
      <Badge variant={config.variant} className="gap-1 h-5 text-[9px]">
        <Icon className="h-2.5 w-2.5" />
        {config.label}
      </Badge>
    )
  }

  const stats = {
    total: modules.length,
    active: modules.filter((m) => m.status === "active").length,
    disabled: modules.filter((m) => m.status === "disabled" || m.status === "installed").length,
    system: modules.filter((m) => m.is_system).length,
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center p-3">
        <div className="text-center">
          <Loader2 className="mx-auto h-6 w-6 animate-spin text-primary mb-2" />
          <p className="text-xs text-muted-foreground">Chargement des modules...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col gap-3 p-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold leading-none">Gestion des Modules</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Installer, activer et configurer les modules</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" className="h-8 text-xs bg-transparent" onClick={fetchModules} disabled={loading}>
            <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Rafraîchir
          </Button>
          <PermissionGuard resource="core.modules" action="create">
            <Button size="sm" className="h-8 text-xs" onClick={() => document.getElementById('module-file-input')?.click()}>
              <Upload className="mr-1.5 h-3.5 w-3.5" />
              Installer Module
            </Button>
            <input
              id="module-file-input"
              type="file"
              accept=".zip"
              className="hidden"
              onChange={handleFileSelect}
            />
          </PermissionGuard>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-2 md:grid-cols-4">
        <Card className="p-2">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-blue-500/10">
              <Package className="h-3.5 w-3.5 text-blue-500" />
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground leading-none">Total Modules</p>
              <p className="text-base font-bold leading-none mt-0.5">{stats.total}</p>
            </div>
          </div>
        </Card>
        <Card className="p-2">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-green-500/10">
              <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground leading-none">Actifs</p>
              <p className="text-base font-bold leading-none mt-0.5">{stats.active}</p>
            </div>
          </div>
        </Card>
        <Card className="p-2">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-orange-500/10">
              <XCircle className="h-3.5 w-3.5 text-orange-500" />
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground leading-none">Désactivés</p>
              <p className="text-base font-bold leading-none mt-0.5">{stats.disabled}</p>
            </div>
          </div>
        </Card>
        <Card className="p-2">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-purple-500/10">
              <Settings className="h-3.5 w-3.5 text-purple-500" />
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground leading-none">Système</p>
              <p className="text-base font-bold leading-none mt-0.5">{stats.system}</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Modules Grid */}
      <div className="grid gap-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {modules.length === 0 ? (
          <div className="col-span-full flex flex-col items-center justify-center py-12">
            <Package className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-sm text-muted-foreground">Aucun module installé</p>
            <p className="text-xs text-muted-foreground">Installez votre premier module</p>
          </div>
        ) : (
          modules.map((module) => (
            <Card key={module.id} className="p-2">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="rounded-md bg-primary/10 p-1.5 shrink-0">
                    <Package className="h-3.5 w-3.5 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold truncate leading-none">{module.name}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">v{module.version}</p>
                  </div>
                </div>
                {getStatusBadge(module.status)}
              </div>
              <p className="mt-2 text-[10px] text-muted-foreground line-clamp-2">{module.description}</p>
              {module.category && (
                <div className="mt-1">
                  <Badge variant="secondary" className="h-4 text-[8px]">{module.category}</Badge>
                </div>
              )}
              <div className="mt-2 space-y-0.5 text-[10px] text-muted-foreground">
                {module.installed_at && (
                  <div className="flex justify-between">
                    <span>Installé:</span>
                    <span className="font-medium">{new Date(module.installed_at).toLocaleDateString("fr-FR")}</span>
                  </div>
                )}
                {module.is_system && (
                  <Badge variant="outline" className="h-4 text-[8px] mt-1">Système</Badge>
                )}
                {module.is_required && (
                  <Badge variant="outline" className="h-4 text-[8px] mt-1">Requis</Badge>
                )}
              </div>
              <div className="mt-2 flex gap-1">
                {hasPermission("core.modules", "update") && (
                  <>
                    {module.status === "active" ? (
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 h-6 text-[10px] bg-transparent"
                        onClick={() => handleDeactivate(module.id)}
                        disabled={module.is_required || actioningModuleId === module.id}
                      >
                        {actioningModuleId === module.id ? (
                          <Loader2 className="mr-1 h-2.5 w-2.5 animate-spin" />
                        ) : (
                          <Pause className="mr-1 h-2.5 w-2.5" />
                        )}
                        Désactiver
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        className="flex-1 h-6 text-[10px]"
                        onClick={() => handleActivate(module.id)}
                        disabled={actioningModuleId === module.id}
                      >
                        {actioningModuleId === module.id ? (
                          <Loader2 className="mr-1 h-2.5 w-2.5 animate-spin" />
                        ) : (
                          <Play className="mr-1 h-2.5 w-2.5" />
                        )}
                        Activer
                      </Button>
                    )}
                  </>
                )}
                {hasPermission("core.modules", "delete") && !module.is_system && !module.is_required && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-6 w-6 p-0 bg-transparent"
                    onClick={() => handleUninstall(module.id, module.name)}
                    disabled={actioningModuleId === module.id}
                  >
                    {actioningModuleId === module.id ? (
                      <Loader2 className="h-2.5 w-2.5 animate-spin" />
                    ) : (
                      <Trash2 className="h-2.5 w-2.5" />
                    )}
                  </Button>
                )}
              </div>
            </Card>
          ))
        )}
      </div>

      {/* Upload Dialog */}
      <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">Installer un Module</DialogTitle>
            <DialogDescription className="text-xs">
              Uploadez un fichier ZIP contenant le module et son manifest.json
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Fichier sélectionné</Label>
              <div className="rounded-md border p-2 text-xs">
                {selectedFile ? selectedFile.name : "Aucun fichier"}
              </div>
            </div>
            <div className="rounded-md bg-muted p-2">
              <p className="text-[10px] text-muted-foreground">
                Le fichier ZIP doit contenir:
              </p>
              <ul className="mt-1 text-[10px] text-muted-foreground list-disc list-inside space-y-0.5">
                <li>manifest.json (requis)</li>
                <li>backend/ (optionnel)</li>
                <li>frontend/ (optionnel)</li>
                <li>requirements.txt (optionnel)</li>
              </ul>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setUploadDialogOpen(false)} className="h-8 text-xs" disabled={uploading}>
              Annuler
            </Button>
            <Button size="sm" onClick={handleUpload} className="h-8 text-xs" disabled={!selectedFile || uploading}>
              {uploading ? (
                <>
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  Installation...
                </>
              ) : (
                <>
                  <Upload className="mr-1.5 h-3.5 w-3.5" />
                  Installer
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
