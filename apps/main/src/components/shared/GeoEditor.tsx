/**
 * GeoEditor — Polymorphic GIS data capture component.
 *
 * Handles points, linestrings, polygons, and multi-points using vanilla Leaflet
 * (same pattern as MapPicker — no react-leaflet to avoid React 18 Context issues).
 *
 * Used across: assets, addresses, travelwiz, planner, conformite, etc.
 *
 * Usage:
 *   <GeoEditor
 *     value={form.geometry}
 *     onChange={(geo) => setForm({ ...form, geometry: geo })}
 *     geoType="linestring"
 *     height={400}
 *     showCoordinateTable
 *     showSearch
 *   />
 */
import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import L from 'leaflet'
import {
  Search,
  Loader2,
  MapPin,
  Pencil,
  Trash2,
  Plus,
  Copy,
  Upload,
  Download,
  ArrowUp,
  ArrowDown,
  Ruler,
  X,
  MousePointer2,
  ToggleLeft,
  ToggleRight,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import 'leaflet/dist/leaflet.css'

// ── Types ────────────────────────────────────────────────────
export type GeoType = 'point' | 'linestring' | 'polygon' | 'multipoint'

export interface GeoValue {
  type: GeoType
  coordinates: number[][] // [[lng, lat], ...] — GeoJSON order
  properties?: Record<string, unknown>
}

export interface GeoEditorProps {
  value: GeoValue | null
  onChange: (value: GeoValue | null) => void
  geoType: GeoType
  label?: string
  placeholder?: string
  readOnly?: boolean
  className?: string
  // Display options
  height?: number | string
  showCoordinateTable?: boolean
  showSearch?: boolean
  showToolbar?: boolean
  // Validation
  minPoints?: number
  maxPoints?: number
  // Map options
  defaultCenter?: [number, number] // [lat, lng]
  defaultZoom?: number
}

// ── Constants ────────────────────────────────────────────────
const DRAW_COLOR = '#3b82f6' // blue-500
const COMPLETED_COLOR = '#22c55e' // green-500
const VERTEX_RADIUS = 6
// Fallback values if settings not loaded yet (overridden by useMapSettings)
const FALLBACK_CENTER: [number, number] = [3.848, 9.687]
const FALLBACK_ZOOM = 6

type CoordFormat = 'dd' | 'dms'
type DrawMode = 'draw' | 'edit' | 'idle'

// ── Fix Leaflet default marker icon ──────────────────────────
delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

// ── Tile helpers (same as MapPicker) ─────────────────────────
import { useMapSettings, getTileUrl, getTileAttribution } from '@/hooks/useMapSettings'

// ── Geocoding ────────────────────────────────────────────────
async function geocodeAddress(
  query: string,
): Promise<{ lat: number; lng: number; display: string }[]> {
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

// ── Geo math helpers ─────────────────────────────────────────

/** Haversine distance between two [lat, lng] points — returns meters */
function haversine(a: [number, number], b: [number, number]): number {
  const R = 6371000
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(b[0] - a[0])
  const dLng = toRad(b[1] - a[1])
  const sinLat = Math.sin(dLat / 2)
  const sinLng = Math.sin(dLng / 2)
  const h = sinLat * sinLat + Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * sinLng * sinLng
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h))
}

/** Total distance of a path of [lat, lng] points — returns km */
function totalDistance(points: [number, number][]): number {
  let d = 0
  for (let i = 1; i < points.length; i++) {
    d += haversine(points[i - 1], points[i])
  }
  return d / 1000
}

/** Shoelace formula for polygon area using spherical excess — returns m^2 (approximate) */
function polygonArea(points: [number, number][]): number {
  if (points.length < 3) return 0
  const toRad = (d: number) => (d * Math.PI) / 180
  const R = 6371000
  let total = 0
  const n = points.length
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n
    const lat1 = toRad(points[i][0])
    const lat2 = toRad(points[j][0])
    const dLng = toRad(points[j][1] - points[i][1])
    total += dLng * (2 + Math.sin(lat1) + Math.sin(lat2))
  }
  return Math.abs((total * R * R) / 2)
}

/** Format a distance in km */
function formatDistance(km: number): string {
  if (km < 1) return `${(km * 1000).toFixed(0)} m`
  return `${km.toFixed(2)} km`
}

/** Format an area in m^2 */
function formatArea(m2: number): string {
  if (m2 < 10000) return `${m2.toFixed(0)} m²`
  const ha = m2 / 10000
  if (ha < 100) return `${ha.toFixed(2)} ha`
  return `${(m2 / 1e6).toFixed(2)} km²`
}

/** Decimal degrees to DMS string */
function ddToDms(dd: number, isLat: boolean): string {
  const dir = isLat ? (dd >= 0 ? 'N' : 'S') : dd >= 0 ? 'E' : 'W'
  const abs = Math.abs(dd)
  const deg = Math.floor(abs)
  const minF = (abs - deg) * 60
  const min = Math.floor(minF)
  const sec = ((minF - min) * 60).toFixed(2)
  return `${deg}°${min}'${sec}"${dir}`
}

/** Convert GeoJSON [lng, lat] to [lat, lng] for Leaflet */
function geoToLatLng(coords: number[][]): [number, number][] {
  return coords.map(([lng, lat]) => [lat, lng])
}

/** Convert Leaflet [lat, lng] to GeoJSON [lng, lat] */
function latLngToGeo(coords: [number, number][]): number[][] {
  return coords.map(([lat, lng]) => [lng, lat])
}

/** Snap a coordinate to N decimal places */
function snapCoord(val: number, decimals: number): number {
  const factor = Math.pow(10, decimals)
  return Math.round(val * factor) / factor
}

// ── GeoEditor Component ─────────────────────────────────────

export function GeoEditor({
  value,
  onChange,
  geoType,
  label,
  readOnly = false,
  className,
  height = 300,
  showCoordinateTable = false,
  showSearch = false,
  showToolbar = true,
  minPoints,
  maxPoints,
  defaultCenter,
  defaultZoom,
}: GeoEditorProps) {
  const { t } = useTranslation()
  const { data: mapSettings } = useMapSettings()

  // ── Refs ─────────────────────────────────────────────────
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const tileRef = useRef<L.TileLayer | null>(null)
  const layerGroupRef = useRef<L.LayerGroup | null>(null)
  const searchRef = useRef<HTMLDivElement>(null)

  // ── State ────────────────────────────────────────────────
  const [drawMode, setDrawMode] = useState<DrawMode>('idle')
  const [coordFormat, setCoordFormat] = useState<CoordFormat>('dd')
  const [snapEnabled, setSnapEnabled] = useState(false)
  const [snapDecimals] = useState(5)

  // Search
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<{ lat: number; lng: number; display: string }[]>([])
  const [searching, setSearching] = useState(false)
  const [showResults, setShowResults] = useState(false)

  // Import/Export modal
  const [showImport, setShowImport] = useState(false)
  const [importText, setImportText] = useState('')

  // Inline editing
  const [editingCell, setEditingCell] = useState<{ idx: number; field: 'lat' | 'lng' } | null>(null)
  const [editingValue, setEditingValue] = useState('')

  // Manual add
  const [showManualAdd, setShowManualAdd] = useState(false)
  const [manualLat, setManualLat] = useState('')
  const [manualLng, setManualLng] = useState('')

  // ── Derived ──────────────────────────────────────────────
  // Coordinates in [lat, lng] order for display / Leaflet
  const coords: [number, number][] = useMemo(() => {
    if (!value?.coordinates?.length) return []
    return geoToLatLng(value.coordinates)
  }, [value])

  const provider = mapSettings?.provider || 'openstreetmap'
  const apiKey = provider === 'google_maps' ? mapSettings?.googleKey || '' : mapSettings?.mapboxToken || ''
  const style = mapSettings?.style || 'standard'
  const tileUrl = getTileUrl(provider, apiKey, style)
  const attribution = getTileAttribution(provider)

  const settingsCenter: [number, number] = [mapSettings?.defaultLat ?? FALLBACK_CENTER[0], mapSettings?.defaultLng ?? FALLBACK_CENTER[1]]
  const center: [number, number] = defaultCenter ?? (coords.length > 0 ? coords[0] : settingsCenter)
  const zoom = defaultZoom ?? (coords.length > 0 ? 14 : (mapSettings?.defaultZoom ?? FALLBACK_ZOOM))

  // ── Measurements ─────────────────────────────────────────
  const measurements = useMemo(() => {
    if (coords.length < 2) return null
    if (geoType === 'linestring') {
      return { distance: totalDistance(coords) }
    }
    if (geoType === 'polygon' && coords.length >= 3) {
      const closed = [...coords, coords[0]]
      return {
        perimeter: totalDistance(closed),
        area: polygonArea(coords),
      }
    }
    return null
  }, [coords, geoType])

  // ── Helpers to update value ──────────────────────────────
  const updateCoords = useCallback(
    (newLatLng: [number, number][]) => {
      if (newLatLng.length === 0) {
        onChange(null)
        return
      }
      let processed = newLatLng
      if (snapEnabled) {
        processed = processed.map(([lat, lng]) => [
          snapCoord(lat, snapDecimals),
          snapCoord(lng, snapDecimals),
        ])
      }
      onChange({
        type: geoType,
        coordinates: latLngToGeo(processed),
        properties: value?.properties,
      })
    },
    [geoType, onChange, snapEnabled, snapDecimals, value?.properties],
  )

  const addPoint = useCallback(
    (lat: number, lng: number) => {
      if (maxPoints && coords.length >= maxPoints) return
      const newCoords: [number, number][] = [...coords, [lat, lng]]
      updateCoords(newCoords)
    },
    [coords, maxPoints, updateCoords],
  )

  const removePoint = useCallback(
    (idx: number) => {
      const newCoords = coords.filter((_, i) => i !== idx)
      updateCoords(newCoords)
    },
    [coords, updateCoords],
  )

  const movePoint = useCallback(
    (idx: number, direction: 'up' | 'down') => {
      const newCoords = [...coords]
      const swapIdx = direction === 'up' ? idx - 1 : idx + 1
      if (swapIdx < 0 || swapIdx >= newCoords.length) return
      ;[newCoords[idx], newCoords[swapIdx]] = [newCoords[swapIdx], newCoords[idx]]
      updateCoords(newCoords)
    },
    [coords, updateCoords],
  )

  const replacePoint = useCallback(
    (idx: number, lat: number, lng: number) => {
      const newCoords: [number, number][] = [...coords]
      newCoords[idx] = [lat, lng]
      updateCoords(newCoords)
    },
    [coords, updateCoords],
  )

  // ── Map click handler ────────────────────────────────────
  const handleMapClick = useCallback(
    (lat: number, lng: number) => {
      if (readOnly) return

      switch (geoType) {
        case 'point':
          // Single point: replace
          updateCoords([[lat, lng]])
          break
        case 'multipoint':
          // Add a new marker
          addPoint(lat, lng)
          break
        case 'linestring':
        case 'polygon':
          if (drawMode === 'draw') {
            addPoint(lat, lng)
          }
          break
      }
    },
    [geoType, readOnly, drawMode, addPoint, updateCoords],
  )

  // For polygon: close shape when clicking near first point
  const handlePolygonClose = useCallback(() => {
    if (geoType === 'polygon' && drawMode === 'draw' && coords.length >= 3) {
      setDrawMode('idle')
    }
  }, [geoType, drawMode, coords.length])

  // Double-click to finish drawing linestring/polygon
  const handleMapDblClick = useCallback(() => {
    if (readOnly) return
    if (drawMode === 'draw' && (geoType === 'linestring' || geoType === 'polygon')) {
      setDrawMode('idle')
    }
  }, [readOnly, drawMode, geoType])

  // ── Initialize Leaflet map ───────────────────────────────
  useEffect(() => {
    const container = containerRef.current
    if (!container || mapRef.current) return

    const map = L.map(container, {
      center,
      zoom,
      zoomControl: true,
      doubleClickZoom: false, // we handle dblclick ourselves
    })

    const tile = L.tileLayer(tileUrl, { attribution })
    tile.addTo(map)
    tileRef.current = tile

    const lg = L.layerGroup().addTo(map)
    layerGroupRef.current = lg

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
      layerGroupRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Attach/detach click handlers ─────────────────────────
  // We use a ref to hold the latest handleMapClick so the Leaflet listener
  // always calls the current closure without re-binding on every render.
  const clickHandlerRef = useRef(handleMapClick)
  clickHandlerRef.current = handleMapClick
  const dblClickHandlerRef = useRef(handleMapDblClick)
  dblClickHandlerRef.current = handleMapDblClick

  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    const onClick = (e: L.LeafletMouseEvent) => {
      clickHandlerRef.current(e.latlng.lat, e.latlng.lng)
    }
    const onDblClick = () => {
      dblClickHandlerRef.current()
    }

    map.on('click', onClick)
    map.on('dblclick', onDblClick)

    return () => {
      map.off('click', onClick)
      map.off('dblclick', onDblClick)
    }
  }, [])

  // ── Swap tile layer when provider/style changes ──────────
  useEffect(() => {
    if (!mapRef.current) return
    if (tileRef.current) tileRef.current.remove()
    const newTile = L.tileLayer(tileUrl, { attribution })
    newTile.addTo(mapRef.current)
    tileRef.current = newTile
  }, [tileUrl, attribution])

  // ── Render geometry on map ───────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    const lg = layerGroupRef.current
    if (!map || !lg) return

    lg.clearLayers()

    if (coords.length === 0) return

    const isDrawing = drawMode === 'draw'
    const color = isDrawing ? DRAW_COLOR : COMPLETED_COLOR

    switch (geoType) {
      case 'point': {
        if (coords.length > 0) {
          L.marker(coords[0]).addTo(lg)
        }
        break
      }
      case 'multipoint': {
        coords.forEach((c, idx) => {
          const marker = L.marker(c).addTo(lg)
          if (!readOnly) {
            marker.on('click', (e) => {
              L.DomEvent.stopPropagation(e)
              removePoint(idx)
            })
          }
          if (drawMode === 'edit' && !readOnly) {
            marker.dragging?.enable()
            marker.on('dragend', () => {
              const pos = marker.getLatLng()
              replacePoint(idx, pos.lat, pos.lng)
            })
          }
        })
        break
      }
      case 'linestring': {
        if (coords.length >= 2) {
          L.polyline(coords, { color, weight: 3 }).addTo(lg)
        }
        // Draw vertices
        coords.forEach((c, idx) => {
          const circle = L.circleMarker(c, {
            radius: VERTEX_RADIUS,
            color,
            fillColor: '#fff',
            fillOpacity: 1,
            weight: 2,
          }).addTo(lg)

          if ((drawMode === 'edit' || drawMode === 'draw') && !readOnly) {
            circle.options.interactive = true
            // Make vertex draggable via custom drag behavior
            let dragging = false
            circle.on('mousedown', (e) => {
              L.DomEvent.stopPropagation(e)
              dragging = true
              map.dragging.disable()
              const onMouseMove = (ev: L.LeafletMouseEvent) => {
                if (dragging) {
                  circle.setLatLng(ev.latlng)
                }
              }
              const onMouseUp = (ev: L.LeafletMouseEvent) => {
                dragging = false
                map.dragging.enable()
                map.off('mousemove', onMouseMove)
                map.off('mouseup', onMouseUp)
                replacePoint(idx, ev.latlng.lat, ev.latlng.lng)
              }
              map.on('mousemove', onMouseMove)
              map.on('mouseup', onMouseUp)
            })
          }
        })
        break
      }
      case 'polygon': {
        if (coords.length >= 3) {
          L.polygon(coords, { color, fillColor: color, fillOpacity: 0.15, weight: 2 }).addTo(lg)
        } else if (coords.length === 2) {
          L.polyline(coords, { color, weight: 2, dashArray: '5,5' }).addTo(lg)
        }
        // Draw vertices
        coords.forEach((c, idx) => {
          const circle = L.circleMarker(c, {
            radius: VERTEX_RADIUS,
            color,
            fillColor: idx === 0 && isDrawing ? '#ef4444' : '#fff',
            fillOpacity: 1,
            weight: 2,
          }).addTo(lg)

          if (idx === 0 && isDrawing && coords.length >= 3 && !readOnly) {
            circle.on('click', (e) => {
              L.DomEvent.stopPropagation(e)
              handlePolygonClose()
            })
          }

          if ((drawMode === 'edit') && !readOnly) {
            let dragging = false
            circle.on('mousedown', (e) => {
              L.DomEvent.stopPropagation(e)
              dragging = true
              map.dragging.disable()
              const onMouseMove = (ev: L.LeafletMouseEvent) => {
                if (dragging) circle.setLatLng(ev.latlng)
              }
              const onMouseUp = (ev: L.LeafletMouseEvent) => {
                dragging = false
                map.dragging.enable()
                map.off('mousemove', onMouseMove)
                map.off('mouseup', onMouseUp)
                replacePoint(idx, ev.latlng.lat, ev.latlng.lng)
              }
              map.on('mousemove', onMouseMove)
              map.on('mouseup', onMouseUp)
            })
          }
        })
        break
      }
    }

    // Fit bounds
    if (coords.length === 1) {
      map.setView(coords[0], map.getZoom() < 10 ? 14 : map.getZoom())
    } else if (coords.length > 1) {
      const bounds = L.latLngBounds(coords)
      map.fitBounds(bounds, { padding: [30, 30], maxZoom: 16 })
    }
  }, [coords, geoType, drawMode, readOnly, removePoint, replacePoint, handlePolygonClose])

  // ── Search ───────────────────────────────────────────────
  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) return
    setSearching(true)
    try {
      const results = await geocodeAddress(searchQuery)
      setSearchResults(results)
      setShowResults(true)
    } catch {
      setSearchResults([])
    } finally {
      setSearching(false)
    }
  }, [searchQuery])

  const handleSelectResult = useCallback(
    (result: { lat: number; lng: number }) => {
      const map = mapRef.current
      if (map) {
        map.setView([result.lat, result.lng], 14)
      }
      if (geoType === 'point') {
        updateCoords([[result.lat, result.lng]])
      } else {
        addPoint(result.lat, result.lng)
      }
      setShowResults(false)
      setSearchQuery('')
    },
    [geoType, updateCoords, addPoint],
  )

  // Close search on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowResults(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // ── Import / Export ──────────────────────────────────────
  const handleImport = useCallback(() => {
    const text = importText.trim()
    if (!text) return

    // Try GeoJSON first
    try {
      const parsed = JSON.parse(text)
      if (parsed.type === 'Feature' && parsed.geometry?.coordinates) {
        onChange({
          type: geoType,
          coordinates: parsed.geometry.coordinates as number[][],
          properties: (parsed.properties ?? undefined) as Record<string, unknown> | undefined,
        })
        setShowImport(false)
        setImportText('')
        return
      }
      if (parsed.type && parsed.coordinates) {
        onChange({
          type: geoType,
          coordinates: parsed.coordinates as number[][],
          properties: value?.properties,
        })
        setShowImport(false)
        setImportText('')
        return
      }
    } catch {
      // Not JSON, try CSV
    }

    // Try CSV: "lat,lng" or "lat;lng" per line
    const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)
    const parsed: [number, number][] = []
    for (const line of lines) {
      const parts = line.split(/[,;\t]+/).map((s) => s.trim())
      if (parts.length >= 2) {
        const a = parseFloat(parts[0])
        const b = parseFloat(parts[1])
        if (!isNaN(a) && !isNaN(b)) {
          // Assume lat, lng order in CSV
          parsed.push([a, b])
        }
      }
    }
    if (parsed.length > 0) {
      // Convert to GeoJSON [lng, lat]
      const geoCoords = parsed.map(([lat, lng]) => [lng, lat])
      onChange({
        type: geoType,
        coordinates: geoCoords,
        properties: value?.properties,
      })
    }
    setShowImport(false)
    setImportText('')
  }, [importText, geoType, onChange, value?.properties])

  const handleCopyGeoJSON = useCallback(() => {
    if (!value) return
    const geojson = {
      type: 'Feature',
      geometry: {
        type: geoType === 'point' ? 'Point' : geoType === 'linestring' ? 'LineString' : geoType === 'polygon' ? 'Polygon' : 'MultiPoint',
        coordinates: geoType === 'point' ? value.coordinates[0] : geoType === 'polygon' ? [...value.coordinates, value.coordinates[0]] : value.coordinates,
      },
      properties: value.properties ?? {},
    }
    navigator.clipboard.writeText(JSON.stringify(geojson, null, 2))
  }, [value, geoType])

  const handleCopyCoordList = useCallback(() => {
    if (!coords.length) return
    const text = coords.map(([lat, lng]) => `${lat},${lng}`).join('\n')
    navigator.clipboard.writeText(text)
  }, [coords])

  // ── Inline editing ───────────────────────────────────────
  const handleCellSave = useCallback(() => {
    if (!editingCell) return
    const val = parseFloat(editingValue)
    if (isNaN(val)) {
      setEditingCell(null)
      return
    }
    const { idx, field } = editingCell
    const [lat, lng] = coords[idx]
    if (field === 'lat') {
      replacePoint(idx, val, lng)
    } else {
      replacePoint(idx, lat, val)
    }
    setEditingCell(null)
  }, [editingCell, editingValue, coords, replacePoint])

  // ── Manual add ───────────────────────────────────────────
  const handleManualAdd = useCallback(() => {
    const lat = parseFloat(manualLat)
    const lng = parseFloat(manualLng)
    if (isNaN(lat) || isNaN(lng)) return
    if (geoType === 'point') {
      updateCoords([[lat, lng]])
    } else {
      addPoint(lat, lng)
    }
    setManualLat('')
    setManualLng('')
    setShowManualAdd(false)
  }, [manualLat, manualLng, geoType, updateCoords, addPoint])

  // ── Clear all ────────────────────────────────────────────
  const handleClearAll = useCallback(() => {
    onChange(null)
    setDrawMode('idle')
  }, [onChange])

  // ── Draw mode helpers ────────────────────────────────────
  const startDrawing = useCallback(() => {
    if (geoType === 'point' || geoType === 'multipoint') return // no draw mode needed
    if (geoType === 'linestring' || geoType === 'polygon') {
      handleClearAll()
      setDrawMode('draw')
    }
  }, [geoType, handleClearAll])

  const startEditing = useCallback(() => {
    setDrawMode('edit')
  }, [])

  // ── Hint text ────────────────────────────────────────────
  const hintText = useMemo(() => {
    if (readOnly) return null
    if (coords.length === 0) {
      if (geoType === 'point') return t('geo.click_to_place')
      if (geoType === 'multipoint') return t('geo.click_to_place')
      if (drawMode !== 'draw') return t('geo.no_geometry')
      return t('geo.click_to_draw')
    }
    if (drawMode === 'draw') return t('geo.click_to_draw')
    return null
  }, [readOnly, coords.length, geoType, drawMode, t])

  // ── Format coordinate for display ────────────────────────
  const fmtCoord = useCallback(
    (val: number, isLat: boolean) => {
      if (coordFormat === 'dms') return ddToDms(val, isLat)
      return val.toFixed(6)
    },
    [coordFormat],
  )

  // ── Render ───────────────────────────────────────────────

  const mapHeight = typeof height === 'number' ? `${height}px` : height
  const needsDrawMode = geoType === 'linestring' || geoType === 'polygon'

  return (
    <div className={cn('space-y-2', className)}>
      {/* Label */}
      {label && (
        <label className="text-sm font-medium text-foreground">{label}</label>
      )}

      {/* Search bar */}
      {showSearch && !readOnly && (
        <div ref={searchRef} className="relative">
          <div className="flex items-center gap-1.5">
            <div className="relative flex-1">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                className="gl-form-input text-sm w-full pl-8"
                placeholder={t('geo.search_address')}
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
            </button>
          </div>

          {showResults && searchResults.length > 0 && (
            <div className="absolute z-[1000] top-full left-0 right-0 mt-1 bg-card border border-border rounded-lg shadow-lg max-h-48 overflow-y-auto">
              {searchResults.map((r, i) => (
                <button
                  key={i}
                  type="button"
                  className="w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors border-b border-border/50 last:border-0 flex items-start gap-2"
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
              <p className="text-xs text-muted-foreground">{t('common.no_results')}</p>
            </div>
          )}
        </div>
      )}

      {/* Toolbar */}
      {showToolbar && !readOnly && (
        <div className="flex items-center gap-1 flex-wrap">
          {needsDrawMode && (
            <button
              type="button"
              onClick={startDrawing}
              className={cn(
                'gl-button-sm',
                drawMode === 'draw' ? 'gl-button-confirm' : 'gl-button-default',
              )}
            >
              <Pencil size={12} />
              <span className="text-xs">{t('geo.draw')}</span>
            </button>
          )}

          {coords.length > 0 && needsDrawMode && (
            <button
              type="button"
              onClick={startEditing}
              className={cn(
                'gl-button-sm',
                drawMode === 'edit' ? 'gl-button-confirm' : 'gl-button-default',
              )}
            >
              <MousePointer2 size={12} />
              <span className="text-xs">{t('geo.edit')}</span>
            </button>
          )}

          {coords.length > 0 && (
            <button
              type="button"
              onClick={handleClearAll}
              className="gl-button-sm gl-button-danger"
            >
              <Trash2 size={12} />
              <span className="text-xs">{t('geo.clear_all')}</span>
            </button>
          )}

          <div className="flex-1" />

          {/* Import / Export */}
          <button
            type="button"
            onClick={() => setShowImport(true)}
            className="gl-button-sm gl-button-default"
            title={t('geo.import_coords')}
          >
            <Upload size={12} />
            <span className="text-xs">{t('geo.import_coords')}</span>
          </button>

          {coords.length > 0 && (
            <>
              <button
                type="button"
                onClick={handleCopyGeoJSON}
                className="gl-button-sm gl-button-default"
                title={t('geo.copy_geojson')}
              >
                <Copy size={12} />
                <span className="text-xs">GeoJSON</span>
              </button>
              <button
                type="button"
                onClick={handleCopyCoordList}
                className="gl-button-sm gl-button-default"
                title={t('geo.export_coords')}
              >
                <Download size={12} />
                <span className="text-xs">CSV</span>
              </button>
            </>
          )}
        </div>
      )}

      {/* Map container */}
      <div className="border border-border rounded-lg overflow-hidden relative" style={{ height: mapHeight }}>
        <div ref={containerRef} style={{ height: '100%', width: '100%' }} />

        {/* Hint overlay */}
        {hintText && (
          <div className="absolute top-2 left-1/2 -translate-x-1/2 bg-card/90 backdrop-blur-sm border border-border rounded-md px-3 py-1.5 z-[500] text-xs text-muted-foreground pointer-events-none">
            {hintText}
          </div>
        )}

        {/* Geo type badge */}
        <div className="absolute top-2 right-2 z-[500]">
          <span className="gl-badge gl-badge-info text-[10px]">
            {t(`geo.${geoType}`)}
          </span>
        </div>

        {/* Coordinates display */}
        {coords.length > 0 && geoType === 'point' && (
          <div className="absolute bottom-2 left-2 bg-card/90 backdrop-blur-sm border border-border rounded-md px-2 py-1 z-[500] text-xs font-mono text-foreground">
            {fmtCoord(coords[0][0], true)}, {fmtCoord(coords[0][1], false)}
          </div>
        )}

        {/* Draw mode indicator */}
        {drawMode !== 'idle' && (
          <div className="absolute bottom-2 right-2 z-[500]">
            <span className={cn('gl-badge text-[10px]', drawMode === 'draw' ? 'gl-badge-warning' : 'gl-badge-info')}>
              {drawMode === 'draw' ? t('geo.draw') : t('geo.edit')}
            </span>
          </div>
        )}
      </div>

      {/* Measurements */}
      {measurements && (
        <div className="flex items-center gap-2 flex-wrap">
          {measurements.distance !== undefined && (
            <span className="gl-badge gl-badge-info text-xs flex items-center gap-1">
              <Ruler size={10} />
              {t('geo.total_distance')}: {formatDistance(measurements.distance)}
            </span>
          )}
          {measurements.perimeter !== undefined && (
            <span className="gl-badge gl-badge-info text-xs flex items-center gap-1">
              <Ruler size={10} />
              {t('geo.perimeter')}: {formatDistance(measurements.perimeter)}
            </span>
          )}
          {measurements.area !== undefined && (
            <span className="gl-badge gl-badge-success text-xs">
              {t('geo.area')}: {formatArea(measurements.area)}
            </span>
          )}
        </div>
      )}

      {/* Coordinate table */}
      {showCoordinateTable && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-medium text-foreground flex items-center gap-1.5">
              {t('geo.coordinates')} ({coords.length})
            </h4>

            <div className="flex items-center gap-1">
              {/* Coord format toggle */}
              <button
                type="button"
                onClick={() => setCoordFormat(coordFormat === 'dd' ? 'dms' : 'dd')}
                className="gl-button-sm gl-button-default text-[10px]"
                title={coordFormat === 'dd' ? t('geo.dms') : t('geo.decimal_degrees')}
              >
                {coordFormat === 'dd' ? t('geo.decimal_degrees') : t('geo.dms')}
              </button>

              {/* Snap toggle */}
              {!readOnly && (
                <button
                  type="button"
                  onClick={() => setSnapEnabled(!snapEnabled)}
                  className={cn('gl-button-sm', snapEnabled ? 'gl-button-confirm' : 'gl-button-default')}
                  title={t('geo.snap_to_grid')}
                >
                  {snapEnabled ? <ToggleRight size={12} /> : <ToggleLeft size={12} />}
                  <span className="text-[10px]">{t('geo.snap_to_grid')}</span>
                </button>
              )}
            </div>
          </div>

          {coords.length > 0 ? (
            <div className="border border-border rounded-lg overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-muted/50 border-b border-border">
                    <th className="px-2 py-1.5 text-left text-muted-foreground font-medium w-10">#</th>
                    <th className="px-2 py-1.5 text-left text-muted-foreground font-medium">{t('geo.latitude')}</th>
                    <th className="px-2 py-1.5 text-left text-muted-foreground font-medium">{t('geo.longitude')}</th>
                    {!readOnly && (
                      <th className="px-2 py-1.5 text-right text-muted-foreground font-medium w-24">{t('common.actions')}</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {coords.map(([lat, lng], idx) => (
                    <tr key={idx} className="border-b border-border/50 last:border-0 hover:bg-muted/30">
                      <td className="px-2 py-1 text-muted-foreground">{idx + 1}</td>
                      <td className="px-2 py-1 font-mono">
                        {editingCell?.idx === idx && editingCell.field === 'lat' ? (
                          <input
                            type="text"
                            className="gl-form-input text-xs w-full py-0.5"
                            value={editingValue}
                            onChange={(e) => setEditingValue(e.target.value)}
                            onBlur={handleCellSave}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleCellSave()
                              if (e.key === 'Escape') setEditingCell(null)
                            }}
                            autoFocus
                          />
                        ) : (
                          <span
                            className={cn(!readOnly && 'cursor-pointer hover:text-primary')}
                            onClick={() => {
                              if (readOnly) return
                              setEditingCell({ idx, field: 'lat' })
                              setEditingValue(lat.toString())
                            }}
                          >
                            {fmtCoord(lat, true)}
                          </span>
                        )}
                      </td>
                      <td className="px-2 py-1 font-mono">
                        {editingCell?.idx === idx && editingCell.field === 'lng' ? (
                          <input
                            type="text"
                            className="gl-form-input text-xs w-full py-0.5"
                            value={editingValue}
                            onChange={(e) => setEditingValue(e.target.value)}
                            onBlur={handleCellSave}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleCellSave()
                              if (e.key === 'Escape') setEditingCell(null)
                            }}
                            autoFocus
                          />
                        ) : (
                          <span
                            className={cn(!readOnly && 'cursor-pointer hover:text-primary')}
                            onClick={() => {
                              if (readOnly) return
                              setEditingCell({ idx, field: 'lng' })
                              setEditingValue(lng.toString())
                            }}
                          >
                            {fmtCoord(lng, false)}
                          </span>
                        )}
                      </td>
                      {!readOnly && (
                        <td className="px-2 py-1 text-right">
                          <div className="flex items-center justify-end gap-0.5">
                            {idx > 0 && (
                              <button
                                type="button"
                                onClick={() => movePoint(idx, 'up')}
                                className="p-0.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground"
                                title="Move up"
                              >
                                <ArrowUp size={10} />
                              </button>
                            )}
                            {idx < coords.length - 1 && (
                              <button
                                type="button"
                                onClick={() => movePoint(idx, 'down')}
                                className="p-0.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground"
                                title="Move down"
                              >
                                <ArrowDown size={10} />
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => removePoint(idx)}
                              className="p-0.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                              title={t('geo.delete_point')}
                            >
                              <X size={10} />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground italic py-2">{t('geo.no_geometry')}</p>
          )}

          {/* Add point manually */}
          {!readOnly && (
            <div>
              {showManualAdd ? (
                <div className="flex items-end gap-1.5">
                  <div className="flex-1">
                    <label className="text-[10px] text-muted-foreground">{t('geo.latitude')}</label>
                    <input
                      type="text"
                      className="gl-form-input text-xs w-full"
                      placeholder="3.848000"
                      value={manualLat}
                      onChange={(e) => setManualLat(e.target.value)}
                    />
                  </div>
                  <div className="flex-1">
                    <label className="text-[10px] text-muted-foreground">{t('geo.longitude')}</label>
                    <input
                      type="text"
                      className="gl-form-input text-xs w-full"
                      placeholder="9.687000"
                      value={manualLng}
                      onChange={(e) => setManualLng(e.target.value)}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleManualAdd}
                    disabled={!manualLat || !manualLng}
                    className="gl-button-sm gl-button-confirm"
                  >
                    <Plus size={12} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowManualAdd(false)}
                    className="gl-button-sm gl-button-default"
                  >
                    <X size={12} />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowManualAdd(true)}
                  className="gl-button-sm gl-button-default"
                >
                  <Plus size={12} />
                  <span className="text-xs">{t('geo.add_point')}</span>
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Validation hint */}
      {minPoints && coords.length < minPoints && coords.length > 0 && (
        <p className="text-xs text-destructive">
          {t('geo.coordinates')}: {coords.length} / {minPoints} min
        </p>
      )}

      {/* Import modal */}
      {showImport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-lg mx-4">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <h3 className="text-sm font-semibold text-foreground">{t('geo.import_coords')}</h3>
              <button onClick={() => setShowImport(false)} className="p-1 rounded-md hover:bg-accent text-muted-foreground">
                <X size={16} />
              </button>
            </div>
            <div className="p-4 space-y-3">
              <p className="text-xs text-muted-foreground">
                {t('geo.paste_coords')} (GeoJSON {t('common.or')} CSV lat,lng)
              </p>
              <textarea
                className="gl-form-input text-xs w-full font-mono"
                rows={8}
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
                placeholder={`3.848000,9.687000\n3.850000,9.690000\n...\n\n${t('common.or')} GeoJSON`}
              />
            </div>
            <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-border">
              <button onClick={() => setShowImport(false)} className="gl-button-sm gl-button-default">
                {t('common.cancel')}
              </button>
              <button
                onClick={handleImport}
                disabled={!importText.trim()}
                className="gl-button-sm gl-button-confirm"
              >
                {t('geo.import_coords')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default GeoEditor
