/**
 * GanttTooltip — Rich floating tooltip for Gantt bars.
 *
 * Shows: title, status badge with color, progress bar, date range,
 * and custom key-value detail lines. Auto-positions to stay in viewport.
 */
import { cn } from '@/lib/utils'
import { STATUS_COLORS } from './ganttEngine'
import type { GanttBarData } from './ganttTypes'

interface GanttTooltipProps {
  bar: GanttBarData
  x: number
  y: number
  containerRect: DOMRect
  showProgress?: boolean
}

function resolveColor(bar: GanttBarData): string {
  if (bar.color) return bar.color
  if (bar.status && STATUS_COLORS[bar.status]) return STATUS_COLORS[bar.status]
  return '#3b82f6'
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('fr-FR', {
      day: '2-digit', month: 'short', year: 'numeric',
    })
  } catch {
    return iso
  }
}

export function GanttTooltip({ bar, x, y, containerRect, showProgress = true }: GanttTooltipProps) {
  const tipW = 300
  const tipH = 220

  // Keep tooltip in viewport
  const left = x + tipW + 20 > window.innerWidth
    ? Math.max(8, x - tipW - 10 - containerRect.left)
    : x - containerRect.left + 14
  const top = y + tipH > window.innerHeight
    ? Math.max(8, y - tipH - containerRect.top)
    : y - containerRect.top - 8

  const color = resolveColor(bar)

  return (
    <div
      className="absolute z-[100] pointer-events-none"
      style={{ left, top }}
    >
      <div
        className={cn(
          'bg-popover border border-border rounded-xl shadow-2xl overflow-hidden',
          'backdrop-blur-sm',
        )}
        style={{ width: tipW }}
      >
        {/* Color accent bar at top */}
        <div className="h-1" style={{ backgroundColor: color }} />

        <div className="p-3 space-y-2">
          {/* Title */}
          <div>
            <div className="font-semibold text-sm text-foreground leading-tight truncate">{bar.title}</div>
            {bar.type && (
              <span className="text-[10px] text-muted-foreground uppercase tracking-wide">{bar.type.replace(/_/g, ' ')}</span>
            )}
          </div>

          {/* Status badge + priority */}
          <div className="flex items-center gap-2">
            {bar.status && (
              <span
                className="text-[11px] px-2 py-0.5 rounded-full font-medium"
                style={{
                  backgroundColor: color + '18',
                  color,
                }}
              >
                {bar.status.replace(/_/g, ' ')}
              </span>
            )}
            {bar.priority && (
              <span className={cn(
                'text-[10px] px-1.5 py-0.5 rounded font-medium uppercase',
                bar.priority === 'critical' ? 'bg-red-100 text-red-700' :
                bar.priority === 'high' ? 'bg-orange-100 text-orange-700' :
                bar.priority === 'medium' ? 'bg-blue-100 text-blue-700' :
                'bg-gray-100 text-gray-600',
              )}>
                {bar.priority}
              </span>
            )}
          </div>

          {/* Progress bar */}
          {showProgress && bar.progress != null && (
            <div className="flex items-center gap-2">
              <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${Math.min(100, bar.progress)}%`,
                    backgroundColor: color,
                  }}
                />
              </div>
              <span className="text-xs tabular-nums font-semibold" style={{ color }}>
                {bar.progress}%
              </span>
            </div>
          )}

          {/* Dates */}
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>{formatDate(bar.startDate)}</span>
            <span className="text-muted-foreground/40">→</span>
            <span>{formatDate(bar.endDate)}</span>
          </div>

          {/* Baseline dates (if different) */}
          {bar.baselineStart && bar.baselineEnd && (
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground/60 italic">
              <span>Prévu:</span>
              <span>{formatDate(bar.baselineStart)}</span>
              <span>→</span>
              <span>{formatDate(bar.baselineEnd)}</span>
            </div>
          )}

          {/* Custom detail lines */}
          {bar.tooltipLines && bar.tooltipLines.length > 0 && (
            <div className="border-t border-border/50 pt-2 mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
              {bar.tooltipLines.map(([k, v], i) => (
                <div key={i} className="contents">
                  <span className="text-muted-foreground whitespace-nowrap">{k}</span>
                  <span className="truncate text-foreground font-medium">{v}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
