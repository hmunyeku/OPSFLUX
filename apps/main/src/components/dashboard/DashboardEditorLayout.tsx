/**
 * DashboardEditorLayout — 3-panel dashboard editor.
 *
 * Left: Widget Catalog Sidebar (260px)
 * Center: Canvas with grid layout + drag/drop/resize
 * Right: Widget Settings Panel (300px, conditional on selection)
 *
 * Wraps everything in a single DndContext for catalog→canvas drag.
 */
import { useState, useCallback } from 'react'
import {
  DndContext,
  DragOverlay,
  closestCenter,
  pointerWithin,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core'
import { LayoutGrid } from 'lucide-react'
import { useDashboardEditor } from '@/hooks/useDashboardEditor'
import { WidgetCatalogSidebar } from './WidgetCatalogSidebar'
import { DashboardCanvas } from './DashboardCanvas'
import { WidgetSettingsPanel } from './WidgetSettingsPanel'
import { WidgetTypeIcon } from './WidgetCard'
import type { DashboardWidget, WidgetCatalogEntry } from '@/services/dashboardService'

interface DashboardEditorLayoutProps {
  tabId: string
  initialWidgets: DashboardWidget[]
  catalog: WidgetCatalogEntry[]
  onExitEdit: () => void
}

export function DashboardEditorLayout({
  tabId,
  initialWidgets,
  catalog,
}: DashboardEditorLayoutProps) {
  const editor = useDashboardEditor({ tabId, initialWidgets })

  // DnD state
  const [dragSource, setDragSource] = useState<'catalog' | 'canvas' | null>(null)
  const [dragCatalogEntry, setDragCatalogEntry] = useState<WidgetCatalogEntry | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  )

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const id = String(event.active.id)
    if (id.startsWith('catalog:')) {
      setDragSource('catalog')
      const entry = event.active.data?.current?.entry as WidgetCatalogEntry | undefined
      setDragCatalogEntry(entry ?? null)
    } else {
      setDragSource('canvas')
      setDragCatalogEntry(null)
    }
  }, [])

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event

    if (dragSource === 'catalog' && dragCatalogEntry) {
      // Dropped from catalog → add widget
      editor.addWidget(dragCatalogEntry)
    } else if (dragSource === 'canvas' && over && active.id !== over.id) {
      // Reordered within canvas → swap positions
      editor.moveWidget(String(active.id), String(over.id))
    }

    setDragSource(null)
    setDragCatalogEntry(null)
  }, [dragSource, dragCatalogEntry, editor])

  const handleDragCancel = useCallback(() => {
    setDragSource(null)
    setDragCatalogEntry(null)
  }, [])

  // Click on canvas background deselects widget
  const handleCanvasBackgroundClick = useCallback(() => {
    editor.selectWidget(null)
  }, [editor])

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={dragSource === 'catalog' ? pointerWithin : closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div className="flex h-full overflow-hidden" onClick={handleCanvasBackgroundClick}>
        {/* Left: Widget Catalog */}
        <WidgetCatalogSidebar catalog={catalog} onAddWidget={(entry) => editor.addWidget(entry)} />

        {/* Center: Canvas */}
        <DashboardCanvas
          widgets={editor.widgets}
          selectedWidgetId={editor.selectedWidgetId}
          onSelectWidget={editor.selectWidget}
          onRemoveWidget={editor.removeWidget}
          onUpdateWidget={editor.updateWidget}
          isDragOverCanvas={dragSource === 'catalog'}
        />

        {/* Right: Settings (conditional) */}
        {editor.selectedWidget && (
          <WidgetSettingsPanel
            widget={editor.selectedWidget}
            onUpdateConfig={editor.updateWidgetConfig}
            onUpdateMeta={editor.updateWidgetMeta}
            onDelete={editor.removeWidget}
            onClose={() => editor.selectWidget(null)}
          />
        )}
      </div>

      {/* Drag overlay */}
      <DragOverlay>
        {dragSource === 'catalog' && dragCatalogEntry ? (
          <div className="flex items-center gap-2 bg-card border border-primary/30 shadow-lg rounded-md px-3 py-2 opacity-90">
            <WidgetTypeIcon type={dragCatalogEntry.type} className="text-primary" />
            <span className="text-xs font-medium text-foreground">{dragCatalogEntry.title}</span>
          </div>
        ) : dragSource === 'canvas' ? (
          <div className="w-32 h-16 bg-card border border-primary/30 shadow-lg rounded-md flex items-center justify-center opacity-80">
            <LayoutGrid size={16} className="text-primary" />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}
