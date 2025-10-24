"use client"

import { useState, useEffect, useCallback } from "react"
import { useParams, useRouter } from "next/navigation"
import { auth } from "@/lib/auth"
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

export default function DashboardViewPageNew() {
  const params = useParams()
  const router = useRouter()
  const { toast } = useToast()
  const dashboardId = params.id as string

  const [dashboard, setDashboard] = useState<Dashboard | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isEditMode, setIsEditMode] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [pendingChanges, setPendingChanges] = useState(false)
  const [configDialogOpen, setConfigDialogOpen] = useState(false)
  const [widgetToConfig, setWidgetToConfig] = useState<DashboardWidgetWithWidget | null>(null)

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
      // Find next available position
      const existingWidgets = dashboard.widgets || []
      const maxY = existingWidgets.length > 0
        ? Math.max(...existingWidgets.map(w => w.y + w.h))
        : 0

      await addWidgetToDashboard(token, dashboardId, {
        widget_id: widgetType,
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

  const canEdit = !dashboard.is_mandatory
  const hasWidgets = (dashboard.widgets || []).length > 0
  const widgetCount = dashboard.widgets?.length || 0

  return (
    <>
      <Header />
      <div className="flex flex-col h-[calc(100vh-4rem)] bg-background">
        {/* Dashboard Header Bar - Professional Style */}
        <div className="flex-none border-b bg-card/80 backdrop-blur-sm supports-[backdrop-filter]:bg-card/60">
          <div className="container mx-auto px-4 lg:px-6 py-4">
            <div className="flex items-center justify-between gap-4">
              {/* Left: Breadcrumb + Title */}
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => router.push("/dashboards")}
                  className="shrink-0 h-9 w-9 p-0"
                >
                  <IconArrowLeft className="h-4 w-4" />
                </Button>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h1 className="text-xl font-bold tracking-tight truncate">{dashboard.name}</h1>
                    {dashboard.is_mandatory && (
                      <Badge variant="secondary" className="shrink-0 gap-1">
                        <IconLock className="h-3 w-3" />
                        <span className="text-xs">Système</span>
                      </Badge>
                    )}
                    {dashboard.is_public && (
                      <Badge variant="outline" className="shrink-0 gap-1">
                        <IconWorld className="h-3 w-3" />
                        <span className="text-xs">Public</span>
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1.5 font-medium">
                      <IconLayoutGrid className="h-3.5 w-3.5" />
                      {widgetCount} widget{widgetCount > 1 ? "s" : ""}
                    </span>
                    {dashboard.description && (
                      <>
                        <span className="text-muted-foreground/50">•</span>
                        <span className="truncate max-w-md">{dashboard.description}</span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Right: Actions */}
              {!isEditMode && (
                <div className="flex items-center gap-2 shrink-0">
                  <Button variant="ghost" size="sm" onClick={handleExport} className="gap-1.5">
                    <IconDownload className="h-4 w-4" />
                    <span className="hidden lg:inline">Exporter</span>
                  </Button>
                  <Button variant="ghost" size="sm" onClick={handleClone} className="gap-1.5">
                    <IconCopy className="h-4 w-4" />
                    <span className="hidden lg:inline">Dupliquer</span>
                  </Button>
                  {canEdit && (
                    <>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowDeleteDialog(true)}
                        className="gap-1.5 text-destructive hover:text-destructive hover:bg-destructive/10"
                      >
                        <IconTrash className="h-4 w-4" />
                        <span className="hidden lg:inline">Supprimer</span>
                      </Button>
                      <Button onClick={() => setIsEditMode(true)} size="sm" className="gap-1.5">
                        <IconEdit className="h-4 w-4" />
                        <span className="hidden sm:inline">Éditer le dashboard</span>
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
