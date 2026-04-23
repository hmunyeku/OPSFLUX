/**
 * NotificationsPage — journal page for all notifications.
 *
 * Two-column layout: list on the left, detail pane on the right.
 * Filters: all / unread / read  +  category (info/warning/error/success/workflow/system).
 * Clicking a notification:
 *   - marks it read (if unread)
 *   - selects it in the right pane
 *   - if it has a `link`, shows a big "Ouvrir" button that navigates there
 *   - if it has no link (informational), the "Archiver" button simply
 *     removes it (soft delete backend-side).
 *
 * Reached via the topbar bell → "Voir tout" footer link.
 */
import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  Bell,
  CheckCheck,
  ChevronRight,
  ExternalLink,
  Filter,
  Inbox,
  Loader2,
  Mail,
  MailOpen,
  Trash2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import api from '@/lib/api'
import { PanelHeader, PanelContent } from '@/components/layout/PanelHeader'
import { EmptyState } from '@/components/ui/EmptyState'

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

interface Paginated<T> {
  items: T[]
  total: number
  page: number
  page_size: number
}

const CATEGORIES = ['info', 'warning', 'error', 'success', 'workflow', 'system'] as const
type Category = (typeof CATEGORIES)[number] | 'all'

const CATEGORY_COLORS: Record<string, string> = {
  info:     'bg-blue-500/15 text-blue-600 dark:text-blue-400',
  warning:  'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  error:    'bg-red-500/15 text-red-600 dark:text-red-400',
  success:  'bg-green-500/15 text-green-600 dark:text-green-400',
  workflow: 'bg-violet-500/15 text-violet-600 dark:text-violet-400',
  system:   'bg-gray-500/15 text-gray-600 dark:text-gray-400',
}

const CATEGORY_DOT: Record<string, string> = {
  info:     'bg-blue-500',
  warning:  'bg-amber-500',
  error:    'bg-red-500',
  success:  'bg-green-500',
  workflow: 'bg-violet-500',
  system:   'bg-gray-500',
}

// ── Helpers ────────────────────────────────────────────────────

function timeAgo(dateStr: string, t: (k: string) => string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return t('notifications.just_now')
  if (mins < 60) return `${mins}min`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}j`
  return new Date(dateStr).toLocaleDateString()
}

// ── Page ───────────────────────────────────────────────────────

export function NotificationsPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [statusFilter, setStatusFilter] = useState<'all' | 'unread' | 'read'>('all')
  const [categoryFilter, setCategoryFilter] = useState<Category>('all')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  // Paginated list from the backend. For now we fetch a single page of
  // 100 — sufficient for the journal view. Infinite scroll can come
  // later once real volumes justify it.
  const { data, isLoading } = useQuery<Paginated<Notification>>({
    queryKey: ['notifications', 'journal', statusFilter],
    queryFn: () =>
      api
        .get('/api/v1/notifications', {
          params: {
            page: 1,
            page_size: 100,
            unread_only: statusFilter === 'unread' ? true : undefined,
          },
        })
        .then((r) => r.data),
    staleTime: 15_000,
  })

  const allItems = data?.items ?? []

  // Apply read + category filter client-side.
  const filteredItems = useMemo(() => {
    return allItems.filter((n) => {
      if (statusFilter === 'read' && !n.read) return false
      if (categoryFilter !== 'all' && n.category !== categoryFilter) return false
      return true
    })
  }, [allItems, statusFilter, categoryFilter])

  const selected = useMemo(
    () => filteredItems.find((n) => n.id === selectedId) ?? null,
    [filteredItems, selectedId],
  )

  const markRead = useMutation({
    mutationFn: (id: string) => api.patch(`/api/v1/notifications/${id}/read`),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  })

  const markAllRead = useMutation({
    mutationFn: () => api.post('/api/v1/notifications/mark-all-read'),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  })

  const archive = useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/notifications/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
      setSelectedId(null)
    },
  })

  const handleSelect = (n: Notification) => {
    if (!n.read) markRead.mutate(n.id)
    setSelectedId(n.id)
  }

  const unreadCount = allItems.filter((n) => !n.read).length

  return (
    <>
      <PanelHeader
        title={t('notifications.page_title', 'Notifications')}
        subtitle={
          unreadCount > 0
            ? t('notifications.unread_count', {
                count: unreadCount,
                defaultValue: `${unreadCount} non lue(s)`,
              })
            : t('notifications.all_read', 'Tout est lu')
        }
        icon={Bell}
      >
        {unreadCount > 0 && (
          <button
            onClick={() => markAllRead.mutate()}
            disabled={markAllRead.isPending}
            className="gl-button-sm gl-button-confirm inline-flex items-center gap-1.5"
          >
            <CheckCheck size={12} />
            {t('notifications.mark_all_read', 'Tout lire')}
          </button>
        )}
      </PanelHeader>

      <PanelContent>
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.4fr] gap-3 h-[calc(100vh-10rem)]">
          {/* ── Left: list ─────────────────────────────────── */}
          <div className="flex flex-col rounded-lg border border-border bg-card overflow-hidden">
            {/* Filters */}
            <div className="flex flex-col gap-2 p-2.5 border-b border-border/60 bg-muted/10">
              <div className="flex items-center gap-1 text-[11px]">
                <Filter size={11} className="text-muted-foreground" />
                {(['all', 'unread', 'read'] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => setStatusFilter(s)}
                    className={cn(
                      'px-2 py-0.5 rounded-md transition-colors',
                      statusFilter === s
                        ? 'bg-primary/15 text-primary font-medium'
                        : 'text-muted-foreground hover:bg-chrome-hover',
                    )}
                  >
                    {t(`notifications.filter_${s}`, s)}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-1 text-[10px]">
                <button
                  onClick={() => setCategoryFilter('all')}
                  className={cn(
                    'px-1.5 py-0.5 rounded transition-colors',
                    categoryFilter === 'all'
                      ? 'bg-foreground/10 text-foreground font-medium'
                      : 'text-muted-foreground hover:bg-chrome-hover',
                  )}
                >
                  {t('notifications.category_all', 'Toutes')}
                </button>
                {CATEGORIES.map((c) => (
                  <button
                    key={c}
                    onClick={() => setCategoryFilter(c)}
                    className={cn(
                      'px-1.5 py-0.5 rounded transition-colors inline-flex items-center gap-1',
                      categoryFilter === c
                        ? CATEGORY_COLORS[c] + ' font-medium'
                        : 'text-muted-foreground hover:bg-chrome-hover',
                    )}
                  >
                    <span className={cn('w-1.5 h-1.5 rounded-full', CATEGORY_DOT[c])} />
                    {t(`notifications.category_${c}`, c)}
                  </button>
                ))}
              </div>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto">
              {isLoading && (
                <div className="flex items-center justify-center py-10">
                  <Loader2 size={16} className="animate-spin text-muted-foreground" />
                </div>
              )}

              {!isLoading && filteredItems.length === 0 && (
                <EmptyState
                  icon={Inbox}
                  title={t('notifications.empty_filtered_title', 'Aucune notification')}
                  description={t(
                    'notifications.empty_filtered_description',
                    'Ajustez les filtres pour afficher plus de résultats.',
                  )}
                />
              )}

              {!isLoading &&
                filteredItems.map((n) => {
                  const isActive = selected?.id === n.id
                  return (
                    <button
                      type="button"
                      key={n.id}
                      onClick={() => handleSelect(n)}
                      className={cn(
                        'w-full text-left px-3 py-2.5 border-b border-border/40 transition-colors',
                        isActive
                          ? 'bg-primary/10'
                          : !n.read
                          ? 'bg-primary/[0.04] hover:bg-muted/40'
                          : 'hover:bg-muted/40',
                      )}
                    >
                      <div className="flex items-start gap-2.5">
                        <div
                          className={cn(
                            'w-2 h-2 rounded-full mt-1.5 shrink-0',
                            CATEGORY_DOT[n.category] || 'bg-gray-500',
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
                        <ChevronRight
                          size={12}
                          className="text-muted-foreground/50 mt-1 shrink-0"
                        />
                      </div>
                    </button>
                  )
                })}
            </div>
          </div>

          {/* ── Right: detail pane ─────────────────────────── */}
          <div className="rounded-lg border border-border bg-card overflow-hidden flex flex-col">
            {!selected && (
              <div className="flex-1 flex items-center justify-center p-6">
                <EmptyState
                  icon={Bell}
                  title={t('notifications.select_title', 'Sélectionnez une notification')}
                  description={t(
                    'notifications.select_description',
                    'Cliquez sur un élément de la liste pour voir son détail.',
                  )}
                />
              </div>
            )}

            {selected && (
              <>
                <div className="px-4 py-3 border-b border-border/60 flex items-start gap-3 bg-muted/10">
                  <span
                    className={cn(
                      'inline-flex items-center justify-center w-8 h-8 rounded-md shrink-0',
                      CATEGORY_COLORS[selected.category] || 'bg-muted',
                    )}
                  >
                    {selected.read ? <MailOpen size={14} /> : <Mail size={14} />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <h2 className="text-sm font-semibold text-foreground leading-tight">
                      {selected.title}
                    </h2>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {new Date(selected.created_at).toLocaleString()} ·{' '}
                      {t(`notifications.category_${selected.category}`, selected.category)}
                    </p>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto p-4 text-sm text-foreground/90 whitespace-pre-line">
                  {selected.body || (
                    <span className="text-muted-foreground italic">
                      {t('notifications.no_body', 'Aucun contenu détaillé pour cette notification.')}
                    </span>
                  )}
                </div>

                <div className="border-t border-border/60 bg-muted/10 px-4 py-2.5 flex items-center gap-2 justify-end">
                  <button
                    onClick={() => archive.mutate(selected.id)}
                    disabled={archive.isPending}
                    className="gl-button-sm gl-button-default inline-flex items-center gap-1.5"
                  >
                    <Trash2 size={12} />
                    {t('notifications.archive', 'Archiver')}
                  </button>
                  {selected.link ? (
                    <button
                      onClick={() => navigate(selected.link!)}
                      className="gl-button-sm gl-button-confirm inline-flex items-center gap-1.5"
                    >
                      <ExternalLink size={12} />
                      {t('notifications.open', 'Ouvrir')}
                    </button>
                  ) : null}
                </div>
              </>
            )}
          </div>
        </div>
      </PanelContent>
    </>
  )
}
