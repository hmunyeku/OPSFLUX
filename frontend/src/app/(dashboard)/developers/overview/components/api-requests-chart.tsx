"use client"

import { useEffect, useState } from "react"
import { TrendingUp, TrendingDown } from "lucide-react"
import { CartesianGrid, Line, LineChart, XAxis } from "recharts"
import { cn } from "@/lib/utils"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart"
import { getApiRequestsStats, ApiRequestsStats } from "@/api/developer-analytics"
import { Skeleton } from "@/components/ui/skeleton"

interface Props {
  className?: string
}

const chartConfig = {
  count: {
    label: "Count",
    color: "var(--chart-2)",
  },
} satisfies ChartConfig

export function ApiRequestsChart({ className = "" }: Props) {
  const [data, setData] = useState<ApiRequestsStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true)
        const stats = await getApiRequestsStats({ period: "week" })
        setData(stats)
        setError(null)
      } catch (err) {
        console.error("Failed to fetch API requests stats:", err)
        setError("Failed to load data")
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [])

  if (loading) {
    return (
      <Card className={cn("space-y-4 rounded-none border-none bg-transparent shadow-none", className)}>
        <CardHeader className="space-y-2 p-0">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-4 w-48" />
        </CardHeader>
        <Skeleton className="h-[200px] w-full" />
      </Card>
    )
  }

  if (error || !data) {
    return (
      <Card className={cn("space-y-4 rounded-none border-none bg-transparent shadow-none", className)}>
        <CardHeader className="space-y-2 p-0">
          <CardTitle>API requests</CardTitle>
          <CardDescription>No data available</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  // Calculate percentage change from previous period
  const lastValue = data.chart_data[data.chart_data.length - 1]?.count || 0
  const previousValue = data.chart_data[data.chart_data.length - 2]?.count || 0
  const percentChange = previousValue > 0
    ? ((lastValue - previousValue) / previousValue * 100).toFixed(1)
    : "0.0"
  const isIncrease = parseFloat(percentChange) >= 0

  return (
    <Card
      className={cn(
        "space-y-4 rounded-none border-none bg-transparent shadow-none",
        className
      )}
    >
      <CardHeader className="space-y-2 p-0">
        <CardTitle>API requests</CardTitle>
        <CardDescription className="flex gap-4">
          <div>
            <div className="text-muted-foreground/85 text-xs font-semibold">
              Successful
            </div>
            <span className="text-foreground text-sm">{data.successful}</span>
          </div>
          <div>
            <div className="text-muted-foreground/85 text-xs font-semibold">
              Failed
            </div>
            <span className="text-foreground text-sm">{data.failed}</span>
          </div>
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <ChartContainer config={chartConfig}>
          <LineChart
            accessibilityLayer
            data={data.chart_data}
            margin={{
              left: 12,
              right: 12,
            }}
          >
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="period"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
            />
            <ChartTooltip
              cursor={false}
              content={<ChartTooltipContent hideLabel />}
            />
            <Line
              dataKey="count"
              type="linear"
              stroke="var(--color-count)"
              strokeWidth={2}
              dot={false}
            />
          </LineChart>
        </ChartContainer>
      </CardContent>
      <CardFooter className="flex-col items-start gap-2 p-0 text-sm">
        <div className="flex gap-2 leading-none font-medium">
          Requests {isIncrease ? "increased" : "decreased"} by {Math.abs(parseFloat(percentChange))}% this week{" "}
          {isIncrease ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
        </div>
        <div className="text-muted-foreground leading-none">
          Displaying total API requests for the past {data.chart_data.length} weeks
        </div>
      </CardFooter>
    </Card>
  )
}
