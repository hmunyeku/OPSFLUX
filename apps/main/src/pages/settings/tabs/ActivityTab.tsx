/**
 * Activity log tab — GitLab Pajamas activity feed pattern.
 *
 * API-backed: GET /api/v1/audit-log (paginated, filtered)
 * Matches gitlab.com/dashboard/activity layout.
 */
import { useState } from 'react'
import { useAuthStore } from '@/stores/authStore'
import { usePageSize } from '@/hooks/usePageSize'
import { useAuditLog } from '@/hooks/useSettings'
import {
  LogIn, Settings, Users, Edit3, Trash2,
  Download, GitBranch, MessageSquare, Plus,
  Loader2, RefreshCw,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

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

function getActionIcon(action: string): LucideIcon {
  const key = action.toLowerCase().split('.')[0]
  return actionIconMap[key] || Settings
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

  if (diffSecs < 60) return `Il y a ${diffSecs} secondes`
  if (diffMins < 60) return `Il y a ${diffMins} minute${diffMins > 1 ? 's' : ''}`
  if (diffHours < 24) return `Il y a ${diffHours} heure${diffHours > 1 ? 's' : ''}`
  if (diffDays < 7) return `Il y a ${diffDays} jour${diffDays > 1 ? 's' : ''}`
  return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function ActivityTab() {
  const { user } = useAuthStore()
  const { pageSize } = usePageSize()
  const [activeFilter, setActiveFilter] = useState('')
  const [page, setPage] = useState(1)

  const { data, isLoading, isFetching } = useAuditLog({
    page,
    page_size: pageSize,
    action: activeFilter || undefined,
  })

  const events = data?.items || []
  const hasMore = data ? data.page < data.pages : false
  const initials = user ? `${user.first_name[0]}${user.last_name[0]}` : '?'

  const handleFilterChange = (key: string) => {
    setActiveFilter(key)
    setPage(1) // Reset to first page on filter change
  }

  return (
    <>
      {/* ── Filter tabs ── */}
      <div className="flex items-center border-b border-border -mx-6 px-6">
        {filterTabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => handleFilterChange(tab.key)}
            className={cn(
              'px-3 py-3 text-sm transition-colors whitespace-nowrap',
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
        {isFetching && <Loader2 size={14} className="animate-spin text-muted-foreground ml-auto" />}
      </div>

      {/* ── Activity feed ── */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={20} className="animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          <ul className="mt-0 list-none p-0">
            {events.map((event) => {
              const ActionIcon = getActionIcon(event.action)
              return (
                <li key={event.id} className="relative pl-10 pt-4 pb-2 list-none">
                  {/* Timestamp — float right */}
                  <div className="float-right text-xs text-muted-foreground ml-4 mt-0.5">
                    {formatRelativeDate(event.created_at)}
                  </div>

                  {/* Avatar */}
                  <div className="absolute left-0 top-4">
                    {user?.avatar_url ? (
                      <img src={user.avatar_url} alt="" className="h-8 w-8 rounded-full object-cover" />
                    ) : (
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                        {initials}
                      </div>
                    )}
                  </div>

                  {/* Author line */}
                  <div className="mb-1">
                    <span className="text-sm font-semibold text-foreground">{user?.first_name} {user?.last_name}</span>
                    <span className="text-sm text-muted-foreground ml-1">@{user?.email?.split('@')[0]}</span>
                  </div>

                  {/* Action line */}
                  <div className="flex items-start gap-1.5 text-sm text-muted-foreground">
                    <ActionIcon size={14} className="shrink-0 mt-0.5" />
                    <span>
                      {event.action}
                      {event.resource_type && (
                        <>
                          {' — '}
                          <span className="font-medium text-foreground">{event.resource_type}</span>
                        </>
                      )}
                      {event.resource_id && (
                        <>
                          {' '}
                          <span className="text-primary font-mono text-xs">{event.resource_id}</span>
                        </>
                      )}
                    </span>
                  </div>

                  {/* Detail line */}
                  {event.details && Object.keys(event.details).length > 0 && (
                    <p className="mt-1 text-sm text-muted-foreground pl-5">
                      {JSON.stringify(event.details)}
                    </p>
                  )}

                  {/* IP address */}
                  {event.ip_address && (
                    <p className="mt-0.5 text-xs text-muted-foreground pl-5 font-mono">
                      IP: {event.ip_address}
                    </p>
                  )}
                </li>
              )
            })}
          </ul>

          {/* Empty state */}
          {events.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-muted mb-4">
                <MessageSquare size={32} className="text-muted-foreground" />
              </div>
              <p className="text-lg font-semibold text-foreground">Aucune activité trouvée</p>
              <p className="text-sm text-muted-foreground mt-1">Aucun événement ne correspond à ce filtre.</p>
            </div>
          )}

          {/* Pagination */}
          {events.length > 0 && (
            <div className="flex items-center justify-center gap-3 py-6">
              <button
                className="gl-button gl-button-default"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Page précédente
              </button>
              <span className="text-sm text-muted-foreground">
                Page {data?.page || 1} sur {data?.pages || 1}
              </span>
              <button
                className="gl-button gl-button-default"
                disabled={!hasMore}
                onClick={() => setPage((p) => p + 1)}
              >
                Page suivante
              </button>
              <button
                className="gl-button-sm gl-button-default ml-2"
                onClick={() => setPage(1)}
                title="Rafraîchir"
              >
                <RefreshCw size={14} />
              </button>
            </div>
          )}
        </>
      )}
    </>
  )
}
