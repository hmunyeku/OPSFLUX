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
import { Bell, BellRing, CheckCheck, ExternalLink, Inbox, Loader2 } from 'lucide-react'
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
          className="absolute right-0 top-full mt-1.5 w-[22rem] max-h-[28rem] flex flex-col rounded-xl bg-popover/95 backdrop-blur-md overflow-hidden border border-border/60 shadow-[0_10px_32px_-8px_rgba(0,0,0,0.25)] motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-1 motion-safe:duration-150"
          style={{ zIndex: 'var(--z-dropdown)' }}
        >
          {/* Accent strip */}
          <span
            aria-hidden="true"
            className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-primary via-primary to-highlight"
          />

          {/* Header */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-border/60 bg-muted/20 pt-[10px]">
            <div className="text-xs font-semibold text-foreground">
              {hasUnread
                ? t('notifications.unread_count', { count: unreadCount, defaultValue: `${unreadCount} non lue(s)` })
                : t('notifications.all_read', 'Tout est lu')}
            </div>
            {hasUnread && (
              <button
                onClick={() => markAllRead.mutate()}
                className="text-[10px] text-primary hover:underline flex items-center gap-1"
                disabled={markAllRead.isPending}
              >
                <CheckCheck size={10} />
                {t('notifications.mark_all_read', 'Tout lire')}
              </button>
            )}
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto">
            {isLoading && (
              <div className="flex items-center justify-center py-10">
                <Loader2 size={16} className="animate-spin text-muted-foreground" />
              </div>
            )}

            {!isLoading && items.length === 0 && (
              <div className="text-center py-10 px-4">
                <Inbox size={28} className="mx-auto text-muted-foreground/30 mb-2" />
                <p className="text-sm text-muted-foreground">
                  {t('notifications.empty', 'Aucune notification non lue')}
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
                    'w-full text-left px-3 py-2.5 border-b border-border/40 hover:bg-muted/40 transition-colors cursor-pointer',
                    !n.read && 'bg-primary/[0.04]',
                  )}
                >
                  <div className="flex items-start gap-2.5">
                    <div
                      className={cn(
                        'w-2 h-2 rounded-full mt-1.5 shrink-0',
                        CATEGORY_COLORS[n.category] || 'bg-gray-500',
                      )}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p
                          className={cn(
                            'text-sm truncate',
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
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                          {n.body}
                        </p>
                      )}
                    </div>
                    {n.link && (
                      <ExternalLink size={10} className="text-muted-foreground/50 mt-1.5 shrink-0" />
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
              className="w-full text-xs text-primary hover:bg-primary/5 py-2 font-medium"
            >
              {t('notifications.view_all', 'Voir toutes les notifications')} →
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
