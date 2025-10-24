"use client"

import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { useToast } from "@/hooks/use-toast"
import { auth } from "@/lib/auth"
import { IconRefresh, IconDownload } from "@tabler/icons-react"
import { Skeleton } from "@/components/ui/skeleton"
import dynamic from "next/dynamic"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL
  ? `${process.env.NEXT_PUBLIC_API_URL}/api/v1`
  : "/api/v1"

// Dynamic import pour éviter les problèmes SSR avec react-pivottable
const PivotTableUI = dynamic(
  () => import("react-pivottable/PivotTableUI"),
  { ssr: false }
)

import "react-pivottable/pivottable.css"

interface PivotTableWidgetProps {
  config?: {
    title?: string
    description?: string
    dataSource?: string // URL de l'API ou 'sql'
    query?: string // Requête SQL si dataSource = 'sql'
    refreshInterval?: number // en secondes, 0 = pas de refresh auto
    initialState?: any // État initial du pivot (rows, cols, aggregator, etc.)
  }
}

export default function PivotTableWidget({ config }: PivotTableWidgetProps) {
  const {
    title = "Tableau Croisé Dynamique",
    description = "Analyse de données interactive",
    dataSource = "",
    query = "",
    refreshInterval = 0,
    initialState = {},
  } = config || {}

  const [data, setData] = useState<any[]>([])
  const [pivotState, setPivotState] = useState(initialState)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tables, setTables] = useState<string[]>([])
  const [selectedTable, setSelectedTable] = useState<string>("")
  const { toast } = useToast()

  const fetchTables = async () => {
    try {
      const token = auth.getToken()
      if (!token) return

      const response = await fetch(`${API_BASE_URL}/database/tables`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })

      if (response.ok) {
        const data = await response.json()
        setTables(data.tables || [])
      }
    } catch (err) {
      console.error("Error fetching tables:", err)
    }
  }

  const fetchData = async (tableName?: string) => {
    const targetTable = tableName || selectedTable

    if (!dataSource && !query && !targetTable) {
      // Données d'exemple si aucune source configurée
      setData([
        { Region: "Est", Product: "Laptop", Sales: 1200, Quantity: 4 },
        { Region: "Ouest", Product: "Laptop", Sales: 900, Quantity: 3 },
        { Region: "Est", Product: "Phone", Sales: 600, Quantity: 10 },
        { Region: "Ouest", Product: "Phone", Sales: 450, Quantity: 7 },
        { Region: "Nord", Product: "Laptop", Sales: 1500, Quantity: 5 },
        { Region: "Nord", Product: "Tablet", Sales: 800, Quantity: 8 },
        { Region: "Sud", Product: "Phone", Sales: 550, Quantity: 9 },
        { Region: "Sud", Product: "Tablet", Sales: 400, Quantity: 6 },
      ])
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      const token = auth.getToken()
      if (!token) throw new Error("Non authentifié")

      let url = dataSource
      let body = null

      if (query) {
        // Utiliser l'API SQL
        url = `${API_BASE_URL}/database/query`
        body = JSON.stringify({ query })
      } else if (targetTable) {
        // Requête pour récupérer toutes les données d'une table
        url = `${API_BASE_URL}/database/query`
        body = JSON.stringify({ query: `SELECT * FROM ${targetTable} LIMIT 1000` })
      }

      const response = await fetch(url, {
        method: body ? "POST" : "GET",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body,
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.detail || "Erreur lors du chargement des données")
      }

      const result = await response.json()
      const rows = result.rows || result.data || result

      if (Array.isArray(rows)) {
        setData(rows)
      } else {
        throw new Error("Format de données invalide")
      }

      toast({
        title: "Données chargées",
        description: `${rows.length} ligne(s) chargée(s)`,
      })
    } catch (err: any) {
      console.error("Pivot Table Data Error:", err)
      setError(err.message)
      toast({
        title: "Erreur",
        description: err.message,
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  // Ref pour éviter les boucles infinies
  const isFirstRender = useRef(true)

  // Charger les tables au montage
  useEffect(() => {
    fetchTables()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Auto-refresh si configuré
  useEffect(() => {
    // Chargement initial
    if (isFirstRender.current) {
      isFirstRender.current = false
      fetchData()
    }

    // Auto-refresh si configuré
    if (refreshInterval > 0) {
      const interval = setInterval(() => fetchData(), refreshInterval * 1000)
      return () => clearInterval(interval)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshInterval])

  // Charger les données quand une table est sélectionnée
  const handleTableSelect = (table: string) => {
    setSelectedTable(table)
    fetchData(table)
  }

  const downloadData = () => {
    if (data.length === 0) return

    const csv = [
      Object.keys(data[0]).join(","),
      ...data.map((row) => Object.values(row).map((v) => `"${v}"`).join(",")),
    ].join("\n")

    const blob = new Blob([csv], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `pivot-data-${Date.now()}.csv`
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
            {data.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={downloadData}
                className="h-8 w-8 p-0"
              >
                <IconDownload className="h-4 w-4" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={fetchData}
              disabled={isLoading}
              className="h-8 w-8 p-0"
            >
              <IconRefresh className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4">
        {/* Sélecteur de table */}
        {!query && !dataSource && tables.length > 0 && (
          <div className="mb-4">
            <label className="text-xs font-medium text-muted-foreground mb-2 block">
              Sélectionner une table
            </label>
            <Select value={selectedTable} onValueChange={handleTableSelect}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Choisir une table..." />
              </SelectTrigger>
              <SelectContent>
                {tables.map((table) => (
                  <SelectItem key={table} value={table}>
                    {table}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        ) : error ? (
          <div className="p-4 border border-destructive rounded-lg bg-destructive/10">
            <p className="text-sm text-destructive">{error}</p>
          </div>
        ) : data.length > 0 ? (
          <div className="pivot-table-container">
            <PivotTableUI
              data={data}
              onChange={(s: any) => setPivotState(s)}
              {...pivotState}
            />
          </div>
        ) : (
          <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
            Aucune donnée disponible
          </div>
        )}
      </div>

      <style jsx global>{`
        .pivot-table-container {
          font-size: 12px;
        }

        .pivot-table-container table {
          font-size: 11px;
        }

        .pivot-table-container .pvtUi {
          color: hsl(var(--foreground));
        }

        .pivot-table-container select,
        .pivot-table-container input {
          background: hsl(var(--background));
          border: 1px solid hsl(var(--border));
          color: hsl(var(--foreground));
          border-radius: 0.375rem;
          padding: 0.25rem 0.5rem;
          font-size: 11px;
        }

        .pivot-table-container .pvtTable {
          border: 1px solid hsl(var(--border));
        }

        .pivot-table-container .pvtTable thead tr th,
        .pivot-table-container .pvtTable tbody tr th {
          background: hsl(var(--muted));
          border: 1px solid hsl(var(--border));
          color: hsl(var(--foreground));
          font-weight: 600;
        }

        .pivot-table-container .pvtTable tbody tr td {
          background: hsl(var(--card));
          border: 1px solid hsl(var(--border));
          color: hsl(var(--foreground));
        }

        .pivot-table-container .pvtAxisContainer,
        .pivot-table-container .pvtVals {
          border: 1px solid hsl(var(--border));
          background: hsl(var(--muted) / 0.5);
        }
      `}</style>
    </div>
  )
}
