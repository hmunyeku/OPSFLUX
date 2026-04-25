/**
 * Shared hook for map configuration — tile provider, API keys, default center/zoom.
 *
 * Reads from entity settings:
 *   - integration.map.provider (openstreetmap | google_maps | mapbox)
 *   - integration.map.style (standard | satellite | terrain | streets-v12 etc.)
 *   - integration.google_maps.api_key
 *   - integration.mapbox.access_token
 *   - integration.geocoding.provider (nominatim | google | mapbox)
 *   - core.map_default_lat
 *   - core.map_default_lng
 *   - core.map_default_zoom
 *
 * Replaces duplicated useMapSettings() in FleetMap, MapPicker, GeoEditor.
 */
import { useQuery } from '@tanstack/react-query'
import api from '@/lib/api'
import type { SettingRead } from '@/types/api'

export interface MapSettings {
  provider: string
  googleKey: string
  mapboxToken: string
  style: string
  geocodingProvider: string
  defaultLat: number
  defaultLng: number
  defaultZoom: number
}

const DEFAULTS: MapSettings = {
  provider: 'openstreetmap',
  googleKey: '',
  mapboxToken: '',
  style: 'standard',
  geocodingProvider: 'nominatim',
  defaultLat: 3.848,
  defaultLng: 9.687,
  defaultZoom: 7,
}

export function useMapSettings() {
  return useQuery({
    queryKey: ['settings', 'entity', 'map'],
    queryFn: async (): Promise<MapSettings> => {
      try {
        const { data } = await api.get<SettingRead[]>('/api/v1/settings', { params: { scope: 'entity' } })
        const raw: Record<string, unknown> = {}
        for (const s of data) {
          if (s.key.startsWith('integration.') || s.key.startsWith('core.map_')) {
            raw[s.key] = s.value?.v ?? s.value ?? ''
          }
        }
        return {
          provider: (raw['integration.map.provider'] as string) || DEFAULTS.provider,
          googleKey: (raw['integration.google_maps.api_key'] as string) || '',
          mapboxToken: (raw['integration.mapbox.access_token'] as string) || '',
          style: (raw['integration.map.style'] as string) || DEFAULTS.style,
          geocodingProvider: (raw['integration.geocoding.provider'] as string) || DEFAULTS.geocodingProvider,
          defaultLat: Number(raw['core.map_default_lat']) || DEFAULTS.defaultLat,
          defaultLng: Number(raw['core.map_default_lng']) || DEFAULTS.defaultLng,
          defaultZoom: Number(raw['core.map_default_zoom']) || DEFAULTS.defaultZoom,
        }
      } catch {
        return DEFAULTS
      }
    },
    staleTime: 30_000, // refetch every 30s so config changes propagate quickly
  })
}

// ── Tile URL helpers (shared across all map components) ──

export function getTileUrl(provider: string, apiKey: string, style: string): string {
  switch (provider) {
    case 'google_maps':
      return `https://mt1.google.com/vt/lyrs=${style === 'satellite' ? 's' : style === 'terrain' ? 'p' : 'm'}&x={x}&y={y}&z={z}`
    case 'mapbox':
      return `https://api.mapbox.com/styles/v1/mapbox/${style || 'streets-v12'}/tiles/{z}/{x}/{y}?access_token=${apiKey}`
    default:
      return 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
  }
}

export function getTileAttribution(provider: string): string {
  switch (provider) {
    case 'google_maps':
      return '&copy; Google Maps'
    case 'mapbox':
      return '&copy; <a href="https://www.mapbox.com/">Mapbox</a>'
    default:
      return '&copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a>'
  }
}
