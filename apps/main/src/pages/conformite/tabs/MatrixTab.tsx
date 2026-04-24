/**
 * Compliance matrix tab — rows = owners (users / tier contacts / tiers),
 * columns = compliance types. Cells show color-coded status (valid /
 * expiring / expired / missing). Click a cell to open the existing
 * ComplianceRecord detail panel, or prompt to create one when the
 * owner has no record of that type yet.
 *
 * This closes the MODULE_ANALYSIS top-5 functional item §1:
 *   "Matrice conformité (asset × compliance_type) — gros gain UX"
 */
import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Loader2, Search, AlertTriangle, CheckCircle2, CircleAlert, Clock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useUIStore } from '@/stores/uiStore'
import { useDebounce } from '@/hooks/useDebounce'
import {
  useComplianceMatrix,
  type ComplianceMatrixCell,
} from '@/hooks/useConformite'

type OwnerType = 'user' | 'tier_contact' | 'tier'

const STATUS_STYLE: Record<ComplianceMatrixCell['status'], { cls: string; label: string; Icon: typeof CheckCircle2 }> = {
  valid: { cls: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30', label: 'Valide', Icon: CheckCircle2 },
  expiring: { cls: 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30', label: 'Expire bientôt', Icon: Clock },
  expired: { cls: 'bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30', label: 'Expiré', Icon: AlertTriangle },
  missing: { cls: 'bg-muted text-muted-foreground border-border', label: 'Manquant', Icon: CircleAlert },
  pending: { cls: 'bg-sky-500/15 text-sky-700 dark:text-sky-400 border-sky-500/30', label: 'En attente', Icon: Clock },
  rejected: { cls: 'bg-rose-500/15 text-rose-700 dark:text-rose-400 border-rose-500/30', label: 'Rejeté', Icon: AlertTriangle },
}

const OWNER_TYPE_LABELS: Record<OwnerType, string> = {
  user: 'Utilisateurs',
  tier_contact: 'Contacts tiers',
  tier: 'Tiers',
}

export function MatrixTab() {
  const { t } = useTranslation()
  void t // reserved for future i18n
  const [ownerType, setOwnerType] = useState<OwnerType>('user')
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search, 250)
  const [page, setPage] = useState(1)
  const pageSize = 50
  const openDynamicPanel = useUIStore((s) => s.openDynamicPanel)

  const { data, isLoading, isFetching } = useComplianceMatrix({
    owner_type: ownerType,
    search: debouncedSearch || undefined,
    page,
    page_size: pageSize,
  })

  const total = data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  // Pre-compute per-column counts (how many owners are missing / expiring / expired)
  // so the column header can show a small density indicator at a glance.
  const columnStats = useMemo(() => {
    if (!data) return {}
    const stats: Record<string, { missing: number; expired: number; expiring: number; valid: number }> = {}
    for (const ct of data.compliance_types) {
      stats[ct.id] = { missing: 0, expired: 0, expiring: 0, valid: 0 }
    }
    for (const row of data.rows) {
      for (const [typeId, cell] of Object.entries(row.cells)) {
        const s = stats[typeId]
        if (!s) continue
        if (cell.status === 'missing') s.missing++
        else if (cell.status === 'expired') s.expired++
        else if (cell.status === 'expiring') s.expiring++
        else if (cell.status === 'valid') s.valid++
      }
    }
    return stats
  }, [data])

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar: owner-type selector + search */}
      <div className="flex items-center gap-2 p-3 border-b border-border bg-muted/20 flex-wrap">
        <div className="inline-flex rounded-md border border-border overflow-hidden">
          {(['user', 'tier_contact', 'tier'] as const).map((ot) => (
            <button
              key={ot}
              onClick={() => { setOwnerType(ot); setPage(1) }}
              className={cn(
                'px-3 h-8 text-xs transition-colors',
                ownerType === ot
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-background text-foreground hover:bg-muted',
              )}
            >
              {OWNER_TYPE_LABELS[ot]}
            </button>
          ))}
        </div>

        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <input
            type="search"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            placeholder="Rechercher…"
            className="h-8 pl-8 pr-3 text-xs rounded-md border border-border bg-background focus:outline-none focus:border-primary/40 min-w-[240px]"
          />
        </div>

        <div className="ml-auto text-[11px] text-muted-foreground tabular-nums">
          {isFetching ? <Loader2 size={11} className="animate-spin inline mr-1" /> : null}
          {total} {OWNER_TYPE_LABELS[ownerType].toLowerCase()}
        </div>
      </div>

      {/* Matrix body with sticky header + sticky first column */}
      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 size={16} className="animate-spin text-muted-foreground" />
          </div>
        ) : !data || data.rows.length === 0 || data.compliance_types.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-sm text-muted-foreground">
            <CircleAlert size={24} className="mb-2 text-muted-foreground/50" />
            {data?.compliance_types.length === 0
              ? "Aucun type de conformité actif pour cette entité."
              : "Aucun enregistrement."}
          </div>
        ) : (
          <table className="text-xs border-separate border-spacing-0 min-w-full">
            <thead className="sticky top-0 z-20 bg-background">
              <tr>
                <th className="sticky left-0 z-30 bg-background border-b border-r border-border px-3 py-2 text-left font-semibold text-foreground min-w-[220px]">
                  {OWNER_TYPE_LABELS[ownerType]}
                </th>
                {data.compliance_types.map((ct) => {
                  const s = columnStats[ct.id]
                  return (
                    <th key={ct.id} className="border-b border-border px-2 py-2 text-left font-medium text-foreground align-top min-w-[140px] max-w-[180px]">
                      <div className="truncate" title={ct.name}>{ct.name}</div>
                      <div className="mt-0.5 text-[9px] text-muted-foreground uppercase tracking-wide">
                        {ct.category}
                      </div>
                      {s && (
                        <div className="mt-1 flex items-center gap-1 text-[9px] tabular-nums">
                          {s.expired > 0 && <span className="text-red-600">✗{s.expired}</span>}
                          {s.expiring > 0 && <span className="text-amber-600">⏰{s.expiring}</span>}
                          {s.missing > 0 && <span className="text-muted-foreground">—{s.missing}</span>}
                          {s.valid > 0 && <span className="text-emerald-600">✓{s.valid}</span>}
                        </div>
                      )}
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row) => (
                <tr key={row.owner_id} className="hover:bg-muted/30">
                  <td className="sticky left-0 z-10 bg-background border-b border-r border-border px-3 py-2 text-foreground">
                    <button
                      type="button"
                      className="text-left hover:underline"
                      onClick={() => {
                        const module = ownerType === 'user' ? 'users'
                          : ownerType === 'tier' ? 'tiers'
                          : 'tiers'  // contacts open under tiers panel today
                        openDynamicPanel({ type: 'detail', module, id: row.owner_id })
                      }}
                    >
                      <span className="font-medium block truncate max-w-[220px]">{row.owner_name}</span>
                      {row.owner_extra && (
                        <span className="text-[10px] text-muted-foreground block truncate max-w-[220px]">
                          {row.owner_extra}
                        </span>
                      )}
                    </button>
                  </td>
                  {data.compliance_types.map((ct) => {
                    const cell = row.cells[ct.id] ?? { status: 'missing' as const, expires_at: null, record_id: null }
                    const s = STATUS_STYLE[cell.status]
                    const Icon = s.Icon
                    const clickable = Boolean(cell.record_id)
                    return (
                      <td
                        key={ct.id}
                        className={cn('border-b border-border p-1 align-middle')}
                      >
                        <button
                          type="button"
                          disabled={!clickable}
                          onClick={() => {
                            if (cell.record_id) {
                              openDynamicPanel({ type: 'detail', module: 'compliance-records', id: cell.record_id })
                            }
                          }}
                          title={
                            cell.expires_at
                              ? `${s.label} — expire le ${new Date(cell.expires_at).toLocaleDateString('fr-FR')}`
                              : s.label
                          }
                          className={cn(
                            'flex items-center gap-1.5 h-7 w-full px-2 rounded border text-[11px] transition-colors',
                            s.cls,
                            clickable ? 'hover:brightness-110 cursor-pointer' : 'cursor-default opacity-70',
                          )}
                        >
                          <Icon size={10} className="shrink-0" />
                          <span className="truncate">{s.label}</span>
                          {cell.expires_at && (
                            <span className="ml-auto text-[9px] opacity-70 tabular-nums">
                              {new Date(cell.expires_at).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' })}
                            </span>
                          )}
                        </button>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {total > pageSize && (
        <div className="flex items-center justify-between p-3 border-t border-border text-xs">
          <span className="text-muted-foreground">
            {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} sur {total}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="gl-button gl-button-sm gl-button-default"
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
            >
              Précédent
            </button>
            <span className="tabular-nums">Page {page} / {totalPages}</span>
            <button
              type="button"
              className="gl-button gl-button-sm gl-button-default"
              disabled={page >= totalPages}
              onClick={() => setPage(page + 1)}
            >
              Suivant
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
