/**
 * Personal Access Tokens tab — GitLab Pajamas pattern.
 * Matches gitlab.com/-/user_settings/personal_access_tokens
 *
 * API-backed: GET /api/v1/tokens, DELETE /tokens/:id
 * Create via DynamicPanel (CreateTokenPanel).
 */
import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Key, Plus } from 'lucide-react'
import { DataTable } from '@/components/ui/DataTable/DataTable'
import type { ColumnDef } from '@tanstack/react-table'
import { useUIStore } from '@/stores/uiStore'
import { useAccessTokens, useRevokeToken } from '@/hooks/useSettings'
import { useToast } from '@/components/ui/Toast'
import { CollapsibleSection } from '@/components/shared/CollapsibleSection'

export function AccessTokensTab() {
  const { t } = useTranslation()
  const { toast } = useToast()
  const openDynamicPanel = useUIStore((s) => s.openDynamicPanel)
  const { data, isLoading } = useAccessTokens()
  const revokeToken = useRevokeToken()
  const [search, setSearch] = useState('')

  const allTokens = data?.items || []
  const tokens = useMemo(() => {
    if (!search) return allTokens
    const q = search.toLowerCase()
    return allTokens.filter((t) => t.name.toLowerCase().includes(q))
  }, [allTokens, search])
  const activeCount = allTokens.filter((t) => !t.revoked && (!t.expires_at || new Date(t.expires_at) > new Date())).length
  const expiredCount = allTokens.filter((t) => !t.revoked && t.expires_at && new Date(t.expires_at) <= new Date()).length
  const revokedCount = allTokens.filter((t) => t.revoked).length
  // Expiring soon: within 30 days
  const expiringSoonCount = allTokens.filter((t) => {
    if (t.revoked || !t.expires_at) return false
    const expiresAt = new Date(t.expires_at)
    const now = new Date()
    const thirtyDays = 30 * 24 * 60 * 60 * 1000
    return expiresAt > now && (expiresAt.getTime() - now.getTime()) < thirtyDays
  }).length

  const handleRevoke = async (id: string) => {
    try {
      await revokeToken.mutateAsync(id)
      toast({ title: t('settings.toast.tokens.revoked'), description: t('settings.toast.tokens.revoked_desc'), variant: 'success' })
    } catch {
      toast({ title: t('settings.toast.error'), description: t('settings.toast.tokens.revoke_error'), variant: 'error' })
    }
  }

  const isActive = (token: typeof tokens[0]) =>
    !token.revoked && (!token.expires_at || new Date(token.expires_at) > new Date())

  const getStatusLabel = (token: typeof tokens[0]) => {
    if (token.revoked) return 'Révoqué'
    if (token.expires_at && new Date(token.expires_at) <= new Date()) return 'Expiré'
    return 'Actif'
  }

  const getStatusClass = (token: typeof tokens[0]) => {
    if (token.revoked) return 'gl-badge-neutral'
    if (token.expires_at && new Date(token.expires_at) <= new Date()) return 'gl-badge-neutral'
    return 'gl-badge-success'
  }

  type Token = typeof tokens[0]

  const columns = useMemo<ColumnDef<Token, unknown>[]>(() => [
    {
      accessorKey: 'name',
      header: t('settings.columns.tokens.name'),
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <Key size={14} className="text-muted-foreground" />
          <span className="font-medium text-foreground">{row.original.name}</span>
          <span className="text-xs text-muted-foreground font-mono">{row.original.token_prefix}...</span>
        </div>
      ),
    },
    {
      id: 'status',
      header: t('settings.columns.tokens.status'),
      cell: ({ row }) => (
        <span className={`gl-badge ${getStatusClass(row.original)}`}>
          {getStatusLabel(row.original)}
        </span>
      ),
      size: 80,
    },
    {
      id: 'scopes',
      header: t('settings.columns.tokens.scopes'),
      cell: ({ row }) => (
        <div className="flex flex-wrap gap-1">
          {row.original.scopes.map((scope: string) => (
            <span key={scope} className="gl-badge gl-badge-neutral">{scope}</span>
          ))}
        </div>
      ),
    },
    {
      accessorKey: 'last_used_at',
      header: t('settings.columns.tokens.last_used'),
      cell: ({ row }) => (
        <span className="text-muted-foreground">
          {row.original.last_used_at ? new Date(row.original.last_used_at).toLocaleDateString('fr-FR') : '—'}
        </span>
      ),
    },
    {
      accessorKey: 'expires_at',
      header: t('settings.columns.tokens.expiration'),
      cell: ({ row }) => (
        <span className="text-muted-foreground">
          {row.original.expires_at ? new Date(row.original.expires_at).toLocaleDateString('fr-FR') : 'Jamais'}
        </span>
      ),
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => isActive(row.original) ? (
        <button
          className="gl-button-sm gl-button-danger"
          onClick={(e) => { e.stopPropagation(); handleRevoke(row.original.id) }}
          disabled={revokeToken.isPending}
        >
          Révoquer
        </button>
      ) : null,
      size: 80,
    },
  ], [revokeToken.isPending])

  return (
    <CollapsibleSection
      id="access-tokens"
      title="Jetons d'accès personnel"
      description="Créez des jetons d'accès pour les applications qui ont besoin d'accéder à l'API OpsFlux."
      storageKey="settings.tokens.collapse"
      showSeparator={false}
    >
      <div className="flex justify-end mb-4">
        <button
          className="gl-button gl-button-confirm"
          onClick={() => openDynamicPanel({ type: 'create', module: 'settings-token' })}
        >
          <Plus size={14} />
          Créer un jeton
        </button>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatsCard label="Jetons actifs" count={activeCount} />
        <StatsCard label={t('paxlog.dashboard.kpis.expiring_soon')} count={expiringSoonCount} />
        <StatsCard label={t('settings.revoques')} count={revokedCount} />
        <StatsCard label={t('settings.expires')} count={expiredCount} />
      </div>

      <div className="mt-6">
        <DataTable
          columns={columns}
          data={tokens}
          isLoading={isLoading}
          searchValue={search}
          onSearchChange={setSearch}
          searchPlaceholder="Rechercher par nom…"
          emptyIcon={Key}
          emptyTitle="Aucun jeton d'accès"
          storageKey="access-tokens"
        />
      </div>
    </CollapsibleSection>
  )
}

function StatsCard({ label, count }: { label: string; count: number }) {
  return (
    <div className="border border-border/60 rounded-lg bg-card px-4 py-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-2xl font-semibold text-foreground mt-1">{count}</p>
    </div>
  )
}
