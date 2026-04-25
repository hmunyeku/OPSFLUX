/**
 * Gantt Engine — Shared time scale, cell builder, and positioning utilities.
 *
 * Extracted from ProjectGanttView for reuse across Projets, Planner, and
 * any future module needing a Gantt chart.
 */

// ── Types ────────────────────────────────────────────────────────

export type TimeScale = 'day' | 'week' | 'month' | 'quarter' | 'semester'

export interface TimeCell {
  key: string
  label: string
  startDate: Date
  endDate: Date
  days: number
}

export interface HeaderGroup {
  key: string
  label: string
  spanCells: number
}

export const SCALE_META: Record<TimeScale, {
  label: string
  pxPerDay: number
  defaultMonths: number
  shiftDays: number
}> = {
  day:      { label: 'Jour',      pxPerDay: 40,  defaultMonths: 1,  shiftDays: 7 },
  week:     { label: 'Semaine',   pxPerDay: 16,  defaultMonths: 3,  shiftDays: 14 },
  month:    { label: 'Mois',      pxPerDay: 4,   defaultMonths: 12, shiftDays: 30 },
  quarter:  { label: 'Trimestre', pxPerDay: 1.5, defaultMonths: 24, shiftDays: 90 },
  semester: { label: 'Semestre',  pxPerDay: 0.8, defaultMonths: 36, shiftDays: 180 },
}

// ── Date helpers ─────────────────────────────────────────────────

/**
 * Serialize a Date as YYYY-MM-DD using its LOCAL year/month/day components.
 *
 * WHY NOT toISOString().slice(0,10):
 *   toISOString() first converts the instant to UTC, which shifts the date
 *   by ±1 day for any local timezone ≠ UTC. Example in Paris (UTC+1):
 *     new Date(2026, 0, 1).toISOString()  // "2025-12-31T23:00:00.000Z"
 *   So `toISO(new Date(2026, 0, 1))` would return "2025-12-31" instead of
 *   "2026-01-01". When that string was fed back into buildCells and parsed
 *   with `new Date("2025-12-31")` (which parses as UTC midnight), the year
 *   view got a phantom 1-day "Dec 2025" sliver cell before January and
 *   shifted every subsequent month index by one, causing the heatmap cells
 *   and bars to look decorrelated from the month header.
 *
 * Using the LOCAL components keeps the YYYY-MM-DD in sync with what
 * `new Date(y, m, d)` was meant to represent in the user's calendar.
 */
export const toISO = (d: Date) => {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
export const daysB = (a: string, b: string) => Math.ceil((new Date(b).getTime() - new Date(a).getTime()) / 86400000)
export const addD = (s: string, n: number) => { const d = new Date(s); d.setDate(d.getDate() + n); return toISO(d) }

export function getISOWeek(d: Date): number {
  const t = new Date(d.valueOf())
  t.setDate(t.getDate() + 3 - ((t.getDay() + 6) % 7))
  const y1 = new Date(t.getFullYear(), 0, 4)
  return 1 + Math.round(((t.getTime() - y1.getTime()) / 86400000 - 3 + ((y1.getDay() + 6) % 7)) / 7)
}

// ── Cell builder ─────────────────────────────────────────────────

export function buildCells(scale: TimeScale, start: Date, end: Date): TimeCell[] {
  const cells: TimeCell[] = []
  // Normalize to LOCAL midnight so a fractional-hour start/end — which
  // happens when a YYYY-MM-DD string is parsed with `new Date(...)` (always
  // UTC midnight) in a non-UTC timezone — doesn't create a phantom 1-day
  // cell at the head of the range. This guarantees clean Jan..Dec cells for
  // a year view even when older persisted timelines still contain pre-fix
  // off-by-one ISO strings.
  start = new Date(start.getFullYear(), start.getMonth(), start.getDate())
  end = new Date(end.getFullYear(), end.getMonth(), end.getDate())
  const cur = new Date(start)

  while (cur <= end) {
    if (scale === 'day') {
      const label = cur.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })
      const key = cur.toISOString().slice(0, 10)
      cells.push({ key, label, startDate: new Date(cur), endDate: new Date(cur), days: 1 })
      cur.setDate(cur.getDate() + 1)
    } else if (scale === 'week') {
      const day = cur.getDay()
      const mon = new Date(cur)
      if (day !== 1) mon.setDate(mon.getDate() - ((day + 6) % 7))
      const sun = new Date(mon); sun.setDate(mon.getDate() + 6)
      const cellEnd = sun > end ? end : sun
      const effectiveStart = mon < start ? start : mon
      const days = Math.ceil((cellEnd.getTime() - effectiveStart.getTime()) / 86400000) + 1
      const label = `S${String(getISOWeek(mon)).padStart(2, '0')}`
      const key = `w${mon.toISOString().slice(0, 10)}`
      cells.push({ key, label, startDate: effectiveStart, endDate: cellEnd, days: Math.max(1, days) })
      cur.setTime(sun.getTime()); cur.setDate(cur.getDate() + 1)
    } else if (scale === 'month') {
      const y = cur.getFullYear(); const m = cur.getMonth()
      const monthStart = new Date(y, m, 1)
      const monthEnd = new Date(y, m + 1, 0)
      const effectiveStart = monthStart < start ? start : monthStart
      const effectiveEnd = monthEnd > end ? end : monthEnd
      const days = Math.ceil((effectiveEnd.getTime() - effectiveStart.getTime()) / 86400000) + 1
      const label = cur.toLocaleDateString('fr-FR', { month: 'short' })
      const key = `m${y}-${String(m + 1).padStart(2, '0')}`
      cells.push({ key, label, startDate: effectiveStart, endDate: effectiveEnd, days: Math.max(1, days) })
      cur.setMonth(cur.getMonth() + 1); cur.setDate(1)
    } else if (scale === 'quarter') {
      const y = cur.getFullYear(); const q = Math.floor(cur.getMonth() / 3)
      const qStart = new Date(y, q * 3, 1)
      const qEnd = new Date(y, q * 3 + 3, 0)
      const effectiveStart = qStart < start ? start : qStart
      const effectiveEnd = qEnd > end ? end : qEnd
      const days = Math.ceil((effectiveEnd.getTime() - effectiveStart.getTime()) / 86400000) + 1
      const label = `T${q + 1}`
      const key = `q${y}-${q + 1}`
      cells.push({ key, label, startDate: effectiveStart, endDate: effectiveEnd, days: Math.max(1, days) })
      cur.setMonth(q * 3 + 3); cur.setDate(1)
    } else {
      const y = cur.getFullYear(); const s = cur.getMonth() < 6 ? 0 : 1
      const sStart = new Date(y, s * 6, 1)
      const sEnd = new Date(y, s * 6 + 6, 0)
      const effectiveStart = sStart < start ? start : sStart
      const effectiveEnd = sEnd > end ? end : sEnd
      const days = Math.ceil((effectiveEnd.getTime() - effectiveStart.getTime()) / 86400000) + 1
      const label = `S${s + 1}`
      const key = `s${y}-${s + 1}`
      cells.push({ key, label, startDate: effectiveStart, endDate: effectiveEnd, days: Math.max(1, days) })
      cur.setMonth(s * 6 + 6); cur.setDate(1)
    }
  }
  return cells
}

// ── Header group builder ─────────────────────────────────────────

export function buildHeaderGroups(scale: TimeScale, cells: TimeCell[]): HeaderGroup[] {
  if (scale === 'day' || scale === 'week') {
    const groups: HeaderGroup[] = []
    let cur = ''
    for (const c of cells) {
      const ym = `${c.startDate.getFullYear()}-${c.startDate.getMonth()}`
      const label = c.startDate.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
      if (ym !== cur) { groups.push({ key: ym, label, spanCells: 1 }); cur = ym }
      else { groups[groups.length - 1].spanCells++ }
    }
    return groups
  }
  if (scale === 'month') {
    const groups: HeaderGroup[] = []
    let cur = -1
    for (const c of cells) {
      const y = c.startDate.getFullYear()
      if (y !== cur) { groups.push({ key: `y${y}`, label: String(y), spanCells: 1 }); cur = y }
      else { groups[groups.length - 1].spanCells++ }
    }
    return groups
  }
  // quarter/semester: group by year
  const groups: HeaderGroup[] = []
  let cur = -1
  for (const c of cells) {
    const y = c.startDate.getFullYear()
    if (y !== cur) { groups.push({ key: `y${y}`, label: String(y), spanCells: 1 }); cur = y }
    else { groups[groups.length - 1].spanCells++ }
  }
  return groups
}

// ── Bar positioning ──────────────────────────────────────────────

/** Compute bar pixel position. Returns null when entirely outside the view. */
export function computeBar(
  viewStart: string, startISO: string, endISO: string,
  pxPerDay: number, totalViewDays: number,
): { left: number; width: number } | null {
  const s = daysB(viewStart, startISO)
  const e = daysB(viewStart, endISO)
  if (e < 0 || s > totalViewDays) return null
  const cl = Math.max(0, s)
  const cr = Math.min(totalViewDays, e)
  return { left: cl * pxPerDay, width: Math.max(pxPerDay * 0.5, (cr - cl + 1) * pxPerDay) }
}

// ── Color maps ───────────────────────────────────────────────────

export const STATUS_COLORS: Record<string, string> = {
  draft: '#9ca3af', planned: '#60a5fa', active: '#22c55e', on_hold: '#fbbf24',
  completed: '#10b981', cancelled: '#ef4444',
  todo: '#9ca3af', in_progress: '#3b82f6', review: '#eab308', done: '#22c55e',
  submitted: '#8b5cf6', validated: '#10b981', rejected: '#ef4444',
}

export const PRIORITY_COLORS: Record<string, string> = {
  low: '#9ca3af', medium: '#3b82f6', high: '#f59e0b', critical: '#ef4444',
}

export const TYPE_COLORS: Record<string, string> = {
  project: '#3b82f6', workover: '#f59e0b', drilling: '#ef4444',
  integrity: '#8b5cf6', maintenance: '#06b6d4', permanent_ops: '#6b7280',
  inspection: '#22c55e', event: '#ec4899',
}

// ── Contrast helper ──────────────────────────────────────────────

/**
 * Parse an RGB or #HEX color and return its per-channel 0..1 values.
 * Returns null if the color can't be parsed (e.g. named colors, rgba with
 * non-numeric values, etc.) — callers should fall back to a neutral text
 * color in that case.
 */
function parseColor(color: string): { r: number; g: number; b: number } | null {
  const trimmed = color.trim()
  // #rgb / #rrggbb / #rrggbbaa
  if (trimmed.startsWith('#')) {
    const hex = trimmed.slice(1)
    if (hex.length === 3) {
      return {
        r: parseInt(hex[0] + hex[0], 16) / 255,
        g: parseInt(hex[1] + hex[1], 16) / 255,
        b: parseInt(hex[2] + hex[2], 16) / 255,
      }
    }
    if (hex.length === 6 || hex.length === 8) {
      return {
        r: parseInt(hex.slice(0, 2), 16) / 255,
        g: parseInt(hex.slice(2, 4), 16) / 255,
        b: parseInt(hex.slice(4, 6), 16) / 255,
      }
    }
    return null
  }
  // rgb(...) or rgba(...)
  const m = trimmed.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/)
  if (m) {
    return { r: Number(m[1]) / 255, g: Number(m[2]) / 255, b: Number(m[3]) / 255 }
  }
  return null
}

/**
 * WCAG relative luminance of a color.
 * Returns a value in [0, 1] where 0 is black and 1 is white.
 */
export function relativeLuminance(color: string): number {
  const rgb = parseColor(color)
  if (!rgb) return 0.5 // unknown — assume mid gray
  const toLinear = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4))
  const R = toLinear(rgb.r)
  const G = toLinear(rgb.g)
  const B = toLinear(rgb.b)
  return 0.2126 * R + 0.7152 * G + 0.0722 * B
}

/**
 * Pick a readable text color (black or white) for any background color.
 * Uses the WCAG relative luminance heuristic: switch to white when the
 * background is dark enough. Threshold 0.55 puts the crossover a bit below
 * mid-gray so near-gray colors still read as dark text on light bg.
 */
export function textColorForBackground(bg: string): string {
  return relativeLuminance(bg) > 0.55 ? 'rgba(15, 23, 42, 0.85)' : 'rgba(255, 255, 255, 0.95)'
}

// ── Default date range ───────────────────────────────────────────

export function getDefaultDateRange(scale: TimeScale): { start: string; end: string } {
  const now = new Date()
  const { defaultMonths } = SCALE_META[scale]
  const start = new Date(now.getFullYear(), now.getMonth(), 1)
  const end = new Date(now.getFullYear(), now.getMonth() + defaultMonths, 0)
  return { start: toISO(start), end: toISO(end) }
}
