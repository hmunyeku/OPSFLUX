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
} from 'lucide-react'
import { useState, useRef, useEffect, useSyncExternalStore, useCallback, useMemo } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { offlineQueue } from '@/lib/offlineQueue'
import { cn } from '@/lib/utils'
import { CommandPalette, useCommandPalette } from '@/components/ui/CommandPalette'
// HelpSystem context no longer needed — help is in AssistantPanel
import { EntitySwitcher } from '@/components/layout/EntitySwitcher'
// NotificationCenter and AnnouncementCenter removed — merged into AssistantPanel
import { ThemeMenu } from '@/components/layout/ThemeMenu'
import { safeLocal } from '@/lib/safeStorage'

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
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const { user, logout, actingContext, setActingContext } = useAuthStore()
  const qc = useQueryClient()
  const globalSearch = useUIStore((s) => s.globalSearch)
  const setGlobalSearch = useUIStore((s) => s.setGlobalSearch)
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

  const toggleLanguage = () => {
    const newLang = i18n.language === 'fr' ? 'en' : 'fr'
    i18n.changeLanguage(newLang)
    safeLocal.setItem('language', newLang)
  }

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
        className="flex h-11 items-center border-b border-border bg-chrome px-2 sm:px-3 shrink-0 gap-1 sm:gap-2"
        style={{ zIndex: 'var(--z-topbar)' }}
      >
        {/* ── Left: Logo + mobile menu ── */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <button
            onClick={onToggleSidebar}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-chrome-hover hover:text-foreground transition-colors lg:hidden"
            aria-label="Toggle sidebar"
          >
            <Menu size={16} />
          </button>

          <button
            onClick={() => navigate('/dashboard')}
            className="flex items-center gap-1.5 shrink-0"
            aria-label="OpsFlux"
          >
            <div className="h-7 w-7 rounded-lg bg-primary flex items-center justify-center">
              <span className="text-xs font-bold text-primary-foreground leading-none">OF</span>
            </div>
          </button>

          <ConnectivityLED />
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
              className="w-full h-8 rounded-lg border border-border bg-chrome px-3 pl-9 pr-16 text-sm text-foreground placeholder:text-muted-foreground hover:bg-chrome-hover hover:border-border focus:bg-background focus:border-primary/40 focus:ring-1 focus:ring-primary/20 transition-colors outline-none"
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
            <kbd className="absolute right-3 top-1/2 -translate-y-1/2 hidden sm:inline-flex h-5 select-none items-center rounded-sm border border-border bg-chrome px-1.5 font-mono text-xs text-muted-foreground">
              ⌘K
            </kbd>
          </div>
        </div>

        {/* ── Mobile spacer pushes right actions to the edge ── */}
        <div className="flex-1 sm:hidden" />

        {/* ── Right: Actions ── */}
        <div className="flex items-center shrink-0">
          {/* Mobile-only search trigger — opens the slide-down overlay */}
          <button
            onClick={() => setMobileSearchOpen(true)}
            className="sm:hidden flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-chrome-hover hover:text-foreground transition-colors"
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

          <button
            onClick={toggleLanguage}
            className="hidden sm:flex h-7 items-center rounded-lg px-1.5 text-xs font-medium text-muted-foreground hover:bg-chrome-hover hover:text-foreground transition-colors uppercase"
            title={i18n.language === 'fr' ? 'English' : 'Français'}
          >
            {i18n.language}
          </button>

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
                className="absolute right-0 top-full mt-1 w-56 rounded-lg bg-popover py-1 shadow-pajamas"
                style={{ zIndex: 'var(--z-dropdown)', boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}
              >
                {user && (
                  <div className="px-3 py-2.5 border-b border-border flex items-center gap-3">
                    <UserAvatar size={32} />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">{user.first_name} {user.last_name}</p>
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
                      onClick={() => { setShowUserMenu(false); navigate('/settings#delegations') }}
                      className="mt-2 text-xs text-primary hover:underline"
                    >
                      {t('settings.delegations.manage_link')}
                    </button>
                  </div>
                )}
                <div className="py-1">
                  <button
                    onClick={() => { setShowUserMenu(false); navigate('/settings') }}
                    className="flex w-full items-center gap-2.5 px-3 py-1.5 text-sm text-popover-foreground hover:bg-accent rounded-sm mx-0 transition-colors"
                  >
                    <UserIcon size={14} />
                    {t('nav.profile')}
                  </button>
                  <button
                    onClick={() => { setShowUserMenu(false); navigate('/settings') }}
                    className="flex w-full items-center gap-2.5 px-3 py-1.5 text-sm text-popover-foreground hover:bg-accent rounded-sm mx-0 transition-colors"
                  >
                    <Settings size={14} />
                    {t('nav.settings')}
                  </button>
                </div>
                <div className="my-0.5 h-px bg-border" />
                <div className="py-1">
                  <button
                    onClick={() => { setShowUserMenu(false); logout(); navigate('/login') }}
                    className="flex w-full items-center gap-2.5 px-3 py-1.5 text-sm text-destructive hover:bg-accent rounded-sm mx-0 transition-colors"
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
