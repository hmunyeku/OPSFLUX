"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Play, Download, RefreshCw, AlertCircle, CheckCircle2 } from "lucide-react"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Alert, AlertDescription } from "@/components/ui/alert"

interface SqlQueryWidgetProps {
  title?: string
  defaultQuery?: string
  endpoint?: string
  readOnly?: boolean
}

export function SqlQueryWidget({
  title = "Requête SQL",
  defaultQuery = "SELECT * FROM users LIMIT 10",
  endpoint = "/api/v1/database/query",
  readOnly = false,
}: SqlQueryWidgetProps) {
  const [query, setQuery] = useState(defaultQuery)
  const [isExecuting, setIsExecuting] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)

  const executeQuery = async () => {
    setIsExecuting(true)
    setError(null)

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.detail || "Erreur lors de l'exécution de la requête")
      }

      setResult(data)
    } catch (err: any) {
      setError(err.message || "Une erreur est survenue")
      setResult(null)
    } finally {
      setIsExecuting(false)
    }
  }

  const exportToCSV = () => {
    if (!result || !result.data || result.data.length === 0) return

    const headers = result.columns.join(",")
    const rows = result.data.map((row: any[]) => row.join(","))
    const csv = [headers, ...rows].join("\n")

    const blob = new Blob([csv], { type: "text/csv" })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "query-result.csv"
    a.click()
    window.URL.revokeObjectURL(url)
  }

  return (
    <Card className="h-full flex flex-col">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg">{title}</CardTitle>
            <CardDescription>Exécuter des requêtes SQL personnalisées</CardDescription>
          </div>
          {result && (
            <Badge variant="outline">
              {result.row_count} {result.row_count === 1 ? "résultat" : "résultats"}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col gap-4 overflow-hidden">
        {/* Query Editor */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium">Requête SQL</label>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={executeQuery}
                disabled={isExecuting || !query.trim()}
              >
                {isExecuting ? (
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Play className="mr-2 h-4 w-4" />
                )}
                Exécuter
              </Button>
              {result && result.data && result.data.length > 0 && (
                <Button size="sm" variant="outline" onClick={exportToCSV}>
                  <Download className="mr-2 h-4 w-4" />
                  CSV
                </Button>
              )}
            </div>
          </div>
          <Textarea
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="SELECT * FROM table_name WHERE ..."
            className="font-mono text-sm min-h-[100px]"
            disabled={readOnly || isExecuting}
          />
        </div>

        {/* Error Message */}
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Success Message */}
        {result && !error && (
          <Alert>
            <CheckCircle2 className="h-4 w-4" />
            <AlertDescription>
              Requête exécutée avec succès en {result.execution_time || "0"}ms
            </AlertDescription>
          </Alert>
        )}

        {/* Results Table */}
        {result && result.data && result.data.length > 0 && (
          <div className="flex-1 border rounded-lg overflow-hidden">
            <ScrollArea className="h-full">
              <Table>
                <TableHeader>
                  <TableRow>
                    {result.columns.map((col: string, idx: number) => (
                      <TableHead key={idx} className="font-semibold">
                        {col}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {result.data.map((row: any[], rowIdx: number) => (
                    <TableRow key={rowIdx}>
                      {row.map((cell: any, cellIdx: number) => (
                        <TableCell key={cellIdx} className="font-mono text-xs">
                          {cell === null ? (
                            <span className="text-muted-foreground italic">null</span>
                          ) : (
                            String(cell)
                          )}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          </div>
        )}

        {/* Empty State */}
        {!result && !error && !isExecuting && (
          <div className="flex-1 flex items-center justify-center border-2 border-dashed rounded-lg">
            <div className="text-center text-muted-foreground">
              <Play className="mx-auto h-8 w-8 mb-2 opacity-50" />
              <p className="text-sm">Exécutez une requête pour voir les résultats</p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
