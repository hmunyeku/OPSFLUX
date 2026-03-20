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

export function FleetMap({ height = 500, className }: FleetMapProps) {
  const { t } = useTranslation()
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const tileRef = useRef<L.TileLayer | null>(null)
  const markersRef = useRef<Map<string, L.Marker>>(new Map())
  const [selectedVehicle, setSelectedVehicle] = useState<string | null>(null)

  const { data: mapSettings } = useMapSettings()
  const { data: fleetData, isLoading, refetch, dataUpdatedAt } = useFleetPositions(30_000)

  const provider = mapSettings?.provider || 'openstreetmap'
  const apiKey = provider === 'google_maps' ? mapSettings?.googleKey || '' : mapSettings?.mapboxToken || ''
  const style = mapSettings?.style || 'standard'
  const tileUrl = getTileUrl(provider, apiKey, style)
  const attribution = getTileAttribution(provider)

  // Center/zoom from entity settings (Parametres > Cartographie)
  const defaultCenter: [number, number] = [mapSettings?.defaultLat ?? 3.848, mapSettings?.defaultLng ?? 9.687]
  const defaultZoom = mapSettings?.defaultZoom ?? 7

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

  // Update tile layer
  useEffect(() => {
    if (tileRef.current) {
      tileRef.current.setUrl(tileUrl)
    }
  }, [tileUrl])

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

        {/* Vehicle count badge */}
        {fleetData && (
          <div className="absolute top-2 right-2 bg-card/90 backdrop-blur-sm border border-border rounded-md px-2 py-1 z-[500]">
            <span className="text-xs font-medium text-foreground">{fleetData?.positions?.length ?? 0}</span>
            <span className="text-[10px] text-muted-foreground ml-1">{t('travelwiz.vectors')}</span>
          </div>
        )}
      </div>
    </div>
  )
}
