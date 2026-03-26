/**
 * Asset Registry — O&G Hierarchy page.
 *
 * Tabs: Fields | Sites | Installations | Equipment | Pipelines
 * Each tab shows a DataTable with Visual Search Query.
 * Row click opens DynamicPanel with detail/edit view.
 */
import { useState, useMemo, useCallback, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import {
  MapPin, Plus, Factory, Landmark, Layers, Ship, Wrench,
} from 'lucide-react'
import { DataTable } from '@/components/ui/DataTable/DataTable'
import type { ColumnDef } from '@tanstack/react-table'
import type { DataTablePagination, DataTableFilterDef } from '@/components/ui/DataTable/types'
import { cn } from '@/lib/utils'
import { TabBar, TabButton } from '@/components/ui/Tabs'
import { useDebounce } from '@/hooks/useDebounce'
import { usePageSize } from '@/hooks/usePageSize'
import { PanelHeader, PanelContent, ToolbarButton } from '@/components/layout/PanelHeader'
import { usePermission } from '@/hooks/usePermission'
import { useUIStore } from '@/stores/uiStore'
import { useDictionaryOptions } from '@/hooks/useDictionary'
import {
  useFields,
  useSites,
  useInstallations,
  useEquipmentList,
  usePipelines,
} from '@/hooks/useAssetRegistry'
import type {
  OilField, OilSite, Installation, RegistryEquipment, RegistryPipeline,
} from '@/types/assetRegistry'

// Register detail panel renderers (side-effect import)
import './DetailPanels'


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

// ── Tab definitions ──────────────────────────────────────────

type TabKey = 'fields' | 'sites' | 'installations' | 'equipment' | 'pipelines'

const TABS: { key: TabKey; icon: typeof MapPin; labelKey: string }[] = [
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
  const { pageSize, setPageSize } = usePageSize()
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search, 300)
  const openDynamicPanel = useUIStore((s) => s.openDynamicPanel)

  const { data, isLoading } = useFields({
    page, page_size: pageSize,
    search: debouncedSearch || undefined,
  })

  useEffect(() => { setPage(1) }, [debouncedSearch])

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

  const pagination = useMemo<DataTablePagination>(() => ({
    page,
    pageSize,
    total: data?.total ?? 0,
    pages: data?.pages ?? 0,
  }), [page, pageSize, data, setPageSize])

  return (
    <DataTable
      columns={columns}
      data={data?.items ?? []}
      isLoading={isLoading}
      pagination={pagination}
      searchValue={search}
      onSearchChange={setSearch}
      searchPlaceholder={t('assets.search_fields')}
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
  const { pageSize, setPageSize } = usePageSize()
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search, 300)
  const [activeFilters] = useState<Record<string, unknown>>({})
  const openDynamicPanel = useUIStore((s) => s.openDynamicPanel)

  const fieldId = typeof activeFilters.field_id === 'string' ? activeFilters.field_id : undefined
  const { data, isLoading } = useSites({
    page, page_size: pageSize,
    search: debouncedSearch || undefined,
    field_id: fieldId,
  })

  useEffect(() => { setPage(1) }, [debouncedSearch, activeFilters])

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

  const pagination = useMemo<DataTablePagination>(() => ({
    page,
    pageSize,
    total: data?.total ?? 0,
    pages: data?.pages ?? 0,
  }), [page, pageSize, data, setPageSize])

  return (
    <DataTable
      columns={columns}
      data={data?.items ?? []}
      isLoading={isLoading}
      pagination={pagination}
      searchValue={search}
      onSearchChange={setSearch}
      searchPlaceholder={t('assets.search_sites')}
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
  const { pageSize, setPageSize } = usePageSize()
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search, 300)
  const openDynamicPanel = useUIStore((s) => s.openDynamicPanel)

  const { data, isLoading } = useInstallations({
    page, page_size: pageSize,
    search: debouncedSearch || undefined,
  })

  useEffect(() => { setPage(1) }, [debouncedSearch])

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

  const pagination = useMemo<DataTablePagination>(() => ({
    page,
    pageSize,
    total: data?.total ?? 0,
    pages: data?.pages ?? 0,
  }), [page, pageSize, data, setPageSize])

  return (
    <DataTable
      columns={columns}
      data={data?.items ?? []}
      isLoading={isLoading}
      pagination={pagination}
      searchValue={search}
      onSearchChange={setSearch}
      searchPlaceholder={t('assets.search_installations')}
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
  const { pageSize, setPageSize } = usePageSize()
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search, 300)
  const [activeFilters, setActiveFilters] = useState<Record<string, unknown>>({})
  const openDynamicPanel = useUIStore((s) => s.openDynamicPanel)

  const equipClass = typeof activeFilters.equipment_class === 'string' ? activeFilters.equipment_class : undefined
  const { data, isLoading } = useEquipmentList({
    page, page_size: pageSize,
    search: debouncedSearch || undefined,
    equipment_class: equipClass,
  })

  useEffect(() => { setPage(1) }, [debouncedSearch, activeFilters])

  const dictClasses = useDictionaryOptions('equipment_class')

  const filters = useMemo<DataTableFilterDef[]>(() => [
    {
      id: 'equipment_class',
      label: t('assets.equipment_class'),
      type: 'select' as const,
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
  ], [t, dictClasses])

  const handleFilterChange = useCallback((filterId: string, value: unknown) => {
    setActiveFilters((prev) => {
      const next = { ...prev }
      if (value === undefined || value === null) delete next[filterId]
      else next[filterId] = value
      return next
    })
  }, [])

  const columns = useMemo<ColumnDef<RegistryEquipment, unknown>[]>(() => [
    {
      accessorKey: 'tag_number',
      header: 'Tag',
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

  const pagination = useMemo<DataTablePagination>(() => ({
    page,
    pageSize,
    total: data?.total ?? 0,
    pages: data?.pages ?? 0,
  }), [page, pageSize, data, setPageSize])

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
  const { pageSize, setPageSize } = usePageSize()
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search, 300)
  const openDynamicPanel = useUIStore((s) => s.openDynamicPanel)

  const { data, isLoading } = usePipelines({
    page, page_size: pageSize,
    search: debouncedSearch || undefined,
  })

  useEffect(() => { setPage(1) }, [debouncedSearch])

  const columns = useMemo<ColumnDef<RegistryPipeline, unknown>[]>(() => [
    {
      accessorKey: 'pipeline_id',
      header: 'ID Pipeline',
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
      header: 'DN (in)',
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

  const pagination = useMemo<DataTablePagination>(() => ({
    page,
    pageSize,
    total: data?.total ?? 0,
    pages: data?.pages ?? 0,
  }), [page, pageSize, data, setPageSize])

  return (
    <DataTable
      columns={columns}
      data={data?.items ?? []}
      isLoading={isLoading}
      pagination={pagination}
      searchValue={search}
      onSearchChange={setSearch}
      searchPlaceholder={t('assets.search_pipelines')}
      onRowClick={(row) => openDynamicPanel({ type: 'detail', module: 'ar-pipeline', id: row.id })}
      onPaginationChange={(p) => setPage(p)}
    />
  )
}


// ════════════════════════════════════════════════════════════════
// MAIN PAGE
// ════════════════════════════════════════════════════════════════

export function AssetRegistryPage() {
  const { t } = useTranslation()
  const { hasPermission } = usePermission()
  const canCreate = hasPermission('asset.create')
  const [activeTab, setActiveTab] = useState<TabKey>('fields')

  const tabContent: Record<TabKey, JSX.Element> = {
    fields: <FieldsTab />,
    sites: <SitesTab />,
    installations: <InstallationsTab />,
    equipment: <EquipmentTab />,
    pipelines: <PipelinesTab />,
  }

  return (
    <>
      <PanelHeader
        title={t('assets.registry_title')}
        icon={Layers}
      >
        {canCreate && (
          <ToolbarButton icon={Plus} label={t('common.create')} onClick={() => {/* TODO: open create panel based on activeTab */}} />
        )}
      </PanelHeader>
      <PanelContent>
        <div className="border-b border-border px-4">
          <TabBar>
            {TABS.map(({ key, icon, labelKey }) => (
              <TabButton
                key={key}
                active={activeTab === key}
                onClick={() => setActiveTab(key)}
                icon={icon}
                label={t(labelKey)}
              />
            ))}
          </TabBar>
        </div>
        <div className="flex-1 overflow-hidden">
          {tabContent[activeTab]}
        </div>
      </PanelContent>
    </>
  )
}
