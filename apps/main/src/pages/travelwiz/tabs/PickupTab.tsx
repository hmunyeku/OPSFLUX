import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Route, Users, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { DataTable } from '@/components/ui/DataTable/DataTable'
import type { ColumnDef } from '@tanstack/react-table'
import { usePageSize } from '@/hooks/usePageSize'
import { PanelContent } from '@/components/layout/PanelHeader'
import { useDictionaryLabels } from '@/hooks/useDictionary'
import { usePickupRounds, usePickupRound, useClosePickupRound } from '@/hooks/useTravelWiz'
import {
  PICKUP_STATUS_LABELS_FALLBACK, PICKUP_STATUS_BADGES,
  buildStatusOptions, formatDateShort, formatDateTime, type AnyRow,
} from '../shared'
import { StatusBadge } from '../components'

export function PickupTab() {
  const { t } = useTranslation()
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
      header: t('travelwiz.columns.reference'),
      size: 120,
      cell: ({ row }) => <span className="font-medium font-mono text-xs text-foreground">{row.original.code}</span>,
    },
    {
      accessorKey: 'date',
      header: t('travelwiz.columns.date'),
      size: 100,
      cell: ({ row }) => <span className="text-xs text-muted-foreground tabular-nums">{formatDateShort(row.original.date)}</span>,
    },
    {
      accessorKey: 'vehicle_name',
      header: t('travelwiz.columns.vehicle'),
      size: 130,
      cell: ({ row }) => <span className="text-foreground truncate">{row.original.vehicle_name || '—'}</span>,
    },
    {
      accessorKey: 'driver_name',
      header: t('travelwiz.columns.driver'),
      size: 120,
      cell: ({ row }) => <span className="text-xs text-muted-foreground">{row.original.driver_name || '—'}</span>,
    },
    {
      accessorKey: 'stops_count',
      header: t('travelwiz.columns.stops'),
      size: 60,
      cell: ({ row }) => <span className="text-xs text-muted-foreground tabular-nums">{row.original.stops_count}</span>,
    },
    {
      accessorKey: 'pax_collected',
      header: t('travelwiz.columns.pax_count'),
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
      header: t('travelwiz.columns.status'),
      size: 110,
      cell: ({ row }) => <StatusBadge status={row.original.status} labels={pickupStatusLabels} badges={PICKUP_STATUS_BADGES} />,
    },
  ], [pickupStatusLabels, t])

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
        {data && <span className="text-xs text-muted-foreground ml-auto shrink-0">{total} tournées</span>}
      </div>

      <div className="flex flex-1 min-h-0">
        {/* List */}
        <div className={cn('flex-1 min-w-0 overflow-auto', selectedId && 'hidden sm:block sm:flex-1')}>
          <PanelContent scroll={false}>
            <DataTable<AnyRow>
              columns={columns}
              data={items}
              isLoading={isLoading}
              pagination={data ? { page: data.page, pageSize, total: data.total, pages: data.pages } : undefined}
              onPaginationChange={(p) => setPage(p)}
              searchValue={search}
              onSearchChange={(v) => { setSearch(v); setPage(1) }}
              searchPlaceholder="Rechercher une tournée..."
              onRowClick={(row) => setSelectedId(row.id)}
              emptyIcon={Route}
              emptyTitle="Aucune tournée de ramassage"
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
                    <p className="text-muted-foreground">Prévu: {formatDateTime(stop.scheduled_time)}</p>
                  )}
                  {stop.actual_time && (
                    <p className="text-muted-foreground">Réel: {formatDateTime(stop.actual_time)}</p>
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
                {closeRound.isPending ? <Loader2 size={12} className="animate-spin" /> : 'Clôturer la tournée'}
              </button>
            )}
          </div>
        )}
      </div>
    </>
  )
}
