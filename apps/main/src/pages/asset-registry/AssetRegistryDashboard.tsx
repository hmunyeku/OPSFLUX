/**
 * Asset Registry Dashboard — KPIs, charts, and map overview.
 *
 * Uses the /stats endpoint for aggregate data, and the
 * hierarchy + list endpoints for map markers.
 * Follows vanilla-Leaflet pattern from MapPicker (no react-leaflet).
 */
import { useMemo, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import {
  MapPin, Landmark, Factory, Wrench, Ship,
  Loader2, RefreshCw, Map as MapIcon,
} from 'lucide-react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { cn } from '@/lib/utils'
import { useAssetRegistryStats, useFields, useSites, useInstallations } from '@/hooks/useAssetRegistry'
import { useMapSettings, getTileUrl, getTileAttribution } from '@/hooks/useMapSettings'
import { useUIStore } from '@/stores/uiStore'

// Fix Leaflet default marker icon issue with bundlers
delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

// ── Color palette for charts ─────────────────────────────────

const CHART_COLORS = [
  '#6366f1', // indigo
  '#06b6d4', // cyan
  '#f59e0b', // amber
  '#10b981', // emerald
  '#ef4444', // red
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#f97316', // orange
  '#14b8a6', // teal
  '#64748b', // slate
]

const STATUS_COLORS: Record<string, string> = {
  OPERATIONAL: '#10b981',
  STANDBY: '#f59e0b',
  UNDER_CONSTRUCTION: '#3b82f6',
  SUSPENDED: '#94a3b8',
  DECOMMISSIONED: '#ef4444',
  ABANDONED: '#6b7280',
}

// ── Marker icons per entity type ─────────────────────────────

function createIcon(color: string): L.DivIcon {
  return L.divIcon({
    className: 'ar-map-marker',
    html: `<div style="
      width:12px;height:12px;border-radius:50%;
      background:${color};border:2px solid #fff;
      box-shadow:0 1px 4px rgba(0,0,0,.3);
    "></div>`,
    iconSize: [12, 12],
    iconAnchor: [6, 6],
  })
}

const FIELD_ICON = createIcon('#6366f1')
const SITE_ICON = createIcon('#06b6d4')
const INSTALL_ICON = createIcon('#f59e0b')

// ── KPI Stat Card ────────────────────────────────────────────

function StatCard({
  icon: Icon,
  label,
  value,
  sublabel,
  color,
  loading,
}: {
  icon: typeof MapPin
  label: string
  value: number | undefined
  sublabel?: string
  color: string
  loading: boolean
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-muted-foreground">{label}</span>
        <div className={cn('h-8 w-8 rounded-lg flex items-center justify-center', color)}>
          <Icon size={16} className="text-white" />
        </div>
      </div>
      <div>
        {loading ? (
          <Loader2 size={20} className="animate-spin text-muted-foreground" />
        ) : (
          <p className="text-3xl font-bold text-foreground tabular-nums">{value ?? 0}</p>
        )}
      </div>
      {sublabel && !loading && (
        <p className="text-xs text-muted-foreground">{sublabel}</p>
      )}
    </div>
  )
}

// ── Mini Bar Chart (horizontal) ──────────────────────────────

function HBarChart({
  title,
  items,
  loading,
  colorMap,
}: {
  title: string
  items: { label: string; value: number; color?: string }[]
  loading: boolean
  colorMap?: Record<string, string>
}) {
  const maxVal = Math.max(...items.map((i) => i.value), 1)

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="px-4 py-3 border-b border-border">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      </div>
      <div className="p-4">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 size={16} className="animate-spin text-muted-foreground" />
          </div>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">--</p>
        ) : (
          <div className="space-y-2.5">
            {items.map((item, i) => {
              const pct = Math.round((item.value / maxVal) * 100)
              const bg = item.color || colorMap?.[item.label] || CHART_COLORS[i % CHART_COLORS.length]
              return (
                <div key={item.label} className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground w-28 truncate shrink-0" title={item.label}>
                    {item.label}
                  </span>
                  <div className="flex-1 h-5 bg-accent rounded-full overflow-hidden relative">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${Math.max(pct, 2)}%`, background: bg }}
                    />
                  </div>
                  <span className="text-xs font-semibold text-foreground tabular-nums w-8 text-right">
                    {item.value}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Donut Chart (pure CSS/SVG) ───────────────────────────────

function DonutChart({
  title,
  items,
  loading,
}: {
  title: string
  items: { label: string; value: number; color: string }[]
  loading: boolean
}) {
  const total = items.reduce((s, i) => s + i.value, 0)

  // SVG donut arcs
  const arcs = useMemo(() => {
    if (total === 0) return []
    const result: { d: string; color: string }[] = []
    let cumAngle = -90
    const cx = 50, cy = 50, r = 38

    for (const item of items) {
      const angle = (item.value / total) * 360
      const startRad = (cumAngle * Math.PI) / 180
      const endRad = ((cumAngle + angle) * Math.PI) / 180
      const x1 = cx + r * Math.cos(startRad)
      const y1 = cy + r * Math.sin(startRad)
      const x2 = cx + r * Math.cos(endRad)
      const y2 = cy + r * Math.sin(endRad)
      const largeArc = angle > 180 ? 1 : 0
      result.push({
        d: `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`,
        color: item.color,
      })
      cumAngle += angle
    }
    return result
  }, [items, total])

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="px-4 py-3 border-b border-border">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      </div>
      <div className="p-4">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 size={16} className="animate-spin text-muted-foreground" />
          </div>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">--</p>
        ) : (
          <div className="flex items-center gap-4">
            {/* SVG Donut */}
            <div className="shrink-0 w-28 h-28 relative">
              <svg viewBox="0 0 100 100" className="w-full h-full">
                {arcs.map((arc, i) => (
                  <path key={i} d={arc.d} fill={arc.color} opacity={0.85} />
                ))}
                {/* Center hole */}
                <circle cx={50} cy={50} r={22} className="fill-card" />
                <text
                  x={50}
                  y={50}
                  textAnchor="middle"
                  dominantBaseline="central"
                  className="fill-foreground text-[11px] font-bold"
                >
                  {total}
                </text>
              </svg>
            </div>

            {/* Legend */}
            <div className="flex-1 space-y-1.5 min-w-0">
              {items.slice(0, 8).map((item) => (
                <div key={item.label} className="flex items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 rounded-sm shrink-0"
                    style={{ background: item.color }}
                  />
                  <span className="text-xs text-muted-foreground truncate flex-1" title={item.label}>
                    {item.label.replace(/_/g, ' ')}
                  </span>
                  <span className="text-xs font-semibold text-foreground tabular-nums">
                    {item.value}
                  </span>
                </div>
              ))}
              {items.length > 8 && (
                <p className="text-xs text-muted-foreground">+{items.length - 8} autres</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Map Overview component ───────────────────────────────────

function MapOverview({
  fields,
  sites,
  installations,
  loading,
}: {
  fields: { id: string; code: string; name: string; lat: number; lng: number }[]
  sites: { id: string; code: string; name: string; lat: number; lng: number }[]
  installations: { id: string; code: string; name: string; lat: number; lng: number }[]
  loading: boolean
}) {
  const { t } = useTranslation()
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const layerGroupRef = useRef<L.LayerGroup | null>(null)
  const { data: mapSettings } = useMapSettings()
  const openDynamicPanel = useUIStore((s) => s.openDynamicPanel)

  const provider = mapSettings?.provider || 'openstreetmap'
  const apiKey = provider === 'google_maps' ? mapSettings?.googleKey || '' : mapSettings?.mapboxToken || ''
  const style = mapSettings?.style || 'standard'
  const tileUrl = getTileUrl(provider, apiKey, style)
  const attribution = getTileAttribution(provider)
  const defaultCenter: [number, number] = [mapSettings?.defaultLat ?? 3.848, mapSettings?.defaultLng ?? 9.687]
  const defaultZoom = mapSettings?.defaultZoom ?? 6

  // Init map
  useEffect(() => {
    const container = containerRef.current
    if (!container || mapRef.current) return

    const map = L.map(container, {
      center: defaultCenter,
      zoom: defaultZoom,
      zoomControl: true,
    })

    L.tileLayer(tileUrl, { attribution }).addTo(map)
    layerGroupRef.current = L.layerGroup().addTo(map)
    mapRef.current = map

    requestAnimationFrame(() => {
      try { map.invalidateSize() } catch { /* container removed */ }
    })

    return () => {
      map.remove()
      mapRef.current = null
      layerGroupRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Update markers when data changes
  useEffect(() => {
    const lg = layerGroupRef.current
    const map = mapRef.current
    if (!lg || !map) return

    lg.clearLayers()
    const bounds: [number, number][] = []

    for (const f of fields) {
      const marker = L.marker([f.lat, f.lng], { icon: FIELD_ICON })
        .bindPopup(`<b>${f.code}</b><br/>${f.name}<br/><i>Champ</i>`)
      marker.on('click', () => openDynamicPanel({ type: 'detail', module: 'ar-field', id: f.id }))
      lg.addLayer(marker)
      bounds.push([f.lat, f.lng])
    }

    for (const s of sites) {
      const marker = L.marker([s.lat, s.lng], { icon: SITE_ICON })
        .bindPopup(`<b>${s.code}</b><br/>${s.name}<br/><i>Site</i>`)
      marker.on('click', () => openDynamicPanel({ type: 'detail', module: 'ar-site', id: s.id }))
      lg.addLayer(marker)
      bounds.push([s.lat, s.lng])
    }

    for (const inst of installations) {
      const marker = L.marker([inst.lat, inst.lng], { icon: INSTALL_ICON })
        .bindPopup(`<b>${inst.code}</b><br/>${inst.name}<br/><i>Installation</i>`)
      marker.on('click', () => openDynamicPanel({ type: 'detail', module: 'ar-installation', id: inst.id }))
      lg.addLayer(marker)
      bounds.push([inst.lat, inst.lng])
    }

    if (bounds.length > 0) {
      map.fitBounds(bounds, { padding: [30, 30], maxZoom: 12 })
    }
  }, [fields, sites, installations, openDynamicPanel])

  const totalMarkers = fields.length + sites.length + installations.length

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <MapIcon size={14} className="text-muted-foreground" />
          <h3 className="text-sm font-semibold text-foreground">{t('assets.map_overview')}</h3>
        </div>
        {/* Legend */}
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: '#6366f1' }} />
            {t('assets.fields')}
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: '#06b6d4' }} />
            {t('assets.sites')}
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: '#f59e0b' }} />
            {t('assets.installations')}
          </span>
        </div>
      </div>
      <div className="relative" style={{ height: 380 }}>
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 size={24} className="animate-spin text-muted-foreground" />
          </div>
        ) : totalMarkers === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground">
            <MapPin size={32} className="opacity-30" />
            <p className="text-sm">{t('assets.no_coordinates')}</p>
          </div>
        ) : (
          <div ref={containerRef} style={{ height: '100%', width: '100%' }} />
        )}
      </div>
    </div>
  )
}

// ── Main Dashboard ───────────────────────────────────────────

export function AssetRegistryDashboard() {
  const { t } = useTranslation()
  const { data: stats, isLoading: statsLoading, refetch } = useAssetRegistryStats()

  // Fetch all items for the map (large page to get coordinates)
  const { data: fieldsData, isLoading: fieldsLoading } = useFields({ page: 1, page_size: 500 })
  const { data: sitesData, isLoading: sitesLoading } = useSites({ page: 1, page_size: 500 })
  const { data: installationsData, isLoading: installationsLoading } = useInstallations({ page: 1, page_size: 500 })

  const mapLoading = fieldsLoading || sitesLoading || installationsLoading

  // Extract items with coordinates for the map
  const mapFields = useMemo(() =>
    (fieldsData?.items ?? [])
      .filter((f) => f.centroid_latitude != null && f.centroid_longitude != null)
      .map((f) => ({
        id: f.id,
        code: f.code,
        name: f.name,
        lat: f.centroid_latitude!,
        lng: f.centroid_longitude!,
      })),
    [fieldsData],
  )

  const mapSites = useMemo(() =>
    (sitesData?.items ?? [])
      .filter((s) => s.latitude != null && s.longitude != null)
      .map((s) => ({
        id: s.id,
        code: s.code,
        name: s.name,
        lat: s.latitude!,
        lng: s.longitude!,
      })),
    [sitesData],
  )

  const mapInstallations = useMemo(() =>
    (installationsData?.items ?? [])
      .filter((i) => i.latitude != null && i.longitude != null)
      .map((i) => ({
        id: i.id,
        code: i.code,
        name: i.name,
        lat: i.latitude!,
        lng: i.longitude!,
      })),
    [installationsData],
  )

  // Chart data: equipment by class
  const equipByClass = useMemo(() =>
    (stats?.equipment_by_class ?? []).map((item, i) => ({
      label: item.equipment_class,
      value: item.count,
      color: CHART_COLORS[i % CHART_COLORS.length],
    })),
    [stats],
  )

  // Chart data: equipment by status
  const equipByStatus = useMemo(() =>
    (stats?.equipment_by_status ?? []).map((item) => ({
      label: item.status.replace(/_/g, ' '),
      value: item.count,
      color: STATUS_COLORS[item.status] || '#94a3b8',
    })),
    [stats],
  )

  // Chart data: sites by type
  const sitesByType = useMemo(() =>
    (stats?.sites_by_type ?? []).map((item, i) => ({
      label: item.site_type.replace(/_/g, ' '),
      value: item.count,
      color: CHART_COLORS[(i + 3) % CHART_COLORS.length],
    })),
    [stats],
  )

  return (
    <div className="p-4 space-y-4 overflow-y-auto">
      {/* Refresh button */}
      <div className="flex items-center justify-end">
        <button
          onClick={() => refetch()}
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <RefreshCw size={12} className={statsLoading ? 'animate-spin' : ''} />
          {t('common.refresh')}
        </button>
      </div>

      {/* ── KPI Row ─────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard
          icon={MapPin}
          label={t('assets.total_fields')}
          value={stats?.field_count}
          color="bg-indigo-500"
          loading={statsLoading}
        />
        <StatCard
          icon={Landmark}
          label={t('assets.total_sites')}
          value={stats?.site_count}
          color="bg-cyan-500"
          loading={statsLoading}
        />
        <StatCard
          icon={Factory}
          label={t('assets.total_installations')}
          value={stats?.installation_count}
          color="bg-amber-500"
          loading={statsLoading}
        />
        <StatCard
          icon={Wrench}
          label={t('assets.total_equipment')}
          value={stats?.equipment_count}
          color="bg-emerald-500"
          loading={statsLoading}
        />
        <StatCard
          icon={Ship}
          label={t('assets.total_pipelines')}
          value={stats?.pipeline_count}
          color="bg-red-500"
          loading={statsLoading}
        />
      </div>

      {/* ── Charts Row ──────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <DonutChart
          title={t('assets.equipment_by_class')}
          items={equipByClass}
          loading={statsLoading}
        />
        <HBarChart
          title={t('assets.equipment_by_status')}
          items={equipByStatus}
          loading={statsLoading}
          colorMap={STATUS_COLORS}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <DonutChart
          title={t('assets.sites_by_type')}
          items={sitesByType}
          loading={statsLoading}
        />
        <HBarChart
          title={t('assets.status_distribution')}
          items={equipByStatus}
          loading={statsLoading}
          colorMap={STATUS_COLORS}
        />
      </div>

      {/* ── Map Overview ────────────────────────────────────── */}
      <MapOverview
        fields={mapFields}
        sites={mapSites}
        installations={mapInstallations}
        loading={mapLoading}
      />
    </div>
  )
}
