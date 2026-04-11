import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { ColumnDef } from '@tanstack/react-table'
import {
  AlertTriangle,
  Boxes,
  FileDown,
  FileText,
  LayoutDashboard,
  Package,
  Plus,
  ScanSearch,
  Search,
  Truck,
} from 'lucide-react'
import { PanelHeader, PanelContent, ToolbarButton } from '@/components/layout/PanelHeader'
import { renderRegisteredPanel } from '@/components/layout/DetachedPanelRenderer'
import { ModuleDashboard } from '@/components/dashboard/ModuleDashboard'
import { TabBar } from '@/components/ui/Tabs'
import { DataTable } from '@/components/ui/DataTable/DataTable'
import { useToast } from '@/components/ui/Toast'
import { usePageSize } from '@/hooks/usePageSize'
import { useDebounce } from '@/hooks/useDebounce'
import { usePermission } from '@/hooks/usePermission'
import { useAllManifests } from '@/hooks/useTravelWiz'
import { registerPanelRenderer } from '@/components/layout/DetachedPanelRenderer'
import {
  usePackLogArticles,
  usePackLogCargo,
  usePackLogCargoItem,
  usePackLogCargoRequests,
  useReceivePackLogCargo,
  usePackLogSapMatch,
  useImportPackLogArticlesCsv,
  useUpdatePackLogCargoStatus,
} from '@/hooks/usePackLog'
import { useUIStore } from '@/stores/uiStore'
import { CargoWorkspaceProvider } from '@/pages/packlog/packlogWorkspace'
import { CreateArticlePanel, PackLogArticleDetailPanel } from '@/pages/packlog/PackLogArticlePanels'
import { CreateCargoPanel, CreateCargoRequestPanel } from '@/pages/packlog/PackLogCreatePanels'
import { CargoRequestDetailPanel } from '@/pages/packlog/PackLogRequestDetailPanel'
import { CargoDetailPanel } from '@/pages/packlog/PackLogCargoDetailPanel'
import type { CargoItem, CargoRequest, Manifest, TravelArticle } from '@/types/api'

type PackLogTab = 'dashboard' | 'requests' | 'cargo' | 'catalog' | 'tracking' | 'alerts'

type AlertRow = {
  kind: 'request' | 'cargo'
  id: string
  reference: string
  label: string
  alert: string
  status: string
  created_at: string
}

const TABS: { id: PackLogTab; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'requests', label: 'Demandes', icon: FileText },
  { id: 'cargo', label: 'Colis', icon: Package },
  { id: 'catalog', label: 'Catalogue SAP', icon: Boxes },
  { id: 'tracking', label: 'Tracking', icon: ScanSearch },
  { id: 'alerts', label: 'Alertes', icon: AlertTriangle },
]

registerPanelRenderer('packlog', (view) => {
  if (view.type === 'create') {
    if (view.meta?.subtype === 'cargo-request') return <CargoWorkspaceProvider module="packlog" label="PackLog"><CreateCargoRequestPanel /></CargoWorkspaceProvider>
    if (view.meta?.subtype === 'cargo') return <CargoWorkspaceProvider module="packlog" label="PackLog"><CreateCargoPanel /></CargoWorkspaceProvider>
    if (view.meta?.subtype === 'article') return <CargoWorkspaceProvider module="packlog" label="PackLog"><CreateArticlePanel /></CargoWorkspaceProvider>
  }
  if (view.type === 'detail' && 'id' in view) {
    if (view.meta?.subtype === 'cargo-request') return <CargoWorkspaceProvider module="packlog" label="PackLog"><CargoRequestDetailPanel id={view.id} /></CargoWorkspaceProvider>
    if (view.meta?.subtype === 'cargo') return <CargoWorkspaceProvider module="packlog" label="PackLog"><CargoDetailPanel id={view.id} /></CargoWorkspaceProvider>
    if (view.meta?.subtype === 'article') return <CargoWorkspaceProvider module="packlog" label="PackLog"><PackLogArticleDetailPanel id={view.id} /></CargoWorkspaceProvider>
  }
  return null
})

const REQUEST_STATUS_OPTIONS = [
  { value: '', label: 'Tous' },
  { value: 'draft', label: 'Brouillon' },
  { value: 'submitted', label: 'Soumis' },
  { value: 'approved', label: 'Approuvés' },
  { value: 'assigned', label: 'Affectés' },
  { value: 'in_progress', label: 'En cours' },
  { value: 'closed', label: 'Clôturés' },
]

const CARGO_STATUS_OPTIONS = [
  { value: '', label: 'Tous' },
  { value: 'registered', label: 'Enregistrés' },
  { value: 'ready', label: 'Prêts' },
  { value: 'loaded', label: 'Chargés' },
  { value: 'in_transit', label: 'En transit' },
  { value: 'delivered_final', label: 'Livrés' },
  { value: 'damaged', label: 'Endommagés' },
  { value: 'missing', label: 'Manquants' },
]

function formatDateShort(value: string | null | undefined) {
  if (!value) return '—'
  try {
    return new Date(value).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
  } catch {
    return value
  }
}

function formatDateTimeShort(value: string | null | undefined) {
  if (!value) return '—'
  try {
    return new Date(value).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
  } catch {
    return value
  }
}

function parsePackLogScanValue(raw: string): { kind: 'cargo-id' | 'request-id' | 'tracking'; value: string } | null {
  const value = raw.trim()
  if (!value) return null
  try {
    const url = new URL(value)
    const cargoId = url.searchParams.get('cargo')
    if (cargoId) return { kind: 'cargo-id', value: cargoId }
    const requestId = url.searchParams.get('request')
    if (requestId) return { kind: 'request-id', value: requestId }
    const publicCargoMatch = url.pathname.match(/\/public\/cargo\/([^/]+)$/)
    if (publicCargoMatch?.[1]) return { kind: 'tracking', value: decodeURIComponent(publicCargoMatch[1]) }
  } catch {
    // Not a URL, continue with raw parsing.
  }
  return { kind: 'tracking', value }
}

function buildAlerts(requests: CargoRequest[], cargo: CargoItem[]): AlertRow[] {
  const requestAlerts = requests
    .filter((request) => !request.is_ready_for_submission)
    .map((request) => ({
      kind: 'request' as const,
      id: request.id,
      reference: request.request_code,
      label: request.title,
      alert: request.missing_requirements.length > 0 ? 'Dossier incomplet' : 'Demande à vérifier',
      status: request.status,
      created_at: request.created_at,
    }))

  const cargoAlerts = cargo
    .filter((item) => item.status === 'missing' || item.status === 'damaged' || ((item.status === 'registered' || item.status === 'ready') && (Date.now() - new Date(item.created_at).getTime()) > 72 * 3600 * 1000))
    .map((item) => ({
      kind: 'cargo' as const,
      id: item.id,
      reference: item.tracking_code,
      label: item.designation || item.description,
      alert:
        item.status === 'missing'
          ? 'Colis manquant'
          : item.status === 'damaged'
            ? 'Colis endommagé'
            : 'Retard de traitement',
      status: item.status,
      created_at: item.created_at,
    }))

  return [...requestAlerts, ...cargoAlerts]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
}

function RequestsTab() {
  const openDynamicPanel = useUIStore((s) => s.openDynamicPanel)
  const [page, setPage] = useState(1)
  const { pageSize } = usePageSize()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const debouncedSearch = useDebounce(search, 250)
  const { data, isLoading } = usePackLogCargoRequests({ page, page_size: pageSize, search: debouncedSearch || undefined, status: status || undefined })
  const items = data?.items ?? []
  const stats = useMemo(() => ({
    total: data?.total ?? 0,
    ready: items.filter((item) => item.is_ready_for_submission).length,
    blocked: items.filter((item) => !item.is_ready_for_submission).length,
    submitted: items.filter((item) => item.status === 'submitted').length,
  }), [data?.total, items])

  const columns = useMemo<ColumnDef<CargoRequest, unknown>[]>(() => [
    { accessorKey: 'request_code', header: 'Référence', cell: ({ row }) => <span className="font-mono text-xs text-foreground">{row.original.request_code}</span> },
    { accessorKey: 'title', header: 'Intitulé', cell: ({ row }) => <span className="font-medium text-foreground">{row.original.title}</span> },
    { id: 'sender', header: 'Expéditeur', cell: ({ row }) => <span className="text-xs text-muted-foreground">{row.original.sender_name ?? '—'}</span> },
    { id: 'destination', header: 'Destination', cell: ({ row }) => <span className="text-xs text-muted-foreground">{row.original.destination_name ?? row.original.receiver_name ?? '—'}</span> },
    { id: 'cargo_count', header: 'Colis', cell: ({ row }) => <span className="text-xs text-foreground">{row.original.cargo_count}</span> },
    { id: 'status', header: 'Statut', cell: ({ row }) => <span className="gl-badge gl-badge-neutral">{row.original.status}</span> },
    { id: 'readiness', header: 'Complétude', cell: ({ row }) => <span className={row.original.is_ready_for_submission ? 'text-emerald-600 text-xs font-medium' : 'text-amber-600 text-xs font-medium'}>{row.original.is_ready_for_submission ? 'Prête' : 'À compléter'}</span> },
    { id: 'created_at', header: 'Créée le', cell: ({ row }) => <span className="text-xs text-muted-foreground">{formatDateShort(row.original.created_at)}</span> },
  ], [])

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="grid gap-3 border-b border-border px-4 py-3 md:grid-cols-4">
        <div className="rounded-lg border border-border/60 bg-card px-3 py-2"><p className="text-[10px] uppercase tracking-wide text-muted-foreground">Demandes</p><p className="mt-1 text-lg font-semibold text-foreground">{stats.total}</p></div>
        <div className="rounded-lg border border-border/60 bg-card px-3 py-2"><p className="text-[10px] uppercase tracking-wide text-muted-foreground">Prêtes</p><p className="mt-1 text-lg font-semibold text-emerald-600">{stats.ready}</p></div>
        <div className="rounded-lg border border-border/60 bg-card px-3 py-2"><p className="text-[10px] uppercase tracking-wide text-muted-foreground">Bloquées</p><p className="mt-1 text-lg font-semibold text-amber-600">{stats.blocked}</p></div>
        <div className="rounded-lg border border-border/60 bg-card px-3 py-2"><p className="text-[10px] uppercase tracking-wide text-muted-foreground">Soumises</p><p className="mt-1 text-lg font-semibold text-foreground">{stats.submitted}</p></div>
      </div>
      <div className="flex items-center gap-2 border-b border-border px-4 py-2">
        <div className="flex flex-wrap gap-1">
          {REQUEST_STATUS_OPTIONS.map((option) => (
            <button
              key={option.value || 'all'}
              className={status === option.value ? 'gl-button-sm gl-button-default' : 'gl-button-sm gl-button-default opacity-70 hover:opacity-100'}
              onClick={() => { setStatus(option.value); setPage(1) }}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
      <PanelContent>
        <DataTable<CargoRequest>
          columns={columns}
          data={items}
          isLoading={isLoading}
          pagination={data ? { page: data.page, pageSize, total: data.total, pages: data.pages } : undefined}
          onPaginationChange={setPage}
          searchValue={search}
          onSearchChange={(value) => { setSearch(value); setPage(1) }}
          searchPlaceholder="Rechercher par référence, titre, expéditeur..."
          onRowClick={(row) => openDynamicPanel({ type: 'detail', module: 'packlog', id: row.id, meta: { subtype: 'cargo-request' } })}
          emptyIcon={FileText}
          emptyTitle="Aucune demande"
          storageKey="packlog-requests"
        />
      </PanelContent>
    </div>
  )
}

function CargoTab() {
  const openDynamicPanel = useUIStore((s) => s.openDynamicPanel)
  const [page, setPage] = useState(1)
  const { pageSize } = usePageSize()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const debouncedSearch = useDebounce(search, 250)
  const { data, isLoading } = usePackLogCargo({ page, page_size: pageSize, search: debouncedSearch || undefined, status: status || undefined })
  const items = data?.items ?? []
  const stats = useMemo(() => ({
    total: data?.total ?? 0,
    inTransit: items.filter((item) => item.status === 'in_transit').length,
    delivered: items.filter((item) => item.status === 'delivered_final').length,
    incidents: items.filter((item) => item.status === 'damaged' || item.status === 'missing').length,
  }), [data?.total, items])

  const columns = useMemo<ColumnDef<CargoItem, unknown>[]>(() => [
    { accessorKey: 'tracking_code', header: 'Tracking', cell: ({ row }) => <span className="font-mono text-xs text-foreground">{row.original.tracking_code}</span> },
    { id: 'designation', header: 'Colis', cell: ({ row }) => <span className="font-medium text-foreground">{row.original.designation || row.original.description}</span> },
    { id: 'request', header: 'Demande', cell: ({ row }) => <span className="text-xs text-muted-foreground">{row.original.request_code ?? '—'}</span> },
    { id: 'destination', header: 'Destination', cell: ({ row }) => <span className="text-xs text-muted-foreground">{row.original.destination_name ?? row.original.receiver_name ?? '—'}</span> },
    { id: 'weight', header: 'Poids', cell: ({ row }) => <span className="text-xs text-foreground">{row.original.weight_kg.toLocaleString('fr-FR')} kg</span> },
    { id: 'status', header: 'Statut', cell: ({ row }) => <span className="gl-badge gl-badge-neutral">{row.original.status}</span> },
    { id: 'created_at', header: 'Créé le', cell: ({ row }) => <span className="text-xs text-muted-foreground">{formatDateShort(row.original.created_at)}</span> },
  ], [])

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="grid gap-3 border-b border-border px-4 py-3 md:grid-cols-4">
        <div className="rounded-lg border border-border/60 bg-card px-3 py-2"><p className="text-[10px] uppercase tracking-wide text-muted-foreground">Colis</p><p className="mt-1 text-lg font-semibold text-foreground">{stats.total}</p></div>
        <div className="rounded-lg border border-border/60 bg-card px-3 py-2"><p className="text-[10px] uppercase tracking-wide text-muted-foreground">En transit</p><p className="mt-1 text-lg font-semibold text-foreground">{stats.inTransit}</p></div>
        <div className="rounded-lg border border-border/60 bg-card px-3 py-2"><p className="text-[10px] uppercase tracking-wide text-muted-foreground">Livrés</p><p className="mt-1 text-lg font-semibold text-emerald-600">{stats.delivered}</p></div>
        <div className="rounded-lg border border-border/60 bg-card px-3 py-2"><p className="text-[10px] uppercase tracking-wide text-muted-foreground">Incidents</p><p className="mt-1 text-lg font-semibold text-destructive">{stats.incidents}</p></div>
      </div>
      <div className="flex items-center gap-2 border-b border-border px-4 py-2">
        <div className="flex flex-wrap gap-1">
          {CARGO_STATUS_OPTIONS.map((option) => (
            <button
              key={option.value || 'all'}
              className={status === option.value ? 'gl-button-sm gl-button-default' : 'gl-button-sm gl-button-default opacity-70 hover:opacity-100'}
              onClick={() => { setStatus(option.value); setPage(1) }}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
      <PanelContent>
        <DataTable<CargoItem>
          columns={columns}
          data={items}
          isLoading={isLoading}
          pagination={data ? { page: data.page, pageSize, total: data.total, pages: data.pages } : undefined}
          onPaginationChange={setPage}
          searchValue={search}
          onSearchChange={(value) => { setSearch(value); setPage(1) }}
          searchPlaceholder="Rechercher par tracking, description, demande..."
          onRowClick={(row) => openDynamicPanel({ type: 'detail', module: 'packlog', id: row.id, meta: { subtype: 'cargo' } })}
          emptyIcon={Package}
          emptyTitle="Aucun colis"
          storageKey="packlog-cargo"
        />
      </PanelContent>
    </div>
  )
}

function CatalogTab() {
  const openDynamicPanel = useUIStore((s) => s.openDynamicPanel)
  const { toast } = useToast()
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [page, setPage] = useState(1)
  const { pageSize } = usePageSize()
  const [search, setSearch] = useState('')
  const [sapQuery, setSapQuery] = useState('')
  const debouncedSearch = useDebounce(search, 250)
  const { data, isLoading } = usePackLogArticles({ page, page_size: pageSize, search: debouncedSearch || undefined })
  const sapMatch = usePackLogSapMatch()
  const importCsv = useImportPackLogArticlesCsv()
  const items = data?.items ?? []

  const columns = useMemo<ColumnDef<TravelArticle, unknown>[]>(() => [
    { accessorKey: 'sap_code', header: 'Code SAP', cell: ({ row }) => <span className="font-mono text-xs text-foreground">{row.original.sap_code}</span> },
    { accessorKey: 'description', header: 'Description', cell: ({ row }) => <span className="font-medium text-foreground">{row.original.description}</span> },
    { id: 'management_type', header: 'Gestion', cell: ({ row }) => <span className="text-xs text-muted-foreground">{row.original.management_type ?? '—'}</span> },
    { id: 'packaging', header: 'Conditionnement', cell: ({ row }) => <span className="text-xs text-muted-foreground">{row.original.packaging ?? '—'}</span> },
    { id: 'hazmat', header: 'HAZMAT', cell: ({ row }) => <span className={row.original.is_hazmat ? 'text-destructive text-xs font-medium' : 'text-muted-foreground text-xs'}>{row.original.is_hazmat ? (row.original.hazmat_class ?? 'Oui') : 'Non'}</span> },
  ], [])

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="grid gap-3 border-b border-border px-4 py-3 md:grid-cols-[minmax(0,1fr)_320px]">
        <div className="rounded-lg border border-border/60 bg-card px-3 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <ToolbarButton icon={Plus} label="Nouvel article" onClick={() => openDynamicPanel({ type: 'create', module: 'packlog', meta: { subtype: 'article' } })} />
            <ToolbarButton icon={FileDown} label={importCsv.isPending ? 'Import en cours…' : 'Importer CSV'} onClick={() => fileInputRef.current?.click()} disabled={importCsv.isPending} />
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={async (event) => {
              const file = event.target.files?.[0]
              if (!file) return
              try {
                const result = await importCsv.mutateAsync(file)
                toast({ title: `Import terminé: ${result.imported} créés, ${result.updated} mis à jour`, variant: result.errors.length ? 'warning' : 'success' })
              } catch {
                toast({ title: 'Erreur lors de l’import CSV du catalogue SAP', variant: 'error' })
              } finally {
                event.target.value = ''
              }
            }}
          />
        </div>
        <div className="rounded-lg border border-border/60 bg-card px-3 py-3">
          <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Recherche intelligente SAP</p>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={sapQuery}
              onChange={(event) => setSapQuery(event.target.value)}
              className="gl-form-input"
              placeholder="Décrire un colis ou un article..."
            />
            <button className="gl-button-sm gl-button-default" onClick={() => sapQuery.trim() && sapMatch.mutate(sapQuery.trim())} disabled={sapMatch.isPending}>
              {sapMatch.isPending ? '...' : <Search size={12} />}
            </button>
          </div>
          {sapMatch.data && (
            <div className="mt-2 rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-xs">
              {sapMatch.data.matched
                ? <span className="text-foreground"><span className="font-mono">{sapMatch.data.sap_code}</span> — {sapMatch.data.description} ({Math.round(sapMatch.data.confidence * 100)}%)</span>
                : <span className="text-muted-foreground">Aucun match satisfaisant.</span>}
            </div>
          )}
        </div>
      </div>
      <PanelContent>
        <DataTable<TravelArticle>
          columns={columns}
          data={items}
          isLoading={isLoading}
          pagination={data ? { page: data.page, pageSize, total: data.total, pages: data.pages } : undefined}
          onPaginationChange={setPage}
          searchValue={search}
          onSearchChange={(value) => { setSearch(value); setPage(1) }}
          searchPlaceholder="Rechercher par code SAP ou description..."
          onRowClick={(row) => openDynamicPanel({ type: 'detail', module: 'packlog', id: row.id, meta: { subtype: 'article' } })}
          emptyIcon={Boxes}
          emptyTitle="Aucun article SAP"
          storageKey="packlog-catalog"
        />
      </PanelContent>
    </div>
  )
}

function TrackingTab() {
  const openDynamicPanel = useUIStore((s) => s.openDynamicPanel)
  const { toast } = useToast()
  const [page, setPage] = useState(1)
  const { pageSize } = usePageSize()
  const [search, setSearch] = useState('')
  const [scanInput, setScanInput] = useState('')
  const [scanTracking, setScanTracking] = useState('')
  const [scannedCargoId, setScannedCargoId] = useState<string | null>(null)
  const debouncedSearch = useDebounce(search, 250)
  const debouncedScan = useDebounce(scanTracking, 150)
  const { data, isLoading } = usePackLogCargo({ page, page_size: pageSize, search: debouncedSearch || undefined })
  const { data: manifestsData } = useAllManifests({ page: 1, page_size: 100 })
  const { data: scannedCargo } = usePackLogCargoItem(scannedCargoId ?? undefined)
  const { data: scanMatches, isLoading: isScanLoading } = usePackLogCargo({
    page: 1,
    page_size: 8,
    search: debouncedScan || undefined,
  })
  const receiveCargo = useReceivePackLogCargo()
  const updateCargoStatus = useUpdatePackLogCargoStatus()
  const items = data?.items ?? []
  const stats = useMemo(() => ({
    tracked: items.length,
    assigned: items.filter((item) => Boolean(item.voyage_code)).length,
    received: items.filter((item) => Boolean(item.received_at)).length,
  }), [items])
  const manifestGroups = useMemo(() => {
    const manifests = (manifestsData?.items ?? []).filter((manifest) => manifest.manifest_type === 'cargo')
    const manifestMap = new Map<string, Manifest>(manifests.map((manifest) => [manifest.id, manifest]))
    const grouped = items
      .filter((item) => item.manifest_id)
      .reduce<Map<string, CargoItem[]>>((acc, item) => {
        const key = item.manifest_id!
        const current = acc.get(key) ?? []
        current.push(item)
        acc.set(key, current)
        return acc
      }, new Map())
    return Array.from(grouped.entries())
      .map(([manifestId, manifestCargo]) => ({
        manifest: manifestMap.get(manifestId) ?? null,
        manifestId,
        items: manifestCargo.sort((a, b) => a.tracking_code.localeCompare(b.tracking_code)),
      }))
      .sort((a, b) => {
        const aDate = a.manifest?.created_at ? new Date(a.manifest.created_at).getTime() : 0
        const bDate = b.manifest?.created_at ? new Date(b.manifest.created_at).getTime() : 0
        return bDate - aDate
      })
  }, [items, manifestsData?.items])
  const scanCandidates = scanMatches?.items ?? []
  const quickTarget = scannedCargo ?? scanCandidates[0] ?? null

  async function handleQuickStatus(status: 'received' | 'damaged' | 'missing') {
    if (!quickTarget) return
    try {
      if (status === 'received') {
        await receiveCargo.mutateAsync({ id: quickTarget.id, payload: { notes: 'Réception terrain via scan PackLog' } })
      } else {
        await updateCargoStatus.mutateAsync({ id: quickTarget.id, status })
      }
      toast({
        title:
          status === 'received'
            ? `Colis ${quickTarget.tracking_code} déclaré reçu`
            : status === 'damaged'
              ? `Colis ${quickTarget.tracking_code} déclaré endommagé`
              : `Colis ${quickTarget.tracking_code} déclaré manquant`,
        variant: status === 'received' ? 'success' : 'warning',
      })
    } catch {
      toast({ title: 'Impossible de mettre à jour ce colis depuis le mode scan.', variant: 'error' })
    }
  }

  function handleScanSubmit() {
    const parsed = parsePackLogScanValue(scanInput)
    if (!parsed) return
    if (parsed.kind === 'cargo-id') {
      setScannedCargoId(parsed.value)
      setScanTracking('')
      openDynamicPanel({ type: 'detail', module: 'packlog', id: parsed.value, meta: { subtype: 'cargo' } })
      return
    }
    if (parsed.kind === 'request-id') {
      setScannedCargoId(null)
      setScanTracking('')
      openDynamicPanel({ type: 'detail', module: 'packlog', id: parsed.value, meta: { subtype: 'cargo-request' } })
      return
    }
    setScannedCargoId(null)
    setScanTracking(parsed.value)
  }

  const columns = useMemo<ColumnDef<CargoItem, unknown>[]>(() => [
    { accessorKey: 'tracking_code', header: 'Tracking', cell: ({ row }) => <span className="font-mono text-xs text-foreground">{row.original.tracking_code}</span> },
    { id: 'description', header: 'Colis', cell: ({ row }) => <span className="font-medium text-foreground">{row.original.designation || row.original.description}</span> },
    { id: 'status', header: 'Statut', cell: ({ row }) => <span className="gl-badge gl-badge-neutral">{row.original.status}</span> },
    { id: 'voyage', header: 'Voyage', cell: ({ row }) => <span className="text-xs text-muted-foreground">{row.original.voyage_code ?? '—'}</span> },
    { id: 'received_at', header: 'Dernier point', cell: ({ row }) => <span className="text-xs text-muted-foreground">{formatDateTimeShort(row.original.received_at ?? row.original.created_at)}</span> },
  ], [])

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="grid gap-3 border-b border-border px-4 py-3 md:grid-cols-3">
        <div className="rounded-lg border border-border/60 bg-card px-3 py-2"><p className="text-[10px] uppercase tracking-wide text-muted-foreground">Suivis visibles</p><p className="mt-1 text-lg font-semibold text-foreground">{stats.tracked}</p></div>
        <div className="rounded-lg border border-border/60 bg-card px-3 py-2"><p className="text-[10px] uppercase tracking-wide text-muted-foreground">Affectés à un voyage</p><p className="mt-1 text-lg font-semibold text-foreground">{stats.assigned}</p></div>
        <div className="rounded-lg border border-border/60 bg-card px-3 py-2"><p className="text-[10px] uppercase tracking-wide text-muted-foreground">Reçus</p><p className="mt-1 text-lg font-semibold text-emerald-600">{stats.received}</p></div>
      </div>
      <div className="border-b border-border px-4 py-3">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
          <div className="rounded-lg border border-border/60 bg-card px-3 py-3">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Réception scan</p>
            <div className="mt-2 flex gap-2">
              <input
                type="text"
                value={scanInput}
                onChange={(event) => setScanInput(event.target.value)}
                onKeyDown={(event) => { if (event.key === 'Enter') handleScanSubmit() }}
                className="gl-form-input"
                placeholder="Coller un QR, un lien PackLog ou un tracking"
              />
              <button className="gl-button-sm gl-button-default" onClick={handleScanSubmit}>
                Scanner
              </button>
            </div>
            {quickTarget && (
              <div className="mt-3 rounded-lg border border-border/60 bg-muted/20 px-3 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-mono text-xs text-foreground">{quickTarget.tracking_code}</p>
                    <p className="mt-1 text-sm font-medium text-foreground">{quickTarget.designation || quickTarget.description}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {quickTarget.request_code ?? 'Sans demande'} · {quickTarget.destination_name ?? quickTarget.receiver_name ?? 'Destination non renseignée'}
                    </p>
                  </div>
                  <span className="gl-badge gl-badge-neutral">{quickTarget.status}</span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button className="gl-button-sm gl-button-default" onClick={() => handleQuickStatus('received')} disabled={receiveCargo.isPending}>
                    Déclarer reçu
                  </button>
                  <button className="gl-button-sm gl-button-default" onClick={() => handleQuickStatus('damaged')} disabled={updateCargoStatus.isPending}>
                    Endommagé
                  </button>
                  <button className="gl-button-sm gl-button-default" onClick={() => handleQuickStatus('missing')} disabled={updateCargoStatus.isPending}>
                    Manquant
                  </button>
                  <button className="gl-button-sm gl-button-default" onClick={() => openDynamicPanel({ type: 'detail', module: 'packlog', id: quickTarget.id, meta: { subtype: 'cargo' } })}>
                    Ouvrir la fiche
                  </button>
                </div>
              </div>
            )}
          </div>
          <div className="rounded-lg border border-border/60 bg-card px-3 py-3">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Résultats de scan</p>
            <div className="mt-2 space-y-2">
              {isScanLoading && debouncedScan ? (
                <p className="text-xs text-muted-foreground">Recherche en cours…</p>
              ) : scanCandidates.length > 0 ? (
                scanCandidates.map((item) => (
                  <button
                    key={item.id}
                    className="flex w-full items-center justify-between rounded-lg border border-border/60 px-3 py-2 text-left hover:bg-muted/20"
                    onClick={() => openDynamicPanel({ type: 'detail', module: 'packlog', id: item.id, meta: { subtype: 'cargo' } })}
                  >
                    <div>
                      <p className="font-mono text-xs text-foreground">{item.tracking_code}</p>
                      <p className="mt-1 text-sm font-medium text-foreground">{item.designation || item.description}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{item.request_code ?? '—'} · {item.voyage_code ?? 'Hors voyage'}</p>
                    </div>
                    <span className="gl-badge gl-badge-neutral">{item.status}</span>
                  </button>
                ))
              ) : (
                <p className="text-xs text-muted-foreground">Scanne un QR ou colle un tracking pour retrouver un colis et agir rapidement dessus.</p>
              )}
            </div>
          </div>
        </div>
        <div className="mt-3 rounded-lg border border-border/60 bg-card px-3 py-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Réception par manifeste</p>
            <span className="text-xs text-muted-foreground">{manifestGroups.length} manifeste(s) cargo</span>
          </div>
          <div className="mt-3 space-y-3">
            {manifestGroups.length > 0 ? (
              manifestGroups.map((group) => {
                const receivedCount = group.items.filter((item) => Boolean(item.received_at) || item.status === 'delivered_final').length
                return (
                  <div key={group.manifestId} className="rounded-lg border border-border/60 px-3 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium text-foreground">{group.manifest?.reference || group.manifestId}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Voyage {group.items[0]?.voyage_code ?? '—'} · {receivedCount}/{group.items.length} reçu(s)
                        </p>
                      </div>
                      <span className="gl-badge gl-badge-neutral">{group.manifest?.status ?? 'draft'}</span>
                    </div>
                    <div className="mt-3 space-y-2">
                      {group.items.slice(0, 8).map((item) => (
                        <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/50 px-2 py-2">
                          <div className="min-w-0">
                            <p className="font-mono text-xs text-foreground">{item.tracking_code}</p>
                            <p className="truncate text-sm text-foreground">{item.designation || item.description}</p>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="gl-badge gl-badge-neutral">{item.status}</span>
                            <button className="gl-button-sm gl-button-default" onClick={() => receiveCargo.mutate({ id: item.id, payload: { notes: 'Réception manifeste PackLog' } })} disabled={receiveCargo.isPending}>
                              Reçu
                            </button>
                            <button className="gl-button-sm gl-button-default" onClick={() => updateCargoStatus.mutate({ id: item.id, status: 'damaged' })} disabled={updateCargoStatus.isPending}>
                              Endommagé
                            </button>
                            <button className="gl-button-sm gl-button-default" onClick={() => openDynamicPanel({ type: 'detail', module: 'packlog', id: item.id, meta: { subtype: 'cargo' } })}>
                              Ouvrir
                            </button>
                          </div>
                        </div>
                      ))}
                      {group.items.length > 8 && (
                        <p className="text-xs text-muted-foreground">+{group.items.length - 8} autre(s) colis dans ce manifeste.</p>
                      )}
                    </div>
                  </div>
                )
              })
            ) : (
              <p className="text-xs text-muted-foreground">Aucun manifeste cargo chargé pour le moment.</p>
            )}
          </div>
        </div>
      </div>
      <PanelContent>
        <DataTable<CargoItem>
          columns={columns}
          data={items}
          isLoading={isLoading}
          pagination={data ? { page: data.page, pageSize, total: data.total, pages: data.pages } : undefined}
          onPaginationChange={setPage}
          searchValue={search}
          onSearchChange={(value) => { setSearch(value); setPage(1) }}
          searchPlaceholder="Rechercher par tracking, voyage, destination..."
          onRowClick={(row) => openDynamicPanel({ type: 'detail', module: 'packlog', id: row.id, meta: { subtype: 'cargo' } })}
          emptyIcon={Truck}
          emptyTitle="Aucun suivi"
          storageKey="packlog-tracking"
        />
      </PanelContent>
    </div>
  )
}

function AlertsTab() {
  const openDynamicPanel = useUIStore((s) => s.openDynamicPanel)
  const { data: requestsData } = usePackLogCargoRequests({ page: 1, page_size: 100 })
  const { data: cargoData } = usePackLogCargo({ page: 1, page_size: 200 })
  const alerts = useMemo(() => buildAlerts(requestsData?.items ?? [], cargoData?.items ?? []), [cargoData?.items, requestsData?.items])

  const columns = useMemo<ColumnDef<AlertRow, unknown>[]>(() => [
    { accessorKey: 'reference', header: 'Référence', cell: ({ row }) => <span className="font-mono text-xs text-foreground">{row.original.reference}</span> },
    { accessorKey: 'label', header: 'Objet', cell: ({ row }) => <span className="font-medium text-foreground">{row.original.label}</span> },
    { accessorKey: 'alert', header: 'Alerte', cell: ({ row }) => <span className="text-xs font-medium text-destructive">{row.original.alert}</span> },
    { accessorKey: 'status', header: 'Statut', cell: ({ row }) => <span className="text-xs text-muted-foreground">{row.original.status}</span> },
    { accessorKey: 'created_at', header: 'Détectée le', cell: ({ row }) => <span className="text-xs text-muted-foreground">{formatDateShort(row.original.created_at)}</span> },
  ], [])

  return (
    <PanelContent>
      <DataTable<AlertRow>
        columns={columns}
        data={alerts}
        isLoading={false}
        onRowClick={(row) => openDynamicPanel({ type: 'detail', module: 'packlog', id: row.id, meta: { subtype: row.kind === 'request' ? 'cargo-request' : 'cargo' } })}
        emptyIcon={AlertTriangle}
        emptyTitle="Aucune alerte"
        storageKey="packlog-alerts"
      />
    </PanelContent>
  )
}

export function PackLogPage() {
  const dynamicPanel = useUIStore((s) => s.dynamicPanel)
  const panelMode = useUIStore((s) => s.dynamicPanelMode)
  const openDynamicPanel = useUIStore((s) => s.openDynamicPanel)
  const { hasPermission } = usePermission()
  const [searchParams, setSearchParams] = useSearchParams()
  const [activeTab, setActiveTab] = useState<PackLogTab>('dashboard')
  const { data: requestsSummary } = usePackLogCargoRequests({ page: 1, page_size: 1 })
  const { data: cargoSummary } = usePackLogCargo({ page: 1, page_size: 1 })
  const { data: articlesSummary } = usePackLogArticles({ page: 1, page_size: 1 })
  const { data: requestAlertsSummary } = usePackLogCargoRequests({ page: 1, page_size: 100 })
  const { data: cargoAlertsSummary } = usePackLogCargo({ page: 1, page_size: 200 })

  const isFullPanel = panelMode === 'full' && dynamicPanel !== null && dynamicPanel.module === 'packlog'
  const canCreateRequest = hasPermission('packlog.cargo.create')
  const requestId = searchParams.get('request')
  const cargoId = searchParams.get('cargo')

  useEffect(() => {
    if (requestId && dynamicPanel?.module !== 'packlog') {
      setActiveTab('requests')
      openDynamicPanel({ type: 'detail', module: 'packlog', id: requestId, meta: { subtype: 'cargo-request' } })
      const next = new URLSearchParams(searchParams)
      next.delete('request')
      setSearchParams(next, { replace: true })
      return
    }
    if (cargoId && dynamicPanel?.module !== 'packlog') {
      setActiveTab('cargo')
      openDynamicPanel({ type: 'detail', module: 'packlog', id: cargoId, meta: { subtype: 'cargo' } })
      const next = new URLSearchParams(searchParams)
      next.delete('cargo')
      setSearchParams(next, { replace: true })
    }
  }, [cargoId, dynamicPanel?.module, openDynamicPanel, requestId, searchParams, setSearchParams])

  const tabItems = useMemo(() => TABS.map((tab) => ({
    ...tab,
    badge:
      tab.id === 'requests' ? requestsSummary?.total
        : tab.id === 'cargo' ? cargoSummary?.total
          : tab.id === 'catalog' ? articlesSummary?.total
            : tab.id === 'alerts' ? buildAlerts(requestAlertsSummary?.items ?? [], cargoAlertsSummary?.items ?? []).length
            : undefined,
  })), [articlesSummary?.total, cargoAlertsSummary?.items, cargoSummary?.total, requestAlertsSummary?.items, requestsSummary?.total])

  return (
    <CargoWorkspaceProvider module="packlog" label="PackLog">
      <div className="flex h-full">
        {!isFullPanel && (
          <div className="flex flex-1 min-w-0 flex-col overflow-hidden">
            <PanelHeader icon={Package} title="PackLog" subtitle="Demandes d’expédition, colis, catalogue SAP et tracking">
              {canCreateRequest && activeTab === 'requests' && (
                <ToolbarButton
                  icon={FileText}
                  label="Nouvelle demande"
                  onClick={() => openDynamicPanel({ type: 'create', module: 'packlog', meta: { subtype: 'cargo-request' } })}
                />
              )}
              {canCreateRequest && activeTab === 'cargo' && (
                <ToolbarButton
                  icon={Plus}
                  label="Nouveau colis"
                  onClick={() => openDynamicPanel({ type: 'create', module: 'packlog', meta: { subtype: 'cargo' } })}
                />
              )}
            </PanelHeader>

            <div className="shrink-0 border-b border-border px-3 py-2">
              <TabBar items={tabItems} activeId={activeTab} onTabChange={setActiveTab} />
            </div>

            {activeTab === 'dashboard' && <ModuleDashboard module="packlog" />}
            {activeTab === 'requests' && <RequestsTab />}
            {activeTab === 'cargo' && <CargoTab />}
            {activeTab === 'catalog' && <CatalogTab />}
            {activeTab === 'tracking' && <TrackingTab />}
            {activeTab === 'alerts' && <AlertsTab />}
          </div>
        )}

        {dynamicPanel?.module === 'packlog' && renderRegisteredPanel(dynamicPanel)}
      </div>
    </CargoWorkspaceProvider>
  )
}
