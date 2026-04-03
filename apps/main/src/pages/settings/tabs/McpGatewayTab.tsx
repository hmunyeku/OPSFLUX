/**
 * MCP Gateway — manage tokens and view active backends.
 *
 * Admin-only tab: requires admin.system permission.
 * Backends are auto-provisioned (read-only view).
 * Tokens are Bearer tokens given to MCP clients (e.g., claude.ai).
 */
import { useState, useCallback, useMemo } from 'react'
import {
  Key, Plus, Trash2, Ban, Copy, Check,
  Loader2, Shield, AlertTriangle, Globe, Plug, Clock,
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

// ── Types ──

interface Backend {
  id: string
  slug: string
  name: string
  upstream_url: string
  description: string | null
  active: boolean
  has_config: boolean
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

// ── Helpers ──

function relativeTime(dateStr: string | null): string {
  if (!dateStr) return 'Jamais'
  const d = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const mins = Math.floor(diffMs / 60000)
  if (mins < 1) return '\u00c0 l\u2019instant'
  if (mins < 60) return `Il y a ${mins} min`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `Il y a ${hours}h`
  const days = Math.floor(hours / 24)
  if (days < 30) return `Il y a ${days}j`
  return d.toLocaleDateString('fr')
}

function expiryLabel(dateStr: string | null): { text: string; warn: boolean } {
  if (!dateStr) return { text: 'N\u2019expire jamais', warn: false }
  const d = new Date(dateStr)
  const now = new Date()
  const daysLeft = Math.ceil((d.getTime() - now.getTime()) / 86400000)
  if (daysLeft < 0) return { text: 'Expir\u00e9', warn: true }
  if (daysLeft < 7) return { text: `Expire dans ${daysLeft}j`, warn: true }
  if (daysLeft < 30) return { text: `Expire dans ${daysLeft}j`, warn: false }
  return { text: `Expire le ${d.toLocaleDateString('fr')}`, warn: false }
}

// ── Main component ──

export function McpGatewayTab() {
  const { data: backends = [], isLoading: loadingBackends } = useQuery({ queryKey: ['mcp-gw-backends'], queryFn: fetchBackends })

  const mcpBaseUrl = useMemo(() => {
    const origin = window.location.origin.replace('app.', 'api.')
    return `${origin}/mcp-gw`
  }, [])

  return (
    <div className="space-y-6">
      {/* ── Header: what is MCP Gateway ── */}
      <div className="p-4 rounded-lg border border-border bg-accent/30">
        <div className="flex items-start gap-3">
          <Plug size={20} className="text-primary shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h3 className="text-sm font-semibold">MCP Gateway</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Le gateway MCP permet aux clients IA (Claude, Cursor, etc.) d'acc&eacute;der aux outils
              OpsFlux via le protocole MCP. Cr&eacute;ez un token ci-dessous et configurez votre client
              avec l'URL du backend souhait&eacute;.
            </p>
          </div>
        </div>
      </div>

      {/* ── Active backends (read-only) ── */}
      <div>
        <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
          <Globe size={14} /> Backends disponibles
        </h3>
        {loadingBackends ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
            <Loader2 size={14} className="animate-spin" /> Chargement...
          </div>
        ) : backends.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">Aucun backend actif.</p>
        ) : (
          <div className="grid gap-2">
            {backends.map(b => (
              <BackendCard key={b.id} backend={b} mcpBaseUrl={mcpBaseUrl} />
            ))}
          </div>
        )}
      </div>

      {/* ── Tokens ── */}
      <div>
        <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
          <Key size={14} /> Tokens d'acc&egrave;s
        </h3>
        <TokensSection backends={backends} mcpBaseUrl={mcpBaseUrl} />
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// Backend card (read-only)
// ═══════════════════════════════════════════════════════════════════════════════

function BackendCard({ backend: b, mcpBaseUrl }: { backend: Backend; mcpBaseUrl: string }) {
  const [copied, setCopied] = useState(false)
  const endpointUrl = `${mcpBaseUrl}/${b.slug}/mcp`

  const copy = () => {
    navigator.clipboard.writeText(endpointUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const isNative = b.upstream_url.startsWith('internal://')

  return (
    <div className="flex items-center gap-3 p-3 rounded-lg border border-border bg-background">
      <div className={`w-2 h-2 rounded-full shrink-0 ${b.active ? 'bg-green-500' : 'bg-neutral-400'}`} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{b.name}</span>
          {isNative && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 font-medium">
              Natif
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 mt-1">
          <code className="text-[11px] font-mono text-muted-foreground bg-accent/50 px-1.5 py-0.5 rounded truncate">
            {endpointUrl}
          </code>
          <button
            onClick={copy}
            className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors shrink-0"
            title="Copier l'URL"
          >
            {copied ? <Check size={12} className="text-green-600" /> : <Copy size={12} />}
          </button>
        </div>
        {b.description && <p className="text-[11px] text-muted-foreground mt-1">{b.description}</p>}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// Tokens
// ═══════════════════════════════════════════════════════════════════════════════

function TokensSection({ backends, mcpBaseUrl }: { backends: Backend[]; mcpBaseUrl: string }) {
  const qc = useQueryClient()
  const notify = useNotify()
  const { data: tokens = [], isLoading } = useQuery({ queryKey: ['mcp-gw-tokens'], queryFn: fetchTokens })

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

  if (isLoading) return <div className="flex items-center gap-2 text-sm text-muted-foreground py-2"><Loader2 size={14} className="animate-spin" /> Chargement...</div>

  const activeTokens = tokens.filter(t => !t.revoked)
  const revokedTokens = tokens.filter(t => t.revoked)

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Cr\u00e9ez un token Bearer pour authentifier un client MCP. Le token complet n'est affich\u00e9 qu'une seule fois.
      </p>

      {/* Newly created token alert */}
      {newToken && (
        <div className="p-4 rounded-lg border-2 border-amber-500/50 bg-amber-50 dark:bg-amber-950/20 space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium text-amber-700 dark:text-amber-400">
            <AlertTriangle size={14} />
            Token cr\u00e9\u00e9 — copiez-le maintenant !
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

          {/* Usage example */}
          <details className="text-xs text-muted-foreground">
            <summary className="cursor-pointer font-medium hover:text-foreground">
              Comment utiliser ce token ?
            </summary>
            <div className="mt-2 space-y-2 pl-1">
              <p>Ajoutez ce serveur MCP dans votre client (claude.ai, Cursor, etc.) :</p>
              <pre className="bg-background border border-border rounded-md p-2 font-mono text-[11px] overflow-x-auto whitespace-pre">
{JSON.stringify({
  mcpServers: {
    opsflux: {
      url: `${mcpBaseUrl}/${backends[0]?.slug || 'gouti'}/mcp`,
      headers: {
        Authorization: `Bearer ${newToken.token.slice(0, 12)}...`
      }
    }
  }
}, null, 2)}
              </pre>
            </div>
          </details>

          <button className="text-xs text-muted-foreground underline" onClick={() => setNewToken(null)}>
            Fermer
          </button>
        </div>
      )}

      {/* Active tokens */}
      {activeTokens.length === 0 && revokedTokens.length === 0 && !showForm && (
        <p className="text-sm text-muted-foreground italic">Aucun token cr\u00e9\u00e9.</p>
      )}

      <div className="space-y-2">
        {activeTokens.map(t => (
          <TokenRow
            key={t.id}
            token={t}
            onRevoke={() => revokeMut.mutate(t.id)}
            onDelete={() => deleteMut.mutate(t.id)}
          />
        ))}
      </div>

      {/* Revoked tokens (collapsed) */}
      {revokedTokens.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
            {revokedTokens.length} token{revokedTokens.length > 1 ? 's' : ''} r\u00e9voqu\u00e9{revokedTokens.length > 1 ? 's' : ''}
          </summary>
          <div className="space-y-2 mt-2">
            {revokedTokens.map(t => (
              <TokenRow
                key={t.id}
                token={t}
                onDelete={() => deleteMut.mutate(t.id)}
              />
            ))}
          </div>
        </details>
      )}

      {/* Create form */}
      {showForm ? (
        <div className="p-4 rounded-lg border border-border bg-background space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-foreground">Nom</label>
              <input
                className="gl-form-input text-sm w-full mt-1"
                placeholder="Ex: claude-herve"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              />
              <p className="text-[10px] text-muted-foreground mt-0.5">Identifiant pour retrouver ce token</p>
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
              <p className="text-[10px] text-muted-foreground mt-0.5">Laissez vide pour un token permanent</p>
            </div>
          </div>
          {backends.length > 1 && (
            <div>
              <label className="text-xs font-medium text-foreground">Backends autoris\u00e9s</label>
              <div className="flex flex-wrap gap-2 mt-1.5">
                <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                  <input
                    type="radio"
                    checked={form.scopes === '*'}
                    onChange={() => setForm(f => ({ ...f, scopes: '*' }))}
                  />
                  Tous
                </label>
                {backends.map(b => (
                  <label key={b.slug} className="flex items-center gap-1.5 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.scopes !== '*' && form.scopes.split(',').includes(b.slug)}
                      onChange={(e) => {
                        setForm(f => {
                          if (f.scopes === '*') return { ...f, scopes: b.slug }
                          const current = new Set(f.scopes.split(',').filter(Boolean))
                          if (e.target.checked) current.add(b.slug)
                          else current.delete(b.slug)
                          return { ...f, scopes: current.size === 0 ? '*' : [...current].join(',') }
                        })
                      }}
                    />
                    {b.name}
                  </label>
                ))}
              </div>
            </div>
          )}
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
              G\u00e9n\u00e9rer le token
            </button>
            <button className="gl-btn gl-btn-default text-sm" onClick={() => setShowForm(false)}>Annuler</button>
          </div>
        </div>
      ) : (
        <button className="gl-btn gl-btn-default text-sm" onClick={() => setShowForm(true)}>
          <Plus size={14} /> Cr\u00e9er un token
        </button>
      )}
    </div>
  )
}

// ── Token row ──

function TokenRow({ token: t, onRevoke, onDelete }: { token: Token; onRevoke?: () => void; onDelete: () => void }) {
  const [confirming, setConfirming] = useState<'revoke' | 'delete' | null>(null)
  const expiry = expiryLabel(t.expires_at)

  return (
    <div className={`flex items-center gap-3 p-3 rounded-lg border bg-background ${
      t.revoked ? 'border-border/50 opacity-60' : 'border-border'
    }`}>
      <Key size={16} className={`shrink-0 ${t.revoked ? 'text-destructive' : 'text-primary'}`} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium">{t.name}</span>
          <code className="text-[10px] px-1.5 py-0.5 rounded bg-accent text-muted-foreground font-mono">
            {t.token_preview}
          </code>
          {t.revoked && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 font-medium">
              R\u00e9voqu\u00e9
            </span>
          )}
          {!t.revoked && expiry.warn && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 font-medium flex items-center gap-1">
              <Clock size={10} /> {expiry.text}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 text-[11px] text-muted-foreground mt-1">
          {t.scopes === '*' ? (
            <span>Tous les backends</span>
          ) : (
            <span>Scopes: <strong>{t.scopes}</strong></span>
          )}
          {!expiry.warn && <span>{expiry.text}</span>}
          {t.last_used_at && (
            <span className="flex items-center gap-1">
              <Clock size={10} /> {relativeTime(t.last_used_at)}
            </span>
          )}
        </div>
      </div>
      <div className="flex gap-1 shrink-0">
        {confirming ? (
          <div className="flex items-center gap-1">
            <span className="text-[11px] text-muted-foreground mr-1">
              {confirming === 'delete' ? 'Supprimer ?' : 'R\u00e9voquer ?'}
            </span>
            <button
              className="gl-button-sm gl-button-danger"
              onClick={() => { setConfirming(null); confirming === 'delete' ? onDelete() : onRevoke?.() }}
            >
              Oui
            </button>
            <button
              className="gl-button-sm gl-button-default"
              onClick={() => setConfirming(null)}
            >
              Non
            </button>
          </div>
        ) : (
          <>
            {onRevoke && !t.revoked && (
              <button
                onClick={() => setConfirming('revoke')}
                className="p-1.5 rounded-md hover:bg-amber-500/10 text-muted-foreground hover:text-amber-600 transition-colors"
                title="R\u00e9voquer"
              >
                <Ban size={14} />
              </button>
            )}
            <button
              onClick={() => setConfirming('delete')}
              className="p-1.5 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
              title="Supprimer"
            >
              <Trash2 size={14} />
            </button>
          </>
        )}
      </div>
    </div>
  )
}
