/**
 * GanttHeader — Dual-row timeline header with scale selector and navigation.
 *
 * Row 1: Group row (months when viewing days/weeks, years when viewing months+)
 * Row 2: Detail row (individual days/weeks/months/quarters/semesters)
 *
 * Weekend cells highlighted. Synced scroll with body.
 *
 * Label formats are ADAPTIVE — we don't use the static label baked into
 * `cells` but recompute at render time based on the actual pixel width
 * each cell is going to get. This lets a narrow day cell fall back to a
 * single-letter weekday ("L") while a wider one shows the full word
 * ("Lundi"). Same pattern for months (J / Jan / Janvier) and the header
 * group row (25 / 2025 at the year level).
 */
import { forwardRef, useMemo } from 'react'
import { cn } from '@/lib/utils'
import type { TimeCell, HeaderGroup, TimeScale } from './ganttEngine'

const HEADER_ROW_H = 28

// Adaptive label breakpoints — tuned so the widest form always fits
// comfortably inside the cell with a couple of pixels of breathing room.
const DAY_BREAKPOINTS = { narrow: 22, medium: 44 } // px
const MONTH_BREAKPOINTS = { narrow: 32, medium: 64 }
const YEAR_GROUP_BREAKPOINTS = { narrow: 36 } // below → "25" instead of "2025"

// Fr-friendly weekday letters (Monday-first is conventional in France,
// but Date.getDay() returns 0=Sunday … so we index by that).
const WEEKDAY_LETTER = ['D', 'L', 'M', 'M', 'J', 'V', 'S']
const WEEKDAY_SHORT = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam']
const WEEKDAY_FULL = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi']

const MONTH_LETTER = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D']
const MONTH_SHORT = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc']
const MONTH_FULL = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre']

function formatDetailLabel(
  scale: TimeScale,
  cell: TimeCell,
  width: number,
): string {
  const d = cell.startDate
  if (scale === 'day') {
    const dayOfWeek = d.getDay()
    if (width < DAY_BREAKPOINTS.narrow) return WEEKDAY_LETTER[dayOfWeek]
    if (width < DAY_BREAKPOINTS.medium) return WEEKDAY_SHORT[dayOfWeek]
    return WEEKDAY_FULL[dayOfWeek]
  }
  if (scale === 'week') {
    // Keep the existing "Sxx" week number — there's no meaningful 1-letter
    // form for a week, and "Semaine 34" is too long for any cell we're
    // likely to render (weeks are ~16px at default zoom). Compact ISO
    // week number is the right default.
    return cell.label
  }
  if (scale === 'month') {
    const m = d.getMonth()
    if (width < MONTH_BREAKPOINTS.narrow) return MONTH_LETTER[m]
    if (width < MONTH_BREAKPOINTS.medium) return MONTH_SHORT[m]
    return MONTH_FULL[m]
  }
  if (scale === 'quarter') {
    return cell.label // "T1" / "T2" etc, already short
  }
  // semester: "S1" / "S2"
  return cell.label
}

function formatGroupLabel(
  scale: TimeScale,
  label: string,
  width: number,
): string {
  // Year groups on month/quarter/semester scale: fall back to the
  // 2-digit year suffix when the group is too narrow for the full
  // "2026" to fit. Day / week scales use "Month Year" groups where
  // truncation is already handled by `truncate` on the container.
  if (scale === 'month' || scale === 'quarter' || scale === 'semester') {
    if (/^\d{4}$/.test(label) && width < YEAR_GROUP_BREAKPOINTS.narrow) {
      return label.slice(2) // "2026" → "26"
    }
  }
  return label
}

interface GanttHeaderProps {
  cells: TimeCell[]
  headerGroups: HeaderGroup[]
  cellWidths: number[]
  totalWidth: number
  showWeekends?: boolean
  scale?: TimeScale
}

export const GanttHeader = forwardRef<HTMLDivElement, GanttHeaderProps>(
  function GanttHeader(
    { cells, headerGroups, cellWidths, totalWidth, showWeekends = true, scale = 'day' },
    ref,
  ) {

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
                {formatGroupLabel(scale, g.label, groupWidths[i])}
              </div>
            ))}
          </div>

          {/* Detail row */}
          <div className="flex" style={{ height: HEADER_ROW_H }}>
            {cells.map((c, i) => {
              const isWeekend = showWeekends && (c.startDate.getDay() === 0 || c.startDate.getDay() === 6)
              const isToday = c.key === new Date().toISOString().slice(0, 10)
              const width = cellWidths[i]
              // Month boundary marker: on day scale, emphasise the
              // first day of each month with a stronger left border so
              // the user can instantly see where one month ends and the
              // next begins without reading any label text.
              const isMonthBoundary = scale === 'day' && c.startDate.getDate() === 1
              return (
                <div
                  key={c.key}
                  className={cn(
                    'flex items-center justify-center text-[10px] text-muted-foreground border-r border-border/30 truncate overflow-hidden',
                    isWeekend && 'bg-muted/40 text-muted-foreground/50',
                    isToday && 'bg-primary/10 font-semibold text-primary',
                    isMonthBoundary && 'border-l-2 border-l-border/70',
                  )}
                  style={{ width, minWidth: 0 }}
                >
                  {formatDetailLabel(scale, c, width)}
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
