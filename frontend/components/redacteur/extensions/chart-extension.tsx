"use client"

import { Node, mergeAttributes } from "@tiptap/core"
import { ReactNodeViewRenderer, NodeViewWrapper } from "@tiptap/react"
import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Settings2, BarChart3, LineChart, PieChart } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import {
  Line,
  Bar,
  Pie,
  Area,
  LineChart as RechartsLine,
  BarChart as RechartsBar,
  PieChart as RechartsPie,
  AreaChart as RechartsArea,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
} from "recharts"

// Types
interface ChartConfig {
  chartType: "line" | "bar" | "pie" | "area"
  dataSource: "manual" | "api" | "reference"
  data: any[]
  xAxisKey?: string
  yAxisKey?: string
  dataKeys?: string[]
  colors?: string[]
  title?: string
  showLegend?: boolean
  showGrid?: boolean
}

interface ChartAttributes {
  config: ChartConfig
}

const DEFAULT_COLORS = [
  "#8884d8",
  "#82ca9d",
  "#ffc658",
  "#ff7c7c",
  "#a28fd8",
  "#ff9f40"
]

// Composant de rendu
const ChartBlockComponent = ({ node, updateAttributes, deleteNode, editor }: any) => {
  const { config } = node.attrs as ChartAttributes
  const [showConfig, setShowConfig] = useState(false)
  const [editConfig, setEditConfig] = useState<ChartConfig>(config || {
    chartType: "bar",
    dataSource: "manual",
    data: [
      { name: "Jan", value: 400 },
      { name: "Fév", value: 300 },
      { name: "Mar", value: 600 },
      { name: "Avr", value: 800 },
      { name: "Mai", value: 500 },
    ],
    xAxisKey: "name",
    yAxisKey: "value",
    dataKeys: ["value"],
    colors: DEFAULT_COLORS,
    title: "Graphique",
    showLegend: true,
    showGrid: true,
  })

  const handleSaveConfig = () => {
    updateAttributes({ config: editConfig })
    setShowConfig(false)
  }

  const handleDataChange = (jsonString: string) => {
    try {
      const parsed = JSON.parse(jsonString)
      setEditConfig({ ...editConfig, data: parsed })
    } catch (e) {
      // Invalid JSON, ignore
    }
  }

  // Render chart based on type
  const renderChart = () => {
    const { chartType, data, xAxisKey, yAxisKey, dataKeys, colors, showLegend, showGrid, title } = config

    if (!data || data.length === 0) {
      return (
        <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
          Aucune donnée à afficher
        </div>
      )
    }

    const chartColors = colors || DEFAULT_COLORS

    switch (chartType) {
      case "line":
        return (
          <ResponsiveContainer width="100%" height={300}>
            <RechartsLine data={data}>
              {showGrid && <CartesianGrid strokeDasharray="3 3" />}
              <XAxis dataKey={xAxisKey} />
              <YAxis />
              <Tooltip />
              {showLegend && <Legend />}
              {dataKeys?.map((key, index) => (
                <Line
                  key={key}
                  type="monotone"
                  dataKey={key}
                  stroke={chartColors[index % chartColors.length]}
                  strokeWidth={2}
                />
              ))}
            </RechartsLine>
          </ResponsiveContainer>
        )

      case "bar":
        return (
          <ResponsiveContainer width="100%" height={300}>
            <RechartsBar data={data}>
              {showGrid && <CartesianGrid strokeDasharray="3 3" />}
              <XAxis dataKey={xAxisKey} />
              <YAxis />
              <Tooltip />
              {showLegend && <Legend />}
              {dataKeys?.map((key, index) => (
                <Bar
                  key={key}
                  dataKey={key}
                  fill={chartColors[index % chartColors.length]}
                />
              ))}
            </RechartsBar>
          </ResponsiveContainer>
        )

      case "pie":
        return (
          <ResponsiveContainer width="100%" height={300}>
            <RechartsPie>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, percent }: any) => `${name}: ${(percent * 100).toFixed(0)}%`}
                outerRadius={100}
                fill="#8884d8"
                dataKey={yAxisKey || "value"}
              >
                {data.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={chartColors[index % chartColors.length]} />
                ))}
              </Pie>
              <Tooltip />
              {showLegend && <Legend />}
            </RechartsPie>
          </ResponsiveContainer>
        )

      case "area":
        return (
          <ResponsiveContainer width="100%" height={300}>
            <RechartsArea data={data}>
              {showGrid && <CartesianGrid strokeDasharray="3 3" />}
              <XAxis dataKey={xAxisKey} />
              <YAxis />
              <Tooltip />
              {showLegend && <Legend />}
              {dataKeys?.map((key, index) => (
                <Area
                  key={key}
                  type="monotone"
                  dataKey={key}
                  stroke={chartColors[index % chartColors.length]}
                  fill={chartColors[index % chartColors.length]}
                  fillOpacity={0.6}
                />
              ))}
            </RechartsArea>
          </ResponsiveContainer>
        )

      default:
        return <div>Type de graphique non supporté</div>
    }
  }

  const getChartIcon = () => {
    switch (config?.chartType) {
      case "line":
        return <LineChart className="h-4 w-4" />
      case "bar":
        return <BarChart3 className="h-4 w-4" />
      case "pie":
        return <PieChart className="h-4 w-4" />
      case "area":
        return <LineChart className="h-4 w-4" />
      default:
        return <BarChart3 className="h-4 w-4" />
    }
  }

  return (
    <NodeViewWrapper className="chart-block my-4">
      <Card className="border-primary/20">
        <CardHeader className="p-3 bg-primary/5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="text-primary">{getChartIcon()}</div>
              <CardTitle className="text-sm">{config?.title || "Graphique"}</CardTitle>
              <Badge variant="outline" className="text-xs capitalize">
                {config?.chartType}
              </Badge>
            </div>
            <div className="flex items-center gap-1">
              <Dialog open={showConfig} onOpenChange={setShowConfig}>
                <DialogTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                    <Settings2 className="h-3.5 w-3.5" />
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>Configuration du Graphique</DialogTitle>
                    <DialogDescription>
                      Personnalisez le type, les données et l'apparence
                    </DialogDescription>
                  </DialogHeader>

                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="title">Titre</Label>
                        <Input
                          id="title"
                          value={editConfig.title || ""}
                          onChange={(e) =>
                            setEditConfig({ ...editConfig, title: e.target.value })
                          }
                          placeholder="Mon graphique"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="chartType">Type de graphique</Label>
                        <Select
                          value={editConfig.chartType}
                          onValueChange={(value: any) =>
                            setEditConfig({ ...editConfig, chartType: value })
                          }
                        >
                          <SelectTrigger id="chartType">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="line">Ligne</SelectItem>
                            <SelectItem value="bar">Barres</SelectItem>
                            <SelectItem value="pie">Camembert</SelectItem>
                            <SelectItem value="area">Aire</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="dataSource">Source de données</Label>
                      <Select
                        value={editConfig.dataSource}
                        onValueChange={(value: any) =>
                          setEditConfig({ ...editConfig, dataSource: value })
                        }
                      >
                        <SelectTrigger id="dataSource">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="manual">Manuelle (JSON)</SelectItem>
                          <SelectItem value="api">API</SelectItem>
                          <SelectItem value="reference">Référence bloc</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {editConfig.dataSource === "manual" && (
                      <div className="space-y-2">
                        <Label htmlFor="data">Données (JSON)</Label>
                        <Textarea
                          id="data"
                          className="font-mono text-xs min-h-[150px]"
                          value={JSON.stringify(editConfig.data, null, 2)}
                          onChange={(e) => handleDataChange(e.target.value)}
                          placeholder='[{"name": "A", "value": 100}, ...]'
                        />
                        <p className="text-xs text-muted-foreground">
                          Format: tableau d'objets avec clés communes
                        </p>
                      </div>
                    )}

                    {editConfig.chartType !== "pie" && (
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="xAxisKey">Clé axe X</Label>
                          <Input
                            id="xAxisKey"
                            value={editConfig.xAxisKey || ""}
                            onChange={(e) =>
                              setEditConfig({ ...editConfig, xAxisKey: e.target.value })
                            }
                            placeholder="name"
                          />
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="yAxisKey">Clé(s) axe Y</Label>
                          <Input
                            id="yAxisKey"
                            value={editConfig.dataKeys?.join(", ") || ""}
                            onChange={(e) =>
                              setEditConfig({
                                ...editConfig,
                                dataKeys: e.target.value.split(",").map((s) => s.trim()),
                              })
                            }
                            placeholder="value, value2"
                          />
                          <p className="text-xs text-muted-foreground">
                            Séparez par virgule pour plusieurs séries
                          </p>
                        </div>
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-4">
                      <div className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          id="showLegend"
                          checked={editConfig.showLegend}
                          onChange={(e) =>
                            setEditConfig({ ...editConfig, showLegend: e.target.checked })
                          }
                          className="rounded"
                        />
                        <Label htmlFor="showLegend" className="cursor-pointer">
                          Afficher la légende
                        </Label>
                      </div>

                      <div className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          id="showGrid"
                          checked={editConfig.showGrid}
                          onChange={(e) =>
                            setEditConfig({ ...editConfig, showGrid: e.target.checked })
                          }
                          className="rounded"
                        />
                        <Label htmlFor="showGrid" className="cursor-pointer">
                          Afficher la grille
                        </Label>
                      </div>
                    </div>

                    <div className="flex items-center justify-end gap-2 pt-4 border-t">
                      <Button variant="outline" onClick={() => setShowConfig(false)}>
                        Annuler
                      </Button>
                      <Button onClick={handleSaveConfig}>Enregistrer</Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>

              {editor.isEditable && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                  onClick={deleteNode}
                >
                  ×
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-4">{renderChart()}</CardContent>
      </Card>
    </NodeViewWrapper>
  )
}

// Extension Tiptap
export const ChartExtension = Node.create({
  name: "chart",

  group: "block",

  atom: true,

  addAttributes() {
    return {
      config: {
        default: {
          chartType: "bar",
          dataSource: "manual",
          data: [],
          xAxisKey: "name",
          yAxisKey: "value",
          dataKeys: ["value"],
          colors: DEFAULT_COLORS,
          title: "Graphique",
          showLegend: true,
          showGrid: true,
        },
      },
    }
  },

  parseHTML() {
    return [
      {
        tag: "div[data-type='chart']",
      },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-type": "chart" })]
  },

  addNodeView() {
    return ReactNodeViewRenderer(ChartBlockComponent)
  },

  addCommands() {
    return {
      setChart:
        (attributes: Partial<ChartAttributes>) =>
        ({ commands }: any) => {
          return commands.insertContent({
            type: this.name,
            attrs: attributes,
          })
        },
    }
  },
})
