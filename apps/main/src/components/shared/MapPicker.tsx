/**
 * MapPicker — Reusable map component for selecting coordinates.
 *
 * Uses **vanilla Leaflet** directly (no react-leaflet) to avoid the
 * react-leaflet v5 / React 18 Context.Consumer crash.
 *
 * Tile provider is configurable via entity settings (OSM/Google/Mapbox).
 * Can be embedded inline or opened as a modal (MapPickerModal).
 *
 * Usage:
 *   <MapPicker latitude={3.848} longitude={9.687} onSelect={(lat, lng) => { ... }} />
 *   <MapPickerModal open={show} onClose={...} latitude={3.848} longitude={9.687} onSelect={...} />
 */
import { useState, useEffect, useCallback, useRef } from 'react'
import L from 'leaflet'
import { X, MapPin, Search, Loader2, Crosshair } from 'lucide-react'
import 'leaflet/dist/leaflet.css'

// Fix Leaflet default marker icon issue with bundlers
delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

import { useMapSettings, getTileUrl, getTileAttribution } from '@/hooks/useMapSettings'

// ── Geocoding ─────────────────────────────────────────────
async function geocodeAddress(
  query: string,
  _provider: string,
  _apiKey: string,
): Promise<{ lat: number; lng: number; display: string }[]> {
  // Use Nominatim (free) as the universal fallback.
  const res = await fetch(
    `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5`,
  )
  const data = await res.json()
  return data.map((r: { lat: string; lon: string; display_name: string }) => ({
    lat: parseFloat(r.lat),
    lng: parseFloat(r.lon),
    display: r.display_name,
  }))
}

// Reverse geocoding: coordinates → address
export async function reverseGeocode(
  lat: number,
  lng: number,
): Promise<{
  address_line1: string
  city: string
  state_province: string
  postal_code: string
  country: string
} | null> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&addressdetails=1`,
    )
    const data = await res.json()
    if (!data.address) return null
    const a = data.address
    return {
      address_line1: [a.road, a.house_number].filter(Boolean).join(' ') || data.display_name?.split(',')[0] || '',
      city: a.city || a.town || a.village || a.municipality || '',
      state_province: a.state || a.region || '',
      postal_code: a.postcode || '',
      country: a.country || '',
    }
  } catch {
    return null
  }
}

// Forward geocoding export for AddressManager
export async function forwardGeocode(
  query: string,
): Promise<{ lat: number; lng: number } | null> {
  try {
    const results = await geocodeAddress(query, 'nominatim', '')
    return results.length > 0 ? { lat: results[0].lat, lng: results[0].lng } : null
  } catch {
    return null
  }
}

// useMapSettings is now imported from @/hooks/useMapSettings

// ── Vanilla Leaflet Map hook ──────────────────────────────
// Encapsulates all Leaflet lifecycle (init, tile, marker, click) in a ref-based hook.
function useLeafletMap(opts: {
  containerRef: React.RefObject<HTMLDivElement | null>
  center: [number, number]
  zoom: number
  tileUrl: string
  attribution: string
  markerPos: [number, number] | null
  onClick: (lat: number, lng: number) => void
}) {
  const mapRef = useRef<L.Map | null>(null)
  const tileRef = useRef<L.TileLayer | null>(null)
  const markerRef = useRef<L.Marker | null>(null)

  // Init map
  useEffect(() => {
    const container = opts.containerRef.current
    if (!container || mapRef.current) return

    const map = L.map(container, {
      center: opts.center,
      zoom: opts.zoom,
      zoomControl: true,
    })

    const tile = L.tileLayer(opts.tileUrl, { attribution: opts.attribution })
    tile.addTo(map)
    tileRef.current = tile

    map.on('click', (e: L.LeafletMouseEvent) => {
      opts.onClick(e.latlng.lat, e.latlng.lng)
    })

    // Place initial marker
    if (opts.markerPos) {
      const marker = L.marker(opts.markerPos).addTo(map)
      markerRef.current = marker
    }

    mapRef.current = map

    // Force a resize after mount (fixes grey tiles in modals)
    requestAnimationFrame(() => {
      try {
        if (mapRef.current && map.getContainer()?.parentNode) map.invalidateSize()
      } catch { /* container removed before rAF fired */ }
    })

    return () => {
      map.remove()
      mapRef.current = null
      tileRef.current = null
      markerRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // init once

  // Swap tile layer when provider/style changes
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (tileRef.current) tileRef.current.remove()
    const newTile = L.tileLayer(opts.tileUrl, { attribution: opts.attribution })
    newTile.addTo(map)
    tileRef.current = newTile
  }, [opts.tileUrl, opts.attribution])

  // Update marker position
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    if (opts.markerPos) {
      if (markerRef.current) {
        markerRef.current.setLatLng(opts.markerPos)
      } else {
        markerRef.current = L.marker(opts.markerPos).addTo(map)
      }
      map.setView(opts.markerPos, map.getZoom())
    } else if (markerRef.current) {
      markerRef.current.remove()
      markerRef.current = null
    }
  }, [opts.markerPos?.[0], opts.markerPos?.[1]])

  return mapRef
}

// ── MapPicker Component (vanilla Leaflet) ─────────────────

interface MapPickerProps {
  /** Initial latitude */
  latitude?: number | null
  /** Initial longitude */
  longitude?: number | null
  /** Callback when user selects a point on the map */
  onSelect: (lat: number, lng: number) => void
  /** Height of the map container */
  height?: number
  /** Whether to show the search bar */
  showSearch?: boolean
}

export function MapPicker({
  latitude,
  longitude,
  onSelect,
  height = 350,
  showSearch = true,
}: MapPickerProps) {
  const { data: mapSettings } = useMapSettings()
  const containerRef = useRef<HTMLDivElement>(null)
  const [markerPos, setMarkerPos] = useState<[number, number] | null>(
    latitude != null && longitude != null ? [latitude, longitude] : null,
  )
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<{ lat: number; lng: number; display: string }[]>([])
  const [searching, setSearching] = useState(false)
  const [showResults, setShowResults] = useState(false)
  const searchRef = useRef<HTMLDivElement>(null)

  // Sync external lat/lng changes
  useEffect(() => {
    if (latitude != null && longitude != null) {
      setMarkerPos([latitude, longitude])
    }
  }, [latitude, longitude])

  const handleMapClick = useCallback(
    (lat: number, lng: number) => {
      setMarkerPos([lat, lng])
      onSelect(lat, lng)
    },
    [onSelect],
  )

  const provider = mapSettings?.provider || 'openstreetmap'
  const apiKey = provider === 'google_maps' ? mapSettings?.googleKey || '' : mapSettings?.mapboxToken || ''
  const style = mapSettings?.style || 'standard'
  const tileUrl = getTileUrl(provider, apiKey, style)
  const attribution = getTileAttribution(provider)
  const settingsCenter: [number, number] = [mapSettings?.defaultLat ?? 3.848, mapSettings?.defaultLng ?? 9.687]
  const defaultCenter: [number, number] = markerPos || settingsCenter
  const defaultZoom = markerPos ? 14 : (mapSettings?.defaultZoom ?? 6)

  // Vanilla Leaflet hook
  useLeafletMap({
    containerRef,
    center: defaultCenter,
    zoom: defaultZoom,
    tileUrl,
    attribution,
    markerPos,
    onClick: handleMapClick,
  })

  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) return
    setSearching(true)
    try {
      const geoProvider = mapSettings?.geocodingProvider || 'nominatim'
      const results = await geocodeAddress(searchQuery, geoProvider, apiKey)
      setSearchResults(results)
      setShowResults(true)
    } catch {
      setSearchResults([])
    } finally {
      setSearching(false)
    }
  }, [searchQuery, mapSettings, apiKey])

  const handleSelectResult = useCallback(
    (result: { lat: number; lng: number }) => {
      setMarkerPos([result.lat, result.lng])
      onSelect(result.lat, result.lng)
      setShowResults(false)
      setSearchQuery('')
    },
    [onSelect],
  )

  // Close search results on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowResults(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div className="space-y-2">
      {/* Search bar */}
      {showSearch && (
        <div ref={searchRef} className="relative">
          <div className="flex items-center gap-1.5">
            <div className="relative flex-1">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                className="gl-form-input text-sm w-full pl-8"
                placeholder="Rechercher une adresse..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    handleSearch()
                  }
                }}
              />
            </div>
            <button
              type="button"
              onClick={handleSearch}
              disabled={searching || !searchQuery.trim()}
              className="gl-button-sm gl-button-confirm shrink-0"
            >
              {searching ? <Loader2 size={12} className="animate-spin" /> : <Search size={12} />}
              Chercher
            </button>
          </div>

          {/* Search results dropdown */}
          {showResults && searchResults.length > 0 && (
            <div className="absolute z-[1000] top-full left-0 right-0 mt-1 bg-card border border-border rounded-lg shadow-lg max-h-48 overflow-y-auto">
              {searchResults.map((r, i) => (
                <button
                  key={i}
                  type="button"
                  className="gl-button gl-button-default w-full text-left text-sm last:border-0 flex items-start"
                  onClick={() => handleSelectResult(r)}
                >
                  <MapPin size={12} className="text-primary shrink-0 mt-0.5" />
                  <span className="text-foreground line-clamp-2">{r.display}</span>
                </button>
              ))}
            </div>
          )}

          {showResults && searchResults.length === 0 && !searching && (
            <div className="absolute z-[1000] top-full left-0 right-0 mt-1 bg-card border border-border rounded-lg shadow-lg px-3 py-2">
              <p className="text-xs text-muted-foreground">Aucun résultat trouvé.</p>
            </div>
          )}
        </div>
      )}

      {/* Map container — vanilla Leaflet renders here */}
      <div className="border border-border rounded-lg overflow-hidden relative" style={{ height }}>
        <div ref={containerRef} style={{ height: '100%', width: '100%' }} />

        {/* Coordinates display */}
        {markerPos && (
          <div className="absolute bottom-2 left-2 bg-card/90 backdrop-blur-sm border border-border rounded-md px-2 py-1 z-[500] text-xs font-mono text-foreground">
            <Crosshair size={10} className="inline mr-1" />
            {markerPos[0].toFixed(6)}, {markerPos[1].toFixed(6)}
          </div>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        Cliquez sur la carte pour sélectionner un point, ou utilisez la barre de recherche.
      </p>
    </div>
  )
}

// ── MapPicker Modal ────────────────────────────────────────

interface MapPickerModalProps {
  open: boolean
  onClose: () => void
  latitude?: number | null
  longitude?: number | null
  onSelect: (lat: number, lng: number) => void
}

export function MapPickerModal({
  open,
  onClose,
  latitude,
  longitude,
  onSelect,
}: MapPickerModalProps) {
  const [tempPos, setTempPos] = useState<{ lat: number; lng: number } | null>(
    latitude != null && longitude != null ? { lat: latitude, lng: longitude } : null,
  )

  useEffect(() => {
    if (open && latitude != null && longitude != null) {
      setTempPos({ lat: latitude, lng: longitude })
    }
  }, [open, latitude, longitude])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-2xl mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <MapPin size={16} className="text-primary" />
            <h3 className="text-sm font-semibold text-foreground">Choisir sur la carte</h3>
          </div>
          <button onClick={onClose} className="gl-button gl-button-default">
            <X size={16} />
          </button>
        </div>

        {/* Map */}
        <div className="p-4">
          <MapPicker
            latitude={tempPos?.lat}
            longitude={tempPos?.lng}
            height={400}
            onSelect={(lat, lng) => setTempPos({ lat, lng })}
          />
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-border">
          <div className="text-xs text-muted-foreground">
            {tempPos ? (
              <span className="font-mono">{tempPos.lat.toFixed(6)}, {tempPos.lng.toFixed(6)}</span>
            ) : (
              'Cliquez sur la carte pour sélectionner un point.'
            )}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="gl-button-sm gl-button-default">
              Annuler
            </button>
            <button
              onClick={() => {
                if (tempPos) {
                  onSelect(tempPos.lat, tempPos.lng)
                  onClose()
                }
              }}
              disabled={!tempPos}
              className="gl-button-sm gl-button-confirm"
            >
              Valider
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
