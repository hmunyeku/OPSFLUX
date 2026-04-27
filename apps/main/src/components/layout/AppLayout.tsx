/**
 * AppLayout — Pajamas panel-based layout.
 *
 * Structure per 02_DESIGN_SYSTEM.md:
 * ┌──────────────────────────────────────────────────────────────────┐
 * │ TOPBAR (44px, z-100)                                            │
 * ├──────┬───────────────────────────────────────────────────────────┤
 * │ SB   │ MAIN AREA (flex: 1, display: flex)                      │
 * │ 48/  │  ┌─────────────────────┬──────────────┐                 │
 * │ 180  │  │ STATIC PANEL        │ DYNAMIC      │                 │
 * │  px  │  │ (flex:1, min-w-0)   │ PANEL (240px)│                 │
 * │      │  │                     │ border-left  │                 │
 * │      │  │ Pages render here   │ forms/detail │                 │
 * │      │  └─────────────────────┴──────────────┘                 │
 * └──────┴───────────────────────────────────────────────────────────┘
 *
 * Each page manages its own panel layout:
 *   - Static panel = list (flex:1)
 *   - Dynamic panel = create/edit/detail (240px, rendered by the page)
 *   - The list ALWAYS stays visible — NO modals for CRUD.
 */
import React, { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { cn } from '@/lib/utils'
import { useUIStore } from '@/stores/uiStore'
import api from '@/lib/api'
import { setToastAdminDefaults, syncToastPrefsFromServer, type ToastPosition } from '@/components/ui/Toast'
import { applyUIScale, getUIScale, setUIScaleAdminDefault, syncUIScaleFromServer } from '@/lib/uiScale'
import type { SettingRead } from '@/types/api'
import { Banner, syncDismissedBannersFromServer } from '@/components/ui/Banner'
import { syncDatatablePrefsFromServer } from '@/components/ui/DataTable/utils'
import { syncCollapseStatesFromServer } from '@/components/shared/CollapsibleSection'
import { useWebSocket } from '@/hooks/useWebSocket'
import { useActiveAnnouncements, useDismissAnnouncement } from '@/hooks/useAnnouncements'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'
import { DetachedPanelsPortal, renderRegisteredPanel } from './DetachedPanelRenderer'
// Side-effect: register module renderers that should be available
// app-wide (not bound to a specific page). Notifications can be opened
// from the topbar Bell on any page.
import '@/pages/notifications/NotificationsPanelRegister'
import { useUserPreferences } from '@/hooks/useUserPreferences'
import { HelpProvider, HelpPanel } from './HelpSystem'
import { AssistantPanel } from './AssistantPanel'
import { installConsoleIntercept } from '@/lib/consoleCapture'

// Install console intercept once per page load so bug tickets submitted via
// the Assistant Panel's Ticket tab can auto-attach the capture. Safe to call
// multiple times — idempotent.
installConsoleIntercept()

// ── Active Banners — renders banner-type announcements at the top ──
const BANNER_VARIANT_MAP: Record<string, 'info' | 'warning' | 'danger' | 'success'> = {
  info: 'info',
  warning: 'warning',
  critical: 'danger',
  maintenance: 'info',
}

function ActiveBanners() {
  const { data } = useActiveAnnouncements()
  const dismiss = useDismissAnnouncement()

  const banners = (data?.items ?? []).filter(
    a => (a.display_location === 'banner' || a.display_location === 'all') && !a.is_read
  )

  if (banners.length === 0) return null

  return (
    <div className="shrink-0">
      {banners.map(b => (
        <Banner
          key={b.id}
          variant={BANNER_VARIANT_MAP[b.priority] || 'info'}
          title={b.title}
          description={b.body}
          compact
          onDismiss={() => dismiss.mutate(b.id)}
        />
      ))}
    </div>
  )
}

interface AppLayoutProps {
  children: React.ReactNode
}

// Modules whose dynamic-panel content is registered at the layout
// level (not bound to a specific page) so they can be opened from
// anywhere in the app (e.g. the topbar Bell). The page-specific
// modules (planner, moc, projets, …) keep their own renderer wired
// inline within their page component.
const GLOBAL_PANEL_MODULES = new Set(['notifications'])

export function AppLayout({ children }: AppLayoutProps) {
  const location = useLocation()
  const {
    sidebarExpanded,
    setSidebarExpanded,
    toggleSidebar,
    closeDynamicPanel,
    mobileSidebarOpen,
    setMobileSidebarOpen,
  } = useUIStore()
  const dynamicPanel = useUIStore((s) => s.dynamicPanel)
  const showGlobalPanel = !!dynamicPanel && GLOBAL_PANEL_MODULES.has(dynamicPanel.module)

  // ── Persist sidebar state via user preferences (DB-backed) ──
  const { getPref, setPref } = useUserPreferences()

  // Restore sidebar state from preferences on mount
  useEffect(() => {
    const saved = getPref<boolean>('sidebarExpanded', false)
    if (saved !== sidebarExpanded) setSidebarExpanded(saved)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Sync sidebar state to preferences when it changes
  const prevSidebar = useRef(sidebarExpanded)
  useEffect(() => {
    if (prevSidebar.current !== sidebarExpanded) {
      setPref('sidebarExpanded', sidebarExpanded)
      prevSidebar.current = sidebarExpanded
    }
  }, [sidebarExpanded, setPref])

  // ── Load admin toast defaults from entity settings ──
  const { data: entitySettings } = useQuery({
    queryKey: ['settings', 'entity'],
    queryFn: async () => {
      const { data } = await api.get<SettingRead[]>('/api/v1/settings', { params: { scope: 'entity' } })
      const map: Record<string, unknown> = {}
      for (const s of data) map[s.key] = s.value?.v ?? s.value
      return map
    },
    staleTime: 5 * 60 * 1000, // 5 min — admin defaults rarely change
  })

  // ── Apply UI scale on mount ──
  // Instant apply from localStorage cache, then reconcile with the DB
  // (PATCHed by every setUIScale() call) so a scale change on Computer A
  // follows the user when they log in on Computer B.
  useEffect(() => {
    applyUIScale(getUIScale())
    // Reconcile every user-preference namespace from the DB so settings
    // follow the user across machines. All fire-and-forget: localStorage
    // keeps the UI responsive while these resolve.
    void syncUIScaleFromServer()
    void syncToastPrefsFromServer()
    void syncDatatablePrefsFromServer()
    void syncCollapseStatesFromServer()
    void syncDismissedBannersFromServer()
  }, [])

  useEffect(() => {
    if (!entitySettings) return
    setToastAdminDefaults({
      position: (entitySettings['core.toast_position'] as ToastPosition) || undefined,
      duration: (entitySettings['core.toast_duration'] as number) || undefined,
      opacity: (entitySettings['core.toast_opacity'] as number) || undefined,
    })
    // ── Apply admin UI scale default ──
    const adminScale = entitySettings['core.ui_scale']
    if (adminScale) setUIScaleAdminDefault(parseInt(String(adminScale), 10))
  }, [entitySettings])

  // Close mobile sidebar on route change
  useEffect(() => {
    setMobileSidebarOpen(false)
  }, [location.pathname, setMobileSidebarOpen])

  // Close dynamic panel on route change (user navigated away)
  useEffect(() => {
    closeDynamicPanel()
  }, [location.pathname, closeDynamicPanel])

  // ── WebSocket real-time notifications ──
  useWebSocket()

  // Close mobile sidebar on resize to desktop
  useEffect(() => {
    const onResize = () => {
      if (window.innerWidth >= 1024) setMobileSidebarOpen(false)
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [setMobileSidebarOpen])

  return (
    <HelpProvider>
    {/*
      h-dvh (dynamic viewport height) instead of h-screen so the root
      layout follows the visible viewport on mobile browsers whose URL
      bar hides on scroll. h-screen uses the "large" VH which keeps the
      bottom cut off when the URL bar reappears. Safari fallback:
      h-screen is still the computed value where dvh is unsupported.
    */}
    {/*
      Staggered reveal on mount — topbar, sidebar then main each slide
      in sequence (80 ms apart). Runs once per AppLayout mount (page
      refresh / route change into a protected area). Disabled by
      prefers-reduced-motion via the `motion-safe:` Tailwind prefix.
    */}
    <div className="flex h-dvh flex-col overflow-hidden bg-background">
      {/* ── Zone 1: Topbar ── */}
      <div className="motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-2 motion-safe:duration-300">
        <Topbar onToggleSidebar={() => setMobileSidebarOpen(!mobileSidebarOpen)} />
      </div>

      {/* ── Global banner zone ── */}
      {import.meta.env.DEV && (
        <Banner
          variant="warning"
          title="Environnement de développement"
          description="Vous utilisez l'environnement de développement. Les données peuvent être réinitialisées."
          dismissKey="banner:dev-env-v1"
          compact
        />
      )}
      <ActiveBanners />

      {/* ── Body: sidebar + main area ── */}
      <div className="flex flex-1 overflow-hidden">
        {/* Mobile overlay backdrop */}
        {mobileSidebarOpen && (
          <div
            className="fixed inset-0 bg-black/40 lg:hidden"
            style={{ zIndex: 'var(--z-sidebar)' }}
            onClick={() => setMobileSidebarOpen(false)}
          />
        )}

        {/* ── Zone 2: Sidebar — 80ms after topbar so the reveal staggers. ── */}
        <div
          className={cn(
            'fixed inset-y-0 left-0 lg:relative lg:z-auto',
            'transition-transform duration-200 lg:transition-none lg:translate-x-0',
            mobileSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
            'motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-left-2 motion-safe:duration-300 motion-safe:delay-75',
          )}
          style={{ zIndex: 'var(--z-sidebar)', top: mobileSidebarOpen ? 0 : undefined }}
        >
          <Sidebar
            collapsed={!sidebarExpanded}
            onToggle={toggleSidebar}
            onClose={() => setMobileSidebarOpen(false)}
          />
        </div>

        {/* ── Zones 3+4+5: Main area — 150ms after topbar so content lands last. ── */}
        <main
          role="main"
          id="main-content"
          data-tour="main-content"
          className="flex-1 overflow-hidden min-w-0 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:duration-300 motion-safe:delay-150"
        >
          {children}
        </main>

        {/* Global panel slot — modules in GLOBAL_PANEL_MODULES (e.g.
            notifications) render here so they can be opened from any
            page without each page having to wire a renderer. */}
        {showGlobalPanel && dynamicPanel && renderRegisteredPanel(dynamicPanel)}
      </div>

      {/* Floating detached panels (rendered via portal to body) */}
      <DetachedPanelsPortal />
      {/* FeedbackWidget removed — ticket creation now lives in AssistantPanel → Ticket tab */}
      <HelpPanel />
      <AssistantPanel />
    </div>
    </HelpProvider>
  )
}
