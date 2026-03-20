/**
 * EChartsWidget — Reusable ECharts wrapper for dashboard widgets.
 *
 * Reads dark/light mode from themeStore and auto-applies matching ECharts theme.
 * Supports: bar, line, area, pie, scatter, radar, heatmap, gauge, treemap.
 */
import { useMemo } from 'react'
import ReactECharts from 'echarts-for-react'
import { useThemeStore } from '@/stores/themeStore'

export interface EChartsWidgetProps {
  chartType: 'bar' | 'line' | 'area' | 'pie' | 'scatter' | 'radar' | 'heatmap' | 'gauge' | 'treemap'
  data: Record<string, unknown>[]
  xField?: string
  yFields?: string[]
  title?: string
  height?: number | string
}

// OpsFlux design-system palette (blues, greens, oranges + accents)
const COLOR_PALETTE = [
  '#3b82f6', // blue-500
  '#22c55e', // green-500
  '#f59e0b', // amber-500
  '#ef4444', // red-500
  '#8b5cf6', // violet-500
  '#14b8a6', // teal-500
  '#ec4899', // pink-500
  '#f97316', // orange-500
  '#06b6d4', // cyan-500
  '#a855f7', // purple-500
]

export function EChartsWidget({
  chartType,
  data,
  xField = 'name',
  yFields = ['value'],
  title,
  height = '100%',
}: EChartsWidgetProps) {
  const resolvedTheme = useThemeStore((s) => s.resolvedTheme)
  const isDark = resolvedTheme === 'dark'

  const option = useMemo(() => {
    if (!data || data.length === 0) return null

    const baseTextStyle = {
      color: isDark ? '#a1a1aa' : '#71717a',
      fontSize: 10,
    }

    const axisCommon = {
      axisLabel: { ...baseTextStyle },
      axisLine: { lineStyle: { color: isDark ? '#3f3f46' : '#e4e4e7' } },
      splitLine: { lineStyle: { color: isDark ? '#27272a' : '#f4f4f5', type: 'dashed' as const } },
    }

    const tooltipStyle = {
      backgroundColor: isDark ? '#18181b' : '#ffffff',
      borderColor: isDark ? '#3f3f46' : '#e4e4e7',
      textStyle: { color: isDark ? '#fafafa' : '#09090b', fontSize: 12 },
    }

    const toolbox = {
      show: true,
      right: 4,
      top: 0,
      iconStyle: {
        borderColor: isDark ? '#71717a' : '#a1a1aa',
      },
      feature: {
        saveAsImage: { title: 'PNG', pixelRatio: 2 },
      },
    }

    // Build series based on chart type
    switch (chartType) {
      case 'bar': {
        const xData = data.map((d) => String(d[xField] ?? ''))
        return {
          color: COLOR_PALETTE,
          tooltip: { trigger: 'axis', ...tooltipStyle },
          toolbox,
          grid: { left: 40, right: 16, top: title ? 32 : 16, bottom: 24, containLabel: false },
          xAxis: { type: 'category', data: xData, ...axisCommon },
          yAxis: { type: 'value', ...axisCommon },
          series: yFields.map((field, i) => ({
            name: field,
            type: 'bar',
            data: data.map((d) => d[field] ?? 0),
            itemStyle: { borderRadius: [2, 2, 0, 0], color: COLOR_PALETTE[i % COLOR_PALETTE.length] },
          })),
          ...(title ? { title: { text: title, ...baseTextStyle, left: 'center', top: 0 } } : {}),
        }
      }

      case 'line': {
        const xData = data.map((d) => String(d[xField] ?? ''))
        return {
          color: COLOR_PALETTE,
          tooltip: { trigger: 'axis', ...tooltipStyle },
          toolbox,
          grid: { left: 40, right: 16, top: title ? 32 : 16, bottom: 24, containLabel: false },
          xAxis: { type: 'category', data: xData, ...axisCommon },
          yAxis: { type: 'value', ...axisCommon },
          series: yFields.map((field, i) => ({
            name: field,
            type: 'line',
            data: data.map((d) => d[field] ?? 0),
            smooth: true,
            showSymbol: false,
            lineStyle: { width: 2, color: COLOR_PALETTE[i % COLOR_PALETTE.length] },
            itemStyle: { color: COLOR_PALETTE[i % COLOR_PALETTE.length] },
          })),
          ...(title ? { title: { text: title, ...baseTextStyle, left: 'center', top: 0 } } : {}),
        }
      }

      case 'area': {
        const xData = data.map((d) => String(d[xField] ?? ''))
        return {
          color: COLOR_PALETTE,
          tooltip: { trigger: 'axis', ...tooltipStyle },
          toolbox,
          grid: { left: 40, right: 16, top: title ? 32 : 16, bottom: 24, containLabel: false },
          xAxis: { type: 'category', data: xData, ...axisCommon },
          yAxis: { type: 'value', ...axisCommon },
          series: yFields.map((field, i) => ({
            name: field,
            type: 'line',
            data: data.map((d) => d[field] ?? 0),
            smooth: true,
            showSymbol: false,
            areaStyle: { opacity: 0.15, color: COLOR_PALETTE[i % COLOR_PALETTE.length] },
            lineStyle: { width: 2, color: COLOR_PALETTE[i % COLOR_PALETTE.length] },
            itemStyle: { color: COLOR_PALETTE[i % COLOR_PALETTE.length] },
          })),
          ...(title ? { title: { text: title, ...baseTextStyle, left: 'center', top: 0 } } : {}),
        }
      }

      case 'pie': {
        return {
          color: COLOR_PALETTE,
          tooltip: { trigger: 'item', ...tooltipStyle },
          toolbox,
          legend: {
            bottom: 0,
            textStyle: baseTextStyle,
          },
          series: [
            {
              type: 'pie',
              radius: ['40%', '70%'],
              padAngle: 2,
              label: { show: false },
              emphasis: { label: { show: true, fontSize: 12, fontWeight: 'bold' } },
              data: data.map((d, i) => ({
                name: String(d[xField] ?? ''),
                value: d[yFields[0]] ?? 0,
                itemStyle: { color: COLOR_PALETTE[i % COLOR_PALETTE.length] },
              })),
            },
          ],
          ...(title ? { title: { text: title, ...baseTextStyle, left: 'center', top: 0 } } : {}),
        }
      }

      case 'scatter': {
        return {
          color: COLOR_PALETTE,
          tooltip: { trigger: 'item', ...tooltipStyle },
          toolbox,
          grid: { left: 40, right: 16, top: title ? 32 : 16, bottom: 24, containLabel: false },
          xAxis: { type: 'value', ...axisCommon },
          yAxis: { type: 'value', ...axisCommon },
          series: yFields.map((field, i) => ({
            name: field,
            type: 'scatter',
            data: data.map((d) => [d[xField] ?? 0, d[field] ?? 0]),
            itemStyle: { color: COLOR_PALETTE[i % COLOR_PALETTE.length] },
          })),
          ...(title ? { title: { text: title, ...baseTextStyle, left: 'center', top: 0 } } : {}),
        }
      }

      case 'radar': {
        const indicators = data.map((d) => ({
          name: String(d[xField] ?? ''),
          max: Math.max(...yFields.map((f) => Number(d[f] ?? 0))) * 1.2 || 100,
        }))
        return {
          color: COLOR_PALETTE,
          tooltip: { ...tooltipStyle },
          toolbox,
          radar: {
            indicator: indicators,
            axisName: { ...baseTextStyle },
            splitArea: { areaStyle: { color: isDark ? ['#18181b', '#27272a'] : ['#fafafa', '#f4f4f5'] } },
            splitLine: { lineStyle: { color: isDark ? '#3f3f46' : '#e4e4e7' } },
          },
          series: [
            {
              type: 'radar',
              data: yFields.map((field, i) => ({
                name: field,
                value: data.map((d) => d[field] ?? 0),
                lineStyle: { color: COLOR_PALETTE[i % COLOR_PALETTE.length] },
                areaStyle: { opacity: 0.1, color: COLOR_PALETTE[i % COLOR_PALETTE.length] },
                itemStyle: { color: COLOR_PALETTE[i % COLOR_PALETTE.length] },
              })),
            },
          ],
          ...(title ? { title: { text: title, ...baseTextStyle, left: 'center', top: 0 } } : {}),
        }
      }

      case 'heatmap': {
        // Expects data with xField, a second categorical field, and a value field
        const xCategories = [...new Set(data.map((d) => String(d[xField] ?? '')))]
        const yField = yFields.length > 1 ? yFields[0] : 'category'
        const valueField = yFields.length > 1 ? yFields[1] : yFields[0]
        const yCategories = [...new Set(data.map((d) => String(d[yField] ?? '')))]
        const heatData = data.map((d) => [
          xCategories.indexOf(String(d[xField] ?? '')),
          yCategories.indexOf(String(d[yField] ?? '')),
          d[valueField] ?? 0,
        ])
        const maxVal = Math.max(...data.map((d) => Number(d[valueField] ?? 0)))
        return {
          tooltip: { position: 'top', ...tooltipStyle },
          toolbox,
          grid: { left: 60, right: 16, top: title ? 32 : 16, bottom: 40, containLabel: false },
          xAxis: { type: 'category', data: xCategories, ...axisCommon },
          yAxis: { type: 'category', data: yCategories, ...axisCommon },
          visualMap: {
            min: 0,
            max: maxVal || 100,
            calculable: true,
            orient: 'horizontal',
            left: 'center',
            bottom: 0,
            inRange: { color: ['#eff6ff', '#3b82f6', '#1e3a5f'] },
            textStyle: baseTextStyle,
          },
          series: [{ type: 'heatmap', data: heatData, label: { show: true, fontSize: 9 } }],
          ...(title ? { title: { text: title, ...baseTextStyle, left: 'center', top: 0 } } : {}),
        }
      }

      case 'gauge': {
        const value = data[0] ? Number(data[0][yFields[0]] ?? 0) : 0
        const max = data[0] ? Number(data[0].max ?? 100) : 100
        return {
          toolbox,
          series: [
            {
              type: 'gauge',
              min: 0,
              max,
              progress: { show: true, width: 12, itemStyle: { color: COLOR_PALETTE[0] } },
              axisLine: { lineStyle: { width: 12, color: [[1, isDark ? '#3f3f46' : '#e4e4e7']] } },
              axisTick: { show: false },
              splitLine: { length: 8, lineStyle: { width: 1, color: isDark ? '#71717a' : '#a1a1aa' } },
              axisLabel: { distance: 16, ...baseTextStyle },
              pointer: { show: true, length: '60%', width: 4 },
              detail: {
                valueAnimation: true,
                fontSize: 18,
                fontWeight: 'bold',
                color: isDark ? '#fafafa' : '#09090b',
                offsetCenter: [0, '70%'],
              },
              data: [{ value, name: String(data[0]?.[xField] ?? '') }],
            },
          ],
          ...(title ? { title: { text: title, ...baseTextStyle, left: 'center', top: 0 } } : {}),
        }
      }

      case 'treemap': {
        return {
          color: COLOR_PALETTE,
          tooltip: { ...tooltipStyle },
          toolbox,
          series: [
            {
              type: 'treemap',
              data: data.map((d, i) => ({
                name: String(d[xField] ?? ''),
                value: d[yFields[0]] ?? 0,
                itemStyle: { color: COLOR_PALETTE[i % COLOR_PALETTE.length] },
              })),
              label: { show: true, fontSize: 10, color: '#fff' },
              breadcrumb: { show: false },
            },
          ],
          ...(title ? { title: { text: title, ...baseTextStyle, left: 'center', top: 0 } } : {}),
        }
      }

      default:
        return null
    }
  }, [chartType, data, xField, yFields, title, isDark])

  // Empty data
  if (!data || data.length === 0 || !option) {
    return (
      <div className="flex items-center justify-center h-full text-xs text-muted-foreground">
        Aucune donn&eacute;e
      </div>
    )
  }

  return (
    <ReactECharts
      option={option}
      style={{ width: '100%', height }}
      theme={isDark ? 'dark' : undefined}
      opts={{ renderer: 'canvas' }}
      notMerge
      lazyUpdate
    />
  )
}
