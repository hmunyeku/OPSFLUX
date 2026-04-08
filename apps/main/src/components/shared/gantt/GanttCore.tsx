/**
 * GanttCore — Shared Gantt chart renderer for Projets and Planner modules.
 *
 * Pure rendering component: takes generic rows, bars, and dependencies,
 * produces a full-featured interactive Gantt chart. No data fetching.
 */

import React, { useState, useMemo, useCallback, useRef } from 'react'
import { ChevronLeft, ChevronRight, ChevronDown, ChevronRight as ChevronCollapsed, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  type TimeScale, SCALE_META, buildCells, buildHeaderGroups, computeBar,
  toISO, daysB, addD, STATUS_COLORS, PRIORITY_COLORS, TYPE_COLORS, getDefaultDateRange,
} from './ganttEngine'

// ── Public interfaces ───────────────────────────────────────────

export interface GanttRow {
  id: string
  label: string
  sublabel?: string
  level: number
  hasChildren: boolean
  color?: string
}

export interface GanttBarData {
  id: string
  rowId: string
  title: string
  startDate: string
  endDate: string
  progress?: number
  color?: string
  status?: string
  priority?: string
  type?: string
  isMilestone?: boolean
  isDraft?: boolean
  isCritical?: boolean
  tooltipLines?: [string, string][]
}

export interface GanttDependencyData {
  fromId: string
  toId: string
  type: 'FS' | 'SS' | 'FF' | 'SF'
  isCritical?: boolean
}

export interface GanttCoreProps {
  rows: GanttRow[]
  bars: GanttBarData[]
  dependencies?: GanttDependencyData[]
  initialScale?: TimeScale
  initialStart?: string
  initialEnd?: string
  barHeight?: number
  rowHeight?: number
  showProgress?: boolean
  showLabels?: boolean
  showToday?: boolean
  onBarClick?: (barId: string) => void
  onBarDrag?: (barId: string, newStart: string, newEnd: string) => void
  expandedRows?: Set<string>
  onToggleRow?: (rowId: string) => void
  emptyMessage?: string
  isLoading?: boolean
}

// ── Constants ───────────────────────────────────────────────────

const SCALES: TimeScale[] = ['day', 'week', 'month', 'quarter', 'semester']
const HEADER_ROW_H = 28
const HEADER_TOTAL_H = HEADER_ROW_H * 2
const MIN_BAR_LABEL_PX = 60

// ── Helpers ─────────────────────────────────────────────────────

function resolveBarColor(bar: GanttBarData): string {
  if (bar.color) return bar.color
  if (bar.status && STATUS_COLORS[bar.status]) return STATUS_COLORS[bar.status]
  if (bar.priority && PRIORITY_COLORS[bar.priority]) return PRIORITY_COLORS[bar.priority]
  if (bar.type && TYPE_COLORS[bar.type]) return TYPE_COLORS[bar.type]
  return '#3b82f6'
}

/** Build widths for header groups by summing the days of their spanned cells. */
function groupWidths(
  groups: ReturnType<typeof buildHeaderGroups>,
  cells: ReturnType<typeof buildCells>,
  pxPerDay: number,
): number[] {
  const widths: number[] = []
  let cellIdx = 0
  for (const g of groups) {
    let days = 0
    for (let i = 0; i < g.spanCells; i++) {
      days += cells[cellIdx]?.days ?? 0
      cellIdx++
    }
    widths.push(days * pxPerDay)
  }
  return widths
}

// ── Component ───────────────────────────────────────────────────

export function GanttCore(props: GanttCoreProps) {
  const {
    rows, bars, dependencies = [],
    initialScale = 'month',
    initialStart, initialEnd,
    barHeight = 24,
    rowHeight = 36,
    showProgress = true,
    showLabels = true,
    showToday = true,
    onBarClick, onBarDrag,
    expandedRows, onToggleRow,
    emptyMessage = 'Aucune donnee a afficher',
    isLoading = false,
  } = props

  // ── State ─────────────────────────────────────────────────────

  const [scale, setScale] = useState<TimeScale>(initialScale)
  const [viewStart, setViewStart] = useState(() => initialStart ?? getDefaultDateRange(initialScale).start)
  const [viewEnd, setViewEnd] = useState(() => initialEnd ?? getDefaultDateRange(initialScale).end)
  const [panelWidth, setPanelWidth] = useState(240)
  const [tooltip, setTooltip] = useState<{ bar: GanttBarData; x: number; y: number } | null>(null)
  const [dragState, setDragState] = useState<{
    barId: string; originX: number; startDate: string; endDate: string; deltaDays: number
  } | null>(null)

  const containerRef = useRef<HTMLDivElement>(null)
  const resizingRef = useRef(false)
  const headerScrollRef = useRef<HTMLDivElement>(null)
  const bodyScrollRef = useRef<HTMLDivElement>(null)
  const panelBodyRef = useRef<HTMLDivElement>(null)

  // ── Derived data ──────────────────────────────────────────────

  const meta = SCALE_META[scale]

  const cells = useMemo(
    () => buildCells(scale, new Date(viewStart), new Date(viewEnd)),
    [scale, viewStart, viewEnd],
  )
  const headerGroups = useMemo(() => buildHeaderGroups(scale, cells), [scale, cells])
  const totalDays = useMemo(() => cells.reduce((s, c) => s + c.days, 0), [cells])
  const totalWidth = totalDays * meta.pxPerDay

  const grpWidths = useMemo(
    () => groupWidths(headerGroups, cells, meta.pxPerDay),
    [headerGroups, cells, meta.pxPerDay],
  )
  const cellWidths = useMemo(
    () => cells.map(c => c.days * meta.pxPerDay),
    [cells, meta.pxPerDay],
  )

  // Bar lookup by row
  const barsByRow = useMemo(() => {
    const m = new Map<string, GanttBarData[]>()
    for (const b of bars) {
      const list = m.get(b.rowId) ?? []
      list.push(b)
      m.set(b.rowId, list)
    }
    return m
  }, [bars])

  // Bar positions keyed by bar id
  const barPositions = useMemo(() => {
    const map = new Map<string, { left: number; width: number; rowIdx: number }>()
    rows.forEach((row, idx) => {
      for (const bar of barsByRow.get(row.id) ?? []) {
        const pos = computeBar(viewStart, bar.startDate, bar.endDate, meta.pxPerDay, totalDays)
        if (pos) map.set(bar.id, { ...pos, rowIdx: idx })
      }
    })
    return map
  }, [rows, barsByRow, viewStart, meta.pxPerDay, totalDays])

  // Today line
  const todayISO = toISO(new Date())
  const todayPx = useMemo(() => {
    const d = daysB(viewStart, todayISO)
    if (d < 0 || d > totalDays) return null
    return d * meta.pxPerDay
  }, [viewStart, todayISO, totalDays, meta.pxPerDay])

  // ── Navigation ────────────────────────────────────────────────

  const shift = useCallback((dir: -1 | 1) => {
    const d = meta.shiftDays * dir
    setViewStart(s => addD(s, d))
    setViewEnd(s => addD(s, d))
  }, [meta.shiftDays])

  const changeScale = useCallback((s: TimeScale) => {
    setScale(s)
    const r = getDefaultDateRange(s)
    setViewStart(r.start)
    setViewEnd(r.end)
  }, [])

  // ── Left panel resize ─────────────────────────────────────────

  const onResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    resizingRef.current = true
    const startX = e.clientX
    const startW = panelWidth
    const onMove = (ev: MouseEvent) => {
      if (!resizingRef.current) return
      setPanelWidth(Math.max(140, Math.min(500, startW + ev.clientX - startX)))
    }
    const onUp = () => {
      resizingRef.current = false
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [panelWidth])

  // ── Drag to reschedule ────────────────────────────────────────

  const onDragStart = useCallback((e: React.MouseEvent, bar: GanttBarData) => {
    if (!onBarDrag) return
    e.preventDefault()
    e.stopPropagation()
    const originX = e.clientX
    setDragState({ barId: bar.id, originX, startDate: bar.startDate, endDate: bar.endDate, deltaDays: 0 })

    const onMove = (ev: MouseEvent) => {
      const dd = Math.round((ev.clientX - originX) / meta.pxPerDay)
      setDragState(prev => prev ? { ...prev, deltaDays: dd } : null)
    }
    const onUp = (ev: MouseEvent) => {
      const dd = Math.round((ev.clientX - originX) / meta.pxPerDay)
      if (dd !== 0) onBarDrag(bar.id, addD(bar.startDate, dd), addD(bar.endDate, dd))
      setDragState(null)
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [onBarDrag, meta.pxPerDay])

  // ── Tooltip ───────────────────────────────────────────────────

  const showTooltipFor = useCallback((e: React.MouseEvent, bar: GanttBarData) => {
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    setTooltip({ bar, x: e.clientX - rect.left + 12, y: e.clientY - rect.top + 12 })
  }, [])

  const hideTooltip = useCallback(() => setTooltip(null), [])

  // ── Scroll sync (header <-> body, panel <-> body vertical) ───

  const onBodyScroll = useCallback(() => {
    if (headerScrollRef.current && bodyScrollRef.current) {
      headerScrollRef.current.scrollLeft = bodyScrollRef.current.scrollLeft
    }
    if (panelBodyRef.current && bodyScrollRef.current) {
      panelBodyRef.current.scrollTop = bodyScrollRef.current.scrollTop
    }
  }, [])

  // ── Loading / empty ───────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground gap-2">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span>Chargement...</span>
      </div>
    )
  }

  if (!rows.length) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
        {emptyMessage}
      </div>
    )
  }

  // ── Grid body height ──────────────────────────────────────────

  const bodyH = rows.length * rowHeight

  // ── Render ────────────────────────────────────────────────────

  return (
    <div ref={containerRef} className="relative flex flex-col border rounded-lg bg-background overflow-hidden select-none">

      {/* ── Toolbar ──────────────────────────────────────────── */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b bg-muted/40 text-sm shrink-0">
        <button onClick={() => shift(-1)} className="p-1 rounded hover:bg-muted transition-colors" title="Precedent">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button onClick={() => shift(1)} className="p-1 rounded hover:bg-muted transition-colors" title="Suivant">
          <ChevronRight className="h-4 w-4" />
        </button>

        <div className="flex items-center gap-0.5 ml-2 bg-muted rounded-md p-0.5">
          {SCALES.map(s => (
            <button
              key={s}
              onClick={() => changeScale(s)}
              className={cn(
                'px-2 py-0.5 rounded text-xs font-medium transition-colors',
                s === scale
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {SCALE_META[s].label}
            </button>
          ))}
        </div>

        <span className="ml-auto text-xs text-muted-foreground tabular-nums">
          {new Date(viewStart).toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' })}
          {' \u2014 '}
          {new Date(viewEnd).toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' })}
        </span>
      </div>

      {/* ── Body: left panel + resize handle + grid ──────────── */}
      <div className="flex flex-1 min-h-0 overflow-hidden">

        {/* ── Left panel ──────────────────────────────────────── */}
        <div className="flex flex-col shrink-0 border-r" style={{ width: panelWidth }}>
          <div
            className="flex items-end px-3 pb-1 text-xs font-semibold text-muted-foreground border-b bg-muted/30 shrink-0"
            style={{ height: HEADER_TOTAL_H }}
          >
            Tache
          </div>
          <div ref={panelBodyRef} className="flex-1 overflow-hidden">
            {rows.map((row, idx) => (
              <div
                key={row.id}
                className={cn(
                  'flex items-center gap-1 px-2 border-b text-sm',
                  idx % 2 === 0 ? 'bg-background' : 'bg-muted/20',
                )}
                style={{ height: rowHeight, paddingLeft: 8 + row.level * 16 }}
              >
                {row.hasChildren ? (
                  <button
                    onClick={() => onToggleRow?.(row.id)}
                    className="p-0.5 rounded hover:bg-muted transition-colors shrink-0"
                  >
                    {expandedRows?.has(row.id)
                      ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                      : <ChevronCollapsed className="h-3.5 w-3.5 text-muted-foreground" />}
                  </button>
                ) : (
                  <span className="w-[18px] shrink-0" />
                )}
                <div className="truncate min-w-0">
                  <span className="font-medium">{row.label}</span>
                  {row.sublabel && (
                    <span className="ml-1.5 text-xs text-muted-foreground">{row.sublabel}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Resize handle ───────────────────────────────────── */}
        <div
          className="w-1 cursor-col-resize hover:bg-primary/30 active:bg-primary/50 transition-colors shrink-0"
          onMouseDown={onResizeStart}
        />

        {/* ── Grid area ───────────────────────────────────────── */}
        <div className="flex flex-col flex-1 min-w-0 overflow-hidden">

          {/* Grid header — synced horizontally with body */}
          <div
            ref={headerScrollRef}
            className="overflow-hidden border-b shrink-0 bg-muted/30"
            style={{ height: HEADER_TOTAL_H }}
          >
            <div style={{ width: totalWidth, height: HEADER_TOTAL_H }}>
              {/* Group row (months / years) */}
              <div className="flex" style={{ height: HEADER_ROW_H }}>
                {headerGroups.map((g, i) => (
                  <div
                    key={g.key}
                    className="flex items-center justify-center text-xs font-semibold text-muted-foreground border-r border-b truncate"
                    style={{ width: grpWidths[i], minWidth: 0 }}
                  >
                    {g.label}
                  </div>
                ))}
              </div>
              {/* Detail row (days / weeks / months) */}
              <div className="flex" style={{ height: HEADER_ROW_H }}>
                {cells.map((c, i) => (
                  <div
                    key={c.key}
                    className="flex items-center justify-center text-[10px] text-muted-foreground border-r truncate"
                    style={{ width: cellWidths[i], minWidth: 0 }}
                  >
                    {c.label}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Grid body — scrollable */}
          <div
            ref={bodyScrollRef}
            className="flex-1 overflow-auto"
            onScroll={onBodyScroll}
          >
            <div className="relative" style={{ width: totalWidth, height: bodyH }}>

              {/* Row stripes + vertical grid lines */}
              {rows.map((_, idx) => (
                <div
                  key={idx}
                  className={cn('absolute left-0 border-b', idx % 2 === 0 ? 'bg-background' : 'bg-muted/20')}
                  style={{ top: idx * rowHeight, width: totalWidth, height: rowHeight }}
                />
              ))}

              {/* Column separators */}
              {(() => {
                let x = 0
                return cells.map((c, i) => {
                  const left = x
                  x += cellWidths[i]
                  return (
                    <div
                      key={c.key}
                      className="absolute top-0 bottom-0 border-r border-border/30"
                      style={{ left, height: bodyH }}
                    />
                  )
                })
              })()}

              {/* Today line */}
              {showToday && todayPx != null && (
                <div
                  className="absolute top-0 w-px bg-red-500 z-10 pointer-events-none"
                  style={{ left: todayPx, height: bodyH }}
                >
                  <div className="absolute -top-0 -left-[3px] w-[7px] h-[7px] bg-red-500 rounded-full" />
                </div>
              )}

              {/* Dependency arrows (SVG overlay) */}
              {dependencies.length > 0 && (
                <svg
                  className="absolute inset-0 pointer-events-none z-10"
                  width={totalWidth}
                  height={bodyH}
                >
                  <defs>
                    <marker
                      id="gantt-arrow"
                      markerWidth="8"
                      markerHeight="6"
                      refX="8"
                      refY="3"
                      orient="auto"
                    >
                      <path d="M 0 0 L 8 3 L 0 6 Z" fill="#94a3b8" />
                    </marker>
                    <marker
                      id="gantt-arrow-crit"
                      markerWidth="8"
                      markerHeight="6"
                      refX="8"
                      refY="3"
                      orient="auto"
                    >
                      <path d="M 0 0 L 8 3 L 0 6 Z" fill="#ef4444" />
                    </marker>
                  </defs>
                  {dependencies.map(dep => {
                    const from = barPositions.get(dep.fromId)
                    const to = barPositions.get(dep.toId)
                    if (!from || !to) return null

                    const fromCY = from.rowIdx * rowHeight + rowHeight / 2
                    const toCY = to.rowIdx * rowHeight + rowHeight / 2
                    let x1: number, y1: number, x2: number, y2: number

                    switch (dep.type) {
                      case 'FS': x1 = from.left + from.width; y1 = fromCY; x2 = to.left;              y2 = toCY; break
                      case 'SS': x1 = from.left;              y1 = fromCY; x2 = to.left;              y2 = toCY; break
                      case 'FF': x1 = from.left + from.width; y1 = fromCY; x2 = to.left + to.width;   y2 = toCY; break
                      case 'SF': x1 = from.left;              y1 = fromCY; x2 = to.left + to.width;   y2 = toCY; break
                    }

                    const midX = (x1 + x2) / 2
                    const d = `M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`
                    const crit = !!dep.isCritical

                    return (
                      <path
                        key={`${dep.fromId}-${dep.toId}`}
                        d={d}
                        fill="none"
                        stroke={crit ? '#ef4444' : '#94a3b8'}
                        strokeWidth={crit ? 2 : 1.5}
                        strokeDasharray={crit ? undefined : '4 2'}
                        markerEnd={crit ? 'url(#gantt-arrow-crit)' : 'url(#gantt-arrow)'}
                      />
                    )
                  })}
                </svg>
              )}

              {/* Bars */}
              {rows.map((row, rowIdx) => {
                const rBars = barsByRow.get(row.id) ?? []
                return rBars.map(bar => {
                  // Compute position — apply drag offset if this bar is being dragged
                  const isDragging = dragState?.barId === bar.id
                  const dragOffset = isDragging ? (dragState!.deltaDays * meta.pxPerDay) : 0
                  const pos = barPositions.get(bar.id)
                  if (!pos) return null

                  const left = pos.left + dragOffset
                  const width = pos.width
                  const top = rowIdx * rowHeight + (rowHeight - barHeight) / 2
                  const color = resolveBarColor(bar)

                  // Milestone: diamond shape
                  if (bar.isMilestone) {
                    const size = barHeight * 0.7
                    const cx = left + width / 2
                    const cy = top + barHeight / 2
                    return (
                      <div
                        key={bar.id}
                        className={cn(
                          'absolute z-20 cursor-pointer transition-transform hover:scale-110',
                          bar.isDraft && 'opacity-50',
                        )}
                        style={{
                          left: cx - size / 2,
                          top: cy - size / 2,
                          width: size,
                          height: size,
                          backgroundColor: color,
                          transform: 'rotate(45deg)',
                          borderRadius: 2,
                          boxShadow: bar.isCritical ? '0 0 0 2px #ef4444' : undefined,
                        }}
                        onClick={() => onBarClick?.(bar.id)}
                        onMouseMove={e => showTooltipFor(e, bar)}
                        onMouseLeave={hideTooltip}
                      />
                    )
                  }

                  // Regular bar
                  return (
                    <div
                      key={bar.id}
                      className={cn(
                        'absolute z-20 rounded-[4px] overflow-hidden cursor-pointer group',
                        'transition-shadow hover:shadow-md',
                        bar.isDraft && 'opacity-50',
                        onBarDrag && 'cursor-grab active:cursor-grabbing',
                      )}
                      style={{
                        left,
                        top,
                        width,
                        height: barHeight,
                        backgroundColor: color,
                        boxShadow: bar.isCritical ? `0 0 0 2px #ef4444, inset 0 0 0 0 transparent` : undefined,
                      }}
                      onClick={() => onBarClick?.(bar.id)}
                      onMouseDown={e => onDragStart(e, bar)}
                      onMouseMove={e => showTooltipFor(e, bar)}
                      onMouseLeave={hideTooltip}
                    >
                      {/* Progress fill */}
                      {showProgress && bar.progress != null && bar.progress > 0 && (
                        <div
                          className="absolute inset-y-0 left-0 bg-black/15 rounded-l-[4px]"
                          style={{ width: `${Math.min(100, bar.progress)}%` }}
                        />
                      )}

                      {/* Bar label */}
                      {showLabels && width >= MIN_BAR_LABEL_PX && (
                        <div className="absolute inset-0 flex items-center px-1.5 min-w-0">
                          <span className="truncate text-[10px] font-medium text-white drop-shadow-sm leading-tight">
                            {bar.title}
                          </span>
                        </div>
                      )}

                      {/* Progress text on the right */}
                      {showProgress && bar.progress != null && width >= MIN_BAR_LABEL_PX + 30 && (
                        <div className="absolute right-1.5 inset-y-0 flex items-center">
                          <span className="text-[9px] font-medium text-white/80 tabular-nums">
                            {bar.progress}%
                          </span>
                        </div>
                      )}
                    </div>
                  )
                })
              })}
            </div>
          </div>
        </div>
      </div>

      {/* ── Tooltip overlay ──────────────────────────────────── */}
      {tooltip && (
        <div
          className="absolute z-50 pointer-events-none bg-popover border rounded-lg shadow-lg p-3 text-sm max-w-xs"
          style={{ left: tooltip.x, top: tooltip.y }}
        >
          <div className="font-semibold mb-1.5 leading-snug">{tooltip.bar.title}</div>

          {tooltip.bar.status && (
            <div className="flex items-center gap-1.5 mb-1">
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: STATUS_COLORS[tooltip.bar.status] ?? '#9ca3af' }}
              />
              <span className="text-xs capitalize">{tooltip.bar.status.replace(/_/g, ' ')}</span>
            </div>
          )}

          {showProgress && tooltip.bar.progress != null && (
            <div className="flex items-center gap-2 mb-1.5">
              <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${tooltip.bar.progress}%`,
                    backgroundColor: resolveBarColor(tooltip.bar),
                  }}
                />
              </div>
              <span className="text-xs tabular-nums font-medium">{tooltip.bar.progress}%</span>
            </div>
          )}

          <div className="text-xs text-muted-foreground mb-1">
            {tooltip.bar.startDate} &rarr; {tooltip.bar.endDate}
          </div>

          {tooltip.bar.tooltipLines?.map(([k, v], i) => (
            <div key={i} className="flex justify-between gap-4 text-xs">
              <span className="text-muted-foreground">{k}</span>
              <span className="font-medium">{v}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
