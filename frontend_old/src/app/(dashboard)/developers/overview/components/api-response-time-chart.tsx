"use client"

import { useEffect, useState } from "react"
import { TrendingDown, TrendingUp } from "lucide-react"
import { CartesianGrid, LabelList, Line, LineChart, XAxis } from "recharts"
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
import { getApiResponseTimeStats, ApiResponseTimeStats } from "@/api/developer-analytics"
import { Skeleton } from "@/components/ui/skeleton"

interface Props {
  className?: string
}

const chartConfig = {
  time: {
    label: "Time (ms)",
    color: "var(--chart-1)",
  },
} satisfies ChartConfig

export function ApiResponseTimeChart({ className = "" }: Props) {
  const [data, setData] = useState<ApiResponseTimeStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true)
        const stats = await getApiResponseTimeStats({ period: "week" })
        setData(stats)
        setError(null)
      } catch (err) {
        console.error("Failed to fetch API response time stats:", err)
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
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-56" />
        </CardHeader>
        <Skeleton className="h-[200px] w-full" />
      </Card>
    )
  }

  if (error || !data) {
    return (
      <Card className={cn("space-y-4 rounded-none border-none bg-transparent shadow-none", className)}>
        <CardHeader className="space-y-2 p-0">
          <CardTitle>API response time</CardTitle>
          <CardDescription>No data available</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  // Calculate change from previous period
  const lastValue = data.chart_data[data.chart_data.length - 1]?.time || 0
  const previousValue = data.chart_data[data.chart_data.length - 2]?.time || 0
  const change = Math.abs(lastValue - previousValue)
  const isDecrease = lastValue < previousValue

  return (
    <Card
      className={cn(
        "space-y-4 rounded-none border-none bg-transparent shadow-none",
        className
      )}
    >
      <CardHeader className="space-y-2 p-0">
        <CardTitle>API response time</CardTitle>
        <CardDescription className="flex gap-4">
          <div>
            <div className="text-muted-foreground/85 text-xs font-semibold">
              Min
            </div>
            <span className="text-foreground text-xs">{data.min}ms</span>
          </div>
          <div>
            <div className="text-muted-foreground/85 text-xs font-semibold">
              Avg
            </div>
            <span className="text-foreground text-xs">{data.avg}ms</span>
          </div>
          <div>
            <div className="text-muted-foreground/85 text-xs font-semibold">
              Max
            </div>
            <span className="text-foreground text-xs">{data.max}ms</span>
          </div>
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <ChartContainer config={chartConfig}>
          <LineChart
            accessibilityLayer
            data={data.chart_data}
            margin={{
              top: 20,
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
              tickFormatter={(value) => value.slice(0, 3)}
            />
            <ChartTooltip
              cursor={false}
              content={<ChartTooltipContent indicator="line" />}
            />
            <Line
              dataKey="time"
              type="natural"
              stroke="var(--color-time)"
              strokeWidth={2}
              dot={{
                fill: "var(--color-time)",
              }}
              activeDot={{
                r: 6,
              }}
            >
              <LabelList
                position="top"
                offset={12}
                className="fill-foreground"
                fontSize={12}
              />
            </Line>
          </LineChart>
        </ChartContainer>
      </CardContent>
      <CardFooter className="flex-col items-start gap-2 p-0 text-sm">
        <div className="flex gap-2 leading-none font-medium">
          Response time {isDecrease ? "decreased" : "increased"} by {Math.round(change)}ms this week{" "}
          {isDecrease ? <TrendingDown className="h-4 w-4" /> : <TrendingUp className="h-4 w-4" />}
        </div>
        <div className="text-muted-foreground leading-none">
          Average API response time for the past {data.chart_data.length} weeks in milliseconds
        </div>
      </CardFooter>
    </Card>
  )
}
