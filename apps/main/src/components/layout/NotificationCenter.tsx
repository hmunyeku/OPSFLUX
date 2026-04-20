/**
 * NotificationCenter — Topbar popover with notification list.
 *
 * Displays unread notifications with mark-as-read, links to related resources,
 * and a "mark all read" action. Polls unread count via useQuery.
 */
import { useState, useRef, useEffect, useCallback } from 'react'
import { Bell, Check, CheckCheck, ExternalLink, Loader2, Inbox } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import api from '@/lib/api'
import { ROUTES } from '@/lib/routes'

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

interface NotificationsResponse {
  items: Notification[]
  total: number
  page: number
  page_size: number
}

const CATEGORY_COLORS: Record<string, string> = {
  info: 'bg-blue-500',
  warning: 'bg-amber-500',
  error: 'bg-red-500',
  success: 'bg-green-500',
  workflow: 'bg-violet-500',
  system: 'bg-gray-500',
}

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

export function NotificationCenter() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [isOnline, setIsOnline] = useState(() => navigator.onLine)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  // Unread count (lightweight, polled every 60s)
  const { data: countData } = useQuery({
    queryKey: ['notifications', 'unread-count'],
    queryFn: () => api.get('/api/v1/notifications/unread-count').then((r) => r.data),
    enabled: isOnline,
    refetchInterval: isOnline ? 60_000 : false,
    staleTime: 30_000,
    retry: 1,
  })
  const unreadCount: number = countData?.unread_count ?? 0

  // Full notification list (fetched when popover opens)
  const { data: notifData, isLoading } = useQuery<NotificationsResponse>({
    queryKey: ['notifications', 'list'],
    queryFn: () => api.get('/api/v1/notifications', { params: { page_size: 20 } }).then((r) => r.data),
    enabled: open && isOnline,
    staleTime: 15_000,
    retry: 1,
  })
  const notifications = notifData?.items ?? []

  // Mark single as read
  const markRead = useMutation({
    mutationFn: (id: string) => api.patch(`/api/v1/notifications/${id}/read`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
    },
  })

  // Mark all as read
  const markAllRead = useMutation({
    mutationFn: () => api.post('/api/v1/notifications/mark-all-read'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
    },
  })

  // Close on click outside
  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  const handleNotifClick = useCallback((notif: Notification) => {
    if (!notif.read) markRead.mutate(notif.id)
    if (notif.link) {
      setOpen(false)
      navigate(notif.link)
    }
  }, [markRead, navigate])

  return (
    <div ref={containerRef} className="relative">
      {/* Bell button */}
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          'flex items-center gap-1 h-7 px-1.5 rounded-lg text-muted-foreground hover:bg-chrome-hover hover:text-foreground transition-colors relative',
          open && 'bg-chrome-hover text-foreground',
        )}
        aria-label={t('nav.notifications')}
        title={t('nav.notifications')}
      >
        {/* Bell wobbles slightly when there are unreads (calls
            attention without being obnoxious). Pauses when the popover
            opens and in prefers-reduced-motion. */}
        <Bell
          size={15}
          className={cn(
            'transition-transform',
            unreadCount > 0 && !open && 'motion-safe:animate-[opsflux-bell-wobble_3s_ease-in-out_infinite]',
          )}
        />
        {unreadCount > 0 && (
          <>
            {/* Ripple halo behind the badge — slow pulse so it's not
                distracting during long sessions. */}
            <span
              aria-hidden="true"
              className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 rounded-full bg-red-500/60 motion-safe:animate-ping opacity-75 motion-reduce:hidden"
            />
            <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold px-1 shadow-sm z-[1]">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          </>
        )}
      </button>

      {/* Popover */}
      {open && (
        <div
          className="absolute right-0 top-full mt-1 w-80 rounded-xl border border-border/70 bg-popover/95 backdrop-blur-md shadow-xl shadow-black/5 flex flex-col max-h-[420px] motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95 motion-safe:duration-150"
          style={{ zIndex: 'var(--z-dropdown)' }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-3 py-2 border-b shrink-0">
            <h3 className="text-xs font-semibold">{t('nav.notifications')}</h3>
            <div className="flex items-center gap-1">
              {unreadCount > 0 && (
                <button
                  onClick={() => markAllRead.mutate()}
                  disabled={markAllRead.isPending}
                  className="flex items-center gap-1 text-[10px] text-primary hover:underline disabled:opacity-50"
                >
                  {markAllRead.isPending ? <Loader2 size={10} className="animate-spin" /> : <CheckCheck size={10} />}
                  {t('notifications.mark_all_read')}
                </button>
              )}
            </div>
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 size={16} className="animate-spin text-muted-foreground" />
              </div>
            ) : notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 gap-2">
                <Inbox size={24} className="text-muted-foreground/30" />
                <p className="text-xs text-muted-foreground">{t('notifications.empty')}</p>
              </div>
            ) : (
              notifications.map((notif) => (
                <button
                  key={notif.id}
                  onClick={() => handleNotifClick(notif)}
                  className={cn(
                    'flex items-start gap-2.5 w-full text-left px-3 py-2.5 border-b last:border-0 hover:bg-accent/50 transition-colors',
                    !notif.read && 'bg-primary/[0.03]',
                  )}
                >
                  {/* Unread dot + category color */}
                  <div className="mt-1 shrink-0">
                    <div className={cn(
                      'w-2 h-2 rounded-full',
                      !notif.read
                        ? (CATEGORY_COLORS[notif.category] ?? 'bg-primary')
                        : 'bg-transparent',
                    )} />
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className={cn('text-xs leading-tight', !notif.read ? 'font-medium text-foreground' : 'text-muted-foreground')}>
                      {notif.title}
                    </p>
                    {notif.body && (
                      <p className="text-[10px] text-muted-foreground/80 mt-0.5 line-clamp-2">{notif.body}</p>
                    )}
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[10px] text-muted-foreground/60">{timeAgo(notif.created_at, t)}</span>
                      {notif.link && <ExternalLink size={8} className="text-muted-foreground/40" />}
                    </div>
                  </div>

                  {/* Mark as read button */}
                  {!notif.read && (
                    <button
                      onClick={(e) => { e.stopPropagation(); markRead.mutate(notif.id) }}
                      className="mt-1 p-0.5 rounded hover:bg-accent text-muted-foreground/50 hover:text-primary shrink-0"
                      title={t('notifications.mark_read')}
                    >
                      <Check size={10} />
                    </button>
                  )}
                </button>
              ))
            )}
          </div>

          {/* Footer */}
          {notifications.length > 0 && (
            <div className="border-t px-3 py-1.5 shrink-0">
              <button
                onClick={() => { setOpen(false); navigate(`${ROUTES.settings}?tab=notifications`) }}
                className="text-[10px] text-primary hover:underline"
              >
                {t('notifications.see_all')}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
