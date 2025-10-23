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
} from "@tabler/icons-react"
import DashboardGrid from "@/components/dashboard/dashboard-grid"
import EditToolbar from "@/components/dashboard/edit-toolbar"
import WidgetSidebar from "@/components/dashboard/widget-sidebar"
import WidgetConfigDialog from "@/components/dashboard/widget-config-dialog"
import {
  getDashboard,
  updateDashboardLayout,
  deleteDashboard,
  cloneDashboard,
  addWidgetToDashboard,
  updateWidgetConfig,
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { getWidgetMeta } from "@/widgets/registry"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { motion, AnimatePresence } from "framer-motion"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"

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
  const [sidebarOpen, setSidebarOpen] = useState(false)
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

      setSidebarOpen(false)
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
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
        <div className="container py-6 space-y-6">
          {/* Breadcrumb */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3 }}
          >
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem>
                  <BreadcrumbLink href="/dashboards">Dashboards</BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbPage>{dashboard.name}</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </motion.div>

          {/* Header */}
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary/10 via-purple-500/5 to-blue-500/5 p-6 border backdrop-blur-sm"
          >
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_50%,rgba(120,119,198,0.1),rgba(255,255,255,0))]" />

            <div className="relative flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-start gap-4 flex-1 min-w-0">
                <div className="p-3 rounded-xl bg-primary/10 backdrop-blur-sm">
                  <IconSparkles className="h-8 w-8 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-2">
                    <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">{dashboard.name}</h1>
                    {dashboard.is_mandatory && (
                      <Badge variant="secondary">
                        <IconLock className="h-3 w-3 mr-1" />
                        Obligatoire
                      </Badge>
                    )}
                    {dashboard.is_public && (
                      <Badge variant="outline">
                        <IconWorld className="h-3 w-3 mr-1" />
                        Public
                      </Badge>
                    )}
                  </div>
                  {dashboard.description && (
                    <p className="text-muted-foreground">{dashboard.description}</p>
                  )}
                  <div className="flex items-center gap-4 mt-3 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      <IconLayoutGrid className="h-4 w-4" />
                      <span className="font-medium">{widgetCount}</span> widget{widgetCount > 1 ? "s" : ""}
                    </span>
                  </div>
                </div>
              </div>

              {!isEditMode && (
                <div className="flex items-center gap-2 flex-shrink-0">
                  <Button variant="outline" size="icon" onClick={handleClone}>
                    <IconCopy className="h-4 w-4" />
                  </Button>
                  {canEdit && (
                    <>
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => setShowDeleteDialog(true)}
                      >
                        <IconTrash className="h-4 w-4" />
                      </Button>
                      <Button onClick={() => setIsEditMode(true)} className="gap-2">
                        <IconEdit className="h-4 w-4" />
                        <span className="hidden sm:inline">Éditer</span>
                      </Button>
                    </>
                  )}
                </div>
              )}
            </div>
          </motion.div>

          {/* Dashboard Content */}
          <AnimatePresence mode="wait">
            {hasWidgets ? (
              <motion.div
                key="dashboard-grid"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.3 }}
              >
                <DashboardGrid
                  dashboard={dashboard}
                  widgets={dashboard.widgets || []}
                  isEditMode={isEditMode}
                  onLayoutChange={handleLayoutChange}
                  onConfigureWidget={handleConfigureWidget}
                />
              </motion.div>
            ) : (
              <motion.div
                key="empty-state"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.3 }}
                className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed py-16 bg-gradient-to-br from-muted/30 to-muted/10"
              >
                <div className="p-4 rounded-full bg-muted mb-4">
                  <IconLayoutGrid className="h-8 w-8 text-muted-foreground" />
                </div>
                <p className="text-lg font-medium mb-2">Ce dashboard est vide</p>
                <p className="text-muted-foreground mb-6">Commencez par ajouter des widgets</p>
                {canEdit && (
                  <Button onClick={() => {
                    setIsEditMode(true)
                    setSidebarOpen(true)
                  }} size="lg" className="gap-2">
                    <IconPlus className="h-5 w-5" />
                    Ajouter des widgets
                  </Button>
                )}
              </motion.div>
            )}
          </AnimatePresence>
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

      {/* Widget Sidebar */}
      <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
        <SheetContent className="w-[400px] sm:w-[540px]">
          <SheetHeader>
            <SheetTitle>Ajouter un widget</SheetTitle>
            <SheetDescription>
              Sélectionnez un widget à ajouter à votre dashboard
            </SheetDescription>
          </SheetHeader>
          <div className="mt-6">
            <WidgetSidebar onAddWidget={handleAddWidget} />
          </div>
        </SheetContent>
      </Sheet>

      {/* Edit Toolbar */}
      {isEditMode && (
        <EditToolbar
          hasUnsavedChanges={pendingChanges}
          isSaving={isSaving}
          onSave={handleSave}
          onCancel={handleCancel}
          onAddWidget={() => setSidebarOpen(true)}
        />
      )}

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
