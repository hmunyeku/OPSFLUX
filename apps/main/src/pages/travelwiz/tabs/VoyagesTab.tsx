import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Plane, Ship, Users, ArrowRight, Calendar, Weight } from 'lucide-react'
import { DataTable } from '@/components/ui/DataTable/DataTable'
import type { ColumnDef } from '@tanstack/react-table'
import { useDebounce } from '@/hooks/useDebounce'
import { usePageSize } from '@/hooks/usePageSize'
import { PanelContent } from '@/components/layout/PanelHeader'
import { useUIStore } from '@/stores/uiStore'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { useDictionaryLabels } from '@/hooks/useDictionary'
import { useVoyages, useDeleteVoyage } from '@/hooks/useTravelWiz'
import { usePermission } from '@/hooks/usePermission'
import {
  VOYAGE_STATUS_LABELS_FALLBACK, VOYAGE_STATUS_BADGES, VECTOR_TYPE_MAP,
  formatDateShort, buildStatusOptions, type AnyRow,
} from '../shared'
import { StatusBadge, StatCard } from '../components'

export function VoyagesTab() {
  const { t } = useTranslation()
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
  const total = data?.total ?? 0

  const stats = useMemo(() => {
    const planned = items.filter((v) => v.status === 'planned').length
    const inProgress = items.filter((v) => ['boarding', 'departed'].includes(v.status)).length
    const arrived = items.filter((v) => v.status === 'arrived').length
    const totalPax = items.reduce((sum, v) => sum + (v.pax_count ?? 0), 0)
    return { planned, inProgress, arrived, totalPax }
  }, [items])

  const columns = useMemo<ColumnDef<AnyRow, unknown>[]>(() => [
    {
      accessorKey: 'code',
      header: t('travelwiz.columns.reference'),
      size: 110,
      cell: ({ row }) => <span className="font-medium font-mono text-xs text-foreground">{row.original.code}</span>,
    },
    {
      accessorKey: 'vector_name',
      header: t('travelwiz.columns.vector'),
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
      header: t('travelwiz.columns.route'),
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
      header: t('travelwiz.columns.departure'),
      size: 100,
      cell: ({ row }) => <span className="text-xs text-muted-foreground tabular-nums whitespace-nowrap">{formatDateShort(row.original.departure_at || row.original.departure_date)}</span>,
    },
    {
      accessorKey: 'status',
      header: t('travelwiz.columns.status'),
      size: 110,
      cell: ({ row }) => <StatusBadge status={row.original.status} labels={voyageStatusLabels} badges={VOYAGE_STATUS_BADGES} />,
    },
    {
      accessorKey: 'pax_count',
      header: t('travelwiz.columns.pax_count'),
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
      header: t('travelwiz.columns.cargo_count'),
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
          className="gl-button gl-button-danger opacity-0 group-hover:opacity-100"
          onClick={async (e: React.MouseEvent) => { e.stopPropagation(); const ok = await confirmDialog({ title: t('travelwiz.actions.delete_confirm_title'), message: t('travelwiz.actions.delete_voyage_confirm'), confirmLabel: t('travelwiz.actions.delete'), variant: 'danger' }); if (ok) deleteVoyage.mutate(row.original.id) }}
          title={t('travelwiz.actions.delete')}
        >
          <span className="text-xs">&times;</span>
        </button>
      ),
    }] : []),
  ], [deleteVoyage, canDelete, voyageStatusLabels, t, confirmDialog])

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 px-4 py-3 border-b border-border">
        <StatCard label={t('travelwiz.stats.total')} value={total} icon={Plane} />
        <StatCard label={t('travelwiz.stats.planned')} value={stats.planned} icon={Calendar} />
        <StatCard label={t('travelwiz.stats.in_progress')} value={stats.inProgress} icon={Plane} accent="text-amber-500" />
        <StatCard label={t('travelwiz.stats.pax_boarded')} value={stats.totalPax} icon={Users} accent="text-blue-500" />
      </div>

      {/* Status filter moved into the DataTable visual-search toolbar. */}

      <PanelContent scroll={false}>
        <DataTable<AnyRow>
          columns={columns}
          data={items}
          isLoading={isLoading}
          pagination={data ? { page: data.page, pageSize, total: data.total, pages: data.pages } : undefined}
          onPaginationChange={(p) => setPage(p)}
          searchValue={search}
          onSearchChange={(v) => { setSearch(v); setPage(1) }}
          searchPlaceholder="Rechercher par code, vecteur..."
          filters={[{
            id: 'status',
            label: t('common.status'),
            type: 'multi-select',
            operators: ['is', 'is_not'],
            options: voyageStatusOptions.filter((o: AnyRow) => o.value).map((o: AnyRow) => ({ value: o.value, label: o.label })),
          }]}
          activeFilters={statusFilter ? { status: [statusFilter] } : {}}
          onFilterChange={(id, v) => {
            if (id !== 'status') return
            const arr = Array.isArray(v) ? v : v != null ? [v] : []
            setStatusFilter(arr.length > 0 ? String(arr[0]) : '')
            setPage(1)
          }}
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
              departure_at: 'Départ',
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
