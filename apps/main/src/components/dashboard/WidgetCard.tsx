/**
 * WidgetCard — Container for an individual dashboard widget.
 *
 * Renders a card with header (title, refresh, actions) and content area.
 * Content is delegated to WidgetRenderer which picks the right sub-component
 * based on widget.type (kpi, chart, table, map, text).
 */
import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import L from 'leaflet'
import {
  GripVertical,
  RefreshCw,
  X,
  Loader2,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Minus,
  BarChart3,
  Table2,
  MapPin,
  Type,
  Gauge,
  Maximize2,
  Minimize2,
  TableProperties,
  Zap,
  Clock,
  LayoutGrid,
  Download,
} from 'lucide-react'
import 'leaflet/dist/leaflet.css'
import { cn } from '@/lib/utils'
import { useWidgetData } from '@/hooks/useDashboard'
import { useUserPreferences } from '@/hooks/useUserPreferences'
import { PerspectiveWidget } from './widgets/PerspectiveWidget'
import type { PerspectiveConfig } from './widgets/PerspectiveWidget'
import { QuickAccessWidget } from './widgets/QuickAccessWidget'
import { ClockWidget } from './widgets/ClockWidget'
import type { DashboardWidget } from '@/services/dashboardService'
import { EChartsWidget } from '@/components/charts/EChartsWidget'
import ReactECharts from 'echarts-for-react'
import { useDashboardFilters } from './DashboardFilterContext'




// ── Widget Type Icon ────────────────────────────────────────────

export function WidgetTypeIcon({ type, className }: { type: string; className?: string }) {
  const cls = cn('h-4 w-4', className)
  switch (type) {
    case 'kpi': return <Gauge className={cls} />
    case 'chart': return <BarChart3 className={cls} />
    case 'table': return <Table2 className={cls} />
    case 'map': return <MapPin className={cls} />
    case 'text': return <Type className={cls} />
    case 'perspective': return <TableProperties className={cls} />
    case 'quick_access': return <Zap className={cls} />
    case 'clock': return <Clock className={cls} />
    case 'group': return <LayoutGrid className={cls} />
    default: return <BarChart3 className={cls} />
  }
}

// ── Main WidgetCard ─────────────────────────────────────────────

interface WidgetCardProps {
  widget: DashboardWidget
  mode: 'view' | 'edit'
  onRemove?: () => void
  onUpdate?: (widget: DashboardWidget) => void
  /** Drag handle props (className for react-grid-layout drag handle) */
  dragHandleProps?: Record<string, unknown>
  /** Badge count for notifications (e.g., alerts, pending items) */
  badge?: number
}

export function WidgetCard({ widget, mode, onRemove, dragHandleProps, badge: _badge }: WidgetCardProps) {
  useTranslation() // keep hook call for consistency
  const { filterParams } = useDashboardFilters()
  // Use config.widget_id (provider ID) for data fetching, fallback to widget.id
  const dataWidgetId = (widget.config?.widget_id as string) || widget.id
  const { data, error, refetch, isLoading } = useWidgetData(
    dataWidgetId,
    widget.type,
    widget.config,
    filterParams,
  )

  // Fullscreen persisted in user preferences
  const { getPref, setPref } = useUserPreferences()
  const prefKey = `widget_fullscreen_${widget.id}`
  const [fullscreen, setFullscreenLocal] = useState(() => String(getPref(prefKey, '')) === 'true')
  const setFullscreen = (val: boolean) => {
    setFullscreenLocal(val)
    setPref(prefKey, val ? 'true' : '')
  }

  // Auto-refresh: read interval from widget.config.refresh_interval (seconds)
  const refreshInterval = (widget.config?.refresh_interval as number) || 0
  useEffect(() => {
    if (refreshInterval <= 0) return
    const timer = setInterval(() => refetch(), refreshInterval * 1000)
    return () => clearInterval(timer)
  }, [refreshInterval, refetch])

  // Export widget as image
  const cardRef = useRef<HTMLDivElement>(null)
  const handleExport = useCallback(async () => {
    const el = cardRef.current
    if (!el) return
    try {
      const { default: html2canvas } = await import('html2canvas')
      const canvas = await html2canvas(el, { backgroundColor: null, scale: 2 })
      const url = canvas.toDataURL('image/png')
      const a = document.createElement('a')
      a.href = url
      a.download = `${widget.title.replace(/[^a-zA-Z0-9]/g, '_')}.png`
      a.click()
    } catch { /* silent */ }
  }, [widget.title])

  const widgetContent = (
    <>
      {error ? (
        <WidgetError error={error} onRetry={() => refetch()} />
      ) : isLoading && !data ? (
        <WidgetSkeleton type={widget.type} />
      ) : (
        <WidgetRenderer widget={widget} data={Array.isArray(data?.data) ? data.data : data?.data ? [data.data] : []} meta={data?.meta ?? (typeof data?.data === 'object' && !Array.isArray(data?.data) ? data.data as Record<string, unknown> : undefined)} />
      )}
    </>
  )

  // headerBar removed — modern card uses inline compact header

  // Visual customization from config
  const bgColor = (widget.config?.bg_color as string) || ''
  const accentColor = (widget.config?.accent_color as string) || ''
  const hideHeader = (widget.config?.hide_header as boolean) || false
  const hasBgColor = !!bgColor
  const cssVars = {
    ...(accentColor ? { '--widget-accent': accentColor } : {}),
    ...(bgColor ? { backgroundColor: bgColor, color: '#fff' } : {}),
  } as React.CSSProperties

  // ── Kyubit-level card shell — no header bar, title inline ──
  if (!fullscreen) {
    return (
      <div
        ref={cardRef}
        className={cn(
          'group flex flex-col h-full rounded-lg overflow-hidden transition-shadow duration-200',
          'shadow-sm hover:shadow-md',
          !hasBgColor && 'bg-card',
        )}
        style={{ ...cssVars, fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}
      >
        {/* Title row — no background, just text + toolbar on hover */}
        <div className={cn(
          'flex items-center px-4 pt-3 pb-1 gap-2 shrink-0',
          hideHeader && mode !== 'edit' ? 'opacity-0 group-hover:opacity-100' : 'opacity-100',
        )}>
          {mode === 'edit' && (
            <div {...(dragHandleProps || {})} className="cursor-grab active:cursor-grabbing shrink-0">
              <GripVertical className="h-3 w-3 text-muted-foreground/25" />
            </div>
          )}
          <span className={cn('text-[13px] font-semibold truncate flex-1', hasBgColor ? 'text-white/90' : 'text-primary')}>
            {widget.title}
          </span>
          {/* Toolbar dots — appears on hover */}
          <div className={cn('flex items-center gap-0.5 transition-opacity', mode !== 'edit' ? 'opacity-0 group-hover:opacity-100' : '')}>
            <button onClick={() => refetch()} className="h-5 w-5 inline-flex items-center justify-center rounded hover:bg-black/5 dark:hover:bg-white/10" title="Actualiser">
              <RefreshCw className={cn('h-2.5 w-2.5', hasBgColor ? 'text-white/40' : 'text-muted-foreground/30', isLoading && 'animate-spin')} />
            </button>
            <button onClick={handleExport} className="h-5 w-5 inline-flex items-center justify-center rounded hover:bg-black/5 dark:hover:bg-white/10" title="Exporter">
              <Download className={cn('h-2.5 w-2.5', hasBgColor ? 'text-white/40' : 'text-muted-foreground/30')} />
            </button>
            <button onClick={() => setFullscreen(true)} className="h-5 w-5 inline-flex items-center justify-center rounded hover:bg-black/5 dark:hover:bg-white/10" title="Plein écran">
              <Maximize2 className={cn('h-2.5 w-2.5', hasBgColor ? 'text-white/40' : 'text-muted-foreground/30')} />
            </button>
            {mode === 'edit' && onRemove && (
              <button onClick={onRemove} className="h-5 w-5 inline-flex items-center justify-center rounded hover:bg-destructive/10" title="Supprimer">
                <X className="h-2.5 w-2.5 text-destructive/40" />
              </button>
            )}
          </div>
        </div>
        {/* Content */}
        <div className="flex-1 min-h-0 px-4 pb-4" style={accentColor ? { '--widget-accent': accentColor } as React.CSSProperties : undefined}>
          {widgetContent}
        </div>
      </div>
    )
  }

  // Fullscreen overlay — modern modal
  return (
    <>
      <div className="flex flex-col h-full rounded-xl bg-card border border-border/50 shadow-sm overflow-hidden opacity-30" />
      <div className="fixed inset-0 z-[9999] bg-background/80 backdrop-blur-sm flex items-center justify-center p-8">
        <div className="w-full max-w-6xl h-full max-h-[90vh] bg-card rounded-2xl shadow-2xl border flex flex-col overflow-hidden">
          <div className="flex items-center h-12 px-5 border-b shrink-0">
            <WidgetTypeIcon type={widget.type} className="h-4 w-4 text-primary mr-2" />
            <span className="text-sm font-semibold flex-1">{widget.title}</span>
            <button onClick={() => refetch()} className="h-8 w-8 inline-flex items-center justify-center rounded-lg hover:bg-muted transition-colors mr-1">
              <RefreshCw className={cn('h-3.5 w-3.5 text-muted-foreground', isLoading && 'animate-spin')} />
            </button>
            <button onClick={() => setFullscreen(false)} className="h-8 w-8 inline-flex items-center justify-center rounded-lg hover:bg-muted transition-colors">
              <Minimize2 className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
          </div>
          <div className="flex-1 min-h-0 p-5" style={accentColor ? { '--widget-accent': accentColor } as React.CSSProperties : undefined}>
            {widgetContent}
          </div>
        </div>
      </div>
    </>
  )
}

// ── Error State ─────────────────────────────────────────────────

function WidgetError({ onRetry }: { error?: unknown; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-2 text-center">
      <AlertTriangle className="h-5 w-5 text-destructive" />
      <p className="text-xs text-muted-foreground">Erreur de chargement</p>
      <button
        onClick={onRetry}
        className="text-xs text-primary hover:underline"
      >
        Réessayer
      </button>
    </div>
  )
}

// ── Loading Skeleton ────────────────────────────────────────────

function WidgetSkeleton(_props: { type: string }) {
  return (
    <div className="flex items-center justify-center h-full">
      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
    </div>
  )
}

// ── Widget Renderer (type switch) ───────────────────────────────

function WidgetRenderer({
  widget,
  data,
  meta,
}: {
  widget: DashboardWidget
  data: unknown[]
  meta?: Record<string, unknown>
}) {
  switch (widget.type) {
    case 'kpi':
      return <KPIWidget config={widget.config} data={data} meta={meta} />
    case 'chart':
      return <ChartWidget widgetId={widget.id} config={widget.config} data={data} />
    case 'table':
      return <TableWidget widgetId={widget.id} config={widget.config} data={data} />
    case 'map':
      return <MapWidget config={widget.config} data={data} />
    case 'text':
      return <TextWidget config={widget.config} data={data} />
    case 'perspective':
      return (
        <PerspectiveWidget
          data={data as Record<string, unknown>[]}
          config={widget.config as PerspectiveConfig}
        />
      )
    case 'quick_access':
      return <QuickAccessWidget config={widget.config} data={data} />
    case 'clock':
      return <ClockWidget config={widget.config} />
    case 'group':
      return <GroupWidget config={widget.config} />
    default:
      return (
        <div className="flex items-center justify-center h-full text-xs text-muted-foreground">
          Type de widget inconnu : {widget.type}
        </div>
      )
  }
}

// ── KPI Widget — Kyubit-level card ─────────────────────────────
//
// Layout: [Icon circle] [Value block]     [Sparkline area]
//                        Big number
//                        Delta + comparison
//         [Label below]

// Icon color presets — mapped from config.icon_color or accent
const KPI_ICON_COLORS: Record<string, { bg: string; fg: string }> = {
  blue:   { bg: 'bg-blue-500',   fg: 'text-white' },
  green:  { bg: 'bg-emerald-500', fg: 'text-white' },
  red:    { bg: 'bg-red-500',    fg: 'text-white' },
  orange: { bg: 'bg-orange-400', fg: 'text-white' },
  yellow: { bg: 'bg-yellow-400', fg: 'text-yellow-900' },
  violet: { bg: 'bg-violet-500', fg: 'text-white' },
  cyan:   { bg: 'bg-cyan-500',   fg: 'text-white' },
  pink:   { bg: 'bg-pink-500',   fg: 'text-white' },
  slate:  { bg: 'bg-slate-500',  fg: 'text-white' },
}

function KPIWidget({
  config,
  data,
  meta,
}: {
  config: Record<string, unknown>
  data: unknown[]
  meta?: Record<string, unknown>
}) {
  const valueField = (config.value_field as string) || 'value'
  const labelField = (config.label as string) || ''
  const trend = (meta?.trend as number) ?? (config.trend as number) ?? null
  const comparison = (meta?.comparison as string) || (config.comparison as string) || ''
  const format = (config.format as string) || 'number'
  const unit = (config.unit as string) || ''
  const iconColor = (config.icon_color as string) || 'blue'
  const iconPreset = KPI_ICON_COLORS[iconColor] || KPI_ICON_COLORS.blue

  // Extract value
  const rawValue = data?.[0]
    ? (data[0] as Record<string, unknown>)[valueField]
    : meta?.value
  const numValue = typeof rawValue === 'number' ? rawValue : parseFloat(String(rawValue ?? '0'))

  // Format display value
  let displayValue: string
  if (format === 'currency') {
    displayValue = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'XAF', maximumFractionDigits: 0 }).format(numValue)
  } else if (format === 'percent') {
    displayValue = `${numValue.toFixed(1)}%`
  } else if (numValue >= 1_000_000) {
    displayValue = `${(numValue / 1_000_000).toFixed(1)}M`
  } else if (numValue >= 10_000) {
    displayValue = `${(numValue / 1_000).toFixed(1)}k`
  } else {
    displayValue = new Intl.NumberFormat('fr-FR').format(numValue)
  }

  // Trend
  const trendUp = trend !== null && trend > 0
  const trendDown = trend !== null && trend < 0
  const TrendIcon = trend === null ? null : trendUp ? TrendingUp : trendDown ? TrendingDown : Minus
  const trendColor = trend === null ? 'text-muted-foreground' : trendUp ? 'text-emerald-600' : trendDown ? 'text-red-500' : 'text-muted-foreground'

  // Sparkline
  // Sparkline: use data from meta/config, or generate a simple pattern from the value
  const rawSparkline = (meta?.sparkline as number[]) || (config.sparkline as number[]) || null
  const sparklineData = rawSparkline || (numValue > 0 ? (() => {
    // Generate 8-point smooth sparkline based on value seed
    const seed = numValue % 17 + 3
    return Array.from({ length: 8 }, (_, i) => {
      const base = numValue * 0.7
      const wave = Math.sin(i * 0.8 + seed) * numValue * 0.2
      return Math.max(0, Math.round(base + wave + i * numValue * 0.04))
    })
  })() : null)
  const sparklineColor = trend === null ? '#3b82f6' : trendUp ? '#10b981' : trendDown ? '#ef4444' : '#94a3b8'

  // Details
  const details = (meta?.details || config.details) as Record<string, unknown> | undefined

  return (
    <div className="flex flex-col h-full gap-3">
      {/* Top row: icon + value + sparkline */}
      <div className="flex items-start gap-3 flex-1">
        {/* Icon circle */}
        <div className={cn('h-11 w-11 rounded-lg flex items-center justify-center shrink-0', iconPreset.bg)}>
          <Gauge className={cn('h-5 w-5', iconPreset.fg)} />
        </div>

        {/* Value block */}
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-bold tracking-tight leading-none text-foreground">
              {displayValue}
            </span>
            {unit && <span className="text-xs text-muted-foreground/60 font-medium">{unit}</span>}
          </div>
          {/* Delta row */}
          {trend !== null && (
            <div className="flex items-center gap-1.5 mt-1">
              {TrendIcon && <TrendIcon className={cn('h-3.5 w-3.5', trendColor)} />}
              <span className={cn('text-xs font-semibold', trendColor)}>
                {trendUp ? '+' : ''}{trend}%
              </span>
              {comparison && <span className="text-[11px] text-muted-foreground ml-1">{comparison}</span>}
            </div>
          )}
          {!trend && comparison && (
            <span className="text-[11px] text-muted-foreground mt-0.5 block">{comparison}</span>
          )}
        </div>

        {/* Mini sparkline (right side) */}
        {sparklineData && sparklineData.length > 1 && (
          <div className="w-20 h-10 shrink-0 self-center">
            <KPISparkline data={sparklineData} color={sparklineColor} />
          </div>
        )}
      </div>

      {/* Label */}
      {labelField && (
        <span className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">{labelField}</span>
      )}

      {/* Detail chips */}
      {details && Object.keys(details).length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(details).slice(0, 6).map(([k, v]) => {
            const label = k.replace(/_/g, ' ')
            const val = String(v)
            const isGood = /compliant|active|done|valid/.test(k)
            const isBad = /overdue|expired|critical|cancelled/.test(k)
            const chipColor = isGood ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300'
              : isBad ? 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300'
              : 'bg-muted/40 text-foreground/70'
            return (
              <div key={k} className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px]', chipColor)}>
                <span className="opacity-60">{label}</span>
                <span className="font-bold">{val}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── KPI Sparkline (mini area chart) ────────────────────────────

function KPISparkline({ data, color }: { data: number[]; color: string }) {
  const option = useMemo(() => ({
    grid: { top: 0, right: 0, bottom: 0, left: 0 },
    xAxis: { type: 'category' as const, show: false, data: data.map((_, i) => i) },
    yAxis: { type: 'value' as const, show: false, min: Math.min(...data) * 0.9, max: Math.max(...data) * 1.05 },
    series: [{
      type: 'line' as const,
      data,
      smooth: true,
      symbol: 'none',
      lineStyle: { width: 2, color },
      areaStyle: { color: { type: 'linear' as const, x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: color + '40' }, { offset: 1, color: color + '05' }] } },
    }],
    tooltip: { show: false },
    animation: false,
  }), [data, color])

  return <ReactECharts option={option} style={{ height: '100%', width: '100%' }} opts={{ renderer: 'svg' }} />
}

// ── Group Widget — Container for mini-KPI tiles ────────────────

interface GroupChild {
  title: string
  value: number | string
  format?: string
  unit?: string
  trend?: number | null
  sparkline?: number[]
  icon?: string
  color?: string
}

function GroupWidget({ config }: { config: Record<string, unknown> }) {
  const layout = (config.layout as string) || '2x2'
  const children = (config.children as GroupChild[]) || []

  // Parse layout → grid classes
  const gridClass = layout === '1x4' ? 'grid-cols-4'
    : layout === '4x1' ? 'grid-cols-1'
    : layout === '3x1' ? 'grid-cols-3'
    : layout === '1x3' ? 'grid-cols-1'
    : 'grid-cols-2' // 2x2 default

  if (!children.length) {
    return (
      <div className="flex items-center justify-center h-full text-xs text-muted-foreground/40">
        <LayoutGrid className="h-5 w-5 mr-2 opacity-30" />
        Configurer les KPIs enfants
      </div>
    )
  }

  return (
    <div className={cn('grid gap-2 h-full', gridClass)}>
      {children.map((child, idx) => (
        <GroupChildTile key={idx} child={child} />
      ))}
    </div>
  )
}

function GroupChildTile({ child }: { child: GroupChild }) {
  const { title, value, format, unit, trend, sparkline, color } = child

  // Format value
  const numValue = typeof value === 'number' ? value : parseFloat(String(value ?? '0'))
  let displayValue: string
  if (format === 'currency') {
    displayValue = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'XAF', maximumFractionDigits: 0 }).format(numValue)
  } else if (format === 'percent') {
    displayValue = `${numValue.toFixed(1)}%`
  } else if (numValue >= 1_000_000) {
    displayValue = `${(numValue / 1_000_000).toFixed(1)}M`
  } else if (numValue >= 10_000) {
    displayValue = `${(numValue / 1_000).toFixed(1)}k`
  } else {
    displayValue = typeof value === 'string' ? value : new Intl.NumberFormat('fr-FR').format(numValue)
  }

  const trendColor = trend == null ? '' : trend > 0 ? 'text-emerald-600' : trend < 0 ? 'text-red-500' : 'text-muted-foreground'
  const TrendIcon = trend == null ? null : trend > 0 ? TrendingUp : trend < 0 ? TrendingDown : Minus
  const accentColor = color || 'hsl(var(--primary))'
  const sparkColor = trend == null ? '#3b82f6' : trend > 0 ? '#22c55e' : trend < 0 ? '#ef4444' : '#94a3b8'

  return (
    <div className="flex flex-col justify-between rounded-lg bg-muted/30 dark:bg-muted/10 border border-border/30 px-3 py-2 min-h-0 overflow-hidden">
      {/* Title */}
      <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide truncate">{title}</span>
      {/* Value row */}
      <div className="flex items-baseline gap-1.5 mt-1">
        <span className="text-xl font-extrabold tracking-tight leading-none" style={{ color: accentColor }}>
          {displayValue}
        </span>
        {unit && <span className="text-[10px] text-muted-foreground/60">{unit}</span>}
      </div>
      {/* Trend + sparkline */}
      <div className="flex items-center justify-between mt-1 min-h-[16px]">
        {trend != null ? (
          <span className={cn('inline-flex items-center gap-0.5 text-[10px] font-semibold', trendColor)}>
            {TrendIcon && <TrendIcon className="h-2.5 w-2.5" />}
            {trend > 0 ? '+' : ''}{trend}%
          </span>
        ) : <span />}
        {sparkline && sparkline.length > 1 && (
          <div className="h-4 w-12">
            <KPISparkline data={sparkline} color={sparkColor} />
          </div>
        )}
      </div>
    </div>
  )
}

// ── Chart Widget ────────────────────────────────────────────────

function ChartWidget({
  widgetId,
  config,
  data,
}: {
  widgetId: string
  config: Record<string, unknown>
  data: unknown[]
}) {
  const { toggleFilter } = useDashboardFilters()
  const chartType = (config.chart_type as string) || 'bar'
  const xField = (config.x_field as string) || 'name'
  const yFields = (config.y_fields as string[]) || ['value']
  const crossFilterEnabled = config.cross_filter !== false

  // Provider may return {data: [...], series: [...]} or a flat array
  const firstItem = data?.[0] as Record<string, unknown> | undefined
  const chartData = (firstItem && Array.isArray(firstItem.data))
    ? (firstItem.data as Record<string, unknown>[])
    : (data as Record<string, unknown>[])

  // Map legacy chart_type values to EChartsWidget types
  const validTypes = ['bar', 'line', 'area', 'pie', 'scatter', 'radar', 'heatmap', 'gauge', 'treemap'] as const
  type ChartType = typeof validTypes[number]
  const resolvedType: ChartType = validTypes.includes(chartType as ChartType)
    ? (chartType as ChartType)
    : 'bar'

  // Cross-filter: click on chart element → toggle filter
  const handleChartClick = useCallback((params: Record<string, unknown>) => {
    if (!crossFilterEnabled) return
    const name = params.name as string
    if (name) {
      toggleFilter({ field: xField, value: name, source: widgetId, label: xField.replace(/_/g, ' ') })
    }
  }, [crossFilterEnabled, xField, widgetId, toggleFilter])

  return (
    <EChartsWidget
      chartType={resolvedType}
      data={chartData}
      xField={xField}
      yFields={yFields}
      height="100%"
      onChartClick={handleChartClick}
    />
  )
}

// ── Table Widget ────────────────────────────────────────────────

function TableWidget({
  widgetId,
  config,
  data: rawData,
}: {
  widgetId: string
  config: Record<string, unknown>
  data: unknown[]
}) {
  const { toggleFilter, isFilterActive } = useDashboardFilters()
  const crossFilterEnabled = config.cross_filter !== false

  // Provider may return {columns, rows} or a flat array of row objects
  const providerData = rawData?.[0] as Record<string, unknown> | undefined
  const hasProviderShape = providerData && Array.isArray(providerData.rows)
  const columns = hasProviderShape
    ? (providerData.columns as { key: string; label: string }[]) || []
    : (config.columns as { key: string; label: string }[]) || []
  const rows = hasProviderShape
    ? (providerData.rows as Record<string, unknown>[])
    : (rawData as Record<string, unknown>[])
  const pageSize = (config.page_size as number) || 10
  const [page, setPage] = useState(0)

  // Hidden columns from config
  const hiddenColumns = (config.hidden_columns as string[]) || []

  // Auto-detect columns from first row if not configured
  const allColumns = columns.length > 0
    ? columns
    : rows.length > 0
      ? Object.keys(rows[0]).slice(0, 12).map((key) => ({ key, label: key }))
      : []

  // Store available column keys in config for the settings panel column picker
  const availableColKeys = allColumns.map((c) => c.key)
  const prevAvailable = (config._available_columns as string[]) || []
  useEffect(() => {
    if (availableColKeys.length > 0 && JSON.stringify(availableColKeys) !== JSON.stringify(prevAvailable)) {
      // Silently patch config — this is read-only metadata for the settings panel
      ;(config as Record<string, unknown>)._available_columns = availableColKeys
    }
  }, [availableColKeys, prevAvailable, config])

  // Apply column visibility filter
  const effectiveColumns = hiddenColumns.length > 0
    ? allColumns.filter((c) => !hiddenColumns.includes(c.key))
    : allColumns

  // Click handler for cross-filtering
  const handleCellClick = (key: string, value: unknown) => {
    if (!crossFilterEnabled || value == null) return
    toggleFilter({ field: key, value, source: widgetId, label: key.replace(/_/g, ' ') })
  }

  // ── Smart cell rendering ──

  // Status badge colors
  const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
    draft: { bg: 'bg-slate-100 dark:bg-slate-800', text: 'text-slate-600 dark:text-slate-300' },
    brouillon: { bg: 'bg-slate-100 dark:bg-slate-800', text: 'text-slate-600 dark:text-slate-300' },
    planned: { bg: 'bg-amber-100 dark:bg-amber-900/30', text: 'text-amber-700 dark:text-amber-300' },
    planifie: { bg: 'bg-amber-100 dark:bg-amber-900/30', text: 'text-amber-700 dark:text-amber-300' },
    active: { bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-700 dark:text-blue-300' },
    in_progress: { bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-700 dark:text-blue-300' },
    todo: { bg: 'bg-slate-100 dark:bg-slate-800', text: 'text-slate-600 dark:text-slate-300' },
    completed: { bg: 'bg-emerald-100 dark:bg-emerald-900/30', text: 'text-emerald-700 dark:text-emerald-300' },
    done: { bg: 'bg-emerald-100 dark:bg-emerald-900/30', text: 'text-emerald-700 dark:text-emerald-300' },
    cancelled: { bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-700 dark:text-red-300' },
    suspended: { bg: 'bg-yellow-100 dark:bg-yellow-900/30', text: 'text-yellow-700 dark:text-yellow-300' },
    on_hold: { bg: 'bg-yellow-100 dark:bg-yellow-900/30', text: 'text-yellow-700 dark:text-yellow-300' },
    review: { bg: 'bg-purple-100 dark:bg-purple-900/30', text: 'text-purple-700 dark:text-purple-300' },
    submitted: { bg: 'bg-indigo-100 dark:bg-indigo-900/30', text: 'text-indigo-700 dark:text-indigo-300' },
  }

  const PRIORITY_COLORS: Record<string, string> = {
    low: 'text-emerald-600', medium: 'text-amber-600', high: 'text-orange-600', critical: 'text-red-600',
  }

  const isStatusCol = (key: string) => /status|statut/i.test(key)
  const isPriorityCol = (key: string) => /priority|priorite|priorité/i.test(key)
  const isProgressCol = (key: string) => /progress|pct|avancement|%/i.test(key)
  const isDateCol = (key: string) => /date|echeance|échéance|deadline|start|end|debut|fin|created|updated/i.test(key)
  const isRefCol = (key: string, colIdx: number) => colIdx === 0 || /code|ref|reference|id$/i.test(key)

  const renderCell = (value: unknown, key: string, colIdx: number) => {
    if (value == null) return <span className="text-muted-foreground/30">—</span>
    const s = String(value)

    // Status badge
    if (isStatusCol(key)) {
      const colors = STATUS_COLORS[s.toLowerCase().replace(/[^a-z_]/g, '_')] || STATUS_COLORS.draft
      return <span className={cn('inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold', colors?.bg, colors?.text)}>{s}</span>
    }

    // Priority with color
    if (isPriorityCol(key)) {
      const color = PRIORITY_COLORS[s.toLowerCase()] || ''
      return <span className={cn('font-semibold text-[10px] uppercase', color)}>{s}</span>
    }

    // Progress circle
    if (isProgressCol(key)) {
      const n = parseInt(s) || 0
      const color = n >= 70 ? '#22c55e' : n >= 30 ? '#f59e0b' : n < 1 ? '#d1d5db' : '#ef4444'
      return (
        <div className="flex items-center gap-1.5">
          <svg width="20" height="20" viewBox="0 0 20 20">
            <circle cx="10" cy="10" r="8" fill="none" stroke="#e5e7eb" strokeWidth="2.5" />
            <circle cx="10" cy="10" r="8" fill="none" stroke={color} strokeWidth="2.5"
              strokeDasharray={`${n * 0.502} 50.2`} strokeLinecap="round" transform="rotate(-90 10 10)" />
          </svg>
          <span className="text-[10px] font-bold" style={{ color }}>{n}%</span>
        </div>
      )
    }

    // Weather icons
    if (/weather|meteo|météo/i.test(key)) {
      const icons: Record<string, string> = { sunny: '☀️', cloudy: '⛅', rainy: '🌧️', stormy: '⛈️' }
      return <span title={s}>{icons[s.toLowerCase()] || s}</span>
    }

    // Trend icons
    if (/trend|tendance/i.test(key)) {
      const icons: Record<string, string> = { up: '📈', down: '📉', stable: '➡️', improving: '📈', degrading: '📉' }
      return <span title={s}>{icons[s.toLowerCase()] || '➡️'}</span>
    }

    // Criticality indicator
    if (/criticality|criticite|criticit/i.test(key)) {
      const n = parseInt(s) || 0
      const colors = ['#22c55e', '#84cc16', '#f59e0b', '#f97316', '#ef4444']
      const color = colors[Math.min(n, colors.length - 1)] || '#94a3b8'
      return (
        <div className="flex items-center gap-1" title={`Criticite ${n}/5`}>
          <div className="w-2.5 h-5 rounded-sm border border-border/40 overflow-hidden flex flex-col-reverse">
            <div style={{ height: `${Math.max(20, n * 20)}%`, backgroundColor: color }} className="rounded-sm" />
          </div>
          <span className="text-[10px] font-medium" style={{ color }}>{n}</span>
        </div>
      )
    }

    // Date formatting
    if (isDateCol(key) && /^\d{4}-\d{2}-\d{2}/.test(s)) {
      try { return <span>{new Date(s).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })}</span> } catch { /* */ }
    }

    // Reference / code — first column or ref-like columns — bold + primary color
    if (isRefCol(key, colIdx)) {
      return <span className="font-semibold text-primary cursor-pointer hover:underline">{s}</span>
    }

    return <span>{s.length > 45 ? s.slice(0, 45) + '…' : s}</span>
  }

  if (!rows.length || !effectiveColumns.length) {
    return (
      <div className="flex items-center justify-center h-full text-xs text-muted-foreground/40">
        Aucune donnée disponible
      </div>
    )
  }

  const totalPages = Math.ceil(rows.length / pageSize)
  const pagedRows = rows.slice(page * pageSize, (page + 1) * pageSize)

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 min-h-0 overflow-auto">
        <table className="w-full text-xs border-separate border-spacing-0">
          <thead className="sticky top-0 z-[1]">
            <tr>
              {effectiveColumns.map((col, i) => (
                <th
                  key={col.key}
                  className={cn(
                    'text-left px-2.5 py-2 font-bold text-[10px] uppercase tracking-wider whitespace-nowrap',
                    'bg-muted/40 text-foreground/70 border-b border-border/50',
                    i === 0 && 'rounded-tl-lg',
                    i === effectiveColumns.length - 1 && 'rounded-tr-lg',
                  )}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pagedRows.map((row, rowIdx) => (
              <tr key={rowIdx} className={cn(
                'transition-colors hover:bg-primary/[0.03] border-b border-border/20',
                rowIdx % 2 === 1 && 'bg-muted/15',
              )}>
                {effectiveColumns.map((col, colIdx) => {
                  const cellValue = row[col.key]
                  const isActive = isFilterActive(col.key, cellValue)
                  return (
                    <td
                      key={col.key}
                      className={cn(
                        'px-2.5 py-2 whitespace-nowrap max-w-[220px]',
                        crossFilterEnabled && 'cursor-pointer hover:bg-primary/5',
                        isActive && 'bg-primary/10 ring-1 ring-inset ring-primary/30',
                      )}
                      onClick={() => handleCellClick(col.key, cellValue)}
                    >
                      {renderCell(cellValue, col.key, colIdx)}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-2 py-1.5 border-t shrink-0">
          <span className="text-[10px] text-muted-foreground">
            {page * pageSize + 1}-{Math.min((page + 1) * pageSize, rows.length)} / {rows.length}
          </span>
          <div className="flex items-center gap-0.5">
            <button
              onClick={() => setPage(Math.max(0, page - 1))}
              disabled={page === 0}
              className="text-[10px] px-1.5 py-0.5 rounded hover:bg-muted disabled:opacity-30"
            >
              &lt;
            </button>
            {/* Numbered page buttons — show max 5 with ellipsis */}
            {(() => {
              const pages: (number | 'ellipsis')[] = []
              if (totalPages <= 5) {
                for (let i = 0; i < totalPages; i++) pages.push(i)
              } else {
                pages.push(0)
                if (page > 2) pages.push('ellipsis')
                for (let i = Math.max(1, page - 1); i <= Math.min(totalPages - 2, page + 1); i++) pages.push(i)
                if (page < totalPages - 3) pages.push('ellipsis')
                pages.push(totalPages - 1)
              }
              return pages.map((p, idx) =>
                p === 'ellipsis' ? (
                  <span key={`e${idx}`} className="text-[10px] px-1 text-muted-foreground">…</span>
                ) : (
                  <button
                    key={p}
                    onClick={() => setPage(p)}
                    className={cn(
                      'text-[10px] min-w-[20px] h-5 rounded transition-colors',
                      p === page
                        ? 'bg-primary text-primary-foreground font-bold'
                        : 'hover:bg-muted text-muted-foreground',
                    )}
                  >
                    {p + 1}
                  </button>
                ),
              )
            })()}
            <button
              onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
              disabled={page >= totalPages - 1}
              className="text-[10px] px-1.5 py-0.5 rounded hover:bg-muted disabled:opacity-30"
            >
              &gt;
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Map Widget (Vanilla Leaflet) ────────────────────────────────

// Fix Leaflet default marker icon issue
delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

import { useMapSettings, getTileUrl, getTileAttribution } from '@/hooks/useMapSettings'

interface MapWidgetProps {
  config: Record<string, unknown>
  data: unknown[]
}

function MapWidget({ config, data }: MapWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const tileRef = useRef<L.TileLayer | null>(null)
  const markersRef = useRef<L.Marker[]>([])
  const { data: mapSettings } = useMapSettings()

  const isFleetMap = config.fleet_map === true

  const provider = mapSettings?.provider || 'openstreetmap'
  const apiKey = provider === 'google_maps' ? mapSettings?.googleKey || '' : mapSettings?.mapboxToken || ''
  const style = mapSettings?.style || 'standard'
  const tileUrl = getTileUrl(provider, apiKey, style)
  const attribution = getTileAttribution(provider)

  // Extract positions from data
  const positions = (data as Record<string, unknown>[])
    .filter((d) => d.latitude != null && d.longitude != null)
    .map((d) => ({
      lat: Number(d.latitude),
      lng: Number(d.longitude),
      name: String(d.name || d.vector_name || d.code || ''),
      type: String(d.type || d.transport_mode || ''),
      pax: d.pax_count != null ? Number(d.pax_count) : null,
    }))

  // Init map
  useEffect(() => {
    const container = containerRef.current
    if (!container || mapRef.current) return

    const map = L.map(container, {
      center: [mapSettings?.defaultLat ?? 3.848, mapSettings?.defaultLng ?? 9.687],
      zoom: mapSettings?.defaultZoom ?? 6,
      zoomControl: false,
      attributionControl: false,
    })
    const tile = L.tileLayer(tileUrl, { attribution })
    tile.addTo(map)
    tileRef.current = tile
    mapRef.current = map

    requestAnimationFrame(() => {
      try {
        if (mapRef.current && map.getContainer()?.parentNode) map.invalidateSize()
      } catch { /* container removed before rAF fired */ }
    })

    return () => {
      map.remove()
      mapRef.current = null
      markersRef.current = []
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Swap tile layer when provider/style changes
  useEffect(() => {
    if (!mapRef.current) return
    if (tileRef.current) tileRef.current.remove()
    const newTile = L.tileLayer(tileUrl, { attribution })
    newTile.addTo(mapRef.current)
    tileRef.current = newTile
  }, [tileUrl, attribution])

  // Update markers
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    // Clear old markers
    markersRef.current.forEach((m) => m.remove())
    markersRef.current = []

    if (positions.length === 0) return

    for (const pos of positions) {
      const marker = L.marker([pos.lat, pos.lng])
        .addTo(map)
        .bindPopup(`<div style="font-size:12px;"><b>${pos.name}</b>${pos.type ? `<br/>${pos.type}` : ''}${pos.pax != null ? `<br/>PAX: ${pos.pax}` : ''}</div>`)
      markersRef.current.push(marker)
    }

    const bounds = L.latLngBounds(positions.map((p) => [p.lat, p.lng] as [number, number]))
    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [20, 20], maxZoom: 12 })
    }
  }, [positions.length, isFleetMap])

  if (positions.length === 0 && data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-1 text-center">
        <MapPin className="h-6 w-6 text-muted-foreground/30" />
        <p className="text-[10px] text-muted-foreground">Aucune position</p>
      </div>
    )
  }

  return <div ref={containerRef} style={{ height: '100%', width: '100%' }} />
}

// ── Text Widget ─────────────────────────────────────────────────

function TextWidget({
  config,
  data,
}: {
  config: Record<string, unknown>
  data: unknown[]
}) {
  const content = (config.content as string)
    || (data?.[0] as Record<string, unknown>)?.content as string
    || ''

  if (!content) {
    return (
      <div className="flex items-center justify-center h-full text-xs text-muted-foreground">
        Aucun contenu
      </div>
    )
  }

  // Parse inline markdown: **bold**, *italic*, `code`, [link](url)
  const renderInline = (text: string) => {
    const parts: React.ReactNode[] = []
    let remaining = text
    let keyIdx = 0
    const rx = /(\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`|\[(.+?)\]\((.+?)\))/g
    let lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = rx.exec(remaining)) !== null) {
      if (match.index > lastIndex) parts.push(remaining.slice(lastIndex, match.index))
      if (match[2]) parts.push(<strong key={keyIdx++} className="font-semibold">{match[2]}</strong>)
      else if (match[3]) parts.push(<em key={keyIdx++} className="italic">{match[3]}</em>)
      else if (match[4]) parts.push(<code key={keyIdx++} className="px-1 py-0.5 bg-muted rounded text-[10px] font-mono">{match[4]}</code>)
      else if (match[5] && match[6]) parts.push(<a key={keyIdx++} href={match[6]} target="_blank" rel="noopener noreferrer" className="text-primary underline">{match[5]}</a>)
      lastIndex = match.index + match[0].length
    }
    if (lastIndex < remaining.length) parts.push(remaining.slice(lastIndex))
    return parts.length > 0 ? parts : text
  }

  // Split into lines and render blocks
  const lines = content.split('\n')

  return (
    <div className="h-full overflow-auto prose prose-sm dark:prose-invert max-w-none text-xs leading-relaxed">
      {lines.map((line, i) => {
        // Code block (``` fenced)
        if (line.startsWith('```')) {
          // Collect lines until closing ```
          const codeLines: string[] = []
          let j = i + 1
          while (j < lines.length && !lines[j].startsWith('```')) {
            codeLines.push(lines[j])
            j++
          }
          if (codeLines.length > 0) {
            return (
              <pre key={i} className="bg-muted/50 border border-border/30 rounded-md p-2 text-[10px] font-mono overflow-x-auto my-1.5">
                {codeLines.join('\n')}
              </pre>
            )
          }
          return null // skip closing ```
        }
        // Skip lines inside code blocks (rendered by opening ```)
        if (i > 0) {
          let inBlock = false
          for (let k = 0; k < i; k++) {
            if (lines[k].startsWith('```')) inBlock = !inBlock
          }
          if (inBlock) return null
        }
        // Headings
        if (line.startsWith('### ')) return <h4 key={i} className="text-sm font-semibold mt-2 mb-1">{renderInline(line.slice(4))}</h4>
        if (line.startsWith('## ')) return <h3 key={i} className="text-sm font-bold mt-2 mb-1">{renderInline(line.slice(3))}</h3>
        if (line.startsWith('# ')) return <h2 key={i} className="text-base font-bold mt-2 mb-1">{renderInline(line.slice(2))}</h2>
        // Horizontal rule
        if (/^-{3,}$/.test(line.trim())) return <hr key={i} className="border-border/40 my-2" />
        // Numbered list
        if (/^\d+\.\s/.test(line)) {
          const text = line.replace(/^\d+\.\s/, '')
          return (
            <div key={i} className="flex gap-1.5 ml-2">
              <span className="text-muted-foreground shrink-0 w-3 text-right">{line.match(/^\d+/)?.[0]}.</span>
              <span>{renderInline(text)}</span>
            </div>
          )
        }
        // Bullet list
        if (line.startsWith('- ') || line.startsWith('* ')) {
          return (
            <div key={i} className="flex gap-1.5 ml-2">
              <span className="text-muted-foreground shrink-0">&bull;</span>
              <span>{renderInline(line.slice(2))}</span>
            </div>
          )
        }
        // Blockquote
        if (line.startsWith('> ')) {
          return <blockquote key={i} className="border-l-2 border-primary/40 pl-2 text-muted-foreground italic my-1">{renderInline(line.slice(2))}</blockquote>
        }
        // Table row (| col | col |)
        if (line.includes('|') && line.trim().startsWith('|')) {
          // Check if separator row
          if (/^\|[\s:-]+\|/.test(line.trim())) return null // skip separator
          const cells = line.split('|').filter(Boolean).map((c) => c.trim())
          // Detect if header (next line is separator)
          const nextLine = lines[i + 1]?.trim() || ''
          const isHeader = /^\|[\s:-]+\|/.test(nextLine)
          const Tag = isHeader ? 'th' : 'td'
          return (
            <div key={i} className="flex">
              {cells.map((cell, ci) => (
                <Tag key={ci} className={cn(
                  'px-2 py-1 border border-border/30 text-[10px]',
                  isHeader ? 'font-bold bg-muted/30' : '',
                )} style={{ minWidth: '60px' }}>
                  {renderInline(cell)}
                </Tag>
              ))}
            </div>
          )
        }
        // Empty line
        if (line.trim() === '') return <div key={i} className="h-2" />
        // Regular paragraph
        return <p key={i} className="mb-1">{renderInline(line)}</p>
      })}
    </div>
  )
}
