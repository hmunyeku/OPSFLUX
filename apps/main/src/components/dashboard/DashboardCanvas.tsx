/**
 * DashboardCanvas — Center panel of the dashboard editor.
 *
 * 12-column grid with visible guidelines, droppable zone for catalog items,
 * sortable widgets with drag handles and resize capability.
 */
import { useCallback, useState, useRef, useEffect } from 'react'
import {
  SortableContext,
  useSortable,
  rectSortingStrategy,
} from '@dnd-kit/sortable'
import { useDroppable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { LayoutGrid } from 'lucide-react'
import { cn } from '@/lib/utils'
import { WidgetCard } from './WidgetCard'
import type { DashboardWidget } from '@/services/dashboardService'

const COLS = 12
const CELL_HEIGHT = 80
const GAP = 8

interface DashboardCanvasProps {
  widgets: DashboardWidget[]
  selectedWidgetId: string | null
  onSelectWidget: (id: string | null) => void
  onRemoveWidget: (id: string) => void
  onUpdateWidget: (widget: DashboardWidget) => void
  isDragOverCanvas?: boolean
}

export function DashboardCanvas({
  widgets,
  selectedWidgetId,
  onSelectWidget,
  onRemoveWidget,
  onUpdateWidget,
  isDragOverCanvas,
}: DashboardCanvasProps) {
  const { setNodeRef, isOver } = useDroppable({ id: 'canvas' })
  const showDropZone = isDragOverCanvas || isOver

  if (!widgets || widgets.length === 0) {
    return (
      <div ref={setNodeRef} className="flex-1 min-w-0 overflow-auto p-4">
        <div
          className={cn(
            'flex flex-col items-center justify-center h-full min-h-[400px] rounded-lg transition-colors',
            showDropZone
              ? 'border-2 border-dashed border-primary/40 bg-primary/5'
              : 'border-2 border-dashed border-border bg-muted/20',
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
    <div ref={setNodeRef} className="flex-1 min-w-0 overflow-auto p-4">
      <div className="relative">
        {/* Grid guidelines */}
        <div
          className="absolute inset-0 pointer-events-none z-0"
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${COLS}, 1fr)`,
            gap: `${GAP}px`,
          }}
        >
          {Array.from({ length: COLS }).map((_, i) => (
            <div key={i} className="border-x border-dashed border-border/15 h-full min-h-[400px]" />
          ))}
        </div>

        {/* Drop zone overlay */}
        {showDropZone && (
          <div className="absolute inset-0 bg-primary/5 border-2 border-dashed border-primary/30 rounded-lg z-10 pointer-events-none" />
        )}

        {/* Widgets grid */}
        <SortableContext items={widgets.map((w, i) => w.id || `w-${i}`)} strategy={rectSortingStrategy}>
          <div
            className="relative z-20"
            style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${COLS}, 1fr)`,
              gridAutoRows: `${CELL_HEIGHT}px`,
              gap: `${GAP}px`,
            }}
          >
            {widgets.map((widget, idx) => (
              <CanvasWidgetCell
                key={widget.id || `w-${idx}`}
                widget={widget}
                selected={widget.id === selectedWidgetId}
                onSelect={() => onSelectWidget(widget.id)}
                onRemove={() => onRemoveWidget(widget.id)}
                onUpdate={onUpdateWidget}
              />
            ))}
          </div>
        </SortableContext>
      </div>
    </div>
  )
}

// ── Sortable widget cell with selection ring + resize ────────

function CanvasWidgetCell({
  widget,
  selected,
  onSelect,
  onRemove,
  onUpdate,
}: {
  widget: DashboardWidget
  selected: boolean
  onSelect: () => void
  onRemove: () => void
  onUpdate: (w: DashboardWidget) => void
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
    zIndex: isDragging ? 50 : selected ? 5 : ('auto' as const),
  }

  // ── Resize logic ──
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
        onUpdate({ ...widget, position: { ...widget.position, w: newW, h: newH } })
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
    <div
      ref={(node) => {
        setNodeRef(node)
        ;(cellRef as React.MutableRefObject<HTMLDivElement | null>).current = node
      }}
      style={style}
      className={cn(
        'relative group',
        isDragging && 'ring-2 ring-primary rounded-md',
        selected && !isDragging && 'ring-2 ring-primary/60 rounded-md',
      )}
      onClick={(e) => {
        e.stopPropagation()
        onSelect()
      }}
    >
      <WidgetCard
        widget={widget}
        mode="edit"
        onRemove={onRemove}
        onUpdate={onUpdate}
        dragHandleProps={{ ...listeners, ...attributes }}
      />

      {/* Resize handle */}
      <div
        onMouseDown={handleResizeStart}
        className={cn(
          'absolute bottom-0 right-0 w-4 h-4 cursor-se-resize z-30',
          'after:absolute after:bottom-0.5 after:right-0.5 after:w-2.5 after:h-2.5',
          'after:border-b-2 after:border-r-2 after:border-primary/40 after:rounded-br',
          isResizing && 'after:border-primary',
        )}
      />
    </div>
  )
}
