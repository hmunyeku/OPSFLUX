/**
 * GanttCore v2 — Professional-grade shared Gantt chart.
 *
 * Assembles sub-components: GanttHeader, GanttBar, GanttDependencies, GanttTooltip.
 * Uses ganttEngine for time calculations and ganttTypes for interfaces.
 *
 * Features:
 * - Dual-row header with grouped time cells
 * - 5 time scales with smooth zoom
 * - Resizable left panel with custom columns
 * - Task bars: drag, resize edges, progress fill, milestones, baselines
 * - Dependency arrows (FS/SS/FF/SF) with critical path
 * - Today line + weekend highlighting
 * - Rich tooltips
 * - Row striping + expand/collapse
 * - Settings toolbar
 * - Keyboard: arrow keys to navigate, +/- to zoom
 */

import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import {
  ChevronLeft, ChevronRight, ChevronDown, ChevronRight as ChevronCollapsed,
  Loader2, ZoomIn, ZoomOut, Maximize, Download,
  Plus, Diamond, IndentIncrease, IndentDecrease, Trash2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  type TimeScale, SCALE_META, buildCells, buildHeaderGroups, computeBar,
  toISO, daysB, addD, getDefaultDateRange,
} from './ganttEngine'
import { GanttHeader, HEADER_ROW_H } from './GanttHeader'
import { GanttBarComponent } from './GanttBar'
import { GanttSettingsPanel } from './GanttSettingsPanel'
import { GanttDependencies } from './GanttDependencies'
import { GanttTooltip } from './GanttTooltip'
import { DEFAULT_SETTINGS } from './ganttTypes'
import type { GanttCoreProps, GanttSettings, GanttBarData } from './ganttTypes'

// Re-export types for consumers
export type { GanttRow, GanttBarData, GanttDependencyData, GanttColumn, GanttMarker, GanttCoreProps } from './ganttTypes'
export type { TimeScale } from './ganttEngine'

const SCALES: TimeScale[] = ['day', 'week', 'month', 'quarter', 'semester']

// ── Editable Cell (inline edit on double-click) ─────────────────

import type { GanttColumn, OnCellEdit } from './ganttTypes'

function EditableCell({ rowId, col, value, renderContent, onEdit }: {
  rowId: string
  col: GanttColumn
  value: string | number | null
  renderContent?: React.ReactNode
  onEdit?: OnCellEdit
}) {
  const [editing, setEditing] = useState(false)
  const [editVal, setEditVal] = useState(String(value ?? ''))

  const canEdit = col.editable && onEdit

  const handleSave = () => {
    setEditing(false)
    if (editVal !== String(value ?? '') && canEdit) {
      onEdit(rowId, col.id, editVal)
    }
  }

  return (
    <div
      className={cn(
        'text-[10px] text-muted-foreground px-1 shrink-0 truncate border-l border-border/20',
        col.align === 'right' && 'text-right',
        col.align === 'center' && 'text-center',
        canEdit && !editing && 'cursor-pointer hover:bg-primary/5',
      )}
      style={{ width: col.width }}
      onDoubleClick={() => {
        if (!canEdit) return
        setEditing(true)
        setEditVal(String(value ?? ''))
      }}
    >
      {editing ? (
        <input
          autoFocus
          type={col.editType || 'text'}
          value={editVal}
          onChange={e => setEditVal(e.target.value)}
          onBlur={handleSave}
          onKeyDown={e => {
            if (e.key === 'Enter') handleSave()
            if (e.key === 'Escape') setEditing(false)
          }}
          className="w-full h-full bg-background border border-primary/30 rounded px-0.5 text-[10px] outline-none"
          onClick={e => e.stopPropagation()}
        />
      ) : renderContent ?? (String(value ?? '—'))}
    </div>
  )
}

// ── Main Component ──────────────────────────────────────────────

export function GanttCore(props: GanttCoreProps) {
  const {
    rows, bars, dependencies = [], markers = [], columns = [],
    initialScale, initialStart, initialEnd, initialSettings,
    onBarClick, onBarDrag, onBarResize, onBarTitleEdit,
    onRowClick, onCellEdit,
    statusOptions, priorityOptions,
    presets: _presets, onPresetsChange: _onPresetsChange,
    showActions, onAddTask, onAddMilestone, onIndent, onOutdent, onDeleteRow,
    selectedRowId, onSelectRow,
    expandedRows, onToggleRow,
    onSettingsChange,
    emptyMessage = 'Aucune donnée à afficher',
    isLoading = false,
    showToolbar = true,
    showGrid = true,
    minHeight = 400,
    className,
  } = props

  // ── Settings state ─────────────────────────────────────────────

  const [settings, setSettings] = useState<GanttSettings>(() => ({
    ...DEFAULT_SETTINGS,
    scale: initialScale || DEFAULT_SETTINGS.scale,
    ...initialSettings,
  }))

  const updateSettings = useCallback((patch: Partial<GanttSettings>) => {
    setSettings(prev => {
      const next = { ...prev, ...patch }
      onSettingsChange?.(next)
      return next
    })
  }, [onSettingsChange])

  // ── View range state ───────────────────────────────────────────

  const [viewStart, setViewStart] = useState(() => initialStart ?? getDefaultDateRange(settings.scale).start)
  const [viewEnd, setViewEnd] = useState(() => initialEnd ?? getDefaultDateRange(settings.scale).end)

  // ── Tooltip state ──────────────────────────────────────────────

  const [tooltip, setTooltip] = useState<{ bar: GanttBarData; x: number; y: number } | null>(null)

  // ── Refs ────────────────────────────────────────────────────────

  const containerRef = useRef<HTMLDivElement>(null)
  const headerScrollRef = useRef<HTMLDivElement>(null)
  const bodyScrollRef = useRef<HTMLDivElement>(null)
  const panelBodyRef = useRef<HTMLDivElement>(null)
  const [panelWidth, setPanelWidth] = useState(240)
  const resizingPanel = useRef(false)

  // ── Derived data ───────────────────────────────────────────────

  const meta = SCALE_META[settings.scale]
  const effectivePPD = meta.pxPerDay * settings.zoomFactor
  const cells = useMemo(() => buildCells(settings.scale, new Date(viewStart), new Date(viewEnd)), [settings.scale, viewStart, viewEnd])
  const headerGroups = useMemo(() => buildHeaderGroups(settings.scale, cells), [settings.scale, cells])
  const cellWidths = useMemo(() => cells.map(c => c.days * effectivePPD), [cells, effectivePPD])
  const totalDays = useMemo(() => cells.reduce((s, c) => s + c.days, 0), [cells])
  const totalWidth = totalDays * effectivePPD
  const bodyH = rows.length * settings.rowHeight

  // Bar positions
  const barPositions = useMemo(() => {
    const map = new Map<string, { left: number; width: number; rowIdx: number }>()
    rows.forEach((row, idx) => {
      for (const bar of bars.filter(b => b.rowId === row.id)) {
        const pos = computeBar(viewStart, bar.startDate, bar.endDate, effectivePPD, totalDays)
        if (pos) map.set(bar.id, { ...pos, rowIdx: idx })
      }
    })
    return map
  }, [rows, bars, viewStart, effectivePPD, totalDays])

  // Today position
  const todayISO = toISO(new Date())
  const todayPx = useMemo(() => {
    const d = daysB(viewStart, todayISO)
    return (d >= 0 && d <= totalDays) ? d * effectivePPD : null
  }, [viewStart, todayISO, totalDays, effectivePPD])

  // ── Navigation ─────────────────────────────────────────────────

  const shift = useCallback((dir: -1 | 1) => {
    const days = meta.shiftDays * dir
    setViewStart(s => addD(s, days))
    setViewEnd(s => addD(s, days))
  }, [meta.shiftDays])

  const changeScale = useCallback((newScale: TimeScale) => {
    updateSettings({ scale: newScale })
    const range = getDefaultDateRange(newScale)
    setViewStart(range.start)
    setViewEnd(range.end)
  }, [updateSettings])

  const zoom = useCallback((dir: 1 | -1) => {
    updateSettings({
      zoomFactor: Math.max(0.25, Math.min(4, settings.zoomFactor + dir * 0.25)),
    })
  }, [settings.zoomFactor, updateSettings])

  // ── Panel resize ───────────────────────────────────────────────

  const onPanelResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    resizingPanel.current = true
    const startX = e.clientX
    const startW = panelWidth
    const onMove = (ev: MouseEvent) => {
      if (!resizingPanel.current) return
      setPanelWidth(Math.max(140, Math.min(500, startW + ev.clientX - startX)))
    }
    const onUp = () => {
      resizingPanel.current = false
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [panelWidth])

  // ── Scroll sync ────────────────────────────────────────────────

  const onBodyScroll = useCallback(() => {
    if (headerScrollRef.current && bodyScrollRef.current) {
      headerScrollRef.current.scrollLeft = bodyScrollRef.current.scrollLeft
    }
    // Sync vertical scroll between panel and body
    if (panelBodyRef.current && bodyScrollRef.current) {
      panelBodyRef.current.scrollTop = bodyScrollRef.current.scrollTop
    }
  }, [])

  const onPanelScroll = useCallback(() => {
    if (panelBodyRef.current && bodyScrollRef.current) {
      bodyScrollRef.current.scrollTop = panelBodyRef.current.scrollTop
    }
  }, [])

  // ── Tooltip handlers ───────────────────────────────────────────

  const showTooltipFor = useCallback((e: React.MouseEvent, bar: GanttBarData) => {
    setTooltip({ bar, x: e.clientX, y: e.clientY })
  }, [])
  const hideTooltip = useCallback(() => setTooltip(null), [])

  // ── Fit all ─────────────────────────────────────────────────────

  const fitAll = useCallback(() => {
    if (!bodyScrollRef.current || totalDays === 0) return
    const viewportW = bodyScrollRef.current.clientWidth
    if (viewportW <= 0) return
    const newPpd = viewportW / totalDays
    const newZoom = newPpd / meta.pxPerDay
    updateSettings({ zoomFactor: Math.max(0.1, Math.min(6, newZoom)) })
  }, [totalDays, meta.pxPerDay, updateSettings])

  // ── Export PNG ──────────────────────────────────────────────────

  const exportPNG = useCallback(async () => {
    if (!containerRef.current) return
    try {
      const { default: html2canvas } = await import('html2canvas')
      const canvas = await html2canvas(containerRef.current, { backgroundColor: null, scale: 2 })
      const url = canvas.toDataURL('image/png')
      const a = document.createElement('a')
      a.href = url
      a.download = `gantt-${toISO(new Date())}.png`
      a.click()
    } catch { /* silent */ }
  }, [])

  // ── Drag-scroll on header AND body (middle-click or click on empty area) ──

  const onDragScroll = useCallback((e: React.MouseEvent) => {
    // Only drag-scroll on left button, and only if target is not a bar
    if (e.button !== 0) return
    const target = e.target as HTMLElement
    // Don't drag-scroll when clicking on bars, buttons, inputs
    if (target.closest('[data-gantt-bar], button, input, [role="button"]')) return

    if (!bodyScrollRef.current) return
    e.preventDefault()
    const startX = e.clientX
    const startY = e.clientY
    const startScrollX = bodyScrollRef.current.scrollLeft
    const startScrollY = bodyScrollRef.current.scrollTop

    // Change cursor on body
    document.body.style.cursor = 'grabbing'

    const onMove = (ev: MouseEvent) => {
      if (bodyScrollRef.current) {
        bodyScrollRef.current.scrollLeft = startScrollX - (ev.clientX - startX)
        bodyScrollRef.current.scrollTop = startScrollY - (ev.clientY - startY)
      }
    }
    const onUp = () => {
      document.body.style.cursor = ''
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [])

  // ── Wheel zoom ─────────────────────────────────────────────────

  const onWheel = useCallback((e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault()
      zoom(e.deltaY < 0 ? 1 : -1)
    }
  }, [zoom])

  // ── Keyboard shortcuts ──────────────────────────────────────────

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Only when Gantt container is focused or no input is focused
      const active = document.activeElement
      if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.tagName === 'SELECT')) return

      switch (e.key) {
        case 'ArrowLeft': shift(-1); e.preventDefault(); break
        case 'ArrowRight': shift(1); e.preventDefault(); break
        case '+': case '=': zoom(1); e.preventDefault(); break
        case '-': zoom(-1); e.preventDefault(); break
        case 't': case 'T': {
          const range = getDefaultDateRange(settings.scale)
          setViewStart(range.start); setViewEnd(range.end)
          e.preventDefault()
          break
        }
        case 'f': case 'F':
          if (!e.ctrlKey && !e.metaKey) { fitAll(); e.preventDefault() }
          break
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [shift, zoom, fitAll, settings.scale])

  // ── Loading / empty ────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="flex items-center justify-center text-muted-foreground gap-2" style={{ minHeight }}>
        <Loader2 className="h-5 w-5 animate-spin" />
        <span className="text-sm">Chargement du Gantt...</span>
      </div>
    )
  }

  if (!rows.length) {
    return (
      <div className="flex items-center justify-center text-muted-foreground text-sm" style={{ minHeight }}>
        {emptyMessage}
      </div>
    )
  }

  // ── Render ─────────────────────────────────────────────────────

  return (
    <div
      ref={containerRef}
      className={cn('relative flex flex-col border rounded-lg bg-background overflow-hidden select-none', className)}
      style={{ minHeight }}
      onWheel={onWheel}
    >
      {/* ── Toolbar ──────────────────────────────────────────── */}
      {showToolbar && (
        <div className="flex items-center gap-2 px-3 py-1.5 border-b bg-muted/30 shrink-0">
          {/* Navigation */}
          <button onClick={() => shift(-1)} className="p-1 rounded hover:bg-muted" title="Précédent">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button onClick={() => shift(1)} className="p-1 rounded hover:bg-muted" title="Suivant">
            <ChevronRight className="h-4 w-4" />
          </button>

          {/* Scale selector */}
          <div className="flex items-center gap-0.5 ml-1 bg-muted/60 rounded-md p-0.5">
            {SCALES.map(s => (
              <button
                key={s}
                onClick={() => changeScale(s)}
                className={cn(
                  'px-2 py-0.5 rounded text-[11px] font-medium transition-colors',
                  s === settings.scale
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {SCALE_META[s].label}
              </button>
            ))}
          </div>

          {/* Action buttons */}
          {showActions && (
            <div className="flex items-center gap-0.5 ml-2 border-l border-border/40 pl-2">
              {onAddTask && (
                <button onClick={onAddTask} className="h-6 px-2 rounded text-[10px] font-medium flex items-center gap-1 hover:bg-muted" title="Ajouter une tâche">
                  <Plus className="h-3 w-3" /> Tâche
                </button>
              )}
              {onAddMilestone && (
                <button onClick={onAddMilestone} className="h-6 px-2 rounded text-[10px] font-medium flex items-center gap-1 hover:bg-muted" title="Ajouter un jalon">
                  <Diamond className="h-3 w-3" /> Jalon
                </button>
              )}
              {selectedRowId && onIndent && (
                <button onClick={() => onIndent(selectedRowId)} className="p-1 rounded hover:bg-muted" title="Indenter">
                  <IndentIncrease className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
              )}
              {selectedRowId && onOutdent && (
                <button onClick={() => onOutdent(selectedRowId)} className="p-1 rounded hover:bg-muted" title="Désindenter">
                  <IndentDecrease className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
              )}
              {selectedRowId && onDeleteRow && (
                <button onClick={() => onDeleteRow(selectedRowId)} className="p-1 rounded hover:bg-destructive/10" title="Supprimer">
                  <Trash2 className="h-3.5 w-3.5 text-destructive/60" />
                </button>
              )}
            </div>
          )}

          {/* Zoom */}
          <div className="flex items-center gap-0.5 ml-1">
            <button onClick={() => zoom(-1)} className="p-1 rounded hover:bg-muted" title="Zoom -">
              <ZoomOut className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
            <span className="text-[10px] tabular-nums text-muted-foreground w-8 text-center">
              {Math.round(settings.zoomFactor * 100)}%
            </span>
            <button onClick={() => zoom(1)} className="p-1 rounded hover:bg-muted" title="Zoom +">
              <ZoomIn className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
          </div>

          {/* Date range display */}
          <span className="ml-auto text-[11px] text-muted-foreground tabular-nums">
            {new Date(viewStart).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}
            {' — '}
            {new Date(viewEnd).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}
          </span>

          {/* Fit all */}
          <button onClick={fitAll} className="p-1 rounded hover:bg-muted" title="Ajuster à l'écran">
            <Maximize className="h-3.5 w-3.5 text-muted-foreground" />
          </button>

          {/* Export PNG */}
          <button onClick={exportPNG} className="p-1 rounded hover:bg-muted" title="Exporter PNG">
            <Download className="h-3.5 w-3.5 text-muted-foreground" />
          </button>

          {/* Today button */}
          <button
            onClick={() => {
              const range = getDefaultDateRange(settings.scale)
              setViewStart(range.start)
              setViewEnd(range.end)
            }}
            className="text-[10px] px-2 py-0.5 rounded bg-primary/10 text-primary hover:bg-primary/20 font-medium"
          >
            Aujourd'hui
          </button>

          {/* Settings panel trigger */}
          <GanttSettingsPanel
            settings={settings}
            onChange={updateSettings}
            statuses={statusOptions}
            priorities={priorityOptions}
          />
        </div>
      )}

      {/* ── Body (panel + grid) ──────────────────────────────── */}
      <div className="flex flex-1 min-h-0 overflow-hidden">

        {/* ── Left panel ───────────────────────────────────── */}
        {showGrid && (
          <>
            <div className="flex flex-col shrink-0 border-r" style={{ width: panelWidth }}>
              {/* Panel header — with custom column headers */}
              <div
                className="flex items-center border-b bg-muted/20"
                style={{ height: HEADER_ROW_H * 2 }}
              >
                <div className="flex-1 px-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                  Tâche
                </div>
                {columns.map(col => (
                  <div
                    key={col.id}
                    className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide px-1 shrink-0 text-center border-l border-border/30"
                    style={{ width: col.width }}
                  >
                    {col.label}
                  </div>
                ))}
              </div>

              {/* Panel rows — synced vertical scroll */}
              <div
                ref={panelBodyRef}
                className="flex-1 overflow-y-auto overflow-x-hidden"
                onScroll={onPanelScroll}
                style={{ scrollbarWidth: 'none' }}
              >
                {rows.map((row, idx) => (
                  <div
                    key={row.id}
                    className={cn(
                      'flex items-center gap-1.5 px-2 border-b text-xs cursor-pointer',
                      'hover:bg-primary/5 transition-colors',
                      idx % 2 === 0 ? 'bg-background' : 'bg-muted/15',
                      selectedRowId === row.id && 'bg-primary/10 ring-1 ring-inset ring-primary/30',
                    )}
                    style={{ height: settings.rowHeight, paddingLeft: 8 + row.level * 18 }}
                    onClick={() => { onRowClick?.(row.id); onSelectRow?.(row.id) }}
                    onMouseEnter={(e) => {
                      // Show tooltip for the first bar of this row
                      const rowBar = bars.find(b => b.rowId === row.id)
                      if (rowBar) showTooltipFor(e, rowBar)
                    }}
                    onMouseLeave={hideTooltip}
                  >
                    {/* Expand/collapse */}
                    {row.hasChildren ? (
                      <button
                        onClick={(e) => { e.stopPropagation(); onToggleRow?.(row.id) }}
                        className="p-0.5 rounded hover:bg-muted shrink-0"
                      >
                        {expandedRows?.has(row.id)
                          ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                          : <ChevronCollapsed className="h-3.5 w-3.5 text-muted-foreground" />
                        }
                      </button>
                    ) : (
                      <span className="w-[18px] shrink-0" />
                    )}

                    {/* Color indicator */}
                    {row.color && (
                      <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: row.color }} />
                    )}

                    {/* Label */}
                    <div className="truncate min-w-0 flex-1">
                      <span className={cn('font-medium', row.level === 0 && 'font-semibold')}>{row.label}</span>
                      {row.sublabel && (
                        <span className="ml-1.5 text-[10px] text-muted-foreground">{row.sublabel}</span>
                      )}
                    </div>

                    {/* Custom column values — editable on double-click */}
                    {columns.map(col => (
                      <EditableCell
                        key={col.id}
                        rowId={row.id}
                        col={col}
                        value={col.render ? null : (row.columns?.[col.id] ?? null)}
                        renderContent={col.render ? col.render(row) : undefined}
                        onEdit={onCellEdit}
                      />
                    ))}
                  </div>
                ))}
              </div>
            </div>

            {/* Resize handle */}
            <div
              className="w-1 cursor-col-resize hover:bg-primary/20 active:bg-primary/40 transition-colors shrink-0"
              onMouseDown={onPanelResizeStart}
            />
          </>
        )}

        {/* ── Grid area ──────────────────────────────────────── */}
        <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
          {/* Header (synced horizontal scroll + drag to pan) */}
          <div onMouseDown={onDragScroll} className="cursor-grab active:cursor-grabbing">
          <GanttHeader
            ref={headerScrollRef}
            cells={cells}
            headerGroups={headerGroups}
            cellWidths={cellWidths}
            totalWidth={totalWidth}
            showWeekends={settings.showWeekends}
          />
          </div>

          {/* Grid body — drag to pan on empty areas */}
          <div
            ref={bodyScrollRef}
            className="flex-1 overflow-auto cursor-grab active:cursor-grabbing"
            onScroll={onBodyScroll}
            onMouseDown={onDragScroll}
          >
            <div className="relative" style={{ width: totalWidth, height: bodyH }}>

              {/* Row stripes */}
              {rows.map((_, idx) => (
                <div
                  key={idx}
                  className={cn(
                    'absolute left-0 border-b border-border/20',
                    idx % 2 === 0 ? 'bg-background' : 'bg-muted/10',
                  )}
                  style={{ top: idx * settings.rowHeight, width: totalWidth, height: settings.rowHeight }}
                />
              ))}

              {/* Column separators */}
              {(() => {
                let x = 0
                return cells.map((c, i) => {
                  const left = x
                  x += cellWidths[i]
                  const isWeekend = c.startDate.getDay() === 0 || c.startDate.getDay() === 6
                  return (
                    <div
                      key={c.key}
                      className={cn(
                        'absolute top-0 border-r',
                        isWeekend && settings.showWeekends ? 'border-border/20 bg-muted/10' : 'border-border/10',
                      )}
                      style={{ left, width: cellWidths[i], height: bodyH }}
                    />
                  )
                })
              })()}

              {/* Today line */}
              {settings.showToday && todayPx != null && (
                <div
                  className="absolute top-0 z-30 pointer-events-none"
                  style={{ left: todayPx, height: bodyH }}
                >
                  <div className="w-px h-full bg-red-500" />
                  <div className="absolute -top-0 -left-[4px] w-[9px] h-[9px] bg-red-500 rounded-full shadow-sm" />
                </div>
              )}

              {/* Markers */}
              {markers.map((m) => {
                const d = daysB(viewStart, m.date)
                if (d < 0 || d > totalDays) return null
                const x = d * effectivePPD
                return (
                  <div key={m.date + m.label} className="absolute top-0 z-25 pointer-events-none" style={{ left: x, height: bodyH }}>
                    <div
                      className={cn('w-px h-full', m.dashed && 'border-l border-dashed')}
                      style={{ backgroundColor: m.dashed ? undefined : (m.color || '#8b5cf6'), borderColor: m.color || '#8b5cf6' }}
                    />
                    <div
                      className="absolute -top-5 -left-[1px] text-[9px] font-medium px-1 rounded whitespace-nowrap"
                      style={{ color: m.color || '#8b5cf6' }}
                    >
                      {m.label}
                    </div>
                  </div>
                )
              })}

              {/* Dependency arrows */}
              {settings.showDependencies && (
                <GanttDependencies
                  dependencies={dependencies}
                  barPositions={barPositions}
                  rowHeight={settings.rowHeight}
                  totalWidth={totalWidth}
                  totalHeight={bodyH}
                />
              )}

              {/* Bars */}
              {bars.map((bar) => {
                const pos = barPositions.get(bar.id)
                if (!pos) return null
                const { left, width, rowIdx } = pos
                const top = rowIdx * settings.rowHeight + (settings.rowHeight - settings.barHeight) / 2

                // Baseline position
                let baselineLeft: number | undefined
                let baselineWidth: number | undefined
                if (bar.baselineStart && bar.baselineEnd) {
                  const bp = computeBar(viewStart, bar.baselineStart, bar.baselineEnd, effectivePPD, totalDays)
                  if (bp) { baselineLeft = bp.left; baselineWidth = bp.width }
                }

                return (
                  <GanttBarComponent
                    key={bar.id}
                    bar={bar}
                    left={left}
                    width={width}
                    top={top}
                    barHeight={settings.barHeight}
                    pxPerDay={effectivePPD}
                    showProgress={settings.showProgress}
                    showLabels={settings.showLabels}
                    showBaselines={settings.showBaselines}
                    baselineLeft={baselineLeft}
                    baselineWidth={baselineWidth}
                    onClick={() => onBarClick?.(bar.id, bar.meta)}
                    onDrag={onBarDrag ? (s, e) => onBarDrag(bar.id, s, e) : undefined}
                    onResize={onBarResize ? (edge, date) => onBarResize(bar.id, edge, date) : undefined}
                    onTitleEdit={onBarTitleEdit ? (title) => onBarTitleEdit(bar.id, title) : undefined}
                    onHover={(e) => showTooltipFor(e, bar)}
                    onLeave={hideTooltip}
                  />
                )
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Tooltip */}
      {tooltip && containerRef.current && (
        <GanttTooltip
          bar={tooltip.bar}
          x={tooltip.x}
          y={tooltip.y}
          containerRect={containerRef.current.getBoundingClientRect()}
          showProgress={settings.showProgress}
        />
      )}
    </div>
  )
}
