import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Plane, Ship, Package, Users, ArrowRight, Calendar, XCircle, BarChart3 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { DataTable } from '@/components/ui/DataTable/DataTable'
import type { ColumnDef } from '@tanstack/react-table'
import { PanelContent } from '@/components/layout/PanelHeader'
import { useUIStore } from '@/stores/uiStore'
import { useDictionaryLabels } from '@/hooks/useDictionary'
import { useTripsToday, useFleetKpis } from '@/hooks/useTravelWiz'
import { FleetMap } from '@/components/travelwiz/FleetMap'
import {
  VOYAGE_STATUS_LABELS_FALLBACK, VOYAGE_STATUS_BADGES, VECTOR_TYPE_MAP,
  formatDateTime, type AnyRow,
} from '../shared'
import { StatusBadge, StatCard, MapErrorBoundary } from '../components'

export function DashboardTab() {
  const { t } = useTranslation()
  const openDynamicPanel = useUIStore((s) => s.openDynamicPanel)
  const { data: tripsToday, isLoading: loadingTrips } = useTripsToday()
  const { data: fleetKpis, isLoading: loadingKpis } = useFleetKpis()
  const voyageStatusLabels = useDictionaryLabels('travelwiz_voyage_status', VOYAGE_STATUS_LABELS_FALLBACK)

  const trips = tripsToday?.trips ?? []
  const kpis = fleetKpis

  const tripColumns = useMemo<ColumnDef<AnyRow, unknown>[]>(() => [
    {
      accessorKey: 'code',
      header: t('travelwiz.columns.reference'),
      size: 110,
      cell: ({ row }) => <span className="font-medium font-mono text-xs text-foreground">{row.original.code}</span>,
    },
    {
      accessorKey: 'vector_name',
      header: t('travelwiz.columns.vector'),
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
      header: t('travelwiz.columns.route'),
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
      header: t('travelwiz.columns.departure'),
      size: 120,
      cell: ({ row }) => <span className="text-xs text-muted-foreground tabular-nums whitespace-nowrap">{formatDateTime(row.original.departure_at)}</span>,
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
  ], [voyageStatusLabels, t])

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
      <PanelContent scroll={false}>
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
