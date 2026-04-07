import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Ban, Check, Copy, ExternalLink, Globe, Key, Loader2, Plug, Plus, Shield } from 'lucide-react'
import api from '@/lib/api'
import { CollapsibleSection } from '@/components/shared/CollapsibleSection'
import { useToast } from '@/components/ui/Toast'
import { useUserPreferences } from '@/hooks/useUserPreferences'

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

const fetchBackends = () => api.get<Backend[]>('/api/v1/mcp/backends').then((r) => r.data)
const fetchTokens = () => api.get<Token[]>('/api/v1/mcp/tokens').then((r) => r.data)

function expiryLabel(dateStr: string | null) {
  if (!dateStr) return { text: 'Jamais', warn: false, expired: false }
  const d = new Date(dateStr)
  const now = new Date()
  const daysLeft = Math.ceil((d.getTime() - now.getTime()) / 86400000)
  if (daysLeft < 0) return { text: 'Expiré', warn: true, expired: true }
  if (daysLeft < 7) return { text: `${daysLeft}j restants`, warn: true, expired: false }
  return { text: d.toLocaleDateString('fr'), warn: false, expired: false }
}

export function UserMcpTab() {
  const qc = useQueryClient()
  const { toast } = useToast()
  const { getPref, setPref } = useUserPreferences()
  const { data: backends = [], isLoading: backendsLoading } = useQuery({ queryKey: ['mcp-user-backends'], queryFn: fetchBackends })
  const { data: tokens = [] } = useQuery({ queryKey: ['mcp-user-tokens'], queryFn: fetchTokens })
  const [name, setName] = useState('')
  const [expiresInDays, setExpiresInDays] = useState('90')
  const [selectedScopes, setSelectedScopes] = useState<string[]>(() => getPref<string[]>('mcp_preferred_backends', []))
  const [createdToken, setCreatedToken] = useState<TokenCreated | null>(null)

  const mcpBaseUrl = useMemo(() => {
    const origin = window.location.origin.replace('app.', 'api.')
    return `${origin}/mcp`
  }, [])

  const activeBackends = backends.filter((b) => b.active)

  const createToken = useMutation({
    mutationFn: (payload: { name: string; scopes: string; expires_in_days: number | null }) =>
      api.post<TokenCreated>('/api/v1/mcp/tokens', payload).then((r) => r.data),
    onSuccess: (data) => {
      setCreatedToken(data)
      qc.invalidateQueries({ queryKey: ['mcp-user-tokens'] })
      toast({ title: 'Token MCP créé', variant: 'success' })
    },
  })

  const revokeToken = useMutation({
    mutationFn: (id: string) => api.post(`/api/v1/mcp/tokens/${id}/revoke`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mcp-user-tokens'] })
      toast({ title: 'Token révoqué', variant: 'success' })
    },
  })

  const deleteToken = useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/mcp/tokens/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mcp-user-tokens'] })
      toast({ title: 'Token supprimé', variant: 'success' })
    },
  })

  const handleCreate = async () => {
    if (!name.trim()) {
      toast({ title: 'Nom requis', variant: 'error' })
      return
    }
    if (selectedScopes.length === 0) {
      toast({ title: 'Sélectionnez au moins un backend MCP', variant: 'error' })
      return
    }
    const scopes = selectedScopes.join(',')
    setPref('mcp_preferred_backends', selectedScopes)
    await createToken.mutateAsync({
      name: name.trim(),
      scopes,
      expires_in_days: expiresInDays ? Number(expiresInDays) : null,
    })
    setName('')
  }

  return (
    <div className="space-y-6">
      <CollapsibleSection
        id="mcp-personal-backends"
        title="Canaux MCP"
        description="Choisissez les backends MCP que vous souhaitez utiliser dans vos clients. Les droits MCP suivent encore les scopes backend du token; le bornage RBAC fin reste à durcir côté gateway."
        storageKey="settings.user-mcp.collapse"
      >
        {backendsLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
            <Loader2 size={14} className="animate-spin" /> Chargement…
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {activeBackends.map((backend) => {
              const checked = selectedScopes.includes(backend.slug)
              return (
                <label key={backend.id} className="border border-border/60 rounded-lg bg-card px-4 py-3 flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => {
                      const next = e.target.checked
                        ? [...selectedScopes, backend.slug]
                        : selectedScopes.filter((slug) => slug !== backend.slug)
                      setSelectedScopes(next)
                      setPref('mcp_preferred_backends', next)
                    }}
                    className="mt-1 h-4 w-4 accent-primary"
                  />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Plug size={14} className="text-muted-foreground" />
                      <span className="text-sm font-semibold text-foreground">{backend.name}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{backend.description || backend.slug}</p>
                    <code className="text-[11px] text-muted-foreground mt-2 block">{`${mcpBaseUrl}/${backend.slug}`}</code>
                  </div>
                </label>
              )
            })}
          </div>
        )}
      </CollapsibleSection>

      <CollapsibleSection
        id="mcp-personal-tokens"
        title="Mes tokens MCP"
        description="Créez vos tokens personnels pour Claude, Cursor ou VS Code. Les tokens créés ici vous appartiennent."
        storageKey="settings.user-mcp.collapse"
        showSeparator={false}
      >
        <div className="border border-border/60 rounded-lg bg-card px-4 py-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-[1.5fr_180px_auto] gap-3">
            <input
              className="gl-form-input"
              placeholder="Nom du token"
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
                <span className="text-sm font-semibold text-emerald-900">Token affiché une seule fois</span>
              </div>
              <code className="block text-xs break-all text-emerald-950">{createdToken.token}</code>
            </div>
          )}

          <div className="space-y-2">
            {tokens.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucun token MCP personnel.</p>
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
                      Scopes: {token.scopes} · aperçu: {token.token_preview}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button className="gl-button gl-button-default" onClick={() => navigator.clipboard.writeText(`${mcpBaseUrl}/${selectedScopes[0] || 'opsflux'}`)}>
                      <Copy size={14} />
                    </button>
                    {!token.revoked && (
                      <button className="gl-button gl-button-default" onClick={() => revokeToken.mutate(token.id)}>
                        <Ban size={14} />
                      </button>
                    )}
                    <button className="gl-button gl-button-danger" onClick={() => deleteToken.mutate(token.id)}>
                      <AlertTriangle size={14} />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>

          <div className="border border-border/50 rounded-lg px-4 py-3 bg-muted/20">
            <div className="flex items-center gap-2 mb-2">
              <Globe size={14} className="text-muted-foreground" />
              <span className="text-sm font-semibold text-foreground">Configuration client</span>
            </div>
            <p className="text-xs text-muted-foreground mb-2">Exemple de point d’entrée MCP personnel :</p>
            <div className="flex items-center gap-2">
              <code className="text-xs break-all flex-1">{`${mcpBaseUrl}/${selectedScopes[0] || 'opsflux'}`}</code>
              <button
                className="gl-button gl-button-default"
                onClick={() => navigator.clipboard.writeText(`${mcpBaseUrl}/${selectedScopes[0] || 'opsflux'}`)}
              >
                <Check size={14} />
              </button>
              <a className="gl-button gl-button-default" href={`${mcpBaseUrl}/${selectedScopes[0] || 'opsflux'}`} target="_blank" rel="noreferrer">
                <ExternalLink size={14} />
              </a>
            </div>
          </div>
        </div>
      </CollapsibleSection>
    </div>
  )
}
