"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import {
  widgetTemplates,
  type Widget,
  type WidgetType,
  type DashboardNavigation,
  type DashboardPermissions,
  OPSFLUX_MENUS,
} from "@/lib/dashboard-data"
import {
  Plus,
  Save,
  X,
  GripVertical,
  Settings,
  Trash2,
  BarChart3,
  LineChart,
  Table,
  Activity,
  Link2,
  Calendar,
  TrendingUp,
  List,
} from "lucide-react"
import * as Icons from "lucide-react"

const iconMap: Record<string, any> = {
  BarChart3,
  LineChart,
  Table,
  Activity,
  Link2,
  Calendar,
  TrendingUp,
  List,
}

export function DashboardBuilderContent({ dashboardId }: { dashboardId?: string }) {
  const [dashboardName, setDashboardName] = useState("")
  const [dashboardDescription, setDashboardDescription] = useState("")
  const [isShared, setIsShared] = useState(false)
  const [widgets, setWidgets] = useState<Widget[]>([])
  const [selectedWidget, setSelectedWidget] = useState<Widget | null>(null)

  const [navigation, setNavigation] = useState<DashboardNavigation>({
    menuParent: "pilotage",
    menuLabel: "",
    menuIcon: "LayoutDashboard",
    menuOrder: 10,
    showInSidebar: true,
    isHomePage: false,
  })

  const [permissions, setPermissions] = useState<DashboardPermissions>({
    requiredRoles: [],
    requiredPermissions: [],
    restrictedToUsers: [],
    restrictedToOrganizations: [],
    inheritFromParent: true,
    allowAnonymous: false,
  })

  const addWidget = (type: WidgetType) => {
    const template = widgetTemplates.find((t) => t.type === type)
    if (!template) return

    const newWidget: Widget = {
      id: `widget-${Date.now()}`,
      type,
      title: template.label,
      size: template.defaultSize,
      position: { x: 0, y: widgets.length },
      config: {},
    }

    setWidgets([...widgets, newWidget])
    setSelectedWidget(newWidget)
  }

  const removeWidget = (id: string) => {
    setWidgets(widgets.filter((w) => w.id !== id))
    if (selectedWidget?.id === id) {
      setSelectedWidget(null)
    }
  }

  const updateWidget = (id: string, updates: Partial<Widget>) => {
    setWidgets(widgets.map((w) => (w.id === id ? { ...w, ...updates } : w)))
    if (selectedWidget?.id === id) {
      setSelectedWidget({ ...selectedWidget, ...updates })
    }
  }

  const saveDashboard = () => {
    console.log("[v0] Saving dashboard:", {
      name: dashboardName,
      description: dashboardDescription,
      shared: isShared,
      widgets,
      navigation,
      permissions,
    })
    alert("Dashboard sauvegardé avec succès!")
  }

  const updateNavigation = (updates: Partial<DashboardNavigation>) => {
    setNavigation({ ...navigation, ...updates })
  }

  const updatePermissions = (updates: Partial<DashboardPermissions>) => {
    setPermissions({ ...permissions, ...updates })
  }

  const selectedMenu = OPSFLUX_MENUS.find((m) => m.id === navigation.menuParent)
  const NavigationIcon = navigation.menuIcon ? (Icons as any)[navigation.menuIcon] : Icons.LayoutDashboard

  return (
    <div className="flex h-full gap-3 p-3">
      {/* Left Panel - Widget Library */}
      <div className="w-56 space-y-3">
        <Card className="border-border/50">
          <CardHeader className="p-3">
            <CardTitle className="text-xs font-semibold">Bibliothèque de Widgets</CardTitle>
          </CardHeader>
          <CardContent className="p-2 space-y-1">
            {widgetTemplates.map((template) => {
              const Icon = iconMap[template.icon]
              return (
                <Button
                  key={template.type}
                  variant="ghost"
                  className="w-full justify-start h-auto p-2 hover:bg-muted"
                  onClick={() => addWidget(template.type)}
                >
                  <Icon className="mr-2 h-3 w-3 shrink-0" />
                  <div className="flex-1 text-left min-w-0">
                    <div className="text-xs font-medium truncate">{template.label}</div>
                    <div className="text-[10px] text-muted-foreground truncate">{template.description}</div>
                  </div>
                </Button>
              )
            })}
          </CardContent>
        </Card>
      </div>

      {/* Center Panel - Configuration & Canvas */}
      <div className="flex-1 space-y-3 min-w-0">
        <Card className="border-border/50">
          <CardHeader className="p-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold">Configuration du Dashboard</CardTitle>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="h-7 text-xs bg-transparent" asChild>
                  <a href="/gallery">
                    <X className="mr-1 h-3 w-3" />
                    Annuler
                  </a>
                </Button>
                <Button size="sm" className="h-7 text-xs" onClick={saveDashboard}>
                  <Save className="mr-1 h-3 w-3" />
                  Sauvegarder
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-3">
            <Tabs defaultValue="general" className="w-full">
              <TabsList className="grid w-full grid-cols-3 h-8">
                <TabsTrigger value="general" className="text-xs">
                  Général
                </TabsTrigger>
                <TabsTrigger value="navigation" className="text-xs">
                  Navigation
                </TabsTrigger>
                <TabsTrigger value="permissions" className="text-xs">
                  Permissions
                </TabsTrigger>
              </TabsList>

              {/* General Tab */}
              <TabsContent value="general" className="space-y-3 mt-3">
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="name" className="text-xs">
                      Nom du Dashboard
                    </Label>
                    <Input
                      id="name"
                      placeholder="Mon Dashboard Personnalisé"
                      value={dashboardName}
                      onChange={(e) => setDashboardName(e.target.value)}
                      className="h-8 text-xs"
                    />
                  </div>
                  <div className="flex items-end gap-2">
                    <Switch id="shared" checked={isShared} onCheckedChange={setIsShared} />
                    <Label htmlFor="shared" className="text-xs">
                      Partager avec mon équipe
                    </Label>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="description" className="text-xs">
                    Description
                  </Label>
                  <Textarea
                    id="description"
                    placeholder="Description du dashboard..."
                    value={dashboardDescription}
                    onChange={(e) => setDashboardDescription(e.target.value)}
                    rows={2}
                    className="text-xs resize-none"
                  />
                </div>
              </TabsContent>

              {/* Navigation Tab */}
              <TabsContent value="navigation" className="space-y-3 mt-3">
                <div className="space-y-1.5">
                  <Label htmlFor="menu-parent" className="text-xs">
                    Menu parent
                  </Label>
                  <Select
                    value={navigation.menuParent}
                    onValueChange={(value) => updateNavigation({ menuParent: value })}
                  >
                    <SelectTrigger id="menu-parent" className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {OPSFLUX_MENUS.map((menu) => {
                        const MenuIcon = (Icons as any)[menu.icon]
                        return (
                          <SelectItem key={menu.id} value={menu.id} className="text-xs">
                            <div className="flex items-center gap-2">
                              {MenuIcon && <MenuIcon className="h-3 w-3" />}
                              <div>
                                <div className="font-medium">{menu.label}</div>
                                <div className="text-[10px] text-muted-foreground">{menu.description}</div>
                              </div>
                            </div>
                          </SelectItem>
                        )
                      })}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="menu-label" className="text-xs">
                      Libellé dans le menu
                    </Label>
                    <Input
                      id="menu-label"
                      placeholder="Vue Production Quotidienne"
                      value={navigation.menuLabel}
                      onChange={(e) => updateNavigation({ menuLabel: e.target.value })}
                      className="h-8 text-xs"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="menu-icon" className="text-xs">
                      Icône
                    </Label>
                    <Input
                      id="menu-icon"
                      placeholder="LayoutDashboard"
                      value={navigation.menuIcon}
                      onChange={(e) => updateNavigation({ menuIcon: e.target.value })}
                      className="h-8 text-xs"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="menu-order" className="text-xs">
                    Ordre d'affichage
                  </Label>
                  <Input
                    id="menu-order"
                    type="number"
                    value={navigation.menuOrder}
                    onChange={(e) => updateNavigation({ menuOrder: Number.parseInt(e.target.value) || 10 })}
                    className="h-8 text-xs"
                  />
                  <p className="text-[10px] text-muted-foreground">
                    Plus le nombre est petit, plus le dashboard apparaît en haut du menu
                  </p>
                </div>

                <Separator />

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label htmlFor="show-sidebar" className="text-xs">
                        Afficher dans la sidebar
                      </Label>
                      <p className="text-[10px] text-muted-foreground">
                        Le dashboard sera visible dans le menu latéral
                      </p>
                    </div>
                    <Switch
                      id="show-sidebar"
                      checked={navigation.showInSidebar}
                      onCheckedChange={(checked) => updateNavigation({ showInSidebar: checked })}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label htmlFor="is-homepage" className="text-xs">
                        Définir comme page d'accueil
                      </Label>
                      <p className="text-[10px] text-muted-foreground">
                        Ce dashboard s'affichera au démarrage d'OpsFlux
                      </p>
                    </div>
                    <Switch
                      id="is-homepage"
                      checked={navigation.isHomePage}
                      onCheckedChange={(checked) => updateNavigation({ isHomePage: checked })}
                    />
                  </div>
                </div>

                <Separator />

                {/* Aperçu de la navigation */}
                <div className="rounded-lg border p-2 bg-muted/30">
                  <h4 className="text-xs font-medium mb-2">Aperçu dans le menu</h4>
                  <div className="space-y-1">
                    <div className="text-[10px] text-muted-foreground">{selectedMenu?.label || "Menu parent"}</div>
                    <div className="flex items-center gap-2 text-xs">
                      {NavigationIcon && <NavigationIcon className="h-3 w-3" />}
                      <span className="font-medium">{navigation.menuLabel || "Libellé du dashboard"}</span>
                      {navigation.isHomePage && (
                        <Badge variant="secondary" className="text-[9px] h-4 px-1">
                          Page d'accueil
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              </TabsContent>

              {/* Permissions Tab */}
              <TabsContent value="permissions" className="space-y-3 mt-3">
                <div className="space-y-1.5">
                  <Label htmlFor="required-roles" className="text-xs">
                    Rôles requis
                  </Label>
                  <Input
                    id="required-roles"
                    placeholder="admin, manager, operator (séparés par des virgules)"
                    value={permissions.requiredRoles?.join(", ") || ""}
                    onChange={(e) =>
                      updatePermissions({
                        requiredRoles: e.target.value
                          .split(",")
                          .map((r) => r.trim())
                          .filter(Boolean),
                      })
                    }
                    className="h-8 text-xs"
                  />
                  <p className="text-[10px] text-muted-foreground">
                    Seuls les utilisateurs avec ces rôles pourront voir ce dashboard
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="required-permissions" className="text-xs">
                    Permissions requises
                  </Label>
                  <Input
                    id="required-permissions"
                    placeholder="dashboard.view, operations.read (séparés par des virgules)"
                    value={permissions.requiredPermissions?.join(", ") || ""}
                    onChange={(e) =>
                      updatePermissions({
                        requiredPermissions: e.target.value
                          .split(",")
                          .map((p) => p.trim())
                          .filter(Boolean),
                      })
                    }
                    className="h-8 text-xs"
                  />
                </div>

                <Separator />

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label htmlFor="inherit-parent" className="text-xs">
                        Hériter du menu parent
                      </Label>
                      <p className="text-[10px] text-muted-foreground">Utiliser les permissions du menu parent</p>
                    </div>
                    <Switch
                      id="inherit-parent"
                      checked={permissions.inheritFromParent}
                      onCheckedChange={(checked) => updatePermissions({ inheritFromParent: checked })}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label htmlFor="allow-anonymous" className="text-xs">
                        Autoriser l'accès anonyme
                      </Label>
                      <p className="text-[10px] text-muted-foreground">Accessible sans authentification</p>
                    </div>
                    <Switch
                      id="allow-anonymous"
                      checked={permissions.allowAnonymous}
                      onCheckedChange={(checked) => updatePermissions({ allowAnonymous: checked })}
                    />
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        {/* Canvas */}
        <Card className="border-border/50">
          <CardHeader className="p-3">
            <CardTitle className="text-xs font-semibold">Aperçu du Dashboard</CardTitle>
          </CardHeader>
          <CardContent className="p-3">
            {widgets.length === 0 ? (
              <div className="flex h-48 items-center justify-center rounded-lg border-2 border-dashed">
                <div className="text-center">
                  <Plus className="mx-auto h-6 w-6 text-muted-foreground" />
                  <p className="mt-2 text-xs text-muted-foreground">Ajoutez des widgets depuis la bibliothèque</p>
                </div>
              </div>
            ) : (
              <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
                {widgets.map((widget) => (
                  <Card
                    key={widget.id}
                    className={`cursor-pointer transition-all ${
                      selectedWidget?.id === widget.id ? "ring-2 ring-primary" : ""
                    } ${
                      widget.size === "small"
                        ? "md:col-span-1"
                        : widget.size === "medium"
                          ? "md:col-span-2"
                          : widget.size === "large"
                            ? "md:col-span-3"
                            : "md:col-span-3"
                    }`}
                    onClick={() => setSelectedWidget(widget)}
                  >
                    <CardHeader className="flex flex-row items-center justify-between p-2">
                      <div className="flex items-center gap-1.5">
                        <GripVertical className="h-3 w-3 text-muted-foreground" />
                        <CardTitle className="text-xs">{widget.title}</CardTitle>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-5 w-5 p-0"
                        onClick={(e) => {
                          e.stopPropagation()
                          removeWidget(widget.id)
                        }}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </CardHeader>
                    <CardContent className="p-2">
                      <div className="flex h-20 items-center justify-center rounded-md bg-muted">
                        <Badge variant="outline" className="text-[10px]">
                          {widget.type}
                        </Badge>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Right Panel - Widget Configuration */}
      <div className="w-64">
        <Card className="border-border/50">
          <CardHeader className="p-3">
            <CardTitle className="text-xs font-semibold">
              {selectedWidget ? "Configuration du Widget" : "Propriétés"}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3">
            {selectedWidget ? (
              <Tabs defaultValue="general">
                <TabsList className="grid w-full grid-cols-2 h-7">
                  <TabsTrigger value="general" className="text-[10px]">
                    Général
                  </TabsTrigger>
                  <TabsTrigger value="data" className="text-[10px]">
                    Données
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="general" className="space-y-3 mt-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="widget-title" className="text-xs">
                      Titre
                    </Label>
                    <Input
                      id="widget-title"
                      value={selectedWidget.title}
                      onChange={(e) => updateWidget(selectedWidget.id, { title: e.target.value })}
                      className="h-7 text-xs"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="widget-size" className="text-xs">
                      Taille
                    </Label>
                    <Select
                      value={selectedWidget.size}
                      onValueChange={(value: any) => updateWidget(selectedWidget.id, { size: value })}
                    >
                      <SelectTrigger id="widget-size" className="h-7 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="small" className="text-xs">
                          Petit (1 colonne)
                        </SelectItem>
                        <SelectItem value="medium" className="text-xs">
                          Moyen (2 colonnes)
                        </SelectItem>
                        <SelectItem value="large" className="text-xs">
                          Grand (3 colonnes)
                        </SelectItem>
                        <SelectItem value="full" className="text-xs">
                          Pleine largeur
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {selectedWidget.type === "chart" && (
                    <div className="space-y-1.5">
                      <Label htmlFor="chart-type" className="text-xs">
                        Type de graphique
                      </Label>
                      <Select
                        value={selectedWidget.config.chartType || "line"}
                        onValueChange={(value: any) =>
                          updateWidget(selectedWidget.id, {
                            config: { ...selectedWidget.config, chartType: value },
                          })
                        }
                      >
                        <SelectTrigger id="chart-type" className="h-7 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="line" className="text-xs">
                            Ligne
                          </SelectItem>
                          <SelectItem value="bar" className="text-xs">
                            Barre
                          </SelectItem>
                          <SelectItem value="pie" className="text-xs">
                            Camembert
                          </SelectItem>
                          <SelectItem value="area" className="text-xs">
                            Aire
                          </SelectItem>
                          <SelectItem value="donut" className="text-xs">
                            Donut
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </TabsContent>
                <TabsContent value="data" className="space-y-3 mt-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="data-source" className="text-xs">
                      Source de données
                    </Label>
                    <Select
                      value={selectedWidget.config.dataSource || ""}
                      onValueChange={(value) =>
                        updateWidget(selectedWidget.id, {
                          config: { ...selectedWidget.config, dataSource: value },
                        })
                      }
                    >
                      <SelectTrigger id="data-source" className="h-7 text-xs">
                        <SelectValue placeholder="Sélectionner..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="projects" className="text-xs">
                          Projets
                        </SelectItem>
                        <SelectItem value="tasks" className="text-xs">
                          Tâches
                        </SelectItem>
                        <SelectItem value="pob" className="text-xs">
                          Demandes POB
                        </SelectItem>
                        <SelectItem value="moc" className="text-xs">
                          MOC
                        </SelectItem>
                        <SelectItem value="logistics" className="text-xs">
                          Logistique
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="refresh" className="text-xs">
                      Actualisation (secondes)
                    </Label>
                    <Input
                      id="refresh"
                      type="number"
                      placeholder="60"
                      value={selectedWidget.config.refreshInterval || ""}
                      onChange={(e) =>
                        updateWidget(selectedWidget.id, {
                          config: { ...selectedWidget.config, refreshInterval: Number.parseInt(e.target.value) },
                        })
                      }
                      className="h-7 text-xs"
                    />
                  </div>
                </TabsContent>
              </Tabs>
            ) : (
              <div className="flex h-48 items-center justify-center text-center text-xs text-muted-foreground">
                <div>
                  <Settings className="mx-auto h-6 w-6 mb-2" />
                  <p>Sélectionnez un widget pour configurer ses propriétés</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
