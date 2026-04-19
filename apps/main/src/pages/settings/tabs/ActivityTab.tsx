/**
 * Activity log tab — compact feed with search, pagination, and filter tabs.
 *
 * API-backed: GET /api/v1/audit-log (paginated, filtered)
 */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { usePageSize } from '@/hooks/usePageSize'
import { useAuditLog } from '@/hooks/useSettings'
import {
  LogIn, Settings, Users, Edit3, Trash2,
  Download, GitBranch, MessageSquare, Plus,
  Loader2, RefreshCw, Search, X,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { panelInputClass } from '@/components/layout/DynamicPanel'

// ── Action type → filter key + icon mapping ──────────────────
const actionIconMap: Record<string, LucideIcon> = {
  login: LogIn,
  logout: LogIn,
  create: Plus,
  update: Edit3,
  delete: Trash2,
  archive: Trash2,
  export: Download,
  comment: MessageSquare,
  settings: Settings,
  assign: Users,
  transition: GitBranch,
}

const ACTION_COLOR: Record<string, string> = {
  login: 'text-blue-500',
  logout: 'text-muted-foreground',
  create: 'text-green-600',
  update: 'text-amber-600',
  delete: 'text-destructive',
  archive: 'text-orange-500',
  export: 'text-purple-500',
}

function getActionIcon(action: string): LucideIcon {
  const key = action.toLowerCase().split('.')[0]
  return actionIconMap[key] || Settings
}

function getActionColor(action: string): string {
  const key = action.toLowerCase().split('.')[0]
  return ACTION_COLOR[key] || 'text-muted-foreground'
}

// ── Filter tabs ──────────────────────────────────────────────
const filterTabs = [
  { key: '', label: 'Tout' },
  { key: 'login', label: 'Connexions' },
  { key: 'update', label: 'Modifications' },
  { key: 'create', label: 'Créations' },
  { key: 'delete', label: 'Suppressions' },
  { key: 'comment', label: 'Commentaires' },
  { key: 'export', label: 'Exports' },
] as const

function formatRelativeDate(isoString: string): string {
  const date = new Date(isoString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffSecs = Math.floor(diffMs / 1000)
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffSecs < 60) return `${diffSecs}s`
  if (diffMins < 60) return `${diffMins}min`
  if (diffHours < 24) return `${diffHours}h`
  if (diffDays < 7) return `${diffDays}j`
  return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
}

export function ActivityTab() {
  const { t } = useTranslation()
  const { pageSize } = usePageSize()
  const [activeFilter, setActiveFilter] = useState('')
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')

  const { data, isLoading, isFetching } = useAuditLog({
    page,
    page_size: pageSize,
    action: activeFilter || undefined,
  })

  const allEvents = data?.items || []
  // Client-side search filter
  const events = search.trim()
    ? allEvents.filter((e) => {
      const q = search.toLowerCase()
      return (
        e.action.toLowerCase().includes(q) ||
        (e.resource_type?.toLowerCase().includes(q)) ||
        (e.resource_id?.toLowerCase().includes(q)) ||
        (e.ip_address?.toLowerCase().includes(q))
      )
    })
    : allEvents
  const totalPages = data?.pages ?? 1
  const hasMore = data ? data.page < totalPages : false

  const handleFilterChange = (key: string) => {
    setActiveFilter(key)
    setPage(1)
  }

  return (
    <>
      {/* ── Filter tabs + search ── */}
      <div className="flex items-center gap-2 border-b border-border -mx-6 px-6">
        <div className="flex items-center flex-1 min-w-0 overflow-x-auto">
          {filterTabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => handleFilterChange(tab.key)}
              className={cn(
                'px-2.5 py-2.5 text-xs transition-colors whitespace-nowrap',
                activeFilter === tab.key
                  ? 'font-semibold text-foreground'
                  : 'font-normal text-muted-foreground hover:text-foreground',
              )}
              style={activeFilter === tab.key
                ? { boxShadow: 'inset 0 -2px 0 0 hsl(var(--primary))' }
                : undefined
              }
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="relative shrink-0 w-52">
          <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher…"
            className={panelInputClass + ' h-7 text-xs pl-7 w-full'}
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X size={11} />
            </button>
          )}
        </div>
        {isFetching && <Loader2 size={13} className="animate-spin text-muted-foreground shrink-0" />}
      </div>

      {/* ── Activity feed — compact ── */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 size={18} className="animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          <div className="divide-y divide-border/50">
            {events.map((event) => {
              const ActionIcon = getActionIcon(event.action)
              const color = getActionColor(event.action)
              return (
                <div key={event.id} className="flex items-center gap-3 py-2 px-1 hover:bg-accent/30 transition-colors">
                  {/* Icon */}
                  <div className={cn('shrink-0 flex items-center justify-center h-7 w-7 rounded-full bg-muted', color)}>
                    <ActionIcon size={13} />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 text-xs">
                      <span className="font-medium text-foreground">{event.action}</span>
                      {event.resource_type && (
                        <span className="text-muted-foreground">· {event.resource_type}</span>
                      )}
                      {event.resource_id && (
                        <span className="font-mono text-[10px] text-primary truncate max-w-[100px]">{event.resource_id}</span>
                      )}
                    </div>
                    {event.details && Object.keys(event.details).length > 0 && (
                      <p className="text-[10px] text-muted-foreground truncate mt-0.5">
                        {Object.entries(event.details).slice(0, 3).map(([k, v]) => `${k}: ${String(v)}`).join(' · ')}
                      </p>
                    )}
                  </div>

                  {/* IP */}
                  {event.ip_address && (
                    <span className="text-[10px] font-mono text-muted-foreground/70 shrink-0 hidden sm:block">{event.ip_address}</span>
                  )}

                  {/* Time */}
                  <span className="text-[10px] text-muted-foreground shrink-0 tabular-nums w-12 text-right">
                    {formatRelativeDate(event.created_at)}
                  </span>
                </div>
              )
            })}
          </div>

          {/* Empty state */}
          {events.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted mb-3">
                <MessageSquare size={24} className="text-muted-foreground" />
              </div>
              <p className="text-sm font-semibold text-foreground">{t('planner.no_activity')}</p>
              <p className="text-xs text-muted-foreground mt-1">{search ? `Aucun résultat pour « ${search} »` : 'Aucun événement ne correspond à ce filtre.'}</p>
            </div>
          )}

          {/* Pagination — compact */}
          {allEvents.length > 0 && (
            <div className="flex items-center justify-between py-3 px-1 border-t border-border/50">
              <span className="text-xs text-muted-foreground tabular-nums">
                Page {data?.page || 1} / {totalPages}{search && events.length < allEvents.length && ` · ${events.length} résultat${events.length > 1 ? 's' : ''}`}
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  className="gl-button-sm gl-button-default text-xs"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  ← Précédent
                </button>
                <button
                  className="gl-button-sm gl-button-default text-xs"
                  disabled={!hasMore}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Suivant →
                </button>
                <button
                  className="gl-button-sm gl-button-default ml-1"
                  onClick={() => setPage(1)}
                  title={t('settings.rafraichir')}
                >
                  <RefreshCw size={12} />
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </>
  )
}
