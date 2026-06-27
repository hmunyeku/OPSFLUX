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
  ChevronsDownUp,
  ChevronsUpDown,
  ExternalLink,
  FileUp,
  Layers,
  Package,
  RefreshCw,
  Search,
} from 'lucide-react'

import { cn } from '@/lib/utils'
import { PanelHeader, PanelContent, ToolbarButton } from '@/components/layout/PanelHeader'
import { renderRegisteredPanel } from '@/components/layout/DetachedPanelRenderer'
import { PageNavBar } from '@/components/ui/Tabs'
import { DataTable } from '@/components/ui/DataTable/DataTable'
import { GroupedDataTable } from '@/components/ui/GroupedDataTable'
import { BadgeCell } from '@/components/ui/DataTable'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import { CoverageBar, type CoverageCounts } from '@/components/mto/CoverageBar'
import { MtoStatStrip } from '@/components/mto/MtoKpis'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/ui/ConfirmDialog'
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
  useValidateGroup,
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

/** Statuts métier filtrables, dans l'ordre d'affichage du segmented control. */
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

/**
 * Onglets du segmented control de filtre statut (vue rapprochement).
 * `dot` = classe pastille tokenisée ; `null` = pas de pastille (« Tous »).
 */
const STATUS_SEGMENTS: { value: string; label: string; dot: string | null }[] = [
  { value: '', label: 'Tous', dot: null },
  { value: 'en stock', label: 'En stock', dot: 'bg-success' },
  { value: 'partiel', label: 'Partiel', dot: 'bg-warning' },
  { value: 'à commander', label: 'À commander', dot: 'bg-destructive' },
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
      {/* ProjectPicker en tête de l'onglet — bande compacte, label inline. */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2">
        <span className="shrink-0 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Projet
        </span>
        <div className="min-w-[240px] max-w-[420px] flex-1">
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

  // Couverture agrégée sur tous les MTO du projet (somme des `couverture`).
  const aggregate = useMemo(() => {
    const counts: CoverageCounts = { 'en stock': 0, partiel: 0, 'à commander': 0 }
    let total = 0
    for (const b of batches ?? []) {
      total += b.nb_groupes
      for (const s of COVERAGE_ORDER) counts[s] = (counts[s] ?? 0) + (b.couverture?.[s] ?? 0)
    }
    return { total, counts }
  }, [batches])

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
        size: 260,
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
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Stats agrégées du projet (couverture cumulée des MTO) — bande
          compacte + barre de couverture fine. */}
      <div className="space-y-1.5 border-b border-border px-4 py-2">
        <MtoStatStrip
          total={aggregate.total}
          counts={aggregate.counts}
          totalLabel="groupes (tous MTO)"
          isLoading={isLoading}
        />
        <CoverageBar counts={aggregate.counts} size="sm" />
      </div>

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
    </div>
  )
}

/**
 * Cellule « Couverture » d'un batch : % trouvés + CoverageBar segmentée
 * (en stock / partiel / à commander). Remplace les 3 chips empilés par une
 * unique barre proportionnelle tokenisée (DS).
 */
function CoverageCell({ stats }: { stats: MtoBatchStats }) {
  const pct =
    stats.nb_groupes > 0 ? Math.round((stats.nb_trouves / stats.nb_groupes) * 100) : 0

  return (
    <div className="flex items-center gap-2.5">
      <span className="w-9 shrink-0 text-right text-xs font-semibold tabular-nums text-foreground">
        {pct}%
      </span>
      <CoverageBar counts={stats.couverture ?? {}} size="sm" className="flex-1" />
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
  const confirm = useConfirm()
  const openDynamicPanel = useUIStore((s) => s.openDynamicPanel)
  const { hasPermission } = usePermission()
  const [search, setSearch] = useState('')
  const [statut, setStatut] = useState('')
  // Signaux Déplier/Replier tout (compteurs incrémentés au clic).
  const [expandSignal, setExpandSignal] = useState(0)
  const [collapseSignal, setCollapseSignal] = useState(0)

  // On charge TOUS les groupes (pas de filtre serveur) pour garder des
  // compteurs de statut stables sur le segmented control et les KPI, puis on
  // filtre côté client → bascule de filtre instantanée, KPI cohérents.
  const { data: groups, isLoading } = useMtoGroups(batchId, null)
  const consolidate = useConsolidate()
  const validate = useValidateGroup(batchId)
  const canValidate = hasPermission('mto.matching.validate') || hasPermission('mto.admin')

  // Validation rapide depuis la table (confirm + toast), sans ouvrir le détail.
  const quickValidate = async (group: MtoRow) => {
    const ok = await confirm({
      title: 'Valider le rapprochement ?',
      message: `Confirmer le rapprochement de « ${group.designation_sap || group.mto_key || group.article_code || 'ce groupe'} » avec l'article SAP ${group.article_code ?? '—'}.`,
      confirmLabel: 'Valider',
    })
    if (!ok) return
    try {
      await validate.mutateAsync(group.id)
      toast({ title: 'Rapprochement validé', variant: 'success' })
    } catch {
      toast({ title: 'Validation impossible', variant: 'error' })
    }
  }

  // Compteurs par statut (sur l'ensemble, indépendants du filtre actif).
  const counts = useMemo<CoverageCounts>(() => {
    const c: CoverageCounts = { 'en stock': 0, partiel: 0, 'à commander': 0 }
    for (const g of groups ?? []) {
      if (g.statut) c[g.statut] = (c[g.statut] ?? 0) + 1
    }
    return c
  }, [groups])

  const total = groups?.length ?? 0

  const rows = useMemo<MtoRow[]>(
    () =>
      (groups ?? [])
        .filter((g) => !statut || g.statut === statut)
        .map((g) => ({
          ...g,
          children: (g.children ?? []).map((c, i) => ({ id: `${g.id}-c${i}`, _child: true, ...c })),
        })),
    [groups, statut],
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
        id: 'lignes',
        header: 'Lignes',
        size: 90,
        cell: ({ row }) =>
          row.original._child ? null : (
            <span className="text-xs tabular-nums text-muted-foreground">
              {row.original.nb_lignes ?? 0} ligne{(row.original.nb_lignes ?? 0) !== 1 ? 's' : ''}
            </span>
          ),
      },
      {
        id: 'confiance',
        header: 'Confiance',
        size: 130,
        cell: ({ row }) =>
          row.original._child ? null : (
            <ConfidenceBadge confidence={row.original.confidence} />
          ),
      },
      {
        id: 'verif',
        header: 'Vérif',
        size: 110,
        cell: ({ row }) =>
          row.original._child ? null : (
            <VerificationBadge status={row.original.verification_status} />
          ),
      },
      {
        id: 'actions',
        header: '',
        size: 80,
        cell: ({ row }) => {
          if (row.original._child) return null
          const g = row.original
          const showValidate =
            canValidate && g.found && g.verification_status !== 'verified'
          return (
            <div className="flex items-center justify-end gap-0.5">
              {showValidate && (
                <button
                  type="button"
                  title="Valider le rapprochement"
                  aria-label="Valider le rapprochement"
                  disabled={validate.isPending}
                  onClick={(e) => {
                    e.stopPropagation()
                    void quickValidate(g)
                  }}
                  className="inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-success/10 hover:text-success disabled:opacity-40"
                >
                  <CheckCircle2 size={14} />
                </button>
              )}
              <button
                type="button"
                title="Ouvrir le détail"
                aria-label="Ouvrir le détail"
                onClick={(e) => {
                  e.stopPropagation()
                  openDynamicPanel({
                    type: 'detail',
                    module: 'mto',
                    id: g.id,
                    meta: { batchId },
                  })
                }}
                className="inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <ExternalLink size={14} />
              </button>
            </div>
          )
        },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [canValidate, validate.isPending, batchId],
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Ligne unique : Retour (gauche) · stats compactes · Re-consolider
          (droite), + barre de couverture fine collée dessous. */}
      <div className="space-y-1.5 border-b border-border px-4 py-2">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="btn-sm btn-secondary shrink-0"
            title="Retour aux MTO du projet"
          >
            <ChevronLeft size={14} />
            <span className="hidden md:inline">Retour aux MTO</span>
          </button>

          <div className="min-w-0 flex-1">
            <MtoStatStrip
              total={total}
              counts={counts}
              totalLabel="groupes"
              isLoading={isLoading}
            />
          </div>

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
            className="btn-sm btn-secondary shrink-0"
          >
            <RefreshCw size={13} className={consolidate.isPending ? 'animate-spin' : undefined} />
            <span className="hidden md:inline">Re-consolider</span>
          </button>
        </div>

        <CoverageBar counts={counts} size="sm" />
      </div>

      {/* Conteneur borné (min-h-0 + flex-1) : la table interne de
          GroupedDataTable peut alors activer son propre scroll vertical
          (en-tête sticky) + horizontal, plutôt que d'étirer toute la page. */}
      <div className="flex min-h-0 flex-1 flex-col">
        {isLoading ? (
          <MtoTableSkeleton />
        ) : (
          <GroupedDataTable<MtoRow>
            data={rows}
            columns={columns}
            getSubRows={(row) => row.children}
            isLoading={false}
            searchValue={search}
            onSearchChange={setSearch}
            searchPlaceholder="Rechercher article, désignation, Ø…"
            emptyIcon={Package}
            emptyTitle="Aucun rapprochement — consolidez ce MTO"
            pageSize={50}
            expandAllSignal={expandSignal}
            collapseAllSignal={collapseSignal}
            toolbarRight={
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setExpandSignal((n) => n + 1)}
                  title="Déplier tout"
                  className="inline-flex h-8 items-center gap-1 rounded-md border border-border bg-background px-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                >
                  <ChevronsUpDown size={14} />
                  <span className="hidden lg:inline">Déplier tout</span>
                </button>
                <button
                  type="button"
                  onClick={() => setCollapseSignal((n) => n + 1)}
                  title="Replier tout"
                  className="inline-flex h-8 items-center gap-1 rounded-md border border-border bg-background px-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                >
                  <ChevronsDownUp size={14} />
                  <span className="hidden lg:inline">Replier tout</span>
                </button>
                <StatusSegmented
                  value={statut}
                  onChange={setStatut}
                  counts={counts}
                  total={total}
                />
              </div>
            }
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
        )}
      </div>
    </div>
  )
}

/**
 * Segmented control de filtre statut (Tous · En stock · Partiel · À commander)
 * avec compteurs. Pattern DS : boutons-chips tokenisés dans un conteneur
 * segmenté (aucun composant ToggleGroup générique n'existe dans le DS).
 */
function StatusSegmented({
  value,
  onChange,
  counts,
  total,
}: {
  value: string
  onChange: (v: string) => void
  counts: CoverageCounts
  total: number
}) {
  const countFor = (v: string) => (v === '' ? total : counts[v] ?? 0)

  return (
    <div
      className="inline-flex shrink-0 items-center gap-0.5 rounded-md border border-border bg-muted/40 p-0.5"
      role="tablist"
      aria-label="Filtrer par statut"
    >
      {STATUS_SEGMENTS.map((seg) => {
        const active = value === seg.value
        return (
          <button
            key={seg.value || 'all'}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(seg.value)}
            className={cn(
              'inline-flex items-center gap-1 whitespace-nowrap rounded px-2 py-0.5 text-xs font-medium transition-colors',
              active
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {seg.dot && <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', seg.dot)} />}
            <span className="hidden sm:inline">{seg.label}</span>
            <span className="sm:hidden">{seg.dot ? '' : 'Tous'}</span>
            <span
              className={cn(
                'tabular-nums',
                active ? 'text-muted-foreground' : 'text-muted-foreground/70',
              )}
            >
              {countFor(seg.value)}
            </span>
          </button>
        )
      })}
    </div>
  )
}

/** Badge de confiance tokenisé (haute → success, moyenne → warning, …). */
function ConfidenceBadge({ confidence }: { confidence?: string | null }) {
  if (!confidence) return <span className="text-xs text-muted-foreground">—</span>
  const norm = confidence.toLowerCase()
  const variant: 'success' | 'warning' | 'danger' | 'neutral' =
    norm.includes('haut') || norm.includes('high') || norm.includes('exact')
      ? 'success'
      : norm.includes('moy') || norm.includes('medium') || norm.includes('partiel')
        ? 'warning'
        : norm.includes('faible') || norm.includes('low')
          ? 'danger'
          : 'neutral'
  return <BadgeCell value={confidence} variant={variant} />
}

/**
 * Badge de statut de vérification humaine d'un rapprochement.
 *   verified → success « Validé » · rejected → danger « Rejeté »
 *   pending / autre → neutral « En attente ».
 */
function VerificationBadge({ status }: { status?: string | null }) {
  if (status === 'verified') return <BadgeCell value="Validé" variant="success" />
  if (status === 'rejected') return <BadgeCell value="Rejeté" variant="danger" />
  return <BadgeCell value="En attente" variant="neutral" />
}

/**
 * Skeleton de table de rapprochement — remplace le spinner brut pendant le
 * chargement des groupes. En-têtes + lignes en placeholders tokenisés.
 */
function MtoTableSkeleton() {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Toolbar de recherche fantôme (miroir de GroupedDataTable). */}
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <Skeleton className="h-4 w-4 rounded" />
        <Skeleton className="h-4 w-48" />
        <Skeleton className="ml-auto h-3 w-16" />
      </div>
      <div className="flex-1 space-y-2 overflow-hidden px-3 py-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="h-4 w-4 rounded" />
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-5 w-20 rounded-full" />
            <Skeleton className="h-5 w-20 rounded-full" />
          </div>
        ))}
      </div>
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
