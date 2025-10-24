"use client"

import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/hooks/use-toast"
import { auth } from "@/lib/auth"
import { IconPlayerPlay, IconRefresh, IconDownload, IconTable } from "@tabler/icons-react"

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL
  ? `${process.env.NEXT_PUBLIC_API_URL}/api/v1`
  : "/api/v1"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Skeleton } from "@/components/ui/skeleton"

interface SQLQueryWidgetProps {
  config?: {
    title?: string
    description?: string
    query?: string
    refreshInterval?: number // en secondes, 0 = pas de refresh auto
    showRowCount?: boolean
  }
}

export default function SQLQueryWidget({ config }: SQLQueryWidgetProps) {
  const {
    title = "Requête SQL",
    description = "Exécuter une requête SQL personnalisée",
    query: initialQuery = "",
    refreshInterval = 0,
    showRowCount = true,
  } = config || {}

  const [query, setQuery] = useState(initialQuery)
  const [results, setResults] = useState<any[]>([])
  const [columns, setColumns] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastExecuted, setLastExecuted] = useState<Date | null>(null)
  const { toast } = useToast()

  const executeQuery = async (sqlQuery: string) => {
    if (!sqlQuery.trim()) {
      toast({
        title: "Erreur",
        description: "La requête SQL est vide",
        variant: "destructive",
      })
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      const token = auth.getToken()
      if (!token) throw new Error("Non authentifié")

      // Appel API pour exécuter la requête SQL
      const response = await fetch(`${API_BASE_URL}/database/query`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ query: sqlQuery }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.detail || "Erreur lors de l'exécution de la requête")
      }

      const data = await response.json()

      if (data.rows && data.rows.length > 0) {
        setColumns(Object.keys(data.rows[0]))
        setResults(data.rows)
      } else {
        setColumns([])
        setResults([])
      }

      setLastExecuted(new Date())
      toast({
        title: "Succès",
        description: `Requête exécutée: ${data.rows?.length || 0} ligne(s)`,
      })
    } catch (err: any) {
      console.error("SQL Query Error:", err)
      setError(err.message)
      toast({
        title: "Erreur SQL",
        description: err.message,
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  // Ref pour éviter les boucles infinies
  const isFirstRender = useRef(true)

  // Auto-refresh si configuré
  useEffect(() => {
    if (!initialQuery) return

    // Exécution initiale
    if (isFirstRender.current) {
      isFirstRender.current = false
      executeQuery(initialQuery)
    }

    // Auto-refresh si configuré
    if (refreshInterval > 0) {
      const interval = setInterval(() => {
        executeQuery(initialQuery)
      }, refreshInterval * 1000)

      return () => clearInterval(interval)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshInterval])

  const downloadCSV = () => {
    if (results.length === 0) return

    const csv = [
      columns.join(","),
      ...results.map((row) => columns.map((col) => `"${row[col]}"`).join(",")),
    ].join("\n")

    const blob = new Blob([csv], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `query-results-${Date.now()}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex-none p-4 pb-3 border-b">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-lg font-semibold">{title}</h3>
            {description && (
              <p className="text-xs text-muted-foreground mt-1">{description}</p>
            )}
          </div>
          <div className="flex items-center gap-1">
            {results.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={downloadCSV}
                className="h-8 w-8 p-0"
              >
                <IconDownload className="h-4 w-4" />
              </Button>
            )}
            {refreshInterval > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => executeQuery(query || initialQuery)}
                disabled={isLoading}
                className="h-8 w-8 p-0"
              >
                <IconRefresh className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col gap-3 overflow-hidden p-4">
        {/* Éditeur SQL */}
        <div className="flex-none">
          <div className="flex items-center gap-2">
            <Textarea
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="SELECT * FROM users LIMIT 10"
              className="font-mono text-xs min-h-[80px]"
              disabled={!!initialQuery} // Désactiver si query est en config
            />
            <Button
              onClick={() => executeQuery(query)}
              disabled={isLoading || !query.trim()}
              size="sm"
              className="shrink-0"
            >
              <IconPlayerPlay className="h-4 w-4 mr-1" />
              Exécuter
            </Button>
          </div>
        </div>

        {/* Résultats */}
        <div className="flex-1 min-h-0">
          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
            </div>
          ) : error ? (
            <div className="p-4 border border-destructive rounded-lg bg-destructive/10">
              <p className="text-sm text-destructive font-mono">{error}</p>
            </div>
          ) : results.length > 0 ? (
            <div className="border rounded-lg overflow-hidden h-full flex flex-col">
              {showRowCount && (
                <div className="flex-none px-3 py-1.5 bg-muted/50 border-b text-xs text-muted-foreground flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <IconTable className="h-3 w-3" />
                    {results.length} ligne(s)
                  </span>
                  {lastExecuted && (
                    <span>Dernière exécution: {lastExecuted.toLocaleTimeString()}</span>
                  )}
                </div>
              )}
              <ScrollArea className="flex-1">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {columns.map((col) => (
                        <TableHead key={col} className="text-xs font-semibold">
                          {col}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {results.map((row, i) => (
                      <TableRow key={i}>
                        {columns.map((col) => (
                          <TableCell key={col} className="text-xs">
                            {row[col] !== null && row[col] !== undefined
                              ? String(row[col])
                              : <span className="text-muted-foreground italic">null</span>
                            }
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            </div>
          ) : (
            <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
              Aucun résultat
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
