import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import i18n from '@/lib/i18n'
import { Package, Truck, Weight, ArrowRight, AlertTriangle, Bell, Loader2 } from 'lucide-react'

const numLocale = (): string => (i18n.language === 'en' ? 'en-US' : 'fr-FR')
import { DataTable } from '@/components/ui/DataTable/DataTable'
import type { ColumnDef } from '@tanstack/react-table'
import { useDebounce } from '@/hooks/useDebounce'
import { usePageSize } from '@/hooks/usePageSize'
import { PanelContent } from '@/components/layout/PanelHeader'
import { useUIStore } from '@/stores/uiStore'
import { useDictionaryLabels } from '@/hooks/useDictionary'
import {
  useCargoWorkspace,
  useCargoDictionaryCategory,
  useWorkspaceCargo,
  useWorkspaceUpdateCargoStatus,
} from '@/pages/packlog/packlogWorkspace'
import {
  CARGO_STATUS_LABELS_FALLBACK, CARGO_STATUS_BADGES,
  buildStatusOptions, type AnyRow,
} from '../shared'
import { StatusBadge, StatCard } from '../components'

export function CargoTab() {
  const { t } = useTranslation()
  const [page, setPage] = useState(1)
  const { pageSize } = usePageSize()
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search, 300)
  const [statusFilter, setStatusFilter] = useState('')
  const [pendingAdvanceId, setPendingAdvanceId] = useState<string | null>(null)
  const openDynamicPanel = useUIStore((s) => s.openDynamicPanel)
  const { panelModule } = useCargoWorkspace()
  const cargoStatusCategory = useCargoDictionaryCategory('cargo_status')
  const updateCargoStatus = useWorkspaceUpdateCargoStatus()
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
      header: t('travelwiz.columns.tracking'),
      size: 110,
      cell: ({ row }) => <span className="font-medium font-mono text-xs text-foreground">{row.original.code}</span>,
    },
    {
      accessorKey: 'description',
      header: t('travelwiz.columns.description'),
      cell: ({ row }) => <span className="text-foreground truncate max-w-[200px] block">{row.original.description || '—'}</span>,
    },
    {
      accessorKey: 'weight_kg',
      header: t('travelwiz.columns.weight'),
      size: 90,
      cell: ({ row }) => (
        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground tabular-nums">
          <Weight size={11} />
          {row.original.weight_kg ? `${row.original.weight_kg.toLocaleString(numLocale())}` : '—'}
        </span>
      ),
    },
    {
      id: 'route',
      header: 'Expéditeur → Destinataire',
      cell: ({ row }) => (
        <span className="flex items-center gap-1 text-xs text-muted-foreground truncate">
          <span className="truncate">{row.original.sender_name || '—'}</span>
          <ArrowRight size={10} className="shrink-0" />
          <span className="truncate">{row.original.receiver_name || '—'}</span>
        </span>
      ),
    },
    {
      accessorKey: 'status',
      header: t('travelwiz.columns.status'),
      size: 130,
      cell: ({ row }) => (
        <div className="flex items-center gap-1.5">
          <StatusBadge status={row.original.status} labels={cargoStatusLabels} badges={CARGO_STATUS_BADGES} />
          {row.original.hazmat_validated && <AlertTriangle size={11} className="text-destructive shrink-0" aria-label="HAZMAT" />}
          {row.original.is_urgent && <Bell size={11} className="text-amber-500 shrink-0" aria-label="Urgent" />}
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
        const isThisRowPending = pendingAdvanceId === row.original.id
        return (
          <button
            className="gl-button-sm gl-button-default text-xs"
            onClick={(e) => {
              e.stopPropagation()
              setPendingAdvanceId(row.original.id)
              updateCargoStatus.mutate(
                { id: row.original.id, status: next },
                { onSettled: () => setPendingAdvanceId(null) },
              )
            }}
            disabled={isThisRowPending}
          >
            {isThisRowPending ? <Loader2 size={11} className="animate-spin" /> : t('travelwiz.actions.advance')}
          </button>
        )
      },
    },
  ], [cargoStatusLabels, updateCargoStatus, pendingAdvanceId, t])

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 px-4 py-3 border-b border-border">
        <StatCard label="Total colis" value={stats.count} icon={Package} />
        <StatCard label="Poids total" value={`${stats.totalWeight.toLocaleString(numLocale())} kg`} icon={Weight} />
        <StatCard label="En transit" value={stats.inTransit} icon={Truck} />
        <StatCard label="HAZMAT" value={stats.hazmat} icon={AlertTriangle} accent="text-destructive" />
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
          searchPlaceholder="Rechercher par tracking, description..."
          filters={[{
            id: 'status',
            label: 'Statut',
            type: 'multi-select',
            operators: ['is', 'is_not'],
            options: cargoStatusOptions.filter((o: AnyRow) => o.value).map((o: AnyRow) => ({ value: o.value, label: o.label })),
          }]}
          activeFilters={statusFilter ? { status: [statusFilter] } : {}}
          onFilterChange={(id, v) => {
            if (id !== 'status') return
            const arr = Array.isArray(v) ? v : v != null ? [v] : []
            setStatusFilter(arr.length > 0 ? String(arr[0]) : '')
            setPage(1)
          }}
          onRowClick={(row) => openDynamicPanel({ type: 'detail', module: panelModule, id: row.id, meta: { subtype: 'cargo' } })}
          emptyIcon={Package}
          emptyTitle="Aucun colis"
          storageKey="travelwiz-cargo"
        />
      </PanelContent>
    </>
  )
}
