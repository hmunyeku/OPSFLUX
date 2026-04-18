/**
 * AdminerTab — SQL Runner for database management.
 *
 * Custom SQL editor replacing the Adminer iframe. Allows admin users to run
 * read-only SQL queries directly from the settings panel.
 * Only visible to admin.system users.
 */
import { useQuery } from '@tanstack/react-query'
import {
  Database,
  Play,
  Trash2,
  Copy,
  Check,
  AlertTriangle,
  Table2,
  Clock,
  ChevronDown,
  Loader2,
} from 'lucide-react'
import { useState, useRef, useCallback, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import api from '@/lib/api'
import { useToast } from '@/components/ui/Toast'

// ── Types ───────────────────────────────────────────────────────────────────

interface SqlResult {
  columns: string[]
  rows: any[][]
  row_count: number
  execution_time_ms: number
  error: string | null
  truncated: boolean
}

// ── Quick queries ───────────────────────────────────────────────────────────

const QUICK_QUERIES = [
  {
    label: 'Utilisateurs actifs',
    sql: "SELECT count(*) AS active_users FROM users WHERE active = true;",
  },
  {
    label: 'Taille de la base',
    sql: "SELECT pg_size_pretty(pg_database_size(current_database())) AS db_size;",
  },
  {
    label: 'Top 10 tables',
    sql: "SELECT schemaname, tablename, pg_size_pretty(pg_total_relation_size(schemaname || '.' || tablename)) AS size, pg_total_relation_size(schemaname || '.' || tablename) AS raw_bytes FROM pg_tables WHERE schemaname = 'public' ORDER BY pg_total_relation_size(schemaname || '.' || tablename) DESC LIMIT 10;",
  },
  {
    label: 'Sessions actives',
    sql: "SELECT pid, usename, application_name, client_addr, state, query_start, left(query, 80) AS query_preview FROM pg_stat_activity WHERE state IS NOT NULL ORDER BY query_start DESC LIMIT 20;",
  },
  {
    label: 'Audit logs récents',
    sql: "SELECT id, action, entity_type, entity_id, user_id, created_at FROM audit_log ORDER BY created_at DESC LIMIT 20;",
  },
  {
    label: 'Stats conformité',
    sql: "SELECT status, count(*) FROM compliance_checks GROUP BY status ORDER BY count DESC;",
  },
  {
    label: 'Toutes les tables',
    sql: "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;",
  },
  {
    label: 'Extensions installées',
    sql: "SELECT extname, extversion FROM pg_extension ORDER BY extname;",
  },
]

const MAX_ROWS_OPTIONS = [100, 500, 1000, 5000]

// ── Component ───────────────────────────────────────────────────────────────

export function AdminerTab() {
  const { t } = useTranslation()
  const { toast } = useToast()
  const [copied, setCopied] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [maxRows, setMaxRows] = useState(500)
  const [result, setResult] = useState<SqlResult | null>(null)
  const [isRunning, setIsRunning] = useState(false)
  const [showMaxRowsDropdown, setShowMaxRowsDropdown] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Fetch DB config
  const { data: config, isLoading, error } = useQuery({
    queryKey: ['adminer-config'],
    queryFn: () => api.get('/api/v1/admin/adminer-config').then((r) => r.data),
  })

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowMaxRowsDropdown(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Auto-resize textarea
  const autoResize = useCallback(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.max(120, Math.min(el.scrollHeight, 400)) + 'px'
  }, [])

  useEffect(() => {
    autoResize()
  }, [query, autoResize])

  // Copy helper
  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text)
    setCopied(label)
    toast({ title: t('settings.toast.adminer.copied', { label }), variant: 'success' })
    setTimeout(() => setCopied(null), 2000)
  }

  // Run SQL query
  const runQuery = useCallback(async () => {
    const trimmed = query.trim()
    if (!trimmed || isRunning) return

    setIsRunning(true)
    setResult(null)

    try {
      const { data } = await api.post('/api/v1/admin/sql-runner', {
        query: trimmed,
        max_rows: maxRows,
      })
      setResult(data)
      if (data.error) {
        toast({ title: t('settings.toast.adminer.sql_error'), description: data.error, variant: 'error' })
      }
    } catch (err: any) {
      const msg = err?.response?.data?.detail || err.message || 'Erreur inconnue'
      setResult({
        columns: [],
        rows: [],
        row_count: 0,
        execution_time_ms: 0,
        error: msg,
        truncated: false,
      })
      toast({ title: t('settings.toast.error'), description: msg, variant: 'error' })
    } finally {
      setIsRunning(false)
    }
  }, [query, maxRows, isRunning, toast])

  // Keyboard shortcut: Ctrl+Enter
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault()
        runQuery()
      }
    },
    [runQuery],
  )

  // ── Loading / Error states ────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 size={16} className="animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
        <AlertTriangle size={24} className="text-amber-500" />
        <p className="text-sm font-medium">Accès refusé</p>
        <p className="text-xs">Vous n'avez pas les droits d'accès à la base de données.</p>
      </div>
    )
  }

  // ── DB info ───────────────────────────────────────────────────────────────

  const dbInfo = [
    { label: 'Moteur', value: 'PostgreSQL 16 + pgvector + PostGIS' },
    { label: 'Base', value: config?.database || 'opsflux' },
    { label: 'Driver', value: config?.driver || 'pgsql' },
    { label: 'Hôte interne', value: 'db (réseau Docker)' },
  ]

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">
      {/* Header + pgAdmin link */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Database size={16} className="text-primary" />
          <h3 className="text-sm font-semibold text-foreground">Base de données</h3>
          <span className="gl-badge gl-badge-warning text-[8px]">Superadmin</span>
        </div>
        <a
          href="https://db.opsflux.io"
          target="_blank"
          rel="noopener noreferrer"
          className="gl-button-sm gl-button-confirm flex items-center gap-1.5"
        >
          <Database size={11} />
          Ouvrir pgAdmin
        </a>
      </div>

      {/* Connection info — single compact line */}
      <div className="flex items-center gap-3 flex-wrap text-[11px] text-muted-foreground px-1">
        {dbInfo.map(({ label, value }, i) => (
          <span key={label} className="flex items-center gap-1.5">
            {i > 0 && <span className="text-border">·</span>}
            <span>{label}:</span>
            <span className="font-mono text-foreground">{value}</span>
          </span>
        ))}
      </div>

      {/* SQL Editor */}
      <div className="border border-border rounded-lg overflow-hidden">
        {/* Toolbar */}
        <div className="flex items-center justify-between px-3 py-2 bg-muted/50 border-b border-border">
          <div className="flex items-center gap-2">
            <button
              onClick={runQuery}
              disabled={isRunning || !query.trim()}
              className="gl-button-sm gl-button-primary"
            >
              {isRunning ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <Play size={12} />
              )}
              Exécuter
            </button>
            <button
              onClick={() => {
                setQuery('')
                setResult(null)
              }}
              className="gl-button-sm gl-button-default"
            >
              <Trash2 size={12} />
              Effacer
            </button>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-[10px] text-muted-foreground hidden sm:inline">
              Ctrl+Enter pour exécuter
            </span>

            {/* Max rows selector */}
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => setShowMaxRowsDropdown(!showMaxRowsDropdown)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-md border border-border bg-background text-foreground hover:bg-muted transition-colors"
              >
                <Table2 size={11} />
                {maxRows} lignes max
                <ChevronDown size={11} />
              </button>
              {showMaxRowsDropdown && (
                <div className="absolute right-0 top-full mt-1 z-50 bg-popover border border-border rounded-md shadow-lg py-1 min-w-[120px]">
                  {MAX_ROWS_OPTIONS.map((n) => (
                    <button
                      key={n}
                      onClick={() => {
                        setMaxRows(n)
                        setShowMaxRowsDropdown(false)
                      }}
                      className={`w-full text-left px-3 py-1.5 text-xs hover:bg-muted transition-colors ${
                        n === maxRows ? 'text-primary font-medium' : 'text-foreground'
                      }`}
                    >
                      {n.toLocaleString()} lignes
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Textarea */}
        <textarea
          ref={textareaRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="SELECT * FROM users LIMIT 10;"
          spellCheck={false}
          className="w-full resize-none bg-[#1e1e2e] text-[#cdd6f4] font-mono text-xs leading-relaxed p-4 focus:outline-none placeholder:text-[#585b70] selection:bg-[#45475a]"
          style={{ minHeight: 120 }}
        />
      </div>

      {/* Results */}
      {result && (
        <div className="border border-border rounded-lg overflow-hidden">
          {/* Result header */}
          <div className="flex items-center justify-between px-3 py-2 bg-muted/50 border-b border-border">
            <div className="flex items-center gap-3">
              {result.error ? (
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-red-500">
                  <AlertTriangle size={12} />
                  Erreur
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-foreground">
                  <Table2 size={12} className="text-primary" />
                  {result.row_count.toLocaleString()} ligne{result.row_count !== 1 ? 's' : ''}
                </span>
              )}
              {result.truncated && (
                <span className="inline-flex items-center gap-1 text-[10px] text-amber-500 font-medium">
                  <AlertTriangle size={10} />
                  Résultats tronqués (max {maxRows.toLocaleString()})
                </span>
              )}
            </div>
            <div className="flex items-center gap-3">
              <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                <Clock size={10} />
                {result.execution_time_ms < 1000
                  ? `${result.execution_time_ms} ms`
                  : `${(result.execution_time_ms / 1000).toFixed(2)} s`}
              </span>
              {result.rows.length > 0 && (
                <button
                  onClick={() => {
                    const tsv = [
                      result.columns.join('\t'),
                      ...result.rows.map((r) => r.map((c) => (c === null ? 'NULL' : String(c))).join('\t')),
                    ].join('\n')
                    copyToClipboard(tsv, 'results')
                  }}
                  className="inline-flex items-center gap-1 px-2 py-1 text-[10px] rounded border border-border hover:bg-muted text-muted-foreground transition-colors"
                >
                  {copied === 'results' ? (
                    <Check size={10} className="text-green-500" />
                  ) : (
                    <Copy size={10} />
                  )}
                  Copier
                </button>
              )}
            </div>
          </div>

          {/* Error display */}
          {result.error && (
            <div className="p-4 bg-red-500/5">
              <pre className="text-xs text-red-500 font-mono whitespace-pre-wrap break-words">
                {result.error}
              </pre>
            </div>
          )}

          {/* Data table */}
          {result.columns.length > 0 && result.rows.length > 0 && (
            <div className="overflow-auto" style={{ maxHeight: 'calc(100vh - 520px)' }}>
              <table className="w-full text-xs">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-muted/80 backdrop-blur-sm">
                    <th className="px-3 py-2 text-left text-[10px] font-semibold text-muted-foreground border-b border-border w-10 tabular-nums">
                      #
                    </th>
                    {result.columns.map((col) => (
                      <th
                        key={col}
                        className="px-3 py-2 text-left text-[10px] font-semibold text-muted-foreground border-b border-border whitespace-nowrap"
                      >
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {result.rows.map((row, i) => (
                    <tr
                      key={i}
                      className="hover:bg-muted/40 transition-colors"
                    >
                      <td className="px-3 py-1.5 text-[10px] text-muted-foreground tabular-nums">
                        {i + 1}
                      </td>
                      {row.map((cell, j) => (
                        <td
                          key={j}
                          className="px-3 py-1.5 font-mono text-foreground whitespace-nowrap max-w-[300px] truncate"
                          title={cell === null ? 'NULL' : String(cell)}
                        >
                          {cell === null ? (
                            <span className="text-muted-foreground/50 italic">NULL</span>
                          ) : typeof cell === 'boolean' ? (
                            <span className={cell ? 'text-green-500' : 'text-red-400'}>
                              {String(cell)}
                            </span>
                          ) : (
                            String(cell)
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Empty results */}
          {!result.error && result.columns.length === 0 && (
            <div className="py-8 text-center text-xs text-muted-foreground">
              Aucun résultat retourné par la requête.
            </div>
          )}
        </div>
      )}

      {/* Quick queries */}
      <div className="border border-border rounded-lg p-4">
        <h4 className="text-xs font-semibold text-foreground mb-3">Requêtes rapides</h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {QUICK_QUERIES.map(({ label, sql }) => (
            <button
              key={label}
              onClick={() => {
                setQuery(sql)
                setResult(null)
                textareaRef.current?.focus()
              }}
              className="flex items-center gap-2 px-3 py-2 text-xs text-left rounded-md border border-border bg-background hover:bg-muted hover:border-primary/30 transition-colors group"
            >
              <Database size={11} className="text-muted-foreground group-hover:text-primary shrink-0 transition-colors" />
              <span className="text-foreground truncate">{label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
