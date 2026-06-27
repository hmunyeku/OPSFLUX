/**
 * MTOGuru — page de rapprochement MTO <-> stock/catalogue SAP.
 *
 * Affiche les groupes consolides (besoin somme par unite, rapproche d'un article
 * SAP) avec leurs lignes MTO d'origine depliables, et permet de valider/corriger
 * chaque rapprochement (apprentissage cote backend).
 */
import { useMemo, useState } from 'react'

import type { ColumnDef } from '@tanstack/react-table'
import { CheckCircle2, Package, Pencil, RefreshCw, Search } from 'lucide-react'

import { GroupedDataTable } from '@/components/ui/GroupedDataTable'
import {
  useCatalogSearch,
  useConsolidate,
  useCorrectGroup,
  useMtoBatches,
  useMtoGroups,
  useValidateGroup,
  type MtoChild,
  type MtoGroup,
} from '@/hooks/useMto'

type MtoRow = Omit<Partial<MtoGroup>, 'diameter' | 'children'> &
  Omit<Partial<MtoChild>, 'diameter'> & {
    id: string
    _child?: boolean
    diameter?: string | null
    children?: MtoRow[]
  }

const STATUT_STYLE: Record<string, { bg: string; fg: string; label: string }> = {
  'en stock': { bg: '#e6f4ea', fg: '#107c10', label: 'En stock' },
  partiel: { bg: '#fdf3e7', fg: '#bc6c00', label: 'Partiel' },
  'à commander': { bg: '#fdecea', fg: '#a01010', label: 'À commander' },
}

function StatutChip({ statut }: { statut: string }) {
  const s = STATUT_STYLE[statut] ?? { bg: '#eef2f6', fg: '#37475a', label: statut }
  return (
    <span style={{ background: s.bg, color: s.fg, padding: '2px 8px', borderRadius: 4, fontSize: 12, fontWeight: 600 }}>
      {s.label}
    </span>
  )
}

// ── Dialog de correction (recherche d'article SAP) ──────────────────────────
function CorrectDialog({ group, onClose, onApply }: {
  group: MtoGroup
  onClose: () => void
  onApply: (code: string) => void
}) {
  const [q, setQ] = useState('')
  const { data: results, isFetching } = useCatalogSearch(q)
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(10,31,51,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', width: 560, maxWidth: '92vw', borderRadius: 6, padding: 20, boxShadow: '0 12px 50px rgba(0,0,0,.35)' }}>
        <div style={{ fontWeight: 600, color: '#003366', marginBottom: 4 }}>Corriger le rapprochement</div>
        <div style={{ fontSize: 13, color: '#6b7a8d', marginBottom: 12 }}>
          {group.designation_sap ?? '(non trouvé)'} — actuel : <code>{group.article_code ?? '—'}</code>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, border: '1px solid #cdd7e2', borderRadius: 4, padding: '6px 10px' }}>
          <Search size={15} color="#8a97a8" />
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher un article (code ou désignation)…"
            style={{ border: 'none', outline: 'none', width: '100%', fontSize: 14 }} />
        </div>
        <div style={{ margin: '10px 0', maxHeight: 300, overflow: 'auto', border: '1px solid #eef3f8', borderRadius: 4 }}>
          {isFetching && <div style={{ padding: 10, color: '#8a97a8', fontSize: 13 }}>Recherche…</div>}
          {(results ?? []).map((a) => (
            <div key={a.code} onClick={() => onApply(a.code)}
              style={{ padding: '7px 11px', borderBottom: '1px solid #f0f4f8', cursor: 'pointer', fontSize: 13 }}>
              <span style={{ fontFamily: 'monospace', color: '#1a3a5c' }}>{a.code}</span> — {a.designation}
            </div>
          ))}
          {q.trim().length < 2 && <div style={{ padding: 10, color: '#8a97a8', fontSize: 13 }}>Saisissez au moins 2 caractères.</div>}
        </div>
        <button onClick={onClose} style={{ padding: '7px 14px', border: '1px solid #cdd7e2', borderRadius: 4, background: '#fff', cursor: 'pointer' }}>Fermer</button>
      </div>
    </div>
  )
}

export function MtoPage() {
  const { data: batches } = useMtoBatches()
  const [selectedBatch, setSelectedBatch] = useState<string | null>(null)
  const batchId = selectedBatch ?? batches?.[0]?.id ?? null

  const { data: groups, isLoading } = useMtoGroups(batchId)
  const [search, setSearch] = useState('')
  const validate = useValidateGroup(batchId)
  const correct = useCorrectGroup(batchId)
  const consolidate = useConsolidate()
  const [correcting, setCorrecting] = useState<MtoGroup | null>(null)

  const stats = useMemo(() => {
    const g = groups ?? []
    const by = (s: string) => g.filter((x) => x.statut === s).length
    return { total: g.length, ok: by('en stock'), warn: by('partiel'), fail: by('à commander') }
  }, [groups])

  const rows = useMemo<MtoRow[]>(
    () => (groups ?? []).map((g) => ({
      ...g,
      children: (g.children ?? []).map((c, i) => ({ id: `${g.id}-c${i}`, _child: true, ...c })),
    })),
    [groups],
  )

  const columns = useMemo<ColumnDef<MtoRow, unknown>[]>(() => [
    {
      id: 'article', header: 'Article',
      cell: ({ row }) => row.original._child
        ? <span style={{ color: '#6b7a8d' }}>↳ {row.original.line_num ?? row.original.row ?? ''} {row.original.mark ?? ''}</span>
        : <span style={{ fontFamily: 'monospace', color: '#1a3a5c' }}>{row.original.article_code ?? '—'}</span>,
    },
    {
      id: 'designation', header: 'Désignation SAP',
      cell: ({ row }) => row.original._child
        ? <span style={{ color: '#6b7a8d' }}>{row.original.description}</span>
        : <span style={{ fontStyle: row.original.found ? 'normal' : 'italic', color: row.original.found ? 'inherit' : '#8a97a8' }}>{row.original.designation_sap ?? '(non trouvé)'}</span>,
    },
    {
      id: 'famille', header: 'Famille',
      cell: ({ row }) => row.original._child ? null : <span style={{ fontSize: 11, color: '#37475a' }}>{row.original.famille ?? ''}</span>,
    },
    {
      id: 'besoin', header: 'Besoin',
      cell: ({ row }) => row.original._child
        ? <span style={{ color: '#6b7a8d' }}>{row.original.qte ?? ''}</span>
        : <span>{row.original.besoin}&nbsp;{row.original.unite ?? ''}{row.original.unit_check ? ' ⚠' : ''}</span>,
    },
    {
      id: 'couverture', header: 'Couverture',
      cell: ({ row }) => row.original._child ? null : <span style={{ fontVariantNumeric: 'tabular-nums' }}>{row.original.dispo}/{row.original.besoin}</span>,
    },
    {
      id: 'statut', header: 'Statut',
      cell: ({ row }) => (row.original._child || !row.original.statut) ? null : <StatutChip statut={row.original.statut} />,
    },
    {
      id: 'confiance', header: 'Confiance',
      cell: ({ row }) => row.original._child ? null
        : row.original.verification_status === 'verified'
          ? <span style={{ color: '#107c10', fontWeight: 600, fontSize: 12 }}>✓ Validé</span>
          : <span style={{ fontSize: 12, color: '#6b7a8d' }}>{row.original.confidence ?? ''} · {row.original.nb_lignes ?? 0} l.</span>,
    },
    {
      id: 'actions', header: '',
      cell: ({ row }) => {
        if (row.original._child) return null
        const g = row.original as MtoGroup
        return (
          <div style={{ display: 'flex', gap: 4 }}>
            {g.found && (
              <button title="Valider" onClick={() => validate.mutate(g.id)} disabled={validate.isPending}
                style={{ border: '1px solid #107c10', color: '#107c10', background: '#fff', borderRadius: 4, padding: '2px 7px', cursor: 'pointer' }}>
                <CheckCircle2 size={15} />
              </button>
            )}
            <button title="Corriger" onClick={() => setCorrecting(g)}
              style={{ border: '1px solid #cdd7e2', color: '#37475a', background: '#fff', borderRadius: 4, padding: '2px 7px', cursor: 'pointer' }}>
              <Pencil size={15} />
            </button>
          </div>
        )
      },
    },
  ], [validate])

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        <Package size={20} color="#003366" />
        <h1 style={{ fontSize: 18, fontWeight: 600, color: '#003366', margin: 0 }}>Rapprochement MTO ↔ stock SAP</h1>
        <select value={batchId ?? ''} onChange={(e) => setSelectedBatch(e.target.value || null)}
          style={{ marginLeft: 'auto', padding: '6px 10px', border: '1px solid #cdd7e2', borderRadius: 4 }}>
          {(batches ?? []).map((b) => (
            <option key={b.id} value={b.id}>{b.label || b.filename || b.id.slice(0, 8)}</option>
          ))}
        </select>
        {batchId && (
          <button onClick={() => consolidate.mutate(batchId)} disabled={consolidate.isPending}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', border: '1px solid #0066b8', color: '#0066b8', background: '#fff', borderRadius: 4, cursor: 'pointer' }}>
            <RefreshCw size={15} /> Re-consolider
          </button>
        )}
      </div>

      <div style={{ display: 'flex', gap: 16, marginBottom: 12, fontSize: 13 }}>
        <span><b>{stats.total}</b> groupes</span>
        <span style={{ color: '#107c10' }}><b>{stats.ok}</b> en stock</span>
        <span style={{ color: '#bc6c00' }}><b>{stats.warn}</b> partiel</span>
        <span style={{ color: '#a01010' }}><b>{stats.fail}</b> à commander</span>
      </div>

      <GroupedDataTable<MtoRow>
        data={rows}
        columns={columns}
        getSubRows={(row) => row.children}
        isLoading={isLoading}
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Rechercher article, désignation, Ø…"
        emptyIcon={Package}
        emptyTitle="Aucun rapprochement — importez un MTO puis consolidez"
      />

      {correcting && (
        <CorrectDialog
          group={correcting}
          onClose={() => setCorrecting(null)}
          onApply={(code) => { correct.mutate({ groupId: correcting.id, articleCode: code }); setCorrecting(null) }}
        />
      )}
    </div>
  )
}
