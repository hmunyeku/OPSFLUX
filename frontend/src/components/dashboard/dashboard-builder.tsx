"use client"

import { useState } from "react"
import { DndContext, DragEndEvent, closestCorners, DragOverlay } from "@dnd-kit/core"
import { SortableContext, arrayMove, rectSortingStrategy } from "@dnd-kit/sortable"
import type { Dashboard, DashboardWidgetWithWidget } from "@/types/dashboard"
import { SortableWidget } from "./sortable-widget"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { IconPlus, IconSettings, IconTrash, IconDeviceFloppy, IconX } from "@tabler/icons-react"
import WidgetSidebar from "./widget-sidebar"
import { cn } from "@/lib/utils"

interface DashboardBuilderProps {
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

export function DashboardBuilder({
  dashboard,
  widgets,
  isEditMode,
  onLayoutChange,
  onAddWidget,
  onRemoveWidget,
  onConfigureWidget,
  onSave,
  onCancel,
}: DashboardBuilderProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [activeId, setActiveId] = useState<string | null>(null)

  const handleDragStart = (event: any) => {
    setActiveId(event.active.id)
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event

    if (active.id !== over?.id) {
      const oldIndex = widgets.findIndex((w) => w.id === active.id)
      const newIndex = widgets.findIndex((w) => w.id === over?.id)

      const newWidgets = arrayMove(widgets, oldIndex, newIndex)
      onLayoutChange?.(newWidgets)
    }

    setActiveId(null)
  }

  const getWidgetSize = (widget: DashboardWidgetWithWidget) => {
    const w = widget.w || 4
    const h = widget.h || 2

    // Convert grid units to col-span classes
    let colSpan = "col-span-12"
    if (w <= 3) colSpan = "col-span-12 md:col-span-6 lg:col-span-3"
    else if (w <= 4) colSpan = "col-span-12 md:col-span-6 lg:col-span-4"
    else if (w <= 6) colSpan = "col-span-12 md:col-span-6"
    else if (w <= 8) colSpan = "col-span-12 lg:col-span-8"
    else colSpan = "col-span-12"

    // Height based on h value
    const minHeight = h * 100

    return { colSpan, minHeight }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header with actions */}
      {isEditMode && (
        <div className="flex items-center justify-between gap-4 p-4 border-b bg-muted/30">
          <div className="flex items-center gap-2">
            <IconSettings className="h-5 w-5 text-muted-foreground" />
            <span className="text-sm font-medium">Mode édition</span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSidebarOpen(true)}
            >
              <IconPlus className="h-4 w-4 mr-2" />
              Ajouter un widget
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={onCancel}
            >
              <IconX className="h-4 w-4 mr-2" />
              Annuler
            </Button>
            <Button
              size="sm"
              onClick={onSave}
            >
              <IconDeviceFloppy className="h-4 w-4 mr-2" />
              Sauvegarder
            </Button>
          </div>
        </div>
      )}

      {/* Dashboard grid */}
      <div className="flex-1 overflow-auto p-4 lg:p-6">
        {widgets.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center max-w-md">
              <div className="mx-auto w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center mb-4">
                <IconPlus className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-semibold mb-2">Aucun widget</h3>
              <p className="text-sm text-muted-foreground mb-6">
                Commencez par ajouter des widgets à votre dashboard
              </p>
              {isEditMode && (
                <Button onClick={() => setSidebarOpen(true)}>
                  <IconPlus className="h-4 w-4 mr-2" />
                  Ajouter des widgets
                </Button>
              )}
            </div>
          </div>
        ) : isEditMode ? (
          <DndContext
            collisionDetection={closestCorners}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <SortableContext items={widgets.map((w) => w.id)} strategy={rectSortingStrategy}>
              <div className="grid grid-cols-12 gap-4 lg:gap-6 auto-rows-min">
                {widgets.map((widget) => {
                  const { colSpan, minHeight } = getWidgetSize(widget)
                  return (
                    <SortableWidget
                      key={widget.id}
                      widget={widget}
                      className={colSpan}
                      style={{ minHeight: `${minHeight}px` }}
                      isEditMode={isEditMode}
                      onRemove={onRemoveWidget}
                      onConfigure={onConfigureWidget}
                    />
                  )
                })}
              </div>
            </SortableContext>

            <DragOverlay>
              {activeId ? (
                <div className="bg-card rounded-xl border-2 border-primary opacity-50 p-6">
                  <div className="text-sm font-medium">Déplacement...</div>
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        ) : (
          <div className="grid grid-cols-12 gap-4 lg:gap-6 auto-rows-min">
            {widgets.map((widget) => {
              const { colSpan, minHeight } = getWidgetSize(widget)
              return (
                <SortableWidget
                  key={widget.id}
                  widget={widget}
                  className={colSpan}
                  style={{ minHeight: `${minHeight}px` }}
                  isEditMode={false}
                />
              )
            })}
          </div>
        )}
      </div>

      {/* Widget sidebar */}
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
    </div>
  )
}
