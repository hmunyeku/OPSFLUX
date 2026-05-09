import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { TiersFilters, type TiersFilterState } from './TiersFilters'
import type { Tiers } from './types'

type SortKey = 'name' | 'type' | 'ca' | 'status'
type SortDir = 'asc' | 'desc'

interface Props {
  rows: Tiers[]
  isLoading?: boolean
  onOpen: (id: string) => void
  onCreate: () => void
}

const TYPE_LABEL: Record<Tiers['type'], string> = {
  client: 'Client final',
  subcontractor: 'Sous-traitant',
  partner: 'Partenaire',
  supplier: 'Fournisseur',
}

const STATUS_CHIP: Record<Tiers['status'], { tone: string; label: string }> = {
  active:  { tone: 'success', label: '● Actif' },
  pending: { tone: 'warn',    label: '● En attente' },
  draft:   { tone: '',        label: '● Brouillon' },
  archived:{ tone: '',        label: '● Archivé' },
}

const fmtEUR = new Intl.NumberFormat('fr-FR', {
  style: 'currency', currency: 'EUR', maximumFractionDigits: 0,
})

export function TiersList({ rows, isLoading, onOpen, onCreate }: Props) {
  const [filters, setFilters] = useState<TiersFilterState>({ q: '', type: 'all', status: 'all' })
  const [sortKey, setSortKey] = useState<SortKey>('name')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const filtered = useMemo(() => {
    const q = filters.q.trim().toLowerCase()
    return rows
      .filter(r => filters.type === 'all' || r.type === filters.type)
      .filter(r => filters.status === 'all' || r.status === filters.status)
      .filter(r => !q || r.name.toLowerCase().includes(q) || r.siret?.includes(q))
      .sort((a, b) => {
        const dir = sortDir === 'asc' ? 1 : -1
        switch (sortKey) {
          case 'name':   return a.name.localeCompare(b.name) * dir
          case 'type':   return TYPE_LABEL[a.type].localeCompare(TYPE_LABEL[b.type]) * dir
          case 'ca':     return ((a.caAnnual ?? 0) - (b.caAnnual ?? 0)) * dir
          case 'status': return a.status.localeCompare(b.status) * dir
        }
      })
  }, [rows, filters, sortKey, sortDir])

  const toggleSort = (k: SortKey) => {
    if (k === sortKey) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(k); setSortDir('asc') }
  }
  const ariaSort = (k: SortKey) =>
    sortKey === k ? (sortDir === 'asc' ? 'ascending' : 'descending') : undefined

  const allSelected = filtered.length > 0 && filtered.every(r => selected.has(r.id))
  const toggleAll = () => {
    setSelected(prev => {
      const next = new Set(prev)
      if (allSelected) filtered.forEach(r => next.delete(r.id))
      else filtered.forEach(r => next.add(r.id))
      return next
    })
  }
  const toggleOne = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  // KPI strip — computed from filtered rows
  const kpi = useMemo(() => {
    const total = filtered.length
    const active = filtered.filter(r => r.status === 'active').length
    const ca = filtered.reduce((sum, r) => sum + (r.caAnnual ?? 0), 0)
    const newThisMonth = filtered.filter(r => isThisMonth(r.createdAt)).length
    return { total, active, ca, newThisMonth }
  }, [filtered])

  return (
    <div className="tiers-list" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Header */}
      <header style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div>
          <h1 style={{ fontFamily: 'Archivo', fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em', margin: 0 }}>
            Tiers
          </h1>
          <p style={{ fontSize: 13, color: 'var(--muted)', margin: '2px 0 0' }}>
            {filtered.length} tiers · {selected.size > 0 && <strong>{selected.size} sélectionnés</strong>}
          </p>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          {selected.size > 0 && (
            <Button variant="secondary" onClick={() => setSelected(new Set())}>
              Désélectionner ({selected.size})
            </Button>
          )}
          <Button variant="secondary">Importer</Button>
          <Button variant="primary" onClick={onCreate}>+ Nouveau tiers</Button>
        </div>
      </header>

      {/* KPI strip */}
      <div className="kpi-pp-grid" data-cols="4">
        <div className="kpi-pp">
          <div className="kpi-pp__label">Total tiers</div>
          <div className="kpi-pp__value-row">
            <span className="kpi-pp__value">{kpi.total}</span>
          </div>
        </div>
        <div className="kpi-pp">
          <div className="kpi-pp__label">Actifs</div>
          <div className="kpi-pp__value-row">
            <span className="kpi-pp__value">{kpi.active}</span>
            <span className="kpi-pp__unit">/ {kpi.total}</span>
          </div>
        </div>
        <div className="kpi-pp">
          <div className="kpi-pp__label">CA cumulé</div>
          <div className="kpi-pp__value-row">
            <span className="kpi-pp__value">{(kpi.ca / 1_000_000).toFixed(1)}</span>
            <span className="kpi-pp__unit">M€</span>
          </div>
        </div>
        <div className="kpi-pp">
          <div className="kpi-pp__label">Nouveaux ce mois</div>
          <div className="kpi-pp__value-row">
            <span className="kpi-pp__value">{kpi.newThisMonth}</span>
            <span className="kpi-pp__delta" data-trend="up">+{kpi.newThisMonth}</span>
          </div>
        </div>
      </div>

      {/* Filters */}
      <TiersFilters value={filters} onChange={setFilters} />

      {/* Table */}
      <div className="card-pp">
        <div className="card-pp__body card-pp__body--tight">
          <div className="tbl-pp-scroll" style={{ maxHeight: 600, border: 0 }}>
            <table className="tbl-pp" data-density="cozy" data-sticky-header>
              <thead>
                <tr>
                  <th style={{ width: 36 }}>
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleAll}
                      aria-label="Tout sélectionner"
                    />
                  </th>
                  <th data-sortable aria-sort={ariaSort('name')}   onClick={() => toggleSort('name')}>Nom</th>
                  <th data-sortable aria-sort={ariaSort('type')}   onClick={() => toggleSort('type')}>Type</th>
                  <th>SIRET</th>
                  <th className="tbl-cell-num" data-sortable aria-sort={ariaSort('ca')} onClick={() => toggleSort('ca')}>
                    CA annuel
                  </th>
                  <th data-sortable aria-sort={ariaSort('status')} onClick={() => toggleSort('status')}>Statut</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {isLoading && Array.from({ length: 8 }).map((_, i) => (
                  <tr key={`sk-${i}`} data-state="loading">
                    <td colSpan={7}>...</td>
                  </tr>
                ))}

                {!isLoading && filtered.length === 0 && (
                  <tr>
                    <td className="tbl-empty" colSpan={7}>
                      <strong>Aucun tiers ne correspond à ces filtres</strong>
                      Ajuste tes filtres ou crée un nouveau tiers pour démarrer.
                    </td>
                  </tr>
                )}

                {!isLoading && filtered.map(row => {
                  const chip = STATUS_CHIP[row.status]
                  const isSel = selected.has(row.id)
                  return (
                    <tr
                      key={row.id}
                      data-clickable
                      data-selected={isSel || undefined}
                      onClick={() => onOpen(row.id)}
                    >
                      <td onClick={e => { e.stopPropagation(); toggleOne(row.id) }}>
                        <input
                          type="checkbox"
                          checked={isSel}
                          onChange={() => toggleOne(row.id)}
                          aria-label={`Sélectionner ${row.name}`}
                        />
                      </td>
                      <td><strong>{row.name}</strong></td>
                      <td>{TYPE_LABEL[row.type]}</td>
                      <td className="tbl-cell-mono">{row.siret ?? '—'}</td>
                      <td className="tbl-cell-num">
                        {row.caAnnual != null ? fmtEUR.format(row.caAnnual) : '—'}
                      </td>
                      <td>
                        <span className={`chip ${chip.tone ? `chip-${chip.tone}` : ''}`}>{chip.label}</span>
                      </td>
                      <td className="tbl-cell-actions">
                        <Button
                          variant="tertiary"
                          size="sm"
                          className="btn-icon"
                          aria-label="Actions"
                          onClick={e => { e.stopPropagation(); /* open menu */ }}
                        >⋯</Button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              {!isLoading && filtered.length > 0 && (
                <tfoot>
                  <tr>
                    <td colSpan={7}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span>{filtered.length} sur {rows.length} tiers</span>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <Button variant="secondary" size="sm" disabled>‹</Button>
                          <Button variant="secondary" size="sm">›</Button>
                        </div>
                      </div>
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}

function isThisMonth(iso: string) {
  const d = new Date(iso); const now = new Date()
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
}
