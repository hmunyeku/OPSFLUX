/**
 * DashboardGrid — 12-column CSS Grid with drag-drop and resize.
 *
 * Uses @dnd-kit for drag-and-drop repositioning in edit mode.
 * Resize handle in bottom-right corner (edit mode only).
 * Widgets prop is guarded with Array.isArray to prevent .map() crash.
 * Positions stored as { x, y, w, h } in widget objects.
 */
import { useState, useCallback, useRef, useEffect } from 'react'
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
import type { DashboardWidget } from '@/services/dashboardService'
import { WidgetCard } from './WidgetCard'
import { cn } from '@/lib/utils'

const COLS = 12
const CELL_HEIGHT = 80 // px
const GAP = 12 // px — slightly more breathing room between widgets

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
      <div className="flex items-center justify-center h-full min-h-[300px] text-sm text-muted-foreground border border-dashed rounded-md">
        {mode === 'edit'
          ? 'Ajoutez des widgets depuis le catalogue pour personnaliser cet onglet.'
          : 'Aucun widget configuré sur cet onglet.'}
      </div>
    )
  }

  const gridContent = (
    <div
      className="relative"
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${COLS}, 1fr)`,
        gridAutoRows: `${CELL_HEIGHT}px`,
        gap: `${GAP}px`,
      }}
    >
      {widgets.map((widget, idx) => (
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
        <div
          className="relative"
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${COLS}, 1fr)`,
            gridAutoRows: `${CELL_HEIGHT}px`,
            gap: `${GAP}px`,
          }}
        >
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

      const colWidth = (parent.clientWidth - GAP * (COLS - 1)) / COLS
      const dx = e.clientX - resizeRef.current.startX
      const dy = e.clientY - resizeRef.current.startY

      const newW = Math.max(2, Math.min(COLS - x, resizeRef.current.startW + Math.round(dx / (colWidth + GAP))))
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
