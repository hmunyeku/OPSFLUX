/**
 * TravelWiz page — Dashboard, Voyages, Manifestes PAX, Cargo, Vecteurs, Articles.
 *
 * Static Panel: tab bar + DataTable per tab.
 * Dynamic Panel: create/detail forms per entity.
 */
import { useState, useCallback, useMemo, Component, type ReactNode, type ErrorInfo } from 'react'
import {
  Plane, Ship, Package, FileText, Plus, LayoutDashboard,
  Anchor, Truck, Users, ArrowRight, Calendar, Weight,
  Loader2, Pencil, Trash2, Save, MapPin, AlertTriangle,
  Bell, CheckCircle2, XCircle, Box, CloudSun, Route,
  BarChart3, Search, Undo2, Boxes, Map as MapIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { DataTable } from '@/components/ui/DataTable/DataTable'
import type { ColumnDef } from '@tanstack/react-table'
import { useDebounce } from '@/hooks/useDebounce'
import { usePageSize } from '@/hooks/usePageSize'
import { PanelHeader, PanelContent, ToolbarButton } from '@/components/layout/PanelHeader'
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
  InlineEditableRow,
  SectionColumns,
  panelInputClass,
} from '@/components/layout/DynamicPanel'
import { registerPanelRenderer } from '@/components/layout/DetachedPanelRenderer'
import { TagManager } from '@/components/shared/TagManager'
import { NoteManager } from '@/components/shared/NoteManager'
import { AttachmentManager } from '@/components/shared/AttachmentManager'
import { AssetPicker } from '@/components/shared/AssetPicker'
import { useToast } from '@/components/ui/Toast'
import {
  useVoyages,
  useVoyage,
  useCreateVoyage,
  useUpdateVoyage,
  useDeleteVoyage,
  useUpdateVoyageStatus,
  useCloseTrip,
  useVoyageStops,
  useVoyageManifests,
  useVoyageCapacity,
  useVoyageEvents,
  useTripKpis,
  useVectors,
  useVector,
  useCreateVector,
  useUpdateVector,
  useDeleteVector,
  useVectorZones,
  useCargo,
  useCargoItem,
  useCreateCargo,
  useUpdateCargo,
  useUpdateCargoStatus,
  useInitiateCargoReturn,
  usePackageElements,
  useSapMatch,
  useAllManifests,
  useValidateManifest,
  useArticles,
  useCreateArticle,
  useTripsToday,
  useFleetKpis,
  usePickupRounds,
  usePickupRound,
  useClosePickupRound,
  useLatestWeather,
  // useRotations,
  // useCreateRotation,
  // useUpdateRotation,
} from '@/hooks/useTravelWiz'
import { usePermission } from '@/hooks/usePermission'
import { FleetMap } from '@/components/travelwiz/FleetMap'
import type {
  VoyageCreate, VoyageUpdate,
  TravelVectorCreate, TravelVectorUpdate,
  CargoItemCreate, CargoItemUpdate,
  // RotationCreate, RotationUpdate,
  TravelArticleCreate,
} from '@/types/api'

// ── Tab definitions ───────────────────────────────────────────

type TravelWizTab = 'dashboard' | 'voyages' | 'manifests' | 'cargo' | 'vectors' | 'articles' | 'fleet_map' | 'pickup' | 'weather'

const TABS: { id: TravelWizTab; label: string; icon: typeof Plane }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'voyages', label: 'Voyages', icon: Plane },
  { id: 'manifests', label: 'Manifestes PAX', icon: FileText },
  { id: 'cargo', label: 'Cargo', icon: Package },
  { id: 'vectors', label: 'Vecteurs', icon: Ship },
  { id: 'articles', label: 'Articles', icon: Boxes },
  { id: 'fleet_map', label: 'Carte flotte', icon: MapIcon },
  { id: 'pickup', label: 'Ramassage', icon: Route },
  { id: 'weather', label: 'Météo', icon: CloudSun },
]

// ── Constants ─────────────────────────────────────────────────

const VOYAGE_STATUS_OPTIONS = [
  { value: '', label: 'Tous' },
  { value: 'planned', label: 'Planifié' },
  { value: 'confirmed', label: 'Confirmé' },
  { value: 'boarding', label: 'Embarquement' },
  { value: 'departed', label: 'En route' },
  { value: 'arrived', label: 'Arrivé' },
  { value: 'completed', label: 'Terminé' },
  { value: 'cancelled', label: 'Annulé' },
  { value: 'delayed', label: 'Retardé' },
]

const VOYAGE_STATUS_MAP: Record<string, { label: string; badge: string }> = {
  planned:   { label: 'Planifié',      badge: 'gl-badge-neutral' },
  confirmed: { label: 'Confirmé',      badge: 'gl-badge-info' },
  boarding:  { label: 'Embarquement',  badge: 'gl-badge-warning' },
  departed:  { label: 'En route',      badge: 'gl-badge-warning' },
  arrived:   { label: 'Arrivé',        badge: 'gl-badge-success' },
  completed: { label: 'Terminé',       badge: 'gl-badge-success' },
  cancelled: { label: 'Annulé',        badge: 'gl-badge-danger' },
  delayed:   { label: 'Retardé',       badge: 'gl-badge-danger' },
}

const MANIFEST_STATUS_MAP: Record<string, { label: string; badge: string }> = {
  draft:              { label: 'Brouillon',       badge: 'gl-badge-neutral' },
  pending_validation: { label: 'En validation',   badge: 'gl-badge-warning' },
  validated:          { label: 'Validé',           badge: 'gl-badge-success' },
  requires_review:    { label: 'À revoir',        badge: 'gl-badge-danger' },
  closed:             { label: 'Clôturé',          badge: 'gl-badge-success' },
}

const MANIFEST_STATUS_OPTIONS = [
  { value: '', label: 'Tous' },
  { value: 'draft', label: 'Brouillon' },
  { value: 'pending_validation', label: 'En validation' },
  { value: 'validated', label: 'Validé' },
  { value: 'closed', label: 'Clôturé' },
]

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

const CARGO_STATUS_OPTIONS = [
  { value: '', label: 'Tous' },
  { value: 'registered', label: 'Enregistré' },
  { value: 'ready', label: 'Prêt' },
  { value: 'loaded', label: 'Chargé' },
  { value: 'in_transit', label: 'En transit' },
  { value: 'delivered', label: 'Livré' },
  { value: 'return_declared', label: 'Retour déclaré' },
]

const CARGO_STATUS_MAP: Record<string, { label: string; badge: string }> = {
  registered:        { label: 'Enregistré',        badge: 'gl-badge-neutral' },
  ready:             { label: 'Prêt',              badge: 'gl-badge-info' },
  loaded:            { label: 'Chargé',            badge: 'gl-badge-warning' },
  in_transit:        { label: 'En transit',        badge: 'gl-badge-warning' },
  delivered:         { label: 'Livré',             badge: 'gl-badge-success' },
  delivered_intermediate: { label: 'Livré (inter.)', badge: 'gl-badge-info' },
  delivered_final:   { label: 'Livré (final)',     badge: 'gl-badge-success' },
  return_declared:   { label: 'Retour déclaré',    badge: 'gl-badge-warning' },
  return_in_transit: { label: 'Retour en transit', badge: 'gl-badge-warning' },
  returned:          { label: 'Retourné',          badge: 'gl-badge-success' },
  damaged:           { label: 'Endommagé',         badge: 'gl-badge-danger' },
  missing:           { label: 'Manquant',          badge: 'gl-badge-danger' },
}

// ── Helpers ───────────────────────────────────────────────────

function StatusBadge({ status, map }: { status: string; map: Record<string, { label: string; badge: string }> }) {
  const entry = map[status]
  return (
    <span className={cn('gl-badge', entry?.badge || 'gl-badge-neutral')}>
      {entry?.label || status.replace(/_/g, ' ')}
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
      cell: ({ row }) => <StatusBadge status={row.original.status} map={VOYAGE_STATUS_MAP} />,
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
  ], [])

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
        <StatCard label="PAX en deplacement" value={kpis?.pax_in_transit ?? 0} icon={Users} accent="text-blue-500" />
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
  const deleteVoyage = useDeleteVoyage()
  const { hasPermission } = usePermission()
  const canDelete = hasPermission('travelwiz.voyage.delete')
  const canExport = hasPermission('travelwiz.voyage.read')
  const canImport = hasPermission('travelwiz.voyage.create')

  const { data, isLoading } = useVoyages({
    page,
    page_size: pageSize,
    search: debouncedSearch || undefined,
    status: statusFilter || undefined,
  })

  const items: AnyRow[] = data?.items ?? []
  const total = data?.total ?? 0

  const stats = useMemo(() => {
    const planned = items.filter((v: AnyRow) => v.status === 'planned').length
    const inProgress = items.filter((v: AnyRow) => ['boarding', 'departed'].includes(v.status)).length
    const arrived = items.filter((v: AnyRow) => v.status === 'arrived').length
    const totalPax = items.reduce((sum: number, v: AnyRow) => sum + (v.pax_count ?? 0), 0)
    return { planned, inProgress, arrived, totalPax }
  }, [items])

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
      cell: ({ row }) => <StatusBadge status={row.original.status} map={VOYAGE_STATUS_MAP} />,
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
          onClick={(e: React.MouseEvent) => { e.stopPropagation(); if (confirm('Supprimer ce voyage ?')) deleteVoyage.mutate(row.original.id) }}
          title="Supprimer"
        >
          <span className="text-xs">&times;</span>
        </button>
      ),
    }] : []),
  ], [deleteVoyage, canDelete])

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 px-4 py-3 border-b border-border">
        <StatCard label="Planifies" value={stats.planned} icon={Calendar} />
        <StatCard label="En cours" value={stats.inProgress} icon={Plane} />
        <StatCard label="Arrives" value={stats.arrived} icon={Anchor} />
        <StatCard label="PAX total" value={stats.totalPax} icon={Users} />
      </div>

      <div className="flex items-center gap-2 border-b border-border px-3.5 h-9 shrink-0">
        <div className="flex items-center gap-1 overflow-x-auto">
          {VOYAGE_STATUS_OPTIONS.map((opt) => (
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
      </PanelContent>
    </>
  )
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
      cell: ({ row }) => <StatusBadge status={row.original.status} map={MANIFEST_STATUS_MAP} />,
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
  ], [validateManifest])

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
          {MANIFEST_STATUS_OPTIONS.map((opt) => (
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

function CargoTab() {
  const [page, setPage] = useState(1)
  const { pageSize } = usePageSize()
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search, 300)
  const [statusFilter, setStatusFilter] = useState('')
  const openDynamicPanel = useUIStore((s) => s.openDynamicPanel)
  const updateCargoStatus = useUpdateCargoStatus()

  const { data, isLoading } = useCargo({
    page,
    page_size: pageSize,
    search: debouncedSearch || undefined,
    status: statusFilter || undefined,
  })

  const items: AnyRow[] = data?.items ?? []
  const total = data?.total ?? 0

  const stats = useMemo(() => {
    const totalWeight = items.reduce((sum: number, c: AnyRow) => sum + (c.weight_kg ?? 0), 0)
    const inTransit = items.filter((c: AnyRow) => c.status === 'in_transit').length
    const delivered = items.filter((c: AnyRow) => ['delivered', 'delivered_intermediate', 'delivered_final'].includes(c.status)).length
    const hazmat = items.filter((c: AnyRow) => c.hazmat_class).length
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
      cell: ({ row }) => <StatusBadge status={row.original.status} map={CARGO_STATUS_MAP} />,
    },
    {
      id: 'flags',
      header: '',
      size: 50,
      cell: ({ row }) => (
        <div className="flex items-center gap-1">
          {row.original.hazmat_class && (
            <span title={`HAZMAT: ${row.original.hazmat_class}`} className="text-destructive">
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
  ], [updateCargoStatus])

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 px-4 py-3 border-b border-border">
        <StatCard label="Total colis" value={stats.count} icon={Package} />
        <StatCard label="Poids total" value={`${stats.totalWeight.toLocaleString('fr-FR')} kg`} icon={Weight} />
        <StatCard label="En transit" value={stats.inTransit} icon={Truck} />
        <StatCard label="HAZMAT" value={stats.hazmat} icon={AlertTriangle} accent="text-destructive" />
      </div>

      <div className="flex items-center gap-2 border-b border-border px-3.5 h-9 shrink-0">
        <div className="flex items-center gap-1 overflow-x-auto">
          {CARGO_STATUS_OPTIONS.map((opt) => (
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
          onRowClick={(row) => openDynamicPanel({ type: 'detail', module: 'travelwiz', id: row.id, meta: { subtype: 'cargo' } })}
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
          onClick={(e: React.MouseEvent) => { e.stopPropagation(); if (confirm('Supprimer ce vecteur ?')) deleteVector.mutate(row.original.id) }}
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
        <StatCard label="Helicopteres" value={stats.byType['helicopter'] ?? 0} icon={Plane} />
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

function ArticlesTab() {
  const [page, setPage] = useState(1)
  const { pageSize } = usePageSize()
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search, 300)
  const openDynamicPanel = useUIStore((s) => s.openDynamicPanel)
  const sapMatch = useSapMatch()

  const { data, isLoading } = useArticles({
    page,
    page_size: pageSize,
    search: debouncedSearch || undefined,
  })

  const items: AnyRow[] = data?.items ?? []

  const stats = useMemo(() => {
    const hazmat = items.filter((a: AnyRow) => a.is_hazmat).length
    return { count: items.length, hazmat }
  }, [items])

  const columns = useMemo<ColumnDef<AnyRow, unknown>[]>(() => [
    {
      accessorKey: 'sap_code',
      header: 'Code SAP',
      size: 120,
      cell: ({ row }) => <span className="font-medium font-mono text-xs text-foreground">{row.original.sap_code}</span>,
    },
    {
      accessorKey: 'description',
      header: 'Description',
      cell: ({ row }) => <span className="text-foreground truncate max-w-[250px] block">{row.original.description}</span>,
    },
    {
      accessorKey: 'management_type',
      header: 'Gestion',
      size: 100,
      cell: ({ row }) => <span className="gl-badge gl-badge-neutral">{row.original.management_type || '—'}</span>,
    },
    {
      accessorKey: 'packaging',
      header: 'Conditionnement',
      size: 120,
      cell: ({ row }) => <span className="text-xs text-muted-foreground">{row.original.packaging || '—'}</span>,
    },
    {
      id: 'hazmat',
      header: 'HAZMAT',
      size: 70,
      cell: ({ row }) => row.original.is_hazmat ? (
        <span className="inline-flex items-center gap-1 text-destructive">
          <AlertTriangle size={12} />
          <span className="text-xs">{row.original.hazmat_class || 'Oui'}</span>
        </span>
      ) : <span className="text-xs text-muted-foreground">Non</span>,
    },
  ], [])

  // SAP matching tool state
  const [sapQuery, setSapQuery] = useState('')

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 px-4 py-3 border-b border-border">
        <StatCard label="Articles" value={stats.count} icon={Boxes} />
        <StatCard label="HAZMAT" value={stats.hazmat} icon={AlertTriangle} accent="text-destructive" />
        <StatCard label="Total (page)" value={data?.total ?? 0} icon={Box} />
        <div className="rounded-lg border border-border bg-background p-3">
          <div className="flex items-center gap-2 text-muted-foreground mb-1">
            <Search size={13} />
            <span className="text-[10px] font-medium uppercase tracking-wide">SAP Match</span>
          </div>
          <div className="flex gap-1">
            <input
              type="text"
              value={sapQuery}
              onChange={(e) => setSapQuery(e.target.value)}
              className="flex-1 text-xs border border-border rounded px-1.5 py-0.5 bg-background text-foreground"
              placeholder="Description..."
            />
            <button
              className="text-xs px-1.5 py-0.5 rounded bg-primary/10 text-primary hover:bg-primary/20"
              onClick={() => { if (sapQuery.trim()) sapMatch.mutate(sapQuery.trim()) }}
              disabled={sapMatch.isPending}
            >
              {sapMatch.isPending ? <Loader2 size={10} className="animate-spin" /> : 'Go'}
            </button>
          </div>
          {sapMatch.data && (
            <p className="text-[10px] text-muted-foreground mt-1">
              {sapMatch.data.matched ? `${sapMatch.data.sap_code} (${Math.round(sapMatch.data.confidence * 100)}%)` : 'Aucun match'}
            </p>
          )}
        </div>
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
          searchPlaceholder="Rechercher par code SAP, description..."
          onRowClick={(row) => openDynamicPanel({ type: 'detail', module: 'travelwiz', id: row.id, meta: { subtype: 'article' } })}
          emptyIcon={Boxes}
          emptyTitle="Aucun article"
          storageKey="travelwiz-articles"
        />
      </PanelContent>
    </>
  )
}

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

const PICKUP_STATUS_OPTIONS = [
  { value: '', label: 'Tous' },
  { value: 'planned', label: 'Planifie' },
  { value: 'in_progress', label: 'En cours' },
  { value: 'completed', label: 'Termine' },
  { value: 'cancelled', label: 'Annule' },
]

const PICKUP_STATUS_MAP: Record<string, { label: string; badge: string }> = {
  planned:     { label: 'Planifie',  badge: 'gl-badge-neutral' },
  in_progress: { label: 'En cours',  badge: 'gl-badge-warning' },
  completed:   { label: 'Termine',   badge: 'gl-badge-success' },
  cancelled:   { label: 'Annule',    badge: 'gl-badge-danger' },
}

function PickupTab() {
  const [page, setPage] = useState(1)
  const { pageSize } = usePageSize()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const closeRound = useClosePickupRound()

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
      header: 'Vehicule',
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
      cell: ({ row }) => <StatusBadge status={row.original.status} map={PICKUP_STATUS_MAP} />,
    },
  ], [])

  return (
    <>
      <div className="flex items-center gap-2 border-b border-border px-3.5 h-9 shrink-0">
        <div className="flex items-center gap-1 overflow-x-auto">
          {PICKUP_STATUS_OPTIONS.map((opt) => (
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
            <StatusBadge status={roundDetail.status} map={PICKUP_STATUS_MAP} />

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
              <StatusBadge status={w.flight_status} map={FLIGHT_STATUS_MAP} />
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
  const canCreate = hasPermission('travelwiz.voyage.create')

  const handleCreate = useCallback(() => {
    if (activeTab === 'voyages') openDynamicPanel({ type: 'create', module: 'travelwiz', meta: { subtype: 'voyage' } })
    else if (activeTab === 'vectors') openDynamicPanel({ type: 'create', module: 'travelwiz', meta: { subtype: 'vector' } })
    else if (activeTab === 'cargo') openDynamicPanel({ type: 'create', module: 'travelwiz', meta: { subtype: 'cargo' } })
    else if (activeTab === 'articles') openDynamicPanel({ type: 'create', module: 'travelwiz', meta: { subtype: 'article' } })
  }, [activeTab, openDynamicPanel])

  const createLabel =
    activeTab === 'voyages' ? 'Nouveau voyage'
      : activeTab === 'vectors' ? 'Nouveau vecteur'
        : activeTab === 'cargo' ? 'Nouveau colis'
          : activeTab === 'articles' ? 'Nouvel article'
            : ''

  const showCreate = ['voyages', 'vectors', 'cargo', 'articles'].includes(activeTab)

  return (
    <div className="flex h-full">
      {!isFullPanel && (
        <div className="flex flex-1 flex-col min-w-0 overflow-hidden">
          <PanelHeader icon={Plane} title="TravelWiz" subtitle="Transport et logistique">
            {showCreate && canCreate && <ToolbarButton icon={Plus} label={createLabel} variant="primary" onClick={handleCreate} />}
          </PanelHeader>

          {/* Tab bar */}
          <div className="flex items-center gap-1 border-b border-border px-3.5 h-9 shrink-0">
            {TABS.map((tab) => {
              const Icon = tab.icon
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors',
                    activeTab === tab.id
                      ? 'bg-primary/[0.16] text-foreground'
                      : 'text-muted-foreground hover:text-foreground hover:bg-accent',
                  )}
                >
                  <Icon size={12} />
                  {tab.label}
                </button>
              )
            })}
          </div>

          {activeTab === 'dashboard' && <DashboardTab />}
          {activeTab === 'voyages' && <VoyagesTab />}
          {activeTab === 'manifests' && <ManifestesTab />}
          {activeTab === 'cargo' && <CargoTab />}
          {activeTab === 'vectors' && <VecteursTab />}
          {activeTab === 'articles' && <ArticlesTab />}
          {activeTab === 'fleet_map' && <FleetMapTab />}
          {activeTab === 'pickup' && <PickupTab />}
          {activeTab === 'weather' && <WeatherTab />}
        </div>
      )}

      {dynamicPanel?.module === 'travelwiz' && dynamicPanel.type === 'create' && dynamicPanel.meta?.subtype === 'voyage' && <CreateVoyagePanel />}
      {dynamicPanel?.module === 'travelwiz' && dynamicPanel.type === 'create' && dynamicPanel.meta?.subtype === 'vector' && <CreateVectorPanel />}
      {dynamicPanel?.module === 'travelwiz' && dynamicPanel.type === 'create' && dynamicPanel.meta?.subtype === 'cargo' && <CreateCargoPanel />}
      {dynamicPanel?.module === 'travelwiz' && dynamicPanel.type === 'create' && dynamicPanel.meta?.subtype === 'article' && <CreateArticlePanel />}
      {dynamicPanel?.module === 'travelwiz' && dynamicPanel.type === 'detail' && dynamicPanel.meta?.subtype === 'voyage' && <VoyageDetailPanel id={(dynamicPanel as { id: string }).id} />}
      {dynamicPanel?.module === 'travelwiz' && dynamicPanel.type === 'detail' && dynamicPanel.meta?.subtype === 'vector' && <VectorDetailPanel id={(dynamicPanel as { id: string }).id} />}
      {dynamicPanel?.module === 'travelwiz' && dynamicPanel.type === 'detail' && dynamicPanel.meta?.subtype === 'cargo' && <CargoDetailPanel id={(dynamicPanel as { id: string }).id} />}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// ── CREATE PANELS ────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════

function CreateVoyagePanel() {
  const closeDynamicPanel = useUIStore((s) => s.closeDynamicPanel)
  const createVoyage = useCreateVoyage()
  const { toast } = useToast()
  const [form, setForm] = useState<VoyageCreate>({
    code: '', vector_id: null, rotation_id: null, status: 'planned',
    departure_at: null, arrival_at: null, origin: null, destination: null, description: null,
  })

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
              <DynamicPanelField label="Code" required>
                <input type="text" required value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} className={panelInputClass} placeholder="VOY-001" />
              </DynamicPanelField>
              <DynamicPanelField label="Statut">
                <select value={form.status ?? 'planned'} onChange={(e) => setForm({ ...form, status: e.target.value })} className={panelInputClass}>
                  <option value="planned">Planifie</option>
                  <option value="confirmed">Confirme</option>
                </select>
              </DynamicPanelField>
            </FormGrid>
          </FormSection>
          <FormSection title="Itineraire">
            <FormGrid>
              <DynamicPanelField label="Origine">
                <input type="text" value={form.origin ?? ''} onChange={(e) => setForm({ ...form, origin: e.target.value || null })} className={panelInputClass} placeholder="Port Harcourt" />
              </DynamicPanelField>
              <DynamicPanelField label="Destination">
                <input type="text" value={form.destination ?? ''} onChange={(e) => setForm({ ...form, destination: e.target.value || null })} className={panelInputClass} placeholder="Douala" />
              </DynamicPanelField>
            </FormGrid>
          </FormSection>
          <FormSection title="Horaires">
            <FormGrid>
              <DynamicPanelField label="Depart">
                <input type="datetime-local" value={form.departure_at ?? ''} onChange={(e) => setForm({ ...form, departure_at: e.target.value || null })} className={panelInputClass} />
              </DynamicPanelField>
              <DynamicPanelField label="Arrivee">
                <input type="datetime-local" value={form.arrival_at ?? ''} onChange={(e) => setForm({ ...form, arrival_at: e.target.value || null })} className={panelInputClass} />
              </DynamicPanelField>
            </FormGrid>
          </FormSection>
          <FormSection title="Description" collapsible defaultExpanded={false}>
            <textarea value={form.description ?? ''} onChange={(e) => setForm({ ...form, description: e.target.value || null })}
              className={`${panelInputClass} min-h-[60px] resize-y`} placeholder="Description du voyage..." rows={3} />
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
                  <option value="helicopter">Helicoptere</option>
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

function CreateCargoPanel() {
  const closeDynamicPanel = useUIStore((s) => s.closeDynamicPanel)
  const createCargo = useCreateCargo()
  const { toast } = useToast()
  const [form, setForm] = useState<CargoItemCreate>({
    code: '', description: null, weight_kg: null, volume_m3: null,
    cargo_type: null, hazmat_class: null, voyage_id: null,
    sender_tier_id: null, receiver_tier_id: null, notes: null,
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await createCargo.mutateAsync(form)
      toast({ title: 'Colis cree avec succes', variant: 'success' })
      closeDynamicPanel()
    } catch { toast({ title: 'Erreur lors de la creation du colis', variant: 'error' }) }
  }

  return (
    <DynamicPanelShell title="Nouveau colis" subtitle="TravelWiz" icon={<Package size={14} className="text-primary" />}
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
          <FormSection title="Identification">
            <FormGrid>
              <DynamicPanelField label="Code" required>
                <input type="text" required value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} className={panelInputClass} placeholder="CRG-001" />
              </DynamicPanelField>
              <DynamicPanelField label="Type de colis">
                <input type="text" value={form.cargo_type ?? ''} onChange={(e) => setForm({ ...form, cargo_type: e.target.value || null })} className={panelInputClass} placeholder="General, Dangereux..." />
              </DynamicPanelField>
              <DynamicPanelField label="Classe HAZMAT">
                <input type="text" value={form.hazmat_class ?? ''} onChange={(e) => setForm({ ...form, hazmat_class: e.target.value || null })} className={panelInputClass} placeholder="Classe 1, 2..." />
              </DynamicPanelField>
            </FormGrid>
          </FormSection>
          <FormSection title="Dimensions">
            <FormGrid>
              <DynamicPanelField label="Poids (kg)">
                <input type="number" min={0} step="any" value={form.weight_kg ?? ''} onChange={(e) => setForm({ ...form, weight_kg: e.target.value ? Number(e.target.value) : null })} className={panelInputClass} />
              </DynamicPanelField>
              <DynamicPanelField label="Volume (m3)">
                <input type="number" min={0} step="any" value={form.volume_m3 ?? ''} onChange={(e) => setForm({ ...form, volume_m3: e.target.value ? Number(e.target.value) : null })} className={panelInputClass} />
              </DynamicPanelField>
            </FormGrid>
          </FormSection>
          <FormSection title="Description" collapsible defaultExpanded={false}>
            <DynamicPanelField label="Description" span="full">
              <textarea value={form.description ?? ''} onChange={(e) => setForm({ ...form, description: e.target.value || null })}
                className={`${panelInputClass} min-h-[60px] resize-y`} placeholder="Description du colis..." rows={3} />
            </DynamicPanelField>
            <DynamicPanelField label="Notes" span="full">
              <textarea value={form.notes ?? ''} onChange={(e) => setForm({ ...form, notes: e.target.value || null })}
                className={`${panelInputClass} min-h-[60px] resize-y`} placeholder="Notes supplementaires..." rows={2} />
            </DynamicPanelField>
          </FormSection>
        </PanelContentLayout>
      </form>
    </DynamicPanelShell>
  )
}

function CreateArticlePanel() {
  const closeDynamicPanel = useUIStore((s) => s.closeDynamicPanel)
  const createArticle = useCreateArticle()
  const { toast } = useToast()
  const [form, setForm] = useState<TravelArticleCreate>({
    sap_code: '', description: '', management_type: null, packaging: null,
    is_hazmat: false, hazmat_class: null, unit: null,
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await createArticle.mutateAsync(form)
      toast({ title: 'Article cree avec succes', variant: 'success' })
      closeDynamicPanel()
    } catch { toast({ title: 'Erreur lors de la creation de l\'article', variant: 'error' }) }
  }

  return (
    <DynamicPanelShell title="Nouvel article" subtitle="TravelWiz" icon={<Boxes size={14} className="text-primary" />}
      actions={<>
        <PanelActionButton onClick={closeDynamicPanel}>Annuler</PanelActionButton>
        <PanelActionButton variant="primary" disabled={createArticle.isPending}
          onClick={() => (document.getElementById('create-article-form') as HTMLFormElement)?.requestSubmit()}>
          {createArticle.isPending ? <Loader2 size={12} className="animate-spin" /> : 'Creer'}
        </PanelActionButton>
      </>}
    >
      <form id="create-article-form" onSubmit={handleSubmit}>
        <PanelContentLayout>
          <FormSection title="Identification">
            <FormGrid>
              <DynamicPanelField label="Code SAP" required>
                <input type="text" required value={form.sap_code} onChange={(e) => setForm({ ...form, sap_code: e.target.value })} className={panelInputClass} placeholder="MAT-00001" />
              </DynamicPanelField>
              <DynamicPanelField label="Description" required>
                <input type="text" required value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className={panelInputClass} placeholder="Description de l'article" />
              </DynamicPanelField>
              <DynamicPanelField label="Type de gestion">
                <input type="text" value={form.management_type ?? ''} onChange={(e) => setForm({ ...form, management_type: e.target.value || null })} className={panelInputClass} placeholder="Consommable, Stock..." />
              </DynamicPanelField>
              <DynamicPanelField label="Conditionnement">
                <input type="text" value={form.packaging ?? ''} onChange={(e) => setForm({ ...form, packaging: e.target.value || null })} className={panelInputClass} placeholder="Carton, Palette..." />
              </DynamicPanelField>
              <DynamicPanelField label="Unite">
                <input type="text" value={form.unit ?? ''} onChange={(e) => setForm({ ...form, unit: e.target.value || null })} className={panelInputClass} placeholder="kg, m, pce..." />
              </DynamicPanelField>
            </FormGrid>
          </FormSection>
          <FormSection title="HAZMAT">
            <FormGrid>
              <DynamicPanelField label="Matiere dangereuse">
                <label className="inline-flex items-center gap-2 text-xs">
                  <input type="checkbox" checked={form.is_hazmat ?? false} onChange={(e) => setForm({ ...form, is_hazmat: e.target.checked })} />
                  HAZMAT
                </label>
              </DynamicPanelField>
              {form.is_hazmat && (
                <DynamicPanelField label="Classe HAZMAT">
                  <input type="text" value={form.hazmat_class ?? ''} onChange={(e) => setForm({ ...form, hazmat_class: e.target.value || null })} className={panelInputClass} placeholder="Classe 1, 2..." />
                </DynamicPanelField>
              )}
            </FormGrid>
          </FormSection>
        </PanelContentLayout>
      </form>
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
  const updateVoyage = useUpdateVoyage()
  const deleteVoyage = useDeleteVoyage()
  const updateStatus = useUpdateVoyageStatus()
  const { hasPermission } = usePermission()
  const canUpdate = hasPermission('travelwiz.voyage.update')
  const canDelete = hasPermission('travelwiz.voyage.delete')
  const closeTrip = useCloseTrip()
  const { data: stops } = useVoyageStops(id)
  const { data: manifests } = useVoyageManifests(id)
  const { data: capacity } = useVoyageCapacity(id)
  const { data: events } = useVoyageEvents(id)
  const { data: kpis } = useTripKpis(id)
  const { toast } = useToast()
  const [editing, setEditing] = useState(false)
  const [editForm, setEditForm] = useState<VoyageUpdate>({})

  const startEdit = useCallback(() => {
    if (!voyage) return
    setEditForm({ code: voyage.code, origin: voyage.origin, destination: voyage.destination, departure_at: voyage.departure_at, arrival_at: voyage.arrival_at, description: voyage.description })
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

  // Inline field save (used by InlineEditableRow in read mode)
  const handleInlineSave = useCallback((field: string, value: string) => {
    updateVoyage.mutate(
      { id, payload: { [field]: value } },
      {
        onSuccess: () => toast({ title: 'Champ mis a jour', variant: 'success' }),
        onError: () => toast({ title: 'Erreur lors de la mise a jour', variant: 'error' }),
      },
    )
  }, [id, updateVoyage, toast])

  if (isLoading || !voyage) {
    return (
      <DynamicPanelShell title="Chargement..." icon={<Plane size={14} className="text-primary" />}>
        <div className="flex items-center justify-center py-16"><Loader2 size={16} className="animate-spin text-muted-foreground" /></div>
      </DynamicPanelShell>
    )
  }

  // PAX summary from manifests
  const paxSummary = useMemo(() => {
    if (!manifests) return { confirmed: 0, standby: 0, noShow: 0 }
    return { confirmed: voyage.pax_count ?? 0, standby: 0, noShow: 0 }
  }, [manifests, voyage])

  // Cargo summary
  const cargoWeight = capacity?.current_cargo_kg ?? 0
  const hasHazmat = false // from cargo items if available

  return (
    <DynamicPanelShell
      title={voyage.code}
      subtitle={`${voyage.origin ?? '?'} → ${voyage.destination ?? '?'}`}
      icon={<Plane size={14} className="text-primary" />}
      actions={<>
        {!editing && canUpdate && <PanelActionButton onClick={startEdit} icon={<Pencil size={12} />}>Modifier</PanelActionButton>}
        {editing && <>
          <PanelActionButton onClick={() => setEditing(false)}>Annuler</PanelActionButton>
          <PanelActionButton variant="primary" onClick={handleSave} disabled={updateVoyage.isPending} icon={<Save size={12} />}>
            {updateVoyage.isPending ? <Loader2 size={12} className="animate-spin" /> : 'Enregistrer'}
          </PanelActionButton>
        </>}
        {!editing && canUpdate && voyage.status !== 'cancelled' && voyage.status !== 'completed' && (
          <select className="text-xs border border-border rounded px-1.5 py-0.5 bg-background text-foreground h-7" value=""
            onChange={(e) => { if (e.target.value) updateStatus.mutate({ id, status: e.target.value }) }}>
            <option value="">Statut...</option>
            {Object.entries(VOYAGE_STATUS_MAP).filter(([k]) => k !== voyage.status).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
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
          <StatusBadge status={voyage.status} map={VOYAGE_STATUS_MAP} />
        </div>

        {editing ? (
          <FormSection title="Informations">
            <FormGrid>
              <DynamicPanelField label="Code"><span className="text-sm font-mono font-medium text-foreground">{editForm.code || '—'}</span></DynamicPanelField>
              <DynamicPanelField label="Origine"><input type="text" value={editForm.origin ?? ''} onChange={(e) => setEditForm({ ...editForm, origin: e.target.value || null })} className={panelInputClass} /></DynamicPanelField>
              <DynamicPanelField label="Destination"><input type="text" value={editForm.destination ?? ''} onChange={(e) => setEditForm({ ...editForm, destination: e.target.value || null })} className={panelInputClass} /></DynamicPanelField>
              <DynamicPanelField label="Depart"><input type="datetime-local" value={editForm.departure_at ?? ''} onChange={(e) => setEditForm({ ...editForm, departure_at: e.target.value || null })} className={panelInputClass} /></DynamicPanelField>
              <DynamicPanelField label="Arrivee"><input type="datetime-local" value={editForm.arrival_at ?? ''} onChange={(e) => setEditForm({ ...editForm, arrival_at: e.target.value || null })} className={panelInputClass} /></DynamicPanelField>
              <DynamicPanelField label="Description" span="full"><textarea value={editForm.description ?? ''} onChange={(e) => setEditForm({ ...editForm, description: e.target.value || null })} className={`${panelInputClass} min-h-[60px] resize-y`} rows={3} /></DynamicPanelField>
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
                  <DetailRow label="Origine" value={voyage.origin ?? '—'} />
                  <DetailRow label="Destination" value={voyage.destination ?? '—'} />
                  <DetailRow label="Depart" value={voyage.departure_at ? new Date(voyage.departure_at).toLocaleString('fr-FR') : '—'} />
                  <DetailRow label="Arrivee" value={voyage.arrival_at ? new Date(voyage.arrival_at).toLocaleString('fr-FR') : '—'} />
                  <InlineEditableRow label="Description" value={voyage.description ?? ''} onSave={(v) => handleInlineSave('description', v)} />
                </FormSection>

            {/* Route: Stops */}
            <FormSection title={`Route (${(stops?.length ?? 0) + 2} points)`} collapsible defaultExpanded>
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 p-1.5 rounded bg-primary/5 border border-primary/10">
                  <div className="w-5 h-5 rounded-full bg-primary/20 text-primary text-[10px] font-bold flex items-center justify-center shrink-0">O</div>
                  <span className="text-xs font-medium text-foreground">{voyage.origin || '?'}</span>
                  <span className="text-[10px] text-muted-foreground ml-auto">{formatDateTime(voyage.departure_at)}</span>
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
                  <span className="text-xs font-medium text-foreground">{voyage.destination || '?'}</span>
                  <span className="text-[10px] text-muted-foreground ml-auto">{formatDateTime(voyage.arrival_at)}</span>
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
                      <StatusBadge status={m.status} map={MANIFEST_STATUS_MAP} />
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

// ── Cargo Detail Panel (enhanced with package elements, return workflow, SAP) ──

function CargoDetailPanel({ id }: { id: string }) {
  const { data: cargo, isLoading } = useCargoItem(id)
  const updateCargo = useUpdateCargo()
  const updateCargoSt = useUpdateCargoStatus()
  const initiateReturn = useInitiateCargoReturn()
  const { data: packageElements } = usePackageElements(id)
  const sapMatch = useSapMatch()
  const { toast } = useToast()
  const [editing, setEditing] = useState(false)
  const [editForm, setEditForm] = useState<CargoItemUpdate>({})

  const startEdit = useCallback(() => {
    if (!cargo) return
    setEditForm({ code: cargo.code, description: cargo.description, weight_kg: cargo.weight_kg, volume_m3: cargo.volume_m3, cargo_type: cargo.cargo_type, hazmat_class: cargo.hazmat_class, notes: cargo.notes })
    setEditing(true)
  }, [cargo])

  const handleSave = async () => {
    try { await updateCargo.mutateAsync({ id, payload: editForm }); toast({ title: 'Colis mis a jour', variant: 'success' }); setEditing(false) }
    catch { toast({ title: 'Erreur lors de la mise a jour', variant: 'error' }) }
  }

  const handleReturn = async () => {
    try { await initiateReturn.mutateAsync({ cargoItemId: id, payload: { return_type: 'standard' } }); toast({ title: 'Retour initie', variant: 'success' }) }
    catch { toast({ title: 'Erreur lors de l\'initiation du retour', variant: 'error' }) }
  }

  if (isLoading || !cargo) {
    return (
      <DynamicPanelShell title="Chargement..." icon={<Package size={14} className="text-primary" />}>
        <div className="flex items-center justify-center py-16"><Loader2 size={16} className="animate-spin text-muted-foreground" /></div>
      </DynamicPanelShell>
    )
  }

  const isDelivered = ['delivered', 'delivered_final', 'delivered_intermediate'].includes(cargo.status)

  return (
    <DynamicPanelShell title={cargo.code} subtitle={cargo.description || 'Colis'} icon={<Package size={14} className="text-primary" />}
      actions={<>
        {!editing && <PanelActionButton onClick={startEdit} icon={<Pencil size={12} />}>Modifier</PanelActionButton>}
        {editing && <>
          <PanelActionButton onClick={() => setEditing(false)}>Annuler</PanelActionButton>
          <PanelActionButton variant="primary" onClick={handleSave} disabled={updateCargo.isPending} icon={<Save size={12} />}>
            {updateCargo.isPending ? <Loader2 size={12} className="animate-spin" /> : 'Enregistrer'}
          </PanelActionButton>
        </>}
      </>}
    >
      <PanelContentLayout>
        {/* Status + HAZMAT warning */}
        <div className="flex items-center gap-2 flex-wrap">
          <StatusBadge status={cargo.status} map={CARGO_STATUS_MAP} />
          {cargo.hazmat_class && (
            <span className="inline-flex items-center gap-1 text-xs text-destructive font-medium">
              <AlertTriangle size={12} />
              HAZMAT: {cargo.hazmat_class}
            </span>
          )}
          {!editing && !['delivered_final', 'damaged', 'missing', 'returned'].includes(cargo.status) && (
            <select className="text-xs border border-border rounded px-1.5 py-0.5 bg-background text-foreground" value=""
              onChange={(e) => { if (e.target.value) updateCargoSt.mutate({ id, status: e.target.value }) }}>
              <option value="">Changer statut...</option>
              {Object.entries(CARGO_STATUS_MAP).filter(([k]) => k !== cargo.status).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          )}
          {isDelivered && !editing && (
            <button className="gl-button-sm gl-button-default text-xs inline-flex items-center gap-1" onClick={handleReturn} disabled={initiateReturn.isPending}>
              <Undo2 size={10} /> Retour
            </button>
          )}
        </div>

        {editing ? (
          <FormSection title="Informations">
            <FormGrid>
              <DynamicPanelField label="Code"><span className="text-sm font-mono font-medium text-foreground">{editForm.code || '—'}</span></DynamicPanelField>
              <DynamicPanelField label="Type de colis"><input type="text" value={editForm.cargo_type ?? ''} onChange={(e) => setEditForm({ ...editForm, cargo_type: e.target.value || null })} className={panelInputClass} /></DynamicPanelField>
              <DynamicPanelField label="Classe HAZMAT"><input type="text" value={editForm.hazmat_class ?? ''} onChange={(e) => setEditForm({ ...editForm, hazmat_class: e.target.value || null })} className={panelInputClass} /></DynamicPanelField>
              <DynamicPanelField label="Poids (kg)"><input type="number" min={0} step="any" value={editForm.weight_kg ?? ''} onChange={(e) => setEditForm({ ...editForm, weight_kg: e.target.value ? Number(e.target.value) : null })} className={panelInputClass} /></DynamicPanelField>
              <DynamicPanelField label="Volume (m3)"><input type="number" min={0} step="any" value={editForm.volume_m3 ?? ''} onChange={(e) => setEditForm({ ...editForm, volume_m3: e.target.value ? Number(e.target.value) : null })} className={panelInputClass} /></DynamicPanelField>
              <DynamicPanelField label="Description" span="full"><textarea value={editForm.description ?? ''} onChange={(e) => setEditForm({ ...editForm, description: e.target.value || null })} className={`${panelInputClass} min-h-[60px] resize-y`} rows={3} /></DynamicPanelField>
              <DynamicPanelField label="Notes" span="full"><textarea value={editForm.notes ?? ''} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value || null })} className={`${panelInputClass} min-h-[60px] resize-y`} rows={2} /></DynamicPanelField>
            </FormGrid>
          </FormSection>
        ) : (
          <>
            <FormSection title="Details">
              <DetailRow label="Code" value={cargo.code} />
              <DetailRow label="Type" value={cargo.cargo_type ?? '—'} />
              <DetailRow label="Poids" value={cargo.weight_kg ? `${cargo.weight_kg.toLocaleString('fr-FR')} kg` : '—'} />
              <DetailRow label="Volume" value={cargo.volume_m3 ? `${cargo.volume_m3.toLocaleString('fr-FR')} m³` : '—'} />
              <DetailRow label="Voyage" value={cargo.voyage_code ?? '—'} />
              <DetailRow label="Expediteur" value={cargo.sender_name ?? '—'} />
              <DetailRow label="Destinataire" value={cargo.receiver_name ?? '—'} />
              <DetailRow label="Description" value={cargo.description ?? '—'} />
              <DetailRow label="Notes" value={cargo.notes ?? '—'} />
              {cargo.received_at && <DetailRow label="Recu le" value={new Date(cargo.received_at).toLocaleString('fr-FR')} />}
              <DetailRow label="Cree le" value={new Date(cargo.created_at).toLocaleDateString('fr-FR')} />
            </FormSection>

            {/* Package elements */}
            <FormSection title={`Elements du colis (${packageElements?.length ?? 0})`} collapsible defaultExpanded>
              {packageElements && packageElements.length > 0 ? (
                <div className="space-y-1.5">
                  {packageElements.map((el) => (
                    <div key={el.id} className="flex items-center gap-3 p-2 rounded-lg border border-border/60 bg-card">
                      <Box size={14} className="text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-foreground truncate">{el.description}</p>
                        <p className="text-xs text-muted-foreground">
                          Qte: {el.quantity}{el.weight_kg ? ` • ${el.weight_kg} kg` : ''}{el.sap_code ? ` • SAP: ${el.sap_code}` : ''}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : <p className="text-xs text-muted-foreground py-2">Aucun element.</p>}
            </FormSection>

            {/* SAP match tool */}
            <FormSection title="Matching SAP" collapsible defaultExpanded={false}>
              <div className="flex gap-2 items-end">
                <div className="flex-1">
                  <p className="text-[10px] text-muted-foreground mb-1">Recherche par description</p>
                  <button
                    className="gl-button-sm gl-button-default text-xs inline-flex items-center gap-1"
                    onClick={() => { if (cargo.description) sapMatch.mutate(cargo.description) }}
                    disabled={sapMatch.isPending || !cargo.description}
                  >
                    {sapMatch.isPending ? <Loader2 size={10} className="animate-spin" /> : <Search size={10} />}
                    Rechercher SAP
                  </button>
                </div>
              </div>
              {sapMatch.data && (
                <div className="mt-2 p-2 rounded border border-border bg-muted/30">
                  {sapMatch.data.matched ? (
                    <p className="text-xs text-foreground">
                      <span className="font-mono font-medium">{sapMatch.data.sap_code}</span>
                      {' — '}{sapMatch.data.description}
                      {' '}({Math.round(sapMatch.data.confidence * 100)}% confiance)
                    </p>
                  ) : <p className="text-xs text-muted-foreground">Aucun article SAP correspondant.</p>}
                </div>
              )}
            </FormSection>

            {/* Status history placeholder */}
            <FormSection title="Historique statut" collapsible defaultExpanded={false}>
              <p className="text-xs text-muted-foreground py-2">L'historique des changements de statut sera affiche ici.</p>
            </FormSection>

            {/* Attachments (photos/documents) */}
            <FormSection title="Fichiers joints" collapsible defaultExpanded={false}>
              <div className="space-y-3">
                <AttachmentManager ownerType="cargo_item" ownerId={cargo.id} compact />
              </div>
            </FormSection>
          </>
        )}
      </PanelContentLayout>
    </DynamicPanelShell>
  )
}

// ══════════════════════════════════════════════════════════════
// ── PANEL RENDERER REGISTRY ──────────────────────────────────
// ══════════════════════════════════════════════════════════════

registerPanelRenderer('travelwiz', (view) => {
  if (view.type === 'create') {
    if (view.meta?.subtype === 'voyage') return <CreateVoyagePanel />
    if (view.meta?.subtype === 'vector') return <CreateVectorPanel />
    if (view.meta?.subtype === 'cargo') return <CreateCargoPanel />
    if (view.meta?.subtype === 'article') return <CreateArticlePanel />
  }
  if (view.type === 'detail' && 'id' in view) {
    if (view.meta?.subtype === 'voyage') return <VoyageDetailPanel id={view.id} />
    if (view.meta?.subtype === 'vector') return <VectorDetailPanel id={view.id} />
    if (view.meta?.subtype === 'cargo') return <CargoDetailPanel id={view.id} />
  }
  return null
})
