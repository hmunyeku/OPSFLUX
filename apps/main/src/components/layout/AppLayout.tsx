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
import { setToastAdminDefaults, type ToastPosition } from '@/components/ui/Toast'
import { applyUIScale, getUIScale, setUIScaleAdminDefault } from '@/lib/uiScale'
import type { SettingRead } from '@/types/api'
import { Banner } from '@/components/ui/Banner'
import { useWebSocket } from '@/hooks/useWebSocket'
import { useActiveAnnouncements, useDismissAnnouncement } from '@/hooks/useAnnouncements'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'
import { DetachedPanelsPortal } from './DetachedPanelRenderer'
import { useUserPreferences } from '@/hooks/useUserPreferences'
import { FeedbackWidget } from './FeedbackWidget'
import { HelpProvider, HelpPanel } from './HelpSystem'
import { AssistantPanel } from './AssistantPanel'

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
  useEffect(() => {
    applyUIScale(getUIScale())
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
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      {/* ── Zone 1: Topbar ── */}
      <Topbar onToggleSidebar={() => setMobileSidebarOpen(!mobileSidebarOpen)} />

      {/* ── Global banner zone ── */}
      {import.meta.env.DEV && (
        <Banner
          variant="warning"
          title="Environnement de developpement"
          description="Vous utilisez l'environnement de developpement. Les donnees peuvent etre reintialisees."
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

        {/* ── Zone 2: Sidebar ── */}
        <div
          className={cn(
            'fixed inset-y-0 left-0 lg:relative lg:z-auto',
            'transition-transform duration-200 lg:transition-none lg:translate-x-0',
            mobileSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
          )}
          style={{ zIndex: 'var(--z-sidebar)', top: mobileSidebarOpen ? 0 : undefined }}
        >
          <Sidebar
            collapsed={!sidebarExpanded}
            onToggle={toggleSidebar}
            onClose={() => setMobileSidebarOpen(false)}
          />
        </div>

        {/* ── Zones 3+4+5: Main area — pages render static + dynamic panels ── */}
        <main
          role="main"
          id="main-content"
          data-tour="main-content"
          className="flex-1 overflow-hidden min-w-0"
        >
          {children}
        </main>
      </div>

      {/* Floating detached panels (rendered via portal to body) */}
      <DetachedPanelsPortal />
      <FeedbackWidget />
      <HelpPanel />
      <AssistantPanel />
    </div>
    </HelpProvider>
  )
}
