/**
 * NotificationBell — topbar bell icon with unread badge, vibrate
 * animation and sound on new notification arrival. Click opens a
 * dropdown popover listing unread items; each item marks read on
 * click and navigates to its link target. A "Voir tout" footer
 * links to the /notifications journal page.
 *
 * Lives in the topbar so the user can access it from any page —
 * previously the list was buried in the Assistant panel.
 */
import { useEffect, useRef, useState, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Bell, BellRing, CheckCheck, ExternalLink, Inbox, Loader2, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import api from '@/lib/api'
import { useAuthStore } from '@/stores/authStore'
import { useUIStore } from '@/stores/uiStore'
// Side-effect: registers the notifications panel renderer the first
// time the bell is mounted in the topbar, so "Voir tout" can open the
// dynamic panel without going through React Router.
import '@/pages/notifications/NotificationsPanelRegister'

// ── Types ──────────────────────────────────────────────────────

interface Notification {
  id: string
  title: string
  body: string | null
  category: string
  link: string | null
  read: boolean
  read_at: string | null
  created_at: string
}

interface UnreadCountResponse {
  unread_count: number
}

interface NotificationsListResponse {
  items: Notification[]
  total: number
  page: number
  page_size: number
}

// ── Category → color accent ────────────────────────────────────

const CATEGORY_COLORS: Record<string, string> = {
  info:     'bg-blue-500',
  warning:  'bg-amber-500',
  error:    'bg-red-500',
  success:  'bg-green-500',
  workflow: 'bg-violet-500',
  system:   'bg-gray-500',
}

const CATEGORY_SURFACES: Record<string, string> = {
  info:     'bg-blue-500/10 text-blue-600 dark:text-blue-400 ring-blue-500/20',
  warning:  'bg-amber-500/10 text-amber-600 dark:text-amber-400 ring-amber-500/20',
  error:    'bg-red-500/10 text-red-600 dark:text-red-400 ring-red-500/20',
  success:  'bg-green-500/10 text-green-600 dark:text-green-400 ring-green-500/20',
  workflow: 'bg-violet-500/10 text-violet-600 dark:text-violet-400 ring-violet-500/20',
  system:   'bg-gray-500/10 text-gray-600 dark:text-gray-400 ring-gray-500/20',
}

// ── Relative time ──────────────────────────────────────────────

function timeAgo(dateStr: string, t: (k: string) => string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return t('notifications.just_now')
  if (mins < 60) return `${mins}min`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  return `${days}j`
}

// ── Sound effect ───────────────────────────────────────────────
// Short pleasant "ding" generated as a tiny WAV data URI so the
// bundle doesn't need a binary asset. Two sine beeps 880→660 Hz.
// Kept very short (<200ms) so it's not intrusive.

function playDing(): void {
  try {
    const AudioCtxCtor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    if (!AudioCtxCtor) return
    const ctx = new AudioCtxCtor()
    const now = ctx.currentTime
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(880, now)
    osc.frequency.exponentialRampToValueAtTime(660, now + 0.18)
    gain.gain.setValueAtTime(0.0001, now)
    gain.gain.exponentialRampToValueAtTime(0.15, now + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start(now)
    osc.stop(now + 0.24)
    osc.onended = () => ctx.close()
  } catch {
    // no-op: sound is optional
  }
}

// ── Component ──────────────────────────────────────────────────

export function NotificationBell() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const user = useAuthStore((s) => s.user)
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const prevCountRef = useRef<number>(0)
  const firstLoadRef = useRef<boolean>(true)

  // Unread count.
  //
  // Primary signal: the WebSocket in useWebSocket() invalidates this
  // query on every push. Polling is the fallback path — it picks up
  // changes made in other tabs, and keeps the badge fresh when the
  // WS connection drops on an unstable network.
  //
  // 60s is a compromise: tight enough to feel alive on a stale tab
  // (roughly one minute after an external change), loose enough to
  // not batter the backend when WS is healthy and everything is
  // already up to date.
  const { data: countData } = useQuery<UnreadCountResponse>({
    queryKey: ['notifications', 'unread-count'],
    queryFn: () => api.get('/api/v1/notifications/unread-count').then((r) => r.data),
    enabled: !!user,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
    staleTime: 30_000,
  })
  const unreadCount = countData?.unread_count ?? 0

  // Detect arrival of new unread notifications → play ding + vibrate.
  useEffect(() => {
    if (firstLoadRef.current) {
      // Skip the very first landing — otherwise every fresh page load
      // plays the sound even when nothing new happened.
      firstLoadRef.current = false
      prevCountRef.current = unreadCount
      return
    }
    if (unreadCount > prevCountRef.current) {
      playDing()
    }
    prevCountRef.current = unreadCount
  }, [unreadCount])

  // Unread list — loaded on-demand when the popover opens.
  const { data: listData, isLoading } = useQuery<NotificationsListResponse>({
    queryKey: ['notifications', 'list', 'unread'],
    queryFn: () =>
      api
        .get('/api/v1/notifications', { params: { page_size: 20, unread_only: true } })
        .then((r) => r.data),
    enabled: !!user && open,
    staleTime: 10_000,
  })
  const items = listData?.items ?? []

  // Mark one as read (optimistic).
  const markRead = useMutation({
    mutationFn: (id: string) => api.patch(`/api/v1/notifications/${id}/read`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
    },
  })

  // Mark all as read.
  const markAllRead = useMutation({
    mutationFn: () => api.post('/api/v1/notifications/mark-all-read'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
    },
  })

  // Click handler for a notification row.
  const handleClick = useCallback(
    (n: Notification) => {
      if (!n.read) markRead.mutate(n.id)
      if (n.link) {
        navigate(n.link)
        setOpen(false)
      }
      // Informational (no link) notifications just disappear thanks to
      // the unread_only filter — no navigation needed.
    },
    [markRead, navigate],
  )

  // Close popover on outside click.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const hasUnread = unreadCount > 0

  return (
    <div className="relative" ref={containerRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={t('notifications.bell_label', 'Notifications')}
        title={t('notifications.bell_label', 'Notifications')}
        className={cn(
          'relative h-7 w-7 rounded-lg flex items-center justify-center transition-colors',
          open
            ? 'bg-primary/20 text-primary'
            : 'text-muted-foreground hover:bg-chrome-hover hover:text-foreground',
          hasUnread && !open && 'text-foreground',
        )}
      >
        {hasUnread ? (
          <BellRing
            size={15}
            // .bell-wobble runs a 4s wobble cycle (defined in index.css).
            // It respects prefers-reduced-motion automatically.
            className={cn(!open && 'bell-wobble')}
          />
        ) : (
          <Bell size={15} />
        )}

        {hasUnread && (
          <span
            aria-hidden="true"
            className="absolute -top-0.5 -right-0.5 min-w-[14px] h-[14px] px-1 rounded-full bg-red-500 text-white text-[9px] font-semibold leading-[14px] flex items-center justify-center border border-background"
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* ── Dropdown popover ────────────────────────────────── */}
      {open && (
        <div
          className="fixed inset-x-3 top-14 flex max-h-[min(78vh,34rem)] flex-col overflow-hidden rounded-lg border border-border/70 bg-popover shadow-2xl motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-1 motion-safe:duration-150 sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-[24rem] sm:max-h-[32rem] sm:shadow-[0_18px_48px_-18px_rgba(0,0,0,0.45)]"
          style={{ zIndex: 'var(--z-dropdown)' }}
          role="dialog"
          aria-label={t('notifications.page_title', 'Notifications')}
        >
          {/* Header */}
          <div className="border-b border-border/60 bg-muted/20 px-3 py-2.5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-start gap-2.5">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary ring-1 ring-primary/15">
                  <Bell size={15} />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold leading-5 text-foreground">
                    {t('notifications.page_title', 'Notifications')}
                  </p>
                  <p className="text-xs leading-4 text-muted-foreground">
                    {hasUnread
                      ? t('notifications.unread_count', { count: unreadCount, defaultValue: `${unreadCount} non lue(s)` })
                      : t('notifications.all_read', 'Tout est lu')}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-background hover:text-foreground"
                aria-label={t('common.close', 'Fermer')}
                title={t('common.close', 'Fermer')}
              >
                <X size={14} />
              </button>
            </div>
            {hasUnread && (
              <button
                onClick={() => markAllRead.mutate()}
                className="mt-2 inline-flex h-7 items-center gap-1.5 rounded-md border border-primary/25 bg-primary/10 px-2 text-xs font-medium text-primary hover:bg-primary/15 disabled:opacity-60"
                disabled={markAllRead.isPending}
              >
                <CheckCheck size={10} />
                {t('notifications.mark_all_read', 'Tout lire')}
              </button>
            )}
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto overscroll-contain">
            {isLoading && (
              <div className="flex min-h-[12rem] items-center justify-center">
                <Loader2 size={16} className="animate-spin text-muted-foreground" />
              </div>
            )}

            {!isLoading && items.length === 0 && (
              <div className="flex min-h-[13rem] flex-col items-center justify-center px-6 py-8 text-center">
                <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-lg bg-muted/60 text-muted-foreground">
                  <Inbox size={20} />
                </span>
                <p className="text-sm font-medium text-foreground">
                  {t('notifications.empty', 'Aucune notification non lue')}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t('notifications.all_read', 'Tout est lu')}
                </p>
              </div>
            )}

            {!isLoading &&
              items.map((n) => (
                <button
                  type="button"
                  key={n.id}
                  onClick={() => handleClick(n)}
                  className={cn(
                    'w-full cursor-pointer border-b border-border/40 px-3 py-3 text-left transition-colors last:border-b-0 hover:bg-muted/45',
                    !n.read && 'bg-primary/[0.04]',
                  )}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={cn(
                        'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md ring-1 ring-inset',
                        CATEGORY_SURFACES[n.category] || CATEGORY_SURFACES.system,
                      )}
                    >
                      <span className={cn('h-2 w-2 rounded-full', CATEGORY_COLORS[n.category] || 'bg-gray-500')} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p
                          className={cn(
                            'text-sm leading-5',
                            n.read
                              ? 'text-muted-foreground'
                              : 'text-foreground font-medium',
                          )}
                        >
                          {n.title}
                        </p>
                        <span className="text-[10px] text-muted-foreground shrink-0">
                          {timeAgo(n.created_at, t)}
                        </span>
                      </div>
                      {n.body && (
                        <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
                          {n.body}
                        </p>
                      )}
                    </div>
                    {n.link && (
                      <ExternalLink size={11} className="mt-1.5 shrink-0 text-muted-foreground/50" />
                    )}
                  </div>
                </button>
              ))}
          </div>

          {/* Footer — open the full journal in the right-side panel.
              Replaces the previous /notifications full-screen page;
              the panel docks like every other detail surface in OpsFlux
              and is mobile-friendly out of the box. */}
          <div className="border-t border-border/60 bg-muted/10">
            <button
              onClick={() => {
                setOpen(false)
                useUIStore.getState().openDynamicPanel({
                  type: 'detail',
                  module: 'notifications',
                  id: 'journal',
                  meta: { subtype: 'journal' },
                })
              }}
              className="flex h-10 w-full items-center justify-center gap-1.5 text-xs font-medium text-primary hover:bg-primary/5"
            >
              {t('notifications.view_all', 'Voir toutes les notifications')} →
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
