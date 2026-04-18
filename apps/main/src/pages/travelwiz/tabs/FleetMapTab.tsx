import { Plane, Ship, Users } from 'lucide-react'
import { useFleetKpis } from '@/hooks/useTravelWiz'
import { FleetMap } from '@/components/travelwiz/FleetMap'
import { StatCard, MapErrorBoundary } from '../components'

export function FleetMapTab() {
  const { data: fleetKpis, isLoading: loadingKpis } = useFleetKpis()
  const kpis = fleetKpis

  return (
    <div className="flex flex-1 flex-col min-h-0 overflow-hidden">
      {/* Fleet KPI cards */}
      <div className="grid grid-cols-3 gap-3 px-4 py-3 border-b border-border shrink-0">
        <StatCard
          label="Vecteurs actifs"
          value={loadingKpis ? '...' : (kpis?.active_vectors ?? kpis?.total_vectors ?? 0)}
          icon={Ship}
          accent="text-primary"
        />
        <StatCard
          label="Voyages en cours"
          value={loadingKpis ? '...' : (kpis?.active_voyages ?? 0)}
          icon={Plane}
          accent="text-amber-500"
        />
        <StatCard
          label="PAX en transit"
          value={loadingKpis ? '...' : (kpis?.pax_in_transit ?? 0)}
          icon={Users}
          accent="text-blue-500"
        />
      </div>

      {/* Fleet map */}
      <div className="flex-1 min-h-0 overflow-auto">
        <MapErrorBoundary><FleetMap height="calc(100vh - 220px)" /></MapErrorBoundary>
      </div>
    </div>
  )
}
