"use client"

import { Node, mergeAttributes } from "@tiptap/core"
import { ReactNodeViewRenderer, NodeViewWrapper } from "@tiptap/react"
import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Loader2, RefreshCw, Settings2, Database, AlertCircle } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"

// Types
interface DataFetchConfig {
  id?: string
  source: "api" | "database" | "file"
  endpoint?: string
  query?: string
  fields: string[]
  refresh: number // minutes
  cache: boolean
  displayAs: "table" | "list" | "cards" | "raw"
}

interface DataFetchAttributes {
  config: DataFetchConfig
  data?: any[]
  lastFetch?: string
  error?: string
}

// Composant de rendu
const DataFetchBlockComponent = ({ node, updateAttributes, deleteNode, editor }: any) => {
  const { config, data, lastFetch, error } = node.attrs as DataFetchAttributes
  const [isLoading, setIsLoading] = useState(false)
  const [localData, setLocalData] = useState(data || [])
  const [localError, setLocalError] = useState(error)
  const [showConfig, setShowConfig] = useState(false)
  const [editConfig, setEditConfig] = useState<DataFetchConfig>(config || {
    source: "api",
    endpoint: "",
    query: "",
    fields: [],
    refresh: 60,
    cache: true,
    displayAs: "table"
  })

  // Fetch data
  const fetchData = async () => {
    if (!config?.endpoint && !config?.query) {
      setLocalError("Configuration incomplète")
      return
    }

    setIsLoading(true)
    setLocalError(undefined)

    try {
      let fetchedData: any[] = []

      if (config.source === "api") {
        const response = await fetch(config.endpoint!)
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        fetchedData = await response.json()
      } else if (config.source === "database") {
        // Appel à votre API backend pour requête DB
        const response = await fetch("/api/v1/redacteur/query", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: config.query })
        })
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        const result = await response.json()
        fetchedData = result.data
      }

      setLocalData(fetchedData)
      updateAttributes({
        data: fetchedData,
        lastFetch: new Date().toISOString(),
        error: undefined
      })
    } catch (err: any) {
      const errorMsg = err.message || "Erreur de récupération"
      setLocalError(errorMsg)
      updateAttributes({ error: errorMsg })
    } finally {
      setIsLoading(false)
    }
  }

  // Auto-refresh
  useEffect(() => {
    if (config?.refresh && config.refresh > 0) {
      const interval = setInterval(fetchData, config.refresh * 60 * 1000)
      return () => clearInterval(interval)
    }
  }, [config?.refresh])

  // Initial fetch
  useEffect(() => {
    if (config && !data && !error) {
      fetchData()
    }
  }, [])

  // Save configuration
  const handleSaveConfig = () => {
    updateAttributes({ config: editConfig })
    setShowConfig(false)
    fetchData()
  }

  // Render data based on displayAs
  const renderData = () => {
    if (isLoading) {
      return (
        <div className="flex items-center justify-center p-8">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <span className="ml-2 text-sm text-muted-foreground">Chargement des données...</span>
        </div>
      )
    }

    if (localError) {
      return (
        <div className="flex items-center gap-2 p-4 bg-destructive/10 border border-destructive/20 rounded">
          <AlertCircle className="h-5 w-5 text-destructive" />
          <span className="text-sm text-destructive">{localError}</span>
        </div>
      )
    }

    if (!localData || localData.length === 0) {
      return (
        <div className="text-center p-8 text-sm text-muted-foreground">
          Aucune donnée disponible
        </div>
      )
    }

    const fields = config?.fields || Object.keys(localData[0] || {})

    switch (config?.displayAs) {
      case "table":
        return (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b bg-muted/50">
                  {fields.map((field, idx) => (
                    <th key={idx} className="px-4 py-2 text-left text-xs font-medium">
                      {field}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {localData.map((row, idx) => (
                  <tr key={idx} className="border-b hover:bg-muted/30">
                    {fields.map((field, fieldIdx) => (
                      <td key={fieldIdx} className="px-4 py-2 text-sm">
                        {row[field] ?? "-"}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )

      case "cards":
        return (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {localData.map((item, idx) => (
              <Card key={idx} className="p-3">
                {fields.map((field, fieldIdx) => (
                  <div key={fieldIdx} className="mb-2">
                    <span className="text-xs font-medium text-muted-foreground">{field}:</span>
                    <span className="ml-2 text-sm">{item[field] ?? "-"}</span>
                  </div>
                ))}
              </Card>
            ))}
          </div>
        )

      case "list":
        return (
          <ul className="space-y-2">
            {localData.map((item, idx) => (
              <li key={idx} className="flex items-start gap-2 p-2 rounded hover:bg-muted/30">
                <span className="text-primary">•</span>
                <div className="flex-1">
                  {fields.map((field, fieldIdx) => (
                    <div key={fieldIdx}>
                      <span className="text-xs text-muted-foreground">{field}:</span>
                      <span className="ml-2 text-sm">{item[field] ?? "-"}</span>
                    </div>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )

      case "raw":
        return (
          <pre className="p-4 bg-muted/30 rounded text-xs overflow-auto">
            {JSON.stringify(localData, null, 2)}
          </pre>
        )

      default:
        return <div>Format d'affichage non supporté</div>
    }
  }

  return (
    <NodeViewWrapper className="data-fetch-block my-4">
      <Card className="border-primary/20">
        <CardHeader className="p-3 bg-primary/5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Database className="h-4 w-4 text-primary" />
              <CardTitle className="text-sm">Bloc de Données Dynamiques</CardTitle>
              {lastFetch && (
                <Badge variant="outline" className="text-xs">
                  Dernière màj: {new Date(lastFetch).toLocaleString()}
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0"
                onClick={fetchData}
                disabled={isLoading}
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
              </Button>

              <Dialog open={showConfig} onOpenChange={setShowConfig}>
                <DialogTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                    <Settings2 className="h-3.5 w-3.5" />
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl">
                  <DialogHeader>
                    <DialogTitle>Configuration du Bloc</DialogTitle>
                    <DialogDescription>
                      Configurez la source de données et l'affichage
                    </DialogDescription>
                  </DialogHeader>

                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="source">Source de données</Label>
                      <Select
                        value={editConfig.source}
                        onValueChange={(value: any) =>
                          setEditConfig({ ...editConfig, source: value })
                        }
                      >
                        <SelectTrigger id="source">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="api">API REST</SelectItem>
                          <SelectItem value="database">Base de données</SelectItem>
                          <SelectItem value="file">Fichier</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {editConfig.source === "api" && (
                      <div className="space-y-2">
                        <Label htmlFor="endpoint">URL de l'API</Label>
                        <Input
                          id="endpoint"
                          value={editConfig.endpoint || ""}
                          onChange={(e) =>
                            setEditConfig({ ...editConfig, endpoint: e.target.value })
                          }
                          placeholder="https://api.example.com/data"
                        />
                      </div>
                    )}

                    {editConfig.source === "database" && (
                      <div className="space-y-2">
                        <Label htmlFor="query">Requête SQL</Label>
                        <textarea
                          id="query"
                          className="w-full min-h-[100px] p-2 border rounded text-sm font-mono"
                          value={editConfig.query || ""}
                          onChange={(e) =>
                            setEditConfig({ ...editConfig, query: e.target.value })
                          }
                          placeholder="SELECT * FROM table WHERE..."
                        />
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="displayAs">Type d'affichage</Label>
                        <Select
                          value={editConfig.displayAs}
                          onValueChange={(value: any) =>
                            setEditConfig({ ...editConfig, displayAs: value })
                          }
                        >
                          <SelectTrigger id="displayAs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="table">Tableau</SelectItem>
                            <SelectItem value="cards">Cartes</SelectItem>
                            <SelectItem value="list">Liste</SelectItem>
                            <SelectItem value="raw">JSON Brut</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="refresh">Actualisation (minutes)</Label>
                        <Input
                          id="refresh"
                          type="number"
                          min="0"
                          value={editConfig.refresh}
                          onChange={(e) =>
                            setEditConfig({ ...editConfig, refresh: parseInt(e.target.value) })
                          }
                        />
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
        <CardContent className="p-3">{renderData()}</CardContent>
      </Card>
    </NodeViewWrapper>
  )
}

// Extension Tiptap
export const DataFetchExtension = Node.create({
  name: "dataFetch",

  group: "block",

  atom: true,

  addAttributes() {
    return {
      config: {
        default: {
          source: "api",
          endpoint: "",
          query: "",
          fields: [],
          refresh: 60,
          cache: true,
          displayAs: "table"
        },
      },
      data: {
        default: null,
      },
      lastFetch: {
        default: null,
      },
      error: {
        default: null,
      },
    }
  },

  parseHTML() {
    return [
      {
        tag: "div[data-type='data-fetch']",
      },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-type": "data-fetch" })]
  },

  addNodeView() {
    return ReactNodeViewRenderer(DataFetchBlockComponent)
  },

  addCommands() {
    return {
      setDataFetch:
        (attributes: Partial<DataFetchAttributes>) =>
        ({ commands }: any) => {
          return commands.insertContent({
            type: this.name,
            attrs: attributes,
          })
        },
    }
  },
})
