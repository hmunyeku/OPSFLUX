/**
 * DashboardEditorLayout — 3-panel dashboard editor.
 *
 * Left: Widget Catalog Sidebar (260px)
 * Center: Canvas with react-grid-layout (drag/drop/resize)
 * Right: Widget Settings Panel (300px, conditional on selection)
 *
 * Catalog items use HTML5 native drag → react-grid-layout's isDroppable / onDrop.
 */
import { useState, useCallback, useRef } from 'react'
import type ReactGridLayout from 'react-grid-layout'
import { useDashboardEditor } from '@/hooks/useDashboardEditor'
import { WidgetCatalogSidebar } from './WidgetCatalogSidebar'
import { DashboardCanvas } from './DashboardCanvas'
import { WidgetSettingsPanel } from './WidgetSettingsPanel'
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

  // Track the catalog entry currently being dragged (for droppingItem)
  const [droppingItem, setDroppingItem] = useState<{ i: string; w: number; h: number } | undefined>(undefined)
  const dragEntryRef = useRef<WidgetCatalogEntry | null>(null)

  const handleCatalogDragStart = useCallback((entry: WidgetCatalogEntry) => {
    dragEntryRef.current = entry
    setDroppingItem({ i: '__dropping__', w: 4, h: 4 })
  }, [])

  const handleCatalogDragEnd = useCallback(() => {
    dragEntryRef.current = null
    setDroppingItem(undefined)
  }, [])

  // When an external item is dropped onto the grid
  const handleDrop = useCallback(
    (_layout: ReactGridLayout.Layout[], item: ReactGridLayout.Layout, _e: Event) => {
      const entry = dragEntryRef.current
      if (!entry) return

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
}
