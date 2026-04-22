import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
import { PageNavBar } from '@/components/ui/Tabs'
import { DataTable } from '@/components/ui/DataTable/DataTable'
import { useToast } from '@/components/ui/Toast'
import { usePageSize } from '@/hooks/usePageSize'
import { useDebounce } from '@/hooks/useDebounce'
import { useDictionaryLabels, useDictionaryOptions } from '@/hooks/useDictionary'
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
import { useTranslation } from 'react-i18next'
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

const TAB_DEFS: { id: PackLogTab; labelKey: string; icon: typeof LayoutDashboard }[] = [
  { id: 'dashboard', labelKey: 'packlog.tabs.dashboard', icon: LayoutDashboard },
  { id: 'requests', labelKey: 'packlog.tabs.requests', icon: FileText },
  { id: 'cargo', labelKey: 'packlog.tabs.cargo', icon: Package },
  { id: 'catalog', labelKey: 'packlog.tabs.catalog', icon: Boxes },
  { id: 'tracking', labelKey: 'packlog.tabs.tracking', icon: ScanSearch },
  { id: 'alerts', labelKey: 'packlog.tabs.alerts', icon: AlertTriangle },
]

/** Shared StatCard for PackLog tabs — uniform across modules. */
function StatCard({ label, value, accent }: { label: string; value: string | number; accent?: string }) {
  return (
    <div className="group relative rounded-xl border border-border/70 bg-gradient-to-br from-background to-background/60 p-3 overflow-hidden transition-all hover:-translate-y-0.5 hover:shadow-md hover:border-border">
      <div className="absolute inset-x-0 top-0 h-[2px] rounded-t-xl bg-gradient-to-r from-primary/80 to-highlight/40" />
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`mt-1 text-xl font-bold tabular-nums font-display tracking-tight ${accent ?? 'text-foreground'}`}>{value}</p>
    </div>
  )
}

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

function formatDateShort(value: string | null | undefined, locale = 'fr-FR') {
  if (!value) return '—'
  try {
    return new Date(value).toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric' })
  } catch {
    return value
  }
}

function formatDateTimeShort(value: string | null | undefined, locale = 'fr-FR') {
  if (!value) return '—'
  try {
    return new Date(value).toLocaleString(locale, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
  } catch {
    return value
  }
}

function isCargoReceivedLike(item: Pick<CargoItem, 'status' | 'received_at'>) {
  return Boolean(item.received_at) || item.status === 'delivered_final'
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
  const { t, i18n } = useTranslation()
  const openDynamicPanel = useUIStore((s) => s.openDynamicPanel)
  const [page, setPage] = useState(1)
  const { pageSize } = usePageSize()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const locale = i18n.language?.startsWith('fr') ? 'fr-FR' : 'en-US'
  const requestStatusOptions = useDictionaryOptions('packlog_cargo_request_status')
  const requestStatusLabels = useDictionaryLabels('packlog_cargo_request_status')
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
    { accessorKey: 'request_code', header: t('packlog.requests.columns.reference'), cell: ({ row }) => <span className="font-mono text-xs text-foreground">{row.original.request_code}</span> },
    { accessorKey: 'title', header: t('packlog.requests.columns.title'), cell: ({ row }) => <span className="font-medium text-foreground">{row.original.title}</span> },
    { id: 'sender', header: t('packlog.requests.columns.sender'), cell: ({ row }) => <span className="text-xs text-muted-foreground">{row.original.sender_name ?? '—'}</span> },
    { id: 'destination', header: t('packlog.requests.columns.destination'), cell: ({ row }) => <span className="text-xs text-muted-foreground">{row.original.destination_name ?? row.original.receiver_name ?? '—'}</span> },
    { id: 'cargo_count', header: t('packlog.requests.columns.cargo_count'), cell: ({ row }) => <span className="text-xs text-foreground">{row.original.cargo_count}</span> },
    { id: 'status', header: t('packlog.requests.columns.status'), cell: ({ row }) => <span className="gl-badge gl-badge-neutral">{requestStatusLabels[row.original.status] ?? row.original.status}</span> },
    { id: 'readiness', header: t('packlog.requests.columns.readiness'), cell: ({ row }) => <span className={row.original.is_ready_for_submission ? 'text-emerald-600 text-xs font-medium' : 'text-amber-600 text-xs font-medium'}>{row.original.is_ready_for_submission ? t('packlog.requests.readiness.ready') : t('packlog.requests.readiness.pending')}</span> },
    { id: 'created_at', header: t('packlog.requests.columns.created_at'), cell: ({ row }) => <span className="text-xs text-muted-foreground">{formatDateShort(row.original.created_at, locale)}</span> },
  ], [locale, requestStatusLabels, t])

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 px-4 py-3 border-b border-border">
        <StatCard label={t('packlog.requests.stats.total')} value={stats.total} />
        <StatCard label={t('packlog.requests.stats.ready')} value={stats.ready} accent="text-emerald-600" />
        <StatCard label={t('packlog.requests.stats.blocked')} value={stats.blocked} accent="text-amber-600" />
        <StatCard label={t('packlog.requests.stats.submitted')} value={stats.submitted} />
      </div>
      {/* Status filter moved into the DataTable visual-search toolbar. */}
      <PanelContent scroll={false}>
        <DataTable<CargoRequest>
          columns={columns}
          data={items}
          isLoading={isLoading}
          pagination={data ? { page: data.page, pageSize, total: data.total, pages: data.pages } : undefined}
          onPaginationChange={setPage}
          filters={[{
            id: 'status',
            label: t('packlog.requests.columns.status'),
            type: 'multi-select',
            operators: ['is', 'is_not'],
            options: requestStatusOptions.map((o) => ({ value: o.value, label: o.label })),
          }]}
          activeFilters={status ? { status: [status] } : {}}
          onFilterChange={(filterId, value) => {
            if (filterId !== 'status') return
            const arr = Array.isArray(value) ? value : value != null ? [value] : []
            setStatus(arr.length > 0 ? String(arr[0]) : '')
            setPage(1)
          }}
          searchValue={search}
          onSearchChange={(value) => { setSearch(value); setPage(1) }}
          searchPlaceholder={t('packlog.requests.search_placeholder')}
          onRowClick={(row) => openDynamicPanel({ type: 'detail', module: 'packlog', id: row.id, meta: { subtype: 'cargo-request' } })}
          emptyIcon={FileText}
          emptyTitle={t('packlog.requests.empty')}
          storageKey="packlog-requests"
        />
      </PanelContent>
    </div>
  )
}

function CargoTab() {
  const { t, i18n } = useTranslation()
  const openDynamicPanel = useUIStore((s) => s.openDynamicPanel)
  const [page, setPage] = useState(1)
  const { pageSize } = usePageSize()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const locale = i18n.language?.startsWith('fr') ? 'fr-FR' : 'en-US'
  const cargoStatusOptions = useDictionaryOptions('packlog_cargo_status')
  const cargoStatusLabels = useDictionaryLabels('packlog_cargo_status')
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
    { accessorKey: 'tracking_code', header: t('packlog.cargo.columns.tracking'), cell: ({ row }) => <span className="font-mono text-xs text-foreground">{row.original.tracking_code}</span> },
    { id: 'designation', header: t('packlog.cargo.columns.label'), cell: ({ row }) => <span className="font-medium text-foreground">{row.original.designation || row.original.description}</span> },
    { id: 'request', header: t('packlog.cargo.columns.request'), cell: ({ row }) => <span className="text-xs text-muted-foreground">{row.original.request_code ?? '—'}</span> },
    { id: 'destination', header: t('packlog.cargo.columns.destination'), cell: ({ row }) => <span className="text-xs text-muted-foreground">{row.original.destination_name ?? row.original.receiver_name ?? '—'}</span> },
    { id: 'weight', header: t('packlog.cargo.columns.weight'), cell: ({ row }) => <span className="text-xs text-foreground">{row.original.weight_kg.toLocaleString(locale)} kg</span> },
    { id: 'status', header: t('packlog.cargo.columns.status'), cell: ({ row }) => <span className="gl-badge gl-badge-neutral">{cargoStatusLabels[row.original.status] ?? row.original.status}</span> },
    { id: 'created_at', header: t('packlog.cargo.columns.created_at'), cell: ({ row }) => <span className="text-xs text-muted-foreground">{formatDateShort(row.original.created_at, locale)}</span> },
  ], [cargoStatusLabels, locale, t])

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 px-4 py-3 border-b border-border">
        <StatCard label={t('packlog.cargo.stats.total')} value={stats.total} />
        <StatCard label={t('packlog.cargo.stats.in_transit')} value={stats.inTransit} />
        <StatCard label={t('packlog.cargo.stats.delivered')} value={stats.delivered} accent="text-emerald-600" />
        <StatCard label={t('packlog.cargo.stats.incidents')} value={stats.incidents} accent="text-destructive" />
      </div>
      {/* Status filter moved into the DataTable visual-search toolbar
          (token-based, collapses into a chip when active). The previous
          always-on row of 15 status chips dominated the page vertically
          and made users filter via buttons rather than the unified
          search bar pattern used elsewhere. */}
      <PanelContent scroll={false}>
        <DataTable<CargoItem>
          columns={columns}
          data={items}
          isLoading={isLoading}
          pagination={data ? { page: data.page, pageSize, total: data.total, pages: data.pages } : undefined}
          onPaginationChange={setPage}
          searchValue={search}
          onSearchChange={(value) => { setSearch(value); setPage(1) }}
          searchPlaceholder={t('packlog.cargo.search_placeholder')}
          filters={[{
            id: 'status',
            label: t('packlog.cargo.columns.status'),
            type: 'multi-select',
            operators: ['is', 'is_not'],
            options: cargoStatusOptions.map((o) => ({ value: o.value, label: o.label })),
          }]}
          activeFilters={status ? { status: [status] } : {}}
          onFilterChange={(filterId, value) => {
            if (filterId !== 'status') return
            // Take the first selection when multi-select is collapsed to
            // a single-value backend param. If the user clears the token,
            // `value` is undefined — reset to ''.
            const arr = Array.isArray(value) ? value : value != null ? [value] : []
            setStatus(arr.length > 0 ? String(arr[0]) : '')
            setPage(1)
          }}
          onRowClick={(row) => openDynamicPanel({ type: 'detail', module: 'packlog', id: row.id, meta: { subtype: 'cargo' } })}
          emptyIcon={Package}
          emptyTitle={t('packlog.cargo.empty')}
          storageKey="packlog-cargo"
        />
      </PanelContent>
    </div>
  )
}

function CatalogTab() {
  const { t } = useTranslation()
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
    { accessorKey: 'sap_code', header: t('packlog.catalog.columns.sap_code'), cell: ({ row }) => <span className="font-mono text-xs text-foreground">{row.original.sap_code}</span> },
    { accessorKey: 'description', header: t('packlog.catalog.columns.description'), cell: ({ row }) => <span className="font-medium text-foreground">{row.original.description}</span> },
    { id: 'management_type', header: t('packlog.catalog.columns.management_type'), cell: ({ row }) => <span className="text-xs text-muted-foreground">{row.original.management_type ?? '—'}</span> },
    { id: 'packaging', header: t('packlog.catalog.columns.packaging'), cell: ({ row }) => <span className="text-xs text-muted-foreground">{row.original.packaging ?? '—'}</span> },
    { id: 'hazmat', header: t('packlog.catalog.columns.hazmat'), cell: ({ row }) => <span className={row.original.is_hazmat ? 'text-destructive text-xs font-medium' : 'text-muted-foreground text-xs'}>{row.original.is_hazmat ? (row.original.hazmat_class ?? t('packlog.catalog.hazmat_yes')) : t('packlog.catalog.hazmat_no')}</span> },
  ], [t])

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="grid gap-3 border-b border-border px-4 py-3 md:grid-cols-[minmax(0,1fr)_320px]">
        <div className="rounded-lg border border-border/60 bg-card px-3 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <ToolbarButton icon={Plus} label={t('packlog.actions.new_article')} onClick={() => openDynamicPanel({ type: 'create', module: 'packlog', meta: { subtype: 'article' } })} />
            <ToolbarButton icon={FileDown} label={importCsv.isPending ? t('packlog.actions.import_csv_running') : t('packlog.actions.import_csv')} onClick={() => fileInputRef.current?.click()} disabled={importCsv.isPending} />
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
                toast({ title: t('packlog.toast.csv_import_success', { imported: result.imported, updated: result.updated }), variant: result.errors.length ? 'warning' : 'success' })
              } catch {
                toast({ title: t('packlog.toast.csv_import_error'), variant: 'error' })
              } finally {
                event.target.value = ''
              }
            }}
          />
        </div>
        <div className="rounded-lg border border-border/60 bg-card px-3 py-3">
          <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{t('packlog.catalog.smart_search.title')}</p>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={sapQuery}
              onChange={(event) => setSapQuery(event.target.value)}
              className="gl-form-input"
              placeholder={t('packlog.catalog.smart_search.placeholder')}
            />
            <button className="gl-button-sm gl-button-default" onClick={() => sapQuery.trim() && sapMatch.mutate(sapQuery.trim())} disabled={sapMatch.isPending}>
              {sapMatch.isPending ? '...' : <Search size={12} />}
            </button>
          </div>
          {sapMatch.data && (
            <div className="mt-2 rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-xs">
              {sapMatch.data.matched
                ? <span className="text-foreground"><span className="font-mono">{sapMatch.data.sap_code}</span> — {sapMatch.data.description} ({Math.round(sapMatch.data.confidence * 100)}%)</span>
                : <span className="text-muted-foreground">{t('packlog.catalog.smart_search.no_match')}</span>}
            </div>
          )}
        </div>
      </div>
      <PanelContent scroll={false}>
        <DataTable<TravelArticle>
          columns={columns}
          data={items}
          isLoading={isLoading}
          pagination={data ? { page: data.page, pageSize, total: data.total, pages: data.pages } : undefined}
          onPaginationChange={setPage}
          searchValue={search}
          onSearchChange={(value) => { setSearch(value); setPage(1) }}
          searchPlaceholder={t('packlog.catalog.search_placeholder')}
          onRowClick={(row) => openDynamicPanel({ type: 'detail', module: 'packlog', id: row.id, meta: { subtype: 'article' } })}
          emptyIcon={Boxes}
          emptyTitle={t('packlog.catalog.empty_sap')}
          storageKey="packlog-catalog"
        />
      </PanelContent>
    </div>
  )
}

type TrackingSubView = 'manifests' | 'cargo'

function TrackingTab() {
  const { t, i18n } = useTranslation()
  const openDynamicPanel = useUIStore((s) => s.openDynamicPanel)
  const { toast } = useToast()
  const [page, setPage] = useState(1)
  const { pageSize } = usePageSize()
  const [search, setSearch] = useState('')
  const [scanInput, setScanInput] = useState('')
  const [scanTracking, setScanTracking] = useState('')
  const [scannedCargoId, setScannedCargoId] = useState<string | null>(null)
  const [subView, setSubView] = useState<TrackingSubView>('manifests')
  const debouncedSearch = useDebounce(search, 250)
  const debouncedScan = useDebounce(scanTracking, 150)
  const { data, isLoading } = usePackLogCargo({ page, page_size: pageSize, search: debouncedSearch || undefined })
  const { data: manifestsData } = useAllManifests({ page: 1, page_size: 100 })
  const { data: scannedCargo } = usePackLogCargoItem(scannedCargoId ?? undefined)
  const { data: scanMatches, isLoading: isScanLoading } = usePackLogCargo({
    page: 1,
    page_size: 6,
    search: debouncedScan || undefined,
  })
  const locale = i18n.language?.startsWith('fr') ? 'fr-FR' : 'en-US'
  const cargoStatusLabels = useDictionaryLabels('packlog_cargo_status')
  const receiveCargo = useReceivePackLogCargo()
  const updateCargoStatus = useUpdatePackLogCargoStatus()
  // Per-row mutation tracking: prevents a mutation on cargo A from greying
  // out the action buttons on cargoes B, C, D (shared isPending bug).
  const [pendingCargoId, setPendingCargoId] = useState<string | null>(null)
  const items = data?.items ?? []
  const stats = useMemo(() => ({
    tracked: items.length,
    assigned: items.filter((item) => Boolean(item.voyage_code)).length,
    received: items.filter((item) => isCargoReceivedLike(item)).length,
    pendingReceipt: items.filter((item) => item.status === 'in_transit' || item.status === 'delivered_intermediate').length,
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
        actionableItems: manifestCargo
          .filter((item) => !isCargoReceivedLike(item))
          .sort((a, b) => a.tracking_code.localeCompare(b.tracking_code)),
      }))
      .filter((group) => group.items.length > 0)
      .sort((a, b) => {
        const actionableDelta = b.actionableItems.length - a.actionableItems.length
        if (actionableDelta !== 0) return actionableDelta
        const aDate = a.manifest?.created_at ? new Date(a.manifest.created_at).getTime() : 0
        const bDate = b.manifest?.created_at ? new Date(b.manifest.created_at).getTime() : 0
        return bDate - aDate
      })
  }, [items, manifestsData?.items])
  const scanCandidates = scanMatches?.items ?? []
  const exactScanCandidate = useMemo(() => {
    const query = scanTracking.trim().toLowerCase()
    if (!query) return null
    return scanCandidates.find((item) => {
      const tracking = item.tracking_code.trim().toLowerCase()
      return tracking === query
    }) ?? null
  }, [scanCandidates, scanTracking])
  const quickTarget = scannedCargo ?? exactScanCandidate ?? scanCandidates[0] ?? null

  async function handleManifestQuickStatus(item: CargoItem, status: 'received' | 'damaged' | 'missing') {
    setPendingCargoId(item.id)
    try {
      if (status === 'received') {
        await receiveCargo.mutateAsync({ id: item.id, payload: { notes: 'Réception manifeste PackLog' } })
      } else {
        await updateCargoStatus.mutateAsync({ id: item.id, status })
      }
      toast({
        title:
          status === 'received'
            ? t('packlog.tracking.toasts.received', { tracking: item.tracking_code })
            : status === 'damaged'
              ? t('packlog.tracking.toasts.damaged', { tracking: item.tracking_code })
              : t('packlog.tracking.toasts.missing', { tracking: item.tracking_code }),
        variant: status === 'received' ? 'success' : 'warning',
      })
    } catch {
      toast({ title: t('packlog.tracking.toasts.update_error'), variant: 'error' })
    } finally {
      setPendingCargoId(null)
    }
  }

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
            ? t('packlog.tracking.toasts.received', { tracking: quickTarget.tracking_code })
            : status === 'damaged'
              ? t('packlog.tracking.toasts.damaged', { tracking: quickTarget.tracking_code })
              : t('packlog.tracking.toasts.missing', { tracking: quickTarget.tracking_code }),
        variant: status === 'received' ? 'success' : 'warning',
      })
    } catch {
      toast({ title: t('packlog.tracking.toasts.scan_update_error'), variant: 'error' })
    }
  }

  function handleScanSubmit() {
    const parsed = parsePackLogScanValue(scanInput)
    if (!parsed) return
    if (parsed.kind === 'cargo-id') {
      setScannedCargoId(parsed.value)
      setScanTracking('')
      setScanInput('')
      openDynamicPanel({ type: 'detail', module: 'packlog', id: parsed.value, meta: { subtype: 'cargo' } })
      return
    }
    if (parsed.kind === 'request-id') {
      setScannedCargoId(null)
      setScanTracking('')
      setScanInput('')
      openDynamicPanel({ type: 'detail', module: 'packlog', id: parsed.value, meta: { subtype: 'cargo-request' } })
      return
    }
    setScannedCargoId(null)
    setScanTracking(parsed.value)
    setScanInput(parsed.value)
  }

  const columns = useMemo<ColumnDef<CargoItem, unknown>[]>(() => [
    { accessorKey: 'tracking_code', header: t('packlog.tracking.columns.tracking'), cell: ({ row }) => <span className="font-mono text-xs text-foreground">{row.original.tracking_code}</span> },
    { id: 'description', header: t('packlog.tracking.columns.cargo'), cell: ({ row }) => <span className="font-medium text-foreground">{row.original.designation || row.original.description}</span> },
    { id: 'status', header: t('packlog.tracking.columns.status'), cell: ({ row }) => <span className="gl-badge gl-badge-neutral">{cargoStatusLabels[row.original.status] ?? row.original.status}</span> },
    { id: 'voyage', header: t('packlog.tracking.columns.voyage'), cell: ({ row }) => <span className="text-xs text-muted-foreground">{row.original.voyage_code ?? '—'}</span> },
    { id: 'received_at', header: t('packlog.tracking.columns.last_event'), cell: ({ row }) => <span className="text-xs text-muted-foreground">{formatDateTimeShort(row.original.received_at ?? row.original.created_at, locale)}</span> },
  ], [cargoStatusLabels, locale, t])

  const pendingManifests = manifestGroups.filter((group) => group.actionableItems.length > 0)

  // Compact stat pill — much tighter than the card variant so the
  // tracking UI leaves room for the actual working area below.
  const StatPill = ({ label, value, accent }: { label: string; value: number; accent?: string }) => (
    <div className="flex items-baseline gap-2 px-3 py-1.5 rounded-md border border-border/60 bg-card">
      <span className={`text-base font-bold tabular-nums font-display ${accent ?? 'text-foreground'}`}>{value}</span>
      <span className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</span>
    </div>
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* ── Compact stats strip ───────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2 px-4 py-2 border-b border-border">
        <StatPill label={t('packlog.tracking.stats.tracked')} value={stats.tracked} />
        <StatPill label={t('packlog.tracking.stats.assigned')} value={stats.assigned} />
        <StatPill label={t('packlog.tracking.stats.received')} value={stats.received} accent="text-emerald-600" />
        <StatPill label={t('packlog.tracking.stats.pending_receipt')} value={stats.pendingReceipt} accent="text-amber-600" />
      </div>

      {/* ── Two-column working area ──────────────────────── */}
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {/* LEFT rail — persistent field scanner */}
        <aside className="shrink-0 lg:w-[340px] border-b lg:border-b-0 lg:border-r border-border bg-muted/10 flex flex-col">
          <div className="px-4 py-3 border-b border-border/60 flex items-center gap-2">
            <ScanSearch size={14} className="text-primary" />
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{t('packlog.tracking.scan.title')}</p>
          </div>
          <div className="px-4 py-3 space-y-3 overflow-y-auto">
            <div className="flex gap-2">
              <input
                type="text"
                value={scanInput}
                onChange={(event) => setScanInput(event.target.value)}
                onKeyDown={(event) => { if (event.key === 'Enter') handleScanSubmit() }}
                className="gl-form-input"
                placeholder={t('packlog.tracking.scan.placeholder')}
                autoFocus
              />
              <button className="gl-button-sm gl-button-default" onClick={handleScanSubmit}>
                {t('packlog.tracking.scan.action')}
              </button>
            </div>

            {/* Quick action target — highlighted result */}
            {quickTarget && (
              <div className="rounded-lg border border-primary/40 bg-primary/5 px-3 py-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-[11px] text-foreground truncate">{quickTarget.tracking_code}</p>
                    <p className="mt-0.5 text-sm font-medium text-foreground truncate">{quickTarget.designation || quickTarget.description}</p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground truncate">
                      {quickTarget.request_code ?? t('packlog.tracking.scan.no_request')} · {quickTarget.destination_name ?? quickTarget.receiver_name ?? t('packlog.tracking.scan.no_destination')}
                    </p>
                  </div>
                  <span className="gl-badge gl-badge-neutral shrink-0">{cargoStatusLabels[quickTarget.status] ?? quickTarget.status}</span>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-1.5">
                  <button className="gl-button-sm gl-button-confirm" onClick={() => handleQuickStatus('received')} disabled={receiveCargo.isPending || isCargoReceivedLike(quickTarget)}>
                    {t('packlog.tracking.actions.receive')}
                  </button>
                  <button className="gl-button-sm gl-button-default" onClick={() => openDynamicPanel({ type: 'detail', module: 'packlog', id: quickTarget.id, meta: { subtype: 'cargo' } })}>
                    {t('packlog.tracking.actions.open')}
                  </button>
                  <button className="gl-button-sm gl-button-default" onClick={() => handleQuickStatus('damaged')} disabled={updateCargoStatus.isPending || isCargoReceivedLike(quickTarget)}>
                    {t('packlog.tracking.actions.damaged')}
                  </button>
                  <button className="gl-button-sm gl-button-default" onClick={() => handleQuickStatus('missing')} disabled={updateCargoStatus.isPending || isCargoReceivedLike(quickTarget)}>
                    {t('packlog.tracking.actions.missing')}
                  </button>
                </div>
              </div>
            )}

            {/* Type-ahead candidates — only when user typed & no exact match */}
            {debouncedScan && !quickTarget && (
              <div className="space-y-1.5">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{t('packlog.tracking.scan_results.title')}</p>
                {isScanLoading ? (
                  <p className="text-xs text-muted-foreground">{t('packlog.tracking.scan_results.loading')}</p>
                ) : scanCandidates.length > 0 ? (
                  scanCandidates.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className="flex w-full items-start justify-between gap-2 text-left rounded-md border border-border/60 bg-background px-2.5 py-2 hover:bg-chrome hover:border-border transition-colors cursor-pointer"
                      onClick={() => openDynamicPanel({ type: 'detail', module: 'packlog', id: item.id, meta: { subtype: 'cargo' } })}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-mono text-[11px] text-foreground truncate">{item.tracking_code}</p>
                        <p className="mt-0.5 text-xs font-medium text-foreground truncate">{item.designation || item.description}</p>
                      </div>
                      <span className="gl-badge gl-badge-neutral shrink-0 text-[10px]">{cargoStatusLabels[item.status] ?? item.status}</span>
                    </button>
                  ))
                ) : (
                  <p className="text-xs text-muted-foreground">{t('packlog.tracking.scan_results.empty')}</p>
                )}
              </div>
            )}
          </div>
        </aside>

        {/* RIGHT main — sub-nav + view */}
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex items-center gap-1 px-4 pt-2 border-b border-border">
            <button
              type="button"
              className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${subView === 'manifests' ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
              onClick={() => setSubView('manifests')}
            >
              {t('packlog.tracking.manifests.title')}
              {pendingManifests.length > 0 && (
                <span className="ml-2 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 text-[10px] font-semibold">
                  {pendingManifests.length}
                </span>
              )}
            </button>
            <button
              type="button"
              className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${subView === 'cargo' ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
              onClick={() => setSubView('cargo')}
            >
              {t('packlog.tracking.stats.tracked')}
            </button>
          </div>

          {subView === 'manifests' ? (
            <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-3">
              {pendingManifests.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border/60 px-4 py-8 text-center">
                  <p className="text-sm text-muted-foreground">{t('packlog.tracking.manifests.empty')}</p>
                </div>
              ) : (
                pendingManifests.map((group) => {
                  const receivedCount = group.items.filter((item) => isCargoReceivedLike(item)).length
                  return (
                    <div key={group.manifestId} className="rounded-lg border border-border/70 bg-card overflow-hidden">
                      <div className="flex items-start justify-between gap-3 px-3 py-2.5 border-b border-border/60 bg-muted/20">
                        <div className="min-w-0">
                          <p className="font-medium text-foreground truncate">{group.manifest?.reference || group.manifestId}</p>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {t('packlog.tracking.manifests.summary', { voyage: group.items[0]?.voyage_code ?? '—', received: receivedCount, total: group.items.length, pending: group.actionableItems.length })}
                          </p>
                        </div>
                        <span className="gl-badge gl-badge-neutral shrink-0">{group.manifest?.status ?? 'draft'}</span>
                      </div>
                      <div className="divide-y divide-border/50">
                        {group.actionableItems.slice(0, 8).map((item) => (
                          <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                            <div className="min-w-0 flex-1">
                              <p className="font-mono text-[11px] text-foreground">{item.tracking_code}</p>
                              <p className="truncate text-sm text-foreground">{item.designation || item.description}</p>
                            </div>
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="gl-badge gl-badge-neutral">{cargoStatusLabels[item.status] ?? item.status}</span>
                              <button className="gl-button-sm gl-button-confirm" onClick={() => handleManifestQuickStatus(item, 'received')} disabled={pendingCargoId === item.id}>
                                {t('packlog.tracking.actions.receive')}
                              </button>
                              <button className="gl-button-sm gl-button-default" onClick={() => handleManifestQuickStatus(item, 'damaged')} disabled={pendingCargoId === item.id}>
                                {t('packlog.tracking.actions.damaged')}
                              </button>
                              <button className="gl-button-sm gl-button-default" onClick={() => handleManifestQuickStatus(item, 'missing')} disabled={pendingCargoId === item.id}>
                                {t('packlog.tracking.actions.missing')}
                              </button>
                              <button className="gl-button-sm gl-button-default" onClick={() => openDynamicPanel({ type: 'detail', module: 'packlog', id: item.id, meta: { subtype: 'cargo' } })}>
                                {t('packlog.tracking.actions.open')}
                              </button>
                            </div>
                          </div>
                        ))}
                        {group.actionableItems.length > 8 && (
                          <p className="px-3 py-2 text-xs text-muted-foreground">
                            {t('packlog.tracking.manifests.more_pending', { count: group.actionableItems.length - 8 })}
                          </p>
                        )}
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          ) : (
            <PanelContent scroll={false}>
              <DataTable<CargoItem>
                columns={columns}
                data={items}
                isLoading={isLoading}
                pagination={data ? { page: data.page, pageSize, total: data.total, pages: data.pages } : undefined}
                onPaginationChange={setPage}
                searchValue={search}
                onSearchChange={(value) => { setSearch(value); setPage(1) }}
                searchPlaceholder={t('packlog.tracking.search_placeholder')}
                onRowClick={(row) => openDynamicPanel({ type: 'detail', module: 'packlog', id: row.id, meta: { subtype: 'cargo' } })}
                emptyIcon={Truck}
                emptyTitle={t('packlog.tracking.empty')}
                storageKey="packlog-tracking"
              />
            </PanelContent>
          )}
        </div>
      </div>
    </div>
  )
}

function AlertsTab() {
  const { t } = useTranslation()
  const openDynamicPanel = useUIStore((s) => s.openDynamicPanel)
  const { data: requestsData } = usePackLogCargoRequests({ page: 1, page_size: 100 })
  const { data: cargoData } = usePackLogCargo({ page: 1, page_size: 200 })
  const alerts = useMemo(() => buildAlerts(requestsData?.items ?? [], cargoData?.items ?? []), [cargoData?.items, requestsData?.items])

  const columns = useMemo<ColumnDef<AlertRow, unknown>[]>(() => [
    { accessorKey: 'reference', header: t('packlog.alerts.columns.reference'), cell: ({ row }) => <span className="font-mono text-xs text-foreground">{row.original.reference}</span> },
    { accessorKey: 'label', header: t('packlog.alerts.columns.label'), cell: ({ row }) => <span className="font-medium text-foreground">{row.original.label}</span> },
    { accessorKey: 'alert', header: t('packlog.alerts.columns.alert'), cell: ({ row }) => <span className="text-xs font-medium text-destructive">{row.original.alert}</span> },
    { accessorKey: 'status', header: t('packlog.alerts.columns.status'), cell: ({ row }) => <span className="text-xs text-muted-foreground">{row.original.status}</span> },
    { accessorKey: 'created_at', header: t('packlog.alerts.columns.detected_at'), cell: ({ row }) => <span className="text-xs text-muted-foreground">{formatDateShort(row.original.created_at)}</span> },
  ], [])

  return (
    <PanelContent scroll={false}>
      <DataTable<AlertRow>
        columns={columns}
        data={alerts}
        isLoading={false}
        onRowClick={(row) => openDynamicPanel({ type: 'detail', module: 'packlog', id: row.id, meta: { subtype: row.kind === 'request' ? 'cargo-request' : 'cargo' } })}
        emptyIcon={AlertTriangle}
        emptyTitle={t('packlog.alerts.empty')}
        storageKey="packlog-alerts"
      />
    </PanelContent>
  )
}

const VALID_PL_TABS = new Set<PackLogTab>(['dashboard', 'requests', 'cargo', 'catalog', 'tracking', 'alerts'])

export function PackLogPage() {
  const { t } = useTranslation()
  const dynamicPanel = useUIStore((s) => s.dynamicPanel)
  const panelMode = useUIStore((s) => s.dynamicPanelMode)
  const openDynamicPanel = useUIStore((s) => s.openDynamicPanel)
  const { hasPermission } = usePermission()
  const [searchParams, setSearchParams] = useSearchParams()
  const tabFromUrl = searchParams.get('tab') as PackLogTab | null
  const [activeTab, setActiveTabRaw] = useState<PackLogTab>(
    tabFromUrl && VALID_PL_TABS.has(tabFromUrl) ? tabFromUrl : 'dashboard',
  )
  const setActiveTab = useCallback((tab: PackLogTab) => {
    setActiveTabRaw(tab)
    setSearchParams(tab === 'dashboard' ? {} : { tab }, { replace: true })
  }, [setSearchParams])
  const { data: requestsSummary } = usePackLogCargoRequests({ page: 1, page_size: 1 })
  const { data: cargoSummary } = usePackLogCargo({ page: 1, page_size: 1 })
  const { data: articlesSummary } = usePackLogArticles({ page: 1, page_size: 1 })
  const { data: requestAlertsSummary } = usePackLogCargoRequests({ page: 1, page_size: 100 })
  const { data: cargoAlertsSummary } = usePackLogCargo({ page: 1, page_size: 200 })

  const isFullPanel = panelMode === 'full' && dynamicPanel !== null && dynamicPanel.module === 'packlog'
  const canCreateRequest = hasPermission('packlog.cargo.create')
  const requestId = searchParams.get('request')
  const cargoId = searchParams.get('cargo')

  // Deep-link: ?request=<id> or ?cargo=<id> opens the right tab + detail panel
  useEffect(() => {
    if (requestId && dynamicPanel?.module !== 'packlog') {
      setActiveTabRaw('requests')
      openDynamicPanel({ type: 'detail', module: 'packlog', id: requestId, meta: { subtype: 'cargo-request' } })
      setSearchParams({ tab: 'requests' }, { replace: true })
      return
    }
    if (cargoId && dynamicPanel?.module !== 'packlog') {
      setActiveTabRaw('cargo')
      openDynamicPanel({ type: 'detail', module: 'packlog', id: cargoId, meta: { subtype: 'cargo' } })
      setSearchParams({ tab: 'cargo' }, { replace: true })
    }
  }, [cargoId, dynamicPanel?.module, openDynamicPanel, requestId, setSearchParams])

  const tabItems = useMemo(() => TAB_DEFS.map((tab) => ({
    id: tab.id,
    icon: tab.icon,
    label: t(tab.labelKey),
    badge:
      tab.id === 'requests' ? requestsSummary?.total
        : tab.id === 'cargo' ? cargoSummary?.total
          : tab.id === 'catalog' ? articlesSummary?.total
            : tab.id === 'alerts' ? buildAlerts(requestAlertsSummary?.items ?? [], cargoAlertsSummary?.items ?? []).length
            : undefined,
  })), [articlesSummary?.total, cargoAlertsSummary?.items, cargoSummary?.total, requestAlertsSummary?.items, requestsSummary?.total, t])

  return (
    <CargoWorkspaceProvider module="packlog" label="PackLog">
      <div className="flex h-full">
        {!isFullPanel && (
          <div className="flex flex-1 min-w-0 flex-col overflow-hidden">
            <PanelHeader icon={Package} title={t('packlog.title')} subtitle={t('packlog.subtitle')}>
              {canCreateRequest && activeTab === 'requests' && (
                <ToolbarButton
                  icon={FileText}
                  label={t('packlog.actions.new_request')}
                  onClick={() => openDynamicPanel({ type: 'create', module: 'packlog', meta: { subtype: 'cargo-request' } })}
                />
              )}
              {canCreateRequest && activeTab === 'cargo' && (
                <ToolbarButton
                  icon={Plus}
                  label={t('packlog.actions.new_cargo')}
                  onClick={() => openDynamicPanel({ type: 'create', module: 'packlog', meta: { subtype: 'cargo' } })}
                />
              )}
            </PanelHeader>

            <PageNavBar
              items={tabItems}
              activeId={activeTab}
              onTabChange={setActiveTab}
              rightSlot={activeTab === 'dashboard' ? <div id="dash-toolbar-packlog" /> : null}
            />

            <PanelContent scroll={activeTab === 'dashboard'}>
              {activeTab === 'dashboard' && <ModuleDashboard module="packlog" toolbarPortalId="dash-toolbar-packlog" />}
              {activeTab === 'requests' && <RequestsTab />}
              {activeTab === 'cargo' && <CargoTab />}
              {activeTab === 'catalog' && <CatalogTab />}
              {activeTab === 'tracking' && <TrackingTab />}
              {activeTab === 'alerts' && <AlertsTab />}
            </PanelContent>
          </div>
        )}

        {dynamicPanel?.module === 'packlog' && renderRegisteredPanel(dynamicPanel)}
      </div>
    </CargoWorkspaceProvider>
  )
}
