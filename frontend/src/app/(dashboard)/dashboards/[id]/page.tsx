"use client"

import { useState, useEffect, useCallback } from "react"
import { useParams, useRouter } from "next/navigation"
import { auth } from "@/lib/auth"
import { useAuth } from "@/hooks/use-auth"
import { Header } from "@/components/layout/header"
import { Button } from "@/components/ui/button"
import {
  IconEdit,
  IconDeviceFloppy,
  IconX,
  IconSettings,
  IconTrash,
  IconCopy,
  IconArrowLeft,
  IconLayoutGrid,
  IconPlus,
  IconLock,
  IconWorld,
  IconSparkles,
  IconDownload,
  IconUpload,
} from "@tabler/icons-react"
import { DashboardBuilderV2 } from "@/components/dashboard/dashboard-builder-v2"
import WidgetConfigDialog from "@/components/dashboard/widget-config-dialog"
import {
  getDashboard,
  updateDashboardLayout,
  deleteDashboard,
  cloneDashboard,
  addWidgetToDashboard,
  updateWidgetConfig,
  downloadDashboardJSON,
  getWidgets,
} from "@/lib/api/dashboards"
import type { Dashboard, DashboardWidgetWithWidget } from "@/types/dashboard"
import { useToast } from "@/hooks/use-toast"
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
import { getWidgetMeta } from "@/widgets/registry"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { updateDashboard } from "@/lib/api/dashboards"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

export default function DashboardViewPageNew() {
  const params = useParams()
  const router = useRouter()
  const { toast } = useToast()
  const { user } = useAuth()
  const dashboardId = params.id as string

  const [dashboard, setDashboard] = useState<Dashboard | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isEditMode, setIsEditMode] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [pendingChanges, setPendingChanges] = useState(false)
  const [configDialogOpen, setConfigDialogOpen] = useState(false)
  const [widgetToConfig, setWidgetToConfig] = useState<DashboardWidgetWithWidget | null>(null)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [editName, setEditName] = useState("")
  const [editDescription, setEditDescription] = useState("")
  const [isSavingEdit, setIsSavingEdit] = useState(false)

  // Fetch dashboard
  useEffect(() => {
    const token = auth.getToken()
    if (!token || !dashboardId) return

    const fetchDashboard = async () => {
      setIsLoading(true)
      try {
        const data = await getDashboard(token, dashboardId)
        setDashboard(data)
      } catch (error) {
        console.error("Failed to fetch dashboard:", error)
        toast({
          title: "Erreur",
          description: "Impossible de charger le dashboard",
          variant: "destructive",
        })
      } finally {
        setIsLoading(false)
      }
    }

    fetchDashboard()
  }, [dashboardId, toast])

  // Handle layout changes
  const handleLayoutChange = useCallback(
    (updatedWidgets: DashboardWidgetWithWidget[]) => {
      setPendingChanges(true)
      if (dashboard) {
        setDashboard({
          ...dashboard,
          widgets: updatedWidgets,
        })
      }
    },
    [dashboard]
  )

  // Save layout
  const handleSave = async () => {
    const token = auth.getToken()
    if (!token || !dashboard) return

    setIsSaving(true)
    try {
      const layoutUpdate = {
        widgets: (dashboard.widgets || []).map((w) => ({
          id: w.id,
          x: w.x,
          y: w.y,
          w: w.w,
          h: w.h,
        })),
      }

      await updateDashboardLayout(token, dashboardId, layoutUpdate)

      toast({
        title: "Sauvegardé",
        description: "Le layout du dashboard a été sauvegardé",
      })
      setPendingChanges(false)
      setIsEditMode(false)
    } catch (error) {
      console.error("Failed to save layout:", error)
      toast({
        title: "Erreur",
        description: "Impossible de sauvegarder le layout",
        variant: "destructive",
      })
    } finally {
      setIsSaving(false)
    }
  }

  // Cancel edit
  const handleCancel = () => {
    if (pendingChanges) {
      const token = auth.getToken()
      if (token) {
        getDashboard(token, dashboardId).then((data) => {
          setDashboard(data)
          setPendingChanges(false)
          setIsEditMode(false)
        })
      }
    } else {
      setIsEditMode(false)
    }
  }

  // Clone dashboard
  const handleClone = async () => {
    const token = auth.getToken()
    if (!token || !dashboard) return

    try {
      const clonedName = `${dashboard.name} (Copie)`
      const cloned = await cloneDashboard(
        token,
        dashboardId,
        clonedName
      )

      toast({
        title: "Dashboard cloné",
        description: `Le dashboard "${clonedName}" a été créé`,
      })

      router.push(`/dashboards/${cloned.id}`)
    } catch (error) {
      console.error("Failed to clone dashboard:", error)
      toast({
        title: "Erreur",
        description: "Impossible de cloner le dashboard",
        variant: "destructive",
      })
    }
  }

  // Export dashboard to JSON
  const handleExport = () => {
    if (!dashboard) return

    try {
      downloadDashboardJSON(dashboard)
      toast({
        title: "Dashboard exporté",
        description: "Le dashboard a été exporté en JSON",
      })
    } catch (error) {
      console.error("Failed to export dashboard:", error)
      toast({
        title: "Erreur",
        description: "Impossible d'exporter le dashboard",
        variant: "destructive",
      })
    }
  }

  // Delete dashboard
  const handleDelete = async () => {
    const token = auth.getToken()
    if (!token) return

    try {
      await deleteDashboard(token, dashboardId)

      toast({
        title: "Dashboard supprimé",
        description: "Le dashboard a été supprimé avec succès",
      })

      router.push("/dashboards")
    } catch (error) {
      console.error("Failed to delete dashboard:", error)
      toast({
        title: "Erreur",
        description: "Impossible de supprimer le dashboard",
        variant: "destructive",
      })
    }
  }

  // Add widget to dashboard
  const handleAddWidget = async (widgetType: string) => {
    const token = auth.getToken()
    if (!token || !dashboard) return

    const meta = getWidgetMeta(widgetType)
    if (!meta) {
      toast({
        title: "Erreur",
        description: "Widget non trouvé",
        variant: "destructive",
      })
      return
    }

    try {
      // Fetch all widgets to find the widget ID by type
      const widgetsResponse = await getWidgets(token, { is_active: true })
      const widget = widgetsResponse.data.find(w => w.widget_type === widgetType)

      if (!widget) {
        toast({
          title: "Erreur",
          description: `Widget de type "${widgetType}" non trouvé dans la base de données`,
          variant: "destructive",
        })
        return
      }

      // Find next available position
      const existingWidgets = dashboard.widgets || []
      const maxY = existingWidgets.length > 0
        ? Math.max(...existingWidgets.map(w => w.y + w.h))
        : 0

      await addWidgetToDashboard(token, dashboardId, {
        widget_id: widget.id,
        x: 0,
        y: maxY,
        w: meta.defaultSize.w,
        h: meta.defaultSize.h,
        config: meta.defaultConfig,
      })

      // Reload dashboard
      const updated = await getDashboard(token, dashboardId)
      setDashboard(updated)

      toast({
        title: "Widget ajouté",
        description: `Le widget "${meta.name}" a été ajouté au dashboard`,
      })
    } catch (error) {
      console.error("Failed to add widget:", error)
      toast({
        title: "Erreur",
        description: "Impossible d'ajouter le widget",
        variant: "destructive",
      })
    }
  }

  // Handle widget configuration
  const handleConfigureWidget = (widget: DashboardWidgetWithWidget) => {
    setWidgetToConfig(widget)
    setConfigDialogOpen(true)
  }

  // Handle edit dashboard info
  const handleOpenEditDialog = () => {
    setEditName(dashboard?.name || "")
    setEditDescription(dashboard?.description || "")
    setEditDialogOpen(true)
  }

  const handleSaveDashboardInfo = async () => {
    const token = auth.getToken()
    if (!token || !dashboard) return

    setIsSavingEdit(true)
    try {
      const updated = await updateDashboard(token, dashboardId, {
        name: editName,
        description: editDescription,
      })

      setDashboard(updated)
      setEditDialogOpen(false)

      toast({
        title: "Dashboard mis à jour",
        description: "Les informations du dashboard ont été mises à jour",
      })
    } catch (error) {
      console.error("Failed to update dashboard:", error)
      toast({
        title: "Erreur",
        description: "Impossible de mettre à jour le dashboard",
        variant: "destructive",
      })
    } finally {
      setIsSavingEdit(false)
    }
  }

  const handleSaveWidgetConfig = async (widgetId: number, config: Record<string, any>) => {
    const token = auth.getToken()
    if (!token) return

    try {
      await updateWidgetConfig(token, dashboardId, widgetId, config)

      // Reload dashboard
      const updated = await getDashboard(token, dashboardId)
      setDashboard(updated)

      toast({
        title: "Configuration mise à jour",
        description: "La configuration du widget a été mise à jour",
      })
    } catch (error) {
      console.error("Failed to update widget config:", error)
      toast({
        title: "Erreur",
        description: "Impossible de mettre à jour la configuration",
        variant: "destructive",
      })
    }
  }

  if (isLoading) {
    return (
      <>
        <Header />
        <div className="container py-8 space-y-6">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-96 w-full" />
        </div>
      </>
    )
  }

  if (!dashboard) {
    return (
      <>
        <Header />
        <div className="flex flex-col items-center justify-center h-[50vh] gap-4">
          <p className="text-destructive">Dashboard non trouvé</p>
          <Button onClick={() => router.push("/dashboards")}>
            <IconArrowLeft className="h-4 w-4 mr-2" />
            Retour aux dashboards
          </Button>
        </div>
      </>
    )
  }

  // L'utilisateur peut éditer si:
  // 1. Ce n'est pas un dashboard obligatoire (is_mandatory)
  // 2. ET l'utilisateur est le créateur du dashboard
  const canEdit = !dashboard.is_mandatory && user && dashboard.created_by_id === user.id
  const hasWidgets = (dashboard.widgets || []).length > 0
  const widgetCount = dashboard.widgets?.length || 0

  return (
    <>
      <Header />
      <div className="flex flex-col h-[calc(100vh-4rem)] bg-background">
        {/* Dashboard Header Bar - Compact Style */}
        <div className="flex-none border-b bg-card/80 backdrop-blur-sm supports-[backdrop-filter]:bg-card/60">
          <div className="container mx-auto px-4 lg:px-6 py-2.5">
            <div className="flex items-center justify-between gap-4">
              {/* Left: Breadcrumb + Title */}
              <div className="flex items-center gap-2 min-w-0 flex-1 group">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => router.push("/dashboards")}
                  className="shrink-0 h-8 w-8 p-0"
                >
                  <IconArrowLeft className="h-4 w-4" />
                </Button>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h1 className="text-lg font-bold tracking-tight truncate">{dashboard.name}</h1>
                    {canEdit && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleOpenEditDialog}
                        className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 hover:bg-muted transition-opacity"
                        title="Modifier le titre et la description"
                      >
                        <IconEdit className="h-3 w-3" />
                      </Button>
                    )}
                    {dashboard.is_mandatory && (
                      <Badge variant="secondary" className="shrink-0 gap-1 h-5 px-1.5">
                        <IconLock className="h-3 w-3" />
                        <span className="text-xs">Système</span>
                      </Badge>
                    )}
                    {dashboard.is_public && (
                      <Badge variant="outline" className="shrink-0 gap-1 h-5 px-1.5">
                        <IconWorld className="h-3 w-3" />
                        <span className="text-xs">Public</span>
                      </Badge>
                    )}
                    <span className="flex items-center gap-1 text-xs text-muted-foreground ml-1">
                      <IconLayoutGrid className="h-3 w-3" />
                      {widgetCount}
                    </span>
                    {dashboard.description && (
                      <>
                        <span className="text-muted-foreground/50 text-xs">•</span>
                        <span className="truncate max-w-md text-xs text-muted-foreground">{dashboard.description}</span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Right: Actions */}
              {!isEditMode && (
                <div className="flex items-center gap-1 shrink-0">
                  <Button variant="ghost" size="sm" onClick={handleExport} className="gap-1.5 h-8 px-3 text-xs">
                    <IconDownload className="h-4 w-4" />
                    <span className="hidden lg:inline">Exporter</span>
                  </Button>
                  <Button variant="ghost" size="sm" onClick={handleClone} className="gap-1.5 h-8 px-3 text-xs">
                    <IconCopy className="h-4 w-4" />
                    <span className="hidden lg:inline">Dupliquer</span>
                  </Button>
                  {canEdit && (
                    <>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" className="gap-1.5 h-8 px-3 text-xs">
                            <IconSettings className="h-4 w-4" />
                            <span className="hidden lg:inline">Modifier</span>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={handleOpenEditDialog}>
                            <IconEdit className="h-4 w-4 mr-2" />
                            Titre et description
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setIsEditMode(true)}>
                            <IconLayoutGrid className="h-4 w-4 mr-2" />
                            Layout des widgets
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowDeleteDialog(true)}
                        className="gap-1.5 h-8 px-3 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                      >
                        <IconTrash className="h-4 w-4" />
                        <span className="hidden lg:inline">Supprimer</span>
                      </Button>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Dashboard Content - Full Height & Width */}
        <div className="flex-1 overflow-hidden">
          <DashboardBuilderV2
            dashboard={dashboard}
            widgets={dashboard.widgets || []}
            isEditMode={isEditMode}
            onLayoutChange={handleLayoutChange}
            onAddWidget={handleAddWidget}
            onRemoveWidget={(widgetId) => {
              // TODO: Implement remove widget API call
              console.log("Remove widget:", widgetId)
            }}
            onConfigureWidget={handleConfigureWidget}
            onSave={handleSave}
            onCancel={handleCancel}
          />
        </div>
      </div>

      {/* Delete Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer le dashboard ?</AlertDialogTitle>
            <AlertDialogDescription>
              Cette action est irréversible. Le dashboard "{dashboard.name}" et tous
              ses widgets seront définitivement supprimés.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive">
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Edit Dashboard Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Modifier le dashboard</DialogTitle>
            <DialogDescription>
              Modifiez le titre et la description de votre dashboard.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Titre</Label>
              <Input
                id="edit-name"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="Entrez un titre..."
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-description">Description</Label>
              <Textarea
                id="edit-description"
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                placeholder="Entrez une description..."
                rows={4}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditDialogOpen(false)}
              disabled={isSavingEdit}
            >
              Annuler
            </Button>
            <Button
              onClick={handleSaveDashboardInfo}
              disabled={isSavingEdit || !editName.trim()}
            >
              {isSavingEdit ? (
                <>
                  <IconDeviceFloppy className="h-4 w-4 mr-2 animate-spin" />
                  Enregistrement...
                </>
              ) : (
                <>
                  <IconDeviceFloppy className="h-4 w-4 mr-2" />
                  Enregistrer
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Widget Configuration Dialog */}
      <WidgetConfigDialog
        dashboardWidget={widgetToConfig}
        open={configDialogOpen}
        onOpenChange={setConfigDialogOpen}
        onSave={handleSaveWidgetConfig}
      />
    </>
  )
}
