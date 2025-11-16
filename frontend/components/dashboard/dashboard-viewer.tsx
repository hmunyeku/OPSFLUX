"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Edit, Share2, MoreVertical, AlertTriangle } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { DashboardWidget } from "./dashboard-widget"
import { DashboardsApi, type Dashboard } from "@/lib/dashboards-api"

interface DashboardViewerProps {
  dashboardId: string
}

export function DashboardViewer({ dashboardId }: DashboardViewerProps) {
  const router = useRouter()
  const [dashboard, setDashboard] = useState<Dashboard | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadDashboard()
  }, [dashboardId])

  const loadDashboard = async () => {
    try {
      setIsLoading(true)
      setError(null)

      const data = await DashboardsApi.getDashboard(dashboardId)
      setDashboard(data)
    } catch (err: any) {
      console.error("Failed to load dashboard:", err)

      if (err.message?.includes("404") || err.message?.includes("not found")) {
        setError("Dashboard introuvable")
      } else if (err.message?.includes("403") || err.message?.includes("Forbidden")) {
        setError("Vous n'avez pas accès à ce dashboard")
      } else {
        setError(err.message || "Impossible de charger le dashboard")
      }
    } finally {
      setIsLoading(false)
    }
  }

  const handleEdit = () => {
    router.push(`/dashboard/${dashboardId}/edit`)
  }

  // Loading state
  if (isLoading) {
    return (
      <div className="h-full p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-4 w-96" />
          </div>
          <Skeleton className="h-10 w-32" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="h-64" />
          ))}
        </div>
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <Alert variant="destructive" className="max-w-md">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Erreur</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </div>
    )
  }

  // No dashboard found
  if (!dashboard) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <Alert className="max-w-md">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Dashboard introuvable</AlertTitle>
          <AlertDescription>
            Le dashboard demandé n'existe pas ou a été supprimé.
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b bg-background px-6 py-4">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-semibold">{dashboard.name}</h1>
              {dashboard.is_mandatory && (
                <Badge variant="secondary" className="text-xs">
                  Obligatoire
                </Badge>
              )}
              {dashboard.is_public && (
                <Badge variant="outline" className="text-xs">
                  Public
                </Badge>
              )}
            </div>
            {dashboard.description && (
              <p className="text-sm text-muted-foreground">{dashboard.description}</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-9 gap-2"
              onClick={handleEdit}
            >
              <Edit className="h-4 w-4" />
              Modifier
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-9 w-9 p-0">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem>
                  <Share2 className="h-4 w-4 mr-2" />
                  Partager
                </DropdownMenuItem>
                <DropdownMenuItem onClick={loadDashboard}>
                  Actualiser
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      {/* Widgets Grid */}
      <div className="flex-1 overflow-auto p-6">
        {dashboard.widgets && dashboard.widgets.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {dashboard.widgets.map((widget) => (
              <div
                key={widget.id}
                style={{
                  gridColumn: `span ${widget.layout?.w || 1}`,
                  gridRow: `span ${widget.layout?.h || 1}`,
                }}
              >
                <DashboardWidget
                  widgetId={widget.widget_id}
                  config={widget.config}
                />
              </div>
            ))}
          </div>
        ) : (
          <div className="flex h-full items-center justify-center">
            <div className="text-center space-y-2">
              <p className="text-sm text-muted-foreground">
                Ce dashboard ne contient aucun widget
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={handleEdit}
              >
                <Edit className="h-4 w-4 mr-2" />
                Ajouter des widgets
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
