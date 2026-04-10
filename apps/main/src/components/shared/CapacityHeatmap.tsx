/**
 * CapacityHeatmap — Real ECharts heatmap for Planner capacity saturation.
 *
 * Renders one row per asset/installation, one column per time cell.
 * Cell color reflects saturation_pct against configurable thresholds.
 * Includes tooltip, visualMap legend, dataZoom for large date ranges.
 */
import { useMemo } from 'react'
import ReactECharts from 'echarts-for-react'
import { useThemeStore } from '@/stores/themeStore'
import type { CapacityHeatmapDay, CapacityHeatmapConfig } from '@/types/api'

export interface CapacityHeatmapProps {
  days: CapacityHeatmapDay[]
  config?: CapacityHeatmapConfig
  /** Optional: restrict and order the assets shown (otherwise derived from data) */
  assetOrder?: Array<{ id: string; name: string }>
  height?: number | string
  isLoading?: boolean
  emptyMessage?: string
  /** Click handler — receives the underlying day */
  onCellClick?: (day: CapacityHeatmapDay) => void
}

const DEFAULT_CONFIG: CapacityHeatmapConfig = {
  threshold_low: 40,
  threshold_medium: 70,
  threshold_high: 90,
  threshold_critical: 100,
  color_low: '#dcfce7',       // emerald-100
  color_medium: '#86efac',     // emerald-300
  color_high: '#fbbf24',       // amber-400
  color_critical: '#f97316',   // orange-500
  color_overflow: '#dc2626',   // red-600
}

function formatDateLabel(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })
  } catch {
    return iso
  }
}

export function CapacityHeatmap({
  days,
  config = DEFAULT_CONFIG,
  assetOrder,
  height = 320,
  isLoading = false,
  emptyMessage = 'Aucune donnée de capacité',
  onCellClick,
}: CapacityHeatmapProps) {
  const isDark = useThemeStore((s) => s.resolvedTheme === 'dark')

  const { xCategories, yCategories, heatData, dayIndex } = useMemo(() => {
    // Unique sorted dates
    const dateSet = new Set<string>()
    for (const d of days) dateSet.add(d.date)
    const dates = Array.from(dateSet).sort()

    // Asset rows: respect assetOrder if provided, else derive
    let assets: Array<{ id: string; name: string }>
    if (assetOrder && assetOrder.length > 0) {
      assets = assetOrder
    } else {
      const seen = new Map<string, string>()
      for (const d of days) {
        if (!seen.has(d.asset_id)) {
          seen.set(d.asset_id, d.asset_name || '—')
        }
      }
      assets = Array.from(seen.entries()).map(([id, name]) => ({ id, name }))
    }

    const xCats = dates.map(formatDateLabel)
    const yCats = assets.map((a) => a.name)

    // Index for fast tooltip lookup: key = `${xIdx}|${yIdx}`
    const idx = new Map<string, CapacityHeatmapDay>()
    const data: Array<[number, number, number]> = []

    for (const d of days) {
      const xIdx = dates.indexOf(d.date)
      const yIdx = assets.findIndex((a) => a.id === d.asset_id)
      if (xIdx === -1 || yIdx === -1) continue
      idx.set(`${xIdx}|${yIdx}`, d)
      data.push([xIdx, yIdx, Math.round(d.saturation_pct)])
    }

    return { xCategories: xCats, yCategories: yCats, heatData: data, dayIndex: idx }
  }, [days, assetOrder])

  const option = useMemo(() => {
    const textColor = isDark ? '#e2e8f0' : '#374151'
    const mutedColor = isDark ? '#94a3b8' : '#6b7280'
    const gridBg = isDark ? '#1e293b' : '#fafaf9'

    return {
      backgroundColor: 'transparent',
      animation: true,
      animationDuration: 400,
      tooltip: {
        position: 'top',
        backgroundColor: isDark ? 'rgba(15, 23, 42, 0.95)' : 'rgba(255, 255, 255, 0.98)',
        borderColor: isDark ? '#334155' : '#e5e7eb',
        borderWidth: 1,
        textStyle: { color: textColor, fontSize: 11 },
        extraCssText: 'box-shadow: 0 8px 24px rgba(0,0,0,0.12); border-radius: 6px; padding: 8px 10px;',
        formatter: (params: { value: [number, number, number] }) => {
          const [xIdx, yIdx, val] = params.value
          const day = dayIndex.get(`${xIdx}|${yIdx}`)
          if (!day) return ''
          const date = new Date(day.date).toLocaleDateString('fr-FR', {
            weekday: 'short', day: '2-digit', month: 'short', year: 'numeric',
          })
          const color = val >= config.threshold_critical ? config.color_overflow
            : val >= config.threshold_high ? config.color_critical
            : val >= config.threshold_medium ? config.color_high
            : val >= config.threshold_low ? config.color_medium
            : config.color_low
          return `
            <div style="font-weight:600; margin-bottom:4px;">${day.asset_name || '—'}</div>
            <div style="color:${mutedColor}; font-size:10px; margin-bottom:6px;">${date}</div>
            <div style="display:flex; align-items:center; gap:6px; margin-bottom:3px;">
              <span style="display:inline-block; width:8px; height:8px; border-radius:2px; background:${color};"></span>
              <span><strong>${val}%</strong> saturation</span>
            </div>
            <div style="font-size:10px; color:${mutedColor}; line-height:1.5;">
              Prévision&nbsp;: <strong style="color:${textColor};">${day.forecast_pax}</strong> PAX<br/>
              POB réel&nbsp;: <strong style="color:${textColor};">${day.real_pob}</strong><br/>
              Capacité&nbsp;: <strong style="color:${textColor};">${day.capacity_limit}</strong><br/>
              Restant&nbsp;: <strong style="color:${textColor};">${day.remaining_capacity}</strong>
            </div>
          `
        },
      },
      grid: {
        left: 130,
        right: 24,
        top: 16,
        bottom: 56,
        containLabel: false,
        backgroundColor: gridBg,
        show: false,
      },
      xAxis: {
        type: 'category',
        data: xCategories,
        splitArea: { show: false },
        axisTick: { show: false },
        axisLine: { lineStyle: { color: isDark ? '#334155' : '#e7e5e4' } },
        axisLabel: {
          color: mutedColor,
          fontSize: 10,
          interval: xCategories.length > 30 ? Math.floor(xCategories.length / 15) : 0,
          rotate: xCategories.length > 20 ? 35 : 0,
        },
      },
      yAxis: {
        type: 'category',
        data: yCategories,
        splitArea: { show: false },
        axisTick: { show: false },
        axisLine: { show: false },
        axisLabel: {
          color: textColor,
          fontSize: 11,
          fontWeight: 500,
          width: 120,
          overflow: 'truncate',
          margin: 12,
        },
      },
      visualMap: {
        type: 'piecewise',
        pieces: [
          { gte: config.threshold_critical, label: `≥ ${config.threshold_critical}% (saturé)`, color: config.color_overflow },
          { gte: config.threshold_high, lt: config.threshold_critical, label: `${config.threshold_high}–${config.threshold_critical}%`, color: config.color_critical },
          { gte: config.threshold_medium, lt: config.threshold_high, label: `${config.threshold_medium}–${config.threshold_high}%`, color: config.color_high },
          { gte: config.threshold_low, lt: config.threshold_medium, label: `${config.threshold_low}–${config.threshold_medium}%`, color: config.color_medium },
          { lt: config.threshold_low, label: `< ${config.threshold_low}%`, color: config.color_low },
        ],
        orient: 'horizontal',
        left: 'center',
        bottom: 8,
        itemWidth: 14,
        itemHeight: 10,
        textGap: 6,
        textStyle: { color: mutedColor, fontSize: 10 },
      },
      series: [
        {
          name: 'Saturation',
          type: 'heatmap',
          data: heatData,
          itemStyle: { borderColor: isDark ? '#0f172a' : '#ffffff', borderWidth: 2, borderRadius: 3 },
          emphasis: {
            itemStyle: {
              shadowBlur: 8,
              shadowColor: 'rgba(0,0,0,0.3)',
              borderColor: isDark ? '#f1f5f9' : '#0f172a',
              borderWidth: 1.5,
            },
          },
          progressive: 1000,
          progressiveThreshold: 3000,
        },
      ],
    }
  }, [xCategories, yCategories, heatData, dayIndex, config, isDark])

  const handleEvents = useMemo(() => {
    if (!onCellClick) return undefined
    return {
      click: (params: { value: [number, number, number] }) => {
        const [xIdx, yIdx] = params.value
        const day = dayIndex.get(`${xIdx}|${yIdx}`)
        if (day) onCellClick(day)
      },
    }
  }, [onCellClick, dayIndex])

  if (isLoading) {
    return (
      <div
        className="flex items-center justify-center text-xs text-muted-foreground"
        style={{ height }}
      >
        <span className="animate-pulse">Chargement de la heatmap…</span>
      </div>
    )
  }

  if (heatData.length === 0) {
    return (
      <div
        className="flex items-center justify-center text-xs text-muted-foreground italic border border-dashed border-border rounded-md"
        style={{ height }}
      >
        {emptyMessage}
      </div>
    )
  }

  return (
    <div className="w-full" style={{ height }}>
      <ReactECharts
        option={option}
        style={{ height: '100%', width: '100%' }}
        opts={{ renderer: 'canvas' }}
        notMerge
        lazyUpdate
        onEvents={handleEvents}
      />
    </div>
  )
}

export default CapacityHeatmap
