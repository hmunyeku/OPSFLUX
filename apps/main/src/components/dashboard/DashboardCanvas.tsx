/**
 * DashboardCanvas — Center panel of the dashboard editor.
 *
 * Uses react-grid-layout (ResponsiveReactGridLayout) for drag, drop, and resize.
 * Each widget maps to a grid item with position { x, y, w, h }.
 */
import { useCallback, useMemo } from 'react'
import ReactGridLayout from 'react-grid-layout'
import { LayoutGrid } from 'lucide-react'
import { cn } from '@/lib/utils'
import { WidgetCard } from './WidgetCard'
import type { DashboardWidget } from '@/services/dashboardService'

import 'react-grid-layout/css/styles.css'

const ResponsiveReactGridLayout = ReactGridLayout.WidthProvider(ReactGridLayout.Responsive)

const BREAKPOINTS = { lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }
const COLS = { lg: 12, md: 10, sm: 6, xs: 4, xxs: 2 }
const ROW_HEIGHT = 80

interface DashboardCanvasProps {
  widgets: DashboardWidget[]
  selectedWidgetId: string | null
  onSelectWidget: (id: string | null) => void
  onRemoveWidget: (id: string) => void
  onUpdateWidget: (widget: DashboardWidget) => void
  mode?: 'view' | 'edit'
  /** Item being dragged from catalog sidebar (for external drop) */
  droppingItem?: { i: string; w: number; h: number }
  /** Callback when an external item is dropped onto the grid */
  onDrop?: (layout: ReactGridLayout.Layout[], item: ReactGridLayout.Layout, e: Event) => void
}

export function DashboardCanvas({
  widgets,
  selectedWidgetId,
  onSelectWidget,
  onRemoveWidget,
  onUpdateWidget,
  mode = 'edit',
  droppingItem,
  onDrop,
}: DashboardCanvasProps) {
  const isEditing = mode === 'edit'

  // Build layout from widget positions
  const layouts = useMemo<ReactGridLayout.Layouts>(() => {
    const lgLayout: ReactGridLayout.Layout[] = widgets.map((widget, idx) => ({
      i: widget.id || `w-${idx}`,
      x: widget.position?.x ?? 0,
      y: widget.position?.y ?? 0,
      w: widget.position?.w ?? 4,
      h: widget.position?.h ?? 4,
      minW: 2,
      minH: 2,
    }))
    return { lg: lgLayout, md: lgLayout, sm: lgLayout, xs: lgLayout, xxs: lgLayout }
  }, [widgets])

  // When layout changes (drag or resize), sync positions back to widgets
  const handleLayoutChange = useCallback(
    (currentLayout: ReactGridLayout.Layout[]) => {
      for (const item of currentLayout) {
        const widget = widgets.find((w) => w.id === item.i)
        if (!widget) continue

        const pos = widget.position
        if (
          pos?.x !== item.x ||
          pos?.y !== item.y ||
          pos?.w !== item.w ||
          pos?.h !== item.h
        ) {
          onUpdateWidget({
            ...widget,
            position: { x: item.x, y: item.y, w: item.w, h: item.h },
          })
        }
      }
    },
    [widgets, onUpdateWidget],
  )

  // Deselect when clicking canvas background
  const handleBackgroundClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) {
        onSelectWidget(null)
      }
    },
    [onSelectWidget],
  )

  // Empty state
  if (!widgets || widgets.length === 0) {
    return (
      <div className="flex-1 min-w-0 overflow-auto p-4" onClick={handleBackgroundClick}>
        <div
          className={cn(
            'flex flex-col items-center justify-center h-full min-h-[400px] rounded-lg transition-colors',
            'border-2 border-dashed border-border bg-muted/20',
          )}
        >
          <LayoutGrid size={40} className="text-muted-foreground/30 mb-3" />
          <p className="text-sm text-muted-foreground font-medium">
            Glissez un widget ici
          </p>
          <p className="text-xs text-muted-foreground/60 mt-1">
            ou cliquez sur un widget dans le catalogue
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 min-w-0 overflow-auto p-4" onClick={handleBackgroundClick}>
      <ResponsiveReactGridLayout
        className="layout"
        layouts={layouts}
        breakpoints={BREAKPOINTS}
        cols={COLS}
        rowHeight={ROW_HEIGHT}
        margin={[8, 8]}
        containerPadding={[0, 0]}
        isDraggable={isEditing}
        isResizable={isEditing}
        isDroppable={isEditing}
        droppingItem={droppingItem}
        onDrop={onDrop}
        onLayoutChange={handleLayoutChange}
        draggableHandle=".react-grid-drag-handle"
        useCSSTransforms
        compactType="vertical"
      >
        {widgets.map((widget) => (
          <div
            key={widget.id}
            className={cn(
              'relative',
              selectedWidgetId === widget.id && 'ring-2 ring-primary/60 rounded-md',
            )}
            onClick={(e) => {
              e.stopPropagation()
              onSelectWidget(widget.id)
            }}
          >
            <WidgetCard
              widget={widget}
              mode={mode}
              onRemove={() => onRemoveWidget(widget.id)}
              onUpdate={onUpdateWidget}
              dragHandleProps={{ className: 'react-grid-drag-handle' }}
            />
          </div>
        ))}
      </ResponsiveReactGridLayout>
    </div>
  )
}
