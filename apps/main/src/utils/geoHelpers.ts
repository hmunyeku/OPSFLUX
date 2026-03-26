/**
 * Geo conversion helpers — bridge between API GeoJSON and GeoEditor GeoValue format.
 */
import type { GeoValue, GeoType } from '@/components/shared/GeoEditor'
import type { GeoJSONGeometry } from '@/types/assetRegistry'

/**
 * Convert GeoJSON geometry from the API into a GeoValue for the GeoEditor.
 * API returns: { type: "Point", coordinates: [lng, lat] }
 * GeoEditor expects: { type: "point", coordinates: [[lng, lat]] }
 */
export function apiGeoToEditorValue(geojson: GeoJSONGeometry | null | undefined): GeoValue | null {
  if (!geojson || !geojson.coordinates) return null

  const geoType = geojson.type.toLowerCase() as GeoType

  if (geoType === 'point') {
    // API: [lng, lat] → Editor: [[lng, lat]]
    const coords = geojson.coordinates as number[]
    return { type: 'point', coordinates: [coords] }
  }

  if (geoType === 'linestring') {
    // API: [[lng, lat], ...] → Editor: same
    return { type: 'linestring', coordinates: geojson.coordinates as number[][] }
  }

  if (geoType === 'polygon') {
    // API: [[[lng, lat], ...]] (ring array) → Editor: [[lng, lat], ...] (just outer ring)
    const rings = geojson.coordinates as number[][][]
    return { type: 'polygon', coordinates: rings[0] ?? [] }
  }

  if (geoType === 'multipoint') {
    return { type: 'multipoint', coordinates: geojson.coordinates as number[][] }
  }

  return null
}

/**
 * Convert GeoEditor GeoValue back to API-compatible GeoJSON geometry.
 * Editor: { type: "point", coordinates: [[lng, lat]] }
 * API expects: { type: "Point", coordinates: [lng, lat] }
 */
export function editorValueToApiGeo(value: GeoValue | null): GeoJSONGeometry | null {
  if (!value || value.coordinates.length === 0) return null

  if (value.type === 'point') {
    return { type: 'Point', coordinates: value.coordinates[0] }
  }

  if (value.type === 'linestring') {
    return { type: 'LineString', coordinates: value.coordinates }
  }

  if (value.type === 'polygon') {
    // Close the ring if needed
    const ring = [...value.coordinates]
    if (ring.length >= 3) {
      const first = ring[0]
      const last = ring[ring.length - 1]
      if (first[0] !== last[0] || first[1] !== last[1]) {
        ring.push([...first])
      }
    }
    return { type: 'Polygon', coordinates: [ring] }
  }

  if (value.type === 'multipoint') {
    return { type: 'MultiPoint', coordinates: value.coordinates }
  }

  return null
}

/**
 * Build a GeoValue point from scalar lat/lon values (fallback when no geom_point stored).
 */
export function latLonToPointValue(lat: number | null | undefined, lon: number | null | undefined): GeoValue | null {
  if (lat == null || lon == null) return null
  return { type: 'point', coordinates: [[lon, lat]] }
}

/**
 * Extract lat/lon from a GeoValue point.
 */
export function pointValueToLatLon(value: GeoValue | null): { lat: number; lon: number } | null {
  if (!value || value.type !== 'point' || value.coordinates.length === 0) return null
  const [lon, lat] = value.coordinates[0]
  return { lat, lon }
}
