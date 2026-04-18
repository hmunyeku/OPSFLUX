import { CloudSun, Loader2 } from 'lucide-react'
import { useLatestWeather } from '@/hooks/useTravelWiz'
import { FLIGHT_STATUS_MAP, formatDateTime } from '../shared'
import { StatusBadge } from '../components'

export function WeatherTab() {
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
        <p className="text-sm text-muted-foreground">Aucune donnée météo disponible</p>
        <p className="text-xs text-muted-foreground/70 mt-1">Les rapports météo seront affichés ici</p>
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
              <StatusBadge
                status={w.flight_status}
                labels={Object.fromEntries(Object.entries(FLIGHT_STATUS_MAP).map(([key, value]) => [key, value.label]))}
                badges={Object.fromEntries(Object.entries(FLIGHT_STATUS_MAP).map(([key, value]) => [key, value.badge]))}
              />
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
