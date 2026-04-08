/**
 * GanttBar — Individual task bar with drag, resize, progress, and milestone.
 *
 * Features:
 * - Drag entire bar to reschedule
 * - Resize left/right edges to change start/end dates
 * - Progress fill overlay
 * - Milestone diamond shape
 * - Baseline ghost bar (planned vs actual)
 * - Draft opacity + critical path ring
 * - Label on bar when space permits
 * - Hover shadow effect
 */
import { useCallback, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { addD, STATUS_COLORS, PRIORITY_COLORS, TYPE_COLORS } from './ganttEngine'
import type { GanttBarData } from './ganttTypes'

const MIN_LABEL_PX = 60

export function resolveBarColor(bar: GanttBarData): string {
  if (bar.color) return bar.color
  if (bar.status && STATUS_COLORS[bar.status]) return STATUS_COLORS[bar.status]
  if (bar.priority && PRIORITY_COLORS[bar.priority]) return PRIORITY_COLORS[bar.priority]
  if (bar.type && TYPE_COLORS[bar.type]) return TYPE_COLORS[bar.type]
  return '#3b82f6'
}

interface GanttBarProps {
  bar: GanttBarData
  left: number
  width: number
  top: number
  barHeight: number
  pxPerDay: number
  showProgress: boolean
  showLabels: boolean
  showBaselines: boolean
  baselineLeft?: number
  baselineWidth?: number
  onClick?: () => void
  onDrag?: (newStart: string, newEnd: string) => void
  onResize?: (edge: 'left' | 'right', newDate: string) => void
  onTitleEdit?: (newTitle: string) => void
  onProgressChange?: (newProgress: number) => void
  onHover?: (e: React.MouseEvent) => void
  onLeave?: () => void
  onRightClick?: (e: React.MouseEvent) => void
}

export function GanttBarComponent({
  bar, left, width, top, barHeight, pxPerDay,
  showProgress, showLabels, showBaselines,
  baselineLeft, baselineWidth,
  onClick, onDrag, onResize, onTitleEdit, onProgressChange, onHover, onLeave, onRightClick,
}: GanttBarProps) {
  const color = resolveBarColor(bar)
  const dragRef = useRef<{ originX: number; mode: 'move' | 'left' | 'right' } | null>(null)
  const [editing, setEditing] = useState(false)
  const [editValue, setEditValue] = useState(bar.title)

  // ── Drag handler (move whole bar or resize edge) ──
  const handleMouseDown = useCallback((e: React.MouseEvent, mode: 'move' | 'left' | 'right') => {
    if (mode === 'move' && !bar.draggable) return
    if ((mode === 'left' || mode === 'right') && !bar.resizable) return
    e.preventDefault()
    e.stopPropagation()

    dragRef.current = { originX: e.clientX, mode }

    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current) return
      const dx = ev.clientX - dragRef.current.originX
      const deltaDays = Math.round(dx / pxPerDay)
      if (deltaDays === 0) return

      if (dragRef.current.mode === 'move' && onDrag) {
        onDrag(addD(bar.startDate, deltaDays), addD(bar.endDate, deltaDays))
        dragRef.current.originX = ev.clientX
      } else if (dragRef.current.mode === 'left' && onResize) {
        onResize('left', addD(bar.startDate, deltaDays))
        dragRef.current.originX = ev.clientX
      } else if (dragRef.current.mode === 'right' && onResize) {
        onResize('right', addD(bar.endDate, deltaDays))
        dragRef.current.originX = ev.clientX
      }
    }

    const onUp = () => {
      dragRef.current = null
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }

    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [bar, pxPerDay, onDrag, onResize])

  // ── Milestone (diamond) ──
  if (bar.isMilestone) {
    const size = barHeight * 0.65
    const cx = left + width / 2
    const cy = top + barHeight / 2
    return (
      <>
        <div
          className={cn(
            'absolute z-20 cursor-pointer transition-all',
            'hover:scale-110 hover:shadow-lg',
            bar.isDraft && 'opacity-50',
          )}
          style={{
            left: cx - size / 2,
            top: cy - size / 2,
            width: size,
            height: size,
            backgroundColor: color,
            transform: 'rotate(45deg)',
            borderRadius: 3,
            boxShadow: bar.isCritical ? '0 0 0 2.5px #ef4444' : undefined,
          }}
          onClick={onClick}
          onMouseMove={onHover}
          onMouseLeave={onLeave}
        />
        {/* Milestone label below */}
        {showLabels && (
          <div
            className="absolute z-10 text-[9px] font-medium text-muted-foreground text-center pointer-events-none truncate"
            style={{ left: cx - 40, top: cy + size / 2 + 4, width: 80 }}
          >
            {bar.title}
          </div>
        )}
      </>
    )
  }

  // ── Summary bar (parent/grouping — bracket style like MS Project) ──
  if (bar.isSummary) {
    const bracketH = 6
    const bracketTop = top + barHeight - bracketH
    return (
      <>
        <div
          className="absolute z-20 cursor-pointer"
          style={{ left, top: bracketTop, width: Math.max(4, width), height: bracketH }}
          onClick={onClick}
          onMouseMove={onHover}
          onMouseLeave={onLeave}
        >
          {/* Horizontal bar */}
          <div className="absolute inset-x-0 top-0 h-[3px] rounded-sm" style={{ backgroundColor: color }} />
          {/* Left bracket */}
          <div className="absolute left-0 top-0 w-[3px] rounded-sm" style={{ height: bracketH, backgroundColor: color }} />
          {/* Right bracket */}
          <div className="absolute right-0 top-0 w-[3px] rounded-sm" style={{ height: bracketH, backgroundColor: color }} />
        </div>
        {/* Summary label */}
        {showLabels && (
          <div
            className="absolute z-10 text-[10px] font-semibold text-foreground/70 truncate pointer-events-none"
            style={{ left, top: bracketTop - 14, width: Math.max(60, width) }}
          >
            {bar.title}
          </div>
        )}
        {/* Progress fill on summary */}
        {showProgress && bar.progress != null && bar.progress > 0 && (
          <div
            className="absolute z-19 rounded-sm"
            style={{
              left,
              top: bracketTop,
              width: Math.max(2, width * bar.progress / 100),
              height: 3,
              backgroundColor: color,
              opacity: 0.6,
            }}
          />
        )}
      </>
    )
  }

  // ── Regular bar ──
  return (
    <>
      {/* Baseline ghost bar */}
      {showBaselines && baselineLeft != null && baselineWidth != null && (
        <div
          className="absolute z-10 pointer-events-none rounded-[3px] border-2 border-dashed"
          style={{
            left: baselineLeft,
            top: top + barHeight - 4,
            width: baselineWidth,
            height: 6,
            borderColor: color + '60',
            backgroundColor: color + '10',
          }}
        />
      )}

      {/* Main bar */}
      <div
        className={cn(
          'absolute z-20 rounded-[5px] overflow-hidden',
          'transition-shadow duration-150',
          'hover:shadow-lg hover:brightness-110',
          bar.isDraft && 'opacity-50',
          bar.draggable && 'cursor-grab active:cursor-grabbing',
        )}
        style={{
          left,
          top,
          width: Math.max(4, width),
          height: barHeight,
          backgroundColor: color,
          boxShadow: bar.isCritical
            ? `0 0 0 2px #ef4444, 0 2px 4px ${color}40`
            : `0 1px 3px ${color}30`,
        }}
        onClick={onClick}
        onContextMenu={onRightClick}
        onMouseDown={e => handleMouseDown(e, 'move')}
        onMouseMove={onHover}
        onMouseLeave={onLeave}
      >
        {/* Progress fill */}
        {showProgress && bar.progress != null && bar.progress > 0 && (
          <div
            className="absolute inset-y-0 left-0 bg-black/20 rounded-l-[5px]"
            style={{ width: `${Math.min(100, bar.progress)}%` }}
          />
        )}

        {/* Bar label — double-click to edit */}
        {showLabels && width >= MIN_LABEL_PX && (
          <div
            className="absolute inset-0 flex items-center px-2 min-w-0"
            onDoubleClick={(e) => {
              if (!onTitleEdit) return
              e.stopPropagation()
              setEditing(true)
              setEditValue(bar.title)
            }}
          >
            {editing ? (
              <input
                autoFocus
                value={editValue}
                onChange={e => setEditValue(e.target.value)}
                onBlur={() => {
                  setEditing(false)
                  if (editValue.trim() && editValue !== bar.title) onTitleEdit?.(editValue.trim())
                }}
                onKeyDown={e => {
                  if (e.key === 'Enter') { setEditing(false); if (editValue.trim() && editValue !== bar.title) onTitleEdit?.(editValue.trim()) }
                  if (e.key === 'Escape') { setEditing(false); setEditValue(bar.title) }
                }}
                onClick={e => e.stopPropagation()}
                className="w-full bg-transparent text-[10px] font-semibold text-white outline-none border-b border-white/50"
              />
            ) : (
              <span className="truncate text-[10px] font-semibold text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.3)] leading-tight">
                {bar.title}
              </span>
            )}
          </div>
        )}

        {/* Progress text */}
        {showProgress && bar.progress != null && width >= MIN_LABEL_PX + 40 && (
          <div className="absolute right-2 inset-y-0 flex items-center">
            <span className="text-[9px] font-bold text-white/80 tabular-nums drop-shadow-sm">
              {bar.progress}%
            </span>
          </div>
        )}

        {/* Left resize handle */}
        {bar.resizable && (
          <div
            className="absolute left-0 top-0 bottom-0 w-2 cursor-w-resize z-30 opacity-0 hover:opacity-100 bg-white/30 rounded-l-[5px]"
            onMouseDown={e => handleMouseDown(e, 'left')}
          />
        )}

        {/* Right resize handle */}
        {bar.resizable && (
          <div
            className="absolute right-0 top-0 bottom-0 w-2 cursor-e-resize z-30 opacity-0 hover:opacity-100 bg-white/30 rounded-r-[5px]"
            onMouseDown={e => handleMouseDown(e, 'right')}
          />
        )}

        {/* Progress drag handle — small triangle at the progress boundary */}
        {showProgress && bar.progress != null && onProgressChange && width >= 30 && (
          <div
            className="absolute bottom-0 z-30 cursor-ew-resize group/prog"
            style={{ left: `${Math.min(100, bar.progress)}%`, transform: 'translateX(-4px)' }}
            onMouseDown={(e) => {
              e.preventDefault()
              e.stopPropagation()
              const startX = e.clientX
              const startProg = bar.progress ?? 0
              const onMove = (ev: MouseEvent) => {
                const dx = ev.clientX - startX
                const deltaPct = Math.round((dx / width) * 100)
                const newProg = Math.max(0, Math.min(100, startProg + deltaPct))
                onProgressChange(newProg)
              }
              const onUp = () => {
                document.removeEventListener('mousemove', onMove)
                document.removeEventListener('mouseup', onUp)
              }
              document.addEventListener('mousemove', onMove)
              document.addEventListener('mouseup', onUp)
            }}
          >
            <div className="w-2 h-2 bg-white border border-black/20 rounded-sm shadow-sm opacity-0 group-hover/prog:opacity-100 transition-opacity" />
          </div>
        )}
      </div>
    </>
  )
}
