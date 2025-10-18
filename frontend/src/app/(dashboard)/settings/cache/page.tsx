"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  IconRefresh,
  IconTrash,
  IconActivity,
  IconCheck,
  IconX,
  IconDatabase,
  IconChartBar,
} from "@tabler/icons-react"
import ContentSection from "../components/content-section"
import { useToast } from "@/hooks/use-toast"
import { getCacheStats, getCacheHealth, clearCache, type CacheStats, type CacheHealth } from "@/api/cache"

export default function CachePage() {
  const [stats, setStats] = useState<CacheStats | null>(null)
  const [health, setHealth] = useState<CacheHealth | null>(null)
  const [loading, setLoading] = useState(true)
  const [clearing, setClearing] = useState(false)
  const [clearDialogOpen, setClearDialogOpen] = useState(false)
  const { toast } = useToast()

  const fetchData = async () => {
    setLoading(true)
    try {
      const [statsData, healthData] = await Promise.all([
        getCacheStats(),
        getCacheHealth(),
      ])
      setStats(statsData)
      setHealth(healthData)
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Erreur",
        description: "Impossible de charger les données du cache.",
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

  const handleClearCache = async () => {
    setClearing(true)
    try {
      const result = await clearCache()
      toast({
        title: "Cache vidé",
        description: `${result.keys_deleted} clés supprimées`,
      })
      setClearDialogOpen(false)
      await fetchData()
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Erreur",
        description: "Impossible de vider le cache.",
      })
    } finally {
      setClearing(false)
    }
  }

  if (loading) {
    return (
      <ContentSection
        title="Gestion du Cache"
        desc="Monitoring et gestion du cache Redis"
        className="w-full lg:max-w-full"
      >
        <div className="flex items-center justify-center py-8">
          <IconRefresh className="h-6 w-6 animate-spin" />
        </div>
      </ContentSection>
    )
  }

  const hitRate = stats?.hit_rate || 0
  const isHealthy = health?.healthy || false

  return (
    <ContentSection
      title="Gestion du Cache"
      desc="Monitoring et gestion du cache Redis"
      className="w-full lg:max-w-full"
    >
      <div className="space-y-6">
        {/* Status & Actions */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <IconDatabase className="h-5 w-5 text-muted-foreground" />
            <div>
              <div className="flex items-center gap-2">
                <span className="font-medium">Redis Status</span>
                {isHealthy ? (
                  <Badge variant="default" className="bg-green-600">
                    <IconCheck className="mr-1 h-3 w-3" />
                    Connecté
                  </Badge>
                ) : (
                  <Badge variant="destructive">
                    <IconX className="mr-1 h-3 w-3" />
                    Déconnecté
                  </Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground">
                Backend: {health?.backend || 'N/A'}
              </p>
            </div>
          </div>

          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={fetchData}
            >
              <IconRefresh className="mr-2 h-4 w-4" />
              Actualiser
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setClearDialogOpen(true)}
            >
              <IconTrash className="mr-2 h-4 w-4" />
              Vider le cache
            </Button>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {/* Hits */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Hits</CardTitle>
              <IconCheck className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.hits.toLocaleString() || 0}</div>
              <p className="text-xs text-muted-foreground">
                Requêtes trouvées dans le cache
              </p>
            </CardContent>
          </Card>

          {/* Misses */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Misses</CardTitle>
              <IconX className="h-4 w-4 text-red-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.misses.toLocaleString() || 0}</div>
              <p className="text-xs text-muted-foreground">
                Requêtes non trouvées
              </p>
            </CardContent>
          </Card>

          {/* Hit Rate */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Taux de succès</CardTitle>
              <IconChartBar className="h-4 w-4 text-blue-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{hitRate.toFixed(1)}%</div>
              <p className="text-xs text-muted-foreground">
                Efficacité du cache
              </p>
            </CardContent>
          </Card>

          {/* Total Requests */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total requêtes</CardTitle>
              <IconActivity className="h-4 w-4 text-purple-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.total_requests.toLocaleString() || 0}</div>
              <p className="text-xs text-muted-foreground">
                Hits + Misses
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Operations Stats */}
        <Card>
          <CardHeader>
            <CardTitle>Opérations</CardTitle>
            <CardDescription>
              Statistiques des opérations de cache
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <div className="text-sm font-medium text-muted-foreground">Sets</div>
                <div className="text-2xl font-bold">{stats?.sets.toLocaleString() || 0}</div>
              </div>
              <div>
                <div className="text-sm font-medium text-muted-foreground">Deletes</div>
                <div className="text-2xl font-bold">{stats?.deletes.toLocaleString() || 0}</div>
              </div>
              <div>
                <div className="text-sm font-medium text-muted-foreground">Redis Hits</div>
                <div className="text-2xl font-bold">{stats?.redis_hits?.toLocaleString() || 'N/A'}</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Performance Tips */}
        <Card>
          <CardHeader>
            <CardTitle>Recommandations</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 text-sm">
              {hitRate < 50 && (
                <div className="flex items-start gap-2 text-amber-600">
                  <IconActivity className="h-4 w-4 mt-0.5" />
                  <div>
                    <p className="font-medium">Taux de succès faible</p>
                    <p className="text-xs text-muted-foreground">
                      Considérez augmenter les TTL ou revoir la stratégie de cache
                    </p>
                  </div>
                </div>
              )}
              {hitRate >= 80 && (
                <div className="flex items-start gap-2 text-green-600">
                  <IconCheck className="h-4 w-4 mt-0.5" />
                  <div>
                    <p className="font-medium">Excellente performance du cache</p>
                    <p className="text-xs text-muted-foreground">
                      Le cache est bien optimisé
                    </p>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Clear Cache Dialog */}
      <AlertDialog open={clearDialogOpen} onOpenChange={setClearDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Vider le cache ?</AlertDialogTitle>
            <AlertDialogDescription>
              Cette action supprimera toutes les données en cache. L&apos;application
              continuera de fonctionner mais les performances pourraient être
              temporairement réduites.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleClearCache}
              disabled={clearing}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {clearing ? "En cours..." : "Vider le cache"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ContentSection>
  )
}
