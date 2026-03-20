/**
 * FleetMap -- Real-time fleet tracking map using vanilla Leaflet.
 *
 * Shows all vehicles as markers on the map with icons by transport_mode
 * and color by status. Auto-refreshes every 30s via polling.
 * Reuses the same vanilla Leaflet patterns as MapPicker.tsx.
 */
import { useEffect, useRef, useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import L from 'leaflet'
import { Loader2, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { VehiclePosition } from '@/types/api'
import { useFleetPositions } from '@/hooks/useTravelWiz'
import 'leaflet/dist/leaflet.css'

// Fix default marker icon issue with bundlers
delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

import { useMapSettings, getTileUrl, getTileAttribution } from '@/hooks/useMapSettings'

// ── Marker helpers ───────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  active: '#22c55e',     // green
  idle: '#9ca3af',       // gray
  in_transit: '#3b82f6', // blue
  maintenance: '#f97316', // orange
}

const MODE_ICONS: Record<string, string> = {
  air: '\u2708',        // airplane
  sea: '\u26F5',        // sailboat
  road: '\u{1F68C}',    // bus
}

function createVehicleIcon(mode: string, status: string): L.DivIcon {
  const color = STATUS_COLORS[status] || '#9ca3af'
  const emoji = MODE_ICONS[mode] || '\u{1F69A}'
  return L.divIcon({
    className: '',
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -14],
    html: `<div style="
      width:28px;height:28px;border-radius:50%;
      background:${color};border:2px solid white;
      display:flex;align-items:center;justify-content:center;
      font-size:14px;box-shadow:0 2px 6px rgba(0,0,0,0.3);
      cursor:pointer;
    ">${emoji}</div>`,
  })
}

function formatSpeed(knots: number | null): string {
  if (knots == null) return '--'
  return `${knots.toFixed(1)} kn`
}

function formatTime(ts: string | null): string {
  if (!ts) return '--'
  return new Date(ts).toLocaleString('fr-FR', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' })
}

// ── Transport mode guesser ───────────────────────────────────

function guessTransportMode(type: string): string {
  const lower = type.toLowerCase()
  if (['helicopter', 'commercial_flight'].includes(lower)) return 'air'
  if (['boat', 'surfer', 'barge', 'tug', 'ship'].includes(lower)) return 'sea'
  return 'road'
}

// ── FleetMap Component ───────────────────────────────────────

interface FleetMapProps {
  height?: number | string
  className?: string
}

// ── Session persistence keys ────────────────────────────────
const SESSION_KEY_ZOOM = 'opsflux:fleetmap:zoom'
const SESSION_KEY_CENTER = 'opsflux:fleetmap:center'
const SESSION_KEY_STYLE = 'opsflux:fleetmap:style'

const STYLE_OPTIONS = [
  {
    value: 'standard',
    label: 'Standard',
    // Light map preview colors
    bg: 'bg-[#e8e4da]',
    line: 'bg-white',
    accent: 'bg-[#b8d4a0]',
  },
  {
    value: 'satellite',
    label: 'Satellite',
    bg: 'bg-[#1a3a1a]',
    line: 'bg-[#2a4a2a]',
    accent: 'bg-[#0d2d0d]',
  },
  {
    value: 'terrain',
    label: 'Terrain',
    bg: 'bg-[#d4cfc0]',
    line: 'bg-[#c0b8a0]',
    accent: 'bg-[#a8c090]',
  },
]

export function FleetMap({ height = 500, className }: FleetMapProps) {
  const { t } = useTranslation()
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const tileRef = useRef<L.TileLayer | null>(null)
  const markersRef = useRef<Map<string, L.Marker>>(new Map())
  const [selectedVehicle, setSelectedVehicle] = useState<string | null>(null)

  const { data: mapSettings } = useMapSettings()
  const { data: fleetData, isLoading, refetch, dataUpdatedAt } = useFleetPositions(30_000)

  // Local style override (session-persisted)
  const [localStyle, setLocalStyle] = useState<string>(() => {
    return sessionStorage.getItem(SESSION_KEY_STYLE) || ''
  })
  const activeStyle = localStyle || mapSettings?.style || 'standard'

  const provider = mapSettings?.provider || 'openstreetmap'
  const apiKey = provider === 'google_maps' ? mapSettings?.googleKey || '' : mapSettings?.mapboxToken || ''
  const tileUrl = getTileUrl(provider, apiKey, activeStyle)
  const attribution = getTileAttribution(provider)

  // Center/zoom from entity settings, restored from session if available
  const [sessionCenter] = useState<[number, number] | null>(() => {
    try { const c = sessionStorage.getItem(SESSION_KEY_CENTER); return c ? JSON.parse(c) : null } catch { return null }
  })
  const [sessionZoom] = useState<number | null>(() => {
    try { const z = sessionStorage.getItem(SESSION_KEY_ZOOM); return z ? Number(z) : null } catch { return null }
  })
  const defaultCenter: [number, number] = sessionCenter ?? [mapSettings?.defaultLat ?? 3.848, mapSettings?.defaultLng ?? 9.687]
  const defaultZoom = sessionZoom ?? mapSettings?.defaultZoom ?? 7

  const handleStyleChange = useCallback((newStyle: string) => {
    setLocalStyle(newStyle)
    sessionStorage.setItem(SESSION_KEY_STYLE, newStyle)
  }, [])

  // Init map — guarded against StrictMode double-mount and stale containers
  useEffect(() => {
    const container = containerRef.current
    if (!container || mapRef.current) return

    // Guard: if Leaflet already initialized on this DOM node (StrictMode remount)
    if ((container as unknown as Record<string, unknown>)._leaflet_id) {
      return
    }

    try {
      const map = L.map(container, {
        center: defaultCenter,
        zoom: defaultZoom,
        zoomControl: true,
      })

      const tile = L.tileLayer(tileUrl, { attribution })
      tile.addTo(map)
      tileRef.current = tile
      mapRef.current = map

      // Persist zoom/center on move
      map.on('moveend', () => {
        const c = map.getCenter()
        const z = map.getZoom()
        sessionStorage.setItem(SESSION_KEY_CENTER, JSON.stringify([c.lat, c.lng]))
        sessionStorage.setItem(SESSION_KEY_ZOOM, String(z))
      })

      requestAnimationFrame(() => {
        try {
          if (mapRef.current && map.getContainer()?.parentNode) map.invalidateSize()
        } catch { /* container removed before rAF fired */ }
      })

      return () => {
        map.remove()
        mapRef.current = null
        tileRef.current = null
        markersRef.current.clear()
      }
    } catch (err) {
      console.warn('[FleetMap] Leaflet init error:', err)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Swap tile layer when provider/style changes (setUrl doesn't work across providers)
  useEffect(() => {
    if (!mapRef.current) return
    if (tileRef.current) {
      tileRef.current.remove()
    }
    const newTile = L.tileLayer(tileUrl, { attribution })
    newTile.addTo(mapRef.current)
    tileRef.current = newTile
  }, [tileUrl, attribution])

  // Update markers when fleet data changes
  const updateMarkers = useCallback((positions: VehiclePosition[]) => {
    const map = mapRef.current
    if (!map) return

    const currentIds = new Set(positions.map((p) => p.vector_id))
    const existingMarkers = markersRef.current

    // Remove stale markers
    existingMarkers.forEach((marker, id) => {
      if (!currentIds.has(id)) {
        marker.remove()
        existingMarkers.delete(id)
      }
    })

    // Upsert markers
    for (const pos of positions) {
      const mode = pos.transport_mode || guessTransportMode(pos.vector_name || '')
      const icon = createVehicleIcon(mode, pos.status)
      const popupContent = `
        <div style="min-width:160px;font-size:12px;">
          <div style="font-weight:600;margin-bottom:4px;">${pos.vector_name || pos.vector_id}</div>
          <div style="color:#666;">Statut: <span style="color:${STATUS_COLORS[pos.status] || '#666'};font-weight:500;">${pos.status}</span></div>
          <div style="color:#666;">Vitesse: ${formatSpeed(pos.speed_knots)}</div>
          <div style="color:#666;">MAJ: ${formatTime(pos.last_update)}</div>
          ${pos.current_trip_code ? `<div style="color:#666;">Voyage: <span style="font-family:monospace;">${pos.current_trip_code}</span></div>` : ''}
        </div>
      `

      const existing = existingMarkers.get(pos.vector_id)
      if (existing) {
        existing.setLatLng([pos.latitude, pos.longitude])
        existing.setIcon(icon)
        existing.getPopup()?.setContent(popupContent)
      } else {
        const marker = L.marker([pos.latitude, pos.longitude], { icon })
          .addTo(map)
          .bindPopup(popupContent)

        marker.on('click', () => setSelectedVehicle(pos.vector_id))
        existingMarkers.set(pos.vector_id, marker)
      }
    }

    // Fit bounds if first load and we have positions
    if (positions.length > 0 && !selectedVehicle) {
      const bounds = L.latLngBounds(positions.map((p) => [p.latitude, p.longitude] as [number, number]))
      if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [40, 40], maxZoom: 12 })
      }
    }
  }, [selectedVehicle])

  useEffect(() => {
    if (fleetData?.positions) {
      updateMarkers(fleetData.positions)
    }
  }, [fleetData, updateMarkers])

  // Legend
  const legendItems = [
    { color: STATUS_COLORS.active, label: t('travelwiz.status_active') },
    { color: STATUS_COLORS.idle, label: t('travelwiz.status_idle') },
    { color: STATUS_COLORS.in_transit, label: t('travelwiz.status_in_transit') },
    { color: STATUS_COLORS.maintenance, label: t('travelwiz.status_maintenance') },
  ]

  return (
    <div className={className}>
      {/* Controls bar */}
      <div className="flex items-center justify-between px-2 py-1.5 border-b border-border bg-background">
        <div className="flex items-center gap-3">
          {legendItems.map((item) => (
            <div key={item.label} className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
              <span className="text-[10px] text-muted-foreground">{item.label}</span>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2">
          {dataUpdatedAt > 0 && (
            <span className="text-[10px] text-muted-foreground">
              MAJ {new Date(dataUpdatedAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          <button
            onClick={() => refetch()}
            className="h-6 w-6 inline-flex items-center justify-center rounded hover:bg-muted transition-colors"
            title={t('common.refresh')}
          >
            <RefreshCw className={`h-3 w-3 text-muted-foreground ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Map container */}
      <div className="relative" style={{ height }}>
        <div ref={containerRef} style={{ height: '100%', width: '100%' }} />

        {/* Loading overlay */}
        {isLoading && !fleetData && (
          <div className="absolute inset-0 bg-background/50 flex items-center justify-center z-[500]">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        )}

        {/* Top-right controls: vehicle count + style switcher */}
        <div className="absolute top-2 right-2 flex flex-col gap-1.5 z-[500]">
          {/* Vehicle count */}
          {fleetData && (
            <div className="bg-card/90 backdrop-blur-sm border border-border rounded-md px-2 py-1">
              <span className="text-xs font-medium text-foreground">{fleetData?.positions?.length ?? 0}</span>
              <span className="text-[10px] text-muted-foreground ml-1">{t('travelwiz.vectors')}</span>
            </div>
          )}
          {/* Style switcher — vertical column aligned with zoom */}
          <div className="flex flex-col gap-0.5">
            {STYLE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => handleStyleChange(opt.value)}
                title={opt.label}
                className={cn(
                  'w-7 h-7 rounded overflow-hidden border-[1.5px] transition-all',
                  activeStyle === opt.value
                    ? 'border-primary shadow-sm scale-110'
                    : 'border-transparent opacity-70 hover:opacity-100',
                )}
              >
                <div className={cn('w-full h-full relative', opt.bg)}>
                  <div className={cn('absolute top-1 left-0.5 right-1 h-[1px]', opt.line)} />
                  <div className={cn('absolute top-2.5 left-1 right-0.5 h-[1px]', opt.line)} />
                  <div className={cn('absolute bottom-0.5 left-0 w-1.5 h-1.5 rounded-[1px]', opt.accent)} />
                  <div className={cn('absolute top-0.5 right-0.5 w-1 h-1 rounded-[1px]', opt.accent)} />
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
