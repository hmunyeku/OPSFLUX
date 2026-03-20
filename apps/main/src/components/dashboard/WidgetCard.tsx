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
} from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import api from '@/lib/api'
import type { SettingRead } from '@/types/api'
import 'leaflet/dist/leaflet.css'
import { cn } from '@/lib/utils'
import { useWidgetData } from '@/hooks/useDashboard'
import type { DashboardWidget } from '@/services/dashboardService'
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Legend,
} from 'recharts'

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

// ── Chart color palette ─────────────────────────────────────────

const CHART_COLORS = [
  'hsl(var(--primary))',
  'hsl(221, 83%, 53%)',     // blue
  'hsl(142, 71%, 45%)',     // green
  'hsl(38, 92%, 50%)',      // amber
  'hsl(0, 84%, 60%)',       // red
  'hsl(262, 83%, 58%)',     // purple
  'hsl(174, 72%, 40%)',     // teal
  'hsl(340, 82%, 52%)',     // pink
]

// ── Widget Type Icon ────────────────────────────────────────────

export function WidgetTypeIcon({ type, className }: { type: string; className?: string }) {
  const cls = cn('h-4 w-4', className)
  switch (type) {
    case 'kpi': return <Gauge className={cls} />
    case 'chart': return <BarChart3 className={cls} />
    case 'table': return <Table2 className={cls} />
    case 'map': return <MapPin className={cls} />
    case 'text': return <Type className={cls} />
    default: return <BarChart3 className={cls} />
  }
}

// ── Main WidgetCard ─────────────────────────────────────────────

interface WidgetCardProps {
  widget: DashboardWidget
  mode: 'view' | 'edit'
  onRemove?: () => void
  onUpdate?: (widget: DashboardWidget) => void
  /** Drag handle props from @dnd-kit (listeners + attributes) */
  dragHandleProps?: Record<string, unknown>
  /** Badge count for notifications (e.g., alerts, pending items) */
  badge?: number
}

export function WidgetCard({ widget, mode, onRemove, dragHandleProps, badge }: WidgetCardProps) {
  const { t } = useTranslation()
  const { data, error, refetch, dataUpdatedAt, isLoading } = useWidgetData(
    widget.id,
    widget.type,
    widget.config,
  )

  const [fullscreen, setFullscreen] = useState(false)

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
        <WidgetRenderer widget={widget} data={data?.data || []} meta={data?.meta} />
      )}
    </>
  )

  const headerBar = (
    <div className="flex items-center h-9 px-3 border-b flex-shrink-0 gap-2">
      {mode === 'edit' && (
        <div {...(dragHandleProps || {})} className="cursor-grab active:cursor-grabbing shrink-0">
          <GripVertical className="h-3.5 w-3.5 text-muted-foreground" />
        </div>
      )}
      <WidgetTypeIcon type={widget.type} className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      <span className="text-xs font-medium truncate flex-1">{widget.title}</span>
      {badge != null && badge > 0 && (
        <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold shrink-0">
          {badge > 99 ? '99+' : badge}
        </span>
      )}
      <span className="text-[10px] text-muted-foreground shrink-0">
        {formatRelativeTime(dataUpdatedAt)}
      </span>
      <button
        onClick={() => refetch()}
        className="h-6 w-6 inline-flex items-center justify-center rounded hover:bg-muted transition-colors shrink-0"
        title={t('common.refresh')}
      >
        <RefreshCw className={cn('h-3 w-3 text-muted-foreground', isLoading && 'animate-spin')} />
      </button>
      <button
        onClick={() => setFullscreen(!fullscreen)}
        className="h-6 w-6 inline-flex items-center justify-center rounded hover:bg-muted transition-colors shrink-0"
        title={fullscreen ? t('common.minimize') : t('common.fullscreen')}
      >
        {fullscreen
          ? <Minimize2 className="h-3 w-3 text-muted-foreground" />
          : <Maximize2 className="h-3 w-3 text-muted-foreground" />}
      </button>
      {mode === 'edit' && onRemove && (
        <button
          onClick={onRemove}
          className="h-6 w-6 inline-flex items-center justify-center rounded hover:bg-destructive/10 transition-colors shrink-0"
          title={t('common.remove')}
        >
          <X className="h-3 w-3 text-muted-foreground" />
        </button>
      )}
    </div>
  )

  // Normal card
  if (!fullscreen) {
    return (
      <div className="flex flex-col h-full bg-background border rounded-md overflow-hidden">
        {headerBar}
        <div className="flex-1 min-h-0 p-2">{widgetContent}</div>
      </div>
    )
  }

  // Fullscreen overlay
  return (
    <>
      {/* Placeholder in grid */}
      <div className="flex flex-col h-full bg-background border rounded-md overflow-hidden opacity-30">
        {headerBar}
        <div className="flex-1 min-h-0 p-2" />
      </div>
      {/* Fullscreen overlay */}
      <div className="fixed inset-0 z-[9999] bg-background flex flex-col">
        {headerBar}
        <div className="flex-1 min-h-0 p-4">{widgetContent}</div>
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
        R\u00e9essayer
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

  return (
    <div className="flex flex-col items-center justify-center h-full gap-1">
      {labelField && (
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
          {labelField}
        </span>
      )}
      <span className="text-3xl font-bold text-foreground leading-none">{displayValue}</span>
      {(trend !== null || comparison) && (
        <div className={cn('flex items-center gap-1 text-xs', trendColor)}>
          {TrendIcon && <TrendIcon className="h-3 w-3" />}
          {trend !== null && <span>{trend > 0 ? '+' : ''}{trend}%</span>}
          {comparison && <span className="text-muted-foreground">{comparison}</span>}
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
  const chartData = data as Record<string, unknown>[]

  if (!chartData.length) {
    return (
      <div className="flex items-center justify-center h-full text-xs text-muted-foreground">
        Aucune donn\u00e9e
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      {chartType === 'line' ? (
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
          <XAxis dataKey={xField} tick={{ fontSize: 10 }} className="text-muted-foreground" />
          <YAxis tick={{ fontSize: 10 }} className="text-muted-foreground" />
          <RechartsTooltip
            contentStyle={{ fontSize: 12, borderRadius: 6, border: '1px solid hsl(var(--border))' }}
          />
          {yFields.map((field, i) => (
            <Line
              key={field}
              type="monotone"
              dataKey={field}
              stroke={CHART_COLORS[i % CHART_COLORS.length]}
              strokeWidth={2}
              dot={false}
            />
          ))}
        </LineChart>
      ) : chartType === 'area' ? (
        <AreaChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
          <XAxis dataKey={xField} tick={{ fontSize: 10 }} />
          <YAxis tick={{ fontSize: 10 }} />
          <RechartsTooltip contentStyle={{ fontSize: 12, borderRadius: 6, border: '1px solid hsl(var(--border))' }} />
          {yFields.map((field, i) => (
            <Area
              key={field}
              type="monotone"
              dataKey={field}
              stroke={CHART_COLORS[i % CHART_COLORS.length]}
              fill={CHART_COLORS[i % CHART_COLORS.length]}
              fillOpacity={0.15}
            />
          ))}
        </AreaChart>
      ) : chartType === 'pie' ? (
        <PieChart>
          <Pie
            data={chartData}
            dataKey={yFields[0]}
            nameKey={xField}
            cx="50%"
            cy="50%"
            innerRadius="40%"
            outerRadius="70%"
            paddingAngle={2}
          >
            {chartData.map((_, i) => (
              <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
            ))}
          </Pie>
          <RechartsTooltip contentStyle={{ fontSize: 12, borderRadius: 6, border: '1px solid hsl(var(--border))' }} />
          <Legend wrapperStyle={{ fontSize: 10 }} />
        </PieChart>
      ) : (
        /* Default: bar chart */
        <BarChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
          <XAxis dataKey={xField} tick={{ fontSize: 10 }} />
          <YAxis tick={{ fontSize: 10 }} />
          <RechartsTooltip contentStyle={{ fontSize: 12, borderRadius: 6, border: '1px solid hsl(var(--border))' }} />
          {yFields.map((field, i) => (
            <Bar
              key={field}
              dataKey={field}
              fill={CHART_COLORS[i % CHART_COLORS.length]}
              radius={[2, 2, 0, 0]}
            />
          ))}
        </BarChart>
      )}
    </ResponsiveContainer>
  )
}

// ── Table Widget ────────────────────────────────────────────────

function TableWidget({
  config,
  data,
}: {
  config: Record<string, unknown>
  data: unknown[]
}) {
  const columns = (config.columns as { key: string; label: string }[]) || []
  const rows = data as Record<string, unknown>[]
  const pageSize = (config.page_size as number) || 10
  const [page, setPage] = useState(0)

  // Auto-detect columns from first row if not configured
  const effectiveColumns = columns.length > 0
    ? columns
    : rows.length > 0
      ? Object.keys(rows[0]).slice(0, 6).map((key) => ({ key, label: key }))
      : []

  if (!rows.length || !effectiveColumns.length) {
    return (
      <div className="flex items-center justify-center h-full text-xs text-muted-foreground">
        Aucune donn\u00e9e
      </div>
    )
  }

  const totalPages = Math.ceil(rows.length / pageSize)
  const pagedRows = rows.slice(page * pageSize, (page + 1) * pageSize)

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 min-h-0 overflow-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b">
              {effectiveColumns.map((col) => (
                <th
                  key={col.key}
                  className="text-left px-2 py-1.5 font-medium text-muted-foreground whitespace-nowrap"
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pagedRows.map((row, rowIdx) => (
              <tr key={rowIdx} className="border-b last:border-0 hover:bg-muted/50">
                {effectiveColumns.map((col) => (
                  <td key={col.key} className="px-2 py-1.5 text-foreground whitespace-nowrap truncate max-w-[200px]">
                    {String(row[col.key] ?? '')}
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

function useWidgetMapSettings() {
  return useQuery({
    queryKey: ['settings', 'entity', 'map'],
    queryFn: async () => {
      try {
        const { data } = await api.get<SettingRead[]>('/api/v1/settings', { params: { scope: 'entity' } })
        const map: Record<string, string> = {}
        for (const s of data) {
          if (s.key.startsWith('integration.')) {
            map[s.key] = (s.value?.v ?? s.value ?? '') as string
          }
        }
        return {
          provider: map['integration.map.provider'] || 'openstreetmap',
          googleKey: map['integration.google_maps.api_key'] || '',
          mapboxToken: map['integration.mapbox.access_token'] || '',
          style: map['integration.map.style'] || 'standard',
        }
      } catch {
        return { provider: 'openstreetmap', googleKey: '', mapboxToken: '', style: 'standard' }
      }
    },
    staleTime: 5 * 60 * 1000,
  })
}

function getWidgetTileUrl(provider: string, apiKey: string, style: string): string {
  switch (provider) {
    case 'google_maps':
      return `https://mt1.google.com/vt/lyrs=${style === 'satellite' ? 's' : style === 'terrain' ? 'p' : 'm'}&x={x}&y={y}&z={z}`
    case 'mapbox':
      return `https://api.mapbox.com/styles/v1/mapbox/${style || 'streets-v12'}/tiles/{z}/{x}/{y}?access_token=${apiKey}`
    default:
      return 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
  }
}

function getWidgetTileAttribution(provider: string): string {
  switch (provider) {
    case 'google_maps': return '&copy; Google Maps'
    case 'mapbox': return '&copy; Mapbox'
    default: return '&copy; OSM'
  }
}

interface MapWidgetProps {
  config: Record<string, unknown>
  data: unknown[]
}

function MapWidget({ config, data }: MapWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const markersRef = useRef<L.Marker[]>([])
  const { data: mapSettings } = useWidgetMapSettings()

  const isFleetMap = config.fleet_map === true

  const provider = mapSettings?.provider || 'openstreetmap'
  const apiKey = provider === 'google_maps' ? mapSettings?.googleKey || '' : mapSettings?.mapboxToken || ''
  const style = mapSettings?.style || 'standard'
  const tileUrl = getWidgetTileUrl(provider, apiKey, style)
  const attribution = getWidgetTileAttribution(provider)

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
      center: [3.848, 9.687],
      zoom: 6,
      zoomControl: false,
      attributionControl: false,
    })
    L.tileLayer(tileUrl, { attribution }).addTo(map)
    mapRef.current = map

    requestAnimationFrame(() => map.invalidateSize())

    return () => {
      map.remove()
      mapRef.current = null
      markersRef.current = []
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
