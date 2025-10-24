"use client"

import { useState, useEffect, useRef } from "react"
import { IconTrendingUp, IconRefresh } from "@tabler/icons-react"
import { auth } from "@/lib/auth"
import { Skeleton } from "@/components/ui/skeleton"
import { Button } from "@/components/ui/button"

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL
  ? `${process.env.NEXT_PUBLIC_API_URL}/api/v1`
  : "/api/v1"

interface ChartLineProps {
  config: {
    title?: string
    description?: string
    data?: Array<{ label: string; value: number }>
    color?: string
    apiEndpoint?: string
    apiDataPath?: string
    refreshInterval?: number
  }
}

export default function ChartLine({ config }: ChartLineProps) {
  const {
    title = "Tendance",
    description,
    data: configData = [],
    color = "blue",
    apiEndpoint,
    apiDataPath,
    refreshInterval = 0,
  } = config

  const [data, setData] = useState(configData)
  const [isLoading, setIsLoading] = useState(false)
  const isFirstRender = useRef(true)

  const fetchData = async () => {
    if (!apiEndpoint) {
      setData(configData)
      return
    }

    setIsLoading(true)
    try {
      const token = auth.getToken()
      if (!token) throw new Error("Non authentifié")

      const url = apiEndpoint.startsWith("http") ? apiEndpoint : `${API_BASE_URL}${apiEndpoint}`
      const response = await fetch(url, {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      })

      if (!response.ok) throw new Error(`Erreur ${response.status}`)

      let result = await response.json()

      if (apiDataPath) {
        const paths = apiDataPath.split(".")
        for (const path of paths) {
          result = result?.[path]
        }
      }

      setData(Array.isArray(result) ? result : configData)
    } catch (err: any) {
      console.error("Chart Line Error:", err)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false
      fetchData()
    }
    if (refreshInterval > 0) {
      const interval = setInterval(fetchData, refreshInterval * 1000)
      return () => clearInterval(interval)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshInterval])

  const maxValue = Math.max(...data.map(d => d.value), 1)
  const width = 100
  const height = 40

  const points = data.length > 0
    ? data.map((point, i) => {
        const x = (i / (data.length - 1)) * width
        const y = height - (point.value / maxValue) * height
        return `${x},${y}`
      }).join(" ")
    : ""

  const colorMap: Record<string, string> = {
    blue: "text-blue-500",
    green: "text-green-500",
    orange: "text-orange-500",
    red: "text-red-500",
    purple: "text-purple-500",
  }

  const strokeClass = colorMap[color] || colorMap.blue

  return (
    <div className="h-full flex flex-col p-3">
      {/* Compact Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <div className={`p-1.5 rounded-md bg-muted/50 shrink-0 ${strokeClass}`}>
            <IconTrendingUp className="h-3.5 w-3.5" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-xs font-medium text-muted-foreground truncate">
              {title}
            </h3>
            {description && (
              <p className="text-[10px] text-muted-foreground truncate">{description}</p>
            )}
          </div>
        </div>
        {apiEndpoint && !isLoading && (
          <Button variant="ghost" size="sm" onClick={fetchData} className="h-6 w-6 p-0 shrink-0">
            <IconRefresh className="h-3 w-3" />
          </Button>
        )}
      </div>

      {/* Compact Chart */}
      {isLoading ? (
        <Skeleton className="h-full w-full" />
      ) : data.length === 0 ? (
        <div className="flex items-center justify-center flex-1 text-xs text-muted-foreground">
          Aucune donnée
        </div>
      ) : (
        <div className="flex-1 flex flex-col justify-center">
          <div className="text-xl font-bold tabular-nums mb-1">
            {data[data.length - 1]?.value || 0}
          </div>
          <svg
            viewBox={`0 0 ${width} ${height}`}
            className="w-full h-12"
            preserveAspectRatio="none"
          >
            <polyline
              points={points}
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className={strokeClass}
            />
            <polyline
              points={`0,${height} ${points} ${width},${height}`}
              fill="currentColor"
              className={`${strokeClass} opacity-10`}
            />
          </svg>
          <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
            <span>{data[0]?.label}</span>
            <span>{data[data.length - 1]?.label}</span>
          </div>
        </div>
      )}
    </div>
  )
}
