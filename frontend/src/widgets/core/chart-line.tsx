"use client"

interface ChartLineProps {
  config: {
    title?: string
    data?: Array<{ label: string; value: number }>
    color?: string
  }
}

export default function ChartLine({ config }: ChartLineProps) {
  const { title = "Tendance", data = [], color = "blue" } = config

  // Simple line chart with SVG
  const maxValue = Math.max(...data.map(d => d.value), 1)
  const width = 100
  const height = 60

  const points = data.map((point, i) => {
    const x = (i / (data.length - 1)) * width
    const y = height - (point.value / maxValue) * height
    return `${x},${y}`
  }).join(" ")

  return (
    <div className="h-full flex flex-col p-4 sm:p-6">
      {data.length === 0 ? (
        <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
          Aucune donnée disponible
        </div>
      ) : (
        <>
          <div className="text-2xl font-bold mb-4">
            {data[data.length - 1]?.value || 0}
          </div>
          <svg
            viewBox={`0 0 ${width} ${height}`}
            className="w-full h-16"
            preserveAspectRatio="none"
          >
            <polyline
              points={points}
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className={`text-${color}-500`}
            />
            <polyline
              points={`0,${height} ${points} ${width},${height}`}
              fill="currentColor"
              className={`text-${color}-500/20`}
            />
          </svg>
          <div className="flex justify-between mt-2 text-xs text-muted-foreground">
            <span>{data[0]?.label}</span>
            <span>{data[data.length - 1]?.label}</span>
          </div>
        </>
      )}
    </div>
  )
}
