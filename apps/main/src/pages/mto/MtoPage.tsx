/**
 * MTOGuru — page PROJECT-FIRST du rapprochement MTO ↔ stock/catalogue SAP.
 *
 * Modèle métier : un PROJET a PLUSIEURS MTO (imports). On entre par un projet,
 * on voit/charge ses MTO, et le RAPPROCHEMENT (stock + codes SAP) est le DÉTAIL
 * d'un MTO — pas la page d'accueil.
 *
 * Flux de l'onglet « MTO » :
 *   1. ProjectPicker proéminent en tête (persisté via useFilterPersistence).
 *   2. Aucun projet → EmptyState « Choisissez un projet ».
 *   3. Projet choisi → liste de ses MTO (useMtoBatchStats) dans une DataTable :
 *      MTO · Date · Lignes · Couverture (chips/barre) · Statut + bouton
 *      « Charger un MTO » (gated import).
 *   4. Clic sur une ligne MTO → sous-vue RAPPROCHEMENT de ce batch (groupes
 *      consolidés, GroupedDataTable dépliable, validation/correction, détail
 *      via MtoPanels) + fil d'Ariane « ← Retour aux MTO du projet ».
 *
 * Onglet « Catalogue & Stock » : import catalogue, import stock (label) et
 * recherche catalogue.
 *
 * Design system OpsFlux (gabarit PackLog / Projets) : PanelHeader, PageNavBar,
 * ProjectPicker, DataTable, GroupedDataTable, BadgeCell, EmptyState, tokens.
 * Aucune couleur hex en dur, aucun style inline décoratif.
 */
import { useMemo, useRef, useState } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import {
  Boxes,
  CheckCircle2,
  ChevronLeft,
  FileUp,
  Layers,
  Package,
  RefreshCw,
  Search,
} from 'lucide-react'

import { PanelHeader, PanelContent, ToolbarButton } from '@/components/layout/PanelHeader'
import { renderRegisteredPanel } from '@/components/layout/DetachedPanelRenderer'
import { PageNavBar } from '@/components/ui/Tabs'
import { DataTable } from '@/components/ui/DataTable/DataTable'
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
  useImportCatalogue,
  useImportMto,
  useImportStock,
  useMtoBatchStats,
  useMtoGroups,
  type MtoBatchStats,
  type MtoChild,
  type MtoGroup,
} from '@/hooks/useMto'
import {
  mtoBatchLabel,
  mtoStatusLabel,
  mtoStatusTextClass,
  mtoStatusVariant,
} from '@/services/mtoService'
// Effet de bord : enregistre le renderer du panneau MTO dans le registry.
import './MtoPanels'

type MtoTab = 'mto' | 'catalogue'

/** Ordre d'affichage des statuts métier dans la mini-couverture. */
const COVERAGE_ORDER = ['en stock', 'partiel', 'à commander'] as const

/**
 * Ligne de table de rapprochement : un groupe (parent) OU une ligne d'origine
 * (child). Omit sur `diameter`/`children` pour réconcilier `string | null`
 * (groupe) et `string | undefined` (child) sans conflit de types.
 */
type MtoRow = Omit<Partial<MtoGroup>, 'diameter' | 'children'> &
  Omit<Partial<MtoChild>, 'diameter'> & {
    id: string
    _child?: boolean
    diameter?: string | null
    children?: MtoRow[]
  }

/** État persisté de l'onglet MTO (projet courant). */
interface MtoProjectView {
  projectId: string | null
}

const DEFAULT_PROJECT_VIEW: MtoProjectView = { projectId: null }

const STATUS_FILTER_OPTIONS = [
  { value: '', label: 'Tous les statuts' },
  { value: 'en stock', label: 'En stock' },
  { value: 'partiel', label: 'Partiel' },
  { value: 'à commander', label: 'À commander' },
]

function formatDate(value: string | null | undefined): string {
  if (!value) return '—'
  try {
    return new Date(value).toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    })
  } catch {
    return value
  }
}

export function MtoPage() {
  const dynamicPanel = useUIStore((s) => s.dynamicPanel)
  const panelMode = useUIStore((s) => s.dynamicPanelMode)

  const [activeTab, setActiveTab] = useState<MtoTab>('mto')

  // Le panneau plein-écran prend toute la zone : on cache la liste à côté.
  const isFullPanel =
    panelMode === 'full' && dynamicPanel !== null && dynamicPanel.module === 'mto'

  const tabItems = useMemo(
    () => [
      { id: 'mto' as const, label: 'MTO', icon: Layers },
      { id: 'catalogue' as const, label: 'Catalogue & Stock', icon: Boxes },
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
          />

          <PageNavBar items={tabItems} activeId={activeTab} onTabChange={setActiveTab} />

          <PanelContent scroll={false}>
            {activeTab === 'mto' && <MtoProjectTab />}
            {activeTab === 'catalogue' && <CatalogueStockTab />}
          </PanelContent>
        </div>
      )}

      {dynamicPanel?.module === 'mto' && renderRegisteredPanel(dynamicPanel)}
    </div>
  )
}

// ── Onglet MTO (project-first) ─────────────────────────────────────────────

function MtoProjectTab() {
  const [view, setView] = useFilterPersistence<MtoProjectView>(
    'mto.project',
    DEFAULT_PROJECT_VIEW,
  )
  // Sous-vue rapprochement : null = liste des MTO du projet.
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null)

  const projectId = view.projectId

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* ProjectPicker proéminent en tête de l'onglet. */}
      <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Projet
        </span>
        <div className="min-w-[260px] max-w-[420px] flex-1">
          <ProjectPicker
            value={projectId}
            onChange={(pid) => {
              setView({ projectId: pid })
              setSelectedBatchId(null)
            }}
            placeholder="Choisissez un projet…"
            clearable
          />
        </div>
      </div>

      {!projectId ? (
        <EmptyState
          icon={Package}
          title="Choisissez un projet pour voir ses MTO"
          description="Le rapprochement MTO ↔ stock est organisé par projet. Sélectionnez un projet pour lister ses imports MTO et lancer un rapprochement."
        />
      ) : selectedBatchId ? (
        <MatchingView
          batchId={selectedBatchId}
          onBack={() => setSelectedBatchId(null)}
        />
      ) : (
        <MtoListView projectId={projectId} onOpenBatch={setSelectedBatchId} />
      )}
    </div>
  )
}

// ── Liste des MTO d'un projet ──────────────────────────────────────────────

function MtoListView({
  projectId,
  onOpenBatch,
}: {
  projectId: string
  onOpenBatch: (batchId: string) => void
}) {
  const { hasPermission } = usePermission()
  const { data: batches, isLoading } = useMtoBatchStats(projectId)

  const canImport = hasPermission('mto.requirement.import') || hasPermission('mto.admin')

  const columns = useMemo<ColumnDef<MtoBatchStats, unknown>[]>(
    () => [
      {
        id: 'mto',
        header: 'MTO',
        cell: ({ row }) => (
          <span className="font-medium text-foreground">{mtoBatchLabel(row.original)}</span>
        ),
      },
      {
        id: 'created_at',
        header: 'Date',
        size: 120,
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">
            {formatDate(row.original.created_at)}
          </span>
        ),
      },
      {
        id: 'nb_lignes',
        header: 'Lignes',
        size: 80,
        cell: ({ row }) => (
          <span className="tabular-nums text-foreground">{row.original.nb_lignes}</span>
        ),
      },
      {
        id: 'couverture',
        header: 'Couverture',
        size: 240,
        cell: ({ row }) => <CoverageCell stats={row.original} />,
      },
      {
        id: 'status',
        header: 'Statut',
        size: 120,
        cell: ({ row }) =>
          row.original.status ? (
            <BadgeCell
              value={mtoStatusLabel(row.original.status)}
              variant={mtoStatusVariant(row.original.status)}
            />
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          ),
      },
    ],
    [],
  )

  return (
    <PanelContent scroll={false}>
      <DataTable<MtoBatchStats>
        columns={columns}
        data={batches ?? []}
        isLoading={isLoading}
        onRowClick={(row) => onOpenBatch(row.id)}
        toolbarRight={
          canImport ? (
            <ImportMtoButton projectId={projectId} onImported={onOpenBatch} />
          ) : undefined
        }
        emptyIcon={Package}
        emptyTitle="Aucun MTO pour ce projet"
        storageKey="mto-batches"
      />
    </PanelContent>
  )
}

/**
 * Mini-couverture d'un batch : pourcentage de groupes trouvés + chips par
 * statut métier (en stock / partiel / à commander), construits depuis
 * `couverture` et mtoService. Tokens uniquement, pas de hex.
 */
function CoverageCell({ stats }: { stats: MtoBatchStats }) {
  const pct =
    stats.nb_groupes > 0 ? Math.round((stats.nb_trouves / stats.nb_groupes) * 100) : 0

  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
      </div>
      <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">{pct}%</span>
      <div className="flex flex-wrap items-center gap-1.5">
        {COVERAGE_ORDER.filter((s) => (stats.couverture?.[s] ?? 0) > 0).map((s) => (
          <span
            key={s}
            className={`text-[10px] tabular-nums ${mtoStatusTextClass(s)}`}
            title={mtoStatusLabel(s)}
          >
            <b>{stats.couverture[s]}</b> {mtoStatusLabel(s).toLowerCase()}
          </span>
        ))}
      </div>
    </div>
  )
}

// ── Bouton « Charger un MTO » (file picker → POST /import/mto) ──────────────

function ImportMtoButton({
  projectId,
  onImported,
}: {
  projectId: string
  onImported: (batchId: string) => void
}) {
  const { toast } = useToast()
  const importMto = useImportMto()
  const inputRef = useRef<HTMLInputElement | null>(null)

  return (
    <>
      <ToolbarButton
        icon={FileUp}
        label={importMto.isPending ? 'Import…' : 'Charger un MTO'}
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

// ── Sous-vue rapprochement d'un batch ──────────────────────────────────────

function MatchingView({
  batchId,
  onBack,
}: {
  batchId: string
  onBack: () => void
}) {
  const { toast } = useToast()
  const openDynamicPanel = useUIStore((s) => s.openDynamicPanel)
  const [search, setSearch] = useState('')
  const [statut, setStatut] = useState('')

  const { data: groups, isLoading } = useMtoGroups(batchId, statut || null)
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
      {/* Fil d'Ariane + filtre statut + KPIs + re-consolider. */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2">
        <button
          type="button"
          onClick={onBack}
          className="btn-sm btn-secondary"
          title="Retour aux MTO du projet"
        >
          <ChevronLeft size={14} />
          <span className="hidden sm:inline">Retour aux MTO du projet</span>
        </button>

        <select
          value={statut}
          onChange={(e) => setStatut(e.target.value)}
          className="gl-form-input h-7 text-xs"
          title="Filtrer par statut"
        >
          {STATUS_FILTER_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>

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
        emptyTitle="Aucun rapprochement — consolidez ce MTO"
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

// ── Onglet Catalogue & Stock ───────────────────────────────────────────────

function CatalogueStockTab() {
  const { hasPermission } = usePermission()
  const { toast } = useToast()
  const [search, setSearch] = useState('')
  const debounced = useDebounce(search, 250)
  const { data: results, isFetching } = useCatalogSearch(debounced)

  const importCatalogue = useImportCatalogue()
  const importStock = useImportStock()
  const catalogueRef = useRef<HTMLInputElement | null>(null)
  const stockRef = useRef<HTMLInputElement | null>(null)
  const [stockLabel, setStockLabel] = useState('')

  const canImportCatalogue = hasPermission('mto.catalogue.import') || hasPermission('mto.admin')
  const canImportStock = hasPermission('mto.stock.import') || hasPermission('mto.admin')

  const columns = useMemo<ColumnDef<NonNullable<typeof results>[number], unknown>[]>(
    () => [
      {
        id: 'code',
        header: 'Code',
        size: 160,
        cell: ({ row }) => (
          <span className="font-mono text-xs text-primary">{row.original.code}</span>
        ),
      },
      {
        id: 'designation',
        header: 'Désignation',
        cell: ({ row }) => <span className="text-foreground">{row.original.designation}</span>,
      },
      {
        id: 'famille',
        header: 'Famille',
        size: 180,
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">{row.original.famille ?? '—'}</span>
        ),
      },
    ],
    [],
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Bandeau import catalogue + stock. */}
      {(canImportCatalogue || canImportStock) && (
        <div className="grid gap-3 border-b border-border px-4 py-3 md:grid-cols-2">
          {canImportCatalogue && (
            <div className="rounded-lg border border-border/60 bg-card px-3 py-3">
              <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Catalogue SAP
              </p>
              <ToolbarButton
                icon={FileUp}
                label={importCatalogue.isPending ? 'Import…' : 'Importer le catalogue'}
                disabled={importCatalogue.isPending}
                onClick={() => catalogueRef.current?.click()}
              />
              <input
                ref={catalogueRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0]
                  if (!file) return
                  try {
                    const res = await importCatalogue.mutateAsync(file)
                    toast({
                      title: `Catalogue importé : ${res.imported} article(s)`,
                      variant: 'success',
                    })
                  } catch {
                    toast({ title: "Échec de l'import catalogue", variant: 'error' })
                  } finally {
                    e.target.value = ''
                  }
                }}
              />
            </div>
          )}

          {canImportStock && (
            <div className="rounded-lg border border-border/60 bg-card px-3 py-3">
              <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                État de stock
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  value={stockLabel}
                  onChange={(e) => setStockLabel(e.target.value)}
                  placeholder="Libellé (ex. Stock 2026-06)…"
                  className="gl-form-input h-8 flex-1 text-xs"
                />
                <ToolbarButton
                  icon={FileUp}
                  label={importStock.isPending ? 'Import…' : 'Importer le stock'}
                  disabled={importStock.isPending}
                  onClick={() => stockRef.current?.click()}
                />
              </div>
              <input
                ref={stockRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0]
                  if (!file) return
                  try {
                    const res = await importStock.mutateAsync({
                      file,
                      label: stockLabel || undefined,
                    })
                    toast({
                      title: `Stock importé : ${res.imported} ligne(s)`,
                      variant: 'success',
                    })
                    setStockLabel('')
                  } catch {
                    toast({ title: "Échec de l'import stock", variant: 'error' })
                  } finally {
                    e.target.value = ''
                  }
                }}
              />
            </div>
          )}
        </div>
      )}

      {/* Recherche catalogue. */}
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

      <div className="flex min-h-0 flex-1 flex-col">
        {search.trim().length < 2 ? (
          <EmptyState
            icon={Boxes}
            title="Recherche catalogue SAP"
            description="Saisissez au moins 2 caractères pour rechercher un article."
          />
        ) : (
          <PanelContent scroll={false}>
            <DataTable<NonNullable<typeof results>[number]>
              columns={columns}
              data={results ?? []}
              isLoading={isFetching}
              emptyIcon={Boxes}
              emptyTitle="Aucun article trouvé"
              storageKey="mto-catalogue"
            />
          </PanelContent>
        )}
      </div>
    </div>
  )
}

export default MtoPage
