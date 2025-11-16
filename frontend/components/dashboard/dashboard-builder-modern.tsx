"use client"

import { useState, useEffect, useRef } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Plus,
  Save,
  X,
  GripVertical,
  Settings,
  Trash2,
  BarChart3,
  LineChart,
  PieChart as PieChartIcon,
  Table,
  Activity,
  Calendar,
  TrendingUp,
  List,
  Eye,
  Sparkles,
  Layout,
  Palette,
  Users,
  Lock,
  Database,
  Grid3x3,
} from "lucide-react"
import { GridStack } from "gridstack"
import "gridstack/dist/gridstack.min.css"
import "gridstack/dist/gridstack-extra.min.css"
import { SqlQueryWidget } from "@/components/widgets/sql-query-widget"
import { PivotTableWidget } from "@/components/widgets/pivot-table-widget"

type WidgetType = "kpi" | "chart" | "table" | "activity" | "list" | "calendar" | "sql" | "pivot"
type ChartType = "line" | "bar" | "area" | "pie"

interface Widget {
  id: string
  type: WidgetType
  title: string
  size: "small" | "medium" | "large" | "full"
  chartType?: ChartType
  dataSource?: string
  config: Record<string, any>
  // GridStack properties
  x?: number
  y?: number
  w?: number
  h?: number
}

const widgetTemplates = [
  {
    type: "kpi" as const,
    icon: TrendingUp,
    label: "Indicateur KPI",
    description: "Afficher une métrique clé avec tendance",
    color: "blue",
  },
  {
    type: "chart" as const,
    icon: BarChart3,
    label: "Graphique",
    description: "Graphiques line, bar, area ou pie",
    color: "green",
  },
  {
    type: "table" as const,
    icon: Table,
    label: "Tableau",
    description: "Tableau de données filtrable",
    color: "orange",
  },
  {
    type: "activity" as const,
    icon: Activity,
    label: "Activité",
    description: "Fil d'activité récente",
    color: "purple",
  },
  {
    type: "list" as const,
    icon: List,
    label: "Liste",
    description: "Liste d'éléments personnalisée",
    color: "pink",
  },
  {
    type: "calendar" as const,
    icon: Calendar,
    label: "Calendrier",
    description: "Vue calendrier des événements",
    color: "indigo",
  },
  {
    type: "sql" as const,
    icon: Database,
    label: "Requête SQL",
    description: "Exécuter des requêtes SQL personnalisées",
    color: "cyan",
  },
  {
    type: "pivot" as const,
    icon: Grid3x3,
    label: "Tableau Croisé",
    description: "Analyse interactive avec pivot table",
    color: "teal",
  },
]

export function DashboardBuilderModern() {
  const [dashboardName, setDashboardName] = useState("")
  const [dashboardDescription, setDashboardDescription] = useState("")
  const [isPublic, setIsPublic] = useState(false)
  const [widgets, setWidgets] = useState<Widget[]>([])
  const [selectedWidget, setSelectedWidget] = useState<Widget | null>(null)
  const [currentTab, setCurrentTab] = useState("design")
  const [previewMode, setPreviewMode] = useState(false)
  const gridRef = useRef<GridStack | null>(null)
  const gridContainerRef = useRef<HTMLDivElement | null>(null)

  // Initialize GridStack
  useEffect(() => {
    if (!previewMode && gridContainerRef.current && !gridRef.current) {
      gridRef.current = GridStack.init(
        {
          cellHeight: 70,
          column: 12,
          margin: 12,
          float: false,
          acceptWidgets: true,
          removable: false,
          animate: true,
        },
        gridContainerRef.current
      )

      // Handle grid changes
      gridRef.current.on("change", (event, items) => {
        if (items) {
          setWidgets((prevWidgets) =>
            prevWidgets.map((widget) => {
              const item = items.find((i) => i.id === widget.id)
              if (item) {
                return { ...widget, x: item.x, y: item.y, w: item.w, h: item.h }
              }
              return widget
            })
          )
        }
      })
    }

    return () => {
      if (gridRef.current) {
        gridRef.current.destroy(false)
        gridRef.current = null
      }
    }
  }, [previewMode])

  // Update grid when widgets change
  useEffect(() => {
    if (gridRef.current && !previewMode) {
      // Remove all widgets from grid
      gridRef.current.removeAll(false)

      // Add current widgets to grid
      widgets.forEach((widget) => {
        const el = document.getElementById(`grid-item-${widget.id}`)
        if (el) {
          gridRef.current?.makeWidget(el)
        }
      })
    }
  }, [widgets.length, previewMode])

  const addWidget = (type: WidgetType) => {
    const template = widgetTemplates.find((t) => t.type === type)
    if (!template) return

    // Calculate default grid position based on widget size
    let defaultWidth = 6 // medium
    let defaultHeight = 4

    if (type === "kpi") {
      defaultWidth = 3
      defaultHeight = 2
    } else if (type === "chart") {
      defaultWidth = 6
      defaultHeight = 5
    } else if (type === "table") {
      defaultWidth = 12
      defaultHeight = 6
    } else if (type === "sql") {
      defaultWidth = 12
      defaultHeight = 8
    } else if (type === "pivot") {
      defaultWidth = 12
      defaultHeight = 10
    }

    const newWidget: Widget = {
      id: `widget-${Date.now()}`,
      type,
      title: template.label,
      size: "medium",
      config: {},
      x: 0,
      y: 0,
      w: defaultWidth,
      h: defaultHeight,
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
    const dashboard = {
      name: dashboardName,
      description: dashboardDescription,
      isPublic,
      widgets,
      createdAt: new Date().toISOString(),
    }
    console.log("Saving dashboard:", dashboard)
    // TODO: API call to save
  }

  const getWidgetIcon = (type: WidgetType) => {
    const template = widgetTemplates.find((t) => t.type === type)
    return template?.icon || Layout
  }

  return (
    <div className="flex h-full">
      {/* Left Sidebar - Widget Library */}
      <div className="w-80 border-r bg-muted/10">
        <div className="flex h-14 items-center border-b px-4">
          <h2 className="font-semibold">Composants</h2>
        </div>
        <ScrollArea className="h-[calc(100vh-3.5rem)]">
          <div className="space-y-4 p-4">
            <div>
              <h3 className="mb-2 text-sm font-medium text-muted-foreground">WIDGETS DISPONIBLES</h3>
              <div className="space-y-2">
                {widgetTemplates.map((template) => (
                  <Button
                    key={template.type}
                    variant="outline"
                    className="w-full justify-start gap-3 h-auto py-3 hover:bg-primary/5 hover:border-primary/50"
                    onClick={() => addWidget(template.type)}
                  >
                    <div
                      className={`flex h-10 w-10 items-center justify-center rounded-lg bg-${template.color}-100 text-${template.color}-600`}
                    >
                      <template.icon className="h-5 w-5" />
                    </div>
                    <div className="flex-1 text-left">
                      <div className="text-sm font-medium">{template.label}</div>
                      <div className="text-xs text-muted-foreground">{template.description}</div>
                    </div>
                  </Button>
                ))}
              </div>
            </div>

            <Separator />

            <div>
              <h3 className="mb-2 text-sm font-medium text-muted-foreground">MODÈLES</h3>
              <div className="space-y-2">
                <Button variant="outline" className="w-full justify-start gap-2" size="sm">
                  <Sparkles className="h-4 w-4" />
                  Dashboard KPI
                </Button>
                <Button variant="outline" className="w-full justify-start gap-2" size="sm">
                  <BarChart3 className="h-4 w-4" />
                  Analytics
                </Button>
                <Button variant="outline" className="w-full justify-start gap-2" size="sm">
                  <Activity className="h-4 w-4" />
                  Monitoring
                </Button>
              </div>
            </div>
          </div>
        </ScrollArea>
      </div>

      {/* Main Area - Canvas & Configuration */}
      <div className="flex flex-1 flex-col">
        {/* Top Bar */}
        <div className="flex h-14 items-center justify-between border-b px-4">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" asChild>
              <a href="/gallery">
                <X className="mr-2 h-4 w-4" />
                Annuler
              </a>
            </Button>
            <Separator orientation="vertical" className="h-6" />
            <Input
              placeholder="Nom du dashboard"
              value={dashboardName}
              onChange={(e) => setDashboardName(e.target.value)}
              className="h-8 w-64"
            />
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={widgets.length > 0 ? "default" : "secondary"}>
              {widgets.length} {widgets.length === 1 ? "widget" : "widgets"}
            </Badge>
            <Button variant="outline" size="sm" onClick={() => setPreviewMode(!previewMode)}>
              <Eye className="mr-2 h-4 w-4" />
              {previewMode ? "Éditer" : "Aperçu"}
            </Button>
            <Button size="sm" onClick={saveDashboard} disabled={!dashboardName || widgets.length === 0}>
              <Save className="mr-2 h-4 w-4" />
              Enregistrer
            </Button>
          </div>
        </div>

        {/* Canvas Area */}
        <div className="flex flex-1 overflow-hidden">
          <div className="flex-1 overflow-auto p-6">
            {previewMode ? (
              // Preview Mode
              <div className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                  {widgets
                    .filter((w) => w.size === "small")
                    .map((widget) => {
                      const Icon = getWidgetIcon(widget.type)
                      return (
                        <Card key={widget.id}>
                          <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-medium">{widget.title}</CardTitle>
                          </CardHeader>
                          <CardContent>
                            <div className="flex items-center gap-2">
                              <Icon className="h-8 w-8 text-muted-foreground" />
                              <div className="text-2xl font-bold">--</div>
                            </div>
                          </CardContent>
                        </Card>
                      )
                    })}
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  {widgets
                    .filter((w) => w.size === "medium")
                    .map((widget) => {
                      const Icon = getWidgetIcon(widget.type)
                      return (
                        <Card key={widget.id}>
                          <CardHeader>
                            <CardTitle>{widget.title}</CardTitle>
                            <CardDescription>Configuration: {widget.type}</CardDescription>
                          </CardHeader>
                          <CardContent className="flex h-64 items-center justify-center text-muted-foreground">
                            <Icon className="h-16 w-16" />
                          </CardContent>
                        </Card>
                      )
                    })}
                </div>
                {widgets
                  .filter((w) => w.size === "large" || w.size === "full")
                  .map((widget) => {
                    const Icon = getWidgetIcon(widget.type)
                    return widget.type === "sql" ? (
                      <SqlQueryWidget
                        key={widget.id}
                        title={widget.title}
                        defaultQuery={widget.config?.query || "SELECT * FROM table LIMIT 10"}
                        endpoint={widget.dataSource}
                      />
                    ) : widget.type === "pivot" ? (
                      <PivotTableWidget
                        key={widget.id}
                        title={widget.title}
                        dataSource={widget.dataSource}
                      />
                    ) : (
                      <Card key={widget.id}>
                        <CardHeader>
                          <CardTitle>{widget.title}</CardTitle>
                          <CardDescription>Configuration: {widget.type}</CardDescription>
                        </CardHeader>
                        <CardContent className="flex h-96 items-center justify-center text-muted-foreground">
                          <Icon className="h-24 w-24" />
                        </CardContent>
                      </Card>
                    )
                  })}
              </div>
            ) : (
              // Edit Mode with GridStack
              <div>
                {widgets.length === 0 ? (
                  <div className="flex h-96 items-center justify-center rounded-lg border-2 border-dashed">
                    <div className="text-center">
                      <Layout className="mx-auto h-12 w-12 text-muted-foreground" />
                      <h3 className="mt-4 text-lg font-semibold">Aucun widget</h3>
                      <p className="mt-2 text-sm text-muted-foreground">
                        Commencez par ajouter des widgets depuis la barre latérale
                      </p>
                    </div>
                  </div>
                ) : (
                  <div
                    ref={gridContainerRef}
                    className="grid-stack min-h-[600px]"
                    style={{
                      background: "transparent",
                    }}
                  >
                    {widgets.map((widget) => {
                      const Icon = getWidgetIcon(widget.type)
                      return (
                        <div
                          key={widget.id}
                          id={`grid-item-${widget.id}`}
                          className="grid-stack-item"
                          gs-id={widget.id}
                          gs-x={widget.x}
                          gs-y={widget.y}
                          gs-w={widget.w}
                          gs-h={widget.h}
                        >
                          <div className="grid-stack-item-content">
                            <Card
                              className={`h-full cursor-pointer transition-all ${
                                selectedWidget?.id === widget.id ? "ring-2 ring-primary" : ""
                              }`}
                              onClick={() => setSelectedWidget(widget)}
                            >
                              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <div className="flex items-center gap-3">
                                  <GripVertical className="h-5 w-5 cursor-move text-muted-foreground" />
                                  <Icon className="h-5 w-5" />
                                  <div>
                                    <CardTitle className="text-base">{widget.title}</CardTitle>
                                    <CardDescription className="text-xs">
                                      {widget.type} • {widget.w}x{widget.h}
                                    </CardDescription>
                                  </div>
                                </div>
                                <div className="flex items-center gap-1">
                                  <Badge variant="outline">{widget.type}</Badge>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 w-8 p-0"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      removeWidget(widget.id)
                                    }}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              </CardHeader>
                              <CardContent className="flex items-center justify-center text-muted-foreground overflow-hidden">
                                {widget.type === "sql" ? (
                                  <div className="w-full h-full pointer-events-none">
                                    <SqlQueryWidget
                                      title={widget.title}
                                      defaultQuery={widget.config?.query || "SELECT * FROM table LIMIT 10"}
                                      endpoint={widget.dataSource}
                                      readOnly
                                    />
                                  </div>
                                ) : widget.type === "pivot" ? (
                                  <div className="w-full h-full pointer-events-none">
                                    <PivotTableWidget
                                      title={widget.title}
                                      dataSource={widget.dataSource}
                                      readOnly
                                    />
                                  </div>
                                ) : (
                                  <Icon className="h-12 w-12 opacity-20" />
                                )}
                              </CardContent>
                            </Card>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Right Sidebar - Configuration Panel */}
          {!previewMode && (
            <div className="w-80 border-l bg-muted/10">
              <Tabs value={currentTab} onValueChange={setCurrentTab} className="h-full">
                <div className="flex h-14 items-center border-b px-4">
                  <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="design">
                      <Palette className="mr-2 h-4 w-4" />
                      Design
                    </TabsTrigger>
                    <TabsTrigger value="data">
                      <BarChart3 className="mr-2 h-4 w-4" />
                      Données
                    </TabsTrigger>
                    <TabsTrigger value="access">
                      <Lock className="mr-2 h-4 w-4" />
                      Accès
                    </TabsTrigger>
                  </TabsList>
                </div>

                <ScrollArea className="h-[calc(100vh-7rem)]">
                  <div className="p-4">
                    <TabsContent value="design" className="mt-0 space-y-4">
                      <div className="space-y-4">
                        <div>
                          <h3 className="mb-3 text-sm font-medium">Informations</h3>
                          <div className="space-y-3">
                            <div className="space-y-2">
                              <Label className="text-xs">Nom</Label>
                              <Input
                                placeholder="Nom du dashboard"
                                value={dashboardName}
                                onChange={(e) => setDashboardName(e.target.value)}
                              />
                            </div>
                            <div className="space-y-2">
                              <Label className="text-xs">Description</Label>
                              <Textarea
                                placeholder="Description..."
                                value={dashboardDescription}
                                onChange={(e) => setDashboardDescription(e.target.value)}
                                rows={3}
                              />
                            </div>
                          </div>
                        </div>

                        <Separator />

                        {selectedWidget && (
                          <div>
                            <h3 className="mb-3 text-sm font-medium">Widget Sélectionné</h3>
                            <div className="space-y-3">
                              <div className="space-y-2">
                                <Label className="text-xs">Titre du Widget</Label>
                                <Input
                                  value={selectedWidget.title}
                                  onChange={(e) => updateWidget(selectedWidget.id, { title: e.target.value })}
                                />
                              </div>
                              <div className="space-y-2">
                                <Label className="text-xs">Taille</Label>
                                <Select
                                  value={selectedWidget.size}
                                  onValueChange={(value) =>
                                    updateWidget(selectedWidget.id, { size: value as any })
                                  }
                                >
                                  <SelectTrigger>
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="small">Petit (1/4)</SelectItem>
                                    <SelectItem value="medium">Moyen (1/2)</SelectItem>
                                    <SelectItem value="large">Grand (3/4)</SelectItem>
                                    <SelectItem value="full">Pleine largeur</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                              {selectedWidget.type === "chart" && (
                                <div className="space-y-2">
                                  <Label className="text-xs">Type de Graphique</Label>
                                  <Select
                                    value={selectedWidget.chartType || "line"}
                                    onValueChange={(value) =>
                                      updateWidget(selectedWidget.id, { chartType: value as ChartType })
                                    }
                                  >
                                    <SelectTrigger>
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="line">Ligne</SelectItem>
                                      <SelectItem value="bar">Barre</SelectItem>
                                      <SelectItem value="area">Area</SelectItem>
                                      <SelectItem value="pie">Pie</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </TabsContent>

                    <TabsContent value="data" className="mt-0 space-y-4">
                      {selectedWidget ? (
                        <div className="space-y-4">
                          <div>
                            <h3 className="mb-3 text-sm font-medium">Source de Données</h3>
                            <div className="space-y-3">
                              <div className="space-y-2">
                                <Label className="text-xs">Endpoint API</Label>
                                <Input
                                  placeholder="/api/v1/data"
                                  value={selectedWidget.dataSource || ""}
                                  onChange={(e) =>
                                    updateWidget(selectedWidget.id, { dataSource: e.target.value })
                                  }
                                />
                              </div>
                              <div className="space-y-2">
                                <Label className="text-xs">Intervalle de rafraîchissement</Label>
                                <Select defaultValue="30">
                                  <SelectTrigger>
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="0">Désactivé</SelectItem>
                                    <SelectItem value="10">10 secondes</SelectItem>
                                    <SelectItem value="30">30 secondes</SelectItem>
                                    <SelectItem value="60">1 minute</SelectItem>
                                    <SelectItem value="300">5 minutes</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="text-center text-sm text-muted-foreground">
                          Sélectionnez un widget pour configurer ses données
                        </div>
                      )}
                    </TabsContent>

                    <TabsContent value="access" className="mt-0 space-y-4">
                      <div className="space-y-4">
                        <div>
                          <h3 className="mb-3 text-sm font-medium">Visibilité</h3>
                          <div className="flex items-center justify-between">
                            <Label className="text-sm font-normal">Dashboard public</Label>
                            <Switch checked={isPublic} onCheckedChange={setIsPublic} />
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">
                            Visible par tous les utilisateurs
                          </p>
                        </div>
                        <Separator />
                        <div>
                          <h3 className="mb-3 text-sm font-medium">Permissions</h3>
                          <div className="space-y-2">
                            <Label className="text-xs">Rôles autorisés</Label>
                            <Select>
                              <SelectTrigger>
                                <SelectValue placeholder="Sélectionner..." />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="admin">Administrateur</SelectItem>
                                <SelectItem value="manager">Manager</SelectItem>
                                <SelectItem value="user">Utilisateur</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      </div>
                    </TabsContent>
                  </div>
                </ScrollArea>
              </Tabs>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
