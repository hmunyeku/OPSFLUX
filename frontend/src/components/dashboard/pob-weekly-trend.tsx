import { Line, LineChart } from "recharts"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart"

const data = [
  { week: "Week 1", personnel: 135 },
  { week: "Week 2", personnel: 142 },
  { week: "Week 3", personnel: 138 },
  { week: "Week 4", personnel: 145 },
  { week: "Week 5", personnel: 142 },
  { week: "Week 6", personnel: 148 },
]

const chartConfig = {
  personnel: {
    label: "Personnel",
    color: "var(--primary)",
  },
} satisfies ChartConfig

export function POBWeeklyTrend() {
  return (
    <Card className="h-full">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div>
          <CardTitle className="text-sm font-normal">POB Weekly Trend</CardTitle>
          <CardDescription className="text-xs">Personnel on board over last 6 weeks</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="h-[calc(100%_-_70px)] pb-0">
        <div className="text-2xl font-bold">142 Personnel</div>
        <p className="text-muted-foreground text-xs">+4.2% from last week</p>
        <ChartContainer config={chartConfig} className="h-[120px] w-full mt-4">
          <LineChart
            data={data}
            margin={{
              top: 5,
              right: 10,
              left: 10,
              bottom: 0,
            }}
          >
            <ChartTooltip content={<ChartTooltipContent />} />
            <Line
              type="monotone"
              strokeWidth={2}
              dataKey="personnel"
              stroke="var(--color-personnel)"
              activeDot={{
                r: 6,
              }}
              dot={false}
            />
          </LineChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}
