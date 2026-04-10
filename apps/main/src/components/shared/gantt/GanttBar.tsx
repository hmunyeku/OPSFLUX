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
import { useCallback, useState } from 'react'
import { cn } from '@/lib/utils'
import { addD, STATUS_COLORS, PRIORITY_COLORS, TYPE_COLORS, textColorForBackground } from './ganttEngine'
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
  /** Per-cell left offsets in body coords (used to align bar.cellLabels) */
  cellLefts?: number[]
  /** Per-cell widths (used to align bar.cellLabels) */
  cellWidths?: number[]
  onClick?: () => void
  onDrag?: (newStart: string, newEnd: string) => void
  onResize?: (edge: 'left' | 'right', newDate: string) => void
  onTitleEdit?: (newTitle: string) => void
  onProgressChange?: (newProgress: number) => void
  onLinkStart?: (barId: string, edge: 'start' | 'end', x: number, y: number) => void
  onHover?: (e: React.MouseEvent) => void
  onLeave?: () => void
  onRightClick?: (e: React.MouseEvent) => void
}

export function GanttBarComponent({
  bar, left, width, top, barHeight, pxPerDay,
  showProgress, showLabels, showBaselines,
  baselineLeft, baselineWidth,
  cellLefts, cellWidths,
  onClick, onDrag, onResize, onTitleEdit, onProgressChange, onLinkStart, onHover, onLeave, onRightClick,
}: GanttBarProps) {
  const color = resolveBarColor(bar)
  // Pick black or white text for every on-bar label based on bar luminance.
  // The draft opacity (0.5) doesn't matter for the base contrast choice.
  const labelColor = textColorForBackground(color)
  const [editing, setEditing] = useState(false)
  const [editValue, setEditValue] = useState(bar.title)

  // ── Live drag / resize preview ──
  // During a drag we keep a local state { dxDays, mode } that offsets the
  // bar visually WITHOUT calling onDrag / onResize until the user releases
  // the mouse. This avoids the cascade of notifications that was happening
  // when every day-delta was committed mid-drag, and gives the user a
  // real-time visual feedback of the proposed position.
  const [preview, setPreview] = useState<{ mode: 'move' | 'left' | 'right'; dxDays: number } | null>(null)

  const handleMouseDown = useCallback((e: React.MouseEvent, mode: 'move' | 'left' | 'right') => {
    if (mode === 'move' && !bar.draggable) return
    if ((mode === 'left' || mode === 'right') && !bar.resizable) return
    e.preventDefault()
    e.stopPropagation()

    const originX = e.clientX
    let currentDelta = 0

    const onMove = (ev: MouseEvent) => {
      const dx = ev.clientX - originX
      const deltaDays = Math.round(dx / pxPerDay)
      if (deltaDays === currentDelta) return
      currentDelta = deltaDays
      setPreview({ mode, dxDays: deltaDays })
    }

    const onUp = () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      setPreview(null)
      // Single commit on mouseup with the accumulated delta
      if (currentDelta !== 0) {
        if (mode === 'move' && onDrag) {
          onDrag(addD(bar.startDate, currentDelta), addD(bar.endDate, currentDelta))
        } else if (mode === 'left' && onResize) {
          onResize('left', addD(bar.startDate, currentDelta))
        } else if (mode === 'right' && onResize) {
          onResize('right', addD(bar.endDate, currentDelta))
        }
      }
    }

    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [bar, pxPerDay, onDrag, onResize])

  // Compute the visual offset applied during drag. For 'move' both edges
  // shift by the same delta; for 'left'/'right' only the corresponding edge.
  const previewPx = preview ? preview.dxDays * pxPerDay : 0
  let visualLeft = left
  let visualWidth = width
  let previewStartISO = bar.startDate
  let previewEndISO = bar.endDate
  if (preview) {
    if (preview.mode === 'move') {
      visualLeft = left + previewPx
      previewStartISO = addD(bar.startDate, preview.dxDays)
      previewEndISO = addD(bar.endDate, preview.dxDays)
    } else if (preview.mode === 'left') {
      visualLeft = left + previewPx
      visualWidth = Math.max(4, width - previewPx)
      previewStartISO = addD(bar.startDate, preview.dxDays)
    } else if (preview.mode === 'right') {
      visualWidth = Math.max(4, width + previewPx)
      previewEndISO = addD(bar.endDate, preview.dxDays)
    }
  }

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
          preview && 'ring-2 ring-primary/60 shadow-lg',
        )}
        style={{
          left: visualLeft,
          top,
          width: Math.max(4, visualWidth),
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

        {/* Bar label — cellLabels takes priority over title.
            cellLabels render one centered label per intersected timeline cell,
            so the bar shows its PAX values aligned with each day/week/month. */}
        {showLabels && bar.cellLabels && bar.cellLabels.length > 0 && cellLefts && cellWidths ? (
          <div className="absolute inset-0 pointer-events-none">
            {bar.cellLabels.map((cl) => {
              const cw = cellWidths[cl.cellIdx]
              if (cw == null || cw < 14) return null
              const localX = cellLefts[cl.cellIdx] - visualLeft
              return (
                <div
                  key={`cl-${cl.cellIdx}`}
                  className="absolute inset-y-0 flex items-center justify-center text-[9px] font-semibold tabular-nums drop-shadow-[0_1px_1px_rgba(0,0,0,0.25)] leading-tight"
                  style={{ left: localX, width: cw, color: labelColor }}
                >
                  {cl.label}
                </div>
              )
            })}
          </div>
        ) : showLabels && width >= MIN_LABEL_PX && bar.title ? (
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
                className="w-full bg-transparent text-[10px] font-semibold outline-none border-b border-current/50"
                style={{ color: labelColor }}
              />
            ) : (
              <span
                className="truncate text-[10px] font-semibold drop-shadow-[0_1px_1px_rgba(0,0,0,0.2)] leading-tight"
                style={{ color: labelColor }}
              >
                {bar.title}
              </span>
            )}
          </div>
        ) : null}

        {/* Progress text is now rendered OUTSIDE the bar (in GanttCore),
            on the opposite side of the external activity title. This avoids
            overlapping the last per-cell PAX label. */}

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
        {/* Connection points — drag to create dependency */}
        {onLinkStart && (
          <>
            {/* Left (start) connection point */}
            <div
              className="absolute -left-1.5 top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-primary border-2 border-white shadow-sm z-40 cursor-crosshair opacity-0 group-hover:opacity-100 transition-opacity"
              onMouseDown={(e) => {
                e.preventDefault()
                e.stopPropagation()
                const rect = (e.target as HTMLElement).getBoundingClientRect()
                onLinkStart(bar.id, 'start', rect.left + rect.width / 2, rect.top + rect.height / 2)
              }}
            />
            {/* Right (end) connection point */}
            <div
              className="absolute -right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-primary border-2 border-white shadow-sm z-40 cursor-crosshair opacity-0 group-hover:opacity-100 transition-opacity"
              onMouseDown={(e) => {
                e.preventDefault()
                e.stopPropagation()
                const rect = (e.target as HTMLElement).getBoundingClientRect()
                onLinkStart(bar.id, 'end', rect.left + rect.width / 2, rect.top + rect.height / 2)
              }}
            />
          </>
        )}
      </div>

      {/* Preview date tooltip — shows the proposed new dates while dragging */}
      {preview && (
        <div
          className="absolute z-50 pointer-events-none rounded-md bg-foreground text-background text-[10px] font-semibold px-2 py-1 shadow-lg whitespace-nowrap tabular-nums"
          style={{
            left: visualLeft + visualWidth / 2,
            top: top - 22,
            transform: 'translateX(-50%)',
          }}
        >
          {previewStartISO} → {previewEndISO}
          {preview.dxDays !== 0 && (
            <span className="ml-1 opacity-70">
              ({preview.dxDays > 0 ? '+' : ''}{preview.dxDays}j)
            </span>
          )}
        </div>
      )}
    </>
  )
}
