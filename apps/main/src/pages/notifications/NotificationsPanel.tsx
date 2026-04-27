/**
 * NotificationsPanel — full notification journal in the standard
 * OpsFlux DynamicPanel surface.
 *
 * Replaces the previous full-screen NotificationsPage with the same
 * docked panel pattern used by every other entity detail in the app
 * (Activities, Conflicts, Scenarios, MOC, …). Mobile gets the panel
 * full-screen automatically via DynamicPanelShell's responsive logic;
 * desktop gets the panel docked on the right with the usual
 * resize / pop-out / reattach affordances.
 *
 * UX:
 *   • Status filter chips (All / Unread / Read) at the top, with
 *     counters → keep the user oriented.
 *   • Category chips below — collapse into an overflow menu on narrow
 *     widths so they never wrap awkwardly on mobile.
 *   • Single scrollable list (no separate detail pane). Clicking a
 *     notification expands it inline with body + actions, marks read,
 *     and gives a primary "Open" action when a `link` is present.
 *     Inline expansion keeps everything reachable on a phone with
 *     zero horizontal scroll.
 *   • Toolbar actions (Refresh / Mark all read) live in the panel
 *     header via ActionItems — same convention as every other detail
 *     panel in the app.
 */
import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  Bell,
  CheckCheck,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Inbox,
  Mail,
  MailOpen,
  RefreshCw,
  Trash2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import api from '@/lib/api'
import {
  DynamicPanelShell,
  PanelContentLayout,
  type ActionItem,
} from '@/components/layout/DynamicPanel'
import { EmptyState } from '@/components/ui/EmptyState'
import { useUIStore } from '@/stores/uiStore'
import { useUserPref } from '@/hooks/useFilterPersistence'

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

function timeAgo(dateStr: string, t: (k: string, fallback?: string) => string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return t('notifications.just_now', 'à l\'instant')
  if (mins < 60) return `${mins}min`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}j`
  return new Date(dateStr).toLocaleDateString()
}

// ── Panel ──────────────────────────────────────────────────────

export function NotificationsPanel() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const closeDynamicPanel = useUIStore((s) => s.closeDynamicPanel)

  // Persisted user prefs — both filters follow the user across devices.
  const [statusFilter, setStatusFilter] = useUserPref<StatusFilter>('notifications.status', 'unread')
  const [categoryFilter, setCategoryFilter] = useUserPref<Category>('notifications.category', 'all')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [showCategoryMenu, setShowCategoryMenu] = useState(false)

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
  const totalUnread = useMemo(() => allItems.filter((n) => !n.read).length, [allItems])
  const totalRead = allItems.length - totalUnread

  const filteredItems = useMemo(() => {
    return allItems.filter((n) => {
      if (statusFilter === 'read' && !n.read) return false
      if (statusFilter === 'unread' && n.read) return false
      if (categoryFilter !== 'all' && n.category !== categoryFilter) return false
      return true
    })
  }, [allItems, statusFilter, categoryFilter])

  const markRead = useMutation({
    mutationFn: (id: string) => api.patch(`/api/v1/notifications/${id}/read`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  })
  const markAllRead = useMutation({
    mutationFn: () => api.post('/api/v1/notifications/mark-all-read'),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  })
  const archive = useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/notifications/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
      setExpandedId(null)
    },
  })

  const toggleExpand = (n: Notification) => {
    if (expandedId === n.id) {
      setExpandedId(null)
    } else {
      if (!n.read) markRead.mutate(n.id)
      setExpandedId(n.id)
    }
  }

  const subtitleText =
    totalUnread > 0
      ? t('notifications.unread_count', `${totalUnread} non lue${totalUnread > 1 ? 's' : ''}`, { count: totalUnread, defaultValue: `${totalUnread} non lue(s)` })
      : t('notifications.all_read', 'Tout est lu')

  const actions: ActionItem[] = [
    {
      id: 'refresh',
      label: t('common.refresh', 'Rafraîchir'),
      icon: RefreshCw,
      onClick: () => { void refetch() },
      disabled: isFetching,
      loading: isFetching,
    },
    ...(totalUnread > 0
      ? [{
          id: 'mark-all-read',
          label: t('notifications.mark_all_read', 'Tout lire'),
          icon: CheckCheck,
          onClick: () => markAllRead.mutate(),
          disabled: markAllRead.isPending,
          variant: 'primary' as const,
        }]
      : []),
  ]

  // Status pills — compact horizontal segmented control.
  const statusItems: { id: StatusFilter; label: string; icon: typeof Inbox; badge?: number }[] = [
    { id: 'all', label: t('notifications.filter_all', 'Toutes'), icon: Inbox, badge: allItems.length || undefined },
    { id: 'unread', label: t('notifications.filter_unread', 'Non lues'), icon: Mail, badge: totalUnread || undefined },
    { id: 'read', label: t('notifications.filter_read', 'Lues'), icon: MailOpen, badge: totalRead || undefined },
  ]

  return (
    <DynamicPanelShell
      title={t('notifications.page_title', 'Notifications')}
      subtitle={subtitleText}
      icon={<Bell size={14} className="text-primary" />}
      actionItems={actions}
    >
      <PanelContentLayout>
        {/* ── Filters ──────────────────────────────────────────── */}
        <div className="px-3 pt-3 pb-2 space-y-2">
          {/* Status segmented control */}
          <div className="inline-flex rounded-md border border-border bg-muted/20 p-0.5 w-full sm:w-auto">
            {statusItems.map((it) => {
              const Icon = it.icon
              const active = statusFilter === it.id
              return (
                <button
                  key={it.id}
                  type="button"
                  onClick={() => {
                    setStatusFilter(it.id)
                    setExpandedId(null)
                  }}
                  className={cn(
                    'flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-2.5 py-1 rounded text-xs transition-colors',
                    active
                      ? 'bg-background shadow-sm text-foreground font-medium'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  <Icon size={12} />
                  <span>{it.label}</span>
                  {it.badge != null && (
                    <span className={cn(
                      'ml-0.5 inline-flex items-center justify-center min-w-[16px] h-[14px] px-1 rounded-full text-[9px] font-medium tabular-nums',
                      active ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground',
                    )}>
                      {it.badge}
                    </span>
                  )}
                </button>
              )
            })}
          </div>

          {/* Category chips — collapsible into "Catégorie" menu when narrow.
              On wider widths the chips wrap to a second line; on phone the
              menu prevents the awkward overflow we had on the old page. */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              type="button"
              onClick={() => setShowCategoryMenu((v) => !v)}
              className={cn(
                'inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] border transition-colors',
                categoryFilter === 'all'
                  ? 'border-border text-muted-foreground hover:bg-muted/40'
                  : 'border-primary/40 bg-primary/10 text-primary',
              )}
              title={t('notifications.category_filter', 'Filtrer par catégorie')}
            >
              {categoryFilter === 'all'
                ? t('notifications.category_all', 'Toutes catégories')
                : t(`notifications.category_${categoryFilter}`, categoryFilter)}
              {showCategoryMenu ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
            </button>
            {categoryFilter !== 'all' && (
              <button
                type="button"
                onClick={() => setCategoryFilter('all')}
                className="text-[10px] text-muted-foreground hover:text-destructive"
                title={t('common.clear', 'Effacer')}
              >
                ×
              </button>
            )}
            {showCategoryMenu && (
              <div className="w-full mt-1 flex flex-wrap gap-1 rounded border border-border bg-muted/10 p-1.5">
                {CATEGORIES.map((c) => {
                  const active = categoryFilter === c
                  return (
                    <button
                      key={c}
                      type="button"
                      onClick={() => {
                        setCategoryFilter(c)
                        setShowCategoryMenu(false)
                      }}
                      className={cn(
                        'inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] ring-1 ring-inset transition-colors',
                        active
                          ? CATEGORY_COLORS[c] + ' font-medium'
                          : 'text-muted-foreground ring-transparent hover:bg-chrome-hover',
                      )}
                    >
                      <span className={cn('w-1.5 h-1.5 rounded-full', CATEGORY_DOT[c])} />
                      {t(`notifications.category_${c}`, c)}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* ── List ─────────────────────────────────────────────── */}
        <div className="flex-1 min-h-0 overflow-y-auto border-t border-border/40">
          {isLoading && (
            <div className="flex items-center justify-center py-12">
              <RefreshCw size={16} className="animate-spin text-muted-foreground" />
            </div>
          )}

          {!isLoading && filteredItems.length === 0 && (
            <div className="py-8 px-3">
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
            </div>
          )}

          {!isLoading && filteredItems.length > 0 && (
            <ul className="divide-y divide-border/40">
              {filteredItems.map((n) => {
                const isExpanded = expandedId === n.id
                return (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={() => toggleExpand(n)}
                      className={cn(
                        'w-full text-left px-3 py-2.5 transition-colors',
                        isExpanded
                          ? 'bg-primary/[0.06]'
                          : !n.read
                            ? 'bg-primary/[0.03] hover:bg-muted/40'
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
                          <span className={cn('w-1.5 h-1.5 rounded-full', CATEGORY_DOT[n.category] || 'bg-gray-500')} />
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <p className={cn(
                              'text-sm break-words',
                              n.read ? 'text-muted-foreground' : 'text-foreground font-medium',
                              !isExpanded && 'truncate',
                            )}>
                              {n.title}
                            </p>
                            <span className="text-[10px] text-muted-foreground shrink-0 tabular-nums">
                              {timeAgo(n.created_at, t as (k: string, f?: string) => string)}
                            </span>
                          </div>
                          {/* Body preview — collapsed: 2 lines truncated. expanded: full. */}
                          {n.body && !isExpanded && (
                            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                              {n.body}
                            </p>
                          )}
                          {!isExpanded && n.link && (
                            <span className="inline-flex items-center gap-1 mt-1 text-[10px] text-primary/80">
                              <ExternalLink size={9} />
                              {t('notifications.has_link', 'Lien associé')}
                            </span>
                          )}
                        </div>
                      </div>
                    </button>

                    {/* Expanded inline detail */}
                    {isExpanded && (
                      <div className="px-3 pb-3 pt-0.5 bg-primary/[0.03] border-t border-border/30">
                        <div className="ml-8 space-y-2">
                          {n.body && (
                            <p className="text-xs text-foreground/90 whitespace-pre-line break-words">
                              {n.body}
                            </p>
                          )}
                          {!n.body && (
                            <p className="text-xs italic text-muted-foreground">
                              {t('notifications.no_body', 'Aucun contenu détaillé pour cette notification.')}
                            </p>
                          )}
                          <div className="flex items-center gap-1.5 flex-wrap pt-1">
                            {n.link && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  navigate(n.link!)
                                  closeDynamicPanel()
                                }}
                                className="gl-button-sm gl-button-confirm inline-flex items-center gap-1.5 text-[11px]"
                              >
                                <ExternalLink size={11} />
                                {t('notifications.open', 'Ouvrir')}
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                archive.mutate(n.id)
                              }}
                              disabled={archive.isPending}
                              className="gl-button-sm gl-button-default inline-flex items-center gap-1.5 text-[11px]"
                            >
                              <Trash2 size={11} />
                              {t('notifications.archive', 'Archiver')}
                            </button>
                            <span className="text-[10px] text-muted-foreground ml-auto">
                              {new Date(n.created_at).toLocaleString()}
                            </span>
                          </div>
                        </div>
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </PanelContentLayout>
    </DynamicPanelShell>
  )
}
