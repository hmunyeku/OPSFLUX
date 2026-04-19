/**
 * CapacityHeatmap — Real ECharts heatmap for Planner capacity saturation.
 *
 * Designed to align horizontally with a Gantt timeline (same buildCells engine,
 * same pxPerDay). Supports a hierarchical tree view (Field → Site → Installation)
 * with click-to-expand on row labels. Legend lives in the left label margin.
 */
import { useMemo, useState, useCallback, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import ReactECharts from 'echarts-for-react'
import { useThemeStore } from '@/stores/themeStore'
import {
  buildCells,
  SCALE_META,
  type TimeScale,
} from '@/components/shared/gantt/ganttEngine'
import type { CapacityHeatmapDay, CapacityHeatmapConfig } from '@/types/api'
import type { HierarchyFieldNode } from '@/types/assetRegistry'

export interface CapacityHeatmapProps {
  /** Backend heatmap data — one entry per (asset, day) */
  days: CapacityHeatmapDay[]
  config?: CapacityHeatmapConfig
  /** Timeline scale — must match the Gantt for cells to align */
  scale: TimeScale
  /** Timeline start (ISO date) — must match the Gantt */
  startDate: string
  /** Timeline end (ISO date) — must match the Gantt */
  endDate: string
  /** Asset hierarchy — used for tree-mode rows. If absent, flat asset list. */
  hierarchy?: HierarchyFieldNode[]
  /** Width of the left label / legend column — should match the Gantt panel width */
  labelColumnWidth: number
  isLoading?: boolean
  emptyMessage?: string
  /** Click handler — receives the underlying day cell */
  onCellClick?: (day: CapacityHeatmapDay) => void
  /**
   * Optional CSS selector for an element whose horizontal scroll should be
   * mirrored. When provided, the heatmap's chart wrapper will sync scrollLeft
   * with that element (typical use: '[data-gantt-body]' to align with the Gantt).
   */
  syncScrollSelector?: string
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

/** A row in the heatmap tree — flattened from the hierarchy after expand/collapse */
interface TreeRow {
  id: string                                  // unique row key
  label: string                               // displayed text (without icons)
  level: 0 | 1 | 2                            // 0=field, 1=site, 2=installation
  hasChildren: boolean
  isExpanded: boolean
  /** Asset ids contributing to this row's data (= installation ids in subtree) */
  contributingAssetIds: string[]
}

/**
 * Build the flat list of visible rows from the hierarchy + the set of
 * collapsed node ids. Default behaviour: every parent is expanded — only
 * explicit collapse hides children. This avoids the async race where the
 * hierarchy arrives after first render and an `expanded` set built at mount
 * would be empty.
 *
 * Falls back to a flat list of assets when no hierarchy is available.
 */
function buildTreeRows(
  hierarchy: HierarchyFieldNode[] | undefined,
  collapsed: Set<string>,
  flatAssetsFallback: Array<{ id: string; name: string }>,
): TreeRow[] {
  if (!hierarchy || hierarchy.length === 0) {
    return flatAssetsFallback.map((a) => ({
      id: a.id,
      label: a.name,
      level: 2,
      hasChildren: false,
      isExpanded: false,
      contributingAssetIds: [a.id],
    }))
  }

  const rows: TreeRow[] = []
  for (const field of hierarchy) {
    const fieldAssetIds: string[] = []
    for (const site of field.sites) {
      for (const inst of site.installations) fieldAssetIds.push(inst.id)
    }
    if (fieldAssetIds.length === 0) continue

    const fieldCollapsed = collapsed.has(`f:${field.id}`)
    rows.push({
      id: `f:${field.id}`,
      label: field.name,
      level: 0,
      hasChildren: field.sites.length > 0,
      isExpanded: !fieldCollapsed,
      contributingAssetIds: fieldAssetIds,
    })

    if (fieldCollapsed) continue

    for (const site of field.sites) {
      const siteAssetIds = site.installations.map((i) => i.id)
      if (siteAssetIds.length === 0) continue

      const siteCollapsed = collapsed.has(`s:${site.id}`)
      rows.push({
        id: `s:${site.id}`,
        label: site.name,
        level: 1,
        hasChildren: site.installations.length > 0,
        isExpanded: !siteCollapsed,
        contributingAssetIds: siteAssetIds,
      })

      if (siteCollapsed) continue

      for (const inst of site.installations) {
        rows.push({
          id: `i:${inst.id}`,
          label: inst.name,
          level: 2,
          hasChildren: false,
          isExpanded: false,
          contributingAssetIds: [inst.id],
        })
      }
    }
  }
  return rows
}

export function CapacityHeatmap({
  days,
  config = DEFAULT_CONFIG,
  scale,
  startDate,
  endDate,
  hierarchy,
  labelColumnWidth,
  isLoading = false,
  emptyMessage = 'Aucune donnée de capacité',
  onCellClick,
  syncScrollSelector,
}: CapacityHeatmapProps) {
  const { t } = useTranslation()
  const isDark = useThemeStore((s) => s.resolvedTheme === 'dark')

  // ── Collapse-only state (default = everything expanded) ──
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set())

  const toggleCollapse = useCallback((id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  // ── Same cells as the Gantt ──
  const cells = useMemo(
    () => buildCells(scale, new Date(startDate), new Date(endDate)),
    [scale, startDate, endDate],
  )

  // ── Asset list fallback (for flat mode when no hierarchy) ──
  const flatAssets = useMemo(() => {
    const seen = new Map<string, string>()
    for (const d of days) {
      if (!seen.has(d.asset_id)) seen.set(d.asset_id, d.asset_name || '—')
    }
    return Array.from(seen.entries()).map(([id, name]) => ({ id, name }))
  }, [days])

  // ── Tree rows (flat list after expand/collapse) ──
  const treeRows = useMemo(
    () => buildTreeRows(hierarchy, collapsed, flatAssets),
    [hierarchy, collapsed, flatAssets],
  )

  // ── Build x categories from cells ──
  const xCategories = useMemo(() => cells.map((c) => c.label), [cells])

  // ── Index days by (asset_id, dateMs) for fast lookup ──
  const daysByAsset = useMemo(() => {
    const m = new Map<string, Map<number, CapacityHeatmapDay>>()
    for (const d of days) {
      let inner = m.get(d.asset_id)
      if (!inner) {
        inner = new Map()
        m.set(d.asset_id, inner)
      }
      inner.set(new Date(d.date).getTime(), d)
    }
    return m
  }, [days])

  // ── Build heat data: aggregate (max) saturation per (cell, row) ──
  const { heatData, cellAggregates } = useMemo(() => {
    const data: Array<[number, number, number]> = []
    // For tooltip we keep the full aggregated info per (xIdx,yIdx)
    const agg = new Map<string, {
      max_saturation: number
      total_forecast: number
      total_real_pob: number
      total_capacity: number
      total_remaining: number
      contributingDays: number
    }>()

    treeRows.forEach((row, yIdx) => {
      cells.forEach((cell, xIdx) => {
        const cellStart = cell.startDate.getTime()
        const cellEnd = cell.endDate.getTime() + 86399999  // include the end day
        let maxSat = 0
        let sumForecast = 0
        let sumReal = 0
        let sumCap = 0
        let sumRem = 0
        let count = 0

        for (const assetId of row.contributingAssetIds) {
          const inner = daysByAsset.get(assetId)
          if (!inner) continue
          for (const [ts, day] of inner) {
            if (ts >= cellStart && ts <= cellEnd) {
              if (day.saturation_pct > maxSat) maxSat = day.saturation_pct
              sumForecast += day.forecast_pax
              sumReal += day.real_pob
              sumCap += day.capacity_limit
              sumRem += day.remaining_capacity
              count++
            }
          }
        }

        if (count > 0) {
          data.push([xIdx, yIdx, Math.round(maxSat)])
          agg.set(`${xIdx}|${yIdx}`, {
            max_saturation: Math.round(maxSat),
            total_forecast: sumForecast,
            total_real_pob: sumReal,
            total_capacity: sumCap,
            total_remaining: sumRem,
            contributingDays: count,
          })
        }
      })
    })

    return { heatData: data, cellAggregates: agg }
  }, [treeRows, cells, daysByAsset])

  // ── Y-axis labels with expand icons + indentation ──
  const yCategories = useMemo(
    () =>
      treeRows.map((row) => {
        const indent = '  '.repeat(row.level)
        const icon = row.hasChildren ? (row.isExpanded ? '▾ ' : '▸ ') : '  '
        return `${indent}${icon}${row.label}`
      }),
    [treeRows],
  )

  // ── Total chart width (label area + cells area) ──
  const pxPerDay = SCALE_META[scale].pxPerDay
  const cellsAreaWidth = useMemo(
    () => cells.reduce((sum, c) => sum + c.days * pxPerDay, 0),
    [cells, pxPerDay],
  )
  const totalChartWidth = labelColumnWidth + cellsAreaWidth

  // ── ECharts option ──
  const option = useMemo(() => {
    const textColor = isDark ? '#e2e8f0' : '#374151'
    const mutedColor = isDark ? '#94a3b8' : '#6b7280'
    const headerColor = isDark ? '#cbd5e1' : '#4b5563'

    return {
      backgroundColor: 'transparent',
      animation: true,
      animationDuration: 320,
      tooltip: {
        position: 'top',
        backgroundColor: isDark ? 'rgba(15, 23, 42, 0.97)' : 'rgba(255, 255, 255, 0.98)',
        borderColor: isDark ? '#334155' : '#e5e7eb',
        borderWidth: 1,
        padding: 0,
        textStyle: { color: textColor, fontSize: 11 },
        extraCssText: 'box-shadow: 0 8px 24px rgba(0,0,0,0.12); border-radius: 6px;',
        formatter: (params: { value: [number, number, number] }) => {
          const [xIdx, yIdx, val] = params.value
          const row = treeRows[yIdx]
          const cell = cells[xIdx]
          const a = cellAggregates.get(`${xIdx}|${yIdx}`)
          if (!row || !cell || !a) return ''
          const period = `${cell.startDate.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })} → ${cell.endDate.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}`
          const color = val >= config.threshold_critical ? config.color_overflow
            : val >= config.threshold_high ? config.color_critical
            : val >= config.threshold_medium ? config.color_high
            : val >= config.threshold_low ? config.color_medium
            : config.color_low
          const levelLabel = row.level === 0 ? 'Champ' : row.level === 1 ? 'Site' : 'Installation'
          return `
            <div style="padding: 10px 12px; min-width: 200px;">
              <div style="font-size:9px; text-transform:uppercase; letter-spacing:0.05em; color:${mutedColor}; margin-bottom:2px;">${levelLabel}</div>
              <div style="font-weight:600; color:${textColor}; margin-bottom:6px;">${row.label}</div>
              <div style="font-size:10px; color:${mutedColor}; margin-bottom:8px;">${period}</div>
              <div style="display:flex; align-items:center; gap:6px; margin-bottom:6px;">
                <span style="display:inline-block; width:10px; height:10px; border-radius:2px; background:${color};"></span>
                <span style="font-weight:600; color:${textColor};">${val}%</span>
                <span style="color:${mutedColor}; font-size:10px;">${row.level < 2 ? 'pic' : 'saturation'}</span>
              </div>
              <table style="font-size:10px; color:${mutedColor}; line-height:1.6;">
                <tr><td>{t('shared.prevision_pax')}</td><td style="text-align:right; padding-left:12px; color:${textColor}; font-weight:500; font-variant-numeric:tabular-nums;">${a.total_forecast}</td></tr>
                <tr><td>{t('shared.pob_reel')}</td><td style="text-align:right; padding-left:12px; color:${textColor}; font-weight:500; font-variant-numeric:tabular-nums;">${a.total_real_pob}</td></tr>
                <tr><td>{t('assets.capacity')}</td><td style="text-align:right; padding-left:12px; color:${textColor}; font-weight:500; font-variant-numeric:tabular-nums;">${a.total_capacity}</td></tr>
                <tr><td>Restant</td><td style="text-align:right; padding-left:12px; color:${textColor}; font-weight:500; font-variant-numeric:tabular-nums;">${a.total_remaining}</td></tr>
              </table>
            </div>
          `
        },
      },
      grid: {
        // Reserve labelColumnWidth for the y-axis labels (matches Gantt panel)
        left: labelColumnWidth,
        right: 8,
        top: 4,
        // Leave room at the bottom for the visualMap legend (under the labels)
        bottom: 72,
        containLabel: false,
      },
      xAxis: {
        type: 'category',
        data: xCategories,
        position: 'top',
        splitArea: { show: false },
        axisTick: { show: false },
        axisLine: { lineStyle: { color: isDark ? '#334155' : '#e7e5e4' } },
        axisLabel: {
          color: mutedColor,
          fontSize: 10,
          interval: xCategories.length > 30 ? Math.floor(xCategories.length / 15) : 0,
          rotate: xCategories.length > 24 ? 30 : 0,
          margin: 6,
        },
      },
      yAxis: {
        type: 'category',
        data: yCategories,
        inverse: true,
        splitArea: { show: false },
        axisTick: { show: false },
        axisLine: { show: false },
        axisLabel: {
          color: textColor,
          fontSize: 11,
          fontWeight: (val: string) => {
            // Bold for parent rows (level 0 and 1) — they have icons ▸ ▾
            return /^[\s]*[▸▾]/.test(val) ? 600 : 400
          },
          width: labelColumnWidth - 20,
          overflow: 'truncate',
          margin: 12,
          align: 'left',
          padding: [0, 0, 0, 8],
          // Make labels clickable
          triggerEvent: true,
        },
      },
      visualMap: {
        type: 'piecewise',
        pieces: [
          { gte: config.threshold_critical, label: `≥${config.threshold_critical}%`, color: config.color_overflow },
          { gte: config.threshold_high, lt: config.threshold_critical, label: `${config.threshold_high}-${config.threshold_critical}%`, color: config.color_critical },
          { gte: config.threshold_medium, lt: config.threshold_high, label: `${config.threshold_medium}-${config.threshold_high}%`, color: config.color_high },
          { gte: config.threshold_low, lt: config.threshold_medium, label: `${config.threshold_low}-${config.threshold_medium}%`, color: config.color_medium },
          { lt: config.threshold_low, label: `<${config.threshold_low}%`, color: config.color_low },
        ],
        orient: 'horizontal',
        // Legend lives in the left label column, at the bottom
        left: 8,
        bottom: 8,
        itemWidth: 12,
        itemHeight: 10,
        textGap: 4,
        itemGap: 8,
        textStyle: { color: mutedColor, fontSize: 9 },
        formatter: (val: number, val2?: number) => {
          if (val2 != null) return `${val}-${val2}`
          return `${val}+`
        },
      },
      // Optional title-like header for the legend area
      graphic: [
        {
          type: 'text',
          left: 8,
          bottom: 50,
          style: {
            text: 'Saturation',
            fontSize: 9,
            fontWeight: 600,
            fill: headerColor,
            textAlign: 'left',
          },
        },
      ],
      series: [
        {
          name: 'Saturation',
          type: 'heatmap',
          data: heatData,
          itemStyle: {
            borderColor: isDark ? '#0f172a' : '#ffffff',
            borderWidth: 2,
            borderRadius: 3,
          },
          emphasis: {
            itemStyle: {
              shadowBlur: 6,
              shadowColor: 'rgba(0,0,0,0.25)',
              borderColor: isDark ? '#f1f5f9' : '#0f172a',
              borderWidth: 1.5,
            },
          },
          progressive: 1000,
          progressiveThreshold: 3000,
        },
      ],
    }
  }, [
    isDark, treeRows, cells, cellAggregates, xCategories, yCategories,
    heatData, labelColumnWidth, config,
  ])

  // ── Click handler — toggles expand on row labels, fires onCellClick on cells ──
  const handleEvents = useMemo(() => ({
    click: (params: {
      componentType?: string
      targetType?: string
      value?: [number, number, number] | string
      dataIndex?: number
    }) => {
      // Click on y-axis label (row name)
      if (
        params.componentType === 'yAxis' &&
        params.targetType === 'axisLabel' &&
        typeof params.dataIndex === 'number'
      ) {
        const row = treeRows[params.dataIndex]
        if (row?.hasChildren) toggleCollapse(row.id)
        return
      }
      // Click on heatmap cell
      if (Array.isArray(params.value)) {
        const [xIdx, yIdx] = params.value
        const row = treeRows[yIdx]
        const cell = cells[xIdx]
        if (!row || !cell || !onCellClick) return
        // Find any matching day in this cell to forward
        for (const assetId of row.contributingAssetIds) {
          const inner = daysByAsset.get(assetId)
          if (!inner) continue
          for (const [ts, day] of inner) {
            if (ts >= cell.startDate.getTime() && ts <= cell.endDate.getTime() + 86399999) {
              onCellClick(day)
              return
            }
          }
        }
      }
    },
  }), [treeRows, cells, daysByAsset, toggleCollapse, onCellClick])

  // ── Dynamic chart height ──
  const rowHeight = 26
  const headerSpace = 24
  const legendSpace = 80
  const chartHeight = Math.max(180, headerSpace + treeRows.length * rowHeight + legendSpace)

  // ── Two-way horizontal scroll sync with another element (e.g. Gantt body) ──
  const wrapperRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!syncScrollSelector) return
    const wrapper = wrapperRef.current
    if (!wrapper) return

    let target: HTMLElement | null = null
    let raf = 0
    let suppress = false

    // The target may not exist on first render — poll a few frames.
    const findTarget = () => {
      target = document.querySelector(syncScrollSelector) as HTMLElement | null
      if (!target) {
        raf = requestAnimationFrame(findTarget)
      } else {
        attach()
      }
    }

    const onWrapperScroll = () => {
      if (!target || suppress) return
      suppress = true
      target.scrollLeft = wrapper.scrollLeft
      requestAnimationFrame(() => { suppress = false })
    }
    const onTargetScroll = () => {
      if (!target || suppress) return
      suppress = true
      wrapper.scrollLeft = target.scrollLeft
      requestAnimationFrame(() => { suppress = false })
    }
    const attach = () => {
      wrapper.addEventListener('scroll', onWrapperScroll, { passive: true })
      target?.addEventListener('scroll', onTargetScroll, { passive: true })
    }

    findTarget()

    return () => {
      cancelAnimationFrame(raf)
      wrapper.removeEventListener('scroll', onWrapperScroll)
      target?.removeEventListener('scroll', onTargetScroll)
    }
  }, [syncScrollSelector, totalChartWidth])

  if (isLoading) {
    return (
      <div
        className="flex items-center justify-center text-xs text-muted-foreground"
        style={{ height: 220 }}
      >
        <span className="animate-pulse">{t('shared.chargement_de_la_heatmap')}</span>
      </div>
    )
  }

  if (treeRows.length === 0 || heatData.length === 0) {
    return (
      <div
        className="flex items-center justify-center text-xs text-muted-foreground italic border border-dashed border-border rounded-md"
        style={{ height: 220 }}
      >
        {emptyMessage}
      </div>
    )
  }

  return (
    <div ref={wrapperRef} className="w-full overflow-x-auto">
      <div style={{ width: totalChartWidth, minWidth: '100%', height: chartHeight }}>
        <ReactECharts
          option={option}
          style={{ height: '100%', width: '100%' }}
          opts={{ renderer: 'canvas' }}
          notMerge
          lazyUpdate
          onEvents={handleEvents}
        />
      </div>
    </div>
  )
}

export default CapacityHeatmap
