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
  /** Override display names for each series (parallel to yFields) */
  seriesNames?: string[]
  title?: string
  height?: number | string
  /** Stack multi-series bar/area charts on top of each other (e.g. plan de
   *  charge: stacked bars by activity type per time bucket). When true, all
   *  series share `stack: 'total'` and labels move to the top of the stack
   *  instead of each segment. Ignored for single-series charts. */
  stacked?: boolean
  /** Click handler for cross-filtering — receives ECharts event params */
  onChartClick?: (params: Record<string, unknown>) => void
}

// OpsFlux design-system palette — rich, distinct, high-contrast
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
  '#84cc16', // lime-500
  '#0ea5e9', // sky-500
  '#d946ef', // fuchsia-500
  '#64748b', // slate-500
]

// Semantic colors for known status/weather/category names
// Keys are lowercased + non-alphanumeric chars replaced by _ (matching getDataColor normalisation)
const SEMANTIC_COLORS: Record<string, string> = {
  // Weather (English + French translated)
  sunny: '#f59e0b', cloudy: '#94a3b8', rainy: '#3b82f6', stormy: '#ef4444',
  ensoleill_: '#f59e0b', nuageux: '#94a3b8', pluvieux: '#3b82f6', orageux: '#ef4444',
  // Generic lifecycle (English)
  active: '#22c55e', completed: '#22c55e', done: '#22c55e', arrived: '#22c55e',
  validated: '#22c55e', approved: '#22c55e', valid: '#22c55e',
  planned: '#f59e0b', scheduled: '#f59e0b', todo: '#94a3b8',
  in_progress: '#3b82f6', review: '#8b5cf6', boarding: '#3b82f6', departed: '#06b6d4',
  draft: '#94a3b8', on_hold: '#f97316', suspended: '#d946ef',
  cancelled: '#ef4444', rejected: '#ef4444', expired: '#ef4444', non_compliant: '#ef4444',
  // Generic lifecycle (French translated)
  actif: '#22c55e', termin_: '#22c55e', arriv_: '#22c55e', valid_: '#22c55e', approuv_: '#22c55e',
  planifi_: '#f59e0b', en_cours: '#3b82f6', revue: '#8b5cf6', parti: '#06b6d4',
  brouillon: '#94a3b8', suspendu: '#d946ef', annul_: '#ef4444', rejet_: '#ef4444',
  expir_: '#ef4444', non_conforme: '#ef4444', en_attente: '#f97316',
  // ADS statuses
  submitted: '#6366f1', pending_validation: '#8b5cf6',
  pending_compliance: '#f97316', pending_project_review: '#a855f7',
  pending_initiator_review: '#7c3aed', pending_arbitration: '#dc2626',
  requires_review: '#f59e0b',
  // Cargo statuses
  registered: '#94a3b8', ready: '#14b8a6', ready_for_loading: '#14b8a6',
  loaded: '#3b82f6', in_transit: '#06b6d4', delivered: '#22c55e',
  returned: '#94a3b8', scrapped: '#64748b', damaged: '#ef4444', missing: '#dc2626',
  // Assets
  operational: '#22c55e', standby: '#f59e0b', decommissioned: '#ef4444',
  // Priorities
  low: '#22c55e', medium: '#f59e0b', high: '#f97316', critical: '#ef4444',
  basse: '#22c55e', moyenne: '#f59e0b', haute: '#f97316', critique: '#ef4444',
  // Tier types
  client: '#3b82f6', supplier: '#22c55e', subcontractor: '#f97316', partner: '#8b5cf6',
  fournisseur: '#22c55e', sous_traitant: '#f97316', partenaire: '#8b5cf6',
  // Site / installation types
  production: '#22c55e', shore_base: '#3b82f6', terminal: '#f59e0b', storage: '#8b5cf6',
  // Credential types
  formation: '#3b82f6', certification: '#22c55e', habilitation: '#f59e0b', medical: '#ef4444',
  // Equipment classes
  pump: '#3b82f6', crane: '#f59e0b', separator: '#22c55e', compressor: '#8b5cf6',
  // Compliance
  compliant: '#22c55e', non_conformant: '#ef4444', expiring: '#f59e0b',
  // Unknown / fallback
  unknown: '#94a3b8', inconnu: '#94a3b8', n_a: '#94a3b8',
}

/** Get color for a data point name — semantic first, then palette fallback */
function getDataColor(name: string, index: number): string {
  const key = String(name).toLowerCase().replace(/[^a-z0-9_]/g, '_')
  return SEMANTIC_COLORS[key] || COLOR_PALETTE[index % COLOR_PALETTE.length]
}

export function EChartsWidget({
  chartType,
  data,
  xField = 'name',
  yFields = ['value'],
  seriesNames,
  title,
  height = '100%',
  stacked = false,
  onChartClick,
}: EChartsWidgetProps) {
  /** Resolve display name for series i — use seriesNames override, then humanise field key */
  const getSeriesDisplayName = (field: string, i: number): string =>
    seriesNames?.[i] || field.replace(/_/g, ' ')
  const resolvedTheme = useThemeStore((s) => s.resolvedTheme)
  const isDark = resolvedTheme === 'dark'

  const option = useMemo(() => {
    if (!Array.isArray(data) || data.length === 0) return null

    const baseTextStyle = {
      color: isDark ? '#a1a1aa' : '#6b7280',
      fontSize: 11,
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    }

    const fmtNum = (v: number) => v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : v >= 1_000 ? `${(v / 1_000).toFixed(v >= 10_000 ? 0 : 1)}k` : String(v)

    const axisCommon = {
      axisLabel: { ...baseTextStyle, margin: 10 },
      axisLine: { show: false },
      splitLine: { lineStyle: { color: isDark ? '#27272a' : '#f3f4f6', type: 'solid' as const } },
    }
    const valueAxis = {
      ...axisCommon,
      minInterval: 1,
      axisLabel: { ...baseTextStyle, margin: 8, formatter: (v: number) => fmtNum(v) },
    }

    const tooltipStyle = {
      backgroundColor: isDark ? '#1f1f23' : '#ffffff',
      borderColor: isDark ? '#3f3f46' : '#e5e7eb',
      borderWidth: 1,
      padding: [10, 14],
      textStyle: { color: isDark ? '#f4f4f5' : '#111827', fontSize: 12, fontFamily: baseTextStyle.fontFamily },
      extraCssText: 'border-radius: 8px; box-shadow: 0 4px 16px rgba(0,0,0,0.12);',
    }

    const toolbox = {
      show: false, // hidden — actions are in widget header
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
        const xDataRaw = data.map((d) => String(d[xField] ?? ''))
        // Truncate long labels when rotated (>7 categories)
        const willRotate = xDataRaw.length > 7
        const xData = xDataRaw.map((s) => willRotate && s.length > 14 ? s.slice(0, 13) + '…' : s)
        const hasLegend = yFields.length > 1
        return {
          color: COLOR_PALETTE,
          tooltip: { trigger: 'axis', ...tooltipStyle },
          toolbox,
          ...(hasLegend ? { legend: { bottom: 0, textStyle: baseTextStyle, icon: 'roundRect', itemWidth: 10, itemHeight: 6 } } : {}),
          grid: { left: 8, right: 8, top: title ? 32 : 12, bottom: hasLegend ? 38 : 20, containLabel: true },
          xAxis: { type: 'category', data: xData, ...axisCommon, axisLabel: { ...baseTextStyle, rotate: willRotate ? 25 : 0, hideOverlap: true, margin: 6 } },
          yAxis: { type: 'value', ...valueAxis },
          series: yFields.map((field, i) => {
            const isSingleSeries = yFields.length === 1
            const isStacked = stacked && !isSingleSeries
            const isTopOfStack = isStacked && i === yFields.length - 1
            return {
              name: getSeriesDisplayName(field, i),
              type: 'bar',
              ...(isStacked ? { stack: 'total' } : {}),
              data: data.map((d, j) => ({
                value: d[field] ?? 0,
                // Single series: each bar gets a different color from palette
                ...(isSingleSeries ? { itemStyle: { color: getDataColor(String(d[xField] ?? ''), j) } } : {}),
              })),
              barMaxWidth: 32,
              barMinHeight: 3,
              itemStyle: {
                borderRadius: isStacked ? (isTopOfStack ? [4, 4, 0, 0] : [0, 0, 0, 0]) : [4, 4, 0, 0],
                ...(isSingleSeries ? {} : { color: COLOR_PALETTE[i % COLOR_PALETTE.length] }),
              },
              emphasis: {
                itemStyle: { shadowBlur: 10, shadowColor: 'rgba(0,0,0,0.2)', brightness: 0.1 },
              },
              label: {
                show: isStacked
                  ? (isTopOfStack && data.length <= 16)
                  : data.length <= 10,
                position: 'top' as const,
                fontSize: 9,
                fontWeight: 'bold' as const,
                color: baseTextStyle.color,
                formatter: isStacked
                  ? (p: { dataIndex: number }) => {
                      const row = data[p.dataIndex] as Record<string, unknown> | undefined
                      if (!row) return ''
                      let total = 0
                      for (const f of yFields) {
                        const v = row[f]
                        if (typeof v === 'number') total += v
                      }
                      return total >= 1000 ? `${(total / 1000).toFixed(1)}k` : String(total)
                    }
                  : (p: { value: number }) => p.value >= 1000 ? `${(p.value / 1000).toFixed(1)}k` : String(p.value),
              },
            }
          }),
          ...(title ? { title: { text: title, ...baseTextStyle, left: 'center', top: 0 } } : {}),
        }
      }

      case 'line': {
        const xData = data.map((d) => String(d[xField] ?? ''))
        const hasLegend = yFields.length > 1
        return {
          color: COLOR_PALETTE,
          tooltip: { trigger: 'axis', ...tooltipStyle },
          toolbox,
          ...(hasLegend ? { legend: { bottom: 0, textStyle: baseTextStyle, icon: 'roundRect', itemWidth: 10, itemHeight: 6 } } : {}),
          grid: { left: 8, right: 8, top: title ? 32 : 12, bottom: hasLegend ? 38 : 20, containLabel: true },
          xAxis: { type: 'category', data: xData, ...axisCommon, axisLabel: { ...baseTextStyle, rotate: xData.length > 8 ? 25 : 0, hideOverlap: true, margin: 6 } },
          yAxis: { type: 'value', ...valueAxis },
          series: yFields.map((field, i) => {
            const c = COLOR_PALETTE[i % COLOR_PALETTE.length]
            return {
              name: getSeriesDisplayName(field, i),
              type: 'line',
              data: data.map((d) => d[field] ?? 0),
              smooth: 0.35,
              showSymbol: data.length <= 24,
              symbol: 'circle',
              symbolSize: 5,
              lineStyle: { width: 2.5, color: c },
              itemStyle: { color: c, borderWidth: 2, borderColor: isDark ? '#18181b' : '#fff' },
              emphasis: { itemStyle: { borderWidth: 3, shadowBlur: 8, shadowColor: c + '40' } },
            }
          }),
          ...(title ? { title: { text: title, ...baseTextStyle, left: 'center', top: 0 } } : {}),
        }
      }

      case 'area': {
        const xData = data.map((d) => String(d[xField] ?? ''))
        const hasLegend = yFields.length > 1
        return {
          color: COLOR_PALETTE,
          tooltip: {
            trigger: 'axis',
            ...tooltipStyle,
            axisPointer: {
              type: 'cross',
              crossStyle: { color: isDark ? '#52525b' : '#d1d5db' },
              lineStyle: { color: isDark ? '#52525b' : '#d1d5db', type: 'dashed' },
            },
          },
          toolbox,
          ...(hasLegend ? { legend: { bottom: 0, textStyle: baseTextStyle, icon: 'roundRect', itemWidth: 10, itemHeight: 6 } } : {}),
          grid: { left: 8, right: 8, top: title ? 32 : 12, bottom: hasLegend ? 38 : 20, containLabel: true },
          xAxis: { type: 'category', data: xData, ...axisCommon, axisLabel: { ...baseTextStyle, rotate: xData.length > 8 ? 25 : 0, hideOverlap: true, margin: 6 } },
          yAxis: { type: 'value', ...valueAxis },
          series: yFields.map((field, i) => {
            const c = COLOR_PALETTE[i % COLOR_PALETTE.length]
            return {
              name: getSeriesDisplayName(field, i),
              type: 'line',
              data: data.map((d) => d[field] ?? 0),
              smooth: 0.4,
              showSymbol: false,
              areaStyle: {
                color: {
                  type: 'linear' as const, x: 0, y: 0, x2: 0, y2: 1,
                  colorStops: [
                    { offset: 0, color: c + '35' },
                    { offset: 1, color: c + '04' },
                  ],
                },
              },
              lineStyle: { width: 2, color: c },
              itemStyle: { color: c },
            }
          }),
          ...(title ? { title: { text: title, ...baseTextStyle, left: 'center', top: 0 } } : {}),
        }
      }

      case 'pie': {
        const showInlineLabel = data.length <= 5
        const total = data.reduce((sum, d) => sum + (Number(d[yFields[0]] ?? 0)), 0)
        const totalLabel = total >= 1_000_000
          ? `${(total / 1_000_000).toFixed(1)}M`
          : total >= 10_000 ? `${(total / 1_000).toFixed(1)}k` : String(total)
        return {
          color: COLOR_PALETTE,
          tooltip: {
            trigger: 'item',
            ...tooltipStyle,
            formatter: (p: { name: string; value: number; percent: number; marker: string }) =>
              `${p.marker} <b>${p.name}</b><br/>${p.value >= 1000 ? (p.value / 1000).toFixed(1) + 'k' : p.value} <span style="opacity:.6">(${p.percent}%)</span>`,
          },
          toolbox,
          graphic: [
            {
              type: 'text',
              left: 'center',
              top: '37%',
              style: {
                text: totalLabel,
                fill: isDark ? '#f4f4f5' : '#111827',
                font: `bold 18px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`,
                textAlign: 'center',
              },
            },
            {
              type: 'text',
              left: 'center',
              top: '46%',
              style: {
                text: 'Total',
                fill: isDark ? '#71717a' : '#9ca3af',
                font: `10px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`,
                textAlign: 'center',
              },
            },
          ],
          legend: {
            bottom: 0,
            textStyle: { ...baseTextStyle, fontSize: 10 },
            icon: 'circle',
            itemWidth: 7,
            itemHeight: 7,
            itemGap: 10,
          },
          series: [
            {
              type: 'pie',
              radius: ['45%', '70%'],
              center: ['50%', '44%'],
              padAngle: 2,
              itemStyle: { borderRadius: 5, borderColor: isDark ? '#18181b' : '#fff', borderWidth: 2 },
              label: showInlineLabel ? {
                show: true,
                position: 'outside' as const,
                fontSize: 10,
                color: baseTextStyle.color,
                formatter: (p: { name: string; percent: number }) => `${p.name}\n${p.percent.toFixed(0)}%`,
                lineHeight: 14,
              } : { show: false },
              labelLine: showInlineLabel ? { show: true, length: 8, length2: 6 } : { show: false },
              emphasis: {
                label: { show: true, fontSize: 12, fontWeight: 'bold' as const },
                itemStyle: { shadowBlur: 10, shadowColor: 'rgba(0,0,0,0.15)', borderWidth: 3 },
                scaleSize: 5,
              },
              data: data.map((d, i) => ({
                name: String(d[xField] ?? ''),
                value: d[yFields[0]] ?? 0,
                itemStyle: { color: getDataColor(String(d[xField] ?? ''), i) },
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
          yAxis: { type: 'value', ...valueAxis },
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
          grid: { left: 8, right: 8, top: title ? 32 : 8, bottom: 52, containLabel: true },
          xAxis: { type: 'category', data: xCategories, ...axisCommon, axisLabel: { ...baseTextStyle, rotate: xCategories.length > 7 ? 25 : 0, hideOverlap: true } },
          yAxis: { type: 'category', data: yCategories, ...axisCommon },
          visualMap: {
            min: 0,
            max: maxVal || 100,
            calculable: false,
            orient: 'horizontal',
            left: 'center',
            bottom: 4,
            itemWidth: 12,
            itemHeight: 80,
            inRange: { color: isDark ? ['#1e3a5f', '#3b82f6', '#93c5fd'] : ['#eff6ff', '#3b82f6', '#1e3a5f'] },
            textStyle: { ...baseTextStyle, fontSize: 9 },
          },
          series: [{ type: 'heatmap', data: heatData, label: { show: maxVal > 0 && xCategories.length <= 14, fontSize: 9, fontWeight: 'bold', color: '#fff' } }],
          ...(title ? { title: { text: title, ...baseTextStyle, left: 'center', top: 0 } } : {}),
        }
      }

      case 'gauge': {
        const value = data[0] ? Number(data[0][yFields[0]] ?? 0) : 0
        const max = data[0] ? Number(data[0].max ?? 100) : 100
        const pct = max > 0 ? value / max : 0
        const gaugeColor = pct >= 0.75 ? '#22c55e' : pct >= 0.5 ? '#3b82f6' : pct >= 0.25 ? '#f59e0b' : '#ef4444'
        return {
          toolbox,
          series: [
            {
              type: 'gauge',
              startAngle: 200,
              endAngle: -20,
              min: 0,
              max,
              center: ['50%', '60%'],
              radius: '90%',
              progress: {
                show: true,
                width: 16,
                roundCap: true,
                itemStyle: { color: gaugeColor },
              },
              axisLine: {
                roundCap: true,
                lineStyle: { width: 16, color: [[1, isDark ? '#27272a' : '#f3f4f6']] },
              },
              axisTick: { show: false },
              splitLine: { show: false },
              axisLabel: {
                distance: 24,
                fontSize: 10,
                color: baseTextStyle.color,
                formatter: (v: number) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v),
              },
              pointer: {
                show: true,
                length: '55%',
                width: 5,
                offsetCenter: [0, 0],
                itemStyle: { color: gaugeColor },
              },
              anchor: {
                show: true,
                size: 12,
                showAbove: true,
                itemStyle: { borderWidth: 3, borderColor: gaugeColor, color: isDark ? '#18181b' : '#fff' },
              },
              detail: {
                valueAnimation: true,
                fontSize: 22,
                fontWeight: 'bold' as const,
                fontFamily: baseTextStyle.fontFamily,
                color: isDark ? '#fafafa' : '#111827',
                offsetCenter: [0, '30%'],
                formatter: (v: number) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v),
              },
              title: {
                offsetCenter: [0, '52%'],
                fontSize: 11,
                color: baseTextStyle.color,
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
                itemStyle: { color: getDataColor(String(d[xField] ?? ''), i) },
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
  }, [chartType, data, xField, yFields, title, isDark, stacked, seriesNames])

  // Empty data
  if (!data || data.length === 0 || !option) {
    return (
      <div className="flex items-center justify-center h-full text-xs text-muted-foreground">
        Aucune donnée
      </div>
    )
  }

  return (
    <ReactECharts
      option={{ ...option, animation: true, animationDuration: 800, animationEasing: 'cubicOut', animationDurationUpdate: 400 }}
      style={{ width: '100%', height }}
      theme={isDark ? 'dark' : undefined}
      opts={{ renderer: 'canvas' }}
      notMerge
      lazyUpdate
      onEvents={onChartClick ? { click: onChartClick } : undefined}
    />
  )
}
