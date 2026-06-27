/**
 * MTOGuru — page de rapprochement MTO ↔ stock/catalogue SAP.
 *
 * Réécrite sur le design system OpsFlux (gabarit PackLog / MOC) :
 *   - PanelHeader + ToolbarButton "Importer" (perm mto.requirement.import)
 *   - PageNavBar : onglets Rapprochement / Catalogue
 *   - Toolbar : recherche + filtre statut + sélecteur de batch + ProjectPicker
 *   - GroupedDataTable : colonnes en tokens Tailwind, badges de statut
 *     (BadgeCell), lignes d'origine dépliables (children), clic => DynamicPanel
 *   - DynamicPanel de détail via le registry (cf. MtoPanels.tsx)
 *   - useFilterPersistence pour mémoriser batch / statut / projet
 *
 * Aucune couleur hex en dur, aucun style inline décoratif, aucun dialog
 * custom : tout passe par les composants OpsFlux et les classes de tokens.
 */
import { useMemo, useRef, useState } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import {
  Boxes,
  CheckCircle2,
  FileUp,
  Layers,
  Package,
  RefreshCw,
  Search,
} from 'lucide-react'

import { PanelHeader, PanelContent, ToolbarButton } from '@/components/layout/PanelHeader'
import { renderRegisteredPanel } from '@/components/layout/DetachedPanelRenderer'
import { PageNavBar } from '@/components/ui/Tabs'
import { GroupedDataTable } from '@/components/ui/GroupedDataTable'
import { BadgeCell } from '@/components/ui/DataTable'
import { EmptyState } from '@/components/ui/EmptyState'
import { useToast } from '@/components/ui/Toast'
import { useUIStore } from '@/stores/uiStore'
import { usePermission } from '@/hooks/usePermission'
import { useFilterPersistence } from '@/hooks/useFilterPersistence'
import { useDebounce } from '@/hooks/useDebounce'
import { ProjectPicker } from '@/components/shared/ProjectPicker'
import {
  useCatalogSearch,
  useConsolidate,
  useImportMto,
  useMtoBatches,
  useMtoGroups,
  type MtoChild,
  type MtoGroup,
} from '@/hooks/useMto'
import { mtoBatchLabel, mtoStatusLabel, mtoStatusTextClass, mtoStatusVariant } from '@/services/mtoService'
// Effet de bord : enregistre le renderer du panneau MTO dans le registry.
import './MtoPanels'

type MtoTab = 'matching' | 'catalogue'

/**
 * Ligne de table : un groupe (parent) OU une ligne d'origine (child).
 * Omit sur `diameter`/`children` pour réconcilier `string | null` (groupe)
 * et `string | undefined` (child) sans conflit de types.
 */
type MtoRow = Omit<Partial<MtoGroup>, 'diameter' | 'children'> &
  Omit<Partial<MtoChild>, 'diameter'> & {
    id: string
    _child?: boolean
    diameter?: string | null
    children?: MtoRow[]
  }

/** État de filtre persisté (localStorage + DB) sous la clé mto.list.view. */
interface MtoListView {
  batchId: string | null
  statut: string
  projectId: string | null
}

const DEFAULT_VIEW: MtoListView = { batchId: null, statut: '', projectId: null }

const STATUS_FILTER_OPTIONS = [
  { value: '', label: 'Tous les statuts' },
  { value: 'en stock', label: 'En stock' },
  { value: 'partiel', label: 'Partiel' },
  { value: 'à commander', label: 'À commander' },
]

export function MtoPage() {
  const { hasPermission } = usePermission()
  const dynamicPanel = useUIStore((s) => s.dynamicPanel)
  const panelMode = useUIStore((s) => s.dynamicPanelMode)

  const [activeTab, setActiveTab] = useState<MtoTab>('matching')
  const [view, setView] = useFilterPersistence<MtoListView>('mto.list.view', DEFAULT_VIEW)

  const canImport = hasPermission('mto.requirement.import') || hasPermission('mto.admin')

  // Le panneau plein-écran prend toute la zone : on cache la liste à côté.
  const isFullPanel =
    panelMode === 'full' && dynamicPanel !== null && dynamicPanel.module === 'mto'

  const tabItems = useMemo(
    () => [
      { id: 'matching' as const, label: 'Rapprochement', icon: Layers },
      { id: 'catalogue' as const, label: 'Catalogue', icon: Boxes },
    ],
    [],
  )

  return (
    <div className="flex h-full">
      {!isFullPanel && (
        <div className="flex flex-1 min-w-0 flex-col overflow-hidden">
          <PanelHeader
            icon={Package}
            title="MTOGuru"
            subtitle="Rapprochement MTO ↔ stock SAP"
          >
            {canImport && activeTab === 'matching' && (
              <ImportButton
                projectId={view.projectId}
                onImported={(batchId) => setView((v) => ({ ...v, batchId }))}
              />
            )}
          </PanelHeader>

          <PageNavBar items={tabItems} activeId={activeTab} onTabChange={setActiveTab} />

          <PanelContent scroll={false}>
            {activeTab === 'matching' && <MatchingTab view={view} setView={setView} />}
            {activeTab === 'catalogue' && <CatalogueTab />}
          </PanelContent>
        </div>
      )}

      {dynamicPanel?.module === 'mto' && renderRegisteredPanel(dynamicPanel)}
    </div>
  )
}

// ── Bouton d'import (file picker → POST /import/mto) ───────────────────────

function ImportButton({
  projectId,
  onImported,
}: {
  projectId: string | null
  onImported: (batchId: string) => void
}) {
  const { toast } = useToast()
  const importMto = useImportMto()
  const inputRef = useRef<HTMLInputElement | null>(null)

  return (
    <>
      <ToolbarButton
        icon={FileUp}
        label={importMto.isPending ? 'Import…' : 'Importer'}
        variant="primary"
        disabled={importMto.isPending}
        onClick={() => inputRef.current?.click()}
      />
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        className="hidden"
        onChange={async (e) => {
          const file = e.target.files?.[0]
          if (!file) return
          try {
            const batch = await importMto.mutateAsync({ file, projectId })
            toast({ title: `MTO importé : ${mtoBatchLabel(batch)}`, variant: 'success' })
            onImported(batch.id)
          } catch {
            toast({ title: "Échec de l'import MTO", variant: 'error' })
          } finally {
            e.target.value = ''
          }
        }}
      />
    </>
  )
}

// ── Onglet Rapprochement ──────────────────────────────────────────────────

function MatchingTab({
  view,
  setView,
}: {
  view: MtoListView
  setView: (v: MtoListView | ((prev: MtoListView) => MtoListView)) => void
}) {
  const { toast } = useToast()
  const openDynamicPanel = useUIStore((s) => s.openDynamicPanel)
  const [search, setSearch] = useState('')

  const { data: batches } = useMtoBatches(view.projectId)
  // Batch effectif : sélection explicite, sinon le 1er de la liste.
  const batchId = view.batchId ?? batches?.[0]?.id ?? null

  const { data: groups, isLoading } = useMtoGroups(batchId, view.statut || null)
  const consolidate = useConsolidate()

  const stats = useMemo(() => {
    const g = groups ?? []
    const by = (s: string) => g.filter((x) => x.statut === s).length
    return {
      total: g.length,
      ok: by('en stock'),
      warn: by('partiel'),
      fail: by('à commander'),
    }
  }, [groups])

  const rows = useMemo<MtoRow[]>(
    () =>
      (groups ?? []).map((g) => ({
        ...g,
        children: (g.children ?? []).map((c, i) => ({ id: `${g.id}-c${i}`, _child: true, ...c })),
      })),
    [groups],
  )

  const columns = useMemo<ColumnDef<MtoRow, unknown>[]>(
    () => [
      {
        id: 'article',
        header: 'Article',
        cell: ({ row }) =>
          row.original._child ? (
            <span className="text-muted-foreground">
              ↳ {row.original.line_num ?? row.original.row ?? ''} {row.original.mark ?? ''}
            </span>
          ) : (
            <span className="font-mono text-xs text-primary">
              {row.original.article_code ?? '—'}
            </span>
          ),
      },
      {
        id: 'designation',
        header: 'Désignation SAP',
        cell: ({ row }) =>
          row.original._child ? (
            <span className="text-muted-foreground">{row.original.description}</span>
          ) : row.original.found ? (
            <span className="text-foreground">{row.original.designation_sap ?? '—'}</span>
          ) : (
            <span className="italic text-muted-foreground">(non trouvé)</span>
          ),
      },
      {
        id: 'famille',
        header: 'Famille',
        cell: ({ row }) =>
          row.original._child ? null : (
            <span className="text-xs text-muted-foreground">{row.original.famille ?? ''}</span>
          ),
      },
      {
        id: 'besoin',
        header: 'Besoin',
        cell: ({ row }) =>
          row.original._child ? (
            <span className="tabular-nums text-muted-foreground">{row.original.qte ?? ''}</span>
          ) : (
            <span className="tabular-nums">
              {row.original.besoin}&nbsp;{row.original.unite ?? ''}
              {row.original.unit_check ? (
                <span className="ml-1 text-warning" title="Unités hétérogènes">
                  ⚠
                </span>
              ) : null}
            </span>
          ),
      },
      {
        id: 'couverture',
        header: 'Couverture',
        cell: ({ row }) =>
          row.original._child ? null : (
            <span className={`tabular-nums ${mtoStatusTextClass(row.original.statut)}`}>
              {row.original.dispo}/{row.original.besoin}
            </span>
          ),
      },
      {
        id: 'statut',
        header: 'Statut',
        cell: ({ row }) =>
          row.original._child || !row.original.statut ? null : (
            <BadgeCell
              value={mtoStatusLabel(row.original.statut)}
              variant={mtoStatusVariant(row.original.statut)}
            />
          ),
      },
      {
        id: 'confiance',
        header: 'Confiance',
        cell: ({ row }) => {
          if (row.original._child) return null
          if (row.original.verification_status === 'verified') {
            return (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-success">
                <CheckCircle2 size={13} /> Validé
              </span>
            )
          }
          return (
            <span className="text-xs text-muted-foreground">
              {row.original.confidence ?? ''} · {row.original.nb_lignes ?? 0} l.
            </span>
          )
        },
      },
    ],
    [],
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Toolbar : batch + statut + projet + KPIs + re-consolider. */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2">
        <select
          value={batchId ?? ''}
          onChange={(e) => setView((v) => ({ ...v, batchId: e.target.value || null }))}
          className="gl-form-input h-7 text-xs"
          title="Lot d'import MTO"
        >
          {(batches ?? []).length === 0 && <option value="">Aucun lot</option>}
          {(batches ?? []).map((b) => (
            <option key={b.id} value={b.id}>
              {mtoBatchLabel(b)}
              {b.project_name ? ` — ${b.project_name}` : ''}
            </option>
          ))}
        </select>

        <select
          value={view.statut}
          onChange={(e) => setView((v) => ({ ...v, statut: e.target.value }))}
          className="gl-form-input h-7 text-xs"
          title="Filtrer par statut"
        >
          {STATUS_FILTER_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>

        <div className="min-w-[200px]">
          <ProjectPicker
            value={view.projectId}
            onChange={(pid) => setView((v) => ({ ...v, projectId: pid, batchId: null }))}
            placeholder="Tous les projets"
            clearable
          />
        </div>

        {/* KPIs compacts (tokens, pas de hex). */}
        <div className="ml-auto flex flex-wrap items-center gap-3 text-xs">
          <span className="text-muted-foreground">
            <b className="text-foreground tabular-nums">{stats.total}</b> groupes
          </span>
          <span className={mtoStatusTextClass('en stock')}>
            <b className="tabular-nums">{stats.ok}</b> en stock
          </span>
          <span className={mtoStatusTextClass('partiel')}>
            <b className="tabular-nums">{stats.warn}</b> partiel
          </span>
          <span className={mtoStatusTextClass('à commander')}>
            <b className="tabular-nums">{stats.fail}</b> à commander
          </span>
          {batchId && (
            <button
              type="button"
              onClick={async () => {
                try {
                  await consolidate.mutateAsync(batchId)
                  toast({ title: 'Consolidation relancée', variant: 'success' })
                } catch {
                  toast({ title: 'Consolidation impossible', variant: 'error' })
                }
              }}
              disabled={consolidate.isPending}
              className="btn-sm btn-secondary"
            >
              <RefreshCw size={13} className={consolidate.isPending ? 'animate-spin' : undefined} />
              <span className="hidden sm:inline">Re-consolider</span>
            </button>
          )}
        </div>
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
        onRowClick={(row) => {
          if (row._child) return
          openDynamicPanel({
            type: 'detail',
            module: 'mto',
            id: row.id,
            meta: { batchId },
          })
        }}
      />
    </div>
  )
}

// ── Onglet Catalogue (recherche SAP) ──────────────────────────────────────

function CatalogueTab() {
  const [search, setSearch] = useState('')
  const debounced = useDebounce(search, 250)
  const { data: results, isFetching } = useCatalogSearch(debounced)

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-b border-border px-4 py-2">
        <div className="flex flex-1 items-center gap-2 rounded-md border border-border bg-background px-2.5 py-1.5">
          <Search size={14} className="shrink-0 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher un article SAP (code ou désignation)…"
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/60"
          />
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {search.trim().length < 2 ? (
          <EmptyState
            icon={Boxes}
            title="Recherche catalogue SAP"
            description="Saisissez au moins 2 caractères pour rechercher un article."
          />
        ) : isFetching ? (
          <p className="px-4 py-3 text-sm text-muted-foreground">Recherche…</p>
        ) : (results ?? []).length === 0 ? (
          <EmptyState icon={Boxes} title="Aucun article trouvé" size="compact" />
        ) : (
          <table className="w-full text-xs">
            <thead className="sticky top-0 z-10 border-b border-border bg-chrome text-muted-foreground">
              <tr>
                <th className="px-4 py-1.5 text-left font-medium">Code</th>
                <th className="px-4 py-1.5 text-left font-medium">Désignation</th>
                <th className="px-4 py-1.5 text-left font-medium">Famille</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {(results ?? []).map((a) => (
                <tr key={a.id} className="hover:bg-muted/20">
                  <td className="px-4 py-1.5 font-mono text-primary">{a.code}</td>
                  <td className="px-4 py-1.5 text-foreground">{a.designation}</td>
                  <td className="px-4 py-1.5 text-muted-foreground">{a.famille ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

export default MtoPage
