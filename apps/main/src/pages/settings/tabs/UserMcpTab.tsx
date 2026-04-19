import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle,
  Ban,
  ChevronDown,
  Copy,
  ExternalLink,
  Key,
  Loader2,
  Plug,
  Plus,
  Shield,
  Wrench,
} from 'lucide-react'
import api from '@/lib/api'
import { CollapsibleSection } from '@/components/shared/CollapsibleSection'
import { useToast } from '@/components/ui/Toast'

interface Backend {
  id: string
  slug: string
  name: string
  upstream_url: string
  description: string | null
  active: boolean
  has_config: boolean
}

interface Token {
  id: string
  name: string
  scopes: string
  created_at: string
  expires_at: string | null
  revoked: boolean
  last_used_at: string | null
  token_preview: string
}

interface TokenCreated {
  id: string
  name: string
  token: string
  scopes: string
  expires_at: string | null
}

interface BackendToolsResponse {
  backend: string
  tools: Array<{
    name: string
    description?: string
  }>
}

const fetchBackends = () => api.get<Backend[]>('/api/v1/mcp/backends').then((r) => r.data)
const fetchTokens = () => api.get<Token[]>('/api/v1/mcp/tokens').then((r) => r.data)
const fetchBackendTools = (slug: string) =>
  api.get<BackendToolsResponse>(`/api/v1/mcp/backends/${slug}/tools`).then((r) => r.data)

function expiryLabel(dateStr: string | null) {
  if (!dateStr) return { text: 'Jamais', warn: false, expired: false }
  const d = new Date(dateStr)
  const now = new Date()
  const daysLeft = Math.ceil((d.getTime() - now.getTime()) / 86400000)
  if (daysLeft < 0) return { text: 'Expiré', warn: true, expired: true }
  if (daysLeft < 7) return { text: `${daysLeft}j restants`, warn: true, expired: false }
  return { text: d.toLocaleDateString('fr'), warn: false, expired: false }
}

function endpointUrlForBackend(mcpBaseUrl: string, backend: Backend) {
  return backend.slug === 'opsflux' ? mcpBaseUrl : `${mcpBaseUrl}/${backend.slug}`
}

function BackendCard({ backend, mcpBaseUrl }: { backend: Backend; mcpBaseUrl: string }) {
  const { t } = useTranslation()
  const endpointUrl = endpointUrlForBackend(mcpBaseUrl, backend)
  const { data, isLoading } = useQuery({
    queryKey: ['mcp-user-backend-tools', backend.slug],
    queryFn: () => fetchBackendTools(backend.slug),
  })

  return (
    <div className="border border-border/60 rounded-lg bg-card px-4 py-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Plug size={14} className="text-muted-foreground" />
            <span className="text-sm font-semibold text-foreground">{backend.name}</span>
            {backend.slug === 'opsflux' && <span className="gl-badge gl-badge-info">{t('imputations.tab_default')}</span>}
          </div>
          <p className="text-xs text-muted-foreground mt-1">{backend.description || backend.slug}</p>
        </div>
      </div>

      <div className="border border-border/50 rounded-lg px-3 py-2 bg-muted/20">
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">Endpoint</p>
        <div className="flex items-center gap-2">
          <code className="text-xs break-all flex-1">{endpointUrl}</code>
          <button className="gl-button gl-button-default" onClick={() => navigator.clipboard.writeText(endpointUrl)}>
            <Copy size={14} />
          </button>
          <a className="gl-button gl-button-default" href={endpointUrl} target="_blank" rel="noreferrer">
            <ExternalLink size={14} />
          </a>
        </div>
      </div>

      <details className="border border-border/50 rounded-lg px-3 py-2">
        <summary className="list-none cursor-pointer flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Wrench size={14} className="text-muted-foreground" />
            <span className="text-sm font-medium text-foreground">Outils disponibles</span>
            <span className="gl-badge gl-badge-neutral">
              {isLoading ? '…' : (data?.tools.length ?? 0)}
            </span>
          </div>
          <ChevronDown size={14} className="text-muted-foreground" />
        </summary>
        <div className="mt-3 space-y-2">
          {isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 size={14} className="animate-spin" /> Chargement…
            </div>
          ) : !data?.tools.length ? (
            <p className="text-xs text-muted-foreground">{t('settings.aucun_outil_expose_pour_ce_backend_avec')}</p>
          ) : (
            data.tools.map((tool) => (
              <div key={tool.name} className="border border-border/40 rounded-md px-3 py-2">
                <p className="text-xs font-semibold text-foreground">{tool.name}</p>
                {tool.description && <p className="text-xs text-muted-foreground mt-1">{tool.description}</p>}
              </div>
            ))
          )}
        </div>
      </details>
    </div>
  )
}

export function UserMcpTab() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const { toast } = useToast()
  const { data: backends = [], isLoading: backendsLoading } = useQuery({ queryKey: ['mcp-user-backends'], queryFn: fetchBackends })
  const { data: tokens = [] } = useQuery({ queryKey: ['mcp-user-tokens'], queryFn: fetchTokens })
  const [name, setName] = useState('')
  const [expiresInDays, setExpiresInDays] = useState('90')
  const [createdToken, setCreatedToken] = useState<TokenCreated | null>(null)

  const mcpBaseUrl = useMemo(() => {
    const origin = window.location.origin.replace('app.', 'api.')
    return `${origin}/mcp`
  }, [])

  const createToken = useMutation({
    mutationFn: (payload: { name: string; expires_in_days: number | null }) =>
      api.post<TokenCreated>('/api/v1/mcp/tokens', { ...payload, scopes: 'permissions' }).then((r) => r.data),
    onSuccess: (data) => {
      setCreatedToken(data)
      qc.invalidateQueries({ queryKey: ['mcp-user-tokens'] })
      toast({ title: t('settings.toast.mcp.token_created'), variant: 'success' })
    },
  })

  const revokeToken = useMutation({
    mutationFn: (id: string) => api.post(`/api/v1/mcp/tokens/${id}/revoke`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mcp-user-tokens'] })
      toast({ title: t('settings.toast.mcp.token_revoked'), variant: 'success' })
    },
  })

  const deleteToken = useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/mcp/tokens/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mcp-user-tokens'] })
      toast({ title: t('settings.toast.mcp.token_deleted'), variant: 'success' })
    },
  })

  const handleCreate = async () => {
    if (!name.trim()) {
      toast({ title: t('settings.toast.mcp.name_required'), variant: 'error' })
      return
    }
    await createToken.mutateAsync({
      name: name.trim(),
      expires_in_days: expiresInDays ? Number(expiresInDays) : null,
    })
    setName('')
  }

  return (
    <div className="space-y-6">
      <CollapsibleSection
        id="mcp-personal-backends"
        title="Endpoints MCP disponibles"
        description={t('settings.vos_tokens_mcp_personnels_n_embarquent_p')}
        storageKey="settings.user-mcp.endpoints.collapse"
      >
        {backendsLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
            <Loader2 size={14} className="animate-spin" /> Chargement…
          </div>
        ) : backends.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('settings.aucun_endpoint_mcp_disponible_pour_votre')}</p>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {backends.map((backend) => (
              <BackendCard key={backend.id} backend={backend} mcpBaseUrl={mcpBaseUrl} />
            ))}
          </div>
        )}
      </CollapsibleSection>

      <CollapsibleSection
        id="mcp-personal-tokens"
        title={t('settings.mes_tokens_mcp')}
        description={t('settings.creez_vos_tokens_personnels_pour_claude')}
        storageKey="settings.user-mcp.tokens.collapse"
        showSeparator={false}
      >
        <div className="border border-border/60 rounded-lg bg-card px-4 py-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-[1.5fr_180px_auto] gap-3">
            <input
              className="gl-form-input"
              placeholder={t('settings.nom_du_token')}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <input
              className="gl-form-input"
              type="number"
              min={1}
              max={3650}
              value={expiresInDays}
              onChange={(e) => setExpiresInDays(e.target.value)}
              placeholder="Jours"
            />
            <button className="gl-button gl-button-confirm" onClick={handleCreate} disabled={createToken.isPending}>
              {createToken.isPending ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
              Créer
            </button>
          </div>

          {createdToken && (
            <div className="border border-emerald-300 rounded-lg bg-emerald-50/60 px-4 py-3">
              <div className="flex items-center gap-2 mb-2">
                <Shield size={14} className="text-emerald-700" />
                <span className="text-sm font-semibold text-emerald-900">{t('settings.token_affiche_une_seule_fois')}</span>
              </div>
              <code className="block text-xs break-all text-emerald-950">{createdToken.token}</code>
            </div>
          )}

          <div className="space-y-2">
            {tokens.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('settings.aucun_token_mcp_personnel')}</p>
            ) : tokens.map((token) => {
              const expiry = expiryLabel(token.expires_at)
              return (
                <div key={token.id} className="border border-border/50 rounded-lg px-4 py-3 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Key size={14} className="text-muted-foreground" />
                      <span className="text-sm font-semibold text-foreground">{token.name}</span>
                      <span className={`gl-badge ${token.revoked || expiry.expired ? 'gl-badge-neutral' : expiry.warn ? 'gl-badge-warning' : 'gl-badge-success'}`}>
                        {token.revoked ? 'Révoqué' : expiry.text}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Aperçu: {token.token_preview} · Contrôle d’accès: permissions utilisateur
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {!token.revoked && (
                      <button
                        className="gl-button gl-button-default"
                        onClick={() => revokeToken.mutate(token.id)}
                        title={t('settings.revoquer_le_token')}
                      >
                        <Ban size={14} />
                      </button>
                    )}
                    <button
                      className="gl-button gl-button-danger"
                      onClick={() => deleteToken.mutate(token.id)}
                      title={t('settings.supprimer_le_token')}
                    >
                      <AlertTriangle size={14} />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </CollapsibleSection>
    </div>
  )
}
