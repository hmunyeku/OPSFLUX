/**
 * MCP Gateway — manage backends and tokens for remote MCP server proxy.
 *
 * Admin-only tab: requires admin.system permission.
 * Backends define upstream MCP servers (e.g., Gouti).
 * Tokens are Bearer tokens given to MCP clients (e.g., claude.ai).
 */
import { useState, useCallback } from 'react'
import {
  Server, Key, Plus, Trash2, Ban, Copy, Check,
  Loader2, Shield, AlertTriangle,
} from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '@/lib/api'
import { useToast } from '@/components/ui/Toast'

function useNotify() {
  const { toast } = useToast()
  return {
    success: (msg: string) => toast({ title: msg, variant: 'success' }),
    error: (msg: string) => toast({ title: msg, variant: 'error' }),
  }
}
import { CollapsibleSection } from '@/components/shared/CollapsibleSection'

// ── Types ──

interface Backend {
  id: string
  slug: string
  name: string
  upstream_url: string
  description: string | null
  active: boolean
  created_at: string
  updated_at: string
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

// ── API helpers ──

const fetchBackends = () => api.get<Backend[]>('/api/v1/mcp-gateway/backends').then(r => r.data)
const fetchTokens = () => api.get<Token[]>('/api/v1/mcp-gateway/tokens').then(r => r.data)

// ── Main component ──

export function McpGatewayTab() {
  return (
    <div className="space-y-1">
      <CollapsibleSection id="mcp-backends" title="Backends MCP" defaultExpanded>
        <BackendsSection />
      </CollapsibleSection>
      <CollapsibleSection id="mcp-tokens" title="Tokens d'acc&egrave;s">
        <TokensSection />
      </CollapsibleSection>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// Backends
// ═══════════════════════════════════════════════════════════════════════════════

function BackendsSection() {
  const qc = useQueryClient()
  const notify = useNotify()
  const { data: backends = [], isLoading } = useQuery({ queryKey: ['mcp-gw-backends'], queryFn: fetchBackends })

  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ slug: '', name: '', upstream_url: '', description: '' })

  const createMut = useMutation({
    mutationFn: (body: typeof form) => api.post('/api/v1/mcp-gateway/backends', body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mcp-gw-backends'] })
      setShowForm(false)
      setForm({ slug: '', name: '', upstream_url: '', description: '' })
      notify.success('Backend ajout\u00e9')
    },
    onError: () => notify.error('Erreur lors de la cr\u00e9ation'),
  })

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/mcp-gateway/backends/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mcp-gw-backends'] })
      notify.success('Backend supprim\u00e9')
    },
  })

  if (isLoading) return <div className="flex items-center gap-2 text-sm text-muted-foreground py-4"><Loader2 size={14} className="animate-spin" /> Chargement...</div>

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Serveurs MCP upstream vers lesquels le gateway proxifie les requ&ecirc;tes.
      </p>

      {/* Backend list */}
      {backends.length === 0 && !showForm && (
        <p className="text-sm text-muted-foreground italic">Aucun backend configur&eacute;.</p>
      )}

      <div className="space-y-2">
        {backends.map(b => (
          <div key={b.id} className="flex items-center gap-3 p-3 rounded-lg border border-border bg-background">
            <Server size={16} className="text-muted-foreground shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{b.name}</span>
                <code className="text-xs px-1.5 py-0.5 rounded bg-accent text-muted-foreground">{b.slug}</code>
                <span className={`gl-badge text-[10px] ${b.active ? 'gl-badge-success' : 'gl-badge-neutral'}`}>
                  {b.active ? 'Actif' : 'Inactif'}
                </span>
              </div>
              <div className="text-xs text-muted-foreground mt-0.5 font-mono truncate">{b.upstream_url}</div>
              {b.description && <div className="text-xs text-muted-foreground mt-0.5">{b.description}</div>}
            </div>
            <button
              onClick={() => { if (confirm(`Supprimer le backend "${b.name}" ?`)) deleteMut.mutate(b.id) }}
              className="p-1.5 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
              title="Supprimer"
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>

      {/* Add form */}
      {showForm ? (
        <div className="p-4 rounded-lg border border-border bg-background space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-foreground">Slug</label>
              <input
                className="gl-form-input text-sm w-full mt-1"
                placeholder="gouti"
                value={form.slug}
                onChange={e => setForm(f => ({ ...f, slug: e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, '') }))}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-foreground">Nom</label>
              <input
                className="gl-form-input text-sm w-full mt-1"
                placeholder="Gouti Project Management"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-foreground">URL upstream</label>
            <input
              className="gl-form-input text-sm w-full mt-1 font-mono"
              placeholder="http://mcp-gouti:8000"
              value={form.upstream_url}
              onChange={e => setForm(f => ({ ...f, upstream_url: e.target.value }))}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-foreground">Description</label>
            <input
              className="gl-form-input text-sm w-full mt-1"
              placeholder="Optionnel"
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            />
          </div>
          <div className="flex gap-2">
            <button
              className="gl-btn gl-btn-confirm text-sm"
              disabled={!form.slug || !form.name || !form.upstream_url || createMut.isPending}
              onClick={() => createMut.mutate(form)}
            >
              {createMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
              Ajouter
            </button>
            <button className="gl-btn gl-btn-default text-sm" onClick={() => setShowForm(false)}>Annuler</button>
          </div>
        </div>
      ) : (
        <button className="gl-btn gl-btn-default text-sm" onClick={() => setShowForm(true)}>
          <Plus size={14} /> Ajouter un backend
        </button>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// Tokens
// ═══════════════════════════════════════════════════════════════════════════════

function TokensSection() {
  const qc = useQueryClient()
  const notify = useNotify()
  const { data: tokens = [], isLoading } = useQuery({ queryKey: ['mcp-gw-tokens'], queryFn: fetchTokens })
  const { data: backends = [] } = useQuery({ queryKey: ['mcp-gw-backends'], queryFn: fetchBackends })

  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', scopes: '*', expires_in_days: '' as string })
  const [newToken, setNewToken] = useState<TokenCreated | null>(null)
  const [copied, setCopied] = useState(false)

  const createMut = useMutation({
    mutationFn: (body: { name: string; scopes: string; expires_in_days: number | null }) =>
      api.post<TokenCreated>('/api/v1/mcp-gateway/tokens', body).then(r => r.data),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['mcp-gw-tokens'] })
      setNewToken(data)
      setShowForm(false)
      setForm({ name: '', scopes: '*', expires_in_days: '' })
    },
    onError: () => notify.error('Erreur lors de la cr\u00e9ation'),
  })

  const revokeMut = useMutation({
    mutationFn: (id: string) => api.post(`/api/v1/mcp-gateway/tokens/${id}/revoke`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mcp-gw-tokens'] })
      notify.success('Token r\u00e9voqu\u00e9')
    },
  })

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/mcp-gateway/tokens/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mcp-gw-tokens'] })
      notify.success('Token supprim\u00e9')
    },
  })

  const copyToken = useCallback((token: string) => {
    navigator.clipboard.writeText(token)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [])

  if (isLoading) return <div className="flex items-center gap-2 text-sm text-muted-foreground py-4"><Loader2 size={14} className="animate-spin" /> Chargement...</div>

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Tokens Bearer pour les clients MCP externes (claude.ai, etc.).
        Le token complet n'est affich&eacute; qu'une seule fois &agrave; la cr&eacute;ation.
      </p>

      {/* Newly created token alert */}
      {newToken && (
        <div className="p-4 rounded-lg border-2 border-amber-500/50 bg-amber-50 dark:bg-amber-950/20 space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium text-amber-700 dark:text-amber-400">
            <AlertTriangle size={14} />
            Token cr&eacute;&eacute; — copiez-le maintenant, il ne sera plus affich&eacute;
          </div>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs font-mono bg-background border border-border rounded-md px-3 py-2 select-all break-all">
              {newToken.token}
            </code>
            <button
              className="gl-btn gl-btn-default text-sm shrink-0"
              onClick={() => copyToken(newToken.token)}
            >
              {copied ? <Check size={14} className="text-green-600" /> : <Copy size={14} />}
              {copied ? 'Copi\u00e9' : 'Copier'}
            </button>
          </div>
          <div className="text-xs text-muted-foreground">
            <strong>Nom :</strong> {newToken.name} &middot;{' '}
            <strong>Scopes :</strong> {newToken.scopes} &middot;{' '}
            <strong>Expire :</strong> {newToken.expires_at ? new Date(newToken.expires_at).toLocaleDateString('fr') : 'Jamais'}
          </div>
          <button className="text-xs text-muted-foreground underline" onClick={() => setNewToken(null)}>Fermer</button>
        </div>
      )}

      {/* Token list */}
      {tokens.length === 0 && !showForm && (
        <p className="text-sm text-muted-foreground italic">Aucun token cr&eacute;&eacute;.</p>
      )}

      <div className="space-y-2">
        {tokens.map(t => (
          <div key={t.id} className="flex items-center gap-3 p-3 rounded-lg border border-border bg-background">
            <Key size={16} className={`shrink-0 ${t.revoked ? 'text-destructive' : 'text-muted-foreground'}`} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{t.name}</span>
                <code className="text-xs px-1.5 py-0.5 rounded bg-accent text-muted-foreground font-mono">{t.token_preview}</code>
                {t.revoked && <span className="gl-badge gl-badge-danger text-[10px]">R&eacute;voqu&eacute;</span>}
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">
                Scopes: <strong>{t.scopes}</strong>
                {t.expires_at && <> &middot; Expire: {new Date(t.expires_at).toLocaleDateString('fr')}</>}
                {t.last_used_at && <> &middot; Dernier usage: {new Date(t.last_used_at).toLocaleDateString('fr')}</>}
              </div>
            </div>
            <div className="flex gap-1 shrink-0">
              {!t.revoked && (
                <button
                  onClick={() => { if (confirm(`R\u00e9voquer le token "${t.name}" ?`)) revokeMut.mutate(t.id) }}
                  className="p-1.5 rounded-md hover:bg-amber-500/10 text-muted-foreground hover:text-amber-600 transition-colors"
                  title="R\u00e9voquer"
                >
                  <Ban size={14} />
                </button>
              )}
              <button
                onClick={() => { if (confirm(`Supprimer d\u00e9finitivement le token "${t.name}" ?`)) deleteMut.mutate(t.id) }}
                className="p-1.5 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                title="Supprimer"
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Create form */}
      {showForm ? (
        <div className="p-4 rounded-lg border border-border bg-background space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-foreground">Nom du token</label>
              <input
                className="gl-form-input text-sm w-full mt-1"
                placeholder="claude-herve"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-foreground">Expiration (jours)</label>
              <input
                className="gl-form-input text-sm w-full mt-1"
                type="number"
                placeholder="Vide = jamais"
                min={1}
                max={3650}
                value={form.expires_in_days}
                onChange={e => setForm(f => ({ ...f, expires_in_days: e.target.value }))}
              />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-foreground">Scopes (backends autoris&eacute;s)</label>
            <div className="flex flex-wrap gap-2 mt-1.5">
              <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                <input
                  type="radio"
                  checked={form.scopes === '*'}
                  onChange={() => setForm(f => ({ ...f, scopes: '*' }))}
                />
                Tous les backends
              </label>
              {backends.map(b => (
                <label key={b.slug} className="flex items-center gap-1.5 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.scopes !== '*' && form.scopes.split(',').includes(b.slug)}
                    onChange={(e) => {
                      setForm(f => {
                        if (f.scopes === '*') {
                          return { ...f, scopes: b.slug }
                        }
                        const current = new Set(f.scopes.split(',').filter(Boolean))
                        if (e.target.checked) current.add(b.slug)
                        else current.delete(b.slug)
                        return { ...f, scopes: current.size === 0 ? '*' : [...current].join(',') }
                      })
                    }}
                  />
                  {b.name} ({b.slug})
                </label>
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            <button
              className="gl-btn gl-btn-confirm text-sm"
              disabled={!form.name || createMut.isPending}
              onClick={() => createMut.mutate({
                name: form.name,
                scopes: form.scopes,
                expires_in_days: form.expires_in_days ? parseInt(form.expires_in_days) : null,
              })}
            >
              {createMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <Shield size={14} />}
              G&eacute;n&eacute;rer le token
            </button>
            <button className="gl-btn gl-btn-default text-sm" onClick={() => setShowForm(false)}>Annuler</button>
          </div>
        </div>
      ) : (
        <button className="gl-btn gl-btn-default text-sm" onClick={() => setShowForm(true)}>
          <Plus size={14} /> Cr&eacute;er un token
        </button>
      )}
    </div>
  )
}
