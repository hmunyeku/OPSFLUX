/**
 * Topbar — GitLab Pajamas-style, 44px height.
 *
 * Pajamas (audited 2025):
 * - 44px height, bg-chrome
 * - Search: Contextualizable input — filters current page; ⌘K opens CommandPalette
 * - Buttons: 28px icon buttons, 8px radius
 * - Dropdown: 8px radius container, 4px radius items, no border, shadow
 * - Typography: 14px, font-weight 400
 */
import { useTranslation } from 'react-i18next'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'
import { useUIStore } from '@/stores/uiStore'
import { useActingContexts, useCurrentActingContext } from '@/hooks/useSettings'
import { resolveApiBaseUrl } from '@/lib/runtimeUrls'
import {
  Search,
  Menu,
  LogOut,
  User as UserIcon,
  Plus,
  Settings,
  X,
  Sparkles,
  LayoutGrid,
} from 'lucide-react'
import { useState, useRef, useEffect, useSyncExternalStore, useCallback, useMemo } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { offlineQueue } from '@/lib/offlineQueue'
import { cn } from '@/lib/utils'
import { CommandPalette, useCommandPalette } from '@/components/ui/CommandPalette'
// HelpSystem context no longer needed — help is in AssistantPanel
import { EntitySwitcher } from '@/components/layout/EntitySwitcher'
// Topbar notification bell — restored (2026-04-23). Journal page at /notifications.
import { NotificationBell } from '@/components/layout/NotificationBell'
import { ThemeMenu } from '@/components/layout/ThemeMenu'
import { LanguageSwitcher } from '@/components/layout/LanguageSwitcher'
import { ROUTES } from '@/lib/routes'

interface TopbarProps {
  onToggleSidebar: () => void
}

function TopbarIconButton({
  icon: Icon,
  label,
  onClick,
  badge,
}: {
  icon: React.ElementType
  label: string
  onClick?: () => void
  badge?: number
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1 h-7 px-1.5 rounded-lg text-muted-foreground hover:bg-chrome-hover hover:text-foreground transition-colors"
      aria-label={label}
      title={label}
    >
      <Icon size={15} />
      {badge !== undefined && <span className="text-xs font-medium tabular-nums">{badge}</span>}
    </button>
  )
}

/** User avatar — img if avatar_url available, initials fallback. */
export function UserAvatar({ size = 24 }: { size?: number }) {
  const user = useAuthStore((s) => s.user)
  if (!user) return <div style={{ width: size, height: size }} className="rounded-full bg-muted" />

  if (user.avatar_url) {
    return (
      <img
        src={user.avatar_url}
        alt={`${user.first_name} ${user.last_name}`}
        className="rounded-full object-cover"
        style={{ width: size, height: size }}
      />
    )
  }
  return (
    <div
      className="flex items-center justify-center rounded-full bg-primary text-primary-foreground font-semibold leading-none"
      style={{ width: size, height: size, fontSize: size * 0.42 }}
    >
      {user.first_name[0]}{user.last_name[0]}
    </div>
  )
}

/** Maps route path to a search placeholder hint. */
function useSearchPlaceholder(): string {
  const { t } = useTranslation()
  const { pathname } = useLocation()
  if (pathname.startsWith('/assets')) return `${t('common.search')} — ${t('assets.title')}...`
  if (pathname.startsWith('/tiers')) return `${t('common.search')} — ${t('tiers.title')}...`
  if (pathname.startsWith('/users')) return `${t('common.search')} — ${t('users.title')}...`
  return `${t('common.search')}...`
}

// ── Connectivity LED ────────────────────────────────────────

type ConnectivityStatus = 'online' | 'syncing' | 'offline' | 'degraded'

interface HealthDetail {
  status: ConnectivityStatus
  /** Human-readable detail for tooltip */
  detail: string
}

// Module-level flag toggled by opsflux:sync-start / opsflux:sync-end events
let _isSyncing = false

if (typeof window !== 'undefined') {
  window.addEventListener('opsflux:sync-start', () => { _isSyncing = true })
  window.addEventListener('opsflux:sync-end', () => { _isSyncing = false })
}

function useOnlineStatus(): HealthDetail {
  const [apiHealth, setApiHealth] = useState<{ ok: boolean; db?: string; redis?: string } | null>(null)

  // Ping /api/health every 30s to detect backend / DB / Redis down
  useEffect(() => {
    let mounted = true
    const baseUrl = resolveApiBaseUrl()
    const check = async () => {
      if (!navigator.onLine) {
        if (mounted) setApiHealth({ ok: false })
        return
      }
      try {
        const ctrl = new AbortController()
        const timer = setTimeout(() => ctrl.abort(), 5000)
        const res = await fetch(`${baseUrl}/api/health`, { method: 'GET', signal: ctrl.signal })
        clearTimeout(timer)
        if (!mounted) return
        if (res.ok) {
          setApiHealth({ ok: true })
        } else {
          // 503 — parse body for details
          try {
            const body = await res.json()
            setApiHealth({ ok: false, db: body.database, redis: body.redis })
          } catch {
            setApiHealth({ ok: false })
          }
        }
      } catch {
        if (mounted) setApiHealth({ ok: false })
      }
    }
    check()
    const interval = setInterval(check, 30_000)
    const recheck = () => { check() }
    window.addEventListener('online', recheck)
    window.addEventListener('offline', recheck)
    return () => {
      mounted = false
      clearInterval(interval)
      window.removeEventListener('online', recheck)
      window.removeEventListener('offline', recheck)
    }
  }, [])

  const subscribe = useCallback((cb: () => void) => {
    window.addEventListener('online', cb)
    window.addEventListener('offline', cb)
    window.addEventListener('opsflux:sync-start', cb)
    window.addEventListener('opsflux:sync-end', cb)
    window.addEventListener('opsflux:queue-change', cb)
    return () => {
      window.removeEventListener('online', cb)
      window.removeEventListener('offline', cb)
      window.removeEventListener('opsflux:sync-start', cb)
      window.removeEventListener('opsflux:sync-end', cb)
      window.removeEventListener('opsflux:queue-change', cb)
    }
  }, [])

  const networkStatus = useSyncExternalStore(
    subscribe,
    () => {
      if (!navigator.onLine) return 'offline' as ConnectivityStatus
      if (_isSyncing) return 'syncing' as ConnectivityStatus
      return 'online' as ConnectivityStatus
    },
    () => 'online' as ConnectivityStatus,
  )

  // Combine network + API health into a single status with detail
  if (networkStatus === 'offline') return { status: 'offline', detail: 'Hors ligne — mode offline actif' }
  if (networkStatus === 'syncing') return { status: 'syncing', detail: 'Synchronisation en cours…' }

  if (apiHealth === null) return { status: 'online', detail: 'Vérification en cours…' }

  if (!apiHealth.ok) {
    // Build detailed message
    const problems: string[] = []
    if (apiHealth.db === 'error') problems.push('Base de données')
    if (apiHealth.redis === 'error') problems.push('Redis')
    if (problems.length > 0) {
      return { status: 'degraded', detail: `Service dégradé — ${problems.join(' + ')} inaccessible` }
    }
    return { status: 'degraded', detail: 'Serveur API inaccessible' }
  }

  return { status: 'online', detail: 'En ligne — tous les services opérationnels' }
}

const statusConfig: Record<ConnectivityStatus, { color: string; pulse: boolean }> = {
  online: { color: 'bg-green-500', pulse: false },
  syncing: { color: 'bg-amber-500', pulse: true },
  degraded: { color: 'bg-orange-500', pulse: true },
  offline: { color: 'bg-red-500', pulse: true },
}

function useQueueSize(): number {
  const [size, setSize] = useState(0)

  useEffect(() => {
    const refresh = () => {
      offlineQueue.getQueueSize().then(setSize).catch(() => setSize(0))
    }
    refresh()
    window.addEventListener('opsflux:queue-change', refresh)
    window.addEventListener('opsflux:sync-end', refresh)
    return () => {
      window.removeEventListener('opsflux:queue-change', refresh)
      window.removeEventListener('opsflux:sync-end', refresh)
    }
  }, [])

  return size
}

function ConnectivityLED() {
  const { status, detail } = useOnlineStatus()
  const queueSize = useQueueSize()
  const { color, pulse } = statusConfig[status]

  const title = useMemo(() => {
    if (queueSize > 0) return `${detail} (${queueSize} mutation${queueSize > 1 ? 's' : ''} en attente)`
    return detail
  }, [detail, queueSize])

  return (
    <span className="relative flex items-center gap-1" title={title}>
      <span className="relative flex h-2.5 w-2.5">
        {pulse && (
          <span className={`absolute inset-0 rounded-full ${color} opacity-75 animate-ping`} />
        )}
        <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${color}`} />
      </span>
      {queueSize > 0 && (
        <span className="text-[10px] font-medium tabular-nums text-amber-600 dark:text-amber-400">
          {queueSize}
        </span>
      )}
    </span>
  )
}

export function Topbar({ onToggleSidebar }: TopbarProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { user, logout, actingContext, setActingContext } = useAuthStore()
  const qc = useQueryClient()
  const globalSearch = useUIStore((s) => s.globalSearch)
  const setGlobalSearch = useUIStore((s) => s.setGlobalSearch)
  const sidebarExpanded = useUIStore((s) => s.sidebarExpanded)
  const [showUserMenu, setShowUserMenu] = useState(false)
  // ── Mobile search overlay state ─────────────────────────────
  // On screens < sm we hide the inline search input from the
  // topbar (it was getting squeezed to ~50px). A magnifier icon
  // toggles a full-width slide-down search bar instead. Tapping
  // outside or pressing Escape closes it.
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const mobileSearchRef = useRef<HTMLInputElement>(null)
  const { open: paletteOpen, setOpen: setPaletteOpen } = useCommandPalette()
  const { aiPanelOpen, toggleAIPanel } = useUIStore()
  const placeholder = useSearchPlaceholder()
  const { data: availableContexts = [] } = useActingContexts()
  const { data: currentActingContext } = useCurrentActingContext()

  // Auto-focus the mobile search field when the overlay opens
  useEffect(() => {
    if (mobileSearchOpen) mobileSearchRef.current?.focus()
  }, [mobileSearchOpen])

  // Escape closes the mobile search overlay
  useEffect(() => {
    if (!mobileSearchOpen) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileSearchOpen(false)
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [mobileSearchOpen])

  const handleActingContextChange = (nextKey: string) => {
    setActingContext(nextKey)
    qc.invalidateQueries({ queryKey: ['rbac', 'my-permissions'] })
    qc.invalidateQueries({ queryKey: ['acting-contexts'] })
    qc.invalidateQueries({ queryKey: ['acting-context'] })
  }

  // `toggleLanguage` was the old hardcoded fr↔en handler for the
  // removed topbar button. LanguageSwitcher now owns this behaviour
  // and reads the full enabled-languages list from the API.


  // ⌘K opens CommandPalette
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setPaletteOpen(true)
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [setPaletteOpen])

  // Clear search when navigating to a different page
  const { pathname } = useLocation()
  useEffect(() => {
    setGlobalSearch('')
  }, [pathname, setGlobalSearch])

  useEffect(() => {
    if (!showUserMenu) return
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowUserMenu(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showUserMenu])

  return (
    <>
      <header
        role="banner"
        data-tour="topbar"
        // Subtle gradient + backdrop-blur gives the topbar some depth
        // against the noise-textured body. 1px gradient line at the
        // bottom instead of a flat border for a softer horizon.
        className="relative flex h-11 items-center bg-chrome/90 backdrop-blur-md px-2 sm:px-3 shrink-0 gap-1 sm:gap-2 supports-[backdrop-filter]:bg-chrome/80"
        style={{ zIndex: 'var(--z-topbar)' }}
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-border to-transparent"
        />
        {/* ── Left: Logo + mobile menu ── */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <button
            onClick={onToggleSidebar}
            // Touch target ≥ 36px on mobile/tablet (WCAG 2.5.5 minimum
            // 24px, Apple HIG recommends 44pt, we land on 36px as the
            // design compromise). Reverts to the dense 28px footprint
            // from `lg:` up where pointer devices dominate.
            className="flex h-9 w-9 lg:h-7 lg:w-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-chrome-hover hover:text-foreground transition-colors lg:hidden"
            aria-label="Toggle sidebar"
          >
            <Menu size={16} />
          </button>

          <button
            onClick={() => navigate(ROUTES.dashboard)}
            className="flex items-center gap-1.5 shrink-0"
            aria-label="OpsFlux"
          >
            <div className="h-7 w-7 rounded-lg bg-primary flex items-center justify-center">
              <span className="text-xs font-bold text-primary-foreground leading-none">OF</span>
            </div>
          </button>

          <ConnectivityLED />

          {/* Home shortcut — only rendered when the sidebar is
              collapsed (nav icons only) so users can always jump
              back to the launcher page and navigate to any module
              from there, even without expanding the sidebar. */}
          {!sidebarExpanded && (
            <button
              onClick={() => navigate('/home')}
              className="hidden lg:flex h-7 w-7 ml-0.5 items-center justify-center rounded-lg text-muted-foreground hover:bg-chrome-hover hover:text-foreground transition-colors"
              title={t('nav.home', 'Accueil')}
              aria-label="Accueil"
            >
              <LayoutGrid size={15} />
            </button>
          )}

          <div className="mx-1 h-4 w-px bg-border hidden lg:block" />
          <EntitySwitcher />
        </div>

        {/* ── Center: Contextual search input (hidden on < sm to free space) ── */}
        <div data-tour="search-bar" className="hidden sm:flex flex-1 justify-center px-2 sm:px-4 min-w-0">
          <div className="relative w-full max-w-lg">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <input
              ref={searchInputRef}
              type="text"
              value={globalSearch}
              onChange={(e) => setGlobalSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && globalSearch.trim()) {
                  navigate(`/search?q=${encodeURIComponent(globalSearch.trim())}`)
                }
              }}
              placeholder={placeholder}
              autoComplete="off"
              name="opsflux-global-search"
              // Rounded pill + subtle inner shadow + primary-tinted
              // focus ring. Polishes the global search without losing
              // its scannable compact height.
              className="w-full h-8 rounded-full border border-border/60 bg-chrome/80 px-3 pl-9 pr-16 text-sm text-foreground placeholder:text-muted-foreground hover:bg-chrome-hover hover:border-border focus:bg-background focus:border-primary/50 focus:ring-2 focus:ring-primary/20 transition-all outline-none shadow-[inset_0_1px_2px_rgba(0,0,0,0.02)]"
            />
            {globalSearch && (
              <button
                onClick={() => setGlobalSearch('')}
                className="absolute right-10 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                aria-label={t('common.clear')}
              >
                <X size={14} />
              </button>
            )}
            <kbd className="absolute right-3 top-1/2 -translate-y-1/2 hidden sm:inline-flex h-5 select-none items-center rounded-md border border-border/70 bg-background/80 backdrop-blur-sm px-1.5 font-mono text-[11px] tracking-tight text-muted-foreground shadow-[inset_0_-1px_0_hsl(var(--border)/0.6),0_1px_0_hsl(var(--border)/0.5)]">
              ⌘K
            </kbd>
          </div>
        </div>

        {/* ── Mobile spacer pushes right actions to the edge ── */}
        <div className="flex-1 sm:hidden" />

        {/* ── Right: Actions ── */}
        <div className="flex items-center shrink-0">
          {/* Mobile-only search trigger — opens the slide-down overlay.
              36px target for the same WCAG 2.5.5 reason as the burger. */}
          <button
            onClick={() => setMobileSearchOpen(true)}
            className="sm:hidden flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-chrome-hover hover:text-foreground transition-colors"
            aria-label={t('common.search')}
          >
            <Search size={15} />
          </button>

          {/* Create button — desktop only (each module has its own create button) */}
          <span className="hidden sm:inline-flex">
            <TopbarIconButton icon={Plus} label={t('common.create')} />
          </span>

          <div className="mx-1.5 h-4 w-px bg-border hidden sm:block" />

          <span className="hidden sm:flex items-center">
            <ThemeMenu />
          </span>

          <LanguageSwitcher />

          <NotificationBell />

          <button
            data-tour="assistant-button"
            onClick={toggleAIPanel}
            className={cn(
              'relative h-7 w-7 rounded-lg flex items-center justify-center transition-colors',
              aiPanelOpen
                ? 'bg-primary/20 text-primary'
                : 'text-muted-foreground hover:bg-chrome-hover hover:text-foreground',
            )}
            title="Assistant OpsFlux"
          >
            <Sparkles size={15} />
          </button>

          {/* User avatar + dropdown */}
          <div className="relative ml-1" ref={menuRef}>
            <button
              onClick={() => setShowUserMenu(!showUserMenu)}
              className="flex h-7 w-7 items-center justify-center rounded-full hover:ring-2 hover:ring-primary/20 transition-all"
            >
              <UserAvatar size={24} />
            </button>

            {showUserMenu && (
              <div
                // Glassy backdrop + accent strip vocabulary — matches
                // NotificationCenter / ThemeMenu / AnnouncementCenter.
                // motion-safe entrance: slight fade + 4px slide.
                className="absolute right-0 top-full mt-1.5 w-60 rounded-xl bg-popover/95 backdrop-blur-md py-1 overflow-hidden border border-border/60 shadow-[0_10px_32px_-8px_rgba(0,0,0,0.25)] motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-1 motion-safe:duration-150"
                style={{ zIndex: 'var(--z-dropdown)' }}
              >
                {/* Top accent strip — primary → highlight, 2px */}
                <span
                  aria-hidden="true"
                  className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-primary via-primary to-highlight"
                />
                {user && (
                  <div className="px-3 py-2.5 border-b border-border/60 flex items-center gap-3 bg-gradient-to-br from-primary/[0.04] to-transparent">
                    <UserAvatar size={36} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-foreground truncate font-display tracking-tight">{user.first_name} {user.last_name}</p>
                      <p className="text-xs text-muted-foreground truncate">@{user.email?.split('@')[0]}</p>
                    </div>
                  </div>
                )}
                {(availableContexts.length > 1 || actingContext !== 'own') && (
                  <div className="px-3 py-2 border-b border-border">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground mb-2">
                      {t('topbar.acting_as')}
                    </p>
                    <select
                      value={actingContext}
                      onChange={(e) => handleActingContextChange(e.target.value)}
                      className="gl-form-input h-8 text-xs"
                    >
                      {availableContexts.map((context) => (
                        <option key={context.key} value={context.key}>
                          {context.mode === 'simulate'
                            ? `${t('topbar.simulation')} — ${currentActingContext?.mode === 'simulate' && currentActingContext.target_user ? `${currentActingContext.target_user.first_name} ${currentActingContext.target_user.last_name}` : context.label}`
                            : context.label}
                        </option>
                      ))}
                      {actingContext.startsWith('simulate:') && currentActingContext?.target_user && (
                        <option value={actingContext}>
                          {t('topbar.simulation')} — {currentActingContext.target_user.first_name} {currentActingContext.target_user.last_name}
                        </option>
                      )}
                    </select>
                    <button
                      onClick={() => { setShowUserMenu(false); navigate(`${ROUTES.settings}#delegations`) }}
                      className="mt-2 text-xs text-primary hover:underline"
                    >
                      {t('settings.delegations.manage_link')}
                    </button>
                  </div>
                )}
                <div className="py-1">
                  <button
                    onClick={() => { setShowUserMenu(false); navigate(ROUTES.settings) }}
                    className="group flex w-full items-center gap-2.5 px-3 py-2 text-sm text-popover-foreground hover:bg-accent/60 hover:text-foreground hover:pl-3.5 rounded-md mx-1 transition-all"
                  >
                    <UserIcon size={14} />
                    {t('nav.profile')}
                  </button>
                  <button
                    onClick={() => { setShowUserMenu(false); navigate(ROUTES.settings) }}
                    className="group flex w-full items-center gap-2.5 px-3 py-2 text-sm text-popover-foreground hover:bg-accent/60 hover:text-foreground hover:pl-3.5 rounded-md mx-1 transition-all"
                  >
                    <Settings size={14} />
                    {t('nav.settings')}
                  </button>
                </div>
                <div className="my-0.5 h-px bg-border/60" />
                <div className="py-1">
                  <button
                    onClick={() => { setShowUserMenu(false); logout(); navigate(ROUTES.login) }}
                    className="group flex w-full items-center gap-2.5 px-3 py-2 text-sm text-destructive hover:bg-destructive/10 hover:pl-3.5 rounded-md mx-1 transition-all"
                  >
                    <LogOut size={14} />
                    {t('nav.logout')}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ── Mobile search overlay ── */}
      {/* Slides down from under the topbar on screens < sm. Tapping the
          backdrop or pressing Escape closes it. Submitting (Enter)
          navigates to /search and closes the overlay. */}
      {mobileSearchOpen && (
        <>
          <div
            className="fixed inset-0 bg-black/40 sm:hidden"
            style={{ zIndex: 'var(--z-topbar)' }}
            onClick={() => setMobileSearchOpen(false)}
            aria-hidden="true"
          />
          <div
            className="fixed left-0 right-0 sm:hidden bg-chrome border-b border-border px-3 py-2 flex items-center gap-2"
            style={{ top: 'var(--topbar-height, 2.75rem)', zIndex: 'calc(var(--z-topbar) + 1)' }}
            role="search"
          >
            <div className="relative flex-1">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              <input
                ref={mobileSearchRef}
                type="text"
                value={globalSearch}
                onChange={(e) => setGlobalSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && globalSearch.trim()) {
                    navigate(`/search?q=${encodeURIComponent(globalSearch.trim())}`)
                    setMobileSearchOpen(false)
                  }
                }}
                placeholder={placeholder}
                autoComplete="off"
                name="opsflux-mobile-search"
                className="w-full h-9 rounded-lg border border-border bg-background px-3 pl-9 pr-9 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary/40 focus:ring-1 focus:ring-primary/20 outline-none"
              />
              {globalSearch && (
                <button
                  onClick={() => setGlobalSearch('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label={t('common.clear')}
                >
                  <X size={14} />
                </button>
              )}
            </div>
            <button
              onClick={() => setMobileSearchOpen(false)}
              className="text-sm text-primary px-2 py-1 rounded-md hover:bg-chrome-hover"
            >
              {t('common.cancel')}
            </button>
          </div>
        </>
      )}

      {/* Command Palette overlay */}
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </>
  )
}
