/**
 * DashboardGrid — 12-column CSS Grid with drag-drop and resize.
 *
 * Uses @dnd-kit for drag-and-drop repositioning in edit mode.
 * Resize handle in bottom-right corner (edit mode only).
 * Widgets prop is guarded with Array.isArray to prevent .map() crash.
 * Positions stored as { x, y, w, h } in widget objects.
 */
import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  useSortable,
  rectSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { LayoutGrid } from 'lucide-react'
import type { DashboardWidget } from '@/services/dashboardService'
import { WidgetCard } from './WidgetCard'
import { cn } from '@/lib/utils'

const COLS_DESKTOP = 12
const COLS_TABLET = 6
const COLS_MOBILE = 2
const CELL_HEIGHT = 88 // px — slightly taller cells for better proportions
const GAP = 16 // px — more breathing room between widgets

/** Responsive column count based on container width */
function useResponsiveCols(): { cols: number; scale: number } {
  const [width, setWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 1200)
  useEffect(() => {
    const handler = () => setWidth(window.innerWidth)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])
  if (width < 640) return { cols: COLS_MOBILE, scale: COLS_MOBILE / COLS_DESKTOP }
  if (width < 1024) return { cols: COLS_TABLET, scale: COLS_TABLET / COLS_DESKTOP }
  return { cols: COLS_DESKTOP, scale: 1 }
}

interface DashboardGridProps {
  widgets: DashboardWidget[]
  mode: 'view' | 'edit'
  onRemoveWidget?: (widgetId: string) => void
  onUpdateWidget?: (widget: DashboardWidget) => void
  onUpdateWidgets?: (widgets: DashboardWidget[]) => void
}

export function DashboardGrid({ widgets: rawWidgets, mode, onRemoveWidget, onUpdateWidget, onUpdateWidgets }: DashboardGridProps) {
  // Guard: ensure widgets is always an array (backend may return null/object)
  const widgets = Array.isArray(rawWidgets) ? rawWidgets : []
  const { cols, scale } = useResponsiveCols()

  // On small screens, reflow widgets: stack full-width vertically.
  //
  // The previous logic scaled widget width proportionally (a widget
  // of w=4 on a 12-col desktop became w=2 on a 6-col tablet) which
  // rendered as a narrow left column with massive empty space to
  // the right on tablets — not what users expect. A calm stack at
  // full grid width is both more readable and more consistent with
  // mobile behaviour.
  const responsiveWidgets = useMemo(() => {
    if (scale >= 1) return widgets // desktop — honour user layout
    // Sort by original position (top-to-bottom, left-to-right) so
    // stacking preserves the visual hierarchy the user designed.
    const sorted = [...widgets].sort((a, b) => {
      const ay = a.position?.y ?? 0, by = b.position?.y ?? 0
      if (ay !== by) return ay - by
      return (a.position?.x ?? 0) - (b.position?.x ?? 0)
    })
    let currentY = 0
    return sorted.map((w) => {
      const origH = w.position?.h ?? 4
      const pos = { x: 0, y: currentY, w: cols, h: origH }
      currentY += origH
      return { ...w, position: pos }
    })
  }, [widgets, cols, scale])
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  )

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event
      if (!over || active.id === over.id) return

      // Swap positions
      const activeIdx = widgets.findIndex((w) => w.id === active.id)
      const overIdx = widgets.findIndex((w) => w.id === over.id)
      if (activeIdx === -1 || overIdx === -1) return

      const updated = [...widgets]
      const activePos = { ...updated[activeIdx].position }
      const overPos = { ...updated[overIdx].position }

      // Swap positions
      updated[activeIdx] = { ...updated[activeIdx], position: overPos }
      updated[overIdx] = { ...updated[overIdx], position: activePos }

      onUpdateWidgets?.(updated)
    },
    [widgets, onUpdateWidgets],
  )

  if (!widgets || widgets.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 h-full min-h-[340px] rounded-2xl border border-dashed border-border/70 bg-gradient-to-br from-background to-background/40 p-8 text-center">
        <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-primary/15 to-highlight/10 flex items-center justify-center ring-1 ring-primary/10">
          <LayoutGrid size={22} className="text-primary/70" />
        </div>
        <div className="space-y-1">
          <p className="text-sm font-medium font-display text-foreground">
            {mode === 'edit' ? 'Personnalisez cet onglet' : 'Onglet vide'}
          </p>
          <p className="text-xs text-muted-foreground max-w-sm">
            {mode === 'edit'
              ? 'Ajoutez des widgets depuis le catalogue pour visualiser vos indicateurs clés.'
              : 'Aucun widget n\u2019a encore été configuré sur cet onglet. Passez en mode édition pour en ajouter.'}
          </p>
        </div>
      </div>
    )
  }

  const displayWidgets = mode === 'edit' ? widgets : responsiveWidgets

  const gridStyle = {
    display: 'grid' as const,
    gridTemplateColumns: `repeat(${cols}, 1fr)`,
    gridAutoRows: `${CELL_HEIGHT}px`,
    gap: `${GAP}px`,
  }

  const gridContent = (
    <div className="relative" style={gridStyle}>
      {displayWidgets.map((widget, idx) => (
        <GridCell
          key={widget.id || `widget-${idx}`}
          widget={widget}
          mode={mode}
          onRemove={onRemoveWidget ? () => onRemoveWidget(widget.id) : undefined}
          onUpdate={onUpdateWidget}
        />
      ))}
    </div>
  )

  if (mode !== 'edit') return gridContent

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={widgets.map((w, i) => w.id || `w-${i}`)} strategy={rectSortingStrategy}>
        <div className="relative" style={gridStyle}>
          {widgets.map((widget, idx) => (
            <SortableGridCell
              key={widget.id || `widget-${idx}`}
              widget={widget}
              mode={mode}
              onRemove={onRemoveWidget ? () => onRemoveWidget(widget.id) : undefined}
              onUpdate={onUpdateWidget}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  )
}

// ── Non-sortable cell (view mode) ────────────────────────────

function GridCell({ widget, mode, onRemove, onUpdate }: {
  widget: DashboardWidget; mode: 'view' | 'edit'
  onRemove?: () => void; onUpdate?: (w: DashboardWidget) => void
}) {
  const x = widget.position?.x ?? 0
  const y = widget.position?.y ?? 0
  const w = widget.position?.w ?? 4
  const h = widget.position?.h ?? 4

  return (
    <div style={{ gridColumn: `${x + 1} / span ${w}`, gridRow: `${y + 1} / span ${h}`, minHeight: 0 }}>
      <WidgetCard widget={widget} mode={mode} onRemove={onRemove} onUpdate={onUpdate} />
    </div>
  )
}

// ── Sortable cell (edit mode) with resize handle ─────────────

function SortableGridCell({ widget, mode, onRemove, onUpdate }: {
  widget: DashboardWidget; mode: 'view' | 'edit'
  onRemove?: () => void; onUpdate?: (w: DashboardWidget) => void
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: widget.id })

  const x = widget.position?.x ?? 0
  const y = widget.position?.y ?? 0
  const w = widget.position?.w ?? 4
  const h = widget.position?.h ?? 4

  const style = {
    gridColumn: `${x + 1} / span ${w}`,
    gridRow: `${y + 1} / span ${h}`,
    minHeight: 0,
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : 'auto' as const,
  }

  // ── Resize logic ──────────────────────────────────────────
  const [isResizing, setIsResizing] = useState(false)
  const resizeRef = useRef<{ startX: number; startY: number; startW: number; startH: number } | null>(null)
  const cellRef = useRef<HTMLDivElement>(null)

  const handleResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setIsResizing(true)
      resizeRef.current = { startX: e.clientX, startY: e.clientY, startW: w, startH: h }
    },
    [w, h],
  )

  useEffect(() => {
    if (!isResizing) return

    const handleMove = (e: MouseEvent) => {
      if (!resizeRef.current || !cellRef.current) return
      const parent = cellRef.current.parentElement
      if (!parent) return

      const colWidth = (parent.clientWidth - GAP * (COLS_DESKTOP - 1)) / COLS_DESKTOP
      const dx = e.clientX - resizeRef.current.startX
      const dy = e.clientY - resizeRef.current.startY

      const newW = Math.max(2, Math.min(COLS_DESKTOP - x, resizeRef.current.startW + Math.round(dx / (colWidth + GAP))))
      const newH = Math.max(2, resizeRef.current.startH + Math.round(dy / (CELL_HEIGHT + GAP)))

      if (newW !== w || newH !== h) {
        onUpdate?.({ ...widget, position: { ...widget.position, w: newW, h: newH } })
      }
    }

    const handleUp = () => {
      setIsResizing(false)
      resizeRef.current = null
    }

    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
    return () => {
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)
    }
  }, [isResizing, widget, x, w, h, onUpdate])

  return (
    <div ref={(node) => { setNodeRef(node); (cellRef as React.MutableRefObject<HTMLDivElement | null>).current = node }} style={style}
      className={cn('relative', isDragging && 'ring-2 ring-primary rounded-md')}>
      <WidgetCard
        widget={widget}
        mode={mode}
        onRemove={onRemove}
        onUpdate={onUpdate}
        dragHandleProps={{ ...listeners, ...attributes }}
      />
      {/* Resize handle */}
      {mode === 'edit' && (
        <div
          onMouseDown={handleResizeStart}
          className={cn(
            'absolute bottom-0 right-0 w-4 h-4 cursor-se-resize z-10',
            'after:absolute after:bottom-0.5 after:right-0.5 after:w-2.5 after:h-2.5',
            'after:border-b-2 after:border-r-2 after:border-primary/40 after:rounded-br',
            isResizing && 'after:border-primary',
          )}
        />
      )}
    </div>
  )
}
