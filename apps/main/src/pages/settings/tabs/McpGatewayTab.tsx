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
  Loader2, Shield, AlertTriangle, Globe,
  Activity, ExternalLink, RefreshCw, X, Wrench,
} from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { DataTable } from '@/components/ui/DataTable/DataTable'
import { CollapsibleSection } from '@/components/shared/CollapsibleSection'
import type { ColumnDef } from '@tanstack/react-table'
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
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const mins = Math.floor(diffMs / 60000)
  if (mins < 1) return "À l'instant"
  if (mins < 60) return `Il y a ${mins} min`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `Il y a ${hours}h`
  const days = Math.floor(hours / 24)
  if (days < 30) return `Il y a ${days}j`
  return d.toLocaleDateString('fr')
}

function expiryLabel(dateStr: string | null): { text: string; warn: boolean; expired: boolean } {
  if (!dateStr) return { text: 'Jamais', warn: false, expired: false }
  const d = new Date(dateStr)
  const now = new Date()
  const daysLeft = Math.ceil((d.getTime() - now.getTime()) / 86400000)
  if (daysLeft < 0) return { text: 'Expiré', warn: true, expired: true }
  if (daysLeft < 7) return { text: `${daysLeft}j restants`, warn: true, expired: false }
  if (daysLeft < 30) return { text: `${daysLeft}j restants`, warn: false, expired: false }
  return { text: d.toLocaleDateString('fr'), warn: false, expired: false }
}

function getStatusInfo(t: Token) {
  if (t.revoked) return { label: 'Révoqué', className: 'gl-badge-neutral' }
  const exp = expiryLabel(t.expires_at)
  if (exp.expired) return { label: 'Expiré', className: 'gl-badge-neutral' }
  if (exp.warn) return { label: 'Expire bientôt', className: 'gl-badge-warning' }
  return { label: 'Actif', className: 'gl-badge-success' }
}

// ── Stats Card ──

function StatsCard({ label, count, icon: Icon }: { label: string; count: number; icon: typeof Key }) {
  return (
    <div className="border border-border/60 rounded-lg bg-card px-4 py-3">
      <div className="flex items-center gap-2 mb-1">
        <Icon size={12} className="text-muted-foreground" />
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
      <p className="text-2xl font-semibold text-foreground">{count}</p>
    </div>
  )
}

// ── Main component ──

export function McpGatewayTab() {
  const [selectedBackend, setSelectedBackend] = useState<Backend | null>(null)
  const { data: backends = [], isLoading: loadingBackends } = useQuery({
    queryKey: ['mcp-gw-backends'],
    queryFn: fetchBackends,
  })
  const { data: tokens = [] } = useQuery({
    queryKey: ['mcp-gw-tokens'],
    queryFn: fetchTokens,
  })

  const mcpBaseUrl = useMemo(() => {
    const origin = window.location.origin.replace('app.', 'api.')
    return `${origin}/mcp-gw`
  }, [])

  const activeTokens = tokens.filter(t => !t.revoked && !expiryLabel(t.expires_at).expired)
  const expiringSoon = tokens.filter(t => !t.revoked && expiryLabel(t.expires_at).warn && !expiryLabel(t.expires_at).expired)
  const revokedCount = tokens.filter(t => t.revoked).length
  const expiredCount = tokens.filter(t => !t.revoked && expiryLabel(t.expires_at).expired).length

  return (
    <div className="space-y-6">
      {/* ── Stats overview ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatsCard label="Backends actifs" count={backends.filter(b => b.active).length} icon={Globe} />
        <StatsCard label="Tokens actifs" count={activeTokens.length} icon={Key} />
        <StatsCard label="Expirent bientôt" count={expiringSoon.length} icon={AlertTriangle} />
        <StatsCard label="Révoqués" count={revokedCount + expiredCount} icon={Ban} />
      </div>

      {/* ── Backends section ── */}
      <CollapsibleSection
        id="mcp-backends"
        title="Backends disponibles"
        description="Serveurs MCP accessibles via la passerelle. Cliquez sur un backend pour voir ses outils."
        storageKey="settings.mcp.backends.collapse"
        showSeparator={false}
      >
        {loadingBackends ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
            <Loader2 size={14} className="animate-spin" /> Chargement…
          </div>
        ) : backends.length === 0 ? (
          <div className="text-center py-8">
            <Globe size={32} className="mx-auto text-muted-foreground/40 mb-2" />
            <p className="text-sm text-muted-foreground">Aucun backend configuré.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {backends.map(b => (
              <BackendCard
                key={b.id}
                backend={b}
                mcpBaseUrl={mcpBaseUrl}
                onSelect={() => setSelectedBackend(b)}
              />
            ))}
          </div>
        )}
      </CollapsibleSection>

      {/* Backend tools modal */}
      {selectedBackend && (
        <BackendToolsModal
          backend={selectedBackend}
          mcpBaseUrl={mcpBaseUrl}
          onClose={() => setSelectedBackend(null)}
        />
      )}

      {/* ── Tokens section ── */}
      <CollapsibleSection
        id="mcp-tokens"
        title="Tokens d'accès"
        description="Tokens Bearer pour authentifier les clients MCP (Claude, Cursor, VS Code…). Le token complet n'est affiché qu'à la création."
        storageKey="settings.mcp.tokens.collapse"
        showSeparator={false}
      >
        <TokensSection backends={backends} mcpBaseUrl={mcpBaseUrl} tokens={tokens} />
      </CollapsibleSection>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// Backend card (grid layout, like ConnectorCard)
// ═══════════════════════════════════════════════════════════════════════════════

function BackendCard({
  backend: b,
  mcpBaseUrl,
  onSelect,
}: {
  backend: Backend
  mcpBaseUrl: string
  onSelect: () => void
}) {
  const [copied, setCopied] = useState(false)
  const endpointUrl = `${mcpBaseUrl}/${b.slug}/mcp`
  const isNative = b.upstream_url.startsWith('internal://')

  const borderClass = b.active
    ? 'border-emerald-300 dark:border-emerald-700 bg-emerald-50/50 dark:bg-emerald-900/10'
    : 'border-border/60 bg-card'

  const copy = (e: React.MouseEvent) => {
    e.stopPropagation()
    navigator.clipboard.writeText(endpointUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className={`border rounded-lg transition-colors flex flex-col self-start ${borderClass}`}>
      {/* Card header — clickable */}
      <button
        type="button"
        onClick={onSelect}
        className="w-full flex flex-col gap-2 px-4 py-3 text-left hover:bg-accent/30 transition-colors rounded-t-lg"
      >
        <div className="flex items-center gap-2.5 w-full">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
            b.active
              ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400'
              : 'bg-neutral-100 dark:bg-neutral-800 text-muted-foreground'
          }`}>
            <Activity size={16} />
          </div>
          <span className="text-sm font-semibold text-foreground truncate flex-1">{b.name}</span>
        </div>
        {b.description && (
          <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">{b.description}</p>
        )}
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`gl-badge ${b.active ? 'gl-badge-success' : 'gl-badge-neutral'}`}>
            {b.active ? 'Actif' : 'Inactif'}
          </span>
          {isNative && <span className="gl-badge gl-badge-info">Natif</span>}
        </div>
      </button>

      {/* Endpoint URL footer */}
      <div className="px-4 pb-3 pt-2 border-t border-border/50">
        <div className="flex items-center gap-1.5">
          <ExternalLink size={11} className="text-muted-foreground shrink-0" />
          <code className="text-[10px] font-mono text-muted-foreground truncate flex-1">{endpointUrl}</code>
          <button
            onClick={copy}
            className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors shrink-0"
            title="Copier l'URL"
          >
            {copied ? <Check size={12} className="text-green-600" /> : <Copy size={12} />}
          </button>
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// Backend tools modal
// ═══════════════════════════════════════════════════════════════════════════════

interface McpTool {
  name: string
  description: string
  inputSchema?: Record<string, unknown>
}

function BackendToolsModal({
  backend,
  mcpBaseUrl,
  onClose,
}: {
  backend: Backend
  mcpBaseUrl: string
  onClose: () => void
}) {
  const [search, setSearch] = useState('')
  const endpointUrl = `${mcpBaseUrl}/${backend.slug}/mcp`
  const [copiedUrl, setCopiedUrl] = useState(false)

  const { data, isLoading, error } = useQuery({
    queryKey: ['mcp-gw-tools', backend.slug],
    queryFn: () => api.get<{ backend: string; tools: McpTool[] }>(
      `/api/v1/mcp-gateway/backends/${backend.slug}/tools`
    ).then(r => r.data),
  })

  const tools = data?.tools ?? []
  const filtered = useMemo(() => {
    if (!search) return tools
    const q = search.toLowerCase()
    return tools.filter(t =>
      t.name.toLowerCase().includes(q) || t.description?.toLowerCase().includes(q)
    )
  }, [tools, search])

  const copyUrl = () => {
    navigator.clipboard.writeText(endpointUrl)
    setCopiedUrl(true)
    setTimeout(() => setCopiedUrl(false), 2000)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-background border border-border rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col mx-4"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-4 border-b border-border shrink-0">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Activity size={20} className="text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-semibold text-foreground">{backend.name}</h2>
            <div className="flex items-center gap-1.5 mt-0.5">
              <code className="text-[11px] font-mono text-muted-foreground truncate">{endpointUrl}</code>
              <button onClick={copyUrl} className="p-0.5 hover:text-foreground text-muted-foreground">
                {copiedUrl ? <Check size={11} className="text-green-600" /> : <Copy size={11} />}
              </button>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={`gl-badge ${backend.active ? 'gl-badge-success' : 'gl-badge-neutral'}`}>
              {backend.active ? 'Actif' : 'Inactif'}
            </span>
            <button onClick={onClose} className="p-1.5 rounded-md hover:bg-accent text-muted-foreground">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Tools section */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Wrench size={14} />
              Outils MCP
              {!isLoading && <span className="text-muted-foreground font-normal">({tools.length})</span>}
            </h3>
            {tools.length > 5 && (
              <input
                className="gl-form-input text-xs w-48"
                placeholder="Filtrer les outils…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            )}
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
              <Loader2 size={16} className="animate-spin" /> Chargement des outils…
            </div>
          ) : error ? (
            <div className="text-center py-8">
              <AlertTriangle size={24} className="mx-auto text-amber-500 mb-2" />
              <p className="text-sm text-muted-foreground">
                Impossible de charger les outils. Le backend est peut-être indisponible.
              </p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-8">
              <Wrench size={24} className="mx-auto text-muted-foreground/40 mb-2" />
              <p className="text-sm text-muted-foreground">
                {search ? 'Aucun outil correspondant.' : 'Aucun outil disponible.'}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map(tool => (
                <ToolRow key={tool.name} tool={tool} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function ToolRow({ tool }: { tool: McpTool }) {
  const [expanded, setExpanded] = useState(false)
  const params = tool.inputSchema?.properties as Record<string, { type?: string; description?: string }> | undefined
  const required = (tool.inputSchema?.required as string[]) ?? []

  return (
    <div className="border border-border/60 rounded-lg bg-card">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-start gap-3 px-3 py-2.5 text-left hover:bg-accent/30 transition-colors rounded-lg"
      >
        <Wrench size={13} className="text-primary shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <code className="text-xs font-semibold font-mono text-foreground">{tool.name}</code>
          {tool.description && (
            <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2 leading-relaxed">{tool.description}</p>
          )}
        </div>
        {params && Object.keys(params).length > 0 && (
          <span className="text-[10px] text-muted-foreground shrink-0 mt-0.5">
            {Object.keys(params).length} param{Object.keys(params).length > 1 ? 's' : ''}
          </span>
        )}
      </button>
      {expanded && params && Object.keys(params).length > 0 && (
        <div className="px-3 pb-3 border-t border-border/50">
          <table className="w-full text-[11px] mt-2">
            <thead>
              <tr className="text-muted-foreground">
                <th className="text-left font-medium pb-1 pr-3">Paramètre</th>
                <th className="text-left font-medium pb-1 pr-3">Type</th>
                <th className="text-left font-medium pb-1">Description</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(params).map(([name, schema]) => (
                <tr key={name} className="border-t border-border/30">
                  <td className="py-1.5 pr-3 font-mono text-foreground">
                    {name}
                    {required.includes(name) && <span className="text-red-500 ml-0.5">*</span>}
                  </td>
                  <td className="py-1.5 pr-3 text-muted-foreground">{schema?.type ?? '—'}</td>
                  <td className="py-1.5 text-muted-foreground">{schema?.description ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// Tokens section with DataTable
// ═══════════════════════════════════════════════════════════════════════════════

function TokensSection({
  backends,
  mcpBaseUrl,
  tokens,
}: {
  backends: Backend[]
  mcpBaseUrl: string
  tokens: Token[]
}) {
  const qc = useQueryClient()
  const notify = useNotify()
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', scopes: '*', expires_in_days: '' as string })
  const [newToken, setNewToken] = useState<TokenCreated | null>(null)
  const [copiedNew, setCopiedNew] = useState(false)
  const [confirmAction, setConfirmAction] = useState<{ id: string; type: 'revoke' | 'delete' } | null>(null)

  const createMut = useMutation({
    mutationFn: (body: { name: string; scopes: string; expires_in_days: number | null }) =>
      api.post<TokenCreated>('/api/v1/mcp-gateway/tokens', body).then(r => r.data),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['mcp-gw-tokens'] })
      setNewToken(data)
      setShowForm(false)
      setForm({ name: '', scopes: '*', expires_in_days: '' })
      notify.success('Token créé avec succès')
    },
    onError: () => notify.error('Erreur lors de la création du token'),
  })

  const revokeMut = useMutation({
    mutationFn: (id: string) => api.post(`/api/v1/mcp-gateway/tokens/${id}/revoke`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mcp-gw-tokens'] })
      setConfirmAction(null)
      notify.success('Token révoqué')
    },
  })

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/mcp-gateway/tokens/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mcp-gw-tokens'] })
      setConfirmAction(null)
      notify.success('Token supprimé')
    },
  })

  const copyToken = useCallback((token: string) => {
    navigator.clipboard.writeText(token)
    setCopiedNew(true)
    setTimeout(() => setCopiedNew(false), 2000)
  }, [])

  const filteredTokens = useMemo(() => {
    if (!search) return tokens
    const q = search.toLowerCase()
    return tokens.filter(t => t.name.toLowerCase().includes(q) || t.token_preview.includes(q))
  }, [tokens, search])

  const isActive = (t: Token) => !t.revoked && !expiryLabel(t.expires_at).expired

  const columns = useMemo<ColumnDef<Token, unknown>[]>(() => [
    {
      accessorKey: 'name',
      header: 'Nom',
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <Key size={14} className={row.original.revoked ? 'text-muted-foreground' : 'text-primary'} />
          <span className={`font-medium ${row.original.revoked ? 'text-muted-foreground line-through' : 'text-foreground'}`}>
            {row.original.name}
          </span>
          <code className="text-[10px] px-1.5 py-0.5 rounded bg-accent text-muted-foreground font-mono">
            {row.original.token_preview}
          </code>
        </div>
      ),
    },
    {
      id: 'status',
      header: 'Statut',
      cell: ({ row }) => {
        const info = getStatusInfo(row.original)
        return <span className={`gl-badge ${info.className}`}>{info.label}</span>
      },
      size: 110,
    },
    {
      id: 'scopes',
      header: 'Accès',
      cell: ({ row }) =>
        row.original.scopes === '*' ? (
          <span className="gl-badge gl-badge-info">Tous les backends</span>
        ) : (
          <div className="flex flex-wrap gap-1">
            {row.original.scopes.split(',').map(s => (
              <span key={s} className="gl-badge gl-badge-neutral">{s.trim()}</span>
            ))}
          </div>
        ),
      size: 160,
    },
    {
      accessorKey: 'last_used_at',
      header: 'Dernier usage',
      cell: ({ row }) => (
        <span className="text-muted-foreground text-sm">
          {relativeTime(row.original.last_used_at)}
        </span>
      ),
      size: 120,
    },
    {
      accessorKey: 'expires_at',
      header: 'Expiration',
      cell: ({ row }) => {
        const exp = expiryLabel(row.original.expires_at)
        return (
          <span className={`text-sm ${exp.warn ? 'text-amber-600 dark:text-amber-400 font-medium' : 'text-muted-foreground'}`}>
            {exp.text}
          </span>
        )
      },
      size: 120,
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => {
        const t = row.original
        if (confirmAction?.id === t.id) {
          return (
            <div className="flex items-center gap-1">
              <span className="text-xs text-muted-foreground mr-1">
                {confirmAction.type === 'delete' ? 'Supprimer ?' : 'Révoquer ?'}
              </span>
              <button
                className="gl-button-sm gl-button-danger"
                onClick={(e) => {
                  e.stopPropagation()
                  confirmAction.type === 'delete'
                    ? deleteMut.mutate(t.id)
                    : revokeMut.mutate(t.id)
                }}
              >
                Oui
              </button>
              <button
                className="gl-button-sm gl-button-default"
                onClick={(e) => { e.stopPropagation(); setConfirmAction(null) }}
              >
                Non
              </button>
            </div>
          )
        }
        return (
          <div className="flex gap-1">
            {isActive(t) && (
              <button
                onClick={(e) => { e.stopPropagation(); setConfirmAction({ id: t.id, type: 'revoke' }) }}
                className="p-1.5 rounded-md hover:bg-amber-500/10 text-muted-foreground hover:text-amber-600 transition-colors"
                title="Révoquer"
              >
                <Ban size={14} />
              </button>
            )}
            <button
              onClick={(e) => { e.stopPropagation(); setConfirmAction({ id: t.id, type: 'delete' }) }}
              className="p-1.5 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
              title="Supprimer"
            >
              <Trash2 size={14} />
            </button>
          </div>
        )
      },
      size: 120,
    },
  ], [confirmAction, deleteMut, revokeMut])

  return (
    <div className="space-y-4">
      {/* Newly created token alert */}
      {newToken && (
        <div className="p-4 rounded-lg border-2 border-amber-500/50 bg-amber-50 dark:bg-amber-950/20 space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium text-amber-700 dark:text-amber-400">
            <AlertTriangle size={14} />
            Token créé — copiez-le maintenant, il ne sera plus affiché !
          </div>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs font-mono bg-background border border-border rounded-md px-3 py-2 select-all break-all">
              {newToken.token}
            </code>
            <button
              className="gl-btn gl-btn-default text-sm shrink-0"
              onClick={() => copyToken(newToken.token)}
            >
              {copiedNew ? <Check size={14} className="text-green-600" /> : <Copy size={14} />}
              {copiedNew ? 'Copié' : 'Copier'}
            </button>
          </div>

          {/* Usage example */}
          <details className="text-xs text-muted-foreground">
            <summary className="cursor-pointer font-medium hover:text-foreground">
              Comment utiliser ce token ?
            </summary>
            <div className="mt-2 space-y-2 pl-1">
              <p>Ajoutez ce serveur MCP dans votre client (claude.ai, Cursor, etc.) :</p>
              <pre className="bg-background border border-border rounded-md p-3 font-mono text-[11px] overflow-x-auto whitespace-pre">
{JSON.stringify({
  mcpServers: {
    opsflux: {
      url: `${mcpBaseUrl}/${backends[0]?.slug || 'gouti'}/mcp`,
      headers: {
        Authorization: `Bearer ${newToken.token.slice(0, 12)}...`,
      },
    },
  },
}, null, 2)}
              </pre>
            </div>
          </details>

          <button
            className="text-xs text-muted-foreground hover:text-foreground underline"
            onClick={() => setNewToken(null)}
          >
            Fermer
          </button>
        </div>
      )}

      {/* Create token button + form */}
      <div className="flex justify-end">
        <button
          className="gl-button gl-button-confirm"
          onClick={() => setShowForm(s => !s)}
        >
          {showForm ? <RefreshCw size={14} /> : <Plus size={14} />}
          {showForm ? 'Annuler' : 'Créer un token'}
        </button>
      </div>

      {showForm && (
        <div className="p-4 rounded-lg border border-primary/30 bg-primary/5 space-y-4">
          <h4 className="text-sm font-medium flex items-center gap-2">
            <Shield size={14} className="text-primary" />
            Nouveau token
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-foreground mb-1 block">Nom</label>
              <input
                className="gl-form-input text-sm w-full"
                placeholder="Ex: claude-production"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                autoFocus
              />
              <p className="text-[10px] text-muted-foreground mt-1">Identifiant pour retrouver ce token</p>
            </div>
            <div>
              <label className="text-xs font-medium text-foreground mb-1 block">Expiration (jours)</label>
              <input
                className="gl-form-input text-sm w-full"
                type="number"
                placeholder="Vide = permanent"
                min={1}
                max={3650}
                value={form.expires_in_days}
                onChange={e => setForm(f => ({ ...f, expires_in_days: e.target.value }))}
              />
              <p className="text-[10px] text-muted-foreground mt-1">Laissez vide pour un token sans expiration</p>
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-foreground mb-1.5 block">Backends autorisés</label>
            <div className="flex flex-wrap gap-3">
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
            <p className="text-[10px] text-muted-foreground mt-1">Restreignez l'accès à des backends spécifiques ou autorisez tous</p>
          </div>
          <div className="flex gap-2 pt-1">
            <button
              className="gl-button gl-button-confirm"
              disabled={!form.name.trim() || createMut.isPending}
              onClick={() => createMut.mutate({
                name: form.name.trim(),
                scopes: form.scopes,
                expires_in_days: form.expires_in_days ? parseInt(form.expires_in_days) : null,
              })}
            >
              {createMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <Shield size={14} />}
              Générer le token
            </button>
          </div>
        </div>
      )}

      {/* Tokens table */}
      <DataTable
        columns={columns}
        data={filteredTokens}
        isLoading={false}
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Rechercher par nom…"
        emptyIcon={Key}
        emptyTitle="Aucun token MCP"
        storageKey="mcp-tokens"
      />
    </div>
  )
}
