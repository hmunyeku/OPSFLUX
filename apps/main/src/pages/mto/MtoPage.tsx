/**
 * MTOGuru — page PROJECT-FIRST du rapprochement MTO ↔ stock/catalogue SAP.
 *
 * Modèle métier : un PROJET a PLUSIEURS MTO (imports). On entre par un projet,
 * on voit/charge ses MTO, et le RAPPROCHEMENT (stock + codes SAP) est le DÉTAIL
 * d'un MTO — pas la page d'accueil.
 *
 * Flux de l'onglet « MTO » :
 *   1. Puce du projet courant + ProjectSelectorModal (mode UN seul projet)
 *      en tête (persisté via useFilterPersistence sous `mto.project`).
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
 * ProjectSelectorModal, DataTable, GroupedDataTable, BadgeCell, EmptyState,
 * tokens. Aucune couleur hex en dur, aucun style inline décoratif.
 */
import { useCallback, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { LucideIcon } from 'lucide-react'
import type { ColumnDef, VisibilityState } from '@tanstack/react-table'
import {
  ArrowLeftRight,
  BarChart3,
  Boxes,
  CheckCircle2,
  ChevronLeft,
  ChevronsDownUp,
  ChevronsUpDown,
  Download,
  ExternalLink,
  FileUp,
  FolderKanban,
  GitCompareArrows,
  Layers,
  Package,
  PackageCheck,
  Pencil,
  RefreshCw,
  Search,
  X,
} from 'lucide-react'

import i18n from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { safeLocalJson, safeLocalSetJson } from '@/lib/safeStorage'
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
import { ProjectSelectorModal } from '@/components/shared/ProjectSelectorModal'
import { useProject } from '@/hooks/useProjets'
import {
  useCatalogSearch,
  useConsolidate,
  useImportCatalogue,
  useImportConsumption,
  useImportMto,
  useImportStock,
  useMtoAnalytics,
  useMtoBatchStats,
  useMtoDiff,
  useMtoGroups,
  useReconciliation,
  useValidateGroup,
  type MtoAnalyticsFreqItem,
  type MtoAnalyticsOverview,
  type MtoAnalyticsPair,
  type MtoAnalyticsTopItem,
  type MtoBatchStats,
  type MtoChild,
  type MtoDiffChangeType,
  type MtoDiffItem,
  type MtoGroup,
  type MtoRole,
  type ReconcileItem,
  type ReconcileSummary,
} from '@/hooks/useMto'
import { MtoExportAssistant } from './MtoExportAssistant'
import {
  mtoBatchLabel,
  mtoStatusLabel,
  mtoStatusTextClass,
  mtoStatusVariant,
} from '@/services/mtoService'
// Effet de bord : enregistre le renderer du panneau MTO dans le registry.
import './MtoPanels'

type MtoTab = 'mto' | 'croisement' | 'reconciliation' | 'analytics' | 'catalogue'

/** Statuts métier filtrables, dans l'ordre d'affichage du segmented control. */
const COVERAGE_ORDER = ['en stock', 'partiel', 'à commander'] as const

// ── Rôle d'un MTO (design / révisé) ────────────────────────────────────────

/** Libellé i18n d'un rôle de MTO (fallback = valeur brute). */
function mtoRoleLabel(role: string | null | undefined): string {
  if (role === 'design') return i18n.t('mto.role.design')
  if (role === 'revise') return i18n.t('mto.role.revise')
  return role ?? '—'
}

/** Variante de chip pour un rôle : design = info, révisé = warning. */
function mtoRoleVariant(role: string | null | undefined): 'info' | 'warning' | 'neutral' {
  if (role === 'design') return 'info'
  if (role === 'revise') return 'warning'
  return 'neutral'
}

// ── Croisement design ↔ révisé : présentation des types d'écart ─────────────

/** Clé i18n du libellé d'un type d'écart du croisement. */
const DIFF_TYPE_LABEL_KEYS: Record<MtoDiffChangeType, string> = {
  added: 'mto.diff.type_added',
  removed: 'mto.diff.type_removed',
  changed: 'mto.diff.type_changed',
  unchanged: 'mto.diff.type_unchanged',
}

/** Variante de chip par type d'écart (unchanged → neutral, pas de "muted"). */
const DIFF_TYPE_VARIANTS: Record<MtoDiffChangeType, 'success' | 'danger' | 'warning' | 'neutral'> = {
  added: 'success',
  removed: 'danger',
  changed: 'warning',
  unchanged: 'neutral',
}

/**
 * Onglets du segmented control de filtre par type d'écart (vue croisement).
 * `dot` = classe pastille tokenisée ; `null` = pas de pastille (« Tous »).
 */
const DIFF_TYPE_SEGMENTS: { value: '' | MtoDiffChangeType; labelKey: string; dot: string | null }[] = [
  { value: '', labelKey: 'mto.diff.all', dot: null },
  { value: 'added', labelKey: 'mto.diff.type_added', dot: 'bg-success' },
  { value: 'removed', labelKey: 'mto.diff.type_removed', dot: 'bg-destructive' },
  { value: 'changed', labelKey: 'mto.diff.type_changed', dot: 'bg-warning' },
  { value: 'unchanged', labelKey: 'mto.diff.type_unchanged', dot: 'bg-muted-foreground/40' },
]

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
const STATUS_SEGMENTS: { value: string; labelKey: string; dot: string | null }[] = [
  { value: '', labelKey: 'mto.matching.all', dot: null },
  { value: 'en stock', labelKey: 'mto.status.en_stock', dot: 'bg-success' },
  { value: 'partiel', labelKey: 'mto.status.partiel', dot: 'bg-warning' },
  { value: 'à commander', labelKey: 'mto.status.a_commander', dot: 'bg-destructive' },
]

function formatDate(value: string | null | undefined): string {
  if (!value) return '—'
  try {
    return new Date(value).toLocaleDateString(i18n.language || 'fr', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    })
  } catch {
    return value
  }
}

/** Clé localStorage de la visibilité des colonnes de la table de rapprochement. */
const MATCHING_COLUMNS_LS_KEY = 'mto.matching.columns'

/**
 * Visibilité des colonnes de la table de rapprochement, persistée en
 * localStorage (no-throw via safeStorage). Forme = VisibilityState TanStack
 * ({ [columnId]: boolean }) ; une colonne absente est visible par défaut.
 */
function useMatchingColumnVisibility(): [VisibilityState, (next: VisibilityState) => void] {
  const [state, setState] = useState<VisibilityState>(() =>
    safeLocalJson<VisibilityState>(MATCHING_COLUMNS_LS_KEY, {}),
  )
  const set = useCallback((next: VisibilityState) => {
    setState(next)
    safeLocalSetJson(MATCHING_COLUMNS_LS_KEY, next)
  }, [])
  return [state, set]
}

export function MtoPage() {
  const { t } = useTranslation()
  const dynamicPanel = useUIStore((s) => s.dynamicPanel)
  const panelMode = useUIStore((s) => s.dynamicPanelMode)

  const [activeTab, setActiveTab] = useState<MtoTab>('mto')

  // Le panneau plein-écran prend toute la zone : on cache la liste à côté.
  const isFullPanel =
    panelMode === 'full' && dynamicPanel !== null && dynamicPanel.module === 'mto'

  const tabItems = useMemo(
    () => [
      { id: 'mto' as const, label: t('mto.tabs.mto'), icon: Layers },
      { id: 'croisement' as const, label: t('mto.tabs.croisement'), icon: GitCompareArrows },
      { id: 'reconciliation' as const, label: t('mto.tabs.reconciliation'), icon: PackageCheck },
      { id: 'analytics' as const, label: t('mto.tabs.analytics'), icon: BarChart3 },
      { id: 'catalogue' as const, label: t('mto.tabs.catalogue'), icon: Boxes },
    ],
    [t],
  )

  return (
    <div className="flex h-full">
      {!isFullPanel && (
        <div className="flex flex-1 min-w-0 flex-col overflow-hidden">
          <PanelHeader
            icon={Package}
            title={t('mto.header.title')}
            subtitle={t('mto.header.subtitle')}
          />

          <PageNavBar items={tabItems} activeId={activeTab} onTabChange={setActiveTab} />

          <PanelContent scroll={false}>
            {activeTab === 'mto' && <MtoProjectTab />}
            {activeTab === 'croisement' && <CroisementTab />}
            {activeTab === 'reconciliation' && <ReconciliationTab />}
            {activeTab === 'analytics' && <AnalyticsTab />}
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
  const { t } = useTranslation()
  const [view, setView] = useFilterPersistence<MtoProjectView>(
    'mto.project',
    DEFAULT_PROJECT_VIEW,
  )
  // Sous-vue rapprochement : null = liste des MTO du projet.
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)

  const projectId = view.projectId

  const selectProject = (pid: string | null) => {
    setView({ projectId: pid })
    setSelectedBatchId(null)
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Sélecteur de projet — puce du projet courant + bouton changer/effacer.
          Clic → ouvre ProjectSelectorModal (mode UN seul projet). */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2">
        <span className="shrink-0 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {t('mto.common.project')}
        </span>
        <ProjectChip
          projectId={projectId}
          onOpen={() => setPickerOpen(true)}
          onClear={() => selectProject(null)}
        />
      </div>

      <ProjectSelectorModal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        title={t('mto.common.choose_project')}
        selection={{
          mode: 'selected',
          projectIds: projectId ? [projectId] : [],
        }}
        onSelectionChange={(sel) => {
          // Mode UN seul projet : on ne garde que le premier sélectionné.
          selectProject(sel.projectIds[0] ?? null)
          setPickerOpen(false)
        }}
      />

      {!projectId ? (
        <EmptyState
          icon={Package}
          title={t('mto.list.empty_no_project_title')}
          description={t('mto.list.empty_no_project_desc')}
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

/**
 * Puce du projet sélectionné : nom + code (résolus via useProject) avec un
 * bouton « changer » (ouvre la modale) et « effacer ». Sans projet → bouton
 * d'invitation à choisir. Tokens DS, aucune couleur en dur.
 */
function ProjectChip({
  projectId,
  onOpen,
  onClear,
}: {
  projectId: string | null
  onOpen: () => void
  onClear: () => void
}) {
  const { t } = useTranslation()
  const { data: project } = useProject(projectId ?? undefined)

  if (!projectId) {
    return (
      <button
        type="button"
        onClick={onOpen}
        className="inline-flex h-8 items-center gap-1.5 rounded-md border border-dashed border-border bg-background px-3 text-sm text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
      >
        <FolderKanban size={14} className="shrink-0" />
        <span>{t('mto.common.choose_project_placeholder')}</span>
      </button>
    )
  }

  const label = project ? `${project.name} (${project.code})` : '…'

  return (
    <div className="inline-flex h-8 items-center gap-1 rounded-md border border-border bg-card pl-2.5 pr-1 text-sm">
      <FolderKanban size={14} className="shrink-0 text-primary" />
      <span className="max-w-[280px] truncate font-medium text-foreground" title={label}>
        {label}
      </span>
      <button
        type="button"
        onClick={onOpen}
        title={t('mto.common.change_project')}
        aria-label={t('mto.common.change_project')}
        className="ml-1 inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        <Pencil size={13} />
      </button>
      <button
        type="button"
        onClick={onClear}
        title={t('mto.common.clear_selection')}
        aria-label={t('mto.common.clear_selection')}
        className="inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
      >
        <X size={13} />
      </button>
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
  const { t } = useTranslation()
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
        header: t('mto.list.col_mto'),
        cell: ({ row }) => (
          <span className="font-medium text-foreground">{mtoBatchLabel(row.original)}</span>
        ),
      },
      {
        id: 'role',
        header: t('mto.list.col_role'),
        size: 100,
        cell: ({ row }) => (
          <BadgeCell
            value={mtoRoleLabel(row.original.role)}
            variant={mtoRoleVariant(row.original.role)}
          />
        ),
      },
      {
        id: 'created_at',
        header: t('mto.list.col_date'),
        size: 120,
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">
            {formatDate(row.original.created_at)}
          </span>
        ),
      },
      {
        id: 'nb_lignes',
        header: t('mto.list.col_lines'),
        size: 80,
        cell: ({ row }) => (
          <span className="tabular-nums text-foreground">{row.original.nb_lignes}</span>
        ),
      },
      {
        id: 'couverture',
        header: t('mto.list.col_coverage'),
        size: 260,
        cell: ({ row }) => <CoverageCell stats={row.original} />,
      },
      {
        id: 'status',
        header: t('mto.list.col_status'),
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
    [t],
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Stats agrégées du projet (couverture cumulée des MTO) — bande
          compacte + barre de couverture fine. */}
      <div className="space-y-1.5 border-b border-border px-4 py-2">
        <MtoStatStrip
          total={aggregate.total}
          counts={aggregate.counts}
          totalLabel={t('mto.list.total_label')}
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
          emptyTitle={t('mto.list.empty_title')}
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
  const { t } = useTranslation()
  const { toast } = useToast()
  const importMto = useImportMto()
  const inputRef = useRef<HTMLInputElement | null>(null)
  // Rôle choisi avant l'upload (défaut Design). Passé en FormData `role`.
  const [role, setRole] = useState<MtoRole>('design')

  return (
    <div className="flex items-center gap-1.5">
      <RoleSegmented value={role} onChange={setRole} disabled={importMto.isPending} />
      <ToolbarButton
        icon={FileUp}
        label={importMto.isPending ? t('mto.list.import_pending') : t('mto.list.import_button')}
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
            const batch = await importMto.mutateAsync({ file, projectId, role })
            toast({
              title: t('mto.list.import_success', {
                role: mtoRoleLabel(role),
                label: mtoBatchLabel(batch),
              }),
              variant: 'success',
            })
            onImported(batch.id)
          } catch {
            toast({ title: t('mto.list.import_error'), variant: 'error' })
          } finally {
            e.target.value = ''
          }
        }}
      />
    </div>
  )
}

/**
 * Segmented control de choix du rôle d'un MTO avant import (Design / Révisé).
 * Pattern DS aligné sur StatusSegmented (boutons-chips tokenisés dans un
 * conteneur segmenté). Pastille tokenisée par rôle.
 */
function RoleSegmented({
  value,
  onChange,
  disabled,
}: {
  value: MtoRole
  onChange: (v: MtoRole) => void
  disabled?: boolean
}) {
  const { t } = useTranslation()
  const options: { value: MtoRole; label: string; dot: string }[] = [
    { value: 'design', label: t('mto.role.design'), dot: 'bg-info' },
    { value: 'revise', label: t('mto.role.revise'), dot: 'bg-warning' },
  ]
  return (
    <div
      className="inline-flex shrink-0 items-center gap-0.5 rounded-md border border-border bg-muted/40 p-0.5"
      role="radiogroup"
      aria-label={t('mto.list.import_role_label')}
    >
      {options.map((opt) => {
        const active = value === opt.value
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            onClick={() => onChange(opt.value)}
            className={cn(
              'inline-flex items-center gap-1 whitespace-nowrap rounded px-2 py-0.5 text-xs font-medium transition-colors disabled:opacity-50',
              active
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', opt.dot)} />
            {opt.label}
          </button>
        )
      })}
    </div>
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
  const { t } = useTranslation()
  const { toast } = useToast()
  const confirm = useConfirm()
  const openDynamicPanel = useUIStore((s) => s.openDynamicPanel)
  const { hasPermission } = usePermission()
  const [search, setSearch] = useState('')
  const [statut, setStatut] = useState('')
  // Signaux Déplier/Replier tout (compteurs incrémentés au clic).
  const [expandSignal, setExpandSignal] = useState(0)
  const [collapseSignal, setCollapseSignal] = useState(0)
  // Visibilité des colonnes de la table de rapprochement, persistée en
  // localStorage (clé mto.matching.columns) — feature « Masquer des colonnes ».
  const [columnVisibility, setColumnVisibility] = useMatchingColumnVisibility()
  const [exportOpen, setExportOpen] = useState(false)
  const canExport = hasPermission('mto.export') || hasPermission('mto.admin')

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
      title: t('mto.matching.quick_validate_title'),
      message: t('mto.matching.quick_validate_message', {
        item: group.designation_sap || group.mto_key || group.article_code || t('mto.matching.this_group'),
        article: group.article_code ?? '—',
      }),
      confirmLabel: t('mto.matching.validate_confirm'),
    })
    if (!ok) return
    try {
      await validate.mutateAsync(group.id)
      toast({ title: t('mto.matching.validate_success'), variant: 'success' })
    } catch {
      toast({ title: t('mto.matching.validate_error'), variant: 'error' })
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
        header: t('mto.matching.col_article'),
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
        header: t('mto.matching.col_designation_sap'),
        cell: ({ row }) =>
          row.original._child ? (
            <span className="text-muted-foreground">{row.original.description}</span>
          ) : row.original.found ? (
            <span className="text-foreground">{row.original.designation_sap ?? '—'}</span>
          ) : (
            <span className="italic text-muted-foreground">{t('mto.matching.not_found')}</span>
          ),
      },
      {
        id: 'famille',
        header: t('mto.matching.col_famille'),
        cell: ({ row }) =>
          row.original._child ? null : (
            <span className="text-xs text-muted-foreground">{row.original.famille ?? ''}</span>
          ),
      },
      {
        id: 'besoin',
        header: t('mto.matching.col_besoin'),
        cell: ({ row }) =>
          row.original._child ? (
            <span className="tabular-nums text-muted-foreground">{row.original.qte ?? ''}</span>
          ) : (
            <span className="tabular-nums">
              {row.original.besoin}&nbsp;{row.original.unite ?? ''}
              {row.original.unit_check ? (
                <span className="ml-1 text-warning" title={t('mto.matching.units_heterogeneous')}>
                  ⚠
                </span>
              ) : null}
            </span>
          ),
      },
      {
        id: 'couverture',
        header: t('mto.matching.col_couverture'),
        cell: ({ row }) =>
          row.original._child ? null : (
            <span className={`tabular-nums ${mtoStatusTextClass(row.original.statut)}`}>
              {row.original.dispo}/{row.original.besoin}
            </span>
          ),
      },
      {
        id: 'statut',
        header: t('mto.matching.col_statut'),
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
        header: t('mto.matching.col_lignes'),
        size: 90,
        cell: ({ row }) =>
          row.original._child ? null : (
            <span className="text-xs tabular-nums text-muted-foreground">
              {t('mto.common.lines_count', { count: row.original.nb_lignes ?? 0 })}
            </span>
          ),
      },
      {
        id: 'confiance',
        header: t('mto.matching.col_confiance'),
        size: 130,
        cell: ({ row }) =>
          row.original._child ? null : (
            <ConfidenceBadge confidence={row.original.confidence} />
          ),
      },
      {
        id: 'verif',
        header: t('mto.matching.col_verif'),
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
                  title={t('mto.matching.validate_title')}
                  aria-label={t('mto.matching.validate_title')}
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
                title={t('mto.matching.open_detail')}
                aria-label={t('mto.matching.open_detail')}
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
    [canValidate, validate.isPending, batchId, t],
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Ligne d'actions : Retour (gauche) · recherche · stats · Exporter /
          Re-consolider (droite), + barre de couverture fine collée dessous.
          La recherche est repositionnée ici (même ligne que « Retour »). */}
      <div className="space-y-1.5 border-b border-border px-4 py-2">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onBack}
            className="btn-sm btn-secondary shrink-0"
            title={t('mto.matching.back_title')}
          >
            <ChevronLeft size={14} />
            <span className="hidden md:inline">{t('mto.matching.back')}</span>
          </button>

          {/* Recherche texte (remontée depuis la toolbar de la table). */}
          <div className="flex h-8 min-w-[180px] flex-1 items-center gap-1.5 rounded-md border border-border bg-background px-2.5">
            <Search size={14} className="shrink-0 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('mto.matching.search_placeholder')}
              className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/60"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="shrink-0 text-muted-foreground/60 transition-colors hover:text-foreground"
                title={t('mto.common.clear_search')}
                aria-label={t('mto.common.clear_search')}
              >
                <X size={13} />
              </button>
            )}
          </div>

          <div className="hidden min-w-0 lg:block">
            <MtoStatStrip
              total={total}
              counts={counts}
              totalLabel={t('mto.matching.total_label')}
              isLoading={isLoading}
            />
          </div>

          {canExport && (
            <button
              type="button"
              onClick={() => setExportOpen(true)}
              className="btn-sm btn-secondary shrink-0"
              title={t('mto.matching.export_title')}
            >
              <Download size={13} />
              <span className="hidden md:inline">{t('mto.matching.export')}</span>
            </button>
          )}

          <button
            type="button"
            onClick={async () => {
              try {
                await consolidate.mutateAsync(batchId)
                toast({ title: t('mto.matching.reconsolidate_success'), variant: 'success' })
              } catch {
                toast({ title: t('mto.matching.reconsolidate_error'), variant: 'error' })
              }
            }}
            disabled={consolidate.isPending}
            className="btn-sm btn-secondary shrink-0"
          >
            <RefreshCw size={13} className={consolidate.isPending ? 'animate-spin' : undefined} />
            <span className="hidden md:inline">{t('mto.matching.reconsolidate')}</span>
          </button>
        </div>

        <CoverageBar counts={counts} size="sm" />
      </div>

      {exportOpen && (
        <MtoExportAssistant
          open={exportOpen}
          onClose={() => setExportOpen(false)}
          batchId={batchId}
        />
      )}

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
            // Recherche repositionnée dans la barre d'actions ci-dessus : on
            // garde le filtrage (searchValue piloté), sans champ interne
            // (onSearchChange omis → pas de double champ de recherche).
            searchValue={search}
            emptyIcon={Package}
            emptyTitle={t('mto.matching.empty_title')}
            pageSize={50}
            expandAllSignal={expandSignal}
            collapseAllSignal={collapseSignal}
            columnToggle
            columnVisibility={columnVisibility}
            onColumnVisibilityChange={setColumnVisibility}
            nonHideableColumnIds={['article', 'actions']}
            toolbarRight={
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setExpandSignal((n) => n + 1)}
                  title={t('mto.matching.expand_all')}
                  className="inline-flex h-8 items-center gap-1 rounded-md border border-border bg-background px-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                >
                  <ChevronsUpDown size={14} />
                  <span className="hidden lg:inline">{t('mto.matching.expand_all')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setCollapseSignal((n) => n + 1)}
                  title={t('mto.matching.collapse_all')}
                  className="inline-flex h-8 items-center gap-1 rounded-md border border-border bg-background px-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                >
                  <ChevronsDownUp size={14} />
                  <span className="hidden lg:inline">{t('mto.matching.collapse_all')}</span>
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
  const { t } = useTranslation()
  const countFor = (v: string) => (v === '' ? total : counts[v] ?? 0)

  return (
    <div
      className="inline-flex shrink-0 items-center gap-0.5 rounded-md border border-border bg-muted/40 p-0.5"
      role="tablist"
      aria-label={t('mto.matching.filter_status')}
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
            <span className="hidden sm:inline">{t(seg.labelKey)}</span>
            <span className="sm:hidden">{seg.dot ? '' : t('mto.matching.all')}</span>
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
  if (status === 'verified') return <BadgeCell value={i18n.t('mto.verification.verified')} variant="success" />
  if (status === 'rejected') return <BadgeCell value={i18n.t('mto.verification.rejected')} variant="danger" />
  return <BadgeCell value={i18n.t('mto.verification.pending')} variant="neutral" />
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

// ── Onglet Croisement (design ↔ révisé) ────────────────────────────────────

/**
 * Onglet « Croisement » : compare 2 MTO d'un même projet (un Design, un
 * Révisé) et affiche les écarts item par item.
 *
 * Project-first comme l'onglet MTO : on réutilise la MÊME clé de persistance
 * (`mto.project`) que MtoProjectTab, donc le projet courant est partagé entre
 * les deux onglets. Sans projet → EmptyState.
 *
 * Deux sélecteurs (Design / Révisé) alimentés par useMtoBatchStats(projectId)
 * filtré par `role`. Au choix des deux → useMtoDiff → table du diff + bande de
 * stats + segmented filter par type + recherche.
 */
function CroisementTab() {
  const { t } = useTranslation()
  const [view, setView] = useFilterPersistence<MtoProjectView>(
    'mto.project',
    DEFAULT_PROJECT_VIEW,
  )
  const [pickerOpen, setPickerOpen] = useState(false)
  const projectId = view.projectId

  const [designId, setDesignId] = useState<string | null>(null)
  const [reviseId, setReviseId] = useState<string | null>(null)

  const { data: batches, isLoading: batchesLoading } = useMtoBatchStats(projectId)

  // Batches séparés par rôle pour alimenter les 2 sélecteurs.
  const designBatches = useMemo(
    () => (batches ?? []).filter((b) => b.role === 'design'),
    [batches],
  )
  const reviseBatches = useMemo(
    () => (batches ?? []).filter((b) => b.role === 'revise'),
    [batches],
  )

  const selectProject = (pid: string | null) => {
    setView({ projectId: pid })
    setDesignId(null)
    setReviseId(null)
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Sélecteur de projet — même puce que l'onglet MTO. */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2">
        <span className="shrink-0 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {t('mto.common.project')}
        </span>
        <ProjectChip
          projectId={projectId}
          onOpen={() => setPickerOpen(true)}
          onClear={() => selectProject(null)}
        />
      </div>

      <ProjectSelectorModal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        title={t('mto.common.choose_project')}
        selection={{
          mode: 'selected',
          projectIds: projectId ? [projectId] : [],
        }}
        onSelectionChange={(sel) => {
          selectProject(sel.projectIds[0] ?? null)
          setPickerOpen(false)
        }}
      />

      {!projectId ? (
        <EmptyState
          icon={GitCompareArrows}
          title={t('mto.croisement.empty_no_project_title')}
          description={t('mto.croisement.empty_no_project_desc')}
        />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          {/* Deux sélecteurs de batch par rôle. */}
          <div className="grid gap-3 border-b border-border px-4 py-3 md:grid-cols-2">
            <BatchRoleSelect
              label={t('mto.croisement.design_label')}
              dot="bg-info"
              batches={designBatches}
              value={designId}
              onChange={setDesignId}
              isLoading={batchesLoading}
              emptyHint={t('mto.croisement.design_empty_hint')}
            />
            <BatchRoleSelect
              label={t('mto.croisement.revise_label')}
              dot="bg-warning"
              batches={reviseBatches}
              value={reviseId}
              onChange={setReviseId}
              isLoading={batchesLoading}
              emptyHint={t('mto.croisement.revise_empty_hint')}
            />
          </div>

          {!designId || !reviseId ? (
            <EmptyState
              icon={ArrowLeftRight}
              title={t('mto.croisement.empty_select_title')}
              description={t('mto.croisement.empty_select_desc')}
            />
          ) : (
            <DiffView designId={designId} reviseId={reviseId} />
          )}
        </div>
      )}
    </div>
  )
}

/**
 * Sélecteur d'un batch MTO d'un rôle donné (native <select> + classe DS).
 * Pastille tokenisée + libellé. État vide explicite si aucun batch du rôle.
 */
function BatchRoleSelect({
  label,
  dot,
  batches,
  value,
  onChange,
  isLoading,
  emptyHint,
}: {
  label: string
  dot: string
  batches: MtoBatchStats[]
  value: string | null
  onChange: (id: string | null) => void
  isLoading?: boolean
  emptyHint: string
}) {
  const { t } = useTranslation()
  return (
    <div className="rounded-lg border border-border/60 bg-card px-3 py-2.5">
      <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        <span className={cn('h-2 w-2 shrink-0 rounded-full', dot)} />
        {label}
      </p>
      {isLoading ? (
        <Skeleton className="h-8 w-full" />
      ) : batches.length === 0 ? (
        <p className="text-xs italic text-muted-foreground">{emptyHint}</p>
      ) : (
        <select
          className="gl-form-input h-8 w-full text-sm"
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value || null)}
        >
          <option value="">{t('mto.common.choose_mto')}</option>
          {batches.map((b) => (
            <option key={b.id} value={b.id}>
              {mtoBatchLabel(b)} · {formatDate(b.created_at)} ·{' '}
              {t('mto.common.lines_count', { count: b.nb_lignes })}
            </option>
          ))}
        </select>
      )}
    </div>
  )
}

/**
 * Table du croisement de 2 MTO : récupère le diff (useMtoDiff), affiche la
 * bande de stats summary, un segmented filter par type d'écart + recherche, et
 * la DataTable des items (besoins design/révisé, écart coloré, type).
 */
function DiffView({ designId, reviseId }: { designId: string; reviseId: string }) {
  const { t } = useTranslation()
  const { data: diff, isLoading, isError } = useMtoDiff(designId, reviseId)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<'' | MtoDiffChangeType>('')

  const summary = diff?.summary
  const items = useMemo(
    () => (diff?.items ?? []).filter((it) => !typeFilter || it.change_type === typeFilter),
    [diff, typeFilter],
  )

  const columns = useMemo<ColumnDef<MtoDiffItem, unknown>[]>(
    () => [
      {
        id: 'designation',
        header: t('mto.diff.col_item'),
        cell: ({ row }) => (
          <span className="text-foreground">{row.original.designation ?? '—'}</span>
        ),
      },
      {
        id: 'diameter',
        header: t('mto.diff.col_diameter'),
        size: 90,
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">{row.original.diameter ?? '—'}</span>
        ),
      },
      {
        id: 'unite',
        header: t('mto.diff.col_unite'),
        size: 80,
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">{row.original.unite ?? '—'}</span>
        ),
      },
      {
        id: 'besoin_design',
        header: t('mto.diff.col_besoin_design'),
        size: 120,
        cell: ({ row }) => (
          <span className="tabular-nums text-foreground">{row.original.besoin_design}</span>
        ),
      },
      {
        id: 'besoin_revise',
        header: t('mto.diff.col_besoin_revise'),
        size: 120,
        cell: ({ row }) => (
          <span className="tabular-nums text-foreground">{row.original.besoin_revise}</span>
        ),
      },
      {
        id: 'delta',
        header: t('mto.diff.col_ecart'),
        size: 100,
        cell: ({ row }) => <DeltaCell delta={row.original.delta} />,
      },
      {
        id: 'change_type',
        header: t('mto.diff.col_type'),
        size: 120,
        cell: ({ row }) => (
          <BadgeCell
            value={t(DIFF_TYPE_LABEL_KEYS[row.original.change_type])}
            variant={DIFF_TYPE_VARIANTS[row.original.change_type]}
          />
        ),
      },
    ],
    [t],
  )

  if (isError) {
    return (
      <EmptyState
        icon={GitCompareArrows}
        title={t('mto.croisement.error_title')}
        description={t('mto.croisement.error_desc')}
      />
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Bande de stats summary + recherche (même gabarit que la vue
          rapprochement). */}
      <div className="space-y-1.5 border-b border-border px-4 py-2">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex h-8 min-w-[180px] flex-1 items-center gap-1.5 rounded-md border border-border bg-background px-2.5">
            <Search size={14} className="shrink-0 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('mto.croisement.search_placeholder')}
              className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/60"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="shrink-0 text-muted-foreground/60 transition-colors hover:text-foreground"
                title={t('mto.common.clear_search')}
                aria-label={t('mto.common.clear_search')}
              >
                <X size={13} />
              </button>
            )}
          </div>
          <div className="hidden min-w-0 lg:block">
            <DiffStatStrip summary={summary} isLoading={isLoading} />
          </div>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        <PanelContent scroll={false}>
          <DataTable<MtoDiffItem>
            columns={columns}
            data={items}
            isLoading={isLoading}
            getRowId={(row) => row.mto_key}
            searchValue={search}
            onSearchChange={setSearch}
            searchPlaceholder={t('mto.croisement.search_placeholder')}
            emptyIcon={GitCompareArrows}
            emptyTitle={t('mto.croisement.empty_filter_title')}
            storageKey="mto-diff"
            toolbarRight={
              <DiffTypeSegmented value={typeFilter} onChange={setTypeFilter} summary={summary} />
            }
          />
        </PanelContent>
      </div>
    </div>
  )
}

/**
 * Cellule « Écart » : delta signé, coloré (+ success / − destructive / 0
 * muted). Tabular-nums pour l'alignement.
 */
function DeltaCell({ delta }: { delta: number }) {
  const cls =
    delta > 0 ? 'text-success' : delta < 0 ? 'text-destructive' : 'text-muted-foreground'
  const sign = delta > 0 ? '+' : ''
  return <span className={cn('tabular-nums font-medium', cls)}>{`${sign}${delta}`}</span>
}

/**
 * Bande de stats compacte du croisement (added / removed / changed /
 * unchanged) — même esprit visuel que MtoStatStrip (pastilles tokenisées +
 * valeur + libellé), adaptée aux 4 compteurs du diff.
 */
function DiffStatStrip({
  summary,
  isLoading,
}: {
  summary: Record<MtoDiffChangeType, number> | undefined
  isLoading?: boolean
}) {
  const { t } = useTranslation()
  if (isLoading) {
    return (
      <div className="flex h-6 items-center gap-3" aria-hidden>
        <span className="h-3.5 w-24 animate-pulse rounded bg-muted" />
        <span className="h-3.5 w-24 animate-pulse rounded bg-muted" />
        <span className="h-3.5 w-24 animate-pulse rounded bg-muted" />
        <span className="h-3.5 w-24 animate-pulse rounded bg-muted" />
      </div>
    )
  }
  const s = summary ?? { added: 0, removed: 0, changed: 0, unchanged: 0 }
  const stats: { dot: string; value: number; label: string }[] = [
    { dot: 'bg-success', value: s.added, label: t('mto.diff.stat_added') },
    { dot: 'bg-destructive', value: s.removed, label: t('mto.diff.stat_removed') },
    { dot: 'bg-warning', value: s.changed, label: t('mto.diff.stat_changed') },
    { dot: 'bg-muted-foreground/40', value: s.unchanged, label: t('mto.diff.stat_unchanged') },
  ]
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
      {stats.map((st, i) => (
        <span key={st.label} className="inline-flex items-center gap-x-3">
          {i > 0 && <span aria-hidden className="h-4 w-px shrink-0 bg-border" />}
          <span className="inline-flex min-w-0 items-baseline gap-1.5 whitespace-nowrap">
            <span className={cn('mb-0.5 h-2 w-2 shrink-0 self-center rounded-full', st.dot)} />
            <span className="text-sm font-semibold tabular-nums text-foreground">{st.value}</span>
            <span className="text-xs text-muted-foreground">{st.label}</span>
          </span>
        </span>
      ))}
    </div>
  )
}

/**
 * Segmented control de filtre par type d'écart (Tous · Ajouté · Supprimé ·
 * Modifié · Inchangé) avec compteurs. Même pattern DS que StatusSegmented.
 */
function DiffTypeSegmented({
  value,
  onChange,
  summary,
}: {
  value: '' | MtoDiffChangeType
  onChange: (v: '' | MtoDiffChangeType) => void
  summary: Record<MtoDiffChangeType, number> | undefined
}) {
  const { t } = useTranslation()
  const total = summary
    ? summary.added + summary.removed + summary.changed + summary.unchanged
    : 0
  const countFor = (v: '' | MtoDiffChangeType) =>
    v === '' ? total : summary?.[v] ?? 0

  return (
    <div
      className="inline-flex shrink-0 items-center gap-0.5 rounded-md border border-border bg-muted/40 p-0.5"
      role="tablist"
      aria-label={t('mto.croisement.filter_type')}
    >
      {DIFF_TYPE_SEGMENTS.map((seg) => {
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
            <span className="hidden sm:inline">{t(seg.labelKey)}</span>
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

// ── Onglet Réconciliation (fourni/commandé vs consommé) ─────────────────────

/**
 * Onglet « Réconciliation » : pour un MTO d'un projet, rapproche ce qui a été
 * fourni/commandé de ce qui a été réellement consommé, et expose le RELIQUAT
 * à retourner à PERENCO (a_retourner).
 *
 * Project-first comme les onglets MTO / Croisement : on réutilise la MÊME clé
 * de persistance (`mto.project`), donc le projet courant est partagé. Sans
 * projet → EmptyState. Avec projet → sélecteur de MTO (tous les batches du
 * projet) puis import de la consommation + table de réconciliation.
 */
function ReconciliationTab() {
  const { t } = useTranslation()
  const [view, setView] = useFilterPersistence<MtoProjectView>(
    'mto.project',
    DEFAULT_PROJECT_VIEW,
  )
  const [pickerOpen, setPickerOpen] = useState(false)
  const projectId = view.projectId

  const [batchId, setBatchId] = useState<string | null>(null)

  const { data: batches, isLoading: batchesLoading } = useMtoBatchStats(projectId)

  const selectProject = (pid: string | null) => {
    setView({ projectId: pid })
    setBatchId(null)
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Sélecteur de projet — même puce que les autres onglets. */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2">
        <span className="shrink-0 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {t('mto.common.project')}
        </span>
        <ProjectChip
          projectId={projectId}
          onOpen={() => setPickerOpen(true)}
          onClear={() => selectProject(null)}
        />
      </div>

      <ProjectSelectorModal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        title={t('mto.common.choose_project')}
        selection={{
          mode: 'selected',
          projectIds: projectId ? [projectId] : [],
        }}
        onSelectionChange={(sel) => {
          selectProject(sel.projectIds[0] ?? null)
          setPickerOpen(false)
        }}
      />

      {!projectId ? (
        <EmptyState
          icon={PackageCheck}
          title={t('mto.reconcile.empty_no_project_title')}
          description={t('mto.reconcile.empty_no_project_desc')}
        />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          {/* Sélecteur de MTO du projet (tous rôles confondus). */}
          <div className="border-b border-border px-4 py-3">
            <ReconcileBatchSelect
              batches={batches ?? []}
              value={batchId}
              onChange={setBatchId}
              isLoading={batchesLoading}
            />
          </div>

          {!batchId ? (
            <EmptyState
              icon={PackageCheck}
              title={t('mto.reconcile.empty_select_title')}
              description={t('mto.reconcile.empty_select_desc')}
            />
          ) : (
            <ReconciliationView projectId={projectId} batchId={batchId} />
          )}
        </div>
      )}
    </div>
  )
}

/**
 * Sélecteur d'un batch MTO du projet (native <select> + classe DS). Liste TOUS
 * les batches (pas de filtre par rôle) : la consommation se réconcilie contre
 * n'importe quel MTO. Pastille tokenisée par rôle dans le libellé.
 */
function ReconcileBatchSelect({
  batches,
  value,
  onChange,
  isLoading,
}: {
  batches: MtoBatchStats[]
  value: string | null
  onChange: (id: string | null) => void
  isLoading?: boolean
}) {
  const { t } = useTranslation()
  return (
    <div className="rounded-lg border border-border/60 bg-card px-3 py-2.5">
      <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        <PackageCheck size={13} className="shrink-0 text-primary" />
        {t('mto.reconcile.select_label')}
      </p>
      {isLoading ? (
        <Skeleton className="h-8 w-full" />
      ) : batches.length === 0 ? (
        <p className="text-xs italic text-muted-foreground">{t('mto.reconcile.select_empty')}</p>
      ) : (
        <select
          className="gl-form-input h-8 w-full text-sm"
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value || null)}
        >
          <option value="">{t('mto.common.choose_mto')}</option>
          {batches.map((b) => (
            <option key={b.id} value={b.id}>
              {mtoBatchLabel(b)} · {mtoRoleLabel(b.role)} · {formatDate(b.created_at)} ·{' '}
              {t('mto.common.lines_count', { count: b.nb_lignes })}
            </option>
          ))}
        </select>
      )}
    </div>
  )
}

/**
 * Vue de réconciliation d'un MTO : import de la consommation (gated) + table
 * fourni/commandé vs consommé avec le reliquat à retourner, bande de stats
 * summary, recherche, filtre « à retourner > 0 » et export CSV de la liste de
 * retour.
 */
function ReconciliationView({
  projectId,
  batchId,
}: {
  projectId: string
  batchId: string
}) {
  const { t } = useTranslation()
  const { hasPermission } = usePermission()
  const { data: reconcile, isLoading, isError } = useReconciliation(batchId)
  const [search, setSearch] = useState('')
  const [onlyReturn, setOnlyReturn] = useState(false)

  const canImport = hasPermission('mto.requirement.import') || hasPermission('mto.admin')

  const summary = reconcile?.summary
  const items = useMemo(
    () =>
      (reconcile?.items ?? []).filter((it) => !onlyReturn || it.a_retourner > 0),
    [reconcile, onlyReturn],
  )

  const columns = useMemo<ColumnDef<ReconcileItem, unknown>[]>(
    () => [
      {
        id: 'code_article',
        header: t('mto.reconcile.col_article'),
        size: 160,
        cell: ({ row }) => (
          <span className="font-mono text-xs text-primary">{row.original.code_article}</span>
        ),
      },
      {
        id: 'designation',
        header: t('mto.reconcile.col_designation'),
        cell: ({ row }) => (
          <span className="text-foreground">{row.original.designation ?? '—'}</span>
        ),
      },
      {
        id: 'besoin',
        header: t('mto.reconcile.col_besoin'),
        size: 110,
        cell: ({ row }) => (
          <span className="tabular-nums text-foreground">{row.original.besoin}</span>
        ),
      },
      {
        id: 'a_commander',
        header: t('mto.reconcile.col_commande'),
        size: 110,
        cell: ({ row }) => (
          <span className="tabular-nums text-foreground">{row.original.a_commander}</span>
        ),
      },
      {
        id: 'consomme',
        header: t('mto.reconcile.col_consomme'),
        size: 110,
        cell: ({ row }) => (
          <span className="tabular-nums text-foreground">{row.original.consomme}</span>
        ),
      },
      {
        id: 'a_retourner',
        header: t('mto.reconcile.col_a_retourner'),
        size: 120,
        cell: ({ row }) => <ReturnCell value={row.original.a_retourner} />,
      },
    ],
    [t],
  )

  if (isError) {
    return (
      <EmptyState
        icon={PackageCheck}
        title={t('mto.reconcile.error_title')}
        description={t('mto.reconcile.error_desc')}
      />
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Barre d'actions : import consommation · recherche · stats · export.
          Filtre « à retourner > 0 » + bande de stats summary collés dessous. */}
      <div className="space-y-1.5 border-b border-border px-4 py-2">
        <div className="flex flex-wrap items-center gap-2">
          {canImport && (
            <ImportConsumptionButton projectId={projectId} batchId={batchId} />
          )}

          <div className="flex h-8 min-w-[180px] flex-1 items-center gap-1.5 rounded-md border border-border bg-background px-2.5">
            <Search size={14} className="shrink-0 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('mto.reconcile.search_placeholder')}
              className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/60"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="shrink-0 text-muted-foreground/60 transition-colors hover:text-foreground"
                title={t('mto.common.clear_search')}
                aria-label={t('mto.common.clear_search')}
              >
                <X size={13} />
              </button>
            )}
          </div>

          <div className="hidden min-w-0 lg:block">
            <ReconcileStatStrip summary={summary} isLoading={isLoading} />
          </div>

          <button
            type="button"
            onClick={() => exportReturnList(reconcile?.items ?? [], batchId)}
            disabled={!summary || summary.total_a_retourner <= 0}
            className="btn-sm btn-secondary shrink-0"
            title={t('mto.reconcile.export_return_title')}
          >
            <Download size={13} />
            <span className="hidden md:inline">{t('mto.reconcile.export_return')}</span>
          </button>
        </div>

        <ReconcileStatStrip
          summary={summary}
          isLoading={isLoading}
          className="lg:hidden"
        />
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        <PanelContent scroll={false}>
          <DataTable<ReconcileItem>
            columns={columns}
            data={items}
            isLoading={isLoading}
            getRowId={(row) => row.code_article}
            searchValue={search}
            onSearchChange={setSearch}
            searchPlaceholder={t('mto.reconcile.search_placeholder')}
            emptyIcon={PackageCheck}
            emptyTitle={
              onlyReturn ? t('mto.reconcile.empty_no_return') : t('mto.reconcile.empty_no_lines')
            }
            storageKey="mto-reconciliation"
            toolbarRight={
              <button
                type="button"
                onClick={() => setOnlyReturn((v) => !v)}
                role="switch"
                aria-checked={onlyReturn}
                className={cn(
                  'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition-colors',
                  onlyReturn
                    ? 'border-warning/40 bg-warning/10 text-warning'
                    : 'border-border bg-background text-muted-foreground hover:text-foreground',
                )}
              >
                <span
                  className={cn(
                    'h-1.5 w-1.5 shrink-0 rounded-full',
                    onlyReturn ? 'bg-warning' : 'bg-muted-foreground/40',
                  )}
                />
                {t('mto.reconcile.only_return_toggle')}
              </button>
            }
          />
        </PanelContent>
      </div>
    </div>
  )
}

/**
 * Cellule « À retourner » : reliquat coloré (>0 = warning, 0 = muted).
 * Tabular-nums pour l'alignement.
 */
function ReturnCell({ value }: { value: number }) {
  const cls = value > 0 ? 'text-warning' : 'text-muted-foreground'
  return <span className={cn('tabular-nums font-medium', cls)}>{value}</span>
}

/**
 * Bouton « Importer la consommation » (file picker → POST /import/consumption)
 * pour un projet + un MTO donné. Toast succès/erreur. Pattern aligné sur
 * ImportMtoButton (input file caché + ToolbarButton primaire).
 */
function ImportConsumptionButton({
  projectId,
  batchId,
}: {
  projectId: string
  batchId: string
}) {
  const { t } = useTranslation()
  const { toast } = useToast()
  const importConsumption = useImportConsumption()
  const inputRef = useRef<HTMLInputElement | null>(null)

  return (
    <>
      <ToolbarButton
        icon={FileUp}
        label={importConsumption.isPending ? t('mto.reconcile.import_pending') : t('mto.reconcile.import_button')}
        variant="primary"
        disabled={importConsumption.isPending}
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
            const res = await importConsumption.mutateAsync({ file, projectId, batchId })
            toast({
              title: t('mto.reconcile.import_success', { count: res.imported }),
              variant: 'success',
            })
          } catch {
            toast({ title: t('mto.reconcile.import_error'), variant: 'error' })
          } finally {
            e.target.value = ''
          }
        }}
      />
    </>
  )
}

/**
 * Bande de stats compacte de la réconciliation (lignes · besoin · consommé ·
 * à retourner) — même esprit visuel que MtoStatStrip (pastilles tokenisées +
 * valeur + libellé), adaptée aux 4 compteurs du summary.
 */
function ReconcileStatStrip({
  summary,
  isLoading,
  className,
}: {
  summary: ReconcileSummary | undefined
  isLoading?: boolean
  className?: string
}) {
  const { t } = useTranslation()
  if (isLoading) {
    return (
      <div className={cn('flex h-6 items-center gap-3', className)} aria-hidden>
        <span className="h-3.5 w-20 animate-pulse rounded bg-muted" />
        <span className="h-3.5 w-24 animate-pulse rounded bg-muted" />
        <span className="h-3.5 w-24 animate-pulse rounded bg-muted" />
        <span className="h-3.5 w-28 animate-pulse rounded bg-muted" />
      </div>
    )
  }
  const s = summary ?? { lines: 0, total_besoin: 0, total_consomme: 0, total_a_retourner: 0 }
  const stats: { dot: string | null; value: number; label: string }[] = [
    { dot: null, value: s.lines, label: t('mto.reconcile.stat_lines') },
    { dot: 'bg-info', value: s.total_besoin, label: t('mto.reconcile.stat_besoin') },
    { dot: 'bg-success', value: s.total_consomme, label: t('mto.reconcile.stat_consomme') },
    { dot: 'bg-warning', value: s.total_a_retourner, label: t('mto.reconcile.stat_a_retourner') },
  ]
  return (
    <div className={cn('flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1', className)}>
      {stats.map((st, i) => (
        <span key={st.label} className="inline-flex items-center gap-x-3">
          {i > 0 && <span aria-hidden className="h-4 w-px shrink-0 bg-border" />}
          <span className="inline-flex min-w-0 items-baseline gap-1.5 whitespace-nowrap">
            {st.dot && (
              <span className={cn('mb-0.5 h-2 w-2 shrink-0 self-center rounded-full', st.dot)} />
            )}
            <span className="text-sm font-semibold tabular-nums text-foreground">{st.value}</span>
            <span className="text-xs text-muted-foreground">{st.label}</span>
          </span>
        </span>
      ))}
    </div>
  )
}

/**
 * Génère et télécharge côté front un CSV de la liste de retour (items où
 * a_retourner > 0) : code, désignation, à retourner. Pas d'endpoint serveur —
 * Blob + ancre programmatique. CSV protégé contre l'injection de formules et
 * préfixé d'un BOM UTF-8 (Excel-friendly).
 */
function exportReturnList(items: ReconcileItem[], batchId: string): void {
  const toReturn = items.filter((it) => it.a_retourner > 0)
  if (toReturn.length === 0) return

  // Mitige l'injection de formules CSV (=, +, -, @, tab, CR en tête).
  const safe = (value: unknown): string => {
    const s = String(value ?? '')
    if (!s) return s
    const first = s.charAt(0)
    if (['=', '+', '-', '@', '\t', '\r'].includes(first)) return `'${s}`
    return s
  }
  // Échappe un champ CSV (guillemets doublés, quote si séparateur/quote/CRLF).
  const cell = (value: unknown): string => {
    const s = safe(value)
    return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }

  const header = [
    i18n.t('mto.reconcile.csv_code_article'),
    i18n.t('mto.reconcile.csv_designation'),
    i18n.t('mto.reconcile.csv_a_retourner'),
  ]
  const rows = toReturn.map((it) => [
    cell(it.code_article),
    cell(it.designation ?? ''),
    cell(it.a_retourner),
  ])
  const csv = [header.map(cell).join(';'), ...rows.map((r) => r.join(';'))].join('\r\n')

  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
  const objectUrl = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = objectUrl
  a.download = `retour-perenco-${batchId.slice(0, 8)}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
}

// ── Onglet Analytics (statistiques d'approvisionnement) ─────────────────────

/**
 * Onglet « Analytics » : statistiques transverses d'approvisionnement.
 *
 * Particularité vs les autres onglets : le projet est OPTIONNEL. On réutilise la
 * MÊME clé de persistance (`mto.project`) mais on autorise le mode global :
 *   - projet sélectionné → analytics cadrées sur ce projet ;
 *   - « Tous les projets » (projet effacé) → analytics globales de l'entité.
 * La requête est donc TOUJOURS active (pas d'EmptyState bloquant sans projet).
 */
function AnalyticsTab() {
  const { t } = useTranslation()
  const [view, setView] = useFilterPersistence<MtoProjectView>(
    'mto.project',
    DEFAULT_PROJECT_VIEW,
  )
  const [pickerOpen, setPickerOpen] = useState(false)
  const projectId = view.projectId

  const { data, isLoading, isError } = useMtoAnalytics(projectId)

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Sélecteur de projet — OPTIONNEL : puce projet OU « Tous les projets ».
          Effacer la puce repasse en vue globale entité (pas d'EmptyState). */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2">
        <span className="shrink-0 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {t('mto.common.scope')}
        </span>
        <AnalyticsScopeChip
          projectId={projectId}
          onOpen={() => setPickerOpen(true)}
          onClearToGlobal={() => setView({ projectId: null })}
        />
      </div>

      <ProjectSelectorModal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        title={t('mto.common.choose_project')}
        selection={{
          mode: 'selected',
          projectIds: projectId ? [projectId] : [],
        }}
        onSelectionChange={(sel) => {
          setView({ projectId: sel.projectIds[0] ?? null })
          setPickerOpen(false)
        }}
      />

      {isError ? (
        <EmptyState
          icon={BarChart3}
          variant="error"
          title={t('mto.analytics.error_title')}
          description={t('mto.analytics.error_desc')}
        />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          {/* Bande KPI : disponibilité · à commander · consommé · articles · MTO. */}
          <div className="border-b border-border px-4 py-2">
            <AnalyticsKpiStrip overview={data?.overview} isLoading={isLoading} />
          </div>

          {/* 4 panneaux (grille 2 colonnes responsive) avec barres de proportion. */}
          <PanelContent>
            <div className="grid gap-3 p-4 lg:grid-cols-2">
              <AnalyticsPanel
                title={t('mto.analytics.panel_top_consommes')}
                icon={PackageCheck}
                isLoading={isLoading}
                emptyHint={t('mto.analytics.panel_top_consommes_empty')}
                rows={(data?.top_consommes ?? []).map(topItemToBar)}
              />
              <AnalyticsPanel
                title={t('mto.analytics.panel_top_demandes')}
                icon={Package}
                isLoading={isLoading}
                emptyHint={t('mto.analytics.panel_top_demandes_empty')}
                rows={(data?.top_demandes ?? []).map(topItemToBar)}
              />
              <AnalyticsPanel
                title={t('mto.analytics.panel_frequence')}
                icon={RefreshCw}
                isLoading={isLoading}
                emptyHint={t('mto.analytics.panel_frequence_empty')}
                rows={(data?.top_frequence ?? []).map(freqItemToBar)}
              />
              <AnalyticsPanel
                title={t('mto.analytics.panel_co_occurrence')}
                icon={GitCompareArrows}
                isLoading={isLoading}
                emptyHint={t('mto.analytics.panel_co_occurrence_empty')}
                rows={(data?.co_occurrence ?? []).map(pairToBar)}
              />
            </div>
          </PanelContent>
        </div>
      )}
    </div>
  )
}

/**
 * Puce de périmètre des analytics : soit le projet courant (avec « changer »),
 * soit l'état « Tous les projets » (vue globale entité). Contrairement à
 * ProjectChip, l'état sans projet n'est PAS une invite — c'est un mode valide.
 */
function AnalyticsScopeChip({
  projectId,
  onOpen,
  onClearToGlobal,
}: {
  projectId: string | null
  onOpen: () => void
  onClearToGlobal: () => void
}) {
  const { t } = useTranslation()
  const { data: project } = useProject(projectId ?? undefined)

  if (!projectId) {
    // Mode global : pastille « Tous les projets » + bouton pour cibler un projet.
    return (
      <div className="inline-flex h-8 items-center gap-1 rounded-md border border-border bg-card pl-2.5 pr-1 text-sm">
        <Boxes size={14} className="shrink-0 text-primary" />
        <span className="font-medium text-foreground">{t('mto.common.all_projects')}</span>
        <button
          type="button"
          onClick={onOpen}
          title={t('mto.common.target_project')}
          aria-label={t('mto.common.target_project')}
          className="ml-1 inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <Pencil size={13} />
        </button>
      </div>
    )
  }

  const label = project ? `${project.name} (${project.code})` : '…'

  return (
    <div className="inline-flex h-8 items-center gap-1 rounded-md border border-border bg-card pl-2.5 pr-1 text-sm">
      <FolderKanban size={14} className="shrink-0 text-primary" />
      <span className="max-w-[280px] truncate font-medium text-foreground" title={label}>
        {label}
      </span>
      <button
        type="button"
        onClick={onOpen}
        title={t('mto.common.change_project')}
        aria-label={t('mto.common.change_project')}
        className="ml-1 inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        <Pencil size={13} />
      </button>
      <button
        type="button"
        onClick={onClearToGlobal}
        title={t('mto.common.view_all_projects')}
        aria-label={t('mto.common.view_all_projects')}
        className="inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        <X size={13} />
      </button>
    </div>
  )
}

/** Une ligne de panneau analytics : libellé + (sous-libellé) + valeur. */
interface AnalyticsBarRow {
  key: string
  label: string
  sublabel?: string | null
  value: number
}

/** Map un MtoAnalyticsTopItem (code/designation/total) en ligne de barre. */
function topItemToBar(it: MtoAnalyticsTopItem): AnalyticsBarRow {
  return {
    key: it.code_article,
    label: it.code_article,
    sublabel: it.designation,
    value: it.total,
  }
}

/** Map un MtoAnalyticsFreqItem (code/designation/count) en ligne de barre. */
function freqItemToBar(it: MtoAnalyticsFreqItem): AnalyticsBarRow {
  return {
    key: it.code_article,
    label: it.code_article,
    sublabel: it.designation,
    value: it.count,
  }
}

/** Map une paire de co-occurrence (article_a + article_b) en ligne de barre. */
function pairToBar(p: MtoAnalyticsPair): AnalyticsBarRow {
  return {
    key: `${p.article_a}+${p.article_b}`,
    label: `${p.article_a} + ${p.article_b}`,
    sublabel: null,
    value: p.count,
  }
}

/**
 * Bande KPI compacte des analytics (taux dispo · à commander · consommé ·
 * articles · MTO). Même idiome DS que MtoStatStrip / ReconcileStatStrip
 * (pastille tokenisée + valeur font-semibold + libellé muted, séparateurs fins),
 * adaptée aux 5 indicateurs de l'overview qui ne mappent pas la forme fixe
 * « couverture » de MtoStatStrip.
 */
function AnalyticsKpiStrip({
  overview,
  isLoading,
}: {
  overview: MtoAnalyticsOverview | undefined
  isLoading?: boolean
}) {
  const { t } = useTranslation()
  if (isLoading) {
    return (
      <div className="flex h-6 items-center gap-3" aria-hidden>
        <span className="h-3.5 w-28 animate-pulse rounded bg-muted" />
        <span className="h-3.5 w-24 animate-pulse rounded bg-muted" />
        <span className="h-3.5 w-24 animate-pulse rounded bg-muted" />
        <span className="h-3.5 w-20 animate-pulse rounded bg-muted" />
        <span className="h-3.5 w-20 animate-pulse rounded bg-muted" />
      </div>
    )
  }
  const o =
    overview ?? {
      nb_batches: 0,
      nb_articles: 0,
      taux_dispo: 0,
      total_a_commander: 0,
      total_consomme: 0,
    }
  const stats: { dot: string | null; value: string | number; label: string }[] = [
    { dot: 'bg-success', value: `${Math.round(o.taux_dispo)}%`, label: t('mto.analytics.kpi_disponibilite') },
    { dot: 'bg-destructive', value: o.total_a_commander, label: t('mto.analytics.kpi_a_commander') },
    { dot: 'bg-info', value: o.total_consomme, label: t('mto.analytics.kpi_consomme') },
    { dot: null, value: o.nb_articles, label: t('mto.analytics.kpi_articles') },
    { dot: null, value: o.nb_batches, label: t('mto.analytics.kpi_mto') },
  ]
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
      {stats.map((st, i) => (
        <span key={st.label} className="inline-flex items-center gap-x-3">
          {i > 0 && <span aria-hidden className="h-4 w-px shrink-0 bg-border" />}
          <span className="inline-flex min-w-0 items-baseline gap-1.5 whitespace-nowrap">
            {st.dot && (
              <span className={cn('mb-0.5 h-2 w-2 shrink-0 self-center rounded-full', st.dot)} />
            )}
            <span className="text-sm font-semibold tabular-nums text-foreground">{st.value}</span>
            <span className="text-xs text-muted-foreground">{st.label}</span>
          </span>
        </span>
      ))}
    </div>
  )
}

/**
 * Panneau analytics : titre + mini-table « top N » avec barre de proportion
 * (largeur = valeur / max). Skeleton en chargement, EmptyState compact si vide
 * (normal tant qu'il y a peu d'historique). Affiche au plus 15 lignes.
 */
function AnalyticsPanel({
  title,
  icon: Icon,
  rows,
  isLoading,
  emptyHint,
}: {
  title: string
  icon: LucideIcon
  rows: AnalyticsBarRow[]
  isLoading?: boolean
  emptyHint: string
}) {
  const { t } = useTranslation()
  const top = rows.slice(0, 15)
  const max = top.reduce((m, r) => Math.max(m, r.value), 0)

  return (
    <section className="flex min-w-0 flex-col rounded-lg border border-border/60 bg-card">
      <header className="flex items-center gap-1.5 border-b border-border/60 px-3 py-2">
        <Icon size={14} className="shrink-0 text-primary" />
        <h3 className="text-xs font-semibold uppercase tracking-wide text-foreground">{title}</h3>
      </header>
      <div className="p-3">
        {isLoading ? (
          <div className="space-y-2.5">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <Skeleton className="h-3 w-32" />
                  <Skeleton className="h-3 w-10" />
                </div>
                <Skeleton className="h-1.5 w-full rounded-full" />
              </div>
            ))}
          </div>
        ) : top.length === 0 ? (
          <EmptyState
            icon={Icon}
            size="compact"
            title={t('mto.analytics.panel_empty_title')}
            description={emptyHint}
          />
        ) : (
          <ol className="space-y-2">
            {top.map((row) => (
              <BarRow key={row.key} row={row} max={max} />
            ))}
          </ol>
        )}
      </div>
    </section>
  )
}

/**
 * Une ligne de palmarès : libellé (+ sous-libellé optionnel) et valeur alignée,
 * surplombant une barre de proportion (largeur = value / max). La largeur est le
 * SEUL style inline autorisé (proportion dynamique) ; couleur via token DS.
 */
function BarRow({ row, max }: { row: AnalyticsBarRow; max: number }) {
  const pct = max > 0 ? Math.max(2, Math.round((row.value / max) * 100)) : 0
  const title = row.sublabel ? `${row.label} — ${row.sublabel}` : row.label

  return (
    <li className="space-y-1">
      <div className="flex items-baseline justify-between gap-2">
        <span className="min-w-0 truncate text-xs text-foreground" title={title}>
          <span className="font-mono text-primary">{row.label}</span>
          {row.sublabel ? (
            <span className="ml-1.5 text-muted-foreground">{row.sublabel}</span>
          ) : null}
        </span>
        <span className="shrink-0 text-xs font-semibold tabular-nums text-foreground">
          {row.value}
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted/50">
        <div
          className="h-full rounded-full bg-primary/70"
          style={{ width: `${pct}%` }}
          aria-hidden
        />
      </div>
    </li>
  )
}

// ── Onglet Catalogue & Stock ───────────────────────────────────────────────

function CatalogueStockTab() {
  const { t } = useTranslation()
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
        header: t('mto.catalogue.col_code'),
        size: 160,
        cell: ({ row }) => (
          <span className="font-mono text-xs text-primary">{row.original.code}</span>
        ),
      },
      {
        id: 'designation',
        header: t('mto.catalogue.col_designation'),
        cell: ({ row }) => <span className="text-foreground">{row.original.designation}</span>,
      },
      {
        id: 'famille',
        header: t('mto.catalogue.col_famille'),
        size: 180,
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">{row.original.famille ?? '—'}</span>
        ),
      },
    ],
    [t],
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Bandeau import catalogue + stock. */}
      {(canImportCatalogue || canImportStock) && (
        <div className="grid gap-3 border-b border-border px-4 py-3 md:grid-cols-2">
          {canImportCatalogue && (
            <div className="rounded-lg border border-border/60 bg-card px-3 py-3">
              <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                {t('mto.catalogue.catalogue_sap')}
              </p>
              <ToolbarButton
                icon={FileUp}
                label={importCatalogue.isPending ? t('mto.catalogue.import_pending') : t('mto.catalogue.import_catalogue')}
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
                      title: t('mto.catalogue.import_catalogue_success', { count: res.imported }),
                      variant: 'success',
                    })
                  } catch {
                    toast({ title: t('mto.catalogue.import_catalogue_error'), variant: 'error' })
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
                {t('mto.catalogue.stock_state')}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  value={stockLabel}
                  onChange={(e) => setStockLabel(e.target.value)}
                  placeholder={t('mto.catalogue.stock_label_placeholder')}
                  className="gl-form-input h-8 flex-1 text-xs"
                />
                <ToolbarButton
                  icon={FileUp}
                  label={importStock.isPending ? t('mto.catalogue.import_pending') : t('mto.catalogue.import_stock')}
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
                      title: t('mto.catalogue.import_stock_success', { count: res.imported }),
                      variant: 'success',
                    })
                    setStockLabel('')
                  } catch {
                    toast({ title: t('mto.catalogue.import_stock_error'), variant: 'error' })
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
            placeholder={t('mto.catalogue.search_placeholder')}
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/60"
          />
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        {search.trim().length < 2 ? (
          <EmptyState
            icon={Boxes}
            title={t('mto.catalogue.search_title')}
            description={t('mto.catalogue.search_desc')}
          />
        ) : (
          <PanelContent scroll={false}>
            <DataTable<NonNullable<typeof results>[number]>
              columns={columns}
              data={results ?? []}
              isLoading={isFetching}
              emptyIcon={Boxes}
              emptyTitle={t('mto.catalogue.empty_title')}
              storageKey="mto-catalogue"
            />
          </PanelContent>
        )}
      </div>
    </div>
  )
}

export default MtoPage
