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
import { safeLocal } from '@/lib/safeStorage'

// ── Panel content types ─────────────────────────────────────
export type DynamicPanelView =
  | { type: 'create'; module: string; meta?: Record<string, unknown>; data?: Record<string, unknown> }
  | { type: 'edit'; module: string; id: string; meta?: Record<string, unknown>; data?: Record<string, unknown> }
  | { type: 'detail'; module: string; id: string; meta?: Record<string, unknown>; data?: Record<string, unknown> }
  | { type: 'task-detail'; module: string; id: string; meta?: Record<string, unknown>; data?: Record<string, unknown> }

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
    const stored = safeLocal.getItem(DOCK_SIDE_KEY)
    if (stored === 'left' || stored === 'right') return stored
  } catch { /* noop */ }
  return 'right'
}

function getStoredPanelMode(): 'docked' | 'full' {
  try {
    const stored = safeLocal.getItem(PANEL_MODE_KEY)
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
      safeLocal.removeItem(PINNED_PANELS_KEY)
    } else {
      safeLocal.setItem(PINNED_PANELS_KEY, JSON.stringify(pinned))
    }
  } catch { /* noop */ }
}

function loadPinnedPanels(): DetachedPanel[] {
  try {
    const stored = safeLocal.getItem(PINNED_PANELS_KEY)
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
  /**
   * Detach the current dynamic panel as a real OS window (`window.open`).
   * Falls back to the floating modal mode below 1024px viewport
   * (popups become full-screen tabs on mobile — bad UX). Auth
   * cookies + localStorage flow over automatically; React Query
   * cache is synced via BroadcastChannel (see lib/popupBroadcast).
   */
  detachDynamicPanelToWindow: () => void
  closeDetachedPanel: (id: string) => void
  updateDetachedPanel: (id: string, updates: Partial<Pick<DetachedPanel, 'x' | 'y' | 'width' | 'height'>>) => void
  bringToFront: (id: string) => void
  reattachPanel: (id: string) => void
  togglePinPanel: (id: string) => void

  // AI panel (260px, rightmost)
  aiPanelOpen: boolean
  toggleAIPanel: () => void
  setAIPanelOpen: (v: boolean) => void
  /** Which tab the AssistantPanel is on. Allows external components
   *  (e.g. the SmartForm wizard's "Aide" button) to deep-link to a
   *  specific tab when opening the assistant. */
  assistantTab: 'chat' | 'help' | 'tours' | 'alerts' | 'ticket'
  setAssistantTab: (tab: 'chat' | 'help' | 'tours' | 'alerts' | 'ticket') => void

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
    try { safeLocal.setItem(PANEL_MODE_KEY, mode) } catch { /* noop */ }
  },

  toggleDynamicPanelMode: () => {
    const newMode = get().dynamicPanelMode === 'docked' ? 'full' : 'docked'
    set({ dynamicPanelMode: newMode })
    try { safeLocal.setItem(PANEL_MODE_KEY, newMode) } catch { /* noop */ }
  },

  setDockSide: (side) => {
    set({ dynamicPanelDockSide: side })
    try { safeLocal.setItem(DOCK_SIDE_KEY, side) } catch { /* noop */ }
  },

  toggleDockSide: () => {
    const newSide = get().dynamicPanelDockSide === 'left' ? 'right' : 'left'
    set({ dynamicPanelDockSide: newSide })
    try { safeLocal.setItem(DOCK_SIDE_KEY, newSide) } catch { /* noop */ }
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

  detachDynamicPanelToWindow: () => {
    const { dynamicPanel, detachDynamicPanel } = get()
    if (!dynamicPanel) return
    // Mobile / narrow viewports: a real window.open opens a full-
    // screen tab on mobile and most tablets (Chrome / Safari iOS /
    // Android), which makes the panel fight the parent for screen
    // space. Fall back to the floating-modal detach there.
    const vw = typeof window !== 'undefined' ? window.innerWidth : 0
    if (vw < 1024) {
      detachDynamicPanel()
      return
    }

    const id = `popup-${++detachedCounter}`
    const params = new URLSearchParams()
    params.set('module', dynamicPanel.module)
    params.set('type', dynamicPanel.type)
    if ('id' in dynamicPanel && dynamicPanel.id) params.set('entity_id', dynamicPanel.id)
    if (dynamicPanel.meta) {
      try {
        params.set('meta', encodeURIComponent(JSON.stringify(dynamicPanel.meta)))
      } catch {
        // meta not JSON-serialisable (rare) — drop it; the panel
        // works without on most modules.
      }
    }
    const url = `/_popup/${id}?${params.toString()}`
    // Sized to comfortably hold the standard panel (DynamicPanelShell
    // body is ~640px wide at the widest, plus chrome). The user can
    // resize freely afterwards.
    const w = 720
    const h = Math.min(900, (typeof window !== 'undefined' ? window.screen.availHeight : 900))
    const left = Math.max(0, ((typeof window !== 'undefined' ? window.screen.availWidth : 1920) - w) / 2)
    const top = Math.max(0, ((typeof window !== 'undefined' ? window.screen.availHeight : 1080) - h) / 2)
    const features = `popup=yes,width=${w},height=${h},left=${Math.round(left)},top=${Math.round(top)},menubar=no,toolbar=no,location=no,status=no,resizable=yes,scrollbars=yes`
    const popup = window.open(url, id, features)
    if (!popup) {
      // Pop-up blocker fired — degrade to the floating modal.
      // (Browsers block when window.open is called outside a user
      // gesture; the toolbar button click should always satisfy the
      // gesture requirement, so this branch is a defensive fallback.)
      detachDynamicPanel()
      return
    }
    // Close the parent's panel slot — the user wanted it on the
    // popup. The parent's React Query cache stays subscribed to
    // the same data via BroadcastChannel (see lib/popupBroadcast).
    set({ dynamicPanel: null })
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
  setAIPanelOpen: (v: boolean) => set({ aiPanelOpen: v }),
  assistantTab: 'chat',
  setAssistantTab: (tab) => set({ assistantTab: tab }),

  // Mobile sidebar
  mobileSidebarOpen: false,
  setMobileSidebarOpen: (v) => set({ mobileSidebarOpen: v }),

  // Global search
  globalSearch: '',
  setGlobalSearch: (v) => set({ globalSearch: v }),
}))
