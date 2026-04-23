/**
 * NotificationsPage — notification journal aligned on OpsFlux
 * standards (PanelHeader + PanelContent + PageNavBar + EmptyState).
 *
 * Two-column layout (list / detail). Click on a list row marks the
 * notification read and shows the detail. If the notification has a
 * `link`, a primary "Ouvrir" action navigates there. Informational
 * notifications (no link) can be archived with one click.
 *
 * Filters are split in two orthogonal axes:
 *   • Status  → PageNavBar pills (Toutes / Non lues / Lues) with counts
 *   • Category→ Colored chips (info/warning/error/success/workflow/system)
 */
import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  Bell,
  CheckCheck,
  ExternalLink,
  Inbox,
  Mail,
  MailOpen,
  RefreshCw,
  Trash2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import api from '@/lib/api'
import { PanelHeader, PanelContent } from '@/components/layout/PanelHeader'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageNavBar } from '@/components/ui/Tabs'

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
type StatusFilter = 'all' | 'unread' | 'read'

const CATEGORY_COLORS: Record<string, string> = {
  info:     'bg-blue-500/15 text-blue-600 dark:text-blue-400 ring-blue-500/20',
  warning:  'bg-amber-500/15 text-amber-600 dark:text-amber-400 ring-amber-500/20',
  error:    'bg-red-500/15 text-red-600 dark:text-red-400 ring-red-500/20',
  success:  'bg-green-500/15 text-green-600 dark:text-green-400 ring-green-500/20',
  workflow: 'bg-violet-500/15 text-violet-600 dark:text-violet-400 ring-violet-500/20',
  system:   'bg-gray-500/15 text-gray-600 dark:text-gray-400 ring-gray-500/20',
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

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [categoryFilter, setCategoryFilter] = useState<Category>('all')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const { data, isLoading, isFetching, refetch } = useQuery<Paginated<Notification>>({
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

  // Counters for the status tabs.
  const totalUnread = useMemo(
    () => allItems.filter((n) => !n.read).length,
    [allItems],
  )
  const totalRead = allItems.length - totalUnread

  // Client-side filter for read/unread (if server returned everything)
  // + category.
  const filteredItems = useMemo(() => {
    return allItems.filter((n) => {
      if (statusFilter === 'read' && !n.read) return false
      if (statusFilter === 'unread' && n.read) return false
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

  const subtitleText =
    totalUnread > 0
      ? t('notifications.unread_count', {
          count: totalUnread,
          defaultValue: `${totalUnread} non lue(s)`,
        })
      : t('notifications.all_read', 'Tout est lu')

  return (
    <>
      <PanelHeader
        title={t('notifications.page_title', 'Notifications')}
        subtitle={subtitleText}
        icon={Bell}
      >
        <button
          type="button"
          onClick={() => refetch()}
          disabled={isFetching}
          title={t('common.refresh', 'Rafraîchir')}
          className="gl-button-sm gl-button-default inline-flex items-center gap-1.5"
        >
          <RefreshCw size={12} className={cn(isFetching && 'animate-spin')} />
        </button>
        {totalUnread > 0 && (
          <button
            type="button"
            onClick={() => markAllRead.mutate()}
            disabled={markAllRead.isPending}
            className="gl-button-sm gl-button-confirm inline-flex items-center gap-1.5"
          >
            <CheckCheck size={12} />
            <span className="hidden sm:inline">
              {t('notifications.mark_all_read', 'Tout lire')}
            </span>
          </button>
        )}
      </PanelHeader>

      <PanelContent>
        {/* Status pills at the top — standard PageNavBar pattern */}
        <div className="px-4 pt-3 pb-2 border-b border-border/40 bg-background">
          <PageNavBar<StatusFilter>
            items={[
              {
                id: 'all',
                label: t('notifications.filter_all', 'Toutes'),
                icon: Inbox,
                badge: allItems.length || undefined,
              },
              {
                id: 'unread',
                label: t('notifications.filter_unread', 'Non lues'),
                icon: Mail,
                badge: totalUnread || undefined,
              },
              {
                id: 'read',
                label: t('notifications.filter_read', 'Lues'),
                icon: MailOpen,
                badge: totalRead || undefined,
              },
            ]}
            activeId={statusFilter}
            onTabChange={(id) => {
              setStatusFilter(id)
              setSelectedId(null)
            }}
            rightSlot={
              <div className="hidden md:flex items-center gap-1 flex-wrap">
                <button
                  onClick={() => setCategoryFilter('all')}
                  className={cn(
                    'px-2 py-0.5 rounded text-[10px] transition-colors',
                    categoryFilter === 'all'
                      ? 'bg-foreground/10 text-foreground font-medium'
                      : 'text-muted-foreground hover:bg-chrome-hover',
                  )}
                >
                  {t('notifications.category_all', 'Toutes catégories')}
                </button>
                {CATEGORIES.map((c) => (
                  <button
                    key={c}
                    onClick={() => setCategoryFilter(c)}
                    className={cn(
                      'px-2 py-0.5 rounded text-[10px] transition-colors inline-flex items-center gap-1 ring-1 ring-inset',
                      categoryFilter === c
                        ? CATEGORY_COLORS[c] + ' font-medium'
                        : 'text-muted-foreground ring-transparent hover:bg-chrome-hover',
                    )}
                  >
                    <span className={cn('w-1.5 h-1.5 rounded-full', CATEGORY_DOT[c])} />
                    {t(`notifications.category_${c}`, c)}
                  </button>
                ))}
              </div>
            }
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[minmax(320px,1fr)_1.4fr] gap-3 p-3 h-[calc(100vh-9rem)]">
          {/* ── Left: list ─────────────────────────────────── */}
          <div className="flex flex-col rounded-lg border border-border bg-card overflow-hidden min-h-0">
            <div className="flex-1 overflow-y-auto">
              {isLoading && (
                <div className="flex items-center justify-center py-12">
                  <RefreshCw size={16} className="animate-spin text-muted-foreground" />
                </div>
              )}

              {!isLoading && filteredItems.length === 0 && (
                <EmptyState
                  variant={allItems.length === 0 ? 'blank' : 'search'}
                  icon={Inbox}
                  title={
                    allItems.length === 0
                      ? t('notifications.empty_all_title', 'Aucune notification')
                      : t('notifications.empty_filtered_title', 'Aucun résultat')
                  }
                  description={
                    allItems.length === 0
                      ? t('notifications.empty_all_description', 'Vous recevrez ici vos notifications d\'activité.')
                      : t('notifications.empty_filtered_description', 'Ajustez les filtres pour afficher plus de résultats.')
                  }
                  size="compact"
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
                          ? 'bg-primary/[0.10]'
                          : !n.read
                          ? 'bg-primary/[0.04] hover:bg-muted/40'
                          : 'hover:bg-muted/40',
                      )}
                    >
                      <div className="flex items-start gap-2.5">
                        <span
                          className={cn(
                            'inline-flex h-6 w-6 items-center justify-center rounded-md ring-1 ring-inset shrink-0 mt-0.5',
                            CATEGORY_COLORS[n.category] || 'bg-muted ring-border',
                          )}
                        >
                          <span
                            className={cn(
                              'w-1.5 h-1.5 rounded-full',
                              CATEGORY_DOT[n.category] || 'bg-gray-500',
                            )}
                          />
                        </span>
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
                            <span className="text-[10px] text-muted-foreground shrink-0 tabular-nums">
                              {timeAgo(n.created_at, t)}
                            </span>
                          </div>
                          {n.body && (
                            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                              {n.body}
                            </p>
                          )}
                          {n.link && (
                            <span className="inline-flex items-center gap-1 mt-1 text-[10px] text-primary/80">
                              <ExternalLink size={9} />
                              {t('notifications.has_link', 'Lien associé')}
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                  )
                })}
            </div>
          </div>

          {/* ── Right: detail pane ─────────────────────────── */}
          <div className="hidden lg:flex flex-col rounded-lg border border-border bg-card overflow-hidden min-h-0">
            {!selected && (
              <div className="flex-1 flex items-center justify-center p-6">
                <EmptyState
                  icon={Bell}
                  title={t('notifications.select_title', 'Sélectionnez une notification')}
                  description={t(
                    'notifications.select_description',
                    'Cliquez sur un élément de la liste pour voir son détail.',
                  )}
                  size="compact"
                />
              </div>
            )}

            {selected && (
              <>
                <div className="px-4 py-3 border-b border-border/60 flex items-start gap-3 bg-muted/10">
                  <span
                    className={cn(
                      'inline-flex items-center justify-center w-8 h-8 rounded-md ring-1 ring-inset shrink-0',
                      CATEGORY_COLORS[selected.category] || 'bg-muted ring-border',
                    )}
                  >
                    {selected.read ? <MailOpen size={14} /> : <Mail size={14} />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <h2 className="text-sm font-semibold font-display tracking-tight text-foreground leading-tight truncate">
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
                      {t(
                        'notifications.no_body',
                        'Aucun contenu détaillé pour cette notification.',
                      )}
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
                  {selected.link && (
                    <button
                      onClick={() => navigate(selected.link!)}
                      className="gl-button-sm gl-button-confirm inline-flex items-center gap-1.5"
                    >
                      <ExternalLink size={12} />
                      {t('notifications.open', 'Ouvrir')}
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </PanelContent>
    </>
  )
}
