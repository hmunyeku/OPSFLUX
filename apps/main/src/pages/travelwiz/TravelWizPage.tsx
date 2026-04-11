/**
 * TravelWiz page — Dashboard, Voyages, Manifestes PAX, Cargo, Vecteurs.
 *
 * Static Panel: tab bar + DataTable per tab.
 * Dynamic Panel: create/detail forms per entity.
 */
import { useState, useEffect, useCallback, useMemo, Component, type ReactNode, type ErrorInfo } from 'react'
import {
  Plane, Ship, Package, FileText, Plus, LayoutDashboard,
  Anchor, Truck, Users, ArrowRight, Calendar, Weight,
  Loader2, Pencil, Trash2, Save, MapPin, AlertTriangle,
  Bell, CheckCircle2, XCircle, CloudSun, Route,
  BarChart3, Map as MapIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { DataTable } from '@/components/ui/DataTable/DataTable'
import type { ColumnDef } from '@tanstack/react-table'
import { useDebounce } from '@/hooks/useDebounce'
import { usePageSize } from '@/hooks/usePageSize'
import { PanelHeader, PanelContent, ToolbarButton } from '@/components/layout/PanelHeader'
import { TabBar } from '@/components/ui/Tabs'
import { useUIStore } from '@/stores/uiStore'
import {
  DynamicPanelShell,
  PanelContentLayout,
  FormSection,
  FormGrid,
  DynamicPanelField,
  PanelActionButton,
  DangerConfirmButton,
  DetailRow,
  SectionColumns,
  panelInputClass,
} from '@/components/layout/DynamicPanel'
import { registerPanelRenderer } from '@/components/layout/DetachedPanelRenderer'
import { TagManager } from '@/components/shared/TagManager'
import { NoteManager } from '@/components/shared/NoteManager'
import { AttachmentManager } from '@/components/shared/AttachmentManager'
import { ExportWizard } from '@/components/shared/ExportWizard'
import { AssetPicker } from '@/components/shared/AssetPicker'
import { ProjectPicker } from '@/components/shared/ProjectPicker'
import { ImputationPicker } from '@/components/shared/ImputationPicker'
import { CompanyPicker } from '@/components/shared/CompanyPicker'
import { UserPicker } from '@/components/shared/UserPicker'
import { ContactPicker } from '@/components/shared/ContactPicker'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { useDictionaryOptions, useDictionaryLabels } from '@/hooks/useDictionary'
import {
  useVoyages,
  useVoyage,
  useCreateVoyage,
  useUpdateVoyage,
  useDeleteVoyage,
  useUpdateVoyageStatus,
  useCloseTrip,
  useVoyagePaxManifestPdf,
  useVoyageCargoManifestPdf,
  useVoyageStops,
  useVoyageManifests,
  useVoyageCapacity,
  useVoyageEvents,
  useTripKpis,
  useVoyageCargoOperationsReport,
  useVectors,
  useVector,
  useCreateVector,
  useUpdateVector,
  useDeleteVector,
  useVectorZones,
  useAllManifests,
  useValidateManifest,
  useTripsToday,
  useFleetKpis,
  usePickupRounds,
  usePickupRound,
  useClosePickupRound,
  useLatestWeather,
  useRotations,
  useCreateRotation,
  useUpdateRotation,
} from '@/hooks/useTravelWiz'
import { usePermission } from '@/hooks/usePermission'
import { ModuleDashboard } from '@/components/dashboard/ModuleDashboard'
import { FleetMap } from '@/components/travelwiz/FleetMap'
import { CreateArticlePanel } from '@/pages/packlog/PackLogArticlePanels'
import { CargoDetailPanel as PackLogCargoDetailPanel } from '@/pages/packlog/PackLogCargoDetailPanel'
import {
  CargoWorkspaceProvider,
  useCargoWorkspace,
  useCargoDictionaryCategory,
  useWorkspaceApplyCargoRequestLoadingOption,
  useWorkspaceCargo,
  useWorkspaceCargoRequest,
  useWorkspaceCargoRequestLoadingOptions,
  useWorkspaceCargoRequestLtPdf,
  useWorkspaceCargoRequests,
  useWorkspaceCreateCargo,
  useWorkspaceCreateCargoRequest,
  useWorkspaceUpdateCargoRequest,
  useWorkspaceUpdateCargoStatus,
} from '@/pages/packlog/packlogWorkspace'
import {
  buildPickupMapEmbedUrl,
  buildPickupMapUrl,
} from '@/pages/packlog/PackLogCargoDetailSections'
import type {
  VoyageCreate, VoyageUpdate,
  TravelVectorCreate, TravelVectorUpdate,
  CargoItemCreate,
  CargoRequestCreate, CargoRequestUpdate,
  RotationCreate, RotationUpdate,
} from '@/types/api'

// ── Tab definitions ───────────────────────────────────────────

type TravelWizTab = 'dashboard' | 'voyages' | 'manifests' | 'vectors' | 'fleet_map' | 'pickup' | 'weather'

const TABS: { id: TravelWizTab; label: string; icon: typeof Plane }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'voyages', label: 'Voyages', icon: Plane },
  { id: 'manifests', label: 'Manifestes PAX', icon: FileText },
  { id: 'vectors', label: 'Vecteurs', icon: Ship },
  { id: 'fleet_map', label: 'Carte flotte', icon: MapIcon },
  { id: 'pickup', label: 'Ramassage', icon: Route },
  { id: 'weather', label: 'Météo', icon: CloudSun },
]





// ── Constants ─────────────────────────────────────────────────

const VOYAGE_STATUS_LABELS_FALLBACK: Record<string, string> = {
  planned: 'Planifié',
  confirmed: 'Confirmé',
  boarding: 'Embarquement',
  departed: 'En route',
  arrived: 'Arrivé',
  closed: 'Clôturé',
  cancelled: 'Annulé',
  delayed: 'Retardé',
}

const VOYAGE_STATUS_BADGES: Record<string, string> = {
  planned: 'gl-badge-neutral',
  confirmed: 'gl-badge-info',
  boarding: 'gl-badge-warning',
  departed: 'gl-badge-warning',
  arrived: 'gl-badge-success',
  closed: 'gl-badge-success',
  cancelled: 'gl-badge-danger',
  delayed: 'gl-badge-danger',
}

const MANIFEST_STATUS_LABELS_FALLBACK: Record<string, string> = {
  draft: 'Brouillon',
  pending_validation: 'En validation',
  validated: 'Validé',
  requires_review: 'À revoir',
  closed: 'Clôturé',
}

const MANIFEST_STATUS_BADGES: Record<string, string> = {
  draft: 'gl-badge-neutral',
  pending_validation: 'gl-badge-warning',
  validated: 'gl-badge-success',
  requires_review: 'gl-badge-danger',
  closed: 'gl-badge-success',
}

const VECTOR_TYPE_MAP: Record<string, { label: string; badge: string; icon: typeof Plane }> = {
  helicopter:        { label: 'Hélicoptère',   badge: 'gl-badge-info', icon: Plane },
  boat:              { label: 'Bateau',        badge: 'gl-badge-success', icon: Ship },
  surfer:            { label: 'Surfer',        badge: 'gl-badge-info', icon: Ship },
  bus:               { label: 'Bus',           badge: 'gl-badge-warning', icon: Truck },
  '4x4':             { label: '4x4',           badge: 'gl-badge-neutral', icon: Truck },
  commercial_flight: { label: 'Vol commercial', badge: 'gl-badge-warning', icon: Plane },
  barge:             { label: 'Barge',         badge: 'gl-badge-info', icon: Anchor },
  tug:               { label: 'Remorqueur',    badge: 'gl-badge-neutral', icon: Anchor },
  ship:              { label: 'Navire',        badge: 'gl-badge-success', icon: Ship },
  vehicle:           { label: 'Véhicule',      badge: 'gl-badge-neutral', icon: Truck },
}

const CARGO_STATUS_LABELS_FALLBACK: Record<string, string> = {
  registered: 'Enregistré',
  ready: 'Prêt',
  ready_for_loading: 'Prêt au chargement',
  loaded: 'Chargé',
  in_transit: 'En transit',
  delivered: 'Livré',
  delivered_intermediate: 'Livré (inter.)',
  delivered_final: 'Livré (final)',
  return_declared: 'Retour déclaré',
  return_in_transit: 'Retour en transit',
  returned: 'Retourné',
  reintegrated: 'Réintégré',
  scrapped: 'Mis au rebut',
  damaged: 'Endommagé',
  missing: 'Manquant',
}

const CARGO_STATUS_BADGES: Record<string, string> = {
  registered: 'gl-badge-neutral',
  ready: 'gl-badge-info',
  ready_for_loading: 'gl-badge-info',
  loaded: 'gl-badge-warning',
  in_transit: 'gl-badge-warning',
  delivered: 'gl-badge-success',
  delivered_intermediate: 'gl-badge-info',
  delivered_final: 'gl-badge-success',
  return_declared: 'gl-badge-warning',
  return_in_transit: 'gl-badge-warning',
  returned: 'gl-badge-success',
  reintegrated: 'gl-badge-success',
  scrapped: 'gl-badge-danger',
  damaged: 'gl-badge-danger',
  missing: 'gl-badge-danger',
}

// ── Helpers ───────────────────────────────────────────────────

function StatusBadge({ status, labels, badges }: { status: string; labels: Record<string, string>; badges: Record<string, string> }) {
  return (
    <span className={cn('gl-badge', badges[status] || 'gl-badge-neutral')}>
      {labels[status] || status.replace(/_/g, ' ')}
    </span>
  )
}

function formatDateShort(d: string | null | undefined) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })
}

function formatDateTime(d: string | null | undefined) {
  if (!d) return '—'
  return new Date(d).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

function buildStatusOptions(labels: Record<string, string>, values: string[]) {
  return [
    { value: '', label: 'Tous' },
    ...values.map((value) => ({ value, label: labels[value] ?? value })),
  ]
}

function StatCard({ label, value, icon: Icon, accent }: { label: string; value: string | number; icon: typeof Plane; accent?: string }) {
  return (
    <div className="rounded-lg border border-border bg-background p-3">
      <div className="flex items-center gap-2 text-muted-foreground mb-1">
        <Icon size={13} className={accent} />
        <span className="text-[10px] font-medium uppercase tracking-wide">{label}</span>
      </div>
      <p className="text-lg font-semibold text-foreground tabular-nums">{value}</p>
    </div>
  )
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRow = any

// ══════════════════════════════════════════════════════════════
// ── DASHBOARD TAB ────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════

/** Simple error boundary to prevent FleetMap Leaflet crashes from breaking the whole page. */
class MapErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false }
  static getDerivedStateFromError(_: Error) { return { hasError: true } }
  componentDidCatch(error: Error, info: ErrorInfo) { console.warn('[MapErrorBoundary]', error.message, info.componentStack?.slice(0, 200)) }
  render() {
    if (this.state.hasError) {
      return <div className="flex items-center justify-center h-full text-xs text-muted-foreground p-4">Carte indisponible</div>
    }
    return this.props.children
  }
}

function DashboardTab() {
  const openDynamicPanel = useUIStore((s) => s.openDynamicPanel)
  const { data: tripsToday, isLoading: loadingTrips } = useTripsToday()
  const { data: fleetKpis, isLoading: loadingKpis } = useFleetKpis()
  const voyageStatusLabels = useDictionaryLabels('travelwiz_voyage_status', VOYAGE_STATUS_LABELS_FALLBACK)

  const trips = tripsToday?.trips ?? []
  const kpis = fleetKpis

  const tripColumns = useMemo<ColumnDef<AnyRow, unknown>[]>(() => [
    {
      accessorKey: 'code',
      header: 'Reference',
      size: 110,
      cell: ({ row }) => <span className="font-medium font-mono text-xs text-foreground">{row.original.code}</span>,
    },
    {
      accessorKey: 'vector_name',
      header: 'Vecteur',
      size: 130,
      cell: ({ row }) => {
        const vt = VECTOR_TYPE_MAP[row.original.vector_type]
        const VIcon = vt?.icon || Ship
        return (
          <div className="flex items-center gap-1.5">
            <VIcon size={12} className="text-muted-foreground shrink-0" />
            <span className="text-foreground truncate">{row.original.vector_name || '—'}</span>
          </div>
        )
      },
    },
    {
      id: 'route',
      header: 'Itineraire',
      cell: ({ row }) => (
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          {row.original.origin || '?'}
          <ArrowRight size={10} />
          {row.original.destination || '?'}
        </span>
      ),
    },
    {
      accessorKey: 'departure_at',
      header: 'Depart',
      size: 120,
      cell: ({ row }) => <span className="text-xs text-muted-foreground tabular-nums whitespace-nowrap">{formatDateTime(row.original.departure_at)}</span>,
    },
    {
      accessorKey: 'status',
      header: 'Statut',
      size: 110,
      cell: ({ row }) => <StatusBadge status={row.original.status} labels={voyageStatusLabels} badges={VOYAGE_STATUS_BADGES} />,
    },
    {
      accessorKey: 'pax_count',
      header: 'PAX',
      size: 60,
      cell: ({ row }) => (
        <span className="inline-flex items-center gap-1 text-xs">
          <Users size={11} className="text-muted-foreground" />
          {row.original.pax_count ?? 0}
        </span>
      ),
    },
  ], [voyageStatusLabels])

  // Fleet utilization bars
  const utilizationEntries = useMemo(() => {
    if (!kpis?.utilization_by_type) return []
    return Object.entries(kpis.utilization_by_type).map(([type, data]) => ({
      type,
      label: VECTOR_TYPE_MAP[type]?.label || type,
      total: data.total,
      active: data.active,
      pct: data.total > 0 ? Math.round((data.active / data.total) * 100) : 0,
    }))
  }, [kpis])

  return (
    <>
      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 px-4 py-3 border-b border-border">
        <StatCard label="Voyages du jour" value={kpis?.active_voyages ?? trips.length} icon={Plane} accent="text-primary" />
        <StatCard label="Cargo en transit" value={kpis?.cargo_in_transit ?? 0} icon={Package} accent="text-amber-500" />
        <StatCard label="PAX en déplacement" value={kpis?.pax_in_transit ?? 0} icon={Users} accent="text-blue-500" />
        <StatCard label="No-shows ce mois" value={kpis?.no_shows_month ?? 0} icon={XCircle} accent="text-destructive" />
      </div>

      {/* Fleet map */}
      <div className="mx-4 mt-3 rounded-lg border border-border overflow-hidden">
        <MapErrorBoundary><FleetMap height={280} /></MapErrorBoundary>
      </div>

      {/* Trips today table */}
      <div className="px-4 pt-3">
        <h3 className="text-xs font-semibold text-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
          <Calendar size={12} />
          Voyages du jour
        </h3>
      </div>
      <PanelContent>
        <DataTable<AnyRow>
          columns={tripColumns}
          data={trips}
          isLoading={loadingTrips || loadingKpis}
          onRowClick={(row) => openDynamicPanel({ type: 'detail', module: 'travelwiz', id: row.id, meta: { subtype: 'voyage' } })}
          emptyIcon={Plane}
          emptyTitle="Aucun voyage aujourd'hui"
          storageKey="travelwiz-dashboard-trips"
        />
      </PanelContent>

      {/* Fleet utilization */}
      {utilizationEntries.length > 0 && (
        <div className="px-4 pb-4">
          <h3 className="text-xs font-semibold text-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
            <BarChart3 size={12} />
            Utilisation flotte
          </h3>
          <div className="space-y-2">
            {utilizationEntries.map((entry) => (
              <div key={entry.type} className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground w-24 shrink-0 truncate">{entry.label}</span>
                <div className="flex-1 h-2 rounded-full bg-border overflow-hidden">
                  <div
                    className={cn('h-full rounded-full transition-all', entry.pct > 80 ? 'bg-destructive' : entry.pct > 50 ? 'bg-amber-500' : 'bg-primary')}
                    style={{ width: `${Math.min(100, entry.pct)}%` }}
                  />
                </div>
                <span className="text-xs text-muted-foreground tabular-nums w-16 text-right">{entry.active}/{entry.total}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  )
}

void DashboardTab

// ══════════════════════════════════════════════════════════════
// ── VOYAGES TAB ──────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════

function VoyagesTab() {
  const [page, setPage] = useState(1)
  const { pageSize } = usePageSize()
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search, 300)
  const [statusFilter, setStatusFilter] = useState('')
  const openDynamicPanel = useUIStore((s) => s.openDynamicPanel)
  const confirmDialog = useConfirm()
  const deleteVoyage = useDeleteVoyage()
  const { hasPermission } = usePermission()
  const canDelete = hasPermission('travelwiz.voyage.delete')
  const canExport = hasPermission('travelwiz.voyage.read')
  const canImport = hasPermission('travelwiz.voyage.create')
  const { data: rotationsData, isLoading: loadingRotations } = useRotations({ page: 1, page_size: 100 })
  const voyageStatusLabels = useDictionaryLabels('travelwiz_voyage_status', VOYAGE_STATUS_LABELS_FALLBACK)
  const voyageStatusOptions = useMemo(
    () => buildStatusOptions(voyageStatusLabels, ['planned', 'confirmed', 'boarding', 'departed', 'arrived', 'closed', 'cancelled', 'delayed']),
    [voyageStatusLabels],
  )

  const { data, isLoading } = useVoyages({
    page,
    page_size: pageSize,
    search: debouncedSearch || undefined,
    status: statusFilter || undefined,
  })

  const items: AnyRow[] = data?.items ?? []
  const rotations: AnyRow[] = rotationsData?.items ?? []
  const total = data?.total ?? 0

  const stats = useMemo(() => {
    const planned = items.filter((v) => v.status === 'planned').length
    const inProgress = items.filter((v) => ['boarding', 'departed'].includes(v.status)).length
    const arrived = items.filter((v) => v.status === 'arrived').length
    const totalPax = items.reduce((sum, v) => sum + (v.pax_count ?? 0), 0)
    return { planned, inProgress, arrived, totalPax, rotations: rotations.length }
  }, [items, rotations.length])

  const columns = useMemo<ColumnDef<AnyRow, unknown>[]>(() => [
    {
      accessorKey: 'code',
      header: 'Reference',
      size: 110,
      cell: ({ row }) => <span className="font-medium font-mono text-xs text-foreground">{row.original.code}</span>,
    },
    {
      accessorKey: 'vector_name',
      header: 'Vecteur',
      size: 140,
      cell: ({ row }) => {
        const vt = VECTOR_TYPE_MAP[row.original.vector_type]
        const VIcon = vt?.icon || Ship
        return (
          <div className="flex items-center gap-1.5">
            <VIcon size={12} className="text-muted-foreground shrink-0" />
            <span className="text-foreground truncate">{row.original.vector_name || '—'}</span>
          </div>
        )
      },
    },
    {
      id: 'route',
      header: 'Itineraire',
      cell: ({ row }) => (
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          {row.original.origin || row.original.departure_location || '?'}
          <ArrowRight size={10} />
          {row.original.destination || row.original.arrival_location || '?'}
        </span>
      ),
    },
    {
      accessorKey: 'departure_at',
      header: 'Depart',
      size: 100,
      cell: ({ row }) => <span className="text-xs text-muted-foreground tabular-nums whitespace-nowrap">{formatDateShort(row.original.departure_at || row.original.departure_date)}</span>,
    },
    {
      accessorKey: 'status',
      header: 'Statut',
      size: 110,
      cell: ({ row }) => <StatusBadge status={row.original.status} labels={voyageStatusLabels} badges={VOYAGE_STATUS_BADGES} />,
    },
    {
      accessorKey: 'pax_count',
      header: 'PAX',
      size: 60,
      cell: ({ row }) => (
        <span className="inline-flex items-center gap-1 text-xs">
          <Users size={11} className="text-muted-foreground" />
          {row.original.pax_count ?? 0}
        </span>
      ),
    },
    {
      id: 'cargo_weight',
      header: 'Cargo',
      size: 80,
      cell: ({ row }) => {
        const w = row.original.cargo_weight_kg ?? row.original.total_cargo_kg
        return (
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground tabular-nums">
            <Weight size={11} />
            {w ? `${Number(w).toLocaleString('fr-FR')}` : '—'}
          </span>
        )
      },
    },
    ...(canDelete ? [{
      id: 'actions',
      header: '',
      size: 40,
      cell: ({ row }: { row: { original: { id: string } } }) => (
        <button
          className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={async (e: React.MouseEvent) => { e.stopPropagation(); const ok = await confirmDialog({ title: 'Supprimer ?', message: 'Supprimer ce voyage ?', confirmLabel: 'Supprimer', variant: 'danger' }); if (ok) deleteVoyage.mutate(row.original.id) }}
          title="Supprimer"
        >
          <span className="text-xs">&times;</span>
        </button>
      ),
    }] : []),
  ], [deleteVoyage, canDelete, voyageStatusLabels])

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 px-4 py-3 border-b border-border">
        <StatCard label="Planifiés" value={stats.planned} icon={Calendar} />
        <StatCard label="En cours" value={stats.inProgress} icon={Plane} />
        <StatCard label="Arrivés" value={stats.arrived} icon={Anchor} />
        <StatCard label="Rotations actives" value={stats.rotations} icon={Route} />
      </div>

      <div className="flex items-center gap-2 border-b border-border px-3.5 h-9 shrink-0">
        <div className="flex items-center gap-1 overflow-x-auto">
          {voyageStatusOptions.map((opt) => (
            <button
              key={opt.value}
              onClick={() => { setStatusFilter(opt.value); setPage(1) }}
              className={cn(
                'px-2 py-0.5 rounded text-xs font-medium transition-colors whitespace-nowrap',
                statusFilter === opt.value ? 'bg-primary/[0.16] text-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
        {data && <span className="text-xs text-muted-foreground ml-auto shrink-0">{total} voyages</span>}
      </div>

      <PanelContent>
        <DataTable<AnyRow>
          columns={columns}
          data={items}
          isLoading={isLoading}
          pagination={data ? { page: data.page, pageSize, total: data.total, pages: data.pages } : undefined}
          onPaginationChange={(p) => setPage(p)}
          searchValue={search}
          onSearchChange={(v) => { setSearch(v); setPage(1) }}
          searchPlaceholder="Rechercher par code, vecteur..."
          onRowClick={(row) => openDynamicPanel({ type: 'detail', module: 'travelwiz', id: row.id, meta: { subtype: 'voyage' } })}
          emptyIcon={Plane}
          emptyTitle="Aucun voyage"
          importExport={(canExport || canImport) ? {
            exportFormats: canExport ? ['csv', 'xlsx'] : undefined,
            advancedExport: true,
            filenamePrefix: 'voyages',
            exportHeaders: {
              code: 'Reference',
              vector_name: 'Vecteur',
              departure_at: 'Depart',
              status: 'Statut',
              pax_count: 'PAX',
            },
          } : undefined}
          storageKey="travelwiz-voyages"
        />

        <div className="mt-5 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-foreground">Programmations récurrentes</h3>
              <p className="text-xs text-muted-foreground">
                Les rotations définissent les voyages périodiques par vecteur, base et cadence.
              </p>
            </div>
            {canImport && (
              <button
                className="gl-button-sm gl-button-primary text-xs"
                onClick={() => openDynamicPanel({ type: 'create', module: 'travelwiz', meta: { subtype: 'rotation' } })}
              >
                <Plus size={10} className="mr-1" />
                Nouvelle rotation
              </button>
            )}
          </div>
          {loadingRotations ? (
            <div className="flex items-center justify-center rounded-lg border border-border bg-card py-8">
              <Loader2 size={16} className="animate-spin text-muted-foreground" />
            </div>
          ) : rotations.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border bg-card px-4 py-6 text-sm text-muted-foreground">
              Aucune rotation configurée. Créez une rotation pour programmer des voyages récurrents sans ressaisie manuelle.
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {rotations.map((rotation) => (
                <button
                  key={rotation.id}
                  type="button"
                  onClick={() => openDynamicPanel({ type: 'detail', module: 'travelwiz', id: rotation.id, meta: { subtype: 'rotation' } })}
                  className="rounded-lg border border-border bg-card p-4 text-left transition-colors hover:border-primary/40 hover:bg-muted/30"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">{rotation.name}</p>
                      <p className="text-xs text-muted-foreground mt-1 truncate">{rotation.vector_name ?? 'Vecteur non résolu'}</p>
                    </div>
                    <span className="gl-badge gl-badge-neutral shrink-0">Rotation</span>
                  </div>
                  <div className="mt-3 space-y-1.5 text-xs text-muted-foreground">
                    <p><span className="text-foreground font-medium">Base:</span> {rotation.departure_base_name ?? '—'}</p>
                    <p><span className="text-foreground font-medium">Cadence:</span> {rotation.schedule_description ?? rotation.schedule_cron ?? '—'}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </PanelContent>
    </>
  )
}


function VoyageCargoOperationsSection({
  report,
  cargoStatusLabels,
  packageReturnStatusLabels,
  onOpenExport,
}: {
  report: {
    cargo_count: number
    delivered_count: number
    damaged_count: number
    missing_count: number
    return_started_count: number
    items: Array<{
      cargo_id: string
      tracking_code: string
      request_code?: string | null
      designation: string | null
      description: string
      status: string
      destination_name: string | null
      weight_kg: number
      total_sent_units: number
      total_returned_units: number
      return_coverage_ratio: number
      aggregate_return_status: string
      aggregate_disposition: string
    }>
  } | undefined
  cargoStatusLabels: Record<string, string>
  packageReturnStatusLabels: Record<string, string>
  onOpenExport: () => void
}) {
  const openDynamicPanel = useUIStore((s) => s.openDynamicPanel)

  return (
    <FormSection title="Rapport cargo opérationnel" collapsible defaultExpanded>
      {!report || report.items.length === 0 ? (
        <p className="text-xs text-muted-foreground">Aucun cargo affecté à ce voyage.</p>
      ) : (
        <div className="space-y-3">
          <div className="flex justify-end">
            <button className="gl-button-sm gl-button-default text-xs" onClick={onOpenExport}>
              Exporter le rapport
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2 xl:grid-cols-5">
            <div className="rounded-lg border border-border/60 bg-card px-3 py-2">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Colis</p>
              <p className="mt-1 text-sm font-semibold text-foreground">{report.cargo_count}</p>
            </div>
            <div className="rounded-lg border border-border/60 bg-card px-3 py-2">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Livrés</p>
              <p className="mt-1 text-sm font-semibold text-foreground">{report.delivered_count}</p>
            </div>
            <div className="rounded-lg border border-border/60 bg-card px-3 py-2">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Endommagés</p>
              <p className="mt-1 text-sm font-semibold text-foreground">{report.damaged_count}</p>
            </div>
            <div className="rounded-lg border border-border/60 bg-card px-3 py-2">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Manquants</p>
              <p className="mt-1 text-sm font-semibold text-foreground">{report.missing_count}</p>
            </div>
            <div className="rounded-lg border border-border/60 bg-card px-3 py-2">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Retours démarrés</p>
              <p className="mt-1 text-sm font-semibold text-foreground">{report.return_started_count}</p>
            </div>
          </div>

          <div className="space-y-2">
            {report.items.map((item) => (
              <button
                key={item.cargo_id}
                type="button"
                onClick={() => openDynamicPanel({ type: 'detail', module: 'travelwiz', id: item.cargo_id, meta: { subtype: 'cargo' } })}
                className="w-full rounded-lg border border-border/60 bg-card px-3 py-3 text-left hover:bg-muted/40"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-mono text-muted-foreground">{item.tracking_code}</p>
                    <p className="text-sm font-medium text-foreground truncate">{item.designation || item.description}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {cargoStatusLabels[item.status] ?? item.status}
                      {' • '}
                      {item.destination_name ?? 'Destination non résolue'}
                      {' • '}
                      {item.weight_kg.toLocaleString('fr-FR')} kg
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs text-muted-foreground">
                      Retour {Math.round((item.return_coverage_ratio ?? 0) * 100)}%
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {item.total_returned_units} / {item.total_sent_units} unités
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {packageReturnStatusLabels[item.aggregate_disposition] ?? item.aggregate_disposition}
                    </p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </FormSection>
  )
}

function getAggregateReturnStatusLabel(status: string): string {
  switch (status) {
    case 'no_elements':
      return 'Aucun élément détaillé'
    case 'not_started':
      return 'Aucun retour saisi'
    case 'partial_return':
      return 'Retour partiel en cours'
    case 'fully_returned':
      return 'Retour complet déclaré'
    default:
      return status
  }
}

// ══════════════════════════════════════════════════════════════
// ── MANIFESTES PAX TAB ───────────────────────────────────────
// ══════════════════════════════════════════════════════════════

function ManifestesTab() {
  const [page, setPage] = useState(1)
  const { pageSize } = usePageSize()
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search, 300)
  const [statusFilter, setStatusFilter] = useState('')
  const openDynamicPanel = useUIStore((s) => s.openDynamicPanel)
  const validateManifest = useValidateManifest()
  const manifestStatusLabels = useDictionaryLabels('travelwiz_manifest_status', MANIFEST_STATUS_LABELS_FALLBACK)
  const manifestStatusOptions = useMemo(
    () => buildStatusOptions(manifestStatusLabels, ['draft', 'pending_validation', 'validated', 'requires_review', 'closed']),
    [manifestStatusLabels],
  )

  const { data, isLoading } = useAllManifests({
    page,
    page_size: pageSize,
    search: debouncedSearch || undefined,
    status: statusFilter || undefined,
  })

  const items: AnyRow[] = data?.items ?? []
  const total = data?.total ?? 0

  const stats = useMemo(() => {
    const draft = items.filter((m: AnyRow) => m.status === 'draft').length
    const validated = items.filter((m: AnyRow) => m.status === 'validated').length
    const totalPax = items.reduce((sum: number, m: AnyRow) => sum + (m.passenger_count ?? 0), 0)
    return { draft, validated, totalPax, count: items.length }
  }, [items])

  const columns = useMemo<ColumnDef<AnyRow, unknown>[]>(() => [
    {
      accessorKey: 'reference',
      header: 'Reference',
      size: 120,
      cell: ({ row }) => <span className="font-medium font-mono text-xs text-foreground">{row.original.reference || row.original.manifest_type || 'MAN'}</span>,
    },
    {
      accessorKey: 'voyage_code',
      header: 'Voyage',
      size: 110,
      cell: ({ row }) => <span className="font-mono text-xs text-muted-foreground">{row.original.voyage_code || '—'}</span>,
    },
    {
      accessorKey: 'status',
      header: 'Statut',
      size: 120,
      cell: ({ row }) => <StatusBadge status={row.original.status} labels={manifestStatusLabels} badges={MANIFEST_STATUS_BADGES} />,
    },
    {
      accessorKey: 'passenger_count',
      header: 'PAX confirmes',
      size: 100,
      cell: ({ row }) => (
        <span className="inline-flex items-center gap-1 text-xs">
          <Users size={11} className="text-muted-foreground" />
          {row.original.passenger_count ?? 0}
        </span>
      ),
    },
    {
      id: 'total_weight',
      header: 'Poids total',
      size: 100,
      cell: ({ row }) => {
        const w = row.original.total_weight_kg
        return (
          <span className="text-xs text-muted-foreground tabular-nums">
            {w ? `${Number(w).toLocaleString('fr-FR')} kg` : '—'}
          </span>
        )
      },
    },
    {
      id: 'actions',
      header: '',
      size: 80,
      cell: ({ row }) => {
        if (row.original.status === 'validated' || row.original.status === 'closed') return null
        return (
          <button
            className="gl-button-sm gl-button-default text-xs"
            onClick={(e) => {
              e.stopPropagation()
              validateManifest.mutate({ voyageId: row.original.voyage_id, manifestId: row.original.id })
            }}
            disabled={validateManifest.isPending}
          >
            <CheckCircle2 size={10} className="mr-1" />
            Valider
          </button>
        )
      },
    },
  ], [manifestStatusLabels, validateManifest])

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 px-4 py-3 border-b border-border">
        <StatCard label="Manifestes" value={stats.count} icon={FileText} />
        <StatCard label="Brouillons" value={stats.draft} icon={FileText} />
        <StatCard label="Valides" value={stats.validated} icon={CheckCircle2} />
        <StatCard label="PAX total" value={stats.totalPax} icon={Users} />
      </div>

      <div className="flex items-center gap-2 border-b border-border px-3.5 h-9 shrink-0">
        <div className="flex items-center gap-1 overflow-x-auto">
          {manifestStatusOptions.map((opt) => (
            <button
              key={opt.value}
              onClick={() => { setStatusFilter(opt.value); setPage(1) }}
              className={cn(
                'px-2 py-0.5 rounded text-xs font-medium transition-colors whitespace-nowrap',
                statusFilter === opt.value ? 'bg-primary/[0.16] text-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
        {data && <span className="text-xs text-muted-foreground ml-auto shrink-0">{total} manifestes</span>}
      </div>

      <PanelContent>
        <DataTable<AnyRow>
          columns={columns}
          data={items}
          isLoading={isLoading}
          pagination={data ? { page: data.page, pageSize, total: data.total, pages: data.pages } : undefined}
          onPaginationChange={(p) => setPage(p)}
          searchValue={search}
          onSearchChange={(v) => { setSearch(v); setPage(1) }}
          searchPlaceholder="Rechercher par reference, voyage..."
          onRowClick={(row) => openDynamicPanel({ type: 'detail', module: 'travelwiz', id: row.original.voyage_id, meta: { subtype: 'voyage' } })}
          emptyIcon={FileText}
          emptyTitle="Aucun manifeste"
          storageKey="travelwiz-manifests"
        />
      </PanelContent>
    </>
  )
}

// ══════════════════════════════════════════════════════════════
// ── CARGO TAB ────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════

export function CargoTab() {
  const [page, setPage] = useState(1)
  const { pageSize } = usePageSize()
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search, 300)
  const [statusFilter, setStatusFilter] = useState('')
  const openDynamicPanel = useUIStore((s) => s.openDynamicPanel)
  const { panelModule } = useCargoWorkspace()
  const cargoRequestStatusCategory = useCargoDictionaryCategory('cargo_request_status')
  const cargoStatusCategory = useCargoDictionaryCategory('cargo_status')
  const updateCargoStatus = useWorkspaceUpdateCargoStatus()
  const { data: cargoRequestsData } = useWorkspaceCargoRequests({ page: 1, page_size: 8 })
  const cargoRequestStatusLabels = useDictionaryLabels(cargoRequestStatusCategory)
  const cargoStatusLabels = useDictionaryLabels(cargoStatusCategory, CARGO_STATUS_LABELS_FALLBACK)
  const cargoStatusOptions = useMemo(
    () => buildStatusOptions(cargoStatusLabels, ['registered', 'ready', 'ready_for_loading', 'loaded', 'in_transit', 'delivered', 'delivered_intermediate', 'delivered_final', 'return_declared', 'return_in_transit', 'returned', 'reintegrated', 'scrapped', 'damaged', 'missing']),
    [cargoStatusLabels],
  )

  const { data, isLoading } = useWorkspaceCargo({
    page,
    page_size: pageSize,
    search: debouncedSearch || undefined,
    status: statusFilter || undefined,
  })

  const items: AnyRow[] = data?.items ?? []
  const total = data?.total ?? 0
  const cargoRequests = cargoRequestsData?.items ?? []

  const stats = useMemo(() => {
    const totalWeight = items.reduce((sum: number, c: AnyRow) => sum + (c.weight_kg ?? 0), 0)
    const inTransit = items.filter((c: AnyRow) => c.status === 'in_transit').length
    const delivered = items.filter((c: AnyRow) => ['delivered', 'delivered_intermediate', 'delivered_final'].includes(c.status)).length
    const hazmat = items.filter((c: AnyRow) => c.hazmat_validated).length
    return { totalWeight, inTransit, delivered, hazmat, count: items.length }
  }, [items])

  const columns = useMemo<ColumnDef<AnyRow, unknown>[]>(() => [
    {
      accessorKey: 'code',
      header: 'Tracking#',
      size: 110,
      cell: ({ row }) => <span className="font-medium font-mono text-xs text-foreground">{row.original.code}</span>,
    },
    {
      accessorKey: 'description',
      header: 'Description',
      cell: ({ row }) => <span className="text-foreground truncate max-w-[200px] block">{row.original.description || '—'}</span>,
    },
    {
      accessorKey: 'weight_kg',
      header: 'Poids',
      size: 90,
      cell: ({ row }) => (
        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground tabular-nums">
          <Weight size={11} />
          {row.original.weight_kg ? `${row.original.weight_kg.toLocaleString('fr-FR')}` : '—'}
        </span>
      ),
    },
    {
      id: 'origin',
      header: 'Origine',
      size: 100,
      cell: ({ row }) => <span className="text-xs text-muted-foreground truncate">{row.original.sender_name || '—'}</span>,
    },
    {
      id: 'destination',
      header: 'Destination',
      size: 100,
      cell: ({ row }) => <span className="text-xs text-muted-foreground truncate">{row.original.receiver_name || '—'}</span>,
    },
    {
      accessorKey: 'status',
      header: 'Statut',
      size: 120,
      cell: ({ row }) => <StatusBadge status={row.original.status} labels={cargoStatusLabels} badges={CARGO_STATUS_BADGES} />,
    },
    {
      id: 'flags',
      header: '',
      size: 50,
      cell: ({ row }) => (
        <div className="flex items-center gap-1">
          {row.original.hazmat_validated && (
            <span title="HAZMAT validé" className="text-destructive">
              <AlertTriangle size={12} />
            </span>
          )}
          {row.original.is_urgent && (
            <span title="Urgent" className="text-destructive">
              <Bell size={12} />
            </span>
          )}
        </div>
      ),
    },
    {
      id: 'actions',
      header: '',
      size: 80,
      cell: ({ row }) => {
        const nextStatusMap: Record<string, string> = {
          registered: 'ready', ready: 'loaded', loaded: 'in_transit',
          in_transit: 'delivered', delivered_intermediate: 'delivered_final',
        }
        const next = nextStatusMap[row.original.status]
        if (!next) return null
        return (
          <button
            className="gl-button-sm gl-button-default text-xs"
            onClick={(e) => { e.stopPropagation(); updateCargoStatus.mutate({ id: row.original.id, status: next }) }}
            disabled={updateCargoStatus.isPending}
          >
            Avancer
          </button>
        )
      },
    },
  ], [cargoStatusLabels, updateCargoStatus])

  return (
    <>
      {cargoRequests.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3 px-4 py-3 border-b border-border bg-muted/20">
          {cargoRequests.map((request) => (
            <button
              key={request.id}
              onClick={() => openDynamicPanel({ type: 'detail', module: panelModule, id: request.id, meta: { subtype: 'cargo-request' } })}
              className="rounded-xl border border-border/70 bg-card px-3 py-3 text-left hover:bg-muted/40 transition-colors"
            >
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-mono text-muted-foreground">{request.request_code}</p>
                <span className="text-[11px] text-muted-foreground">
                  {cargoRequestStatusLabels[request.status] ?? request.status}
                </span>
              </div>
              <p className="mt-1 text-sm font-medium text-foreground line-clamp-2">{request.title}</p>
              <p className="mt-2 text-xs text-muted-foreground">
                {request.cargo_count} colis
                {request.destination_name ? ` • ${request.destination_name}` : ''}
              </p>
            </button>
          ))}
        </div>
      )}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 px-4 py-3 border-b border-border">
        <StatCard label="Total colis" value={stats.count} icon={Package} />
        <StatCard label="Poids total" value={`${stats.totalWeight.toLocaleString('fr-FR')} kg`} icon={Weight} />
        <StatCard label="En transit" value={stats.inTransit} icon={Truck} />
        <StatCard label="HAZMAT" value={stats.hazmat} icon={AlertTriangle} accent="text-destructive" />
      </div>

      <div className="flex items-center gap-2 border-b border-border px-3.5 h-9 shrink-0">
        <div className="flex items-center gap-1 overflow-x-auto">
          {cargoStatusOptions.map((opt) => (
            <button
              key={opt.value}
              onClick={() => { setStatusFilter(opt.value); setPage(1) }}
              className={cn(
                'px-2 py-0.5 rounded text-xs font-medium transition-colors whitespace-nowrap',
                statusFilter === opt.value ? 'bg-primary/[0.16] text-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
        {data && <span className="text-xs text-muted-foreground ml-auto shrink-0">{total} colis</span>}
      </div>

      <PanelContent>
        <DataTable<AnyRow>
          columns={columns}
          data={items}
          isLoading={isLoading}
          pagination={data ? { page: data.page, pageSize, total: data.total, pages: data.pages } : undefined}
          onPaginationChange={(p) => setPage(p)}
          searchValue={search}
          onSearchChange={(v) => { setSearch(v); setPage(1) }}
          searchPlaceholder="Rechercher par tracking, description..."
          onRowClick={(row) => openDynamicPanel({ type: 'detail', module: panelModule, id: row.id, meta: { subtype: 'cargo' } })}
          emptyIcon={Package}
          emptyTitle="Aucun colis"
          storageKey="travelwiz-cargo"
        />
      </PanelContent>
    </>
  )
}

// ══════════════════════════════════════════════════════════════
// ── VECTEURS TAB ─────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════

function VecteursTab() {
  const [page, setPage] = useState(1)
  const { pageSize } = usePageSize()
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search, 300)
  const openDynamicPanel = useUIStore((s) => s.openDynamicPanel)
  const confirmDialog = useConfirm()
  const deleteVector = useDeleteVector()
  const { hasPermission } = usePermission()
  const canDelete = hasPermission('travelwiz.voyage.delete')

  const { data, isLoading } = useVectors({
    page,
    page_size: pageSize,
    search: debouncedSearch || undefined,
  })

  const items: AnyRow[] = data?.items ?? []

  const stats = useMemo(() => {
    const byType: Record<string, number> = {}
    items.forEach((v: AnyRow) => { byType[v.type] = (byType[v.type] || 0) + 1 })
    const totalCapacity = items.reduce((sum: number, v: AnyRow) => sum + (v.pax_capacity ?? 0), 0)
    return { byType, totalCapacity, count: items.length }
  }, [items])

  const columns = useMemo<ColumnDef<AnyRow, unknown>[]>(() => [
    {
      accessorKey: 'name',
      header: 'Nom',
      cell: ({ row }) => <span className="font-medium text-foreground">{row.original.name}</span>,
    },
    {
      accessorKey: 'registration',
      header: 'Immatriculation',
      size: 120,
      cell: ({ row }) => <span className="font-mono text-xs text-muted-foreground">{row.original.registration || '—'}</span>,
    },
    {
      accessorKey: 'type',
      header: 'Type',
      size: 130,
      cell: ({ row }) => {
        const vt = VECTOR_TYPE_MAP[row.original.type]
        const VIcon = vt?.icon || Ship
        return (
          <span className={cn('gl-badge inline-flex items-center gap-1', vt?.badge || 'gl-badge-neutral')}>
            <VIcon size={10} />
            {vt?.label || row.original.type}
          </span>
        )
      },
    },
    {
      accessorKey: 'pax_capacity',
      header: 'Capacite PAX',
      size: 100,
      cell: ({ row }) => (
        <span className="inline-flex items-center gap-1 text-xs">
          <Users size={11} className="text-muted-foreground" />
          {row.original.pax_capacity ?? '—'}
        </span>
      ),
    },
    {
      id: 'home_base',
      header: 'Base',
      size: 110,
      cell: ({ row }) => <span className="text-xs text-muted-foreground truncate">{row.original.home_base_name || '—'}</span>,
    },
    ...(canDelete ? [{
      id: 'actions',
      header: '',
      size: 40,
      cell: ({ row }: { row: { original: { id: string } } }) => (
        <button
          className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={async (e: React.MouseEvent) => { e.stopPropagation(); const ok = await confirmDialog({ title: 'Supprimer ?', message: 'Supprimer ce vecteur ?', confirmLabel: 'Supprimer', variant: 'danger' }); if (ok) deleteVector.mutate(row.original.id) }}
          title="Supprimer"
        >
          <span className="text-xs">&times;</span>
        </button>
      ),
    }] : []),
  ], [deleteVector, canDelete])

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 px-4 py-3 border-b border-border">
        <StatCard label="Vecteurs" value={stats.count} icon={Ship} />
        <StatCard label="Capacite totale" value={stats.totalCapacity} icon={Users} />
        <StatCard label="Hélicoptères" value={stats.byType['helicopter'] ?? 0} icon={Plane} />
        <StatCard label="Navires" value={(stats.byType['boat'] ?? 0) + (stats.byType['ship'] ?? 0)} icon={Anchor} />
      </div>

      <PanelContent>
        <DataTable<AnyRow>
          columns={columns}
          data={items}
          isLoading={isLoading}
          pagination={data ? { page: data.page, pageSize, total: data.total, pages: data.pages } : undefined}
          onPaginationChange={(p) => setPage(p)}
          searchValue={search}
          onSearchChange={(v) => { setSearch(v); setPage(1) }}
          searchPlaceholder="Rechercher par nom, immatriculation..."
          onRowClick={(row) => openDynamicPanel({ type: 'detail', module: 'travelwiz', id: row.id, meta: { subtype: 'vector' } })}
          emptyIcon={Ship}
          emptyTitle="Aucun vecteur"
          storageKey="travelwiz-vectors"
        />
      </PanelContent>
    </>
  )
}

// ══════════════════════════════════════════════════════════════
// ── ARTICLES TAB ─────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════
// ── FLEET MAP TAB ────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════

function FleetMapTab() {
  return (
    <div className="flex-1 min-h-0 overflow-auto">
      <MapErrorBoundary><FleetMap height="calc(100vh - 140px)" /></MapErrorBoundary>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// ── PICKUP (RAMASSAGE) TAB ───────────────────────────────────
// ══════════════════════════════════════════════════════════════

const PICKUP_STATUS_LABELS_FALLBACK: Record<string, string> = {
  planned: 'Planifié',
  in_progress: 'En cours',
  completed: 'Terminé',
  cancelled: 'Annulé',
}

const PICKUP_STATUS_BADGES: Record<string, string> = {
  planned: 'gl-badge-neutral',
  in_progress: 'gl-badge-warning',
  completed: 'gl-badge-success',
  cancelled: 'gl-badge-danger',
}

function PickupTab() {
  const [page, setPage] = useState(1)
  const { pageSize } = usePageSize()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const closeRound = useClosePickupRound()
  const pickupStatusLabels = useDictionaryLabels('travelwiz_pickup_status', PICKUP_STATUS_LABELS_FALLBACK)
  const pickupStatusOptions = useMemo(
    () => buildStatusOptions(pickupStatusLabels, ['planned', 'in_progress', 'completed', 'cancelled']),
    [pickupStatusLabels],
  )

  const { data, isLoading } = usePickupRounds({
    page,
    page_size: pageSize,
    status: statusFilter || undefined,
  })
  const { data: roundDetail } = usePickupRound(selectedId ?? undefined)

  const items: AnyRow[] = data?.items ?? []
  const total = data?.total ?? 0

  const columns = useMemo<ColumnDef<AnyRow, unknown>[]>(() => [
    {
      accessorKey: 'code',
      header: 'Reference',
      size: 120,
      cell: ({ row }) => <span className="font-medium font-mono text-xs text-foreground">{row.original.code}</span>,
    },
    {
      accessorKey: 'date',
      header: 'Date',
      size: 100,
      cell: ({ row }) => <span className="text-xs text-muted-foreground tabular-nums">{formatDateShort(row.original.date)}</span>,
    },
    {
      accessorKey: 'vehicle_name',
      header: 'Véhicule',
      size: 130,
      cell: ({ row }) => <span className="text-foreground truncate">{row.original.vehicle_name || '—'}</span>,
    },
    {
      accessorKey: 'driver_name',
      header: 'Chauffeur',
      size: 120,
      cell: ({ row }) => <span className="text-xs text-muted-foreground">{row.original.driver_name || '—'}</span>,
    },
    {
      accessorKey: 'stops_count',
      header: 'Arrets',
      size: 60,
      cell: ({ row }) => <span className="text-xs text-muted-foreground tabular-nums">{row.original.stops_count}</span>,
    },
    {
      accessorKey: 'pax_collected',
      header: 'PAX',
      size: 60,
      cell: ({ row }) => (
        <span className="inline-flex items-center gap-1 text-xs">
          <Users size={11} className="text-muted-foreground" />
          {row.original.pax_collected}
        </span>
      ),
    },
    {
      accessorKey: 'status',
      header: 'Statut',
      size: 110,
      cell: ({ row }) => <StatusBadge status={row.original.status} labels={pickupStatusLabels} badges={PICKUP_STATUS_BADGES} />,
    },
  ], [pickupStatusLabels])

  return (
    <>
      <div className="flex items-center gap-2 border-b border-border px-3.5 h-9 shrink-0">
        <div className="flex items-center gap-1 overflow-x-auto">
          {pickupStatusOptions.map((opt) => (
            <button
              key={opt.value}
              onClick={() => { setStatusFilter(opt.value); setPage(1) }}
              className={cn(
                'px-2 py-0.5 rounded text-xs font-medium transition-colors whitespace-nowrap',
                statusFilter === opt.value ? 'bg-primary/[0.16] text-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
        {data && <span className="text-xs text-muted-foreground ml-auto shrink-0">{total} tournees</span>}
      </div>

      <div className="flex flex-1 min-h-0">
        {/* List */}
        <div className={cn('flex-1 min-w-0 overflow-auto', selectedId && 'hidden sm:block sm:flex-1')}>
          <PanelContent>
            <DataTable<AnyRow>
              columns={columns}
              data={items}
              isLoading={isLoading}
              pagination={data ? { page: data.page, pageSize, total: data.total, pages: data.pages } : undefined}
              onPaginationChange={(p) => setPage(p)}
              searchValue={search}
              onSearchChange={(v) => { setSearch(v); setPage(1) }}
              searchPlaceholder="Rechercher une tournee..."
              onRowClick={(row) => setSelectedId(row.id)}
              emptyIcon={Route}
              emptyTitle="Aucune tournee de ramassage"
              storageKey="travelwiz-pickup"
            />
          </PanelContent>
        </div>

        {/* Detail panel */}
        {selectedId && roundDetail && (
          <div className="w-80 border-l border-border bg-background overflow-y-auto p-3 space-y-3 shrink-0">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground">{roundDetail.code}</h3>
              <button
                onClick={() => setSelectedId(null)}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Fermer
              </button>
            </div>
            <StatusBadge status={roundDetail.status} labels={pickupStatusLabels} badges={PICKUP_STATUS_BADGES} />

            <div className="space-y-1.5">
              <h4 className="text-xs font-medium text-foreground uppercase tracking-wide">Arrets</h4>
              {roundDetail.stops?.map((stop) => (
                <div key={stop.id} className="rounded-lg border border-border p-2 text-xs space-y-0.5">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-foreground">{stop.sequence}. {stop.location_name}</span>
                    <span className={cn(
                      'gl-badge text-[10px]',
                      stop.status === 'departed' ? 'gl-badge-success' : stop.status === 'arrived' ? 'gl-badge-warning' : 'gl-badge-neutral',
                    )}>
                      {stop.status}
                    </span>
                  </div>
                  {stop.scheduled_time && (
                    <p className="text-muted-foreground">Prevu: {formatDateTime(stop.scheduled_time)}</p>
                  )}
                  {stop.actual_time && (
                    <p className="text-muted-foreground">Reel: {formatDateTime(stop.actual_time)}</p>
                  )}
                  {stop.pax_names.length > 0 && (
                    <p className="text-muted-foreground">PAX: {stop.pax_names.join(', ')}</p>
                  )}
                </div>
              ))}
            </div>

            {roundDetail.status === 'in_progress' && (
              <button
                className="gl-button-sm gl-button-confirm w-full text-xs"
                onClick={() => closeRound.mutate(roundDetail.id)}
                disabled={closeRound.isPending}
              >
                {closeRound.isPending ? <Loader2 size={12} className="animate-spin" /> : 'Cloturer la tournee'}
              </button>
            )}
          </div>
        )}
      </div>
    </>
  )
}

// ══════════════════════════════════════════════════════════════
// ── WEATHER (METEO) TAB ─────────────────────────────────────
// ══════════════════════════════════════════════════════════════

const FLIGHT_STATUS_MAP: Record<string, { label: string; badge: string }> = {
  green: { label: 'Vol autorise', badge: 'gl-badge-success' },
  amber: { label: 'Vol restreint', badge: 'gl-badge-warning' },
  red:   { label: 'Vol interdit',  badge: 'gl-badge-danger' },
}

function WeatherTab() {
  const { data: weatherData, isLoading } = useLatestWeather()

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-40">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const items = weatherData ?? []

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <CloudSun size={32} className="text-muted-foreground/30 mb-3" />
        <p className="text-sm text-muted-foreground">Aucune donnee meteo disponible</p>
        <p className="text-xs text-muted-foreground/70 mt-1">Les rapports meteo seront affiches ici</p>
      </div>
    )
  }

  return (
    <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {items.map((w) => (
        <div key={w.id} className="rounded-lg border border-border bg-background p-4 space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">{w.site_name}</h3>
            {w.flight_status && (
              <StatusBadge
                status={w.flight_status}
                labels={Object.fromEntries(Object.entries(FLIGHT_STATUS_MAP).map(([key, value]) => [key, value.label]))}
                badges={Object.fromEntries(Object.entries(FLIGHT_STATUS_MAP).map(([key, value]) => [key, value.badge]))}
              />
            )}
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs">
            {w.wind_speed_knots != null && (
              <div>
                <span className="text-muted-foreground">Vent</span>
                <p className="font-medium text-foreground tabular-nums">
                  {w.wind_speed_knots} kn {w.wind_direction || ''}
                </p>
              </div>
            )}
            {w.sea_state && (
              <div>
                <span className="text-muted-foreground">Mer</span>
                <p className="font-medium text-foreground">{w.sea_state}</p>
              </div>
            )}
            {w.visibility_nm != null && (
              <div>
                <span className="text-muted-foreground">Visibilite</span>
                <p className="font-medium text-foreground tabular-nums">{w.visibility_nm} NM</p>
              </div>
            )}
            {w.temperature_c != null && (
              <div>
                <span className="text-muted-foreground">Temperature</span>
                <p className="font-medium text-foreground tabular-nums">{w.temperature_c}C</p>
              </div>
            )}
          </div>

          {w.conditions && (
            <p className="text-xs text-muted-foreground">{w.conditions}</p>
          )}

          <p className="text-[10px] text-muted-foreground/60 tabular-nums">
            {formatDateTime(w.recorded_at)}
          </p>
        </div>
      ))}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// ── MAIN PAGE COMPONENT ──────────────────────────────────────
// ══════════════════════════════════════════════════════════════

export function TravelWizPage() {
  const [activeTab, setActiveTab] = useState<TravelWizTab>('dashboard')
  const dynamicPanel = useUIStore((s) => s.dynamicPanel)
  const openDynamicPanel = useUIStore((s) => s.openDynamicPanel)
  const panelMode = useUIStore((s) => s.dynamicPanelMode)

  const isFullPanel = panelMode === 'full' && dynamicPanel !== null && dynamicPanel.module === 'travelwiz'

  const { hasPermission } = usePermission()
  const canCreate =
    activeTab === 'voyages' ? hasPermission('travelwiz.voyage.create')
      : activeTab === 'vectors' ? hasPermission('travelwiz.vector.create')
          : false

  const handleCreate = useCallback(() => {
    if (activeTab === 'voyages') openDynamicPanel({ type: 'create', module: 'travelwiz', meta: { subtype: 'voyage' } })
    else if (activeTab === 'vectors') openDynamicPanel({ type: 'create', module: 'travelwiz', meta: { subtype: 'vector' } })
  }, [activeTab, openDynamicPanel])

  const createLabel =
    activeTab === 'voyages' ? 'Nouveau voyage'
      : activeTab === 'vectors' ? 'Nouveau vecteur'
          : ''

  const showCreate = ['voyages', 'vectors'].includes(activeTab)

  return (
    <div className="flex h-full">
      {!isFullPanel && (
        <div className="flex flex-1 flex-col min-w-0 overflow-hidden">
          <PanelHeader icon={Plane} title="TravelWiz" subtitle="Transport et logistique">
            {showCreate && canCreate && <ToolbarButton icon={Plus} label={createLabel} variant="primary" onClick={handleCreate} />}
          </PanelHeader>

          {/* Tab bar — uses the shared `TabBar` for cross-module visual parity */}
          <TabBar
            items={TABS}
            activeId={activeTab}
            onTabChange={setActiveTab}
          />

          {activeTab === 'dashboard' && <ModuleDashboard module="travelwiz" />}
          {activeTab === 'voyages' && <VoyagesTab />}
          {activeTab === 'manifests' && <ManifestesTab />}
          {activeTab === 'vectors' && <VecteursTab />}
          {activeTab === 'fleet_map' && <FleetMapTab />}
          {activeTab === 'pickup' && <PickupTab />}
          {activeTab === 'weather' && <WeatherTab />}
        </div>
      )}

      {dynamicPanel?.module === 'travelwiz' && dynamicPanel.type === 'create' && dynamicPanel.meta?.subtype === 'voyage' && <CreateVoyagePanel />}
      {dynamicPanel?.module === 'travelwiz' && dynamicPanel.type === 'create' && dynamicPanel.meta?.subtype === 'rotation' && <CreateRotationPanel />}
      {dynamicPanel?.module === 'travelwiz' && dynamicPanel.type === 'create' && dynamicPanel.meta?.subtype === 'vector' && <CreateVectorPanel />}
      {dynamicPanel?.module === 'travelwiz' && dynamicPanel.type === 'create' && dynamicPanel.meta?.subtype === 'article' && <CreateArticlePanel />}
      {dynamicPanel?.module === 'travelwiz' && dynamicPanel.type === 'detail' && dynamicPanel.meta?.subtype === 'voyage' && <VoyageDetailPanel id={(dynamicPanel as { id: string }).id} />}
      {dynamicPanel?.module === 'travelwiz' && dynamicPanel.type === 'detail' && dynamicPanel.meta?.subtype === 'rotation' && <RotationDetailPanel id={(dynamicPanel as { id: string }).id} />}
      {dynamicPanel?.module === 'travelwiz' && dynamicPanel.type === 'detail' && dynamicPanel.meta?.subtype === 'vector' && <VectorDetailPanel id={(dynamicPanel as { id: string }).id} />}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// ── CREATE PANELS ────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════

function CreateVoyagePanel() {
  const closeDynamicPanel = useUIStore((s) => s.closeDynamicPanel)
  const createVoyage = useCreateVoyage()
  const { data: vectorsData } = useVectors({ page: 1, page_size: 100 })
  const { data: rotationsData } = useRotations({ page: 1, page_size: 100 })
  const { toast } = useToast()
  const [form, setForm] = useState<VoyageCreate>({
    vector_id: '',
    departure_base_id: '',
    scheduled_departure: '',
    scheduled_arrival: null,
    rotation_id: null,
  })
  const vectors = vectorsData?.items ?? []
  const rotations = useMemo(
    () => (rotationsData?.items ?? []).filter((rotation) => !form.vector_id || rotation.vector_id === form.vector_id),
    [rotationsData?.items, form.vector_id],
  )

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await createVoyage.mutateAsync(form)
      toast({ title: 'Voyage cree avec succes', variant: 'success' })
      closeDynamicPanel()
    } catch { toast({ title: 'Erreur lors de la creation du voyage', variant: 'error' }) }
  }

  return (
    <DynamicPanelShell title="Nouveau voyage" subtitle="TravelWiz" icon={<Plane size={14} className="text-primary" />}
      actions={<>
        <PanelActionButton onClick={closeDynamicPanel}>Annuler</PanelActionButton>
        <PanelActionButton variant="primary" disabled={createVoyage.isPending}
          onClick={() => (document.getElementById('create-voyage-form') as HTMLFormElement)?.requestSubmit()}>
          {createVoyage.isPending ? <Loader2 size={12} className="animate-spin" /> : 'Creer'}
        </PanelActionButton>
      </>}
    >
      <form id="create-voyage-form" onSubmit={handleSubmit}>
        <PanelContentLayout>
          <FormSection title="Identification">
            <FormGrid>
              <DynamicPanelField label="Référence">
                <div className="rounded-lg border border-dashed border-border/70 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                  Générée automatiquement par la numérotation TravelWiz au moment de la création.
                </div>
              </DynamicPanelField>
              <DynamicPanelField label="Vecteur" required>
                <select
                  required
                  value={form.vector_id}
                  onChange={(e) => setForm({ ...form, vector_id: e.target.value, rotation_id: null })}
                  className={panelInputClass}
                >
                  <option value="">Sélectionner un vecteur...</option>
                  {vectors.map((vector) => (
                    <option key={vector.id} value={vector.id}>
                      {vector.registration} - {vector.name}
                    </option>
                  ))}
                </select>
              </DynamicPanelField>
            </FormGrid>
          </FormSection>
          <FormSection title="Programmation">
            <FormGrid>
              <DynamicPanelField label="Rotation">
                <select
                  value={form.rotation_id ?? ''}
                  onChange={(e) => setForm({ ...form, rotation_id: e.target.value || null })}
                  className={panelInputClass}
                >
                  <option value="">Voyage ponctuel</option>
                  {rotations.map((rotation) => (
                    <option key={rotation.id} value={rotation.id}>
                      {rotation.name}{rotation.schedule_description ? ` - ${rotation.schedule_description}` : ''}
                    </option>
                  ))}
                </select>
              </DynamicPanelField>
              <DynamicPanelField label="Base de départ" required span="full">
                <AssetPicker
                  value={form.departure_base_id || null}
                  onChange={(assetId) => setForm({ ...form, departure_base_id: assetId ?? '' })}
                  placeholder="Sélectionner une base de départ..."
                />
              </DynamicPanelField>
            </FormGrid>
            <p className="text-xs text-muted-foreground">
              La périodicité régulière se configure sur une rotation. Un voyage créé ici est une occurrence planifiée, éventuellement rattachée à une rotation existante.
            </p>
          </FormSection>
          <FormSection title="Horaires">
            <FormGrid>
              <DynamicPanelField label="Départ prévu" required>
                <input
                  type="datetime-local"
                  required
                  value={form.scheduled_departure}
                  onChange={(e) => setForm({ ...form, scheduled_departure: e.target.value })}
                  className={panelInputClass}
                />
              </DynamicPanelField>
              <DynamicPanelField label="Arrivée prévue">
                <input
                  type="datetime-local"
                  value={form.scheduled_arrival ?? ''}
                  onChange={(e) => setForm({ ...form, scheduled_arrival: e.target.value || null })}
                  className={panelInputClass}
                />
              </DynamicPanelField>
            </FormGrid>
          </FormSection>
        </PanelContentLayout>
      </form>
    </DynamicPanelShell>
  )
}

function CreateRotationPanel() {
  const closeDynamicPanel = useUIStore((s) => s.closeDynamicPanel)
  const createRotation = useCreateRotation()
  const { data: vectorsData } = useVectors({ page: 1, page_size: 100 })
  const { toast } = useToast()
  const [form, setForm] = useState<RotationCreate>({
    name: '',
    vector_id: '',
    departure_base_id: '',
    schedule_cron: null,
    schedule_description: null,
  })
  const vectors = vectorsData?.items ?? []

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await createRotation.mutateAsync(form)
      toast({ title: 'Rotation créée avec succès', variant: 'success' })
      closeDynamicPanel()
    } catch {
      toast({ title: 'Erreur lors de la création de la rotation', variant: 'error' })
    }
  }

  return (
    <DynamicPanelShell
      title="Nouvelle rotation"
      subtitle="Programmation récurrente TravelWiz"
      icon={<Route size={14} className="text-primary" />}
      actions={<>
        <PanelActionButton onClick={closeDynamicPanel}>Annuler</PanelActionButton>
        <PanelActionButton
          variant="primary"
          disabled={createRotation.isPending}
          onClick={() => (document.getElementById('create-rotation-form') as HTMLFormElement)?.requestSubmit()}
        >
          {createRotation.isPending ? <Loader2 size={12} className="animate-spin" /> : 'Créer'}
        </PanelActionButton>
      </>}
    >
      <form id="create-rotation-form" onSubmit={handleSubmit}>
        <PanelContentLayout>
          <FormSection title="Identification">
            <FormGrid>
              <DynamicPanelField label="Nom" required>
                <input
                  type="text"
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className={panelInputClass}
                  placeholder="Rotation Pointe-Noire Hebdo"
                />
              </DynamicPanelField>
              <DynamicPanelField label="Vecteur" required>
                <select
                  required
                  value={form.vector_id}
                  onChange={(e) => setForm({ ...form, vector_id: e.target.value })}
                  className={panelInputClass}
                >
                  <option value="">Sélectionner un vecteur...</option>
                  {vectors.map((vector) => (
                    <option key={vector.id} value={vector.id}>
                      {vector.registration} - {vector.name}
                    </option>
                  ))}
                </select>
              </DynamicPanelField>
              <DynamicPanelField label="Base de départ" required span="full">
                <AssetPicker
                  value={form.departure_base_id || null}
                  onChange={(assetId) => setForm({ ...form, departure_base_id: assetId ?? '' })}
                  placeholder="Sélectionner la base de départ..."
                />
              </DynamicPanelField>
            </FormGrid>
          </FormSection>
          <FormSection title="Périodicité">
            <FormGrid>
              <DynamicPanelField label="Expression CRON">
                <input
                  type="text"
                  value={form.schedule_cron ?? ''}
                  onChange={(e) => setForm({ ...form, schedule_cron: e.target.value || null })}
                  className={panelInputClass}
                  placeholder="0 6 * * 1"
                />
              </DynamicPanelField>
              <DynamicPanelField label="Description métier" span="full">
                <textarea
                  value={form.schedule_description ?? ''}
                  onChange={(e) => setForm({ ...form, schedule_description: e.target.value || null })}
                  className={`${panelInputClass} min-h-[72px] resize-y`}
                  rows={3}
                  placeholder="Tous les lundis à 06h00 depuis la base de départ."
                />
              </DynamicPanelField>
            </FormGrid>
            <p className="text-xs text-muted-foreground">
              La rotation définit la cadence nominale. Les voyages opérationnels restent des occurrences concrètes générées ou planifiées sur cette base.
            </p>
          </FormSection>
        </PanelContentLayout>
      </form>
    </DynamicPanelShell>
  )
}

/** Derive transport mode from vector type. */
function deriveModeFromType(type: string): string {
  switch (type) {
    case 'helicopter':
    case 'commercial_flight':
      return 'air'
    case 'boat':
    case 'ship':
    case 'surfer':
    case 'barge':
    case 'tug':
      return 'sea'
    case 'bus':
    case '4x4':
    case 'vehicle':
      return 'road'
    default:
      return 'road'
  }
}

function CreateVectorPanel() {
  const closeDynamicPanel = useUIStore((s) => s.closeDynamicPanel)
  const createVector = useCreateVector()
  const { toast } = useToast()
  const [form, setForm] = useState<TravelVectorCreate>({
    registration: '', name: '', type: 'helicopter', mode: 'air',
    pax_capacity: 0, weight_capacity_kg: null, volume_capacity_m3: null,
    home_base_id: null, requires_weighing: false, mmsi_number: null, description: null,
  })

  const handleTypeChange = (type: string) => {
    const mode = deriveModeFromType(type)
    setForm((prev) => ({
      ...prev,
      type,
      mode,
      // Clear MMSI when mode is not sea
      mmsi_number: mode === 'sea' ? prev.mmsi_number : null,
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await createVector.mutateAsync(form)
      toast({ title: 'Vecteur cree avec succes', variant: 'success' })
      closeDynamicPanel()
    } catch { toast({ title: 'Erreur lors de la creation du vecteur', variant: 'error' }) }
  }

  return (
    <DynamicPanelShell title="Nouveau vecteur" subtitle="TravelWiz" icon={<Ship size={14} className="text-primary" />}
      actions={<>
        <PanelActionButton onClick={closeDynamicPanel}>Annuler</PanelActionButton>
        <PanelActionButton variant="primary" disabled={createVector.isPending}
          onClick={() => (document.getElementById('create-vector-form') as HTMLFormElement)?.requestSubmit()}>
          {createVector.isPending ? <Loader2 size={12} className="animate-spin" /> : 'Creer'}
        </PanelActionButton>
      </>}
    >
      <form id="create-vector-form" onSubmit={handleSubmit}>
        <PanelContentLayout>
          <FormSection title="Identification">
            <FormGrid>
              <DynamicPanelField label="Immatriculation" required>
                <input type="text" required value={form.registration} onChange={(e) => setForm({ ...form, registration: e.target.value })} className={panelInputClass} placeholder="TJ-ABC" />
              </DynamicPanelField>
              <DynamicPanelField label="Nom" required>
                <input type="text" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={panelInputClass} placeholder="Nom du vecteur" />
              </DynamicPanelField>
              <DynamicPanelField label="Type" required>
                <select value={form.type} onChange={(e) => handleTypeChange(e.target.value)} className={panelInputClass}>
                  <option value="helicopter">Hélicoptère</option>
                  <option value="boat">Bateau</option>
                  <option value="surfer">Surfer</option>
                  <option value="bus">Bus</option>
                  <option value="4x4">4x4</option>
                  <option value="commercial_flight">Vol commercial</option>
                  <option value="barge">Barge</option>
                  <option value="tug">Remorqueur</option>
                </select>
              </DynamicPanelField>
              <DynamicPanelField label="Mode" required>
                <select value={form.mode} onChange={(e) => setForm({ ...form, mode: e.target.value })} className={panelInputClass}>
                  <option value="air">Aerien</option>
                  <option value="sea">Maritime</option>
                  <option value="road">Routier</option>
                </select>
              </DynamicPanelField>
              <DynamicPanelField label="Base d'attache" span="full">
                <AssetPicker
                  value={form.home_base_id}
                  onChange={(assetId) => setForm({ ...form, home_base_id: assetId })}
                  placeholder="Selectionner une base..."
                  clearable
                />
              </DynamicPanelField>
            </FormGrid>
          </FormSection>
          <FormSection title="Capacites">
            <FormGrid>
              <DynamicPanelField label="Capacite PAX" required>
                <input type="number" min={0} required value={form.pax_capacity ?? 0} onChange={(e) => setForm({ ...form, pax_capacity: e.target.value ? Number(e.target.value) : 0 })} className={panelInputClass} />
              </DynamicPanelField>
              <DynamicPanelField label="Capacite poids (kg)">
                <input type="number" min={0} step="any" value={form.weight_capacity_kg ?? ''} onChange={(e) => setForm({ ...form, weight_capacity_kg: e.target.value ? Number(e.target.value) : null })} className={panelInputClass} />
              </DynamicPanelField>
              <DynamicPanelField label="Volume (m3)">
                <input type="number" min={0} step="any" value={form.volume_capacity_m3 ?? ''} onChange={(e) => setForm({ ...form, volume_capacity_m3: e.target.value ? Number(e.target.value) : null })} className={panelInputClass} />
              </DynamicPanelField>
            </FormGrid>
          </FormSection>
          <FormSection title="Operationnel" collapsible defaultExpanded={false}>
            <FormGrid>
              <DynamicPanelField label="Pesee requise">
                <label className="inline-flex items-center gap-2 text-xs">
                  <input type="checkbox" checked={form.requires_weighing ?? false} onChange={(e) => setForm({ ...form, requires_weighing: e.target.checked })} />
                  Activer la pesee obligatoire
                </label>
              </DynamicPanelField>
              {form.mode === 'sea' && (
                <DynamicPanelField label="Numero MMSI">
                  <input type="text" value={form.mmsi_number ?? ''} onChange={(e) => setForm({ ...form, mmsi_number: e.target.value || null })} className={panelInputClass} placeholder="123456789" />
                </DynamicPanelField>
              )}
              <DynamicPanelField label="Description" span="full">
                <textarea value={form.description ?? ''} onChange={(e) => setForm({ ...form, description: e.target.value || null })}
                  className={`${panelInputClass} min-h-[60px] resize-y`} placeholder="Description du vecteur..." rows={3} />
              </DynamicPanelField>
            </FormGrid>
          </FormSection>
        </PanelContentLayout>
      </form>
    </DynamicPanelShell>
  )
}

export function CreateCargoRequestPanel() {
  const closeDynamicPanel = useUIStore((s) => s.closeDynamicPanel)
  const createCargoRequest = useWorkspaceCreateCargoRequest()
  const { toast } = useToast()
  const { moduleLabel } = useCargoWorkspace()
  const [form, setForm] = useState<CargoRequestCreate>({
    title: '',
    description: null,
    project_id: null,
    imputation_reference_id: null,
    sender_tier_id: null,
    sender_contact_tier_contact_id: null,
    receiver_name: null,
    destination_asset_id: null,
    requester_user_id: null,
    requester_name: null,
  })
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await createCargoRequest.mutateAsync(form)
      toast({ title: "Demande d'expédition créée", variant: 'success' })
      closeDynamicPanel()
    } catch {
      toast({ title: "Erreur lors de la création de la demande d'expédition", variant: 'error' })
    }
  }

  const readinessChecklist = [
    { label: 'Intitulé métier de la demande', done: Boolean(form.title.trim()) },
    { label: 'Description opérationnelle', done: Boolean((form.description ?? '').trim()) },
    { label: 'Entreprise expéditrice', done: Boolean(form.sender_tier_id) },
    { label: 'Contact entreprise', done: Boolean(form.sender_contact_tier_contact_id) },
    { label: 'Destinataire', done: Boolean((form.receiver_name ?? '').trim()) },
    { label: 'Site de destination', done: Boolean(form.destination_asset_id) },
    { label: 'Imputation', done: Boolean(form.imputation_reference_id) },
    { label: 'Demandeur', done: Boolean(form.requester_user_id || (form.requester_name ?? '').trim()) },
  ]
  const readinessScore = Math.round((readinessChecklist.filter((item) => item.done).length / readinessChecklist.length) * 100)

  return (
    <DynamicPanelShell
      title="Nouvelle demande d’expédition"
      subtitle={moduleLabel}
      icon={<FileText size={14} className="text-primary" />}
      actions={
        <>
          <PanelActionButton onClick={closeDynamicPanel}>Annuler</PanelActionButton>
          <PanelActionButton
            variant="primary"
            disabled={createCargoRequest.isPending}
            onClick={() => (document.getElementById('create-cargo-request-form') as HTMLFormElement)?.requestSubmit()}
          >
            {createCargoRequest.isPending ? <Loader2 size={12} className="animate-spin" /> : 'Créer'}
          </PanelActionButton>
        </>
      }
    >
      <form id="create-cargo-request-form" onSubmit={handleSubmit}>
        <PanelContentLayout>
          <div className="space-y-5">
            <div className="space-y-3 rounded-xl border border-border/70 bg-card p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="gl-badge gl-badge-info">Brouillon</span>
                <span className={cn('gl-badge', readinessScore >= 100 ? 'gl-badge-success' : 'gl-badge-warning')}>
                  {readinessScore >= 100 ? 'Prête pour saisie colis' : 'Préparation dossier'}
                </span>
              </div>
              <div className="grid gap-3 md:grid-cols-4">
                <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Référence</p>
                  <p className="mt-1 text-xs text-muted-foreground">Générée automatiquement à l’enregistrement</p>
                </div>
                <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Complétude</p>
                  <p className="mt-1 text-lg font-semibold text-foreground">{readinessScore}%</p>
                </div>
                <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Projet</p>
                  <p className="mt-1 text-sm font-medium text-foreground">{form.project_id ? 'Renseigné' : 'Optionnel'}</p>
                </div>
                <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Demandeur</p>
                  <p className="mt-1 text-sm font-medium text-foreground">{form.requester_user_id || form.requester_name ? 'Renseigné' : 'À préciser'}</p>
                </div>
              </div>
              <div className="grid gap-2 md:grid-cols-2">
                {readinessChecklist.map((item) => (
                  <div key={item.label} className="flex items-center gap-2 text-xs">
                    <span className={cn('inline-flex h-4 w-4 items-center justify-center rounded-full text-[10px]', item.done ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700')}>
                      {item.done ? '✓' : '•'}
                    </span>
                    <span className={item.done ? 'text-foreground' : 'text-muted-foreground'}>{item.label}</span>
                  </div>
                ))}
              </div>
            </div>

            <FormSection title="Demande d’expédition">
              <FormGrid>
                <DynamicPanelField label="Intitulé" required>
                  <input
                    type="text"
                    required
                    value={form.title}
                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                    className={panelInputClass}
                    placeholder="Demande d’expédition équipements forage"
                  />
                </DynamicPanelField>
                <DynamicPanelField label="Projet">
                  <ProjectPicker
                    value={form.project_id ?? null}
                    onChange={(projectId) => setForm({ ...form, project_id: projectId ?? null })}
                    clearable
                    placeholder="Sélectionner un projet..."
                  />
                </DynamicPanelField>
                <DynamicPanelField label="Description" span="full">
                  <textarea
                    value={form.description ?? ''}
                    onChange={(e) => setForm({ ...form, description: e.target.value || null })}
                    className={`${panelInputClass} min-h-[72px] resize-y`}
                    rows={3}
                  />
                </DynamicPanelField>
              </FormGrid>
            </FormSection>

            <FormSection title="Contexte logistique">
              <FormGrid>
                <DynamicPanelField label="Imputation">
                  <ImputationPicker
                    value={form.imputation_reference_id ?? null}
                    onChange={(id) => setForm({ ...form, imputation_reference_id: id ?? null })}
                    placeholder="Sélectionner une imputation..."
                  />
                </DynamicPanelField>
                <DynamicPanelField label="Entreprise expéditrice">
                  <CompanyPicker
                    value={form.sender_tier_id ?? null}
                    onChange={(id) => setForm({ ...form, sender_tier_id: id ?? null, sender_contact_tier_contact_id: null })}
                    placeholder="Sélectionner une entreprise..."
                  />
                </DynamicPanelField>
                <DynamicPanelField label="Contact entreprise">
                  <ContactPicker
                    value={form.sender_contact_tier_contact_id ?? null}
                    onChange={(id) => setForm({ ...form, sender_contact_tier_contact_id: id ?? null })}
                    placeholder="Sélectionner un contact..."
                    tierId={form.sender_tier_id ?? null}
                  />
                </DynamicPanelField>
                <DynamicPanelField label="Destinataire">
                  <input type="text" value={form.receiver_name ?? ''} onChange={(e) => setForm({ ...form, receiver_name: e.target.value || null })} className={panelInputClass} />
                </DynamicPanelField>
                <DynamicPanelField label="Installation de destination" span="full">
                  <AssetPicker
                    value={form.destination_asset_id ?? null}
                    onChange={(assetId) => setForm({ ...form, destination_asset_id: assetId ?? null })}
                    clearable
                    placeholder="Sélectionner l'installation de destination..."
                  />
                </DynamicPanelField>
                <DynamicPanelField label="Demandeur">
                  <UserPicker
                    value={form.requester_user_id ?? null}
                    onChange={(id) => setForm({ ...form, requester_user_id: id ?? null })}
                    placeholder="Sélectionner un utilisateur..."
                  />
                </DynamicPanelField>
                <DynamicPanelField label="Demandeur libre">
                  <input type="text" value={form.requester_name ?? ''} onChange={(e) => setForm({ ...form, requester_name: e.target.value || null })} className={panelInputClass} placeholder="Fallback si le demandeur n'existe pas dans le référentiel" />
                </DynamicPanelField>
              </FormGrid>
            </FormSection>
          </div>
        </PanelContentLayout>
      </form>
    </DynamicPanelShell>
  )
}

export function CreateCargoPanel() {
  const dynamicPanel = useUIStore((s) => s.dynamicPanel)
  const openDynamicPanel = useUIStore((s) => s.openDynamicPanel)
  const closeDynamicPanel = useUIStore((s) => s.closeDynamicPanel)
  const { panelModule, moduleLabel } = useCargoWorkspace()
  const cargoTypeCategory = useCargoDictionaryCategory('cargo_type')
  const ownershipCategory = useCargoDictionaryCategory('cargo_ownership_type')
  const createCargo = useWorkspaceCreateCargo()
  const { data: cargoRequestsData } = useWorkspaceCargoRequests({ page: 1, page_size: 100 })
  const cargoTypeOptions = useDictionaryOptions(cargoTypeCategory)
  const ownershipOptions = useDictionaryOptions(ownershipCategory)
  const { toast } = useToast()
  const [form, setForm] = useState<CargoItemCreate>({
    request_id: null,
    description: '',
    designation: '',
    cargo_type: 'unit',
    weight_kg: 0,
    width_cm: null,
    length_cm: null,
    height_cm: null,
    surface_m2: null,
    package_count: 1,
    stackable: false,
    sender_tier_id: null,
    receiver_name: null,
    destination_asset_id: null,
    project_id: null,
    imputation_reference_id: null,
    ownership_type: null,
    pickup_location_label: null,
    pickup_latitude: null,
    pickup_longitude: null,
    requester_name: null,
    document_prepared_at: null,
    available_from: null,
    pickup_contact_user_id: null,
    pickup_contact_tier_contact_id: null,
    pickup_contact_name: null,
    pickup_contact_phone: null,
    lifting_provider: null,
    lifting_points_certified: false,
    weight_ticket_provided: false,
    photo_evidence_count: 0,
    document_attachment_count: 0,
    manifest_id: null,
    sap_article_code: null,
    hazmat_validated: false,
  })
  const cargoRequests = cargoRequestsData?.items ?? []
  const preselectedRequestId = dynamicPanel?.module === panelModule && dynamicPanel.type === 'create' && dynamicPanel.meta?.subtype === 'cargo'
    ? ((dynamicPanel.meta as { requestId?: string }).requestId ?? null)
    : null
  const selectedRequest = form.request_id
    ? cargoRequests.find((request) => request.id === form.request_id) ?? null
    : null
  const pickupMapUrl = buildPickupMapUrl(form.pickup_latitude, form.pickup_longitude)
  const pickupMapEmbedUrl = buildPickupMapEmbedUrl(form.pickup_latitude, form.pickup_longitude)

  useEffect(() => {
    if (preselectedRequestId) {
      setForm((current) => current.request_id === preselectedRequestId ? current : { ...current, request_id: preselectedRequestId })
    }
  }, [preselectedRequestId])

  useEffect(() => {
    if (!selectedRequest) return
    setForm((current) => ({
      ...current,
      sender_tier_id: selectedRequest.sender_tier_id ?? null,
      receiver_name: selectedRequest.receiver_name ?? null,
      destination_asset_id: selectedRequest.destination_asset_id ?? null,
      project_id: selectedRequest.project_id ?? null,
      imputation_reference_id: selectedRequest.imputation_reference_id ?? null,
      requester_name: selectedRequest.requester_display_name ?? selectedRequest.requester_name ?? current.requester_name ?? null,
    }))
  }, [selectedRequest])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.request_id) {
      toast({ title: 'Sélectionne d’abord une demande d’expédition', variant: 'error' })
      return
    }
    try {
      const createdCargo = await createCargo.mutateAsync(form)
      toast({ title: 'Colis cree avec succes', description: 'Vous pouvez maintenant ajouter les photos et documents au colis.', variant: 'success' })
      openDynamicPanel({ type: 'detail', module: panelModule, id: createdCargo.id, meta: { subtype: 'cargo' } })
    } catch { toast({ title: 'Erreur lors de la creation du colis', variant: 'error' }) }
  }

  return (
    <DynamicPanelShell title="Nouveau colis" subtitle={moduleLabel} icon={<Package size={14} className="text-primary" />}
      actions={<>
        <PanelActionButton onClick={closeDynamicPanel}>Annuler</PanelActionButton>
        <PanelActionButton variant="primary" disabled={createCargo.isPending}
          onClick={() => (document.getElementById('create-cargo-form') as HTMLFormElement)?.requestSubmit()}>
          {createCargo.isPending ? <Loader2 size={12} className="animate-spin" /> : 'Creer'}
        </PanelActionButton>
      </>}
    >
      <form id="create-cargo-form" onSubmit={handleSubmit}>
        <PanelContentLayout>
          <SectionColumns>
            <div className="@container space-y-5">
              <FormSection title="Identification">
            <FormGrid>
              <DynamicPanelField label="Demande d’expédition">
                <select
                  value={form.request_id ?? ''}
                  onChange={(e) => setForm({ ...form, request_id: e.target.value || null })}
                  className={panelInputClass}
                  disabled={!!preselectedRequestId}
                >
                  <option value="">{preselectedRequestId ? 'Demande parente imposée' : 'Aucune demande parente'}</option>
                  {cargoRequests.map((request) => (
                    <option key={request.id} value={request.id}>{request.request_code} — {request.title}</option>
                  ))}
                </select>
                {selectedRequest && (
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Ce colis sera créé dans la demande ` {selectedRequest.request_code} `.
                  </p>
                )}
              </DynamicPanelField>
              <DynamicPanelField label="Référence">
                <div className="rounded-lg border border-dashed border-border/70 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                  Générée automatiquement par la numérotation TravelWiz à l’enregistrement du colis.
                </div>
              </DynamicPanelField>
              <DynamicPanelField label="Type de colis" required>
                <select value={form.cargo_type} onChange={(e) => setForm({ ...form, cargo_type: e.target.value })} className={panelInputClass}>
                  {cargoTypeOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </DynamicPanelField>
              <DynamicPanelField label="Désignation">
                <input type="text" value={form.designation ?? ''} onChange={(e) => setForm({ ...form, designation: e.target.value || null })} className={panelInputClass} placeholder="Désignation courte du colis" />
              </DynamicPanelField>
              <DynamicPanelField label="Article SAP">
                <input type="text" value={form.sap_article_code ?? ''} onChange={(e) => setForm({ ...form, sap_article_code: e.target.value || null })} className={panelInputClass} placeholder="MAT-00001" />
              </DynamicPanelField>
              <DynamicPanelField label="Description" required span="full">
                <textarea
                  required
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className={`${panelInputClass} min-h-[60px] resize-y`}
                  placeholder="Description opérationnelle du colis, de l’unité ou du lot..."
                  rows={3}
                />
              </DynamicPanelField>
            </FormGrid>
            {selectedRequest && (
              <div className="mt-3 rounded-xl border border-border/60 bg-muted/20 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="gl-badge gl-badge-info">Hérité de la demande</span>
                  <span className="text-xs font-medium text-foreground">{selectedRequest.request_code} — {selectedRequest.title}</span>
                </div>
                <div className="mt-3 grid gap-3 md:grid-cols-4">
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Projet</p>
                    <p className="mt-1 text-sm text-foreground">{selectedRequest.project_id ? 'Renseigné' : '—'}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Imputation</p>
                    <p className="mt-1 text-sm text-foreground">{selectedRequest.imputation_reference_name ?? selectedRequest.imputation_reference_code ?? '—'}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Destination</p>
                    <p className="mt-1 text-sm text-foreground">{selectedRequest.destination_name ?? '—'}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Demandeur</p>
                    <p className="mt-1 text-sm text-foreground">{selectedRequest.requester_display_name ?? selectedRequest.requester_name ?? '—'}</p>
                  </div>
                </div>
              </div>
            )}
              </FormSection>
              <FormSection title="Préparation logistique" collapsible defaultExpanded>
            <FormGrid>
              <DynamicPanelField label="Propriété du matériel">
                <select value={form.ownership_type ?? ''} onChange={(e) => setForm({ ...form, ownership_type: e.target.value || null })} className={panelInputClass}>
                  <option value="">Sélectionner...</option>
                  {ownershipOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </DynamicPanelField>
              <DynamicPanelField label="Document préparé le">
                <input type="datetime-local" value={form.document_prepared_at ?? ''} onChange={(e) => setForm({ ...form, document_prepared_at: e.target.value || null })} className={panelInputClass} />
              </DynamicPanelField>
              <DynamicPanelField label="Mise à disposition">
                <input type="datetime-local" value={form.available_from ?? ''} onChange={(e) => setForm({ ...form, available_from: e.target.value || null })} className={panelInputClass} />
              </DynamicPanelField>
            </FormGrid>
              </FormSection>
            </div>
            <div className="@container space-y-5">
              <FormSection title="Dimensions">
            <FormGrid>
              <DynamicPanelField label="Poids (kg)" required>
                <input type="number" min={0.001} step="any" required value={form.weight_kg || ''} onChange={(e) => setForm({ ...form, weight_kg: e.target.value ? Number(e.target.value) : 0 })} className={panelInputClass} />
              </DynamicPanelField>
              <DynamicPanelField label="Largeur (cm)">
                <input type="number" min={0} step="any" value={form.width_cm ?? ''} onChange={(e) => setForm({ ...form, width_cm: e.target.value ? Number(e.target.value) : null })} className={panelInputClass} />
              </DynamicPanelField>
              <DynamicPanelField label="Longueur (cm)">
                <input type="number" min={0} step="any" value={form.length_cm ?? ''} onChange={(e) => setForm({ ...form, length_cm: e.target.value ? Number(e.target.value) : null })} className={panelInputClass} />
              </DynamicPanelField>
              <DynamicPanelField label="Hauteur (cm)">
                <input type="number" min={0} step="any" value={form.height_cm ?? ''} onChange={(e) => setForm({ ...form, height_cm: e.target.value ? Number(e.target.value) : null })} className={panelInputClass} />
              </DynamicPanelField>
              <DynamicPanelField label="Surface totale (m²)">
                <input type="number" min={0} step="any" value={form.surface_m2 ?? ''} onChange={(e) => setForm({ ...form, surface_m2: e.target.value ? Number(e.target.value) : null })} className={panelInputClass} />
              </DynamicPanelField>
              <DynamicPanelField label="Nombre de colis">
                <input type="number" min={1} step={1} value={form.package_count ?? 1} onChange={(e) => setForm({ ...form, package_count: e.target.value ? Number(e.target.value) : 1 })} className={panelInputClass} />
              </DynamicPanelField>
              <DynamicPanelField label="Empilable">
                <label className="inline-flex items-center gap-2 text-xs">
                  <input type="checkbox" checked={form.stackable ?? false} onChange={(e) => setForm({ ...form, stackable: e.target.checked })} />
                  Oui, ce colis peut être empilé
                </label>
              </DynamicPanelField>
            </FormGrid>
            <p className="text-xs text-muted-foreground">
              Les dimensions physiques sont utilisées pour raisonner la place occupée et préparer le placement pont, pas seulement un volume libre saisi à la main.
            </p>
              </FormSection>
              <FormSection title="Conformité colis" collapsible defaultExpanded>
            <FormGrid>
              <DynamicPanelField label="Validation HAZMAT">
                <label className="inline-flex items-center gap-2 text-xs">
                  <input type="checkbox" checked={form.hazmat_validated ?? false} onChange={(e) => setForm({ ...form, hazmat_validated: e.target.checked })} />
                  Conforme / validé pour traitement HAZMAT
                </label>
              </DynamicPanelField>
            </FormGrid>
              </FormSection>
              <FormSection title="Enlèvement et preuves" collapsible defaultExpanded>
            <FormGrid>
              <DynamicPanelField label="Lieu d’enlèvement" span="full">
                <input type="text" value={form.pickup_location_label ?? ''} onChange={(e) => setForm({ ...form, pickup_location_label: e.target.value || null })} className={panelInputClass} placeholder="Base, quai, magasin, yard..." />
              </DynamicPanelField>
              <DynamicPanelField label="Latitude">
                <input type="number" step="any" value={form.pickup_latitude ?? ''} onChange={(e) => setForm({ ...form, pickup_latitude: e.target.value ? Number(e.target.value) : null })} className={panelInputClass} />
              </DynamicPanelField>
              <DynamicPanelField label="Longitude">
                <input type="number" step="any" value={form.pickup_longitude ?? ''} onChange={(e) => setForm({ ...form, pickup_longitude: e.target.value ? Number(e.target.value) : null })} className={panelInputClass} />
              </DynamicPanelField>
              <DynamicPanelField label="Aperçu cartographique" span="full">
                {pickupMapEmbedUrl ? (
                  <div className="space-y-2">
                    <div className="overflow-hidden rounded-lg border border-border">
                      <iframe
                        title="Pickup map preview"
                        src={pickupMapEmbedUrl}
                        className="h-48 w-full bg-muted"
                        loading="lazy"
                        referrerPolicy="no-referrer-when-downgrade"
                      />
                    </div>
                    {pickupMapUrl && (
                      <a
                        href={pickupMapUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-2 text-xs text-foreground hover:text-primary"
                      >
                        <MapPin size={12} />
                        Ouvrir la localisation sur la carte
                      </a>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">Renseigne latitude et longitude pour visualiser le point de pickup sur la carte.</p>
                )}
              </DynamicPanelField>
              <DynamicPanelField label="Contact utilisateur">
                <UserPicker
                  value={form.pickup_contact_user_id ?? null}
                  onChange={(id) => setForm({ ...form, pickup_contact_user_id: id ?? null })}
                  placeholder="Sélectionner un utilisateur..."
                />
              </DynamicPanelField>
              <DynamicPanelField label="Contact entreprise">
                <ContactPicker
                  value={form.pickup_contact_tier_contact_id ?? null}
                  onChange={(id) => setForm({ ...form, pickup_contact_tier_contact_id: id ?? null })}
                  placeholder="Sélectionner un contact..."
                  tierId={form.sender_tier_id ?? null}
                />
              </DynamicPanelField>
              <DynamicPanelField label="Nom libre du contact">
                <input type="text" value={form.pickup_contact_name ?? ''} onChange={(e) => setForm({ ...form, pickup_contact_name: e.target.value || null })} className={panelInputClass} placeholder="Fallback si hors référentiel" />
              </DynamicPanelField>
              <DynamicPanelField label="Téléphone contact">
                <input type="text" value={form.pickup_contact_phone ?? ''} onChange={(e) => setForm({ ...form, pickup_contact_phone: e.target.value || null })} className={panelInputClass} placeholder="+237..." />
              </DynamicPanelField>
              <DynamicPanelField label="Moyen de levage fourni par">
                <input type="text" value={form.lifting_provider ?? ''} onChange={(e) => setForm({ ...form, lifting_provider: e.target.value || null })} className={panelInputClass} placeholder="Entreprise, site, prestataire..." />
              </DynamicPanelField>
              <DynamicPanelField label="Oreilles de levage certifiées">
                <label className="inline-flex items-center gap-2 text-xs">
                  <input type="checkbox" checked={form.lifting_points_certified ?? false} onChange={(e) => setForm({ ...form, lifting_points_certified: e.target.checked })} />
                  Certification fournie
                </label>
              </DynamicPanelField>
              <DynamicPanelField label="Preuve de pesée">
                <label className="inline-flex items-center gap-2 text-xs">
                  <input type="checkbox" checked={form.weight_ticket_provided ?? false} onChange={(e) => setForm({ ...form, weight_ticket_provided: e.target.checked })} />
                  Ticket de pesée disponible
                </label>
              </DynamicPanelField>
              <DynamicPanelField label="Photos et documents" span="full">
                <div className="rounded-lg border border-dashed border-border/70 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                  Les fichiers joints, photos terrain et preuves documentaires se gèrent après création du colis via l’onglet fichiers du détail colis.
                </div>
              </DynamicPanelField>
            </FormGrid>
              </FormSection>
            </div>
          </SectionColumns>
        </PanelContentLayout>
      </form>
    </DynamicPanelShell>
  )
}

export function CargoRequestDetailPanel({ id }: { id: string }) {
  const { panelModule } = useCargoWorkspace()
  const cargoRequestStatusCategory = useCargoDictionaryCategory('cargo_request_status')
  const { data: cargoRequest, isLoading } = useWorkspaceCargoRequest(id)
  const { data: requestCargoData } = useWorkspaceCargo({ page: 1, page_size: 100, request_id: id })
  const { data: loadingOptions } = useWorkspaceCargoRequestLoadingOptions(id)
  const downloadCargoRequestLtPdf = useWorkspaceCargoRequestLtPdf()
  const updateCargoRequest = useWorkspaceUpdateCargoRequest()
  const applyLoadingOption = useWorkspaceApplyCargoRequestLoadingOption()
  const requestStatusOptions = useDictionaryOptions(cargoRequestStatusCategory)
  const requestStatusLabels = useDictionaryLabels(cargoRequestStatusCategory)
  const { toast } = useToast()
  const [editing, setEditing] = useState(false)
  const [editForm, setEditForm] = useState<CargoRequestUpdate>({})
  const requestCargo = requestCargoData?.items ?? []
  const missingRequirements = cargoRequest?.missing_requirements ?? []
  const totalWeightKg = requestCargo.reduce((sum, cargo) => sum + Number(cargo.weight_kg || 0), 0)
  const totalPackages = requestCargo.reduce((sum, cargo) => sum + Number(cargo.package_count || 0), 0)
  const deliveredCount = requestCargo.filter((cargo) => cargo.status === 'delivered_final').length
  const inTransitCount = requestCargo.filter((cargo) => cargo.status === 'in_transit').length
  const blockedCount = requestCargo.filter((cargo) => ['damaged', 'missing'].includes(cargo.status)).length
  const assignedCount = requestCargo.filter((cargo) => Boolean(cargo.manifest_id)).length
  const requestStatusBadges: Record<string, string> = {
    draft: 'gl-badge-neutral',
    submitted: 'gl-badge-warning',
    approved: 'gl-badge-info',
    assigned: 'gl-badge-info',
    in_progress: 'gl-badge-info',
    closed: 'gl-badge-success',
    cancelled: 'gl-badge-danger',
  }
  const completionRatio = Math.max(
    0,
    Math.min(
      100,
      cargoRequest?.is_ready_for_submission
        ? 100
        : Math.round(((Math.max(7 - missingRequirements.length, 0)) / 7) * 100),
    ),
  )

  const startEdit = useCallback(() => {
    if (!cargoRequest) return
    setEditForm({
      title: cargoRequest.title,
      description: cargoRequest.description,
      status: cargoRequest.status,
      project_id: cargoRequest.project_id,
      imputation_reference_id: cargoRequest.imputation_reference_id,
      sender_tier_id: cargoRequest.sender_tier_id,
      sender_contact_tier_contact_id: cargoRequest.sender_contact_tier_contact_id,
      receiver_name: cargoRequest.receiver_name,
      destination_asset_id: cargoRequest.destination_asset_id,
      requester_user_id: cargoRequest.requester_user_id,
      requester_name: cargoRequest.requester_name,
    })
    setEditing(true)
  }, [cargoRequest])

  const handleSave = async () => {
    try {
      await updateCargoRequest.mutateAsync({ id, payload: editForm })
      toast({ title: "Demande d'expédition mise à jour", variant: 'success' })
      setEditing(false)
    } catch (error) {
      const missing = Array.isArray((error as { response?: { data?: { detail?: { missing_requirements?: string[] } } } })?.response?.data?.detail?.missing_requirements)
        ? ((error as { response?: { data?: { detail?: { missing_requirements?: string[] } } } }).response?.data?.detail?.missing_requirements ?? [])
        : []
      const requirementLabels: Record<string, string> = {
        title: 'Intitulé de la demande',
        description: 'Description de la demande',
        sender_tier_id: 'Expéditeur',
        sender_contact_tier_contact_id: 'Contact entreprise',
        receiver_name: 'Destinataire',
        destination_asset_id: 'Installation de destination',
        imputation_reference_id: 'Imputation',
        requester: 'Demandeur',
        cargo_items: 'Au moins un colis rattaché',
      }
      toast({
        title: missing.length > 0
          ? `Demande incomplète: ${missing.map((item) => requirementLabels[item] ?? item).join(', ')}`
          : "Erreur lors de la mise à jour de la demande",
        variant: 'error',
      })
    }
  }

  const handleApplyLoadingOption = async (voyageId: string) => {
    try {
      await applyLoadingOption.mutateAsync({ id, voyageId })
      toast({ title: 'Proposition de chargement appliquée', variant: 'success' })
    } catch (error) {
      const blockingReasons = Array.isArray((error as { response?: { data?: { detail?: { blocking_reasons?: string[] } } } })?.response?.data?.detail?.blocking_reasons)
        ? ((error as { response?: { data?: { detail?: { blocking_reasons?: string[] } } } }).response?.data?.detail?.blocking_reasons ?? [])
        : []
      const reasonLabels: Record<string, string> = {
        destination_mismatch: 'destination non desservie par le voyage',
        manifest_not_draft: 'manifeste cargo non modifiable',
        insufficient_weight_capacity: 'capacité poids insuffisante',
        no_zone_capacity_match: 'aucune zone compatible',
      }
      toast({
        title: blockingReasons.length > 0
          ? `Chargement impossible: ${blockingReasons.map((item) => reasonLabels[item] ?? item).join(', ')}`
          : 'Erreur lors de l’affectation au voyage',
        variant: 'error',
      })
    }
  }

  const handlePrintLt = async () => {
    try {
      await downloadCargoRequestLtPdf.mutateAsync(id)
    } catch {
      toast({ title: 'Impossible d imprimer la LT', description: 'Verifiez le modele PDF cargo.lt.', variant: 'error' })
    }
  }

  if (isLoading || !cargoRequest) {
    return (
      <DynamicPanelShell title="Chargement..." icon={<FileText size={14} className="text-primary" />}>
        <div className="flex items-center justify-center py-16"><Loader2 size={16} className="animate-spin text-muted-foreground" /></div>
      </DynamicPanelShell>
    )
  }

  return (
    <DynamicPanelShell
      title={cargoRequest.request_code}
      subtitle={cargoRequest.title}
      icon={<FileText size={14} className="text-primary" />}
      actions={
        <>
          {!editing && (
            <PanelActionButton
              variant="primary"
              onClick={() => useUIStore.getState().openDynamicPanel({
                type: 'create',
                module: panelModule,
                meta: { subtype: 'cargo', requestId: id, requestTitle: cargoRequest.title, requestCode: cargoRequest.request_code },
              })}
              icon={<Plus size={12} />}
            >
              Ajouter un colis
            </PanelActionButton>
          )}
          {!editing && <PanelActionButton onClick={handlePrintLt} disabled={downloadCargoRequestLtPdf.isPending} icon={<FileText size={12} />}>Imprimer LT</PanelActionButton>}
          {!editing && <PanelActionButton onClick={startEdit} icon={<Pencil size={12} />}>Modifier</PanelActionButton>}
          {editing && (
            <>
              <PanelActionButton onClick={() => setEditing(false)}>Annuler</PanelActionButton>
              <PanelActionButton variant="primary" onClick={handleSave} disabled={updateCargoRequest.isPending} icon={<Save size={12} />}>
                {updateCargoRequest.isPending ? <Loader2 size={12} className="animate-spin" /> : 'Enregistrer'}
              </PanelActionButton>
            </>
          )}
        </>
      }
    >
      <PanelContentLayout>
        {editing ? (
          <FormSection title="Demande d’expédition">
            <FormGrid>
              <DynamicPanelField label="Intitulé">
                <input type="text" value={editForm.title ?? ''} onChange={(e) => setEditForm({ ...editForm, title: e.target.value })} className={panelInputClass} />
              </DynamicPanelField>
              <DynamicPanelField label="Statut">
                <select value={editForm.status ?? ''} onChange={(e) => setEditForm({ ...editForm, status: (e.target.value || null) as CargoRequestUpdate['status'] })} className={panelInputClass}>
                  <option value="">Sélectionner...</option>
                  {requestStatusOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </DynamicPanelField>
              <DynamicPanelField label="Description" span="full">
                <textarea value={editForm.description ?? ''} onChange={(e) => setEditForm({ ...editForm, description: e.target.value || null })} className={`${panelInputClass} min-h-[72px] resize-y`} rows={3} />
              </DynamicPanelField>
              <DynamicPanelField label="Entreprise expéditrice">
                <CompanyPicker
                  value={editForm.sender_tier_id ?? null}
                  onChange={(id) => setEditForm({ ...editForm, sender_tier_id: id ?? null, sender_contact_tier_contact_id: null })}
                  placeholder="Sélectionner une entreprise..."
                />
              </DynamicPanelField>
              <DynamicPanelField label="Contact entreprise">
                <ContactPicker
                  value={editForm.sender_contact_tier_contact_id ?? null}
                  onChange={(id) => setEditForm({ ...editForm, sender_contact_tier_contact_id: id ?? null })}
                  placeholder="Sélectionner un contact..."
                  tierId={editForm.sender_tier_id ?? null}
                />
              </DynamicPanelField>
              <DynamicPanelField label="Destinataire">
                <input type="text" value={editForm.receiver_name ?? ''} onChange={(e) => setEditForm({ ...editForm, receiver_name: e.target.value || null })} className={panelInputClass} />
              </DynamicPanelField>
              <DynamicPanelField label="Imputation">
                <ImputationPicker
                  value={editForm.imputation_reference_id ?? null}
                  onChange={(id) => setEditForm({ ...editForm, imputation_reference_id: id ?? null })}
                  placeholder="Sélectionner une imputation..."
                />
              </DynamicPanelField>
              <DynamicPanelField label="Demandeur">
                <UserPicker
                  value={editForm.requester_user_id ?? null}
                  onChange={(id) => setEditForm({ ...editForm, requester_user_id: id ?? null })}
                  placeholder="Sélectionner un utilisateur..."
                />
              </DynamicPanelField>
              <DynamicPanelField label="Demandeur libre">
                <input type="text" value={editForm.requester_name ?? ''} onChange={(e) => setEditForm({ ...editForm, requester_name: e.target.value || null })} className={panelInputClass} placeholder="Fallback si le demandeur n'existe pas dans le référentiel" />
              </DynamicPanelField>
              <DynamicPanelField label="Installation de destination" span="full">
                <AssetPicker
                  value={editForm.destination_asset_id ?? null}
                  onChange={(assetId) => setEditForm({ ...editForm, destination_asset_id: assetId ?? null })}
                  clearable
                  placeholder="Sélectionner l'installation de destination..."
                />
              </DynamicPanelField>
              <DynamicPanelField label="Projet" span="full">
                <ProjectPicker
                  value={editForm.project_id ?? null}
                  onChange={(projectId) => setEditForm({ ...editForm, project_id: projectId ?? null })}
                  clearable
                  placeholder="Sélectionner un projet..."
                />
              </DynamicPanelField>
            </FormGrid>
          </FormSection>
        ) : (
          <>
            <div className="space-y-3 rounded-xl border border-border/70 bg-card p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className={cn('gl-badge', requestStatusBadges[cargoRequest.status] ?? 'gl-badge-neutral')}>
                  {requestStatusLabels[cargoRequest.status] ?? cargoRequest.status}
                </span>
                <span className={cn('gl-badge', cargoRequest.is_ready_for_submission ? 'gl-badge-success' : 'gl-badge-warning')}>
                  {cargoRequest.is_ready_for_submission ? 'Prête à soumettre' : 'À compléter'}
                </span>
                {loadingOptions?.length ? <span className="gl-badge gl-badge-info">{loadingOptions.length} option(s) de chargement</span> : null}
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Demande d’expédition</p>
                <h3 className="mt-1 text-lg font-semibold text-foreground">{cargoRequest.request_code}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{cargoRequest.title}</p>
              </div>
              <div className="grid gap-3 md:grid-cols-4">
                <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Complétude</p>
                  <p className="mt-1 text-lg font-semibold text-foreground">{completionRatio}%</p>
                </div>
                <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Colis</p>
                  <p className="mt-1 text-lg font-semibold text-foreground">{requestCargo.length}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{totalPackages.toLocaleString('fr-FR')} packages</p>
                </div>
                <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Poids total</p>
                  <p className="mt-1 text-lg font-semibold text-foreground">{totalWeightKg.toLocaleString('fr-FR')} kg</p>
                  <p className="mt-1 text-xs text-muted-foreground">{assignedCount} affectés à un manifeste</p>
                </div>
                <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Suivi</p>
                  <p className="mt-1 text-sm font-medium text-foreground">{deliveredCount} livrés · {inTransitCount} en transit</p>
                  <p className="mt-1 text-xs text-muted-foreground">{blockedCount} colis bloqués</p>
                </div>
              </div>
            </div>

            <FormSection title="Lecture opérationnelle" collapsible defaultExpanded>
              <div className="space-y-2">
                {[
                  { label: 'Intitulé de la demande', done: Boolean(cargoRequest.title?.trim()) },
                  { label: 'Description de la demande', done: Boolean(cargoRequest.description?.trim()) },
                  { label: 'Entreprise expéditrice', done: Boolean(cargoRequest.sender_tier_id) },
                  { label: 'Contact entreprise', done: Boolean(cargoRequest.sender_contact_tier_contact_id) },
                  { label: 'Destinataire', done: Boolean(cargoRequest.receiver_name?.trim()) },
                  { label: 'Installation de destination', done: Boolean(cargoRequest.destination_asset_id) },
                  { label: 'Imputation', done: Boolean(cargoRequest.imputation_reference_id) },
                  { label: 'Demandeur', done: Boolean(cargoRequest.requester_user_id || cargoRequest.requester_name?.trim()) },
                  { label: 'Au moins un colis rattaché', done: requestCargo.length > 0 },
                ].map((item) => (
                  <div key={item.label} className="flex items-center gap-2 text-xs">
                    <span className={cn('inline-flex h-4 w-4 items-center justify-center rounded-full text-[10px]', item.done ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700')}>
                      {item.done ? '✓' : '•'}
                    </span>
                    <span className={item.done ? 'text-foreground' : 'text-muted-foreground'}>{item.label}</span>
                  </div>
                ))}
              </div>
            </FormSection>

            <FormSection title="Demande d’expédition">
              <DetailRow label="Code" value={cargoRequest.request_code} />
              <DetailRow label="Intitulé" value={cargoRequest.title} />
              <DetailRow label="Statut" value={requestStatusLabels[cargoRequest.status] ?? cargoRequest.status} />
              <DetailRow label="Description" value={cargoRequest.description ?? '—'} />
              <DetailRow label="Entreprise expéditrice" value={cargoRequest.sender_name ?? '—'} />
              <DetailRow label="Contact entreprise" value={cargoRequest.sender_contact_name ?? '—'} />
              <DetailRow label="Destinataire" value={cargoRequest.receiver_name ?? '—'} />
              <DetailRow label="Destination" value={cargoRequest.destination_name ?? '—'} />
              <DetailRow label="Imputation" value={cargoRequest.imputation_reference_name ? `${cargoRequest.imputation_reference_code ?? ''} ${cargoRequest.imputation_reference_name}`.trim() : '—'} />
              <DetailRow label="Demandeur" value={cargoRequest.requester_display_name ?? cargoRequest.requester_name ?? '—'} />
              <DetailRow label="Nombre de colis" value={String(cargoRequest.cargo_count ?? 0)} />
              <DetailRow label="Créée le" value={new Date(cargoRequest.created_at).toLocaleString('fr-FR')} />
            </FormSection>

            <FormSection title="Complétude de la demande" collapsible defaultExpanded>
              <div className="space-y-3">
                <div className={`rounded-lg border px-3 py-2 text-xs ${cargoRequest.is_ready_for_submission ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>
                  {cargoRequest.is_ready_for_submission
                    ? 'La demande est prête pour soumission.'
                    : 'La demande n’est pas encore prête pour soumission.'}
                </div>
                {missingRequirements.length > 0 ? (
                  <div className="space-y-1">
                    {missingRequirements.map((item) => (
                      <div key={item} className="rounded-lg border border-border/60 bg-card px-3 py-2 text-xs text-muted-foreground">
                        {{
                          title: 'Intitulé de la demande',
                          description: 'Description de la demande',
                          sender_tier_id: 'Expéditeur',
                          receiver_name: 'Destinataire',
                          destination_asset_id: 'Installation de destination',
                          imputation_reference_id: 'Imputation',
                          requester: 'Demandeur',
                          cargo_items: 'Au moins un colis rattaché',
                        }[item] ?? item}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">Aucun manque bloquant détecté.</p>
                )}
              </div>
            </FormSection>

            <FormSection title={`Colis rattachés (${requestCargo.length})`} collapsible defaultExpanded>
              {requestCargo.length > 0 ? (
                <div className="space-y-2">
                  {requestCargo.map((cargo) => (
                    <button
                      key={cargo.id}
                      onClick={() => useUIStore.getState().openDynamicPanel({ type: 'detail', module: panelModule, id: cargo.id, meta: { subtype: 'cargo' } })}
                      className="w-full rounded-lg border border-border/60 bg-card px-3 py-2 text-left hover:bg-muted/40"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-xs font-mono text-muted-foreground">{cargo.code}</p>
                          <p className="text-sm font-medium text-foreground truncate">{cargo.designation || cargo.description}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-muted-foreground">{cargo.weight_kg.toLocaleString('fr-FR')} kg</p>
                          <p className="text-[11px] text-muted-foreground">{cargo.status}</p>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-xs text-muted-foreground">Aucun colis rattaché à cette demande.</p>
                  <PanelActionButton
                    variant="primary"
                    onClick={() => useUIStore.getState().openDynamicPanel({
                      type: 'create',
                      module: panelModule,
                      meta: { subtype: 'cargo', requestId: id, requestTitle: cargoRequest.title, requestCode: cargoRequest.request_code },
                    })}
                    icon={<Plus size={12} />}
                  >
                    Ajouter le premier colis
                  </PanelActionButton>
                </div>
              )}
            </FormSection>

            <FormSection title="Propositions de chargement" collapsible defaultExpanded>
              {(loadingOptions ?? []).length > 0 ? (
                <div className="space-y-2">
                  {loadingOptions!.map((option) => (
                    <div key={option.voyage_id} className="rounded-lg border border-border/60 bg-card px-3 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground">{option.voyage_code}</p>
                          <p className="text-xs text-muted-foreground">
                            {option.vector_name ?? 'Vecteur'} · départ {new Date(option.scheduled_departure).toLocaleString('fr-FR')}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Base: {option.departure_base_name ?? '—'} · reste {option.remaining_weight_kg != null ? `${option.remaining_weight_kg.toLocaleString('fr-FR')} kg` : 'poids non borné'}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Demande: {option.total_request_weight_kg.toLocaleString('fr-FR')} kg · destination {option.destination_match ? 'compatible' : 'non compatible'}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Surface estimée: {option.total_request_surface_m2.toLocaleString('fr-FR')} m² · {option.all_items_stackable ? 'empilable' : 'non empilable'}
                          </p>
                          {option.compatible_zones.length > 0 && (
                            <div className="mt-1 flex flex-wrap gap-1">
                              {option.compatible_zones.map((zone) => (
                                <span key={zone.zone_id} className="gl-badge gl-badge-neutral">
                                  {zone.zone_name}
                                  {zone.surface_m2 != null ? ` · ${zone.surface_m2.toLocaleString('fr-FR')} m²` : ''}
                                </span>
                              ))}
                            </div>
                          )}
                          {option.blocking_reasons.length > 0 && (
                            <p className="mt-1 text-xs text-amber-700">
                              Blocages: {option.blocking_reasons.map((item) => ({
                                destination_mismatch: 'destination non desservie',
                                manifest_not_draft: 'manifeste non draft',
                                insufficient_weight_capacity: 'capacité poids insuffisante',
                                no_zone_capacity_match: 'aucune zone compatible',
                              }[item] ?? item)).join(', ')}
                            </p>
                          )}
                        </div>
                        <div className="flex flex-col items-end gap-2">
                          <span className={cn('gl-badge', option.can_load ? 'gl-badge-success' : 'gl-badge-warning')}>
                            {option.can_load ? 'Chargeable' : 'Bloqué'}
                          </span>
                          <PanelActionButton
                            variant="primary"
                            onClick={() => handleApplyLoadingOption(option.voyage_id)}
                            disabled={!option.can_load || applyLoadingOption.isPending || cargoRequest.status !== 'approved'}
                          >
                            {applyLoadingOption.isPending ? <Loader2 size={12} className="animate-spin" /> : 'Affecter'}
                          </PanelActionButton>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">Aucune proposition de chargement disponible pour le moment.</p>
              )}
            </FormSection>
          </>
        )}
      </PanelContentLayout>
    </DynamicPanelShell>
  )
}

// ══════════════════════════════════════════════════════════════
// ── DETAIL PANELS ────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════

// ── Trip Detail Panel (enhanced with voyage events, KPIs, workflow) ──

function VoyageDetailPanel({ id }: { id: string }) {
  const closeDynamicPanel = useUIStore((s) => s.closeDynamicPanel)
  const { data: voyage, isLoading } = useVoyage(id)
  const { data: vectors } = useVectors({ page: 1, page_size: 100 })
  const { data: rotations } = useRotations({ page: 1, page_size: 100 })
  const updateVoyage = useUpdateVoyage()
  const deleteVoyage = useDeleteVoyage()
  const updateStatus = useUpdateVoyageStatus()
  const downloadPaxManifestPdf = useVoyagePaxManifestPdf()
  const downloadCargoManifestPdf = useVoyageCargoManifestPdf()
  const { hasPermission } = usePermission()
  const canUpdate = hasPermission('travelwiz.voyage.update')
  const canDelete = hasPermission('travelwiz.voyage.delete')
  const closeTrip = useCloseTrip()
  const { data: stops } = useVoyageStops(id)
  const { data: manifests } = useVoyageManifests(id)
  const { data: capacity } = useVoyageCapacity(id)
  const { data: events } = useVoyageEvents(id)
  const { data: kpis } = useTripKpis(id)
  const { data: cargoOperationsReport } = useVoyageCargoOperationsReport(id)
  const voyageStatusLabels = useDictionaryLabels('travelwiz_voyage_status', VOYAGE_STATUS_LABELS_FALLBACK)
  const manifestStatusLabels = useDictionaryLabels('travelwiz_manifest_status', MANIFEST_STATUS_LABELS_FALLBACK)
  const cargoStatusLabels = useDictionaryLabels('travelwiz_cargo_status', CARGO_STATUS_LABELS_FALLBACK)
  const cargoWorkflowLabels = useDictionaryLabels('travelwiz_cargo_workflow_status')
  const packageReturnStatusLabels = useDictionaryLabels('travelwiz_package_return_status')
  const voyageStatusOptions = useMemo(
    () => buildStatusOptions(voyageStatusLabels, ['planned', 'confirmed', 'boarding', 'departed', 'arrived', 'closed', 'cancelled', 'delayed']).filter((option) => option.value),
    [voyageStatusLabels],
  )
  const { toast } = useToast()
  const [editing, setEditing] = useState(false)
  const [cargoReportExportOpen, setCargoReportExportOpen] = useState(false)
  const [editForm, setEditForm] = useState<VoyageUpdate>({})

  const startEdit = useCallback(() => {
    if (!voyage) return
    setEditForm({
      vector_id: voyage.vector_id,
      departure_base_id: voyage.departure_base_id,
      rotation_id: voyage.rotation_id,
      scheduled_departure: voyage.scheduled_departure,
      scheduled_arrival: voyage.scheduled_arrival,
    })
    setEditing(true)
  }, [voyage])

  const handleSave = async () => {
    try { await updateVoyage.mutateAsync({ id, payload: editForm }); toast({ title: 'Voyage mis a jour', variant: 'success' }); setEditing(false) }
    catch { toast({ title: 'Erreur lors de la mise a jour', variant: 'error' }) }
  }

  const handleDelete = async () => {
    try { await deleteVoyage.mutateAsync(id); toast({ title: 'Voyage supprime', variant: 'success' }); closeDynamicPanel() }
    catch { toast({ title: 'Erreur lors de la suppression', variant: 'error' }) }
  }

  const handleClose = async () => {
    try { await closeTrip.mutateAsync(id); toast({ title: 'Voyage cloture', variant: 'success' }) }
    catch { toast({ title: 'Erreur lors de la cloture', variant: 'error' }) }
  }

  const handlePrintPaxManifest = async () => {
    try {
      await downloadPaxManifestPdf.mutateAsync(id)
    } catch {
      toast({ title: 'Impossible d imprimer le manifeste PAX', description: 'Verifiez le modele PDF voyage.manifest.', variant: 'error' })
    }
  }

  const handlePrintCargoManifest = async () => {
    try {
      await downloadCargoManifestPdf.mutateAsync(id)
    } catch {
      toast({ title: 'Impossible d imprimer le manifeste cargo', description: 'Verifiez le modele PDF voyage.cargo_manifest.', variant: 'error' })
    }
  }

  if (isLoading || !voyage) {
    return (
      <DynamicPanelShell title="Chargement..." icon={<Plane size={14} className="text-primary" />}>
        <div className="flex items-center justify-center py-16"><Loader2 size={16} className="animate-spin text-muted-foreground" /></div>
      </DynamicPanelShell>
    )
  }

  const departureLabel = voyage.departure_base_name ?? voyage.origin ?? '?'
  const destinationLabel = stops?.length ? stops[stops.length - 1]?.location ?? '—' : voyage.destination ?? '—'

  // PAX summary from manifests
  const paxSummary = useMemo(() => {
    if (!manifests) return { confirmed: 0, standby: 0, noShow: 0 }
    return { confirmed: voyage.pax_count ?? 0, standby: 0, noShow: 0 }
  }, [manifests, voyage])

  // Cargo summary
  const cargoWeight = capacity?.current_cargo_kg ?? 0
  const hasHazmat = false // from cargo items if available
  const cargoReportExportRows = useMemo(() => (
    cargoOperationsReport?.items.map((item) => ({
      tracking_code: item.tracking_code,
      request_code: item.request_code ?? '',
      designation: item.designation ?? item.description,
      cargo_status: cargoStatusLabels[item.status] ?? item.status,
      workflow_status: cargoWorkflowLabels[item.workflow_status] ?? item.workflow_status,
      destination_name: item.destination_name ?? '',
      weight_kg: item.weight_kg,
      total_sent_units: item.total_sent_units,
      total_returned_units: item.total_returned_units,
      return_coverage_pct: Math.round((item.return_coverage_ratio ?? 0) * 100),
      aggregate_return_status: getAggregateReturnStatusLabel(item.aggregate_return_status),
      aggregate_disposition: packageReturnStatusLabels[item.aggregate_disposition] ?? item.aggregate_disposition,
      damage_notes: item.damage_notes ?? '',
      received_at: item.received_at ?? '',
    })) ?? []
  ), [cargoOperationsReport?.items, cargoStatusLabels, cargoWorkflowLabels, packageReturnStatusLabels])

  return (
    <DynamicPanelShell
      title={voyage.code}
      subtitle={`${departureLabel} → ${destinationLabel}`}
      icon={<Plane size={14} className="text-primary" />}
      actions={<>
        {!editing && canUpdate && <PanelActionButton onClick={startEdit} icon={<Pencil size={12} />}>Modifier</PanelActionButton>}
        {editing && <>
          <PanelActionButton onClick={() => setEditing(false)}>Annuler</PanelActionButton>
          <PanelActionButton variant="primary" onClick={handleSave} disabled={updateVoyage.isPending} icon={<Save size={12} />}>
            {updateVoyage.isPending ? <Loader2 size={12} className="animate-spin" /> : 'Enregistrer'}
          </PanelActionButton>
        </>}
        {!editing && <PanelActionButton onClick={handlePrintPaxManifest} disabled={downloadPaxManifestPdf.isPending} icon={<FileText size={12} />}>Manifeste PAX</PanelActionButton>}
        {!editing && <PanelActionButton onClick={handlePrintCargoManifest} disabled={downloadCargoManifestPdf.isPending} icon={<FileText size={12} />}>Manifeste cargo</PanelActionButton>}
        {!editing && canUpdate && voyage.status !== 'cancelled' && voyage.status !== 'closed' && (
          <select className="text-xs border border-border rounded px-1.5 py-0.5 bg-background text-foreground h-7" value=""
            onChange={(e) => { if (e.target.value) updateStatus.mutate({ id, status: e.target.value }) }}>
            <option value="">Statut...</option>
            {voyageStatusOptions.filter((option) => option.value !== voyage.status).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        )}
        {!editing && canUpdate && (voyage.status as string) === 'arrived' && (
          <PanelActionButton onClick={handleClose} disabled={closeTrip.isPending} icon={<CheckCircle2 size={12} />}>
            Cloturer
          </PanelActionButton>
        )}
        {!editing && canDelete && <DangerConfirmButton onConfirm={handleDelete} icon={<Trash2 size={12} />}>Supprimer</DangerConfirmButton>}
      </>}
    >
      <PanelContentLayout>
        {/* Status badge */}
        <div className="flex items-center gap-2 flex-wrap">
          <StatusBadge status={voyage.status} labels={voyageStatusLabels} badges={VOYAGE_STATUS_BADGES} />
        </div>

        {editing ? (
          <FormSection title="Informations">
            <FormGrid>
              <DynamicPanelField label="Code">
                <span className="text-sm font-mono font-medium text-foreground">{voyage.code}</span>
              </DynamicPanelField>
              <DynamicPanelField label="Vecteur" required>
                <select
                  value={editForm.vector_id ?? ''}
                  onChange={(e) => setEditForm({ ...editForm, vector_id: e.target.value || null })}
                  className={panelInputClass}
                >
                  <option value="">Sélectionner...</option>
                  {(vectors?.items ?? []).map((vector) => (
                    <option key={vector.id} value={vector.id}>
                      {vector.name} {vector.registration ? `(${vector.registration})` : ''}
                    </option>
                  ))}
                </select>
              </DynamicPanelField>
              <DynamicPanelField label="Rotation">
                <select
                  value={editForm.rotation_id ?? ''}
                  onChange={(e) => setEditForm({ ...editForm, rotation_id: e.target.value || null })}
                  className={panelInputClass}
                >
                  <option value="">Aucune rotation</option>
                  {(rotations?.items ?? []).map((rotation) => (
                    <option key={rotation.id} value={rotation.id}>
                      {rotation.name}{rotation.schedule_description ? ` - ${rotation.schedule_description}` : ''}
                    </option>
                  ))}
                </select>
              </DynamicPanelField>
              <DynamicPanelField label="Base de départ" span="full">
                <AssetPicker
                  value={editForm.departure_base_id ?? null}
                  onChange={(assetId) => setEditForm({ ...editForm, departure_base_id: assetId ?? null })}
                  placeholder="Sélectionner la base de départ..."
                />
              </DynamicPanelField>
              <DynamicPanelField label="Départ programmé">
                <input
                  type="datetime-local"
                  value={editForm.scheduled_departure ?? ''}
                  onChange={(e) => setEditForm({ ...editForm, scheduled_departure: e.target.value || null })}
                  className={panelInputClass}
                />
              </DynamicPanelField>
              <DynamicPanelField label="Arrivée programmée">
                <input
                  type="datetime-local"
                  value={editForm.scheduled_arrival ?? ''}
                  onChange={(e) => setEditForm({ ...editForm, scheduled_arrival: e.target.value || null })}
                  className={panelInputClass}
                />
              </DynamicPanelField>
            </FormGrid>
          </FormSection>
        ) : (
          <>
            <SectionColumns>
              <div className="@container space-y-5">
                {/* Info */}
                <FormSection title="Informations">
                  <DetailRow label="Code" value={voyage.code} />
                  <DetailRow label="Vecteur" value={voyage.vector_name ?? '—'} />
                  <DetailRow label="Rotation" value={voyage.rotation_name ?? '—'} />
                  <DetailRow label="Base de départ" value={departureLabel} />
                  <DetailRow label="Dernière escale planifiée" value={destinationLabel} />
                  <DetailRow label="Départ programmé" value={voyage.scheduled_departure ? new Date(voyage.scheduled_departure).toLocaleString('fr-FR') : '—'} />
                  <DetailRow label="Arrivée programmée" value={voyage.scheduled_arrival ? new Date(voyage.scheduled_arrival).toLocaleString('fr-FR') : '—'} />
                  <DetailRow label="Départ réel" value={voyage.actual_departure ? new Date(voyage.actual_departure).toLocaleString('fr-FR') : '—'} />
                  <DetailRow label="Arrivée réelle" value={voyage.actual_arrival ? new Date(voyage.actual_arrival).toLocaleString('fr-FR') : '—'} />
                  <DetailRow label="Motif du retard" value={voyage.delay_reason ?? '—'} />
                </FormSection>

            {/* Route: Stops */}
            <FormSection title={`Route (${(stops?.length ?? 0) + 2} points)`} collapsible defaultExpanded>
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 p-1.5 rounded bg-primary/5 border border-primary/10">
                  <div className="w-5 h-5 rounded-full bg-primary/20 text-primary text-[10px] font-bold flex items-center justify-center shrink-0">O</div>
                  <span className="text-xs font-medium text-foreground">{departureLabel}</span>
                  <span className="text-[10px] text-muted-foreground ml-auto">{formatDateTime(voyage.scheduled_departure)}</span>
                </div>
                {stops?.map((stop, idx) => (
                  <div key={stop.id} className="flex items-center gap-2 p-1.5 rounded border border-border/60">
                    <div className="w-5 h-5 rounded-full bg-muted text-muted-foreground text-[10px] font-bold flex items-center justify-center shrink-0">{idx + 1}</div>
                    <span className="text-xs text-foreground">{stop.location}</span>
                    <span className="text-[10px] text-muted-foreground ml-auto">{formatDateTime(stop.arrival_at)}</span>
                  </div>
                ))}
                <div className="flex items-center gap-2 p-1.5 rounded bg-green-500/5 border border-green-500/10">
                  <div className="w-5 h-5 rounded-full bg-green-500/20 text-green-600 text-[10px] font-bold flex items-center justify-center shrink-0">D</div>
                  <span className="text-xs font-medium text-foreground">{destinationLabel}</span>
                  <span className="text-[10px] text-muted-foreground ml-auto">{formatDateTime(voyage.scheduled_arrival)}</span>
                </div>
              </div>
            </FormSection>
              </div>

              <div className="@container space-y-5">
            {/* PAX manifest summary */}
            <FormSection title={`Manifestes PAX (${manifests?.length ?? 0})`} collapsible defaultExpanded>
              <div className="grid grid-cols-3 gap-2 mb-2">
                <div className="text-center p-2 rounded bg-muted/50">
                  <p className="text-sm font-semibold tabular-nums">{paxSummary.confirmed}</p>
                  <p className="text-[10px] text-muted-foreground">Confirmes</p>
                </div>
                <div className="text-center p-2 rounded bg-muted/50">
                  <p className="text-sm font-semibold tabular-nums">{paxSummary.standby}</p>
                  <p className="text-[10px] text-muted-foreground">Standby</p>
                </div>
                <div className="text-center p-2 rounded bg-muted/50">
                  <p className="text-sm font-semibold tabular-nums">{paxSummary.noShow}</p>
                  <p className="text-[10px] text-muted-foreground">No-show</p>
                </div>
              </div>
              {manifests && manifests.length > 0 ? (
                <div className="space-y-1.5">
                  {manifests.map((m) => (
                    <div key={m.id} className="flex items-center gap-3 p-2 rounded-lg border border-border/60 bg-card">
                      <FileText size={14} className="text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-foreground truncate">{m.reference || m.manifest_type || 'Manifeste'}</p>
                        <p className="text-xs text-muted-foreground">{m.passenger_count ?? 0} passagers</p>
                      </div>
                      <StatusBadge status={m.status} labels={manifestStatusLabels} badges={MANIFEST_STATUS_BADGES} />
                    </div>
                  ))}
                </div>
              ) : <p className="text-xs text-muted-foreground py-2">Aucun manifeste.</p>}
            </FormSection>

            {/* Cargo summary */}
            <FormSection title="Cargo" collapsible defaultExpanded>
              <div className="grid grid-cols-2 gap-2">
                <div className="text-center p-2 rounded bg-muted/50">
                  <p className="text-sm font-semibold tabular-nums">{cargoWeight.toLocaleString('fr-FR')} kg</p>
                  <p className="text-[10px] text-muted-foreground">Poids total</p>
                </div>
                <div className="text-center p-2 rounded bg-muted/50">
                  <p className="text-sm font-semibold tabular-nums">{hasHazmat ? 'Oui' : 'Non'}</p>
                  <p className="text-[10px] text-muted-foreground">HAZMAT</p>
                </div>
              </div>
            </FormSection>

            <VoyageCargoOperationsSection
              report={cargoOperationsReport}
              cargoStatusLabels={cargoStatusLabels}
              packageReturnStatusLabels={packageReturnStatusLabels}
              onOpenExport={() => setCargoReportExportOpen(true)}
            />

            {/* Capacity */}
            {capacity && (
              <FormSection title="Capacite" collapsible defaultExpanded>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg border border-border p-3">
                    <div className="flex items-center gap-1.5 text-muted-foreground mb-1"><Users size={12} /><span className="text-[10px] font-medium uppercase tracking-wide">PAX</span></div>
                    <p className="text-sm font-semibold tabular-nums">{capacity.current_pax} / {capacity.vector_capacity_pax ?? '∞'}</p>
                    {capacity.pax_utilization_pct !== null && (
                      <div className="mt-1.5 h-1.5 rounded-full bg-border overflow-hidden">
                        <div className={cn('h-full rounded-full transition-all', capacity.pax_utilization_pct > 90 ? 'bg-destructive' : 'bg-primary')} style={{ width: `${Math.min(100, capacity.pax_utilization_pct)}%` }} />
                      </div>
                    )}
                  </div>
                  <div className="rounded-lg border border-border p-3">
                    <div className="flex items-center gap-1.5 text-muted-foreground mb-1"><Weight size={12} /><span className="text-[10px] font-medium uppercase tracking-wide">Cargo (kg)</span></div>
                    <p className="text-sm font-semibold tabular-nums">{capacity.current_cargo_kg.toLocaleString('fr-FR')} / {capacity.vector_capacity_cargo_kg?.toLocaleString('fr-FR') ?? '∞'}</p>
                    {capacity.cargo_utilization_pct !== null && (
                      <div className="mt-1.5 h-1.5 rounded-full bg-border overflow-hidden">
                        <div className={cn('h-full rounded-full transition-all', capacity.cargo_utilization_pct > 90 ? 'bg-destructive' : 'bg-primary')} style={{ width: `${Math.min(100, capacity.cargo_utilization_pct)}%` }} />
                      </div>
                    )}
                  </div>
                </div>
              </FormSection>
            )}

            {/* Voyage Events Timeline */}
            <FormSection title={`Journal de bord (${events?.length ?? 0})`} collapsible defaultExpanded>
              {events && events.length > 0 ? (
                <div className="relative pl-4 border-l-2 border-border space-y-3">
                  {events.map((evt) => (
                    <div key={evt.id} className="relative">
                      <div className="absolute -left-[21px] top-1 w-3 h-3 rounded-full bg-primary border-2 border-background" />
                      <div className="ml-2">
                        <p className="text-xs font-medium text-foreground">{evt.event_code.replace(/_/g, ' ')}</p>
                        <p className="text-[10px] text-muted-foreground">{formatDateTime(evt.recorded_at)}{evt.recorded_by_name ? ` • ${evt.recorded_by_name}` : ''}</p>
                        {evt.notes && <p className="text-xs text-muted-foreground mt-0.5">{evt.notes}</p>}
                        {(evt.latitude || evt.longitude) && (
                          <p className="text-[10px] text-muted-foreground mt-0.5 inline-flex items-center gap-1"><MapPin size={9} />{evt.latitude?.toFixed(4)}, {evt.longitude?.toFixed(4)}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : <p className="text-xs text-muted-foreground py-2">Aucun evenement enregistre.</p>}
            </FormSection>

            {/* KPIs (if trip completed) */}
            {kpis && (
              <FormSection title="KPIs du voyage" collapsible defaultExpanded>
                <div className="grid grid-cols-2 gap-2">
                  <DetailRow label="PAX total" value={kpis.total_pax} />
                  <DetailRow label="Cargo total" value={`${kpis.total_cargo_kg.toLocaleString('fr-FR')} kg`} />
                  <DetailRow label="No-shows" value={kpis.no_shows} />
                  <DetailRow label="A l'heure" value={kpis.on_time ? 'Oui' : `Non (${kpis.delay_minutes ?? 0} min)`} />
                  <DetailRow label="Evenements" value={kpis.events_count} />
                  <DetailRow label="Articles HAZMAT" value={kpis.hazmat_items} />
                </div>
              </FormSection>
            )}
              </div>
            </SectionColumns>

            {/* Tags, Notes & Attachments */}
            <FormSection title="Tags, notes & fichiers" collapsible defaultExpanded={false}>
              <div className="space-y-3">
                <TagManager ownerType="voyage" ownerId={voyage.id} compact />
                <AttachmentManager ownerType="voyage" ownerId={voyage.id} compact />
                <NoteManager ownerType="voyage" ownerId={voyage.id} compact />
              </div>
            </FormSection>
          </>
        )}
      </PanelContentLayout>
      <ExportWizard
        open={cargoReportExportOpen}
        onClose={() => setCargoReportExportOpen(false)}
        data={cargoReportExportRows}
        columns={[
          { id: 'tracking_code', header: 'Tracking' },
          { id: 'request_code', header: 'Demande' },
          { id: 'designation', header: 'Colis' },
          { id: 'cargo_status', header: 'Statut cargo' },
          { id: 'workflow_status', header: 'Workflow dossier' },
          { id: 'destination_name', header: 'Destination' },
          { id: 'weight_kg', header: 'Poids (kg)' },
          { id: 'total_sent_units', header: 'Qté expédiée' },
          { id: 'total_returned_units', header: 'Qté retournée' },
          { id: 'return_coverage_pct', header: 'Couverture retour (%)' },
          { id: 'aggregate_return_status', header: 'État retour' },
          { id: 'aggregate_disposition', header: 'Disposition base' },
          { id: 'damage_notes', header: 'Avaries' },
          { id: 'received_at', header: 'Réception' },
        ]}
        filenamePrefix={`travelwiz-cargo-report-${voyage.code.toLowerCase()}`}
      />
    </DynamicPanelShell>
  )
}

// ── Vector Detail Panel ──

function VectorDetailPanel({ id }: { id: string }) {
  const closeDynamicPanel = useUIStore((s) => s.closeDynamicPanel)
  const { data: vector, isLoading } = useVector(id)
  const updateVector = useUpdateVector()
  const deleteVector = useDeleteVector()
  const { data: zones } = useVectorZones(id)
  const { toast } = useToast()
  const { hasPermission } = usePermission()
  const canUpdate = hasPermission('travelwiz.voyage.update')
  const canDelete = hasPermission('travelwiz.voyage.delete')
  const [editing, setEditing] = useState(false)
  const [editForm, setEditForm] = useState<TravelVectorUpdate>({})

  const startEdit = useCallback(() => {
    if (!vector) return
    setEditForm({
      registration: vector.registration, name: vector.name, type: vector.type, mode: vector.mode,
      pax_capacity: vector.pax_capacity, weight_capacity_kg: vector.weight_capacity_kg,
      volume_capacity_m3: vector.volume_capacity_m3, home_base_id: vector.home_base_id,
      requires_weighing: vector.requires_weighing, mmsi_number: vector.mmsi_number, active: vector.active,
    })
    setEditing(true)
  }, [vector])

  const handleEditTypeChange = (type: string) => {
    const mode = deriveModeFromType(type)
    setEditForm((prev) => ({
      ...prev,
      type,
      mode,
      mmsi_number: mode === 'sea' ? prev.mmsi_number : null,
    }))
  }

  const handleSave = async () => {
    try { await updateVector.mutateAsync({ id, payload: editForm }); toast({ title: 'Vecteur mis a jour', variant: 'success' }); setEditing(false) }
    catch { toast({ title: 'Erreur lors de la mise a jour', variant: 'error' }) }
  }

  const handleDelete = async () => {
    try { await deleteVector.mutateAsync(id); toast({ title: 'Vecteur supprime', variant: 'success' }); closeDynamicPanel() }
    catch { toast({ title: 'Erreur lors de la suppression', variant: 'error' }) }
  }

  if (isLoading || !vector) {
    return (
      <DynamicPanelShell title="Chargement..." icon={<Ship size={14} className="text-primary" />}>
        <div className="flex items-center justify-center py-16"><Loader2 size={16} className="animate-spin text-muted-foreground" /></div>
      </DynamicPanelShell>
    )
  }

  const typeEntry = VECTOR_TYPE_MAP[vector.type]
  const modeLabels: Record<string, string> = { air: 'Aerien', sea: 'Maritime', road: 'Routier' }

  return (
    <DynamicPanelShell title={vector.name} subtitle={vector.registration} icon={<Ship size={14} className="text-primary" />}
      actions={<>
        {!editing && canUpdate && <PanelActionButton onClick={startEdit} icon={<Pencil size={12} />}>Modifier</PanelActionButton>}
        {editing && <>
          <PanelActionButton onClick={() => setEditing(false)}>Annuler</PanelActionButton>
          <PanelActionButton variant="primary" onClick={handleSave} disabled={updateVector.isPending} icon={<Save size={12} />}>
            {updateVector.isPending ? <Loader2 size={12} className="animate-spin" /> : 'Enregistrer'}
          </PanelActionButton>
        </>}
        {!editing && canDelete && <DangerConfirmButton onConfirm={handleDelete} icon={<Trash2 size={12} />}>Supprimer</DangerConfirmButton>}
      </>}
    >
      <PanelContentLayout>
        {editing ? (
          <>
            <FormSection title="Identification">
              <FormGrid>
                <DynamicPanelField label="Immatriculation"><input type="text" value={editForm.registration ?? ''} onChange={(e) => setEditForm({ ...editForm, registration: e.target.value })} className={panelInputClass} /></DynamicPanelField>
                <DynamicPanelField label="Nom"><input type="text" value={editForm.name ?? ''} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} className={panelInputClass} /></DynamicPanelField>
                <DynamicPanelField label="Type">
                  <select value={editForm.type ?? ''} onChange={(e) => handleEditTypeChange(e.target.value)} className={panelInputClass}>
                    {Object.entries(VECTOR_TYPE_MAP).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </DynamicPanelField>
                <DynamicPanelField label="Mode">
                  <select value={editForm.mode ?? ''} onChange={(e) => setEditForm({ ...editForm, mode: e.target.value })} className={panelInputClass}>
                    <option value="air">Aerien</option>
                    <option value="sea">Maritime</option>
                    <option value="road">Routier</option>
                  </select>
                </DynamicPanelField>
                <DynamicPanelField label="Base d'attache" span="full">
                  <AssetPicker
                    value={editForm.home_base_id}
                    onChange={(assetId) => setEditForm({ ...editForm, home_base_id: assetId })}
                    placeholder="Selectionner une base..."
                    clearable
                  />
                </DynamicPanelField>
              </FormGrid>
            </FormSection>
            <FormSection title="Capacites">
              <FormGrid>
                <DynamicPanelField label="Capacite PAX"><input type="number" min={0} value={editForm.pax_capacity ?? ''} onChange={(e) => setEditForm({ ...editForm, pax_capacity: e.target.value ? Number(e.target.value) : null })} className={panelInputClass} /></DynamicPanelField>
                <DynamicPanelField label="Capacite poids (kg)"><input type="number" min={0} step="any" value={editForm.weight_capacity_kg ?? ''} onChange={(e) => setEditForm({ ...editForm, weight_capacity_kg: e.target.value ? Number(e.target.value) : null })} className={panelInputClass} /></DynamicPanelField>
                <DynamicPanelField label="Volume (m3)"><input type="number" min={0} step="any" value={editForm.volume_capacity_m3 ?? ''} onChange={(e) => setEditForm({ ...editForm, volume_capacity_m3: e.target.value ? Number(e.target.value) : null })} className={panelInputClass} /></DynamicPanelField>
              </FormGrid>
            </FormSection>
            <FormSection title="Operationnel" collapsible defaultExpanded={false}>
              <FormGrid>
                <DynamicPanelField label="Pesee requise">
                  <label className="inline-flex items-center gap-2 text-xs">
                    <input type="checkbox" checked={editForm.requires_weighing ?? false} onChange={(e) => setEditForm({ ...editForm, requires_weighing: e.target.checked })} />
                    Activer la pesee obligatoire
                  </label>
                </DynamicPanelField>
                {(editForm.mode === 'sea') && (
                  <DynamicPanelField label="Numero MMSI"><input type="text" value={editForm.mmsi_number ?? ''} onChange={(e) => setEditForm({ ...editForm, mmsi_number: e.target.value || null })} className={panelInputClass} placeholder="123456789" /></DynamicPanelField>
                )}
                <DynamicPanelField label="Actif">
                  <label className="inline-flex items-center gap-2 text-xs">
                    <input type="checkbox" checked={editForm.active ?? true} onChange={(e) => setEditForm({ ...editForm, active: e.target.checked })} />
                    Vecteur actif
                  </label>
                </DynamicPanelField>
              </FormGrid>
            </FormSection>
          </>
        ) : (
          <>
            <FormSection title="Identification">
              <DetailRow label="Immatriculation" value={<span className="font-mono">{vector.registration}</span>} />
              <DetailRow label="Nom" value={vector.name} />
              <DetailRow label="Type" value={<span className={cn('gl-badge inline-flex items-center gap-1', typeEntry?.badge || 'gl-badge-neutral')}>{typeEntry?.label || vector.type}</span>} />
              <DetailRow label="Mode" value={modeLabels[vector.mode] || vector.mode} />
              <DetailRow label="Base d'attache" value={vector.home_base_name ?? '—'} />
              <DetailRow label="Actif" value={vector.active ? 'Oui' : 'Non'} />
            </FormSection>

            <FormSection title="Capacites">
              <DetailRow label="Capacite PAX" value={vector.pax_capacity} />
              <DetailRow label="Capacite poids" value={vector.weight_capacity_kg ? `${vector.weight_capacity_kg.toLocaleString('fr-FR')} kg` : '—'} />
              <DetailRow label="Volume" value={vector.volume_capacity_m3 ? `${vector.volume_capacity_m3.toLocaleString('fr-FR')} m³` : '—'} />
            </FormSection>

            <FormSection title="Operationnel" collapsible defaultExpanded={false}>
              <DetailRow label="Pesee requise" value={vector.requires_weighing ? 'Oui' : 'Non'} />
              {vector.mode === 'sea' && <DetailRow label="Numero MMSI" value={vector.mmsi_number ?? '—'} />}
            </FormSection>

            {/* Deck surfaces / Zones */}
            <FormSection title={`Zones / Surfaces pont (${zones?.length ?? 0})`} collapsible defaultExpanded>
              {zones && zones.length > 0 ? (
                <div className="space-y-2">
                  {zones.map((zone) => (
                    <div key={zone.id} className="flex items-center gap-3 p-2 rounded-lg border border-border/60 bg-card">
                      <MapPin size={14} className="text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{zone.name}</p>
                        <p className="text-xs text-muted-foreground">{zone.zone_type}{zone.capacity ? ` • Capacite: ${zone.capacity}` : ''}</p>
                      </div>
                      <span className={cn('gl-badge', zone.active ? 'gl-badge-success' : 'gl-badge-neutral')}>{zone.active ? 'Actif' : 'Inactif'}</span>
                    </div>
                  ))}
                </div>
              ) : <p className="text-xs text-muted-foreground py-2">Aucune zone configuree.</p>}
            </FormSection>
          </>
        )}
      </PanelContentLayout>
    </DynamicPanelShell>
  )
}

function RotationDetailPanel({ id }: { id: string }) {
  const closeDynamicPanel = useUIStore((s) => s.closeDynamicPanel)
  const { data: rotationsData, isLoading } = useRotations({ page: 1, page_size: 100 })
  const { data: vectorsData } = useVectors({ page: 1, page_size: 100 })
  const updateRotation = useUpdateRotation()
  const { toast } = useToast()
  const [editing, setEditing] = useState(false)
  const [editForm, setEditForm] = useState<RotationUpdate>({})

  const rotation = useMemo(
    () => (rotationsData?.items ?? []).find((item) => item.id === id),
    [rotationsData?.items, id],
  )

  const startEdit = useCallback(() => {
    if (!rotation) return
    setEditForm({
      name: rotation.name,
      vector_id: rotation.vector_id,
      departure_base_id: rotation.departure_base_id,
      schedule_cron: rotation.schedule_cron,
      schedule_description: rotation.schedule_description,
      active: rotation.active,
    })
    setEditing(true)
  }, [rotation])

  const handleSave = async () => {
    try {
      await updateRotation.mutateAsync({ id, payload: editForm })
      toast({ title: 'Rotation mise à jour', variant: 'success' })
      setEditing(false)
    } catch {
      toast({ title: 'Erreur lors de la mise à jour', variant: 'error' })
    }
  }

  if (isLoading || !rotation) {
    return (
      <DynamicPanelShell title="Chargement..." icon={<Route size={14} className="text-primary" />}>
        <div className="flex items-center justify-center py-16"><Loader2 size={16} className="animate-spin text-muted-foreground" /></div>
      </DynamicPanelShell>
    )
  }

  return (
    <DynamicPanelShell
      title={rotation.name}
      subtitle={rotation.vector_name ?? 'Rotation TravelWiz'}
      icon={<Route size={14} className="text-primary" />}
      actions={<>
        {!editing && <PanelActionButton onClick={startEdit} icon={<Pencil size={12} />}>Modifier</PanelActionButton>}
        {editing && <>
          <PanelActionButton onClick={() => setEditing(false)}>Annuler</PanelActionButton>
          <PanelActionButton variant="primary" onClick={handleSave} disabled={updateRotation.isPending} icon={<Save size={12} />}>
            {updateRotation.isPending ? <Loader2 size={12} className="animate-spin" /> : 'Enregistrer'}
          </PanelActionButton>
        </>}
        {!editing && <PanelActionButton onClick={closeDynamicPanel}>Fermer</PanelActionButton>}
      </>}
    >
      <PanelContentLayout>
        {editing ? (
          <>
            <FormSection title="Identification">
              <FormGrid>
                <DynamicPanelField label="Nom">
                  <input type="text" value={editForm.name ?? ''} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} className={panelInputClass} />
                </DynamicPanelField>
                <DynamicPanelField label="Vecteur">
                  <select value={editForm.vector_id ?? ''} onChange={(e) => setEditForm({ ...editForm, vector_id: e.target.value || null })} className={panelInputClass}>
                    <option value="">Sélectionner...</option>
                    {(vectorsData?.items ?? []).map((vector) => (
                      <option key={vector.id} value={vector.id}>{vector.registration} - {vector.name}</option>
                    ))}
                  </select>
                </DynamicPanelField>
                <DynamicPanelField label="Base de départ" span="full">
                  <AssetPicker
                    value={editForm.departure_base_id ?? null}
                    onChange={(assetId) => setEditForm({ ...editForm, departure_base_id: assetId ?? null })}
                    placeholder="Sélectionner la base de départ..."
                  />
                </DynamicPanelField>
              </FormGrid>
            </FormSection>
            <FormSection title="Programmation">
              <FormGrid>
                <DynamicPanelField label="Expression CRON">
                  <input type="text" value={editForm.schedule_cron ?? ''} onChange={(e) => setEditForm({ ...editForm, schedule_cron: e.target.value || null })} className={panelInputClass} />
                </DynamicPanelField>
                <DynamicPanelField label="Description métier" span="full">
                  <textarea value={editForm.schedule_description ?? ''} onChange={(e) => setEditForm({ ...editForm, schedule_description: e.target.value || null })} className={`${panelInputClass} min-h-[72px] resize-y`} rows={3} />
                </DynamicPanelField>
                <DynamicPanelField label="Active">
                  <label className="inline-flex items-center gap-2 text-xs">
                    <input type="checkbox" checked={editForm.active ?? true} onChange={(e) => setEditForm({ ...editForm, active: e.target.checked })} />
                    Rotation active
                  </label>
                </DynamicPanelField>
              </FormGrid>
            </FormSection>
          </>
        ) : (
          <>
            <FormSection title="Identification">
              <DetailRow label="Nom" value={rotation.name} />
              <DetailRow label="Vecteur" value={rotation.vector_name ?? '—'} />
              <DetailRow label="Base de départ" value={rotation.departure_base_name ?? '—'} />
              <DetailRow label="Active" value={rotation.active ? 'Oui' : 'Non'} />
            </FormSection>
            <FormSection title="Programmation">
              <DetailRow label="Expression CRON" value={rotation.schedule_cron ?? '—'} />
              <DetailRow label="Description métier" value={rotation.schedule_description ?? '—'} />
            </FormSection>
          </>
        )}
      </PanelContentLayout>
    </DynamicPanelShell>
  )
}

registerPanelRenderer('travelwiz', (view) => {
  if (view.type === 'create') {
    if (view.meta?.subtype === 'voyage') return <CreateVoyagePanel />
    if (view.meta?.subtype === 'vector') return <CreateVectorPanel />
    if (view.meta?.subtype === 'cargo-request') return <CargoWorkspaceProvider module="travelwiz" label="TravelWiz"><CreateCargoRequestPanel /></CargoWorkspaceProvider>
    if (view.meta?.subtype === 'cargo') return <CargoWorkspaceProvider module="travelwiz" label="TravelWiz"><CreateCargoPanel /></CargoWorkspaceProvider>
    if (view.meta?.subtype === 'article') return <CreateArticlePanel />
  }
  if (view.type === 'detail' && 'id' in view) {
    if (view.meta?.subtype === 'voyage') return <VoyageDetailPanel id={view.id} />
    if (view.meta?.subtype === 'vector') return <VectorDetailPanel id={view.id} />
    if (view.meta?.subtype === 'cargo-request') return <CargoWorkspaceProvider module="travelwiz" label="TravelWiz"><CargoRequestDetailPanel id={view.id} /></CargoWorkspaceProvider>
    if (view.meta?.subtype === 'cargo') return <CargoWorkspaceProvider module="travelwiz" label="TravelWiz"><PackLogCargoDetailPanel id={view.id} /></CargoWorkspaceProvider>
  }
  return null
})
