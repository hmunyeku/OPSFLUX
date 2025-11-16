"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { RefreshCw, Download, AlertCircle } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import dynamic from "next/dynamic"

// Import PivotTableUI dynamically to avoid SSR issues
const PivotTableUI = dynamic(
  () => import("react-pivottable/PivotTableUI").then((mod) => mod.default),
  { ssr: false }
)

// Import pivot table CSS
import "react-pivottable/pivottable.css"

interface PivotTableWidgetProps {
  title?: string
  dataSource?: string
  initialData?: any[]
  readOnly?: boolean
}

export function PivotTableWidget({
  title = "Tableau Croisé Dynamique",
  dataSource,
  initialData = [],
  readOnly = false,
}: PivotTableWidgetProps) {
  const [data, setData] = useState<any[]>(initialData)
  const [pivotState, setPivotState] = useState<any>({})
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (dataSource && !initialData.length) {
      fetchData()
    }
  }, [dataSource])

  const fetchData = async () => {
    if (!dataSource) return

    setIsLoading(true)
    setError(null)

    try {
      const response = await fetch(dataSource)
      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.detail || "Erreur lors du chargement des données")
      }

      // Handle different response formats
      const dataArray = Array.isArray(result) ? result : result.data || result.results || []
      setData(dataArray)
    } catch (err: any) {
      setError(err.message || "Une erreur est survenue")
      setData([])
    } finally {
      setIsLoading(false)
    }
  }

  const exportToCSV = () => {
    if (!data || data.length === 0) return

    const headers = Object.keys(data[0]).join(",")
    const rows = data.map((row) => Object.values(row).join(","))
    const csv = [headers, ...rows].join("\n")

    const blob = new Blob([csv], { type: "text/csv" })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "pivot-data.csv"
    a.click()
    window.URL.revokeObjectURL(url)
  }

  return (
    <Card className="h-full flex flex-col">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg">{title}</CardTitle>
            <CardDescription>Analyse interactive avec tableau croisé dynamique</CardDescription>
          </div>
          <div className="flex gap-2 items-center">
            {data.length > 0 && (
              <Badge variant="outline">
                {data.length} {data.length === 1 ? "ligne" : "lignes"}
              </Badge>
            )}
            {dataSource && (
              <Button size="sm" variant="outline" onClick={fetchData} disabled={isLoading}>
                {isLoading ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
              </Button>
            )}
            {data.length > 0 && (
              <Button size="sm" variant="outline" onClick={exportToCSV}>
                <Download className="mr-2 h-4 w-4" />
                CSV
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex-1 overflow-auto">
        {/* Error Message */}
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Pivot Table */}
        {!error && data.length > 0 && (
          <div className="pivot-table-container">
            <PivotTableUI
              data={data}
              onChange={(s: any) => setPivotState(s)}
              {...pivotState}
              unusedOrientationCutoff={Infinity}
            />
          </div>
        )}

        {/* Empty State */}
        {!error && !isLoading && data.length === 0 && (
          <div className="flex items-center justify-center h-64 border-2 border-dashed rounded-lg">
            <div className="text-center text-muted-foreground">
              <AlertCircle className="mx-auto h-8 w-8 mb-2 opacity-50" />
              <p className="text-sm">
                {dataSource
                  ? "Aucune donnée disponible"
                  : "Configurez une source de données pour afficher le tableau"}
              </p>
            </div>
          </div>
        )}

        {/* Loading State */}
        {isLoading && (
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <RefreshCw className="mx-auto h-8 w-8 mb-2 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Chargement des données...</p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
