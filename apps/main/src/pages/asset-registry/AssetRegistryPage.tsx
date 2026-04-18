/**
 * Asset Registry — O&G Hierarchy page.
 *
 * Tabs: Fields | Sites | Installations | Equipment | Pipelines
 * Each tab shows a DataTable with Visual Search Query.
 * Row click opens DynamicPanel with detail/edit view.
 */
import { useState, useMemo, useCallback, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import {
  MapPin, Plus, Factory, Landmark, Layers, Ship, Wrench, Archive, LayoutDashboard, GitBranch, Coins,
} from 'lucide-react'
import { DataTable } from '@/components/ui/DataTable/DataTable'
import type { ColumnDef } from '@tanstack/react-table'
import type { DataTablePagination, DataTableFilterDef, DataTableBatchAction, ImportExportConfig } from '@/components/ui/DataTable/types'
import { cn } from '@/lib/utils'
import { PageNavBar } from '@/components/ui/Tabs'
import { useDebounce } from '@/hooks/useDebounce'
import { usePageSize } from '@/hooks/usePageSize'
import { PanelHeader, PanelContent, ToolbarButton } from '@/components/layout/PanelHeader'
import { usePermission } from '@/hooks/usePermission'
import { useUIStore } from '@/stores/uiStore'
import { useDictionaryOptions } from '@/hooks/useDictionary'
import { useToast } from '@/components/ui/Toast'
import { ErrorBoundary } from '@/components/ui/ErrorBoundary'
import {
  useFields,
  useSites,
  useInstallations,
  useEquipmentList,
  usePipelines,
  useDeleteField,
  useDeleteSite,
  useDeleteInstallation,
  useDeleteEquipment,
  useDeletePipeline,
} from '@/hooks/useAssetRegistry'
import type {
  OilField, OilSite, Installation, RegistryEquipment, RegistryPipeline,
} from '@/types/assetRegistry'

// Detail + Create panels
import { FieldDetailPanel, SiteDetailPanel, InstallationDetailPanel, EquipmentDetailPanel, PipelineDetailPanel } from './DetailPanels'
import { CreateFieldPanel, CreateSitePanel, CreateInstallationPanel, CreateEquipmentPanel, CreatePipelinePanel } from './CreatePanels'
import { ModuleDashboard } from '@/components/dashboard/ModuleDashboard'
import { AssetHierarchyTree } from './AssetHierarchyTree'


// ── Status badge helper ──────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  OPERATIONAL: 'gl-badge-success',
  STANDBY: 'gl-badge-warning',
  UNDER_CONSTRUCTION: 'gl-badge-info',
  SUSPENDED: 'gl-badge-neutral',
  DECOMMISSIONED: 'gl-badge-danger',
  ABANDONED: 'gl-badge-danger',
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={cn('gl-badge', STATUS_COLORS[status] || 'gl-badge-neutral')}>
      {status.replace(/_/g, ' ')}
    </span>
  )
}

// ── Shared filter options ─────────────────────────────────────

const STATUS_FILTER_OPTIONS = [
  { value: 'OPERATIONAL', label: 'Opérationnel' },
  { value: 'STANDBY', label: 'En attente' },
  { value: 'UNDER_CONSTRUCTION', label: 'En construction' },
  { value: 'SUSPENDED', label: 'Suspendu' },
  { value: 'DECOMMISSIONED', label: 'Décommissionné' },
  { value: 'ABANDONED', label: 'Abandonné' },
]

const ENVIRONMENT_FILTER_OPTIONS = [
  { value: 'ONSHORE', label: 'Onshore' },
  { value: 'OFFSHORE', label: 'Offshore' },
  { value: 'SWAMP', label: 'Swamp' },
  { value: 'SHALLOW_WATER', label: 'Shallow Water' },
  { value: 'DEEPWATER', label: 'Deepwater' },
  { value: 'SUBSEA', label: 'Subsea' },
]

const SITE_TYPE_OPTIONS = [
  { value: 'CPF', label: 'CPF' },
  { value: 'FPSO', label: 'FPSO' },
  { value: 'WELL_PAD', label: 'Well Pad' },
  { value: 'TERMINAL', label: 'Terminal' },
  { value: 'TANK_FARM', label: 'Tank Farm' },
  { value: 'CAMP', label: 'Camp' },
  { value: 'AIRSTRIP', label: 'Airstrip' },
  { value: 'JETTY', label: 'Jetty' },
  { value: 'OTHER', label: 'Autre' },
]

const INSTALLATION_TYPE_OPTIONS = [
  { value: 'JACKET_PLATFORM', label: 'Plateforme jacket' },
  { value: 'FIXED_PLATFORM', label: 'Plateforme fixe' },
  { value: 'FPSO', label: 'FPSO' },
  { value: 'CPF', label: 'CPF' },
  { value: 'WELL_PAD', label: 'Well Pad' },
  { value: 'TERMINAL', label: 'Terminal' },
  { value: 'TANK_FARM', label: 'Tank Farm' },
  { value: 'SUBSEA_TEMPLATE', label: 'Template subsea' },
  { value: 'BUOY', label: 'Bouée' },
  { value: 'OTHER', label: 'Autre' },
]

const PIPELINE_SERVICE_OPTIONS = [
  { value: 'GAS', label: 'Gaz' },
  { value: 'OIL', label: 'Huile' },
  { value: 'WATER', label: 'Eau' },
  { value: 'CONDENSATE', label: 'Condensat' },
  { value: 'MULTIPHASE', label: 'Multiphasique' },
  { value: 'CHEMICALS', label: 'Chimiques' },
  { value: 'OTHER', label: 'Autre' },
]

function useFilterState() {
  const [activeFilters, setActiveFilters] = useState<Record<string, unknown>>({})
  const handleFilterChange = useCallback((filterId: string, value: unknown) => {
    setActiveFilters((prev) => {
      const next = { ...prev }
      if (value === undefined || value === null) delete next[filterId]
      else next[filterId] = value
      return next
    })
  }, [])
  return { activeFilters, handleFilterChange }
}

function filterStr(filters: Record<string, unknown>, key: string): string | undefined {
  const v = filters[key]
  return typeof v === 'string' ? v : undefined
}

// ── Tab definitions ──────────────────────────────────────────

type TabKey = 'dashboard' | 'hierarchy' | 'fields' | 'sites' | 'installations' | 'equipment' | 'pipelines'

const TABS: { key: TabKey; icon: typeof MapPin; labelKey: string }[] = [
  { key: 'dashboard', icon: LayoutDashboard, labelKey: 'assets.dashboard_tab' },
  { key: 'hierarchy', icon: GitBranch, labelKey: 'assets.hierarchy' },
  { key: 'fields', icon: MapPin, labelKey: 'assets.fields' },
  { key: 'sites', icon: Landmark, labelKey: 'assets.sites' },
  { key: 'installations', icon: Factory, labelKey: 'assets.installations' },
  { key: 'equipment', icon: Wrench, labelKey: 'assets.equipment_tab' },
  { key: 'pipelines', icon: Ship, labelKey: 'assets.pipelines' },
]


// ════════════════════════════════════════════════════════════════
// FIELDS TAB
// ════════════════════════════════════════════════════════════════

function FieldsTab() {
  const { t } = useTranslation()
  const [page, setPage] = useState(1)
  const { pageSize } = usePageSize()
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search, 300)
  const { activeFilters, handleFilterChange } = useFilterState()
  const openDynamicPanel = useUIStore((s) => s.openDynamicPanel)
  const { hasPermission } = usePermission()
  const canDelete = hasPermission('asset.delete')
  const { toast } = useToast()
  const deleteField = useDeleteField()

  const { data, isLoading } = useFields({
    page, page_size: pageSize,
    search: debouncedSearch || undefined,
    status: filterStr(activeFilters, 'status'),
    environment: filterStr(activeFilters, 'environment'),
  })

  useEffect(() => { setPage(1) }, [debouncedSearch, activeFilters])

  const filters = useMemo<DataTableFilterDef[]>(() => [
    { id: 'status', label: t('common.status'), type: 'multi-select' as const, options: STATUS_FILTER_OPTIONS },
    { id: 'environment', label: t('assets.environment'), type: 'multi-select' as const, options: ENVIRONMENT_FILTER_OPTIONS },
  ], [t])

  const columns = useMemo<ColumnDef<OilField, unknown>[]>(() => [
    {
      accessorKey: 'code',
      header: t('common.code'),
      cell: ({ row }) => <span className="font-mono font-semibold text-foreground">{row.original.code}</span>,
    },
    {
      accessorKey: 'name',
      header: t('common.name'),
      cell: ({ row }) => <span className="text-foreground">{row.original.name}</span>,
    },
    {
      accessorKey: 'country',
      header: t('assets.country'),
      cell: ({ row }) => <span className="gl-badge gl-badge-neutral">{row.original.country}</span>,
    },
    {
      accessorKey: 'operator',
      header: t('assets.operator'),
    },
    {
      accessorKey: 'environment',
      header: t('assets.environment'),
      cell: ({ row }) => row.original.environment ? <span className="gl-badge gl-badge-info">{row.original.environment}</span> : '—',
    },
    {
      accessorKey: 'status',
      header: t('common.status'),
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
    },
  ], [t])

  const batchActions = useMemo<DataTableBatchAction<OilField>[]>(() => {
    const actions: DataTableBatchAction<OilField>[] = []
    if (canDelete) {
      actions.push({
        id: 'archive',
        label: t('common.archive'),
        icon: Archive,
        variant: 'danger',
        confirm: t('assets.confirm_archive_selected'),
        onAction: async (rows) => {
          for (const row of rows) {
            try { await deleteField.mutateAsync(row.id) } catch (e: any) {
              toast({ title: `${row.code}: ${e?.response?.data?.detail || t('common.error')}`, variant: 'error' })
            }
          }
          toast({ title: t('common.archived_count', { count: rows.length }), variant: 'success' })
        },
      })
    }
    return actions
  }, [canDelete, t, deleteField])

  const importExport = useMemo<ImportExportConfig>(() => ({
    exportFormats: ['csv', 'xlsx'],
    advancedExport: true,
    importWizardTarget: 'ar_field',
    filenamePrefix: 'champs',
  }), [])

  const pagination = useMemo<DataTablePagination>(() => ({
    page,
    pageSize,
    total: data?.total ?? 0,
    pages: data?.pages ?? 0,
  }), [page, pageSize, data])

  return (
    <DataTable
      columns={columns}
      data={data?.items ?? []}
      isLoading={isLoading}
      pagination={pagination}
      searchValue={search}
      onSearchChange={setSearch}
      searchPlaceholder={t('assets.search_fields')}
      filters={filters}
      activeFilters={activeFilters}
      onFilterChange={handleFilterChange}
      columnVisibility
      columnResizing
      selectable
      batchActions={batchActions}
      importExport={importExport}
      storageKey="ar-fields"
      onRowClick={(row) => openDynamicPanel({ type: 'detail', module: 'ar-field', id: row.id })}
      onPaginationChange={(p) => setPage(p)}
    />
  )
}


// ════════════════════════════════════════════════════════════════
// SITES TAB
// ════════════════════════════════════════════════════════════════

function SitesTab() {
  const { t } = useTranslation()
  const [page, setPage] = useState(1)
  const { pageSize } = usePageSize()
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search, 300)
  const { activeFilters, handleFilterChange } = useFilterState()
  const openDynamicPanel = useUIStore((s) => s.openDynamicPanel)
  const { hasPermission } = usePermission()
  const canDelete = hasPermission('asset.delete')
  const { toast } = useToast()
  const deleteSite = useDeleteSite()

  const { data, isLoading } = useSites({
    page, page_size: pageSize,
    search: debouncedSearch || undefined,
    status: filterStr(activeFilters, 'status'),
    site_type: filterStr(activeFilters, 'site_type'),
    environment: filterStr(activeFilters, 'environment'),
  })

  useEffect(() => { setPage(1) }, [debouncedSearch, activeFilters])

  const filters = useMemo<DataTableFilterDef[]>(() => [
    { id: 'status', label: t('common.status'), type: 'multi-select' as const, options: STATUS_FILTER_OPTIONS },
    { id: 'site_type', label: t('common.type'), type: 'multi-select' as const, options: SITE_TYPE_OPTIONS },
    { id: 'environment', label: t('assets.environment'), type: 'multi-select' as const, options: ENVIRONMENT_FILTER_OPTIONS },
  ], [t])

  const columns = useMemo<ColumnDef<OilSite, unknown>[]>(() => [
    {
      accessorKey: 'code',
      header: t('common.code'),
      cell: ({ row }) => <span className="font-mono font-semibold">{row.original.code}</span>,
    },
    {
      accessorKey: 'name',
      header: t('common.name'),
    },
    {
      accessorKey: 'site_type',
      header: t('common.type'),
      cell: ({ row }) => <span className="gl-badge gl-badge-neutral">{row.original.site_type.replace(/_/g, ' ')}</span>,
    },
    {
      accessorKey: 'environment',
      header: t('assets.environment'),
      cell: ({ row }) => <span className="gl-badge gl-badge-info">{row.original.environment}</span>,
    },
    {
      accessorKey: 'country',
      header: t('assets.country'),
    },
    {
      accessorKey: 'manned',
      header: t('assets.manned'),
      cell: ({ row }) => row.original.manned ? t('common.yes') : t('common.no'),
    },
    {
      accessorKey: 'status',
      header: t('common.status'),
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
    },
  ], [t])

  const batchActions = useMemo<DataTableBatchAction<OilSite>[]>(() => {
    const actions: DataTableBatchAction<OilSite>[] = []
    if (canDelete) {
      actions.push({
        id: 'archive',
        label: t('common.archive'),
        icon: Archive,
        variant: 'danger',
        confirm: t('assets.confirm_archive_selected'),
        onAction: async (rows) => {
          for (const row of rows) {
            try { await deleteSite.mutateAsync(row.id) } catch (e: any) {
              toast({ title: `${row.code}: ${e?.response?.data?.detail || t('common.error')}`, variant: 'error' })
            }
          }
          toast({ title: t('common.archived_count', { count: rows.length }), variant: 'success' })
        },
      })
    }
    return actions
  }, [canDelete, t, deleteSite])

  const importExport = useMemo<ImportExportConfig>(() => ({
    exportFormats: ['csv', 'xlsx'],
    advancedExport: true,
    importWizardTarget: 'ar_site',
    filenamePrefix: 'sites',
  }), [])

  const pagination = useMemo<DataTablePagination>(() => ({
    page,
    pageSize,
    total: data?.total ?? 0,
    pages: data?.pages ?? 0,
  }), [page, pageSize, data])

  return (
    <DataTable
      columns={columns}
      data={data?.items ?? []}
      isLoading={isLoading}
      pagination={pagination}
      searchValue={search}
      onSearchChange={setSearch}
      searchPlaceholder={t('assets.search_sites')}
      filters={filters}
      activeFilters={activeFilters}
      onFilterChange={handleFilterChange}
      columnVisibility
      columnResizing
      selectable
      batchActions={batchActions}
      importExport={importExport}
      storageKey="ar-sites"
      onRowClick={(row) => openDynamicPanel({ type: 'detail', module: 'ar-site', id: row.id })}
      onPaginationChange={(p) => setPage(p)}
    />
  )
}


// ════════════════════════════════════════════════════════════════
// INSTALLATIONS TAB
// ════════════════════════════════════════════════════════════════

function InstallationsTab() {
  const { t } = useTranslation()
  const [page, setPage] = useState(1)
  const { pageSize } = usePageSize()
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search, 300)
  const { activeFilters, handleFilterChange } = useFilterState()
  const openDynamicPanel = useUIStore((s) => s.openDynamicPanel)
  const { hasPermission } = usePermission()
  const canDelete = hasPermission('asset.delete')
  const { toast } = useToast()
  const deleteInstallation = useDeleteInstallation()

  const { data, isLoading } = useInstallations({
    page, page_size: pageSize,
    search: debouncedSearch || undefined,
    status: filterStr(activeFilters, 'status'),
    installation_type: filterStr(activeFilters, 'installation_type'),
    environment: filterStr(activeFilters, 'environment'),
  })

  useEffect(() => { setPage(1) }, [debouncedSearch, activeFilters])

  const filters = useMemo<DataTableFilterDef[]>(() => [
    { id: 'status', label: t('common.status'), type: 'multi-select' as const, options: STATUS_FILTER_OPTIONS },
    { id: 'installation_type', label: t('common.type'), type: 'multi-select' as const, options: INSTALLATION_TYPE_OPTIONS },
    { id: 'environment', label: t('assets.environment'), type: 'multi-select' as const, options: ENVIRONMENT_FILTER_OPTIONS },
  ], [t])

  const columns = useMemo<ColumnDef<Installation, unknown>[]>(() => [
    {
      accessorKey: 'code',
      header: t('common.code'),
      cell: ({ row }) => <span className="font-mono font-semibold">{row.original.code}</span>,
    },
    {
      accessorKey: 'name',
      header: t('common.name'),
    },
    {
      accessorKey: 'installation_type',
      header: t('common.type'),
      cell: ({ row }) => <span className="gl-badge gl-badge-neutral text-[10px]">{row.original.installation_type.replace(/_/g, ' ')}</span>,
    },
    {
      accessorKey: 'environment',
      header: t('assets.environment'),
      cell: ({ row }) => <span className="gl-badge gl-badge-info">{row.original.environment}</span>,
    },
    {
      accessorKey: 'is_manned',
      header: t('assets.manned'),
      cell: ({ row }) => row.original.is_manned ? t('common.yes') : t('common.no'),
    },
    {
      accessorKey: 'status',
      header: t('common.status'),
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
    },
  ], [t])

  const batchActions = useMemo<DataTableBatchAction<Installation>[]>(() => {
    const actions: DataTableBatchAction<Installation>[] = []
    if (canDelete) {
      actions.push({
        id: 'archive',
        label: t('common.archive'),
        icon: Archive,
        variant: 'danger',
        confirm: t('assets.confirm_archive_selected'),
        onAction: async (rows) => {
          for (const row of rows) {
            try { await deleteInstallation.mutateAsync(row.id) } catch (e: any) {
              toast({ title: `${row.code}: ${e?.response?.data?.detail || t('common.error')}`, variant: 'error' })
            }
          }
          toast({ title: t('common.archived_count', { count: rows.length }), variant: 'success' })
        },
      })
    }
    return actions
  }, [canDelete, t, deleteInstallation])

  const importExport = useMemo<ImportExportConfig>(() => ({
    exportFormats: ['csv', 'xlsx'],
    advancedExport: true,
    importWizardTarget: 'ar_installation',
    filenamePrefix: 'installations',
  }), [])

  const pagination = useMemo<DataTablePagination>(() => ({
    page,
    pageSize,
    total: data?.total ?? 0,
    pages: data?.pages ?? 0,
  }), [page, pageSize, data])

  return (
    <DataTable
      columns={columns}
      data={data?.items ?? []}
      isLoading={isLoading}
      pagination={pagination}
      searchValue={search}
      onSearchChange={setSearch}
      searchPlaceholder={t('assets.search_installations')}
      filters={filters}
      activeFilters={activeFilters}
      onFilterChange={handleFilterChange}
      columnVisibility
      columnResizing
      selectable
      batchActions={batchActions}
      importExport={importExport}
      storageKey="ar-installations"
      onRowClick={(row) => openDynamicPanel({ type: 'detail', module: 'ar-installation', id: row.id })}
      onPaginationChange={(p) => setPage(p)}
    />
  )
}


// ════════════════════════════════════════════════════════════════
// EQUIPMENT TAB
// ════════════════════════════════════════════════════════════════

function EquipmentTab() {
  const { t } = useTranslation()
  const [page, setPage] = useState(1)
  const { pageSize } = usePageSize()
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search, 300)
  const { activeFilters, handleFilterChange } = useFilterState()
  const openDynamicPanel = useUIStore((s) => s.openDynamicPanel)
  const { hasPermission } = usePermission()
  const canDelete = hasPermission('asset.delete')
  const { toast } = useToast()
  const deleteEquipment = useDeleteEquipment()

  const { data, isLoading } = useEquipmentList({
    page, page_size: pageSize,
    search: debouncedSearch || undefined,
    equipment_class: filterStr(activeFilters, 'equipment_class'),
    status: filterStr(activeFilters, 'status'),
    criticality: filterStr(activeFilters, 'criticality'),
  })

  useEffect(() => { setPage(1) }, [debouncedSearch, activeFilters])

  const dictClasses = useDictionaryOptions('equipment_class')

  const filters = useMemo<DataTableFilterDef[]>(() => [
    {
      id: 'equipment_class',
      label: t('assets.equipment_class'),
      type: 'multi-select' as const,
      options: dictClasses.length > 0
        ? dictClasses.map((d) => ({ value: d.value, label: d.label }))
        : [
          { value: 'CRANE', label: 'Grue' },
          { value: 'SEPARATOR', label: 'Séparateur' },
          { value: 'PUMP', label: 'Pompe' },
          { value: 'GAS_COMPRESSOR', label: 'Compresseur gaz' },
          { value: 'GAS_TURBINE', label: 'Turbine gaz' },
          { value: 'DIESEL_GENERATOR', label: 'Groupe électrogène' },
          { value: 'STORAGE_TANK', label: 'Bac' },
          { value: 'HEAT_EXCHANGER', label: 'Échangeur' },
          { value: 'INSTRUMENT', label: 'Instrument' },
          { value: 'WELLHEAD', label: 'Tête de puits' },
        ],
    },
    { id: 'status', label: t('common.status'), type: 'multi-select' as const, options: STATUS_FILTER_OPTIONS },
    { id: 'criticality', label: t('assets.criticality'), type: 'multi-select' as const, options: [
      { value: 'A', label: 'A — Critique' },
      { value: 'B', label: 'B — Important' },
      { value: 'C', label: 'C — Standard' },
    ]},
  ], [t, dictClasses])

  const columns = useMemo<ColumnDef<RegistryEquipment, unknown>[]>(() => [
    {
      accessorKey: 'tag_number',
      header: t('assets.columns.tag'),
      cell: ({ row }) => <span className="font-mono font-semibold text-foreground">{row.original.tag_number}</span>,
    },
    {
      accessorKey: 'name',
      header: t('common.name'),
    },
    {
      accessorKey: 'equipment_class',
      header: t('assets.equipment_class'),
      cell: ({ row }) => <span className="gl-badge gl-badge-neutral text-[10px]">{row.original.equipment_class.replace(/_/g, ' ')}</span>,
    },
    {
      accessorKey: 'manufacturer',
      header: t('assets.manufacturer'),
      cell: ({ row }) => row.original.manufacturer || '—',
    },
    {
      accessorKey: 'criticality',
      header: t('assets.criticality'),
      cell: ({ row }) => {
        const c = row.original.criticality
        if (!c) return '—'
        const cls = c === 'A' ? 'gl-badge-danger' : c === 'B' ? 'gl-badge-warning' : 'gl-badge-neutral'
        return <span className={cn('gl-badge', cls)}>{c}</span>
      },
    },
    {
      accessorKey: 'status',
      header: t('common.status'),
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
    },
  ], [t])

  const batchActions = useMemo<DataTableBatchAction<RegistryEquipment>[]>(() => {
    const actions: DataTableBatchAction<RegistryEquipment>[] = []
    if (canDelete) {
      actions.push({
        id: 'archive',
        label: t('common.archive'),
        icon: Archive,
        variant: 'danger',
        confirm: t('assets.confirm_archive_selected'),
        onAction: async (rows) => {
          for (const row of rows) {
            try { await deleteEquipment.mutateAsync(row.id) } catch (e: any) {
              toast({ title: `${row.tag_number}: ${e?.response?.data?.detail || t('common.error')}`, variant: 'error' })
            }
          }
          toast({ title: t('common.archived_count', { count: rows.length }), variant: 'success' })
        },
      })
    }
    return actions
  }, [canDelete, t, deleteEquipment])

  const importExport = useMemo<ImportExportConfig>(() => ({
    exportFormats: ['csv', 'xlsx'],
    advancedExport: true,
    importWizardTarget: 'ar_equipment',
    filenamePrefix: 'equipements',
  }), [])

  const pagination = useMemo<DataTablePagination>(() => ({
    page,
    pageSize,
    total: data?.total ?? 0,
    pages: data?.pages ?? 0,
  }), [page, pageSize, data])

  return (
    <DataTable
      columns={columns}
      data={data?.items ?? []}
      isLoading={isLoading}
      pagination={pagination}
      searchValue={search}
      onSearchChange={setSearch}
      searchPlaceholder={t('assets.search_equipment')}
      filters={filters}
      activeFilters={activeFilters}
      onFilterChange={handleFilterChange}
      columnVisibility
      columnResizing
      selectable
      batchActions={batchActions}
      importExport={importExport}
      storageKey="ar-equipment"
      onRowClick={(row) => openDynamicPanel({ type: 'detail', module: 'ar-equipment', id: row.id })}
      onPaginationChange={(p) => setPage(p)}
    />
  )
}


// ════════════════════════════════════════════════════════════════
// PIPELINES TAB
// ════════════════════════════════════════════════════════════════

function PipelinesTab() {
  const { t } = useTranslation()
  const [page, setPage] = useState(1)
  const { pageSize } = usePageSize()
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search, 300)
  const { activeFilters, handleFilterChange } = useFilterState()
  const openDynamicPanel = useUIStore((s) => s.openDynamicPanel)
  const { hasPermission } = usePermission()
  const canDelete = hasPermission('asset.delete')
  const { toast } = useToast()
  const deletePipeline = useDeletePipeline()

  const { data, isLoading } = usePipelines({
    page, page_size: pageSize,
    search: debouncedSearch || undefined,
    status: filterStr(activeFilters, 'status'),
    service: filterStr(activeFilters, 'service'),
  })

  useEffect(() => { setPage(1) }, [debouncedSearch, activeFilters])

  const filters = useMemo<DataTableFilterDef[]>(() => [
    { id: 'status', label: t('common.status'), type: 'multi-select' as const, options: STATUS_FILTER_OPTIONS },
    { id: 'service', label: t('assets.service'), type: 'multi-select' as const, options: PIPELINE_SERVICE_OPTIONS },
  ], [t])

  const columns = useMemo<ColumnDef<RegistryPipeline, unknown>[]>(() => [
    {
      accessorKey: 'pipeline_id',
      header: t('assets.columns.pipeline_id'),
      cell: ({ row }) => <span className="font-mono font-semibold">{row.original.pipeline_id}</span>,
    },
    {
      accessorKey: 'name',
      header: t('common.name'),
    },
    {
      accessorKey: 'service',
      header: t('assets.service'),
      cell: ({ row }) => <span className="gl-badge gl-badge-info text-[10px]">{row.original.service.replace(/_/g, ' ')}</span>,
    },
    {
      accessorKey: 'nominal_diameter_in',
      header: t('assets.columns.dn_in'),
      cell: ({ row }) => `${row.original.nominal_diameter_in}"`,
    },
    {
      accessorKey: 'total_length_km',
      header: t('assets.pipeline_length'),
      cell: ({ row }) => row.original.total_length_km ? `${row.original.total_length_km} km` : '—',
    },
    {
      accessorKey: 'status',
      header: t('common.status'),
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
    },
  ], [t])

  const batchActions = useMemo<DataTableBatchAction<RegistryPipeline>[]>(() => {
    const actions: DataTableBatchAction<RegistryPipeline>[] = []
    if (canDelete) {
      actions.push({
        id: 'archive',
        label: t('common.archive'),
        icon: Archive,
        variant: 'danger',
        confirm: t('assets.confirm_archive_selected'),
        onAction: async (rows) => {
          for (const row of rows) {
            try { await deletePipeline.mutateAsync(row.id) } catch (e: any) {
              toast({ title: `${row.pipeline_id}: ${e?.response?.data?.detail || t('common.error')}`, variant: 'error' })
            }
          }
          toast({ title: t('common.archived_count', { count: rows.length }), variant: 'success' })
        },
      })
    }
    return actions
  }, [canDelete, t, deletePipeline])

  const importExport = useMemo<ImportExportConfig>(() => ({
    exportFormats: ['csv', 'xlsx'],
    advancedExport: true,
    importWizardTarget: 'ar_pipeline',
    filenamePrefix: 'pipelines',
  }), [])

  const pagination = useMemo<DataTablePagination>(() => ({
    page,
    pageSize,
    total: data?.total ?? 0,
    pages: data?.pages ?? 0,
  }), [page, pageSize, data])

  return (
    <DataTable
      columns={columns}
      data={data?.items ?? []}
      isLoading={isLoading}
      pagination={pagination}
      searchValue={search}
      onSearchChange={setSearch}
      searchPlaceholder={t('assets.search_pipelines')}
      filters={filters}
      activeFilters={activeFilters}
      onFilterChange={handleFilterChange}
      columnVisibility
      columnResizing
      selectable
      batchActions={batchActions}
      importExport={importExport}
      storageKey="ar-pipelines"
      onRowClick={(row) => openDynamicPanel({ type: 'detail', module: 'ar-pipeline', id: row.id })}
      onPaginationChange={(p) => setPage(p)}
    />
  )
}


// ════════════════════════════════════════════════════════════════
// MAIN PAGE
// ════════════════════════════════════════════════════════════════

const TAB_MODULE: Record<TabKey, string> = {
  dashboard: '',
  hierarchy: '',
  fields: 'ar-field',
  sites: 'ar-site',
  installations: 'ar-installation',
  equipment: 'ar-equipment',
  pipelines: 'ar-pipeline',
}

export function AssetRegistryPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { hasPermission } = usePermission()
  const canCreate = hasPermission('asset.create')
  const canReadImputations = hasPermission('imputation.read')
  const openDynamicPanel = useUIStore((s) => s.openDynamicPanel)
  const dynamicPanel = useUIStore((s) => s.dynamicPanel)
  const panelMode = useUIStore((s) => s.dynamicPanelMode)
  const [activeTab, setActiveTab] = useState<TabKey>('dashboard')

  const handleCreate = useCallback(() => {
    const module = TAB_MODULE[activeTab]
    if (module) openDynamicPanel({ type: 'create', module })
  }, [activeTab, openDynamicPanel])

  // Listen for cross-module child navigation events from detail panels
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { tab: TabKey; filterKey: string; filterValue: string } | undefined
      if (detail?.tab) {
        setActiveTab(detail.tab)
      }
    }
    window.addEventListener('ar:navigate-children', handler)
    return () => window.removeEventListener('ar:navigate-children', handler)
  }, [])

  const showCreateButton = canCreate && activeTab !== 'dashboard' && activeTab !== 'hierarchy'

  const tabContent: Record<TabKey, JSX.Element> = {
    dashboard: <ModuleDashboard module="asset_registry" />,
    hierarchy: <AssetHierarchyTree />,
    fields: <FieldsTab />,
    sites: <SitesTab />,
    installations: <InstallationsTab />,
    equipment: <EquipmentTab />,
    pipelines: <PipelinesTab />,
  }

  // Check if a dynamic panel is open for one of our modules
  const AR_MODULES = ['ar-field', 'ar-site', 'ar-installation', 'ar-equipment', 'ar-pipeline']
  const isOurPanel = dynamicPanel && AR_MODULES.includes(dynamicPanel.module)
  const isFullPanel = panelMode === 'full' && isOurPanel

  return (
    <div className="flex h-full">
      {/* ── Static Panel (list) — hidden when full mode ── */}
      {!isFullPanel && (
        <div className="flex flex-1 flex-col min-w-0 overflow-hidden">
          <PanelHeader
            title={t('assets.registry_title')}
            subtitle={t('assets.subtitle')}
            icon={Layers}
          >
            <>
              {canReadImputations && (
                <ToolbarButton icon={Coins} label={t('nav.imputations')} onClick={() => navigate('/imputations')} />
              )}
              {showCreateButton && (
                <ToolbarButton icon={Plus} label={t('common.create')} variant="primary" onClick={handleCreate} />
              )}
            </>
          </PanelHeader>
          <PageNavBar
            items={TABS.map(({ key, icon, labelKey }) => ({ id: key, icon, label: t(labelKey) }))}
            activeId={activeTab}
            onTabChange={(id) => setActiveTab(id as TabKey)}
          />
          <PanelContent scroll={false}>
            {tabContent[activeTab]}
          </PanelContent>
        </div>
      )}

      {/* ── Dynamic Panels ──
          Each panel wrapped in ErrorBoundary so a render crash inside one
          doesn't unmount the whole AssetRegistryPage main content area.
          The fallback UI shows the error message + a retry button.  */}
      <ErrorBoundary>
        {dynamicPanel?.module === 'ar-field' && dynamicPanel.type === 'create' && <CreateFieldPanel />}
        {dynamicPanel?.module === 'ar-field' && dynamicPanel.type === 'detail' && <FieldDetailPanel id={dynamicPanel.id} />}
        {dynamicPanel?.module === 'ar-site' && dynamicPanel.type === 'create' && <CreateSitePanel />}
        {dynamicPanel?.module === 'ar-site' && dynamicPanel.type === 'detail' && <SiteDetailPanel id={dynamicPanel.id} />}
        {dynamicPanel?.module === 'ar-installation' && dynamicPanel.type === 'create' && <CreateInstallationPanel />}
        {dynamicPanel?.module === 'ar-installation' && dynamicPanel.type === 'detail' && <InstallationDetailPanel id={dynamicPanel.id} />}
        {dynamicPanel?.module === 'ar-equipment' && dynamicPanel.type === 'create' && <CreateEquipmentPanel />}
        {dynamicPanel?.module === 'ar-equipment' && dynamicPanel.type === 'detail' && <EquipmentDetailPanel id={dynamicPanel.id} />}
        {dynamicPanel?.module === 'ar-pipeline' && dynamicPanel.type === 'create' && <CreatePipelinePanel />}
        {dynamicPanel?.module === 'ar-pipeline' && dynamicPanel.type === 'detail' && <PipelineDetailPanel id={dynamicPanel.id} />}
      </ErrorBoundary>
    </div>
  )
}
