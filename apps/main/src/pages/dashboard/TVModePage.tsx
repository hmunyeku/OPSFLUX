/**
 * TVModePage — Public fullscreen dashboard for TV displays.
 *
 * Accessed via /tv/:token (no auth required).
 * Fetches dashboard data from GET /api/v1/dashboards/tv/:token
 * and renders the widget grid in fullscreen auto-refresh mode.
 */
import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { Loader2, Tv, AlertTriangle, RefreshCw } from 'lucide-react'
import api from '@/lib/api'
import { DashboardGrid } from '@/components/dashboard/DashboardGrid'
import type { DashboardWidget } from '@/services/dashboardService'

interface TVDashboardData {
  id: string
  name: string
  description?: string
  widgets: DashboardWidget[]
  tv_refresh_seconds: number
}

export function TVModePage() {
  const { token } = useParams<{ token: string }>()
  const [data, setData] = useState<TVDashboardData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date())

  const fetchDashboard = async () => {
    if (!token) { setError('Token manquant'); setLoading(false); return }
    try {
      const { data: resp } = await api.get(`/api/v1/dashboards/tv/${token}`)
      setData(resp)
      setError(null)
      setLastRefresh(new Date())
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || 'Erreur de chargement'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  // Initial fetch
  useEffect(() => { fetchDashboard() }, [token]) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-refresh
  useEffect(() => {
    if (!data) return
    const interval = (data.tv_refresh_seconds || 60) * 1000
    const timer = setInterval(fetchDashboard, interval)
    return () => clearInterval(timer)
  }, [data?.tv_refresh_seconds]) // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <div className="flex flex-col items-center gap-3">
          <Loader2 size={32} className="animate-spin text-primary" />
          <span className="text-sm text-muted-foreground">Chargement du dashboard TV...</span>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <div className="flex flex-col items-center gap-3 text-center max-w-md">
          <AlertTriangle size={32} className="text-destructive" />
          <h1 className="text-lg font-semibold">Dashboard TV indisponible</h1>
          <p className="text-sm text-muted-foreground">{error}</p>
          <button onClick={fetchDashboard} className="flex items-center gap-2 text-sm text-primary hover:underline mt-2">
            <RefreshCw size={14} /> Reessayer
          </button>
        </div>
      </div>
    )
  }

  if (!data) return null

  return (
    <div className="h-screen w-screen bg-background overflow-hidden flex flex-col">
      {/* Minimal header */}
      <div className="flex items-center justify-between h-10 px-4 border-b border-border bg-card shrink-0">
        <div className="flex items-center gap-2">
          <Tv size={14} className="text-primary" />
          <span className="text-sm font-semibold">{data.name}</span>
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span>Rafraichissement: {data.tv_refresh_seconds || 60}s</span>
          <span>Dernière MAJ : {lastRefresh.toLocaleTimeString('fr-FR')}</span>
        </div>
      </div>

      {/* Widget grid */}
      <div className="flex-1 overflow-auto p-4">
        <DashboardGrid
          widgets={data.widgets}
          mode="view"
        />
      </div>
    </div>
  )
}
