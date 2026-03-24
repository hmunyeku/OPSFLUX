/**
 * Active sessions tab — DataTable view.
 *
 * Shows real authentication sessions (UserSession model) with device info,
 * IP address, browser, last activity. User can revoke sessions they don't recognize.
 *
 * API-backed: GET /api/v1/sessions, DELETE /sessions/:id, POST /sessions/revoke-all
 */
import { useMemo, useState } from 'react'
import { Monitor, Smartphone, Tablet, Loader2, ShieldAlert } from 'lucide-react'
import { useSessions, useRevokeSession, useRevokeAllSessions } from '@/hooks/useSettings'
import { useToast } from '@/components/ui/Toast'
import { CollapsibleSection } from '@/components/shared/CollapsibleSection'
import { DataTable } from '@/components/ui/DataTable/DataTable'
import type { ColumnDef } from '@tanstack/react-table'
import type { DataTablePagination } from '@/components/ui/DataTable/types'
import { cn } from '@/lib/utils'

interface SessionItem {
  id: string
  ip_address: string | null
  browser: string | null
  os: string | null
  device_type: string
  is_current: boolean
  created_at: string
  last_active_at: string | null
}

const deviceIcons: Record<string, React.ElementType> = {
  desktop: Monitor,
  mobile: Smartphone,
  tablet: Tablet,
}

export function SessionsTab() {
  const { toast } = useToast()
  const { data: sessions, isLoading } = useSessions()
  const revokeSession = useRevokeSession()
  const revokeAll = useRevokeAllSessions()
  const [search, setSearch] = useState('')

  const items: SessionItem[] = sessions ?? []
  const otherSessions = items.filter((s) => !s.is_current)

  const handleRevoke = async (id: string) => {
    try {
      await revokeSession.mutateAsync(id)
      toast({ title: 'Session révoquée', variant: 'success' })
    } catch {
      toast({ title: 'Erreur', variant: 'error' })
    }
  }

  const handleRevokeAll = async () => {
    try {
      const result = await revokeAll.mutateAsync()
      toast({ title: `${result.revoked_count} session(s) révoquée(s)`, variant: 'success' })
    } catch {
      toast({ title: 'Erreur', variant: 'error' })
    }
  }

  const fmtDate = (d: string | null) => {
    if (!d) return '—'
    try {
      const date = new Date(d)
      return date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }) + ' ' + date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
    } catch { return '—' }
  }

  const columns: ColumnDef<SessionItem>[] = useMemo(() => [
    {
      accessorKey: 'device_type',
      header: 'Appareil',
      size: 70,
      cell: ({ row }) => {
        const Icon = deviceIcons[row.original.device_type] || Monitor
        return (
          <div className="flex items-center gap-2">
            <div className={cn(
              'h-7 w-7 rounded-lg flex items-center justify-center shrink-0',
              row.original.is_current ? 'bg-primary/10' : 'bg-muted/50',
            )}>
              <Icon size={14} className={row.original.is_current ? 'text-primary' : 'text-muted-foreground'} />
            </div>
          </div>
        )
      },
    },
    {
      accessorKey: 'browser',
      header: 'Navigateur / OS',
      size: 200,
      cell: ({ row }) => (
        <div>
          <span className="text-foreground font-medium">{row.original.browser || 'Inconnu'}</span>
          <span className="text-muted-foreground"> sur </span>
          <span className="text-foreground">{row.original.os || 'Inconnu'}</span>
        </div>
      ),
    },
    {
      accessorKey: 'ip_address',
      header: 'Adresse IP',
      size: 140,
      cell: ({ row }) => <span className="font-mono text-muted-foreground">{row.original.ip_address || '—'}</span>,
    },
    {
      id: 'status',
      header: 'Statut',
      size: 110,
      cell: ({ row }) => row.original.is_current
        ? <span className="gl-badge gl-badge-success text-[9px]">Session actuelle</span>
        : <span className="gl-badge gl-badge-neutral text-[9px]">Active</span>,
    },
    {
      accessorKey: 'created_at',
      header: 'Connexion',
      size: 150,
      cell: ({ row }) => <span className="tabular-nums text-muted-foreground">{fmtDate(row.original.created_at)}</span>,
    },
    {
      accessorKey: 'last_active_at',
      header: 'Dernier accès',
      size: 150,
      cell: ({ row }) => <span className="tabular-nums text-muted-foreground">{fmtDate(row.original.last_active_at)}</span>,
    },
    {
      id: 'actions',
      header: '',
      size: 80,
      cell: ({ row }) => {
        if (row.original.is_current) return null
        return (
          <button
            onClick={(e) => { e.stopPropagation(); handleRevoke(row.original.id) }}
            disabled={revokeSession.isPending}
            className="gl-button-sm gl-button-danger"
          >
            Révoquer
          </button>
        )
      },
    },
  ], [revokeSession.isPending])

  const pagination: DataTablePagination = {
    page: 1,
    pageSize: items.length || 25,
    total: items.length,
    pages: 1,
  }

  return (
    <CollapsibleSection
      id="active-sessions"
      title="Sessions actives"
      description="Liste des sessions d'authentification ouvertes sur votre compte. Révoquez celles que vous ne reconnaissez pas."
      storageKey="settings.sessions.collapse"
      showSeparator={false}
    >
      <div className="mt-4 space-y-4">
        <DataTable<SessionItem>
          columns={columns}
          data={items}
          isLoading={isLoading}
          pagination={pagination}
          searchValue={search}
          onSearchChange={setSearch}
          searchPlaceholder="Rechercher par IP, navigateur, OS..."
          emptyIcon={ShieldAlert}
          emptyTitle="Aucune session active"
          columnResizing
          storageKey="settings-sessions"
        />

        {otherSessions.length > 0 && (
          <button
            className="gl-button gl-button-danger"
            onClick={handleRevokeAll}
            disabled={revokeAll.isPending}
          >
            {revokeAll.isPending && <Loader2 size={14} className="animate-spin mr-1" />}
            Révoquer toutes les autres sessions ({otherSessions.length})
          </button>
        )}
      </div>
    </CollapsibleSection>
  )
}
