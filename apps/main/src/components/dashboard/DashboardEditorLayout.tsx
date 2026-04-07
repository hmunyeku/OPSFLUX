/**
 * DashboardEditorLayout — 3-panel dashboard editor.
 *
 * Left: Widget Catalog Sidebar (260px)
 * Center: Canvas with react-grid-layout (drag/drop/resize)
 * Right: Widget Settings Panel (300px, conditional on selection)
 *
 * Catalog items use HTML5 native drag → react-grid-layout's isDroppable / onDrop.
 */
import { useState, useCallback, useRef, forwardRef, useImperativeHandle } from 'react'
import type { Layout, LayoutItem } from 'react-grid-layout'
import { useDashboardEditor } from '@/hooks/useDashboardEditor'
import { WidgetCatalogSidebar } from './WidgetCatalogSidebar'
import { DashboardCanvas } from './DashboardCanvas'
import { WidgetSettingsPanel } from './WidgetSettingsPanel'
import type { DashboardWidget, WidgetCatalogEntry } from '@/services/dashboardService'

export interface DashboardEditorHandle {
  flushSave: () => void
  discardChanges: () => void
  undo: () => void
  redo: () => void
  canUndo: boolean
  canRedo: boolean
}

interface DashboardEditorLayoutProps {
  tabId: string
  initialWidgets: DashboardWidget[]
  catalog: WidgetCatalogEntry[]
  onExitEdit: () => void
}

export const DashboardEditorLayout = forwardRef<DashboardEditorHandle, DashboardEditorLayoutProps>(
  function DashboardEditorLayout({ tabId, initialWidgets, catalog, onExitEdit: _onExitEdit }, ref) {
  const editor = useDashboardEditor({ tabId, initialWidgets })

  useImperativeHandle(ref, () => ({
    flushSave: editor.flushSave,
    discardChanges: editor.discardChanges,
    undo: editor.undo,
    redo: editor.redo,
    canUndo: editor.canUndo,
    canRedo: editor.canRedo,
  }), [editor.flushSave, editor.discardChanges, editor.undo, editor.redo, editor.canUndo, editor.canRedo])

  // Track the catalog entry currently being dragged (for droppingItem)
  const [droppingItem, setDroppingItem] = useState<LayoutItem | undefined>(undefined)
  const dragEntryRef = useRef<WidgetCatalogEntry | null>(null)

  const handleCatalogDragStart = useCallback((entry: WidgetCatalogEntry) => {
    dragEntryRef.current = entry
    setDroppingItem({ i: '__dropping__', x: 0, y: 0, w: 4, h: 4 })
  }, [])

  const handleCatalogDragEnd = useCallback(() => {
    dragEntryRef.current = null
    setDroppingItem(undefined)
  }, [])

  // When an external item is dropped onto the grid
  const handleDrop = useCallback(
    (_layout: Layout, item: LayoutItem | undefined, _e: Event) => {
      const entry = dragEntryRef.current
      if (!entry || !item) return

      editor.addWidget(entry, { x: item.x, y: item.y, w: item.w, h: item.h })
      dragEntryRef.current = null
      setDroppingItem(undefined)
    },
    [editor],
  )

  // Click on canvas background deselects widget
  const handleCanvasBackgroundClick = useCallback(() => {
    editor.selectWidget(null)
  }, [editor])

  return (
    <div className="flex h-full overflow-hidden" onClick={handleCanvasBackgroundClick}>
      {/* Left: Widget Catalog */}
      <WidgetCatalogSidebar
        catalog={catalog}
        onAddWidget={(entry) => editor.addWidget(entry)}
        onDragStart={handleCatalogDragStart}
        onDragEnd={handleCatalogDragEnd}
      />

      {/* Center: Canvas (react-grid-layout) */}
      <DashboardCanvas
        widgets={editor.widgets}
        selectedWidgetId={editor.selectedWidgetId}
        onSelectWidget={editor.selectWidget}
        onRemoveWidget={editor.removeWidget}
        onUpdateWidget={editor.updateWidget}
        mode="edit"
        droppingItem={droppingItem}
        onDrop={handleDrop}
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
  )
})
