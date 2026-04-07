/**
 * WidgetCard — Container for an individual dashboard widget.
 *
 * Renders a card with header (title, refresh, actions) and content area.
 * Content is delegated to WidgetRenderer which picks the right sub-component
 * based on widget.type (kpi, chart, table, map, text).
 */
import { useState, useEffect, useRef } from 'react'
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

// ── Relative time formatting ────────────────────────────────────

function formatRelativeTime(timestamp: number | undefined): string {
  if (!timestamp) return ''
  const seconds = Math.floor((Date.now() - timestamp) / 1000)
  if (seconds < 10) return 'maintenant'
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}min`
  const hours = Math.floor(minutes / 60)
  return `${hours}h`
}


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
  // Use config.widget_id (provider ID) for data fetching, fallback to widget.id
  const dataWidgetId = (widget.config?.widget_id as string) || widget.id
  const { data, error, refetch, dataUpdatedAt, isLoading } = useWidgetData(
    dataWidgetId,
    widget.type,
    widget.config,
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

  // Modern card — PowerBI/Tableau inspired
  if (!fullscreen) {
    return (
      <div
        className={cn(
          'group flex flex-col h-full rounded-xl overflow-hidden transition-all duration-200',
          'shadow-[0_1px_3px_rgba(0,0,0,0.08)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.12)]',
          !hasBgColor && 'bg-card border border-border/50',
        )}
        style={cssVars}
      >
        {/* Compact header */}
        <div className={cn(
          'flex items-center h-7 px-3 gap-1.5 shrink-0',
          hideHeader && mode !== 'edit' ? 'opacity-0 group-hover:opacity-100' : 'opacity-100',
        )}>
          {mode === 'edit' && (
            <div {...(dragHandleProps || {})} className="cursor-grab active:cursor-grabbing shrink-0">
              <GripVertical className="h-3 w-3 text-muted-foreground/40" />
            </div>
          )}
          <span className={cn('text-[11px] font-semibold truncate flex-1', hasBgColor ? 'text-white/90' : 'text-foreground/70')}>
            {widget.title}
          </span>
          {/* Clock icon with relative time as tooltip */}
          <span className={cn('shrink-0 cursor-default', hasBgColor ? 'text-white/30' : 'text-muted-foreground/30')} title={formatRelativeTime(dataUpdatedAt)}>
            <Clock className="h-2.5 w-2.5" />
          </span>
          {/* Action buttons — visible on hover */}
          <div className={cn('flex items-center gap-0.5 transition-opacity', mode !== 'edit' ? 'opacity-0 group-hover:opacity-100' : '')}>
            <button onClick={() => refetch()} className="h-5 w-5 inline-flex items-center justify-center rounded hover:bg-black/5 dark:hover:bg-white/10 transition-colors" title="Actualiser">
              <RefreshCw className={cn('h-2.5 w-2.5', hasBgColor ? 'text-white/60' : 'text-muted-foreground/50', isLoading && 'animate-spin')} />
            </button>
            <button onClick={() => setFullscreen(true)} className="h-5 w-5 inline-flex items-center justify-center rounded hover:bg-black/5 dark:hover:bg-white/10 transition-colors" title="Plein ecran">
              <Maximize2 className={cn('h-2.5 w-2.5', hasBgColor ? 'text-white/60' : 'text-muted-foreground/50')} />
            </button>
            {mode === 'edit' && onRemove && (
              <button onClick={onRemove} className="h-5 w-5 inline-flex items-center justify-center rounded hover:bg-destructive/20 transition-colors" title="Supprimer">
                <X className="h-2.5 w-2.5 text-destructive/60" />
              </button>
            )}
          </div>
        </div>
        {/* Content area */}
        <div className="flex-1 min-h-0 px-3 pb-3" style={accentColor ? { '--widget-accent': accentColor } as React.CSSProperties : undefined}>
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
      return <ChartWidget config={widget.config} data={data} />
    case 'table':
      return <TableWidget config={widget.config} data={data} />
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
    default:
      return (
        <div className="flex items-center justify-center h-full text-xs text-muted-foreground">
          Type de widget inconnu : {widget.type}
        </div>
      )
  }
}

// ── KPI Widget ──────────────────────────────────────────────────

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

  // Extract value from first data item or meta
  const rawValue = data?.[0]
    ? (data[0] as Record<string, unknown>)[valueField]
    : meta?.value

  const numValue = typeof rawValue === 'number' ? rawValue : parseFloat(String(rawValue ?? '0'))

  // Format display value
  let displayValue: string
  if (format === 'currency') {
    displayValue = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(numValue)
  } else if (format === 'percent') {
    displayValue = `${numValue.toFixed(1)}%`
  } else {
    displayValue = new Intl.NumberFormat('fr-FR').format(numValue)
  }

  const TrendIcon = trend === null ? null : trend > 0 ? TrendingUp : trend < 0 ? TrendingDown : Minus
  const trendColor = trend === null ? '' : trend > 0 ? 'text-green-600 dark:text-green-400' : trend < 0 ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground'

  // Extract details if available
  const details = (meta?.details || config.details) as Record<string, unknown> | undefined

  return (
    <div className="flex flex-col justify-center h-full gap-2">
      {/* Main value — large, bold, colored */}
      <div className="flex items-baseline gap-2">
        <span className="text-4xl font-extrabold tracking-tight leading-none" style={{ color: 'var(--widget-accent, hsl(var(--primary)))' }}>
          {displayValue}
        </span>
        {labelField && (
          <span className="text-xs text-muted-foreground font-medium">{labelField}</span>
        )}
      </div>
      {/* Trend line */}
      {(trend !== null || comparison) && (
        <div className={cn('flex items-center gap-1.5 text-xs font-medium', trendColor)}>
          {TrendIcon && <TrendIcon className="h-3.5 w-3.5" />}
          {trend !== null && <span>{trend > 0 ? '+' : ''}{trend}%</span>}
          {comparison && <span className="text-muted-foreground font-normal">{comparison}</span>}
        </div>
      )}
      {/* Detail chips — show extra metrics from the provider */}
      {details && Object.keys(details).length > 1 && (
        <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1">
          {Object.entries(details).slice(0, 6).map(([k, v]) => (
            <div key={k} className="flex items-center gap-1 text-[10px]">
              <span className="text-muted-foreground/60">{k.replace(/_/g, ' ')}</span>
              <span className="font-semibold text-foreground/80">{String(v)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Chart Widget ────────────────────────────────────────────────

function ChartWidget({
  config,
  data,
}: {
  config: Record<string, unknown>
  data: unknown[]
}) {
  const chartType = (config.chart_type as string) || 'bar'
  const xField = (config.x_field as string) || 'name'
  const yFields = (config.y_fields as string[]) || ['value']
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

  return (
    <EChartsWidget
      chartType={resolvedType}
      data={chartData}
      xField={xField}
      yFields={yFields}
      height="100%"
    />
  )
}

// ── Table Widget ────────────────────────────────────────────────

function TableWidget({
  config,
  data: rawData,
}: {
  config: Record<string, unknown>
  data: unknown[]
}) {
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

  // Auto-detect columns from first row if not configured
  const effectiveColumns = columns.length > 0
    ? columns
    : rows.length > 0
      ? Object.keys(rows[0]).slice(0, 6).map((key) => ({ key, label: key }))
      : []

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
                    'bg-primary/10 text-primary/80 border-b-2 border-primary/20',
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
                {effectiveColumns.map((col, colIdx) => (
                  <td key={col.key} className="px-2.5 py-2 whitespace-nowrap max-w-[220px]">
                    {renderCell(row[col.key], col.key, colIdx)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-2 py-1 border-t shrink-0">
          <span className="text-[10px] text-muted-foreground">
            {page * pageSize + 1}-{Math.min((page + 1) * pageSize, rows.length)} / {rows.length}
          </span>
          <div className="flex gap-1">
            <button
              onClick={() => setPage(Math.max(0, page - 1))}
              disabled={page === 0}
              className="text-[10px] px-1.5 py-0.5 rounded hover:bg-muted disabled:opacity-40"
            >
              &lt;
            </button>
            <button
              onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
              disabled={page >= totalPages - 1}
              className="text-[10px] px-1.5 py-0.5 rounded hover:bg-muted disabled:opacity-40"
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

  return (
    <div className="h-full overflow-auto prose prose-sm dark:prose-invert max-w-none text-xs leading-relaxed">
      {/* Basic markdown-like rendering: bold, italic, headings, paragraphs */}
      {content.split('\n').map((line, i) => {
        if (line.startsWith('### ')) {
          return <h4 key={i} className="text-sm font-semibold mt-2 mb-1">{line.slice(4)}</h4>
        }
        if (line.startsWith('## ')) {
          return <h3 key={i} className="text-sm font-bold mt-2 mb-1">{line.slice(3)}</h3>
        }
        if (line.startsWith('# ')) {
          return <h2 key={i} className="text-base font-bold mt-2 mb-1">{line.slice(2)}</h2>
        }
        if (line.startsWith('- ')) {
          return (
            <div key={i} className="flex gap-1.5 ml-2">
              <span className="text-muted-foreground shrink-0">&bull;</span>
              <span>{line.slice(2)}</span>
            </div>
          )
        }
        if (line.trim() === '') {
          return <div key={i} className="h-2" />
        }
        return <p key={i} className="mb-1">{line}</p>
      })}
    </div>
  )
}
