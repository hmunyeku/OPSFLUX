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
import { LayoutGrid, Settings2, PanelLeftClose } from 'lucide-react'
import { cn } from '@/lib/utils'
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

  // Floating panel toggles
  const [showCatalog, setShowCatalog] = useState(true)

  return (
    <div className="relative flex-1 h-full overflow-hidden" onClick={handleCanvasBackgroundClick}>
      {/* Full-width Canvas */}
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

      {/* Floating toggle buttons — top left */}
      <div className="absolute top-2 left-4 z-20 flex items-center gap-1">
        <button
          onClick={(e) => { e.stopPropagation(); setShowCatalog(!showCatalog) }}
          className={cn(
            'h-7 px-2.5 rounded-md text-xs font-medium flex items-center gap-1.5 transition-colors shadow-sm',
            showCatalog ? 'bg-primary text-primary-foreground' : 'bg-card text-foreground hover:bg-muted border border-border/50',
          )}
        >
          <LayoutGrid size={13} />
          Widgets
        </button>
        {editor.selectedWidget && (
          <button
            onClick={(e) => { e.stopPropagation(); editor.selectWidget(null) }}
            className="h-7 px-2.5 rounded-md text-xs font-medium flex items-center gap-1.5 bg-card text-foreground hover:bg-muted border border-border/50 shadow-sm"
          >
            <Settings2 size={13} />
            Fermer config
          </button>
        )}
      </div>

      {/* Left: Floating Widget Catalog — overlay on top of canvas */}
      {showCatalog && (
        <div
          className="absolute top-12 left-4 z-20 w-[280px] max-h-[calc(100%-60px)] rounded-lg border border-border/50 bg-card shadow-xl overflow-hidden flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between px-3 py-2 border-b border-border/30 shrink-0">
            <span className="text-xs font-semibold text-foreground">Catalogue widgets</span>
            <button onClick={() => setShowCatalog(false)} className="p-0.5 rounded hover:bg-muted">
              <PanelLeftClose size={13} className="text-muted-foreground" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto">
            <WidgetCatalogSidebar
              catalog={catalog}
              onAddWidget={(entry) => editor.addWidget(entry)}
              onDragStart={handleCatalogDragStart}
              onDragEnd={handleCatalogDragEnd}
            />
          </div>
        </div>
      )}

      {/* Right: Floating Widget Settings — overlay on top of canvas */}
      {editor.selectedWidget && (
        <div
          className="absolute top-12 right-4 z-20 w-[320px] max-h-[calc(100%-60px)] rounded-lg border border-border/50 bg-card shadow-xl overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          <WidgetSettingsPanel
            widget={editor.selectedWidget}
            onUpdateConfig={editor.updateWidgetConfig}
            onUpdateMeta={editor.updateWidgetMeta}
            onDelete={editor.removeWidget}
            onClose={() => editor.selectWidget(null)}
          />
        </div>
      )}
    </div>
  )
})
