/**
 * DashboardCanvas — Center panel of the dashboard editor.
 *
 * Uses react-grid-layout (ResponsiveReactGridLayout) for drag, drop, and resize.
 * Each widget maps to a grid item with position { x, y, w, h }.
 */
import { useCallback, useMemo, useRef, useState, useEffect } from 'react'
import { ResponsiveGridLayout, verticalCompactor } from 'react-grid-layout'
import type { Layout, LayoutItem, ResponsiveLayouts } from 'react-grid-layout'
import { LayoutGrid } from 'lucide-react'
import { cn } from '@/lib/utils'
import { WidgetCard } from './WidgetCard'
import type { DashboardWidget } from '@/services/dashboardService'

import 'react-grid-layout/css/styles.css'

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
  droppingItem?: LayoutItem
  /** Callback when an external item is dropped onto the grid */
  onDrop?: (layout: Layout, item: LayoutItem | undefined, e: Event) => void
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
  const containerRef = useRef<HTMLDivElement>(null)
  const [containerWidth, setContainerWidth] = useState(1200)

  // Measure container width for ResponsiveGridLayout
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width)
      }
    })
    ro.observe(el)
    setContainerWidth(el.clientWidth)
    return () => ro.disconnect()
  }, [])

  // Build layout from widget positions.
  //
  // react-grid-layout lets us define a separate positioning per
  // breakpoint. The user-edited layout targets the `lg` grid (12
  // cols). On narrower viewports the widgets must reflow, otherwise
  // they collapse to a narrow left column (a widget with w=4 out of
  // 12 cols on desktop becomes w=4 out of 6 cols on tablet which
  // reads as 2/3 width — squished with empty space to the right).
  //
  // Strategy:
  //   • lg (>=1200px, 12 cols) — honour the user's saved layout
  //   • md ( >=996px, 10 cols) — scale w proportionally (10/12)
  //   • sm ( >=768px, 6 cols)  — stack widgets full-width, one per
  //     row (h preserved) — cleanest read on tablet
  //   • xs/xxs — same stacked approach, full-width of the grid
  const layouts = useMemo<ResponsiveLayouts>(() => {
    const lgLayout: LayoutItem[] = widgets.map((widget, idx) => ({
      i: widget.id || `w-${idx}`,
      x: widget.position?.x ?? 0,
      y: widget.position?.y ?? 0,
      w: widget.position?.w ?? 4,
      h: widget.position?.h ?? 4,
      minW: 2,
      minH: 2,
    }))
    const mdLayout: LayoutItem[] = lgLayout.map((item) => ({
      ...item,
      x: Math.min(item.x, 10 - 1),
      w: Math.max(2, Math.min(10, Math.round(item.w * (10 / 12)))),
    }))
    // On tablet/mobile each widget takes the full grid width and
    // stacks vertically. We recompute y to keep the original
    // ordering from the lg layout (top-to-bottom, left-to-right).
    const stacked = (cols: number): LayoutItem[] => {
      const sorted = [...lgLayout].sort((a, b) => (a.y - b.y) || (a.x - b.x))
      let y = 0
      return sorted.map((item) => {
        const h = item.h
        const out: LayoutItem = { ...item, x: 0, y, w: cols, h }
        y += h
        return out
      })
    }
    return {
      lg: lgLayout,
      md: mdLayout,
      sm: stacked(6),
      xs: stacked(4),
      xxs: stacked(2),
    }
  }, [widgets])

  // When layout changes (drag or resize), sync positions back to widgets
  const handleLayoutChange = useCallback(
    (currentLayout: Layout, _allLayouts: ResponsiveLayouts) => {
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
    <div ref={containerRef} className="flex-1 min-w-0 overflow-auto p-4" onClick={handleBackgroundClick}>
      <ResponsiveGridLayout
        className="layout"
        width={containerWidth}
        layouts={layouts}
        breakpoints={BREAKPOINTS}
        cols={COLS}
        rowHeight={ROW_HEIGHT}
        margin={[12, 12] as const}
        containerPadding={[0, 0] as const}
        dragConfig={{ enabled: isEditing, bounded: false, handle: '.react-grid-drag-handle' }}
        resizeConfig={{ enabled: isEditing, handles: ['se'] }}
        dropConfig={{ enabled: isEditing, defaultItem: { w: 4, h: 4 } }}
        droppingItem={droppingItem}
        onDrop={onDrop}
        onLayoutChange={handleLayoutChange}
        compactor={verticalCompactor}
      >
        {widgets.map((widget, idx) => (
          <div
            key={widget.id || `widget-${idx}`}
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
      </ResponsiveGridLayout>
    </div>
  )
}
