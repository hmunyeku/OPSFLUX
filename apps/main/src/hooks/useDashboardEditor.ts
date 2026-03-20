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

export function useDashboardEditor({ tabId, initialWidgets }: UseDashboardEditorOptions) {
  const [widgets, setWidgets] = useState<DashboardWidget[]>(initialWidgets)
  const [selectedWidgetId, setSelectedWidgetId] = useState<string | null>(null)
  const [isDirty, setIsDirty] = useState(false)
  const updateTab = useUpdateDashboardTab()
  const debouncedSave = useRef<ReturnType<typeof setTimeout>>()

  // Sync when tab changes
  useEffect(() => {
    setWidgets(initialWidgets)
    setSelectedWidgetId(null)
    setIsDirty(false)
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
    setWidgets((prev) => [...prev, newWidget])
    setSelectedWidgetId(newWidget.id)
    setIsDirty(true)
  }, [widgets])

  const removeWidget = useCallback((widgetId: string) => {
    setWidgets((prev) => prev.filter((w) => w.id !== widgetId))
    if (selectedWidgetId === widgetId) setSelectedWidgetId(null)
    setIsDirty(true)
  }, [selectedWidgetId])

  const moveWidget = useCallback((activeId: string, overId: string) => {
    setWidgets((prev) => {
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
  }, [])

  const resizeWidget = useCallback((widgetId: string, w: number, h: number) => {
    setWidgets((prev) =>
      prev.map((widget) =>
        widget.id === widgetId
          ? { ...widget, position: { ...widget.position, w, h } }
          : widget
      )
    )
    setIsDirty(true)
  }, [])

  const updateWidgetConfig = useCallback((widgetId: string, configPatch: Record<string, unknown>) => {
    setWidgets((prev) =>
      prev.map((widget) =>
        widget.id === widgetId
          ? { ...widget, config: { ...widget.config, ...configPatch } }
          : widget
      )
    )
    setIsDirty(true)
  }, [])

  const updateWidgetMeta = useCallback((widgetId: string, metaPatch: Partial<Pick<DashboardWidget, 'title' | 'description' | 'permissions'>>) => {
    setWidgets((prev) =>
      prev.map((widget) =>
        widget.id === widgetId
          ? { ...widget, ...metaPatch }
          : widget
      )
    )
    setIsDirty(true)
  }, [])

  const selectWidget = useCallback((id: string | null) => {
    setSelectedWidgetId(id)
  }, [])

  // Flush pending save immediately (call before exiting edit mode)
  const flushSave = useCallback(() => {
    clearTimeout(debouncedSave.current)
    if (isDirty) {
      updateTab.mutate({ id: tabId, widgets })
      setIsDirty(false)
    }
  }, [isDirty, tabId, widgets, updateTab])

  // Update a full widget (from DashboardGrid resize callback)
  const updateWidget = useCallback((updated: DashboardWidget) => {
    setWidgets((prev) =>
      prev.map((w) => (w.id === updated.id ? updated : w))
    )
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
    setWidgets,
  }
}
