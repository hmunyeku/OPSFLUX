/**
 * UI Store (Zustand) — Manages panel layout state per Pajamas design.
 *
 * Pajamas layout:
 *   TOPBAR → SIDEBAR + MAIN AREA
 *   MAIN AREA = Static Panel + Dynamic Panel (240px) + AI Panel (260px)
 *
 * Rules:
 *   - Dynamic panel appears when an object is selected OR a form is open.
 *   - Static panel (list) stays visible — forms never use modals.
 *   - AI panel persists across navigation.
 *   - On < 1280px: only one side panel at a time (dynamic OR AI).
 *   - Any dynamic panel can be detached into a floating modal.
 *   - Multiple detached panels can coexist simultaneously.
 *
 * Dynamic panel modes:
 *   - 'docked': narrow side panel (right or left, user choice, persisted)
 *   - 'full': replaces the main content area, list hidden, with navigation
 */
import { create } from 'zustand'

// ── Panel content types ─────────────────────────────────────
export type DynamicPanelView =
  | { type: 'create'; module: string; meta?: Record<string, string>; data?: Record<string, unknown> }
  | { type: 'edit'; module: string; id: string; meta?: Record<string, string>; data?: Record<string, unknown> }
  | { type: 'detail'; module: string; id: string; meta?: Record<string, string>; data?: Record<string, unknown> }

export interface DetachedPanel {
  id: string
  view: DynamicPanelView
  x: number
  y: number
  width: number
  height: number
  zIndex: number
  /** Pinned panels persist across page reloads. */
  pinned?: boolean
}

let detachedCounter = 0
let topZIndex = 1000

// ── Persistence for panel layout preferences ──────────────
const DOCK_SIDE_KEY = 'opsflux:dynamic-panel-dock-side'
const PANEL_MODE_KEY = 'opsflux:dynamic-panel-mode'

function getStoredDockSide(): 'left' | 'right' {
  try {
    const stored = localStorage.getItem(DOCK_SIDE_KEY)
    if (stored === 'left' || stored === 'right') return stored
  } catch { /* noop */ }
  return 'right'
}

function getStoredPanelMode(): 'docked' | 'full' {
  try {
    const stored = localStorage.getItem(PANEL_MODE_KEY)
    if (stored === 'docked' || stored === 'full') return stored
  } catch { /* noop */ }
  return 'docked'
}

// ── Persistence for pinned panels ─────────────────────────
const PINNED_PANELS_KEY = 'opsflux:pinned-panels'

function savePinnedPanels(panels: DetachedPanel[]) {
  const pinned = panels.filter((p) => p.pinned)
  try {
    if (pinned.length === 0) {
      localStorage.removeItem(PINNED_PANELS_KEY)
    } else {
      localStorage.setItem(PINNED_PANELS_KEY, JSON.stringify(pinned))
    }
  } catch { /* noop */ }
}

function loadPinnedPanels(): DetachedPanel[] {
  try {
    const stored = localStorage.getItem(PINNED_PANELS_KEY)
    if (!stored) return []
    const panels = JSON.parse(stored) as DetachedPanel[]
    // Re-assign zIndexes and counter to avoid conflicts
    return panels.map((p) => {
      detachedCounter = Math.max(detachedCounter, parseInt(p.id.replace('detached-', '')) || 0)
      return { ...p, zIndex: ++topZIndex }
    })
  } catch { return [] }
}

// Debounced save for drag/resize operations (avoids thrashing localStorage)
let saveTimer: ReturnType<typeof setTimeout> | null = null
function debouncedSavePinned(panels: DetachedPanel[]) {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => savePinnedPanels(panels), 500)
}

interface UIState {
  // Sidebar
  sidebarExpanded: boolean
  setSidebarExpanded: (v: boolean) => void
  toggleSidebar: () => void

  // Dynamic panel (240px, right of static panel)
  dynamicPanel: DynamicPanelView | null
  openDynamicPanel: (view: DynamicPanelView) => void
  closeDynamicPanel: () => void

  // Dynamic panel layout preferences (persisted)
  dynamicPanelMode: 'docked' | 'full'
  dynamicPanelDockSide: 'left' | 'right'
  setDynamicPanelMode: (mode: 'docked' | 'full') => void
  toggleDynamicPanelMode: () => void
  setDockSide: (side: 'left' | 'right') => void
  toggleDockSide: () => void

  // Dynamic panel navigation (set by pages, consumed by panel header)
  dynamicPanelNavItems: string[]
  setDynamicPanelNavItems: (items: string[]) => void
  navigateToItem: (id: string) => void

  // Detached panels (floating modals)
  detachedPanels: DetachedPanel[]
  detachDynamicPanel: () => void
  closeDetachedPanel: (id: string) => void
  updateDetachedPanel: (id: string, updates: Partial<Pick<DetachedPanel, 'x' | 'y' | 'width' | 'height'>>) => void
  bringToFront: (id: string) => void
  reattachPanel: (id: string) => void
  togglePinPanel: (id: string) => void

  // AI panel (260px, rightmost)
  aiPanelOpen: boolean
  toggleAIPanel: () => void

  // Mobile sidebar
  mobileSidebarOpen: boolean
  setMobileSidebarOpen: (v: boolean) => void

  // Global search — topbar search bar is contextualizable per page
  globalSearch: string
  setGlobalSearch: (v: string) => void
}

export const useUIStore = create<UIState>((set, get) => ({
  // Sidebar
  sidebarExpanded: false,
  setSidebarExpanded: (v) => set({ sidebarExpanded: v }),
  toggleSidebar: () => set((s) => ({ sidebarExpanded: !s.sidebarExpanded })),

  // Dynamic panel
  dynamicPanel: null,
  openDynamicPanel: (view) => set({ dynamicPanel: view }),
  closeDynamicPanel: () => set({ dynamicPanel: null }),

  // Dynamic panel layout preferences
  dynamicPanelMode: getStoredPanelMode(),
  dynamicPanelDockSide: getStoredDockSide(),

  setDynamicPanelMode: (mode) => {
    set({ dynamicPanelMode: mode })
    try { localStorage.setItem(PANEL_MODE_KEY, mode) } catch { /* noop */ }
  },

  toggleDynamicPanelMode: () => {
    const newMode = get().dynamicPanelMode === 'docked' ? 'full' : 'docked'
    set({ dynamicPanelMode: newMode })
    try { localStorage.setItem(PANEL_MODE_KEY, newMode) } catch { /* noop */ }
  },

  setDockSide: (side) => {
    set({ dynamicPanelDockSide: side })
    try { localStorage.setItem(DOCK_SIDE_KEY, side) } catch { /* noop */ }
  },

  toggleDockSide: () => {
    const newSide = get().dynamicPanelDockSide === 'left' ? 'right' : 'left'
    set({ dynamicPanelDockSide: newSide })
    try { localStorage.setItem(DOCK_SIDE_KEY, newSide) } catch { /* noop */ }
  },

  // Dynamic panel navigation
  dynamicPanelNavItems: [],
  setDynamicPanelNavItems: (items) => set({ dynamicPanelNavItems: items }),

  navigateToItem: (id) => {
    const { dynamicPanel } = get()
    if (!dynamicPanel) return
    set({ dynamicPanel: { type: 'detail', module: dynamicPanel.module, id } })
  },

  // Detached panels (restored pinned panels on load)
  detachedPanels: loadPinnedPanels(),

  detachDynamicPanel: () => {
    const { dynamicPanel } = get()
    if (!dynamicPanel) return
    const id = `detached-${++detachedCounter}`
    const offsetIndex = get().detachedPanels.length
    // Center in viewport with slight cascade offset
    const vw = typeof window !== 'undefined' ? window.innerWidth : 1280
    const vh = typeof window !== 'undefined' ? window.innerHeight : 800
    const w = Math.min(480, vw - 80)
    const h = Math.min(600, vh - 80)
    const newPanel: DetachedPanel = {
      id,
      view: dynamicPanel,
      x: Math.round((vw - w) / 2) + offsetIndex * 24,
      y: Math.round((vh - h) / 2) + offsetIndex * 24,
      width: w,
      height: h,
      zIndex: ++topZIndex,
    }
    set((s) => ({
      dynamicPanel: null,
      detachedPanels: [...s.detachedPanels, newPanel],
    }))
  },

  closeDetachedPanel: (id) => {
    const remaining = get().detachedPanels.filter((p) => p.id !== id)
    set({ detachedPanels: remaining })
    savePinnedPanels(remaining)
  },

  updateDetachedPanel: (id, updates) => {
    const updated = get().detachedPanels.map((p) =>
      p.id === id ? { ...p, ...updates } : p,
    )
    set({ detachedPanels: updated })
    // Debounced persistence for pinned panels (drag/resize moves)
    debouncedSavePinned(updated)
  },

  bringToFront: (id) =>
    set((s) => ({
      detachedPanels: s.detachedPanels.map((p) =>
        p.id === id ? { ...p, zIndex: ++topZIndex } : p,
      ),
    })),

  reattachPanel: (id) => {
    const panel = get().detachedPanels.find((p) => p.id === id)
    if (!panel) return
    const remaining = get().detachedPanels.filter((p) => p.id !== id)
    set({ dynamicPanel: panel.view, detachedPanels: remaining })
    savePinnedPanels(remaining)
  },

  togglePinPanel: (id) => {
    const updated = get().detachedPanels.map((p) =>
      p.id === id ? { ...p, pinned: !p.pinned } : p,
    )
    set({ detachedPanels: updated })
    savePinnedPanels(updated)
  },

  // AI panel
  aiPanelOpen: false,
  toggleAIPanel: () => set((s) => ({ aiPanelOpen: !s.aiPanelOpen })),

  // Mobile sidebar
  mobileSidebarOpen: false,
  setMobileSidebarOpen: (v) => set({ mobileSidebarOpen: v }),

  // Global search
  globalSearch: '',
  setGlobalSearch: (v) => set({ globalSearch: v }),
}))
