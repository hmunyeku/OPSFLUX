import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  XAxis,
} from "recharts"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart"

const chartData = [
  { month: "January", completed: 186, ongoing: 80 },
  { month: "February", completed: 305, ongoing: 200 },
  { month: "March", completed: 237, ongoing: 120 },
  { month: "April", completed: 173, ongoing: 190 },
  { month: "May", completed: 209, ongoing: 130 },
  { month: "June", completed: 214, ongoing: 140 },
]

const chartConfig = {
  completed: {
    label: "Completed",
    color: "var(--chart-1)",
  },
  ongoing: {
    label: "Ongoing",
    color: "var(--chart-2)",
  },
} satisfies ChartConfig

export function OperationsStatus() {
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>Operations Status</CardTitle>
        <CardDescription>
          Showing completed vs ongoing operations for the last 6 months
        </CardDescription>
      </CardHeader>
      <CardContent className="h-[calc(100%_-_90px)]">
        <ResponsiveContainer width="100%" height="100%">
          <ChartContainer config={chartConfig}>
            <AreaChart
              accessibilityLayer
              data={chartData}
              margin={{
                left: 12,
                right: 12,
              }}
            >
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="month"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                tickFormatter={(value) => value.slice(0, 3)}
              />
              <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
              <defs>
                <linearGradient id="fillCompleted" x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="5%"
                    stopColor="var(--color-completed)"
                    stopOpacity={0.8}
                  />
                  <stop
                    offset="95%"
                    stopColor="var(--color-completed)"
                    stopOpacity={0.1}
                  />
                </linearGradient>
                <linearGradient id="fillOngoing" x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="5%"
                    stopColor="var(--color-ongoing)"
                    stopOpacity={0.8}
                  />
                  <stop
                    offset="95%"
                    stopColor="var(--color-ongoing)"
                    stopOpacity={0.1}
                  />
                </linearGradient>
              </defs>
              <Area
                dataKey="ongoing"
                type="natural"
                fill="url(#fillOngoing)"
                fillOpacity={0.4}
                stroke="var(--color-ongoing)"
                stackId="a"
              />
              <Area
                dataKey="completed"
                type="natural"
                fill="url(#fillCompleted)"
                fillOpacity={0.4}
                stroke="var(--color-completed)"
                stackId="a"
              />
            </AreaChart>
          </ChartContainer>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}
