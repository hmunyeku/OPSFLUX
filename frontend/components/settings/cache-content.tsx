"use client"

import { useState, useEffect } from "react"
import { CacheApi, type CacheStats } from "@/lib/cache-api"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Database, Trash2, RefreshCw, HardDrive, Activity, CheckCircle2, XCircle, Loader2 } from "lucide-react"

export function CacheContent() {
  const [stats, setStats] = useState<CacheStats | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isHealthy, setIsHealthy] = useState<boolean | null>(null)
  const [healthMessage, setHealthMessage] = useState<string | null>(null)
  const [isClearing, setIsClearing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  useEffect(() => {
    loadCacheData()
  }, [])

  const loadCacheData = async () => {
    try {
      setIsLoading(true)
      setError(null)
      const [statsData, healthData] = await Promise.all([
        CacheApi.getStats(),
        CacheApi.checkHealth(),
      ])
      setStats(statsData)
      setIsHealthy(healthData.healthy)
      setHealthMessage(healthData.message || null)
    } catch (error) {
      console.error('Failed to load cache data:', error)
      setError("Impossible de charger les données du cache")
    } finally {
      setIsLoading(false)
    }
  }

  const handleClearCache = async () => {
    if (!confirm('Êtes-vous sûr de vouloir vider tout le cache ? Cette action est irréversible.')) {
      return
    }

    try {
      setIsClearing(true)
      setError(null)
      setSuccessMessage(null)
      const response = await CacheApi.clearCache()
      setSuccessMessage(`${response.keys_deleted} clé(s) supprimée(s)`)
      await loadCacheData()
    } catch (error) {
      console.error('Failed to clear cache:', error)
      setError("Impossible de vider le cache")
    } finally {
      setIsClearing(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary mb-4" />
          <p className="text-sm text-muted-foreground">Chargement des statistiques du cache...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col gap-3 p-3">
      {/* Error and success messages */}
      {error && (
        <div className="rounded-md bg-destructive/10 p-2 text-xs text-destructive">
          {error}
        </div>
      )}
      {successMessage && (
        <div className="rounded-md bg-green-50 dark:bg-green-900/20 p-2 text-xs text-green-600 dark:text-green-400">
          {successMessage}
        </div>
      )}

      {/* Header with health status */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold leading-none">Gestion du Cache</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Statistiques Redis et contrôle du cache</p>
        </div>
        {isHealthy !== null && (
          <Badge variant={isHealthy ? "default" : "destructive"} className="gap-1 h-6 text-[10px]">
            {isHealthy ? <CheckCircle2 className="h-2.5 w-2.5" /> : <XCircle className="h-2.5 w-2.5" />}
            {isHealthy ? "Connecté" : (healthMessage || "Déconnecté")}
          </Badge>
        )}
      </div>

      {/* Stats Cards */}
      <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-4">
        <Card className="p-2">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-blue-500/10">
              <HardDrive className="h-3.5 w-3.5 text-blue-500" />
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground leading-none">Mémoire Utilisée</p>
              <p className="text-base font-bold leading-none mt-0.5">{stats?.used_memory || 'N/A'}</p>
            </div>
          </div>
        </Card>
        <Card className="p-2">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-green-500/10">
              <Database className="h-3.5 w-3.5 text-green-500" />
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground leading-none">Clés Totales</p>
              <p className="text-base font-bold leading-none mt-0.5">{stats?.total_keys?.toLocaleString() || 'N/A'}</p>
            </div>
          </div>
        </Card>
        <Card className="p-2">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-purple-500/10">
              <Activity className="h-3.5 w-3.5 text-purple-500" />
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground leading-none">Hit Rate</p>
              <p className="text-base font-bold leading-none mt-0.5">
                {stats?.hit_rate ? `${(stats.hit_rate * 100).toFixed(1)}%` : 'N/A'}
              </p>
            </div>
          </div>
        </Card>
        <Card className="p-2">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-orange-500/10">
              <Database className="h-3.5 w-3.5 text-orange-500" />
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground leading-none">Connexions</p>
              <p className="text-base font-bold leading-none mt-0.5">{stats?.total_connections || 'N/A'}</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Actions */}
      <Card className="p-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-xs font-semibold leading-none">Actions sur le Cache</h3>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              Gérer et vider le cache Redis
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs bg-transparent"
              onClick={loadCacheData}
              disabled={isLoading}
            >
              <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              Rafraîchir
            </Button>
            <Button
              size="sm"
              variant="destructive"
              className="h-8 text-xs"
              onClick={handleClearCache}
              disabled={isClearing}
            >
              <Trash2 className="mr-1.5 h-3.5 w-3.5" />
              {isClearing ? 'Vidage...' : 'Vider le Cache'}
            </Button>
          </div>
        </div>
      </Card>

      {/* Additional stats */}
      {stats && Object.keys(stats).length > 4 && (
        <Card className="p-3">
          <h3 className="text-xs font-semibold mb-2">Détails Supplémentaires</h3>
          <div className="grid gap-1.5 grid-cols-2 md:grid-cols-3">
            {Object.entries(stats)
              .filter(([key]) => !['used_memory', 'total_keys', 'hit_rate', 'total_connections'].includes(key))
              .map(([key, value]) => (
                <div key={key} className="flex flex-col gap-0.5">
                  <p className="text-[10px] text-muted-foreground">{key.replace(/_/g, ' ')}</p>
                  <p className="text-xs font-medium">{String(value)}</p>
                </div>
              ))}
          </div>
        </Card>
      )}
    </div>
  )
}
