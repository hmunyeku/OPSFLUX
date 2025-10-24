"use client"

import { useState, useCallback, useRef, useEffect } from "react"
import { Responsive, WidthProvider, Layout } from "react-grid-layout"
import "react-grid-layout/css/styles.css"
import "react-resizable/css/styles.css"
import type { Dashboard, DashboardWidgetWithWidget } from "@/types/dashboard"
import WidgetWrapper from "@/widgets/base/widget-wrapper"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import {
  IconPlus,
  IconDeviceFloppy,
  IconX,
  IconLock,
  IconLockOpen,
  IconMaximize,
  IconMinimize,
} from "@tabler/icons-react"
import WidgetSidebar from "./widget-sidebar"
import { cn } from "@/lib/utils"
import { useToast } from "@/hooks/use-toast"

const ResponsiveGridLayout = WidthProvider(Responsive)

interface DashboardBuilderV2Props {
  dashboard: Dashboard
  widgets: DashboardWidgetWithWidget[]
  isEditMode: boolean
  onLayoutChange?: (widgets: DashboardWidgetWithWidget[]) => void
  onAddWidget?: (widgetType: string) => void
  onRemoveWidget?: (widgetId: string) => void
  onConfigureWidget?: (widget: DashboardWidgetWithWidget) => void
  onSave?: () => void
  onCancel?: () => void
}

export function DashboardBuilderV2({
  dashboard,
  widgets,
  isEditMode,
  onLayoutChange,
  onAddWidget,
  onRemoveWidget,
  onConfigureWidget,
  onSave,
  onCancel,
}: DashboardBuilderV2Props) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [lockedWidgets, setLockedWidgets] = useState<Set<string>>(new Set())
  const [fullscreenWidget, setFullscreenWidget] = useState<string | null>(null)
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const { toast } = useToast()
  const layoutRef = useRef<Layout[]>([])

  // Convert widgets to GridLayout format
  const getLayout = (): Layout[] => {
    return widgets.map((widget) => ({
      i: String(widget.id),
      x: widget.x || 0,
      y: widget.y || 0,
      w: widget.w || 4,
      h: widget.h || 2,
      minW: widget.widget?.default_size?.minW || 2,
      minH: widget.widget?.default_size?.minH || 2,
      maxW: widget.widget?.default_size?.maxW || 12,
      maxH: widget.widget?.default_size?.maxH || 10,
      static: lockedWidgets.has(String(widget.id)) || !isEditMode,
    }))
  }

  // Layouts pour les différentes breakpoints
  const layouts = {
    lg: getLayout(),
    md: getLayout(),
    sm: getLayout(),
    xs: getLayout(),
  }

  const handleLayoutChange = useCallback(
    (newLayout: Layout[]) => {
      if (!isEditMode) return

      // Stocker le layout actuel
      layoutRef.current = newLayout

      // Convertir le layout en widgets mis à jour
      const updatedWidgets = widgets.map((widget) => {
        const layoutItem = newLayout.find((item) => item.i === String(widget.id))
        if (!layoutItem) return widget

        return {
          ...widget,
          x: layoutItem.x,
          y: layoutItem.y,
          w: layoutItem.w,
          h: layoutItem.h,
        }
      })

      setHasUnsavedChanges(true)
      onLayoutChange?.(updatedWidgets)
    },
    [widgets, isEditMode, onLayoutChange]
  )

  const toggleLock = (widgetId: string) => {
    setLockedWidgets((prev) => {
      const newSet = new Set(prev)
      if (newSet.has(widgetId)) {
        newSet.delete(widgetId)
        toast({
          title: "Widget déverrouillé",
          description: "Vous pouvez maintenant déplacer et redimensionner ce widget",
        })
      } else {
        newSet.add(widgetId)
        toast({
          title: "Widget verrouillé",
          description: "Ce widget ne peut plus être déplacé ou redimensionné",
        })
      }
      return newSet
    })
  }

  const duplicateWidget = async (widget: DashboardWidgetWithWidget) => {
    if (!onAddWidget || !widget.widget) return

    // Trouver une position libre
    const maxY = widgets.reduce((max, w) => Math.max(max, w.y + w.h), 0)

    toast({
      title: "Widget dupliqué",
      description: "Le widget a été ajouté en bas du dashboard",
    })

    // Ajouter le widget à la nouvelle position
    // Note: Cette fonctionnalité nécessite l'appui du backend pour vraiment dupliquer
    // Pour l'instant, on appelle onAddWidget avec le même type
    onAddWidget(widget.widget_id)
  }

  const toggleFullscreen = (widgetId: string) => {
    if (fullscreenWidget === widgetId) {
      setFullscreenWidget(null)
    } else {
      setFullscreenWidget(widgetId)
    }
  }

  const handleSave = () => {
    setHasUnsavedChanges(false)
    onSave?.()
  }

  const handleCancel = () => {
    setHasUnsavedChanges(false)
    onCancel?.()
  }

  // Auto-save periodique (toutes les 30 secondes si modifications)
  useEffect(() => {
    if (!hasUnsavedChanges || !isEditMode) return

    const autoSaveTimer = setTimeout(() => {
      handleSave()
      toast({
        title: "Sauvegarde automatique",
        description: "Vos modifications ont été sauvegardées automatiquement",
      })
    }, 30000)

    return () => clearTimeout(autoSaveTimer)
  }, [hasUnsavedChanges, isEditMode])

  // Fullscreen widget view
  if (fullscreenWidget) {
    const widget = widgets.find((w) => String(w.id) === fullscreenWidget)
    if (widget) {
      return (
        <div className="fixed inset-0 z-50 bg-background">
          <div className="h-full flex flex-col">
            <div className="flex-none border-b p-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">{widget.widget?.name || "Widget"}</h2>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setFullscreenWidget(null)}
              >
                <IconMinimize className="h-4 w-4 mr-2" />
                Quitter le plein écran
              </Button>
            </div>
            <div className="flex-1 p-6 overflow-auto">
              <WidgetWrapper
                dashboardWidget={widget}
                isEditMode={false}
              />
            </div>
          </div>
        </div>
      )
    }
  }

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Edit Mode Toolbar - Professional Style */}
      {isEditMode && (
        <div className="flex-none border-b bg-gradient-to-r from-amber-500/5 via-orange-500/5 to-amber-500/5 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div className="container mx-auto px-4 lg:px-6 py-3">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <div className="relative flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500"></span>
                  </div>
                  <span className="font-semibold text-sm">Mode édition</span>
                </div>
                {hasUnsavedChanges && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 px-2.5 py-1 rounded-md border">
                    <IconDeviceFloppy className="h-3 w-3" />
                    <span>Modifications non sauvegardées</span>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSidebarOpen(true)}
                  className="gap-1.5"
                >
                  <IconPlus className="h-4 w-4" />
                  <span className="hidden sm:inline">Ajouter widget</span>
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleCancel}
                  className="gap-1.5"
                >
                  <IconX className="h-4 w-4" />
                  <span className="hidden sm:inline">Annuler</span>
                </Button>
                <Button
                  size="sm"
                  onClick={handleSave}
                  disabled={!hasUnsavedChanges}
                  className="gap-1.5 bg-amber-600 hover:bg-amber-700"
                >
                  <IconDeviceFloppy className="h-4 w-4" />
                  <span className="hidden sm:inline">Sauvegarder</span>
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Dashboard Grid - Full Width Professional Layout */}
      <div className="flex-1 overflow-auto bg-muted/10">
        <div className="container mx-auto h-full py-4 lg:py-6 px-4 lg:px-6">
          {widgets.length === 0 ? (
            <div className="flex items-center justify-center h-full min-h-[500px]">
              <div className="text-center max-w-md space-y-4">
                <div className="mx-auto w-20 h-20 rounded-2xl bg-gradient-to-br from-muted to-muted/50 flex items-center justify-center border-2 border-dashed border-muted-foreground/20 mb-6">
                  <IconPlus className="h-10 w-10 text-muted-foreground/50" />
                </div>
                <div className="space-y-2">
                  <h3 className="text-xl font-semibold tracking-tight">Dashboard vide</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    Commencez par ajouter des widgets pour créer un tableau de bord personnalisé et visualiser vos données en temps réel.
                  </p>
                </div>
                {isEditMode && (
                  <Button onClick={() => setSidebarOpen(true)} className="mt-6" size="lg">
                    <IconPlus className="h-5 w-5 mr-2" />
                    Ajouter des widgets
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <div className="w-full h-full">
              <ResponsiveGridLayout
                className="layout"
                layouts={layouts}
                breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480 }}
                cols={{ lg: 12, md: 10, sm: 6, xs: 4 }}
                rowHeight={dashboard.layout_config?.cellHeight || 100}
                margin={[16, 16]}
                containerPadding={[0, 0]}
                isDraggable={isEditMode}
                isResizable={isEditMode}
                compactType="vertical"
                preventCollision={false}
                onLayoutChange={handleLayoutChange}
                draggableHandle=".widget-drag-handle"
                autoSize={true}
              >
                {widgets.map((widget) => (
                  <div
                    key={widget.id}
                    className={cn(
                      "relative group",
                      isEditMode && "transition-all duration-200 hover:shadow-xl hover:scale-[1.02] hover:z-10"
                    )}
                  >
                    {/* Widget Controls (Edit Mode) */}
                    {isEditMode && (
                      <div className="absolute -top-11 left-0 right-0 flex items-center justify-between gap-2 opacity-0 group-hover:opacity-100 transition-all duration-200 z-20 px-2">
                        <div className="widget-drag-handle cursor-move bg-primary hover:bg-primary/90 text-primary-foreground px-3 py-1.5 rounded-lg text-xs font-medium shadow-lg backdrop-blur-sm border border-primary/20 flex items-center gap-1.5">
                          <IconLockOpen className="h-3.5 w-3.5" />
                          <span>Déplacer</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => toggleLock(String(widget.id))}
                            className="h-8 w-8 p-0 shadow-lg border"
                            title={lockedWidgets.has(String(widget.id)) ? "Déverrouiller" : "Verrouiller"}
                          >
                            {lockedWidgets.has(String(widget.id)) ? (
                              <IconLock className="h-4 w-4" />
                            ) : (
                              <IconLockOpen className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                      </div>
                    )}

                    {/* Widget Content */}
                    <div className="h-full w-full">
                      <WidgetWrapper
                        dashboardWidget={widget}
                        isEditMode={isEditMode}
                        onRemove={onRemoveWidget}
                        onConfigure={onConfigureWidget}
                        onDuplicate={() => duplicateWidget(widget)}
                        onFullscreen={() => toggleFullscreen(String(widget.id))}
                      />
                    </div>
                  </div>
                ))}
              </ResponsiveGridLayout>
            </div>
          )}
        </div>
      </div>

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
            <WidgetSidebar
              onAddWidget={(widgetType) => {
                onAddWidget?.(widgetType)
                setSidebarOpen(false)
              }}
            />
          </div>
        </SheetContent>
      </Sheet>

      {/* Styles pour react-grid-layout - Professional */}
      <style jsx global>{`
        .react-grid-layout {
          position: relative;
          width: 100% !important;
          min-height: 100%;
        }

        .react-grid-item {
          transition: all 250ms cubic-bezier(0.4, 0, 0.2, 1);
          transition-property: left, top, width, height;
        }

        .react-grid-item.cssTransforms {
          transition-property: transform, width, height;
        }

        .react-grid-item.resizing {
          transition: none;
          z-index: 100;
          will-change: width, height;
          box-shadow: 0 10px 40px rgba(0, 0, 0, 0.15);
        }

        .react-grid-item.react-draggable-dragging {
          transition: none;
          z-index: 100;
          will-change: transform;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.2);
          opacity: 0.9;
        }

        .react-grid-item.dropping {
          visibility: hidden;
        }

        .react-grid-item.react-grid-placeholder {
          background: linear-gradient(135deg, hsl(var(--primary) / 0.08) 0%, hsl(var(--primary) / 0.15) 100%);
          opacity: 1;
          transition-duration: 150ms;
          z-index: 2;
          border-radius: 0.75rem;
          border: 2px dashed hsl(var(--primary) / 0.5);
          backdrop-filter: blur(4px);
          animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
        }

        @keyframes pulse {
          0%, 100% {
            opacity: 1;
          }
          50% {
            opacity: 0.7;
          }
        }

        .react-grid-item > .react-resizable-handle {
          position: absolute;
          width: 28px;
          height: 28px;
          z-index: 10;
        }

        .react-grid-item > .react-resizable-handle::after {
          content: "";
          position: absolute;
          right: 6px;
          bottom: 6px;
          width: 12px;
          height: 12px;
          border-right: 3px solid hsl(var(--primary));
          border-bottom: 3px solid hsl(var(--primary));
          opacity: 0.3;
          transition: all 200ms cubic-bezier(0.4, 0, 0.2, 1);
          border-radius: 0 0 2px 0;
        }

        .react-grid-item:hover > .react-resizable-handle::after {
          opacity: 0.8;
          width: 14px;
          height: 14px;
          right: 5px;
          bottom: 5px;
        }

        .react-grid-item.resizing > .react-resizable-handle::after {
          opacity: 1;
          border-color: hsl(var(--primary));
          box-shadow: 0 0 8px hsl(var(--primary) / 0.3);
        }

        .react-grid-item > .react-resizable-handle.react-resizable-handle-se {
          bottom: 0;
          right: 0;
          cursor: se-resize;
        }

        /* Improved scrollbar styling */
        .react-grid-layout::-webkit-scrollbar {
          width: 8px;
          height: 8px;
        }

        .react-grid-layout::-webkit-scrollbar-track {
          background: transparent;
        }

        .react-grid-layout::-webkit-scrollbar-thumb {
          background: hsl(var(--muted-foreground) / 0.2);
          border-radius: 4px;
        }

        .react-grid-layout::-webkit-scrollbar-thumb:hover {
          background: hsl(var(--muted-foreground) / 0.3);
        }
      `}</style>
    </div>
  )
}
