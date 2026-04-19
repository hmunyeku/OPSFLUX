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

import { useState, useMemo, useCallback, useRef, useEffect, useLayoutEffect } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ChevronLeft, ChevronRight, ChevronDown, ChevronRight as ChevronCollapsed,
  Loader2, ZoomIn, ZoomOut, Maximize, Download,
  FileImage, FileText, Calendar,
  Plus, Diamond, IndentIncrease, IndentDecrease, Trash2,
  Undo2, Redo2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  type TimeScale, SCALE_META, buildCells, buildHeaderGroups, computeBar,
  toISO, daysB, addD, getDefaultDateRange, textColorForBackground,
} from './ganttEngine'
import { GanttHeader, HEADER_ROW_H } from './GanttHeader'
import { GanttBarComponent } from './GanttBar'
import { GanttSettingsPanel } from './GanttSettingsPanel'
import { GanttContextMenu, buildBarContextActions } from './GanttContextMenu'
import type { ContextMenuAction } from './GanttContextMenu'
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
  const { t } = useTranslation()
  const {
    rows, bars, dependencies = [], markers = [], columns: rawColumns = [],
    initialScale, initialStart, initialEnd, initialSettings,
    onBarClick, onBarDoubleClick, onBarDrag, onBarResize,
    onRowClick, onCellEdit,
    statusOptions, priorityOptions,
    presets: _presets, onPresetsChange: _onPresetsChange,
    showActions, onAddTask, onAddMilestone, onIndent, onOutdent, onDeleteRow,
    onCreateDependency, onDeleteDependency, onEditDependency, onExportPdf, onUndo, onRedo, onViewChange,
    selectedRowId, onSelectRow,
    expandedRows, onToggleRow,
    onSettingsChange,
    emptyMessage = 'Aucune donnée à afficher',
    isLoading = false,
    showToolbar = true,
    showGrid = true,
    minHeight = 400,
    className,
    extraSettingsContent,
    footerRow,
    workloadShowCumulative,
    workloadBarWidthPct,
  } = props

  // ── Settings state ─────────────────────────────────────────────

  const [settings, setSettings] = useState<GanttSettings>(() => ({
    ...DEFAULT_SETTINGS,
    ...initialSettings,
    // initialScale MUST win over a stale `initialSettings.scale` that
    // may still be lingering in persisted prefs from before the parent
    // updated its sharedTimelineScale. Without this last-line override
    // the spread above would let a stale "day" stored in
    // planner.gantt_core clobber a fresh "month" passed via initialScale,
    // leaving GanttCore's internal scale out of sync with the timeline
    // and rendering 365 day-cells under 12 month-scoped heatmap entries.
    scale: initialScale || initialSettings?.scale || DEFAULT_SETTINGS.scale,
  }))

  // Hydrate from `initialSettings` ONCE when the parent finishes loading
  // its persisted user preferences. The useState initializer above only
  // runs on mount — if the parent's preferences arrive AFTER that (the
  // user's localStorage cache was empty so the API call is what populates
  // them), the new initialSettings prop is silently ignored. Result:
  // hidden columns / column widths / showProgress / etc. that the user
  // saved last session reappeared as defaults until they reloaded twice.
  //
  // We watch initialSettings and apply it once when it transitions from
  // "empty" to non-empty. After that we leave the local state alone so
  // user actions inside this component aren't clobbered by the parent's
  // own writes coming back through the prop.
  const hydratedFromPropRef = useRef(false)
  useEffect(() => {
    if (hydratedFromPropRef.current) return
    if (!initialSettings) return
    if (Object.keys(initialSettings).length === 0) return
    hydratedFromPropRef.current = true
    setSettings(prev => ({
      ...prev,
      ...initialSettings,
      // Same rationale as the useState initializer: preserve the scale
      // set by the parent via initialScale, because prefs may still hold
      // a stale scale from a previous session.
      scale: initialScale || initialSettings.scale || prev.scale,
    }))
  }, [initialSettings, initialScale])

  const updateSettings = useCallback((patch: Partial<GanttSettings>) => {
    // Compute the next state from the closure-captured settings and fire
    // the parent notification AS A SIBLING OPERATION in the same event
    // handler — not nested inside the setSettings updater.
    //
    // Why: calling a state setter (setPref → setPrefs) from *inside*
    // another state setter's updater function is a React antipattern.
    // In React 18 it can cause the nested update to land in a different
    // lane than the outer one. For `applyRangePreset('this_year')`, two
    // separate prefs have to move in lockstep — `planner.timeline`
    // (fired from an event-handler direct call via onViewChange) and
    // `planner.gantt_core` (fired from this nested setPref inside the
    // setSettings updater). When they split across lanes, only one
    // actually commits, leaving GanttCore's persisted scale stuck on
    // "day" while the timeline pref correctly moves to "month" — that
    // is exactly the heatmap/gantt decorrelation bug the user keeps
    // reporting on the yearly range.
    //
    // Calling onSettingsChange at the event-handler scope (as a sibling
    // to setSettings, not nested inside it) keeps both writes batched
    // into the same React commit and guarantees the two prefs stay in
    // sync.
    const next = { ...settings, ...patch }
    setSettings(next)
    onSettingsChange?.(next)
  }, [settings, onSettingsChange])

  // ── Visible columns (filtered by hiddenColumns) ────────────────

  const columns = useMemo(() =>
    rawColumns
      .filter(c => !(settings.hiddenColumns || []).includes(c.id))
      .map(c => ({
        ...c,
        width: (settings.columnWidths || {})[c.id] || c.width,
      })),
    [rawColumns, settings.hiddenColumns, settings.columnWidths],
  )

  // Column resize handler (drag on header separator)
  const onColumnResize = useCallback((colId: string, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const startX = e.clientX
    const col = columns.find(c => c.id === colId)
    if (!col) return
    const startW = col.width

    const onMove = (ev: MouseEvent) => {
      const newW = Math.max(col.minWidth || 30, startW + ev.clientX - startX)
      updateSettings({ columnWidths: { ...(settings.columnWidths || {}), [colId]: newW } })
    }
    const onUp = () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [columns, settings.columnWidths, updateSettings])

  // Double-click to auto-fit column width
  const onColumnAutoFit = useCallback((colId: string) => {
    // Measure max content width — approximate based on longest value
    let maxLen = 0
    for (const row of rows) {
      const val = String(row.columns?.[colId] ?? '')
      if (val.length > maxLen) maxLen = val.length
    }
    const autoW = Math.max(40, Math.min(200, maxLen * 7 + 16))
    updateSettings({ columnWidths: { ...(settings.columnWidths || {}), [colId]: autoW } })
  }, [rows, settings.columnWidths, updateSettings])

  // ── View range state ───────────────────────────────────────────

  const [viewStart, setViewStart] = useState(() => initialStart ?? getDefaultDateRange(settings.scale).start)
  const [viewEnd, setViewEnd] = useState(() => initialEnd ?? getDefaultDateRange(settings.scale).end)

  // ── Tooltip state ──────────────────────────────────────────────

  const [tooltip, setTooltip] = useState<{ bar: GanttBarData; x: number; y: number } | null>(null)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; actions: ContextMenuAction[] } | null>(null)

  // Linking state — dragging a dependency arrow
  const [linking, setLinking] = useState<{
    fromBarId: string; fromEdge: 'start' | 'end'
    startX: number; startY: number; curX: number; curY: number
  } | null>(null)

  // ── Refs ────────────────────────────────────────────────────────

  const containerRef = useRef<HTMLDivElement>(null)
  const headerScrollRef = useRef<HTMLDivElement>(null)
  const bodyScrollRef = useRef<HTMLDivElement>(null)
  // Dedicated scroll container for the sticky "Plan de charge" footer
  // row. Lives OUTSIDE `bodyScrollRef` so it never participates in
  // the vertical scroll; its horizontal scrollLeft is kept in sync
  // with `bodyScrollRef` (and `headerScrollRef`) via onBodyScroll so
  // cells stay aligned on all three tracks.
  const footerScrollRef = useRef<HTMLDivElement>(null)
  // Flipped to `true` by `changeScale` so the next post-render effect
  // horizontally re-centers the body scroll on "today" (or the first
  // bar in the range, falling back to viewStart). This lets the user
  // keep their bearings when cells resize across scales without forcing
  // the range to reset.
  const recenterOnNextRenderRef = useRef(false)
  const panelBodyRef = useRef<HTMLDivElement>(null)
  // Panel width: task name (200px min) + all visible column widths
  const columnsWidth = columns.reduce((sum, c) => sum + c.width, 0)
  const [taskColWidth, setTaskColWidth] = useState(250) // task name column width
  const minPanelWidth = columnsWidth + taskColWidth
  const [panelWidth, setPanelWidth] = useState(() => minPanelWidth)
  const resizingPanel = useRef(false)
  // Keep panel in sync with column widths
  useEffect(() => {
    setPanelWidth(columnsWidth + taskColWidth)
  }, [columnsWidth, taskColWidth])

  // ── Derived data ───────────────────────────────────────────────

  const meta = SCALE_META[settings.scale]
  const effectivePPD = meta.pxPerDay * settings.zoomFactor
  const cells = useMemo(() => buildCells(settings.scale, new Date(viewStart), new Date(viewEnd)), [settings.scale, viewStart, viewEnd])
  const headerGroups = useMemo(() => buildHeaderGroups(settings.scale, cells), [settings.scale, cells])
  const cellWidths = useMemo(() => cells.map(c => c.days * effectivePPD), [cells, effectivePPD])
  const cellLefts = useMemo(() => {
    const out: number[] = new Array(cellWidths.length)
    let x = 0
    for (let i = 0; i < cellWidths.length; i++) { out[i] = x; x += cellWidths[i] }
    return out
  }, [cellWidths])
  const totalDays = useMemo(() => cells.reduce((s, c) => s + c.days, 0), [cells])
  const totalWidth = totalDays * effectivePPD

  // ── Per-row heights & cumulative offsets ──
  // Each row may override the global rowHeight via row.rowHeight. This is
  // used by the Planner to make hierarchy / heatmap rows SHORTER than
  // activity rows (e.g. 22 px) as well as for special summary rows
  // (e.g. the "Plan de charge" stacked-bar chart) that need to be TALLER
  // than the default activity row. The caller is responsible for picking
  // sensible values.
  const rowHeights = useMemo(
    () => rows.map((r) => r.rowHeight ?? settings.rowHeight),
    [rows, settings.rowHeight],
  )
  const rowOffsets = useMemo(() => {
    const out: number[] = new Array(rowHeights.length)
    let y = 0
    for (let i = 0; i < rowHeights.length; i++) { out[i] = y; y += rowHeights[i] }
    return out
  }, [rowHeights])
  const bodyH = useMemo(
    () => rowHeights.reduce((s, h) => s + h, 0),
    [rowHeights],
  )
  // Height of the sticky footer row (Plan de charge). Falls back to the
  // global rowHeight when no explicit override is provided. Kept as a
  // separate variable so layouts can reserve space for it at the bottom
  // of BOTH the panel scroll area and the grid body scroll area.
  const footerRowH = footerRow ? (footerRow.rowHeight ?? settings.rowHeight) : 0

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

  // Bar id → title map (used by the dependency-arrow hover tooltip)
  const barTitlesMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const b of bars) map.set(b.id, b.title || b.id.slice(0, 8))
    return map
  }, [bars])

  // Today position
  const todayISO = toISO(new Date())
  const todayPx = useMemo(() => {
    const d = daysB(viewStart, todayISO)
    return (d >= 0 && d <= totalDays) ? d * effectivePPD : null
  }, [viewStart, todayISO, totalDays, effectivePPD])

  // Horizontally recenter the body scroll after a scale change so the
  // user doesn't lose their place when cells resize to the new
  // granularity. Priority order for the focus date:
  //   1. Previous scroll-center date (so the view stays anchored to
  //      whatever the user was actually looking at)
  //   2. Today (if today is within the current range)
  //   3. First bar start date in the range
  //   4. viewStart (the left edge)
  //
  // This is a layout effect so it runs AFTER cells/totalWidth are
  // measured with the new scale but BEFORE the browser paints — no
  // visible jump for the user.
  const prevEffectivePPDRef = useRef(effectivePPD)
  const prevScrollCenterDateRef = useRef<string | null>(null)
  // Track the date currently at the center of the viewport, so we can
  // restore it when the scale changes.
  const onBodyScrollCaptureCenter = useCallback(() => {
    const el = bodyScrollRef.current
    if (!el || effectivePPD <= 0) return
    const centerPx = el.scrollLeft + el.clientWidth / 2
    const centerDays = centerPx / effectivePPD
    const d = new Date(viewStart)
    d.setDate(d.getDate() + Math.round(centerDays))
    prevScrollCenterDateRef.current = toISO(d)
  }, [viewStart, effectivePPD])

  useLayoutEffect(() => {
    if (!recenterOnNextRenderRef.current) {
      // Normal render: update the prev PPD ref and do nothing.
      prevEffectivePPDRef.current = effectivePPD
      return
    }
    recenterOnNextRenderRef.current = false
    const el = bodyScrollRef.current
    if (!el) return

    // Decide the focus date in order of preference.
    let focusISO: string | null = prevScrollCenterDateRef.current
    if (!focusISO) {
      // Fall back to today if it's in range.
      const d = daysB(viewStart, todayISO)
      if (d >= 0 && d <= totalDays) focusISO = todayISO
    }
    if (!focusISO) {
      // Last resort: first bar in the range.
      const firstBar = bars.find((b) => b.startDate && b.endDate)
      if (firstBar) focusISO = firstBar.startDate
    }
    if (!focusISO) focusISO = viewStart

    const daysFromStart = daysB(viewStart, focusISO)
    if (daysFromStart < 0 || daysFromStart > totalDays) return

    const focusPx = daysFromStart * effectivePPD
    const viewportW = el.clientWidth
    const newScrollLeft = Math.max(
      0,
      Math.min(el.scrollWidth - viewportW, focusPx - viewportW / 2),
    )
    el.scrollLeft = newScrollLeft
    // Sync the header
    if (headerScrollRef.current) headerScrollRef.current.scrollLeft = newScrollLeft
    prevEffectivePPDRef.current = effectivePPD
  }, [effectivePPD, viewStart, totalDays, todayISO, bars])

  // ── Navigation ─────────────────────────────────────────────────

  const shift = useCallback((dir: -1 | 1) => {
    const days = meta.shiftDays * dir
    setViewStart(s => { const n = addD(s, days); onViewChange?.(settings.scale, n, addD(viewEnd, days)); return n })
    setViewEnd(s => addD(s, days))
  }, [meta.shiftDays, settings.scale, viewEnd, onViewChange])

  const changeScale = useCallback((newScale: TimeScale) => {
    // Spec: the scale selector changes ONLY the display granularity,
    // never the visible period. Keep the current viewStart / viewEnd
    // intact, and rely on the ResizeObserver-driven horizontal scroll
    // effect below to re-center on "today" (or the currently-visible
    // focus date) so the user doesn't lose their bearings when the
    // cells resize. Previously this callback called
    // `getDefaultDateRange(newScale)` and stomped on the range — users
    // who were inspecting a specific window had to re-apply a preset
    // after every scale change, which defeats the whole point of
    // having a separate range picker.
    updateSettings({ scale: newScale })
    // Flag the next render as "auto-recenter" so the horizontal scroll
    // handler can jump the viewport to the expected focus after cells
    // have been re-measured with the new scale.
    recenterOnNextRenderRef.current = true
    onViewChange?.(newScale, viewStart, viewEnd)
  }, [updateSettings, onViewChange, viewStart, viewEnd])

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
      setPanelWidth(Math.max(minPanelWidth, Math.min(900, startW + ev.clientX - startX)))
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
    // Sync the footer's horizontal scroll so the Plan de charge stacks
    // stay column-aligned with the main body even while the footer
    // lives outside the body's scroll container.
    if (footerScrollRef.current && bodyScrollRef.current) {
      footerScrollRef.current.scrollLeft = bodyScrollRef.current.scrollLeft
    }
    // Sync vertical scroll between panel and body
    if (panelBodyRef.current && bodyScrollRef.current) {
      panelBodyRef.current.scrollTop = bodyScrollRef.current.scrollTop
    }
    // Remember where the user is focused so a subsequent scale change
    // can recenter back to the same date. Throttled via rAF to avoid
    // doing the date math on every scroll event.
    onBodyScrollCaptureCenter()
  }, [onBodyScrollCaptureCenter])

  const onPanelScroll = useCallback(() => {
    if (panelBodyRef.current && bodyScrollRef.current) {
      bodyScrollRef.current.scrollTop = panelBodyRef.current.scrollTop
    }
  }, [])

  // When the Plan de charge footer is the ONLY horizontal scrollbar
  // visible, its scroll drives the body + header instead of the other
  // way around. The body has `overflow-x-hidden` in that mode, so
  // scrollLeft can only move programmatically via this handler.
  const onFooterScroll = useCallback(() => {
    const f = footerScrollRef.current
    if (!f) return
    if (bodyScrollRef.current) bodyScrollRef.current.scrollLeft = f.scrollLeft
    if (headerScrollRef.current) headerScrollRef.current.scrollLeft = f.scrollLeft
  }, [])

  // ── Tooltip handlers ───────────────────────────────────────────

  const showTooltipFor = useCallback((e: React.MouseEvent, bar: GanttBarData) => {
    setTooltip({ bar, x: e.clientX, y: e.clientY })
  }, [])
  const hideTooltip = useCallback(() => setTooltip(null), [])

  // ── Linking (drag arrow to create dependency) ───────────────────

  const handleLinkStart = useCallback((barId: string, edge: 'start' | 'end', x: number, y: number) => {
    if (!onCreateDependency) return
    setLinking({ fromBarId: barId, fromEdge: edge, startX: x, startY: y, curX: x, curY: y })

    const onMove = (ev: MouseEvent) => {
      setLinking(prev => prev ? { ...prev, curX: ev.clientX, curY: ev.clientY } : null)
    }

    const onUp = (ev: MouseEvent) => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)

      // Find which bar the mouse is over
      const el = document.elementFromPoint(ev.clientX, ev.clientY)
      const barEl = el?.closest('[data-bar-id]') as HTMLElement | null
      const targetBarId = barEl?.dataset.barId

      if (targetBarId && targetBarId !== barId) {
        // Determine dependency type based on which edges were connected
        // fromEdge=end → FS (Finish-to-Start) is most common
        const type = edge === 'end' ? 'FS' : 'SS'
        onCreateDependency(barId, targetBarId, type as 'FS' | 'SS' | 'FF' | 'SF')
      }

      setLinking(null)
    }

    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [onCreateDependency])

  // ── Context menu ───────────────────────────────────────────────

  const showContextMenuFor = useCallback((e: React.MouseEvent, bar: GanttBarData) => {
    e.preventDefault()
    e.stopPropagation()
    hideTooltip()

    const actions = buildBarContextActions({
      barId: bar.id,
      isSummary: bar.isSummary,
      isMilestone: bar.isMilestone,
      onEdit: () => onBarClick?.(bar.id, bar.meta),
      onDelete: onDeleteRow ? () => onDeleteRow(bar.id) : undefined,
      onAddTaskBelow: onAddTask,
      onAddMilestone: onAddMilestone,
      onIndent: onIndent ? () => onIndent(bar.id) : undefined,
      onOutdent: onOutdent ? () => onOutdent(bar.id) : undefined,
    })

    setContextMenu({ x: e.clientX, y: e.clientY, actions })
  }, [onBarClick, onDeleteRow, onAddTask, onAddMilestone, onIndent, onOutdent, hideTooltip])

  // ── Fit all ─────────────────────────────────────────────────────

  const fitAll = useCallback(() => {
    if (!bodyScrollRef.current) return
    const viewportW = bodyScrollRef.current.clientWidth
    if (viewportW <= 0 || bars.length === 0) return

    // Find min/max dates from all bars
    const allStarts = bars.map(b => b.startDate).filter(Boolean).sort()
    const allEnds = bars.map(b => b.endDate).filter(Boolean).sort().reverse()
    if (allStarts.length === 0) return

    const minDate = addD(allStarts[0], -7) // 1 week padding
    const maxDate = addD(allEnds[0], 7)
    const rangeDays = daysB(minDate, maxDate)
    if (rangeDays <= 0) return

    // Adjust zoom to fit this range in viewport
    const newPpd = viewportW / rangeDays
    const newZoom = newPpd / meta.pxPerDay

    setViewStart(minDate)
    setViewEnd(maxDate)
    updateSettings({ zoomFactor: Math.max(0.1, Math.min(6, newZoom)) })
    // Crucial: propagate the new range to the parent. Otherwise the parent
    // keeps computing `cells` + `cellLabels.cellIdx` against the STALE
    // startDate/endDate props, while GanttCore renders cells against the
    // new internal viewStart/viewEnd → the labels (and visually the bars)
    // land on the wrong cell indices. Notifying the parent triggers a
    // re-render with fresh cells so everything stays aligned.
    onViewChange?.(settings.scale, minDate, maxDate)
  }, [bars, meta.pxPerDay, updateSettings, onViewChange, settings.scale])

  // ── Export menu (Image PNG / PDF A3) ────────────────────────────

  const [exportMenuOpen, setExportMenuOpen] = useState(false)
  const [exporting, setExporting] = useState<null | 'png' | 'pdf'>(null)
  const [rangeMenuOpen, setRangeMenuOpen] = useState(false)

  /**
   * Apply a smart range preset. Snaps the view to a human-friendly span
   * (today, this week, this month, this year, ...) WITHOUT touching the
   * display scale.
   *
   * Spec clarification: the range picker only changes WHICH window of
   * time is visible, never HOW it is rendered. The scale (day / week /
   * month / quarter / semester) is chosen independently by the user
   * through the scale selector and must survive any range change.
   * Previously this helper opinionatedly snapped to "day" for the week
   * preset, "month" for the year preset, etc. — that surprised the user
   * because switching to "Cette année" silently forced them out of day
   * view, and it was ALSO the mechanism behind the heatmap/gantt
   * decorrelation bug: scale-change and date-change landed in different
   * commit lanes.
   */
  const applyRangePreset = useCallback((preset: string) => {
    const now = new Date()
    const y = now.getFullYear()
    const m = now.getMonth()
    const d = now.getDate()
    let s: Date
    let e: Date

    switch (preset) {
      case 'today':
        s = new Date(y, m, d)
        e = new Date(y, m, d)
        break
      case 'this_week': {
        const day = now.getDay()
        const monOffset = (day + 6) % 7
        s = new Date(y, m, d - monOffset)
        e = new Date(y, m, d - monOffset + 6)
        break
      }
      case 'this_month':
        s = new Date(y, m, 1)
        e = new Date(y, m + 1, 0)
        break
      case 'next_month':
        s = new Date(y, m + 1, 1)
        e = new Date(y, m + 2, 0)
        break
      case 'this_quarter': {
        const q = Math.floor(m / 3)
        s = new Date(y, q * 3, 1)
        e = new Date(y, q * 3 + 3, 0)
        break
      }
      case 'this_semester': {
        const sem = m < 6 ? 0 : 1
        s = new Date(y, sem * 6, 1)
        e = new Date(y, sem * 6 + 6, 0)
        break
      }
      case 'this_year':
        s = new Date(y, 0, 1)
        e = new Date(y, 12, 0)
        break
      case 'next_12_months':
        s = new Date(y, m, 1)
        e = new Date(y, m + 12, 0)
        break
      case 'last_12_months':
        s = new Date(y, m - 11, 1)
        e = new Date(y, m + 1, 0)
        break
      case 'next_3_years':
        s = new Date(y, m, 1)
        e = new Date(y + 3, m, 0)
        break
      default:
        return
    }
    const sIso = toISO(s)
    const eIso = toISO(e)
    setViewStart(sIso)
    setViewEnd(eIso)
    onViewChange?.(settings.scale, sIso, eIso)
    setRangeMenuOpen(false)
  }, [settings.scale, onViewChange])

  /** Apply a custom (user-entered) date range. */
  const applyCustomRange = useCallback((start: string, end: string) => {
    if (!start || !end) return
    if (new Date(end).getTime() < new Date(start).getTime()) return
    setViewStart(start)
    setViewEnd(end)
    onViewChange?.(settings.scale, start, end)
    setRangeMenuOpen(false)
  }, [settings.scale, onViewChange])

  /**
   * Capture the Gantt container with html2canvas, after:
   *   1. Closing all dropdowns (so the export / range menus don't bleed
   *      into the snapshot)
   *   2. Injecting a global CSS override that:
   *        - removes overflow clipping on every descendant
   *        - disables `truncate` / ellipsis so row labels aren't cut off
   *        - unsets height/max-height on scroll containers so all rows fit
   *        - hides the toolbar (the PDF template has its own header)
   *   3. Restoring the DOM (remove the class + style tag) after the capture,
   *      even when html2canvas throws
   */
  const captureGanttImage = useCallback(async (): Promise<string | null> => {
    const container = containerRef.current
    if (!container) return null

    // Step 1: close any open dropdowns and let React flush
    setExportMenuOpen(false)
    setRangeMenuOpen(false)
    await new Promise<void>((r) => requestAnimationFrame(() => r()))
    await new Promise<void>((r) => requestAnimationFrame(() => r()))

    // Step 2: inject the "capturing" CSS overrides. Much cleaner than
    // stashing individual element styles — a single <style> tag applies
    // the rules everywhere and is trivial to roll back.
    const CAPTURE_CLASS = 'opf-gantt-capturing'
    const styleTag = document.createElement('style')
    styleTag.setAttribute('data-opf-gantt-capture', '1')
    styleTag.textContent = `
      .${CAPTURE_CLASS} [data-gantt-toolbar] { display: none !important; }
      .${CAPTURE_CLASS},
      .${CAPTURE_CLASS} * {
        overflow: visible !important;
        max-height: none !important;
      }
      .${CAPTURE_CLASS} .truncate {
        text-overflow: clip !important;
        white-space: nowrap !important;
      }
      /* Collapse the flex layout so children flow at their natural size.
         The main goal is to stop the body wrapper from stretching to
         fill its parent — otherwise the captured image has a big empty
         strip below the last activity row. */
      .${CAPTURE_CLASS} [data-gantt-panel-grid] {
        flex: none !important;
        height: auto !important;
        min-height: 0 !important;
      }
      .${CAPTURE_CLASS} [data-gantt-body-scroll],
      .${CAPTURE_CLASS} [data-gantt-panel-scroll] {
        flex: none !important;
        height: auto !important;
        min-height: 0 !important;
        max-height: none !important;
      }
    `
    // Stash the container's inline style slots we're about to touch, so
    // we can restore them in the finally even if something throws BEFORE
    // html2canvas gets called. The `display: none` on the toolbar + the
    // `overflow: visible` on children are all applied via the injected
    // <style> tag, so removing the tag + class rolls them back too.
    const prevHeight = container.style.height
    const prevMaxHeight = container.style.maxHeight
    const prevMinHeight = container.style.minHeight

    try {
      document.head.appendChild(styleTag)
      container.classList.add(CAPTURE_CLASS)

      await new Promise<void>((r) => requestAnimationFrame(() => r()))
      await new Promise<void>((r) => requestAnimationFrame(() => r()))

      // Shrink the container to its actual content height. The panel
      // body scroll container (overflow-y-auto) has a scrollHeight that
      // always reflects the true full content height of every row,
      // regardless of how many are currently visible. Reading that
      // after the capture CSS has flushed gives us a reliable target.
      // Fall back to the closure bodyH value if the ref is somehow
      // unavailable.
      const panelContentH = panelBodyRef.current?.scrollHeight ?? bodyH
      const gridContentH = bodyScrollRef.current?.scrollHeight ?? bodyH
      const contentH = Math.max(panelContentH, gridContentH, bodyH)
      const targetHeight = HEADER_ROW_H * 2 + Math.max(contentH, 60) + 6
      container.style.height = `${targetHeight}px`
      container.style.maxHeight = `${targetHeight}px`
      container.style.minHeight = `${targetHeight}px`
      await new Promise<void>((r) => requestAnimationFrame(() => r()))

      const { default: html2canvas } = await import('html2canvas')
      const canvas = await html2canvas(container, {
        backgroundColor: '#ffffff',
        scale: 2,
        useCORS: true,
        windowWidth: Math.max(container.scrollWidth, container.clientWidth),
        windowHeight: Math.max(container.scrollHeight, container.clientHeight),
      })
      return canvas.toDataURL('image/png')
    } finally {
      // Always restore the DOM — remove the class, the style tag, and the
      // inline height/minHeight/maxHeight we set for the capture. This
      // runs even if the prep phase threw, so the toolbar can never get
      // permanently stuck with display:none.
      container.style.height = prevHeight
      container.style.maxHeight = prevMaxHeight
      container.style.minHeight = prevMinHeight
      container.classList.remove(CAPTURE_CLASS)
      if (styleTag.parentNode) styleTag.remove()
    }
  }, [])

  const exportPNG = useCallback(async () => {
    setExporting('png')
    try {
      const url = await captureGanttImage()
      if (!url) return
      const a = document.createElement('a')
      a.href = url
      a.download = `gantt-${toISO(new Date())}.png`
      a.click()
    } catch { /* silent */ }
    finally {
      setExporting(null)
    }
  }, [captureGanttImage])

  const exportPDF = useCallback(async () => {
    if (!onExportPdf) return
    setExporting('pdf')
    setExportMenuOpen(false)
    try {
      // Server-side rendering — the consumer builds the payload from
      // its own state and POSTs it. No html2canvas screenshot needed.
      await onExportPdf()
    } catch { /* silent */ }
    finally {
      setExporting(null)
    }
  }, [onExportPdf])

  // ── Drag-scroll on header AND body (middle-click or click on empty area) ──

  const onDragScroll = useCallback((e: React.MouseEvent) => {
    // Only drag-scroll on left button, and only if target is not a bar
    if (e.button !== 0) return
    const target = e.target as HTMLElement
    // Don't drag-scroll when clicking on bars, buttons, inputs, resize handles
    if (target.closest('[data-bar-id], [data-gantt-bar], button, input, [role="button"], .cursor-crosshair, .cursor-ew-resize, .cursor-w-resize, .cursor-e-resize')) return

    if (!bodyScrollRef.current) return
    const startX = e.clientX
    const startY = e.clientY
    const startScrollX = bodyScrollRef.current.scrollLeft
    const startScrollY = bodyScrollRef.current.scrollTop
    let dragging = false

    const onMove = (ev: MouseEvent) => {
      const dx = Math.abs(ev.clientX - startX)
      const dy = Math.abs(ev.clientY - startY)
      // Only start drag-scroll after 5px movement threshold (to allow clicks)
      if (!dragging && dx + dy < 5) return
      if (!dragging) {
        dragging = true
        document.body.style.cursor = 'grabbing'
      }
      if (bodyScrollRef.current) {
        bodyScrollRef.current.scrollLeft = startScrollX - (ev.clientX - startX)
        bodyScrollRef.current.scrollTop = startScrollY - (ev.clientY - startY)
      }
    }
    const onUp = () => {
      if (dragging) document.body.style.cursor = ''
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [])

  // ── Wheel zoom ─────────────────────────────────────────────────
  // We must attach the wheel listener manually as a NON-passive native
  // listener, because React synthetic wheel events are passive by default
  // in React 17+ and preventDefault() has no effect on them (the browser
  // logs "Unable to preventDefault inside passive event listener").
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const handler = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault()
        zoom(e.deltaY < 0 ? 1 : -1)
      }
    }
    el.addEventListener('wheel', handler, { passive: false })
    return () => el.removeEventListener('wheel', handler)
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
        case 'z': case 'Z':
          if ((e.ctrlKey || e.metaKey) && !e.shiftKey && onUndo) { onUndo(); e.preventDefault() }
          if ((e.ctrlKey || e.metaKey) && e.shiftKey && onRedo) { onRedo(); e.preventDefault() }
          break
        case 'y': case 'Y':
          if ((e.ctrlKey || e.metaKey) && onRedo) { onRedo(); e.preventDefault() }
          break
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [shift, zoom, fitAll, settings.scale])

  // ── Loading state ──────────────────────────────────────────────
  // Only full-replace the view while the initial query is in flight.
  // For the "no rows in the current range" case, we keep the full shell
  // rendered (toolbar + header) so the user can still navigate away —
  // otherwise scrolling to a date range with no activities traps the
  // user in an empty screen with no buttons.

  if (isLoading && !rows.length) {
    return (
      <div className="flex items-center justify-center text-muted-foreground gap-2" style={{ minHeight }}>
        <Loader2 className="h-5 w-5 animate-spin" />
        <span className="text-sm">{t('shared.chargement_du_gantt')}</span>
      </div>
    )
  }

  const isEmpty = rows.length === 0

  // ── Render ─────────────────────────────────────────────────────

  return (
    <div
      ref={containerRef}
      className={cn('relative flex flex-col border rounded-lg bg-background overflow-hidden select-none h-full', className)}
      style={{ minHeight }}
    >
      {/* ── Toolbar ──────────────────────────────────────────── */}
      {showToolbar && (
        <div data-gantt-toolbar className="flex items-center gap-2 px-3 py-1.5 border-b bg-muted/30 shrink-0">
          {/* Navigation */}
          <button onClick={() => shift(-1)} className="p-1 rounded hover:bg-muted" title={t('common.previous')}>
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button onClick={() => shift(1)} className="p-1 rounded hover:bg-muted" title="Suivant">
            <ChevronRight className="h-4 w-4" />
          </button>

          {/* Undo/Redo */}
          {(onUndo || onRedo) && (
            <div className="flex items-center gap-0.5 ml-1 border-l border-border/40 pl-1">
              <button onClick={onUndo} disabled={!onUndo} className="p-1 rounded hover:bg-muted disabled:opacity-30" title={t('common.undo')}>
                <Undo2 className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
              <button onClick={onRedo} disabled={!onRedo} className="p-1 rounded hover:bg-muted disabled:opacity-30" title="Refaire (Ctrl+Y)">
                <Redo2 className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            </div>
          )}

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
                <button onClick={onAddTask} className="h-6 px-2 rounded text-[10px] font-medium flex items-center gap-1 hover:bg-muted" title={t('projets.add_task')}>
                  <Plus className="h-3 w-3" /> Tâche
                </button>
              )}
              {onAddMilestone && (
                <button onClick={onAddMilestone} className="h-6 px-2 rounded text-[10px] font-medium flex items-center gap-1 hover:bg-muted" title={t('projets.add_milestone')}>
                  <Diamond className="h-3 w-3" /> Jalon
                </button>
              )}
              {selectedRowId && onIndent && (
                <button onClick={() => onIndent(selectedRowId)} className="p-1 rounded hover:bg-muted" title="Indenter">
                  <IndentIncrease className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
              )}
              {selectedRowId && onOutdent && (
                <button onClick={() => onOutdent(selectedRowId)} className="p-1 rounded hover:bg-muted" title={t('shared.desindenter')}>
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

          {/* Date range picker — compact button + dropdown with smart presets */}
          <div className="relative ml-auto">
            <button
              type="button"
              onClick={() => setRangeMenuOpen((v) => !v)}
              className="gl-button gl-button-default text-foreground/80 tabular-nums border-transparent"
              title={t('shared.changer_la_periode')}
            >
              <Calendar className="h-3 w-3 text-muted-foreground shrink-0" />
              <span className="whitespace-nowrap">
                {new Date(viewStart).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}
                {' → '}
                {new Date(viewEnd).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: '2-digit' })}
              </span>
              <ChevronDown className="h-3 w-3 text-muted-foreground/60 shrink-0" />
            </button>
            {rangeMenuOpen && (
              <>
                {/* Backdrop */}
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setRangeMenuOpen(false)}
                />
                <div className="absolute right-0 top-full mt-1 z-50 w-64 rounded-md border border-border bg-popover shadow-lg py-1 text-xs">
                  <div className="px-2 py-1 text-[9px] uppercase tracking-wide text-muted-foreground font-semibold">
                    Périodes rapides
                  </div>
                  {[
                    { key: 'today',          label: "Aujourd'hui" },
                    { key: 'this_week',      label: 'Cette semaine' },
                    { key: 'this_month',     label: 'Ce mois-ci' },
                    { key: 'next_month',     label: 'Mois prochain' },
                    { key: 'this_quarter',   label: 'Ce trimestre' },
                    { key: 'this_semester',  label: 'Ce semestre' },
                    { key: 'this_year',      label: 'Cette année' },
                    { key: 'last_12_months', label: '12 derniers mois' },
                    { key: 'next_12_months', label: '12 prochains mois' },
                    { key: 'next_3_years',   label: '3 prochaines années' },
                  ].map((p) => (
                    <button
                      key={p.key}
                      type="button"
                      onClick={() => applyRangePreset(p.key)}
                      className="w-full px-2.5 py-1 text-left hover:bg-muted"
                    >
                      {p.label}
                    </button>
                  ))}
                  <div className="px-2 py-1 mt-1 text-[9px] uppercase tracking-wide text-muted-foreground font-semibold border-t border-border/50">
                    Personnalisé
                  </div>
                  <div className="px-2 py-1.5 flex items-center gap-1.5">
                    <input
                      type="date"
                      defaultValue={viewStart}
                      onChange={(e) => {
                        const el = e.currentTarget
                        el.dataset.value = el.value
                      }}
                      className="flex-1 h-6 px-1 text-[11px] border border-border rounded bg-background"
                      data-range-start
                    />
                    <span className="text-muted-foreground">→</span>
                    <input
                      type="date"
                      defaultValue={viewEnd}
                      onChange={(e) => {
                        const el = e.currentTarget
                        el.dataset.value = el.value
                      }}
                      className="flex-1 h-6 px-1 text-[11px] border border-border rounded bg-background"
                      data-range-end
                    />
                  </div>
                  <div className="px-2 pb-1.5 flex justify-end">
                    <button
                      type="button"
                      onClick={(e) => {
                        const parent = (e.currentTarget as HTMLElement).closest('div[class*="absolute"]')
                        const startEl = parent?.querySelector('input[data-range-start]') as HTMLInputElement | null
                        const endEl = parent?.querySelector('input[data-range-end]') as HTMLInputElement | null
                        applyCustomRange(startEl?.value ?? '', endEl?.value ?? '')
                      }}
                      className="gl-button-sm bg-primary text-primary-foreground hover:bg-primary/90 h-6 px-2 text-[10px]"
                    >
                      Appliquer
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Fit all */}
          <button onClick={fitAll} className="p-1 rounded hover:bg-muted" title="Ajuster à l'écran">
            <Maximize className="h-3.5 w-3.5 text-muted-foreground" />
          </button>

          {/* Export dropdown (Image PNG / PDF A3) */}
          <div className="relative">
            <button
              onClick={() => setExportMenuOpen((v) => !v)}
              className="p-1 rounded hover:bg-muted flex items-center gap-0.5"
              title="Exporter"
              disabled={exporting !== null}
            >
              {exporting ? (
                <Loader2 className="h-3.5 w-3.5 text-muted-foreground animate-spin" />
              ) : (
                <Download className="h-3.5 w-3.5 text-muted-foreground" />
              )}
              <ChevronDown className="h-3 w-3 text-muted-foreground/60" />
            </button>
            {exportMenuOpen && (
              <>
                {/* Backdrop to close on outside click */}
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setExportMenuOpen(false)}
                />
                <div className="absolute right-0 top-full mt-1 z-50 w-44 rounded-md border border-border bg-popover shadow-lg py-1 text-xs">
                  <button
                    onClick={exportPNG}
                    disabled={exporting !== null}
                    className="w-full px-2.5 py-1.5 flex items-center gap-2 hover:bg-muted text-left"
                  >
                    <FileImage className="h-3.5 w-3.5 text-muted-foreground" />
                    <span>Image PNG</span>
                  </button>
                  {onExportPdf && (
                    <button
                      onClick={exportPDF}
                      disabled={exporting !== null}
                      className="w-full px-2.5 py-1.5 flex items-center gap-2 hover:bg-muted text-left"
                    >
                      <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                      <span>PDF A3 paysage</span>
                    </button>
                  )}
                </div>
              </>
            )}
          </div>

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
            columns={rawColumns}
            extraContent={extraSettingsContent}
          />
        </div>
      )}

      {/* ── Body (panel + grid) ──────────────────────────────── */}
      <div data-gantt-panel-grid className="flex flex-1 min-h-0 overflow-hidden">

        {/* ── Left panel ───────────────────────────────────── */}
        {showGrid && (
          <>
            <div className="flex flex-col shrink-0 border-r" style={{ width: panelWidth }}>
              {/* Panel header — with custom column headers */}
              <div
                className="flex items-center border-b bg-muted/20"
                style={{ height: HEADER_ROW_H * 2 }}
              >
                <div
                  className="relative px-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide shrink-0"
                  style={{ width: taskColWidth }}
                >
                  Tâche
                  {/* Resize handle for task column */}
                  <div
                    className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-primary/30 active:bg-primary/50"
                    onMouseDown={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      const startX = e.clientX
                      const startW = taskColWidth
                      const onMove = (ev: MouseEvent) => {
                        setTaskColWidth(Math.max(120, startW + ev.clientX - startX))
                      }
                      const onUp = () => {
                        document.removeEventListener('mousemove', onMove)
                        document.removeEventListener('mouseup', onUp)
                      }
                      document.addEventListener('mousemove', onMove)
                      document.addEventListener('mouseup', onUp)
                    }}
                  />
                </div>
                {columns.map(col => (
                  <div
                    key={col.id}
                    className="relative text-[10px] font-semibold text-muted-foreground uppercase tracking-wide px-1 shrink-0 text-center border-l border-border/30 select-none"
                    style={{ width: col.width }}
                    onDoubleClick={() => onColumnAutoFit(col.id)}
                  >
                    {col.label}
                    {/* Resize handle */}
                    <div
                      className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-primary/30 active:bg-primary/50"
                      onMouseDown={(e) => onColumnResize(col.id, e)}
                    />
                  </div>
                ))}
              </div>

              {/* Panel rows — synced vertical scroll */}
              <div
                ref={panelBodyRef}
                data-gantt-panel-scroll
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
                      row.level === 0 && (idx % 2 === 0 ? 'bg-background' : 'bg-muted/15'),
                      selectedRowId === row.id && 'bg-primary/10 ring-1 ring-inset ring-primary/30',
                    )}
                    style={{
                      height: rowHeights[idx],
                      paddingLeft: 8 + row.level * 18,
                      ...(row.level > 0 ? (() => {
                        let parentColor: string | undefined
                        for (let i = idx - 1; i >= 0; i--) {
                          if (rows[i].level < row.level) { parentColor = rows[i].color; break }
                        }
                        return parentColor ? { backgroundColor: parentColor + '08', borderLeft: `2px solid ${parentColor}30` } : {}
                      })() : {}),
                    }}
                    onClick={() => { onSelectRow?.(row.id) }}
                    onDoubleClick={() => onRowClick?.(row.id)}
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
                      {row.labelSuffix && (
                        <span className="ml-1 text-[10px] font-normal text-muted-foreground/70 tabular-nums">
                          {row.labelSuffix}
                        </span>
                      )}
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
              {/* ── Panel footer (sticky-bottom via flex layout) ──
                  Rendered OUTSIDE the scroll container so it never
                  moves with the vertical scroll. Fixed height, always
                  visible at the bottom of the panel column. */}
              {footerRow && (
                <div
                  className="flex items-center gap-1.5 px-2 border-t text-xs bg-background shrink-0"
                  style={{
                    height: footerRowH,
                    paddingLeft: 8 + footerRow.level * 18,
                  }}
                >
                  <div className="truncate min-w-0 flex-1">
                    <span className="font-semibold">{footerRow.label}</span>
                    {footerRow.labelSuffix && (
                      <span className="ml-1 text-[10px] font-normal text-muted-foreground/70 tabular-nums">
                        {footerRow.labelSuffix}
                      </span>
                    )}
                    {footerRow.sublabel && (
                      <div className="text-[10px] text-muted-foreground">{footerRow.sublabel}</div>
                    )}
                  </div>
                </div>
              )}
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
            scale={settings.scale}
            cells={cells}
            headerGroups={headerGroups}
            cellWidths={cellWidths}
            totalWidth={totalWidth}
            showWeekends={settings.showWeekends}
          />
          </div>

          {/* Grid body — drag to pan on empty areas.
              When a `footerRow` is present we hide the body's HORIZONTAL
              scrollbar so the page only shows ONE horizontal scrollbar
              (the footer's) — avoids the stacked-scrollbars look the
              user flagged. The body's scrollLeft is still adjustable
              programmatically via `onFooterScroll` (footer drives). */}
          <div
            ref={bodyScrollRef}
            data-gantt-body
            data-gantt-body-scroll
            className={cn(
              'flex-1 cursor-grab active:cursor-grabbing',
              footerRow ? 'overflow-x-hidden overflow-y-auto' : 'overflow-auto',
            )}
            onScroll={onBodyScroll}
            onMouseDown={onDragScroll}
          >
            <div className="relative" style={{ width: totalWidth, height: Math.max(bodyH, 120) }}>

              {/* Empty-state message rendered inside the body area so the
                  toolbar and header stay reachable — the user can still
                  scroll, change scale, or pick a preset to get back to
                  something that has activities. */}
              {isEmpty && (
                <div
                  className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground text-sm gap-2 pointer-events-none"
                >
                  <span>{emptyMessage}</span>
                  <span className="text-[10px] text-muted-foreground/70">
                    Utilisez la barre d'outils pour changer la période ou revenir à aujourd'hui.
                  </span>
                </div>
              )}

              {/* Row stripes with parent grouping background */}
              {rows.map((row, idx) => {
                // Find parent color for group tinting
                let groupColor: string | undefined
                if (row.level > 0) {
                  // Walk back to find the nearest level-0 ancestor
                  for (let i = idx - 1; i >= 0; i--) {
                    if (rows[i].level < row.level) {
                      groupColor = rows[i].color
                      break
                    }
                  }
                }
                return (
                  <div
                    key={idx}
                    className={cn(
                      'absolute left-0 border-b border-border/20',
                      !groupColor && (idx % 2 === 0 ? 'bg-background' : 'bg-muted/10'),
                    )}
                    style={{
                      top: rowOffsets[idx],
                      width: totalWidth,
                      height: rowHeights[idx],
                      backgroundColor: groupColor ? groupColor + '08' : undefined,
                      borderLeft: groupColor ? `2px solid ${groupColor}30` : undefined,
                    }}
                  />
                )
              })}

              {/* Column separators */}
              {cells.map((c, i) => {
                const isWeekend = c.startDate.getDay() === 0 || c.startDate.getDay() === 6
                // On day scale, the FIRST day of each month gets a
                // stronger left border so the user can spot month
                // boundaries at a glance. At other scales (week, month,
                // quarter, semester) the cells already correspond to
                // those boundaries and an extra line would be redundant.
                const isMonthBoundary =
                  settings.scale === 'day' && c.startDate.getDate() === 1
                return (
                  <div
                    key={c.key}
                    className={cn(
                      'absolute top-0 border-r',
                      isWeekend && settings.showWeekends ? 'border-border/20 bg-muted/10' : 'border-border/10',
                      isMonthBoundary && 'border-l-2 border-l-border/60',
                    )}
                    style={{ left: cellLefts[i], width: cellWidths[i], height: bodyH }}
                  />
                )
              })}

              {/* Heatmap cells layer — drawn above the row stripes/separators
                  but below dependency arrows / bars / today line */}
              {rows.map((row, rowIdx) => {
                if (!row.heatmapCells || row.heatmapCells.length === 0) return null
                const rh = rowHeights[rowIdx]
                return row.heatmapCells.map((hc) => {
                  if (hc.cellIdx < 0 || hc.cellIdx >= cellLefts.length) return null
                  const w = cellWidths[hc.cellIdx]

                  // ── STACKED BAR variant (plan de charge row) ──
                  // When a cell provides `stacks`, render vertical colored
                  // segments (bottom-up) instead of the flat heatmap rect.
                  // Each segment's height = (value / stackMax) * cellHeight,
                  // so bars compare fairly across the row. Segments with
                  // value === 0 collapse to nothing.
                  if (hc.stacks && hc.stacks.length > 0) {
                    const stackMax = hc.stackMax ?? hc.stacks.reduce((s, x) => s + x.value, 0)
                    const innerH = Math.max(0, rh - 6)
                    const innerW = Math.max(0, w - 2)
                    const top = rowOffsets[rowIdx] + 3
                    const left = cellLefts[hc.cellIdx] + 1
                    // Build the stack bottom-up: we'll position each
                    // segment by its cumulative offset FROM THE TOP,
                    // which is `innerH - stackedSoFar - segmentHeight`.
                    let stackedBelow = 0
                    return (
                      <div
                        key={`hm-${rowIdx}-${hc.cellIdx}`}
                        className="absolute pointer-events-auto z-[5]"
                        style={{ left, top, width: innerW, height: innerH }}
                        {...(hc.tooltipHTML ? { 'data-heatmap-tooltip': hc.tooltipHTML } : {})}
                      >
                        {hc.stacks.map((seg, segIdx) => {
                          if (seg.value <= 0 || stackMax <= 0) return null
                          const segH = (seg.value / stackMax) * innerH
                          const bottom = stackedBelow
                          stackedBelow += segH
                          return (
                            <div
                              key={segIdx}
                              className="absolute left-0 right-0"
                              style={{
                                bottom,
                                height: segH,
                                backgroundColor: seg.color,
                              }}
                              title={seg.label || `${seg.value}`}
                            />
                          )
                        })}
                      </div>
                    )
                  }

                  const showLabel = hc.label && w >= 28 && rh >= 18
                  // Show secondary label (POB réel) when the cell is tall
                  // enough (>= 30px) and wide enough, and when a value exists.
                  const showSecondary = hc.secondaryLabel && w >= 28 && rh >= 30
                  // Faint cells when value === 0 (or explicit opacity override)
                  const opacity = hc.opacity ?? (hc.value === 0 ? 0.22 : 1)
                  // Auto-contrast text color.
                  //
                  // IMPORTANT: when the cell is rendered `transparent`
                  // (the `colorless: true` path used by the Total rows),
                  // `textColorForBackground` can't parse the keyword and
                  // falls back to white — which is invisible on a light
                  // theme. In that case we let the text INHERIT the
                  // foreground color from the surrounding panel (via
                  // Tailwind `text-foreground`), so it always reads
                  // correctly regardless of the active theme.
                  const isTransparent = hc.color === 'transparent'
                  const textColor = isTransparent ? undefined : textColorForBackground(hc.color)
                  return (
                    <div
                      key={`hm-${rowIdx}-${hc.cellIdx}`}
                      className={cn(
                        'absolute pointer-events-auto z-[5] flex flex-col items-center justify-center text-[9px] font-medium tabular-nums leading-tight',
                        isTransparent && 'text-foreground',
                      )}
                      style={{
                        left: cellLefts[hc.cellIdx] + 1,
                        width: Math.max(0, w - 2),
                        top: rowOffsets[rowIdx] + 2,
                        height: Math.max(0, rh - 4),
                        backgroundColor: hc.color,
                        color: textColor,
                        borderRadius: 2,
                        opacity,
                      }}
                      title={hc.tooltipHTML ? undefined : `${hc.value}%`}
                      {...(hc.tooltipHTML ? { 'data-heatmap-tooltip': hc.tooltipHTML } : {})}
                    >
                      {showLabel ? <span>{hc.label}</span> : null}
                      {showSecondary ? (
                        <span
                          className="text-[7px] font-normal"
                          style={{ opacity: 0.7 }}
                        >
                          {hc.secondaryLabel}
                        </span>
                      ) : null}
                    </div>
                  )
                })
              })}

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
                  barTitles={barTitlesMap}
                  rowOffsets={rowOffsets}
                  rowHeights={rowHeights}
                  barHeight={settings.barHeight}
                  totalWidth={totalWidth}
                  totalHeight={bodyH}
                  onDelete={onDeleteDependency}
                  onEdit={onEditDependency}
                />
              )}

              {/* Bars */}
              {bars.map((bar) => {
                const pos = barPositions.get(bar.id)
                if (!pos) return null
                const { left, width, rowIdx } = pos
                const rh = rowHeights[rowIdx] ?? settings.rowHeight
                const top = rowOffsets[rowIdx] + (rh - settings.barHeight) / 2

                // Baseline position
                let baselineLeft: number | undefined
                let baselineWidth: number | undefined
                if (bar.baselineStart && bar.baselineEnd) {
                  const bp = computeBar(viewStart, bar.baselineStart, bar.baselineEnd, effectivePPD, totalDays)
                  if (bp) { baselineLeft = bp.left; baselineWidth = bp.width }
                }

                return (
                  <div key={bar.id} data-bar-id={bar.id} className="contents">
                    <GanttBarComponent
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
                      cellLefts={cellLefts}
                      cellWidths={cellWidths}
                      onClick={() => onBarClick?.(bar.id, bar.meta)}
                      onDoubleClick={() => onBarDoubleClick?.(bar.id)}
                      onDrag={onBarDrag ? (s, e) => onBarDrag(bar.id, s, e) : undefined}
                      onResize={onBarResize ? (edge, date) => onBarResize(bar.id, edge, date) : undefined}
                      onLinkStart={onCreateDependency ? handleLinkStart : undefined}
                      onHover={(e) => showTooltipFor(e, bar)}
                      onLeave={hideTooltip}
                      onRightClick={(e) => showContextMenuFor(e, bar)}
                    />
                    {/* External title rendered before or after the bar */}
                    {bar.externalTitle && bar.externalTitlePosition && (
                      <div
                        className="absolute z-20 text-[10px] font-medium text-foreground/80 pointer-events-none whitespace-nowrap leading-none flex items-center"
                        style={{
                          top,
                          height: settings.barHeight,
                          ...(bar.externalTitlePosition === 'before'
                            ? {
                                left: Math.max(0, left - 160),
                                width: Math.min(left, 156),
                                justifyContent: 'flex-end',
                                paddingRight: 4,
                              }
                            : {
                                left: left + width + 4,
                                paddingLeft: 0,
                              }),
                        }}
                      >
                        {bar.externalTitle}
                      </div>
                    )}
                    {/* External progress % rendered on the OPPOSITE side of
                        the external title. Rendered ONLY when the bar has an
                        external title to sit opposite to — otherwise the
                        progress text would land in an adjacent time-column
                        and visually read as a phantom extra cell at the end
                        of the bar. Progress is still conveyed inside the bar
                        via the dark fill overlay and via the tooltip. */}
                    {settings.showProgress
                      && bar.progress != null
                      && !bar.isMilestone
                      && !bar.isSummary
                      && bar.externalTitle
                      && bar.externalTitlePosition && (
                      (() => {
                        // Position: opposite of title
                        const progressPos: 'before' | 'after' =
                          bar.externalTitlePosition === 'before' ? 'after' : 'before'
                        return (
                          <div
                            className="absolute z-20 text-[10px] font-bold tabular-nums text-foreground/80 pointer-events-none whitespace-nowrap leading-none flex items-center"
                            style={{
                              top,
                              height: settings.barHeight,
                              ...(progressPos === 'before'
                                ? {
                                    left: Math.max(0, left - 48),
                                    width: Math.min(left, 44),
                                    justifyContent: 'flex-end',
                                    paddingRight: 4,
                                  }
                                : {
                                    left: left + width + 4,
                                    paddingLeft: 0,
                                  }),
                            }}
                          >
                            {bar.progress}%
                          </div>
                        )
                      })()
                    )}
                  </div>
                )
              })}
            </div>
          </div>
          {/* ── Plan de charge footer row (outside bodyScrollRef) ──
              Kept as a flex-child sibling of the scroll container so
              it's always visible at the bottom of the gantt body
              regardless of vertical scroll position. Horizontal
              scroll is manually synced with `bodyScrollRef` via
              `onBodyScroll` → `footerScrollRef.scrollLeft = …`, so
              the stacks stay column-aligned with the main grid. */}
          {footerRow && footerRow.heatmapCells && footerRow.heatmapCells.length > 0 && (() => {
            const cellsList = footerRow.heatmapCells
            const COLUMN_TOTAL_H = 14 // reserved at the top for the total label
            const innerTop = COLUMN_TOTAL_H + 2
            const innerBottom = 4
            const stackAreaH = Math.max(0, footerRowH - innerTop - innerBottom)
            const maxCumul = cellsList.reduce(
              (m, hc) => (hc.cumulative != null && hc.cumulative > m ? hc.cumulative : m),
              0,
            )
            const cumulPoints = workloadShowCumulative && maxCumul > 0
              ? cellsList
                  .filter((hc) => hc.cumulative != null)
                  .map((hc) => {
                    const w = cellWidths[hc.cellIdx]
                    const cx = cellLefts[hc.cellIdx] + w / 2
                    const ratio = (hc.cumulative as number) / maxCumul
                    const cy = innerTop + stackAreaH - ratio * stackAreaH
                    return { x: cx, y: cy }
                  })
              : []
            return (
              <div
                ref={footerScrollRef}
                className="shrink-0 border-t bg-background overflow-x-auto overflow-y-hidden cursor-grab active:cursor-grabbing"
                style={{ height: footerRowH }}
                onScroll={onFooterScroll}
                onMouseDown={onDragScroll}
              >
                <div className="relative" style={{ width: totalWidth, height: footerRowH }}>
                  {cellsList.map((hc) => {
                    if (hc.cellIdx < 0 || hc.cellIdx >= cellLefts.length) return null
                    const w = cellWidths[hc.cellIdx]
                    // CELL width (constant) — used for label visibility
                    // and for the wrapper div, so labels stay centered
                    // on the cell regardless of how narrow the
                    // user-selected bar width is.
                    const cellInnerW = Math.max(0, w - 2)
                    const cellLeft = cellLefts[hc.cellIdx] + 1
                    // BAR width (variable) — derived from the user's
                    // workload_bar_width_pct preference. Only the
                    // colored stack rectangles use this width; labels
                    // span the full cell so adjusting the slider has
                    // no effect on their visibility.
                    const pct = Math.max(30, Math.min(100, workloadBarWidthPct ?? 90))
                    const barW = Math.max(4, Math.round(cellInnerW * pct / 100))
                    const barOffsetLeft = Math.round((cellInnerW - barW) / 2)

                    if (hc.stacks && hc.stacks.length > 0) {
                      const stackMax =
                        hc.stackMax ?? hc.stacks.reduce((s, x) => s + x.value, 0)
                      let stackedBelow = 0
                      return (
                        <div
                          key={`footer-${hc.cellIdx}`}
                          className="absolute pointer-events-auto"
                          style={{ left: cellLeft, top: 0, width: cellInnerW, height: footerRowH }}
                          {...(hc.tooltipHTML
                            ? { 'data-heatmap-tooltip': hc.tooltipHTML }
                            : {})}
                        >
                          {/* Column total — gated on the CELL width
                              (not the bar width), so changing the bar
                              width slider never hides the totals. */}
                          {hc.label && cellInnerW >= 18 && (
                            <div
                              className="absolute left-0 right-0 text-[9px] text-foreground font-semibold text-center tabular-nums"
                              style={{ top: 0, height: COLUMN_TOTAL_H, lineHeight: `${COLUMN_TOTAL_H}px` }}
                            >
                              {hc.label}
                            </div>
                          )}
                          {hc.stacks.map((seg, segIdx) => {
                            if (seg.value <= 0 || stackMax <= 0) return null
                            const segH = (seg.value / stackMax) * stackAreaH
                            const bottom = innerBottom + stackedBelow
                            stackedBelow += segH
                            // Segment label visibility: gated on the
                            // CELL width and the segment height — never
                            // on the bar width, otherwise narrowing the
                            // slider would hide labels the user wants
                            // to keep.
                            const showSegLabel = segH >= 12 && cellInnerW >= 22
                            return (
                              <div
                                key={segIdx}
                                className="absolute flex items-center justify-center text-[8px] font-semibold tabular-nums"
                                style={{
                                  left: barOffsetLeft,
                                  width: barW,
                                  bottom,
                                  height: segH,
                                  backgroundColor: seg.color,
                                  opacity: seg.opacity ?? 1,
                                  color: textColorForBackground(seg.color),
                                }}
                                title={seg.label || `${seg.value}`}
                              >
                                {showSegLabel ? Math.round(seg.value) : null}
                              </div>
                            )
                          })}
                        </div>
                      )
                    }

                    return (
                      <div
                        key={`footer-${hc.cellIdx}`}
                        className="absolute flex items-center justify-center text-[9px] font-medium tabular-nums"
                        style={{
                          left: cellLeft + barOffsetLeft,
                          top: innerTop,
                          width: barW,
                          height: stackAreaH,
                          backgroundColor: hc.color,
                          color: textColorForBackground(hc.color),
                          borderRadius: 2,
                        }}
                        {...(hc.tooltipHTML
                          ? { 'data-heatmap-tooltip': hc.tooltipHTML }
                          : {})}
                      >
                        {hc.label}
                      </div>
                    )
                  })}

                  {cumulPoints.length > 1 && (
                    <svg
                      className="absolute pointer-events-none"
                      style={{ left: 0, top: 0, width: totalWidth, height: footerRowH }}
                      width={totalWidth}
                      height={footerRowH}
                    >
                      <polyline
                        points={cumulPoints.map((p) => `${p.x},${p.y}`).join(' ')}
                        fill="none"
                        stroke="#1e40af"
                        strokeWidth={2}
                        strokeLinejoin="round"
                      />
                      {cumulPoints.map((p, i) => (
                        <circle key={i} cx={p.x} cy={p.y} r={2} fill="#1e40af" />
                      ))}
                    </svg>
                  )}
                </div>
              </div>
            )
          })()}
        </div>
      </div>

      {/* Tooltip */}
      {tooltip && !contextMenu && containerRef.current && (
        <GanttTooltip
          bar={tooltip.bar}
          x={tooltip.x}
          y={tooltip.y}
          containerRect={containerRef.current.getBoundingClientRect()}
          showProgress={settings.showProgress}
        />
      )}

      {/* Linking line (temporary SVG while dragging) */}
      {linking && (
        <svg
          className="fixed inset-0 z-[150] pointer-events-none"
          width="100%" height="100%"
        >
          <line
            x1={linking.startX} y1={linking.startY}
            x2={linking.curX} y2={linking.curY}
            stroke="#3b82f6" strokeWidth={2} strokeDasharray="6 3"
          />
          <circle cx={linking.startX} cy={linking.startY} r={4} fill="#3b82f6" />
          <circle cx={linking.curX} cy={linking.curY} r={4} fill="#3b82f6" opacity={0.5} />
        </svg>
      )}

      {/* Context menu */}
      {contextMenu && (
        <GanttContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          actions={contextMenu.actions}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  )
}
