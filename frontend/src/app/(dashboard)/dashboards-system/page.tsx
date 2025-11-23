"use client";

/**
 * Dashboard System - List Page
 * Page listant tous les dashboards disponibles
 */

import { useEffect, useState } from "react";
import { dashboardSystemAPI } from "@/src/api/dashboard-system";
import { DashboardPublic, MenuParentEnum, DashboardCreate, DashboardUpdate } from "@/types/dashboard-system";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Loader2,
  Plus,
  LayoutDashboard,
  Search,
  MoreHorizontal,
  Edit,
  Trash2,
  Copy,
  Eye,
  Star,
} from "lucide-react";
import * as Icons from "lucide-react";
import Link from "next/link";
import { toast } from "@/hooks/use-toast";
import { DashboardSettingsDialog } from "@/components/dashboard-system/dashboard-settings-dialog";
import { OPSFLUX_MENUS, getMenuLabel } from "@/lib/opsflux-menus";

export default function DashboardsListPage() {
  const [dashboards, setDashboards] = useState<DashboardPublic[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMenu, setSelectedMenu] = useState<MenuParentEnum | null>(null);
  const [search, setSearch] = useState("");
  const [showSettingsDialog, setShowSettingsDialog] = useState(false);
  const [editingDashboard, setEditingDashboard] = useState<DashboardPublic | undefined>();

  useEffect(() => {
    loadDashboards();
  }, [selectedMenu]);

  const loadDashboards = async () => {
    try {
      setLoading(true);
      const response = await dashboardSystemAPI.getDashboards({
        menu_parent: selectedMenu || undefined,
        is_archived: false,
        limit: 1000,
      });
      setDashboards(response.data);
    } catch (error) {
      toast({
        title: "Erreur",
        description: "Impossible de charger les dashboards",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Filtrer par recherche
  const filteredDashboards = dashboards.filter((dashboard) => {
    const matchesSearch =
      dashboard.name.toLowerCase().includes(search.toLowerCase()) ||
      dashboard.menu_label.toLowerCase().includes(search.toLowerCase()) ||
      dashboard.description?.toLowerCase().includes(search.toLowerCase());
    return matchesSearch;
  });

  // Créer un nouveau dashboard
  const handleCreateDashboard = () => {
    setEditingDashboard(undefined);
    setShowSettingsDialog(true);
  };

  // Éditer un dashboard
  const handleEditDashboard = (dashboard: DashboardPublic, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setEditingDashboard(dashboard);
    setShowSettingsDialog(true);
  };

  // Sauvegarder un dashboard (créer ou mettre à jour)
  const handleSaveDashboard = async (data: DashboardCreate | DashboardUpdate) => {
    try {
      if (editingDashboard) {
        await dashboardSystemAPI.updateDashboard(editingDashboard.id, data as DashboardUpdate);
      } else {
        await dashboardSystemAPI.createDashboard(data as DashboardCreate);
      }
      await loadDashboards();
    } catch (error) {
      throw error; // Re-throw pour que le dialog gère l'erreur
    }
  };

  // Supprimer un dashboard
  const handleDeleteDashboard = async (dashboard: DashboardPublic, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm(`Êtes-vous sûr de vouloir supprimer "${dashboard.name}" ?`)) {
      return;
    }

    try {
      await dashboardSystemAPI.deleteDashboard(dashboard.id);
      toast({
        title: "Dashboard supprimé",
        description: `Le dashboard "${dashboard.name}" a été supprimé.`,
      });
      await loadDashboards();
    } catch (error) {
      toast({
        title: "Erreur",
        description: "Impossible de supprimer le dashboard",
        variant: "destructive",
      });
    }
  };

  // Cloner un dashboard
  const handleCloneDashboard = async (dashboard: DashboardPublic, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await dashboardSystemAPI.cloneDashboard({
        source_dashboard_id: dashboard.id,
        new_name: `${dashboard.name} (Copie)`,
        copy_widgets: true,
      });
      toast({
        title: "Dashboard cloné",
        description: `Le dashboard "${dashboard.name}" a été cloné avec succès.`,
      });
      await loadDashboards();
    } catch (error) {
      toast({
        title: "Erreur",
        description: "Impossible de cloner le dashboard",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Dashboards</h1>
          <p className="text-muted-foreground">
            Gérez vos dashboards personnalisables
          </p>
        </div>
        <Button onClick={handleCreateDashboard}>
          <Plus className="w-4 h-4 mr-2" />
          Nouveau Dashboard
        </Button>
      </div>

      {/* Search and Filter */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="flex-1">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Rechercher un dashboard..."
              className="pl-8"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button
            variant={selectedMenu === null ? "default" : "outline"}
            size="sm"
            onClick={() => setSelectedMenu(null)}
          >
            Tous
          </Button>
          {OPSFLUX_MENUS.map((menu) => (
            <Button
              key={menu.id}
              variant={selectedMenu === menu.id ? "default" : "outline"}
              size="sm"
              onClick={() => setSelectedMenu(menu.id)}
            >
              {menu.label}
            </Button>
          ))}
        </div>
      </div>

      {/* Dashboards Grid */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : filteredDashboards.length === 0 ? (
        <Card className="p-12 text-center">
          <LayoutDashboard className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">Aucun dashboard trouvé</h3>
          <p className="text-muted-foreground mb-4">
            {search || selectedMenu
              ? "Essayez de modifier vos filtres"
              : "Commencez par créer votre premier dashboard"}
          </p>
          <Button onClick={handleCreateDashboard}>
            <Plus className="w-4 h-4 mr-2" />
            Créer un dashboard
          </Button>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredDashboards.map((dashboard) => {
            const IconComponent = dashboard.menu_icon
              ? (Icons[dashboard.menu_icon as keyof typeof Icons] as React.ComponentType<{ className?: string }>)
              : Icons.LayoutDashboard;

            return (
              <Link key={dashboard.id} href={`/dashboards-system/${dashboard.id}`}>
                <Card className="hover:shadow-lg transition-shadow cursor-pointer h-full">
                  <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
                    <div className="flex items-start gap-3 flex-1">
                      <div className="p-2 rounded-lg bg-primary/10 shrink-0">
                        {IconComponent && <IconComponent className="h-5 w-5 text-primary" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <CardTitle className="text-base line-clamp-1">
                          {dashboard.menu_label}
                        </CardTitle>
                        <CardDescription className="text-xs line-clamp-1">
                          {dashboard.name}
                        </CardDescription>
                      </div>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild onClick={(e) => e.preventDefault()}>
                        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                        <DropdownMenuItem asChild>
                          <Link href={`/dashboards-system/${dashboard.id}`}>
                            <Eye className="mr-2 h-4 w-4" />
                            Voir
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={(e) => handleEditDashboard(dashboard, e)}>
                          <Edit className="mr-2 h-4 w-4" />
                          Éditer
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={(e) => handleCloneDashboard(dashboard, e)}>
                          <Copy className="mr-2 h-4 w-4" />
                          Cloner
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={(e) => handleDeleteDashboard(dashboard, e)}
                          className="text-destructive"
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Supprimer
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {dashboard.description && (
                        <p className="text-sm text-muted-foreground line-clamp-2">
                          {dashboard.description}
                        </p>
                      )}
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="secondary" className="text-xs">
                          {getMenuLabel(dashboard.menu_parent)}
                        </Badge>
                        {dashboard.is_home_page && (
                          <Badge variant="default" className="text-xs">
                            Page d'accueil
                          </Badge>
                        )}
                        {dashboard.is_public && (
                          <Badge variant="outline" className="text-xs">
                            Public
                          </Badge>
                        )}
                        {dashboard.is_template && (
                          <Badge variant="outline" className="text-xs">
                            Template
                          </Badge>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}

      {/* Dialog de création/édition */}
      <DashboardSettingsDialog
        open={showSettingsDialog}
        onOpenChange={setShowSettingsDialog}
        dashboard={editingDashboard}
        onSave={handleSaveDashboard}
      />
    </div>
  );
}
