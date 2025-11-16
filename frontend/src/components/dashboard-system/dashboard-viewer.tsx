"use client";

/**
 * Dashboard Viewer Component
 * Affiche un dashboard avec ses widgets en mode lecture ou édition
 */

import { useEffect, useState } from "react";
import { DashboardWithWidgets, WidgetPublic } from "@/types/dashboard-system";
import { dashboardSystemAPI } from "@/api/dashboard-system";
import { Loader2, RefreshCw, Maximize2, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";
import { WidgetRenderer } from "./widget-renderer";

interface DashboardViewerProps {
  dashboardId: string;
  editMode?: boolean;
  onEdit?: () => void;
}

export function DashboardViewer({
  dashboardId,
  editMode = false,
  onEdit,
}: DashboardViewerProps) {
  const [dashboard, setDashboard] = useState<DashboardWithWidgets | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Charger le dashboard
  const loadDashboard = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await dashboardSystemAPI.getDashboard(dashboardId);
      setDashboard(data);

      // Tracker la vue
      await dashboardSystemAPI.trackDashboardView({
        dashboard_id: dashboardId,
        device_type: window.innerWidth < 768 ? "mobile" : window.innerWidth < 1024 ? "tablet" : "desktop",
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Erreur de chargement";
      setError(errorMessage);
      toast({
        title: "Erreur",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Rafraîchir le dashboard
  const handleRefresh = async () => {
    try {
      setRefreshing(true);
      await loadDashboard();
      toast({
        title: "Actualisé",
        description: "Le dashboard a été actualisé",
      });
    } finally {
      setRefreshing(false);
    }
  };

  // Auto-refresh si activé
  useEffect(() => {
    if (dashboard?.auto_refresh && dashboard.refresh_interval !== "manual") {
      const interval = getRefreshInterval(dashboard.refresh_interval);
      if (interval) {
        const timer = setInterval(loadDashboard, interval);
        return () => clearInterval(timer);
      }
    }
  }, [dashboard?.auto_refresh, dashboard?.refresh_interval]);

  useEffect(() => {
    loadDashboard();
  }, [dashboardId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !dashboard) {
    return (
      <Card className="p-8 text-center">
        <p className="text-muted-foreground mb-4">
          {error || "Dashboard introuvable"}
        </p>
        <Button onClick={loadDashboard} variant="outline">
          Réessayer
        </Button>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">{dashboard.name}</h1>
          {dashboard.description && (
            <p className="text-muted-foreground mt-1">{dashboard.description}</p>
          )}
        </div>

        <div className="flex items-center gap-2">
          {dashboard.auto_refresh && (
            <Button
              variant="ghost"
              size="icon"
              onClick={handleRefresh}
              disabled={refreshing}
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
            </Button>
          )}

          {dashboard.enable_fullscreen && (
            <Button variant="ghost" size="icon">
              <Maximize2 className="w-4 h-4" />
            </Button>
          )}

          {onEdit && (
            <Button variant="outline" size="sm" onClick={onEdit}>
              <Settings className="w-4 h-4 mr-2" />
              Éditer
            </Button>
          )}
        </div>
      </div>

      {/* Widgets Grid */}
      <div className="grid grid-cols-12 gap-4 auto-rows-min">
        {dashboard.widgets
          .filter((w) => w.is_visible)
          .sort((a, b) => a.order - b.order)
          .map((widget) => (
            <div
              key={widget.id}
              className={`col-span-${widget.width} row-span-${widget.height}`}
              style={{
                gridColumnStart: widget.position_x + 1,
                gridRowStart: widget.position_y + 1,
              }}
            >
              <WidgetRenderer widget={widget} />
            </div>
          ))}
      </div>

      {dashboard.widgets.length === 0 && (
        <Card className="p-12 text-center">
          <p className="text-muted-foreground">
            Ce dashboard ne contient aucun widget.
          </p>
          {onEdit && (
            <Button onClick={onEdit} className="mt-4">
              Ajouter des widgets
            </Button>
          )}
        </Card>
      )}
    </div>
  );
}

// Helper: Convertir l'intervalle en millisecondes
function getRefreshInterval(interval: string): number | null {
  const intervals: Record<string, number> = {
    realtime: 1000,
    "5s": 5000,
    "10s": 10000,
    "30s": 30000,
    "1m": 60000,
    "5m": 300000,
    "10m": 600000,
    "30m": 1800000,
    "1h": 3600000,
  };

  return intervals[interval] || null;
}
