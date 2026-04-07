/**
 * useDashboardEditor — State management hook for the 3-panel dashboard editor.
 *
 * Manages local widget state, selection, CRUD operations, and debounced auto-save.
 * All mutations update local state immediately (optimistic) then persist via API.
 */
import { useState, useCallback, useEffect, useRef } from 'react'
import { useUpdateDashboardTab } from '@/hooks/useDashboard'
import type { DashboardWidget, WidgetCatalogEntry, WidgetPosition } from '@/services/dashboardService'

const COLS = 12

/**
 * Find the first free position in a 12-column grid for a widget of size w×h.
 * Scans row by row, left to right, looking for a gap that doesn't overlap existing widgets.
 */
function findNextFreePosition(widgets: DashboardWidget[], w: number, h: number): WidgetPosition {
  // Build an occupancy grid
  const maxRow = widgets.reduce((max, wg) => Math.max(max, (wg.position?.y ?? 0) + (wg.position?.h ?? 4)), 0) + h + 2
  const occupied = new Set<string>()
  for (const wg of widgets) {
    const px = wg.position?.x ?? 0
    const py = wg.position?.y ?? 0
    const pw = wg.position?.w ?? 4
    const ph = wg.position?.h ?? 4
    for (let r = py; r < py + ph; r++) {
      for (let c = px; c < px + pw; c++) {
        occupied.add(`${r},${c}`)
      }
    }
  }

  // Scan for first free slot
  for (let y = 0; y < maxRow; y++) {
    for (let x = 0; x <= COLS - w; x++) {
      let fits = true
      for (let r = y; r < y + h && fits; r++) {
        for (let c = x; c < x + w && fits; c++) {
          if (occupied.has(`${r},${c}`)) fits = false
        }
      }
      if (fits) return { x, y, w, h }
    }
  }

  // Fallback: place below everything
  return { x: 0, y: maxRow, w, h }
}

interface UseDashboardEditorOptions {
  tabId: string
  initialWidgets: DashboardWidget[]
}

const HISTORY_LIMIT = 50

export function useDashboardEditor({ tabId, initialWidgets }: UseDashboardEditorOptions) {
  const [widgets, setWidgets] = useState<DashboardWidget[]>(initialWidgets)
  const [selectedWidgetId, setSelectedWidgetId] = useState<string | null>(null)
  const [isDirty, setIsDirty] = useState(false)
  const updateTab = useUpdateDashboardTab()
  const debouncedSave = useRef<ReturnType<typeof setTimeout>>()

  // Undo/redo history
  const historyRef = useRef<DashboardWidget[][]>([initialWidgets])
  const historyIndexRef = useRef(0)
  const skipHistoryRef = useRef(false)

  const pushHistory = useCallback((newWidgets: DashboardWidget[]) => {
    if (skipHistoryRef.current) { skipHistoryRef.current = false; return }
    const idx = historyIndexRef.current
    const stack = historyRef.current.slice(0, idx + 1)
    stack.push(newWidgets)
    if (stack.length > HISTORY_LIMIT) stack.shift()
    historyRef.current = stack
    historyIndexRef.current = stack.length - 1
  }, [])

  // Keep refs in sync so the unmount effect can read latest values
  const latestRef = useRef({ tabId, widgets, isDirty })
  latestRef.current = { tabId, widgets, isDirty }
  const saveOnUnmountRef = useRef(true)

  // Helper: setWidgets + push to history stack
  const setWidgetsWithHistory = useCallback((updater: DashboardWidget[] | ((prev: DashboardWidget[]) => DashboardWidget[])) => {
    setWidgets((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater
      pushHistory(next)
      return next
    })
  }, [pushHistory])

  // Sync when tab changes
  useEffect(() => {
    setWidgets(initialWidgets)
    setSelectedWidgetId(null)
    setIsDirty(false)
    historyRef.current = [initialWidgets]
    historyIndexRef.current = 0
  }, [tabId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-save with debounce
  useEffect(() => {
    if (!isDirty) return
    clearTimeout(debouncedSave.current)
    debouncedSave.current = setTimeout(() => {
      updateTab.mutate({ id: tabId, widgets })
      setIsDirty(false)
    }, 800)
    return () => clearTimeout(debouncedSave.current)
  }, [widgets, isDirty, tabId, updateTab])

  // Flush any pending save on unmount (unless cancelled)
  useEffect(() => {
    return () => {
      clearTimeout(debouncedSave.current)
      if (saveOnUnmountRef.current) {
        const { tabId: tid, widgets: w, isDirty: dirty } = latestRef.current
        if (dirty) {
          updateTab.mutate({ id: tid, widgets: w })
        }
      }
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const selectedWidget = widgets.find((w) => w.id === selectedWidgetId) ?? null

  // ── CRUD Operations ──

  const addWidget = useCallback((entry: WidgetCatalogEntry, dropPosition?: WidgetPosition) => {
    const w = 4, h = 4 // default widget size
    const pos = dropPosition ?? findNextFreePosition(widgets, w, h)
    const newWidget: DashboardWidget = {
      id: `widget-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      type: entry.type,
      title: entry.title,
      description: entry.description,
      config: { ...entry.default_config },
      position: pos,
    }
    setWidgetsWithHistory((prev) => [...prev, newWidget])
    setSelectedWidgetId(newWidget.id)
    setIsDirty(true)
  }, [widgets, setWidgetsWithHistory])

  const removeWidget = useCallback((widgetId: string) => {
    setWidgetsWithHistory((prev) => prev.filter((w) => w.id !== widgetId))
    if (selectedWidgetId === widgetId) setSelectedWidgetId(null)
    setIsDirty(true)
  }, [selectedWidgetId, setWidgetsWithHistory])

  const moveWidget = useCallback((activeId: string, overId: string) => {
    setWidgetsWithHistory((prev) => {
      const activeIdx = prev.findIndex((w) => w.id === activeId)
      const overIdx = prev.findIndex((w) => w.id === overId)
      if (activeIdx === -1 || overIdx === -1) return prev
      const updated = [...prev]
      const activePos = { ...updated[activeIdx].position }
      const overPos = { ...updated[overIdx].position }
      updated[activeIdx] = { ...updated[activeIdx], position: overPos }
      updated[overIdx] = { ...updated[overIdx], position: activePos }
      return updated
    })
    setIsDirty(true)
  }, [setWidgetsWithHistory])

  const resizeWidget = useCallback((widgetId: string, w: number, h: number) => {
    setWidgetsWithHistory((prev) =>
      prev.map((widget) =>
        widget.id === widgetId
          ? { ...widget, position: { ...widget.position, w, h } }
          : widget
      )
    )
    setIsDirty(true)
  }, [setWidgetsWithHistory])

  const updateWidgetConfig = useCallback((widgetId: string, configPatch: Record<string, unknown>) => {
    setWidgetsWithHistory((prev) =>
      prev.map((widget) =>
        widget.id === widgetId
          ? { ...widget, config: { ...widget.config, ...configPatch } }
          : widget
      )
    )
    setIsDirty(true)
  }, [setWidgetsWithHistory])

  const updateWidgetMeta = useCallback((widgetId: string, metaPatch: Partial<Pick<DashboardWidget, 'title' | 'description' | 'permissions'>>) => {
    setWidgetsWithHistory((prev) =>
      prev.map((widget) =>
        widget.id === widgetId
          ? { ...widget, ...metaPatch }
          : widget
      )
    )
    setIsDirty(true)
  }, [setWidgetsWithHistory])

  const selectWidget = useCallback((id: string | null) => {
    setSelectedWidgetId(id)
  }, [])

  // Flush pending save immediately (call before exiting edit mode)
  const flushSave = useCallback(() => {
    clearTimeout(debouncedSave.current)
    if (isDirty) {
      updateTab.mutate({ id: tabId, widgets })
      setIsDirty(false)
      // Also update ref so the unmount effect doesn't double-save
      latestRef.current = { ...latestRef.current, isDirty: false }
    }
  }, [isDirty, tabId, widgets, updateTab])

  // Discard all changes and prevent save on unmount
  const discardChanges = useCallback(() => {
    clearTimeout(debouncedSave.current)
    saveOnUnmountRef.current = false
    setWidgets(initialWidgets)
    setIsDirty(false)
    // Also update ref immediately so neither auto-save nor unmount effect fires
    latestRef.current = { tabId, widgets: initialWidgets, isDirty: false }
  }, [initialWidgets, tabId])

  // Update a full widget (from DashboardGrid resize callback)
  const updateWidget = useCallback((updated: DashboardWidget) => {
    setWidgetsWithHistory((prev) =>
      prev.map((w) => (w.id === updated.id ? updated : w))
    )
    setIsDirty(true)
  }, [setWidgetsWithHistory])

  // ── Undo / Redo ──
  const canUndo = historyIndexRef.current > 0
  const canRedo = historyIndexRef.current < historyRef.current.length - 1

  const undo = useCallback(() => {
    if (historyIndexRef.current <= 0) return
    historyIndexRef.current -= 1
    const prev = historyRef.current[historyIndexRef.current]
    skipHistoryRef.current = true
    setWidgets(prev)
    setIsDirty(true)
  }, [])

  const redo = useCallback(() => {
    if (historyIndexRef.current >= historyRef.current.length - 1) return
    historyIndexRef.current += 1
    const next = historyRef.current[historyIndexRef.current]
    skipHistoryRef.current = true
    setWidgets(next)
    setIsDirty(true)
  }, [])

  return {
    widgets,
    selectedWidget,
    selectedWidgetId,
    isDirty,
    addWidget,
    removeWidget,
    moveWidget,
    resizeWidget,
    updateWidgetConfig,
    updateWidgetMeta,
    updateWidget,
    selectWidget,
    flushSave,
    discardChanges,
    setWidgets,
    undo,
    redo,
    canUndo,
    canRedo,
  }
}
