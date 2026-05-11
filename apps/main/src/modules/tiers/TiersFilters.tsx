import { Button } from '@/components/ui/Button'
import type { Tiers } from './types'

export interface TiersFilterState {
  q: string
  type: 'all' | Tiers['type']
  status: 'all' | Tiers['status']
}

interface Props {
  value: TiersFilterState
  onChange: (next: TiersFilterState) => void
}

export function TiersFilters({ value, onChange }: Props) {
  const update = <K extends keyof TiersFilterState>(k: K, v: TiersFilterState[K]) =>
    onChange({ ...value, [k]: v })

  const isFiltered = value.q || value.type !== 'all' || value.status !== 'all'

  return (
    <div
      className="card-pp"
      style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', flexDirection: 'row' }}
    >
      <input
        type="search"
        value={value.q}
        onChange={e => update('q', e.target.value)}
        placeholder="Rechercher par nom ou SIRET…"
        style={{
          flex: 1,
          height: 32,
          padding: '0 12px',
          border: '1px solid var(--border)',
          borderRadius: 6,
          fontSize: 13,
          fontFamily: 'inherit',
          background: 'var(--bg)',
        }}
      />

      <select
        value={value.type}
        onChange={e => update('type', e.target.value as TiersFilterState['type'])}
        style={selectStyle}
      >
        <option value="all">Tous types</option>
        <option value="client">Clients finaux</option>
        <option value="subcontractor">Sous-traitants</option>
        <option value="partner">Partenaires</option>
        <option value="supplier">Fournisseurs</option>
      </select>

      <select
        value={value.status}
        onChange={e => update('status', e.target.value as TiersFilterState['status'])}
        style={selectStyle}
      >
        <option value="all">Tous statuts</option>
        <option value="active">Actifs</option>
        <option value="pending">En attente</option>
        <option value="draft">Brouillons</option>
        <option value="archived">Archivés</option>
      </select>

      {isFiltered && (
        <Button
          variant="tertiary"
          size="sm"
          onClick={() => onChange({ q: '', type: 'all', status: 'all' })}
        >
          Réinitialiser
        </Button>
      )}
    </div>
  )
}

const selectStyle: React.CSSProperties = {
  height: 32,
  padding: '0 28px 0 10px',
  border: '1px solid var(--border)',
  borderRadius: 6,
  fontSize: 13,
  fontFamily: 'inherit',
  background: 'var(--bg)',
  color: 'var(--fg)',
  cursor: 'pointer',
}
