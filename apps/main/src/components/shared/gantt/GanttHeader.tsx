/**
 * GanttHeader — Dual-row timeline header with scale selector and navigation.
 *
 * Row 1: Group row (months when viewing days/weeks, years when viewing months+)
 * Row 2: Detail row (individual days/weeks/months/quarters/semesters)
 *
 * Weekend cells highlighted. Synced scroll with body.
 */
import { forwardRef, useMemo } from 'react'
import { cn } from '@/lib/utils'
import type { TimeCell, HeaderGroup } from './ganttEngine'

const HEADER_ROW_H = 28

interface GanttHeaderProps {
  cells: TimeCell[]
  headerGroups: HeaderGroup[]
  cellWidths: number[]
  totalWidth: number
  showWeekends?: boolean
}

export const GanttHeader = forwardRef<HTMLDivElement, GanttHeaderProps>(
  function GanttHeader({ cells, headerGroups, cellWidths, totalWidth, showWeekends = true }, ref) {

    // Compute group widths from cell widths
    const groupWidths = useMemo(() => {
      const widths: number[] = []
      let cellIdx = 0
      for (const g of headerGroups) {
        let w = 0
        for (let i = 0; i < g.spanCells && cellIdx < cellWidths.length; i++) {
          w += cellWidths[cellIdx++]
        }
        widths.push(w)
      }
      return widths
    }, [headerGroups, cellWidths])

    return (
      <div
        ref={ref}
        className="overflow-hidden border-b shrink-0 bg-muted/20"
        style={{ height: HEADER_ROW_H * 2 }}
      >
        <div style={{ width: totalWidth, minWidth: totalWidth }}>
          {/* Group row */}
          <div className="flex" style={{ height: HEADER_ROW_H }}>
            {headerGroups.map((g, i) => (
              <div
                key={g.key}
                className="flex items-center justify-center text-[11px] font-semibold text-foreground/70 border-r border-b border-border/40 truncate"
                style={{ width: groupWidths[i], minWidth: 0 }}
              >
                {g.label}
              </div>
            ))}
          </div>

          {/* Detail row */}
          <div className="flex" style={{ height: HEADER_ROW_H }}>
            {cells.map((c, i) => {
              const isWeekend = showWeekends && (c.startDate.getDay() === 0 || c.startDate.getDay() === 6)
              const isToday = c.key === new Date().toISOString().slice(0, 10)
              return (
                <div
                  key={c.key}
                  className={cn(
                    'flex items-center justify-center text-[10px] text-muted-foreground border-r border-border/30 truncate',
                    isWeekend && 'bg-muted/40 text-muted-foreground/50',
                    isToday && 'bg-primary/10 font-semibold text-primary',
                  )}
                  style={{ width: cellWidths[i], minWidth: 0 }}
                >
                  {c.label}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    )
  }
)

export { HEADER_ROW_H }
