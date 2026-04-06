/**
 * TravelWiz (transport & logistics) API service.
 */
import api from '@/lib/api'
import type {
  TravelVector, TravelVectorCreate, TravelVectorUpdate,
  VectorZone, VectorZoneCreate, VectorZoneUpdate,
  Rotation, RotationCreate, RotationUpdate,
  Voyage, VoyageCreate, VoyageUpdate, VoyageStatusUpdate,
  VoyageStop, VoyageStopCreate, VoyageStopUpdate,
  Manifest, ManifestCreate, ManifestWithTrip,
  ManifestPassenger, ManifestPassengerCreate, ManifestPassengerUpdate,
  CargoItem, CargoItemCreate, CargoItemUpdate, CargoStatusUpdate, CargoReceive, CargoReturnCreate,
  CaptainLog, CaptainLogCreate,
  VoyageCapacity,
  VoyageEvent, VoyageEventCreate,
  TripKpi,
  DeckLayout, DeckLayoutValidation,
  PackageElement, PackageElementCreate,
  TravelArticle, TravelArticleCreate, TravelArticleImportResult, SapMatchResult,
  CaptainAuth, CaptainManifest,
  TravelDashboardTripsToday, TravelDashboardCargoPending, TravelFleetKpi,
  FleetPositionResponse, VehicleTrack,
  WeatherData, WeatherReport, CaptainWeatherReport,
  PickupRound, PickupStop,
  PaginatedResponse, PaginationParams,
} from '@/types/api'

const BASE = '/api/v1/travelwiz'

function normalizeTravelArticle(data: Record<string, unknown>): TravelArticle {
  return {
    id: String(data.id),
    entity_id: typeof data.entity_id === 'string' ? data.entity_id : undefined,
    sap_code: String(data.sap_code ?? ''),
    description: String(data.description ?? data.description_fr ?? ''),
    management_type: typeof data.management_type === 'string' ? data.management_type : null,
    packaging: typeof data.packaging === 'string'
      ? data.packaging
      : typeof data.packaging_type === 'string'
        ? data.packaging_type
        : null,
    is_hazmat: Boolean(data.is_hazmat),
    hazmat_class: typeof data.hazmat_class === 'string' ? data.hazmat_class : null,
    unit: typeof data.unit === 'string'
      ? data.unit
      : typeof data.unit_of_measure === 'string'
        ? data.unit_of_measure
        : null,
    active: typeof data.active === 'boolean' ? data.active : true,
    created_at: typeof data.created_at === 'string' ? data.created_at : new Date().toISOString(),
  }
}

interface VectorListParams extends PaginationParams {
  type?: string
  search?: string
}

interface VoyageListParams extends PaginationParams {
  status?: string
  date_from?: string
  date_to?: string
  vector_id?: string
  rotation_id?: string
  search?: string
}

interface RotationListParams extends PaginationParams {
  vector_id?: string
  search?: string
}

interface CargoListParams extends PaginationParams {
  status?: string
  voyage_id?: string
  cargo_type?: string
  is_hazmat?: boolean
  search?: string
}

interface ManifestListParams extends PaginationParams {
  status?: string
  search?: string
}

interface ArticleListParams extends PaginationParams {
  search?: string
  sap_code?: string
  management_type?: string
  is_hazmat?: boolean
}

export const travelwizService = {
  // ── Vectors ──
  listVectors: async (params: VectorListParams = {}): Promise<PaginatedResponse<TravelVector>> => {
    const { data } = await api.get(`${BASE}/vectors`, { params })
    return data
  },

  getVector: async (id: string): Promise<TravelVector> => {
    const { data } = await api.get(`${BASE}/vectors/${id}`)
    return data
  },

  createVector: async (payload: TravelVectorCreate): Promise<TravelVector> => {
    const { data } = await api.post(`${BASE}/vectors`, payload)
    return data
  },

  updateVector: async (id: string, payload: TravelVectorUpdate): Promise<TravelVector> => {
    const { data } = await api.patch(`${BASE}/vectors/${id}`, payload)
    return data
  },

  deleteVector: async (id: string): Promise<void> => {
    await api.delete(`${BASE}/vectors/${id}`)
  },

  // ── Vector Zones ──
  listVectorZones: async (vectorId: string): Promise<VectorZone[]> => {
    const { data } = await api.get(`${BASE}/vectors/${vectorId}/zones`)
    return data
  },

  createVectorZone: async (vectorId: string, payload: VectorZoneCreate): Promise<VectorZone> => {
    const { data } = await api.post(`${BASE}/vectors/${vectorId}/zones`, payload)
    return data
  },

  updateVectorZone: async (vectorId: string, zoneId: string, payload: VectorZoneUpdate): Promise<VectorZone> => {
    const { data } = await api.patch(`${BASE}/vectors/${vectorId}/zones/${zoneId}`, payload)
    return data
  },

  deleteVectorZone: async (vectorId: string, zoneId: string): Promise<void> => {
    await api.delete(`${BASE}/vectors/${vectorId}/zones/${zoneId}`)
  },

  // ── Rotations ──
  listRotations: async (params: RotationListParams = {}): Promise<PaginatedResponse<Rotation>> => {
    const { data } = await api.get(`${BASE}/rotations`, { params })
    return data
  },

  createRotation: async (payload: RotationCreate): Promise<Rotation> => {
    const { data } = await api.post(`${BASE}/rotations`, payload)
    return data
  },

  updateRotation: async (id: string, payload: RotationUpdate): Promise<Rotation> => {
    const { data } = await api.patch(`${BASE}/rotations/${id}`, payload)
    return data
  },

  // ── Voyages ──
  listVoyages: async (params: VoyageListParams = {}): Promise<PaginatedResponse<Voyage>> => {
    const { data } = await api.get(`${BASE}/voyages`, { params })
    return data
  },

  getVoyage: async (id: string): Promise<Voyage> => {
    const { data } = await api.get(`${BASE}/voyages/${id}`)
    return data
  },

  createVoyage: async (payload: VoyageCreate): Promise<Voyage> => {
    const { data } = await api.post(`${BASE}/voyages`, payload)
    return data
  },

  updateVoyage: async (id: string, payload: VoyageUpdate): Promise<Voyage> => {
    const { data } = await api.patch(`${BASE}/voyages/${id}`, payload)
    return data
  },

  updateVoyageStatus: async (id: string, payload: VoyageStatusUpdate): Promise<Voyage> => {
    const { data } = await api.patch(`${BASE}/voyages/${id}/status`, payload)
    return data
  },

  deleteVoyage: async (id: string): Promise<void> => {
    await api.delete(`${BASE}/voyages/${id}`)
  },

  closeTrip: async (id: string): Promise<Voyage> => {
    const { data } = await api.post(`${BASE}/voyages/${id}/close`)
    return data
  },

  // ── Voyage Stops ──
  listVoyageStops: async (voyageId: string): Promise<VoyageStop[]> => {
    const { data } = await api.get(`${BASE}/voyages/${voyageId}/stops`)
    return data
  },

  createVoyageStop: async (voyageId: string, payload: VoyageStopCreate): Promise<VoyageStop> => {
    const { data } = await api.post(`${BASE}/voyages/${voyageId}/stops`, payload)
    return data
  },

  updateVoyageStop: async (voyageId: string, stopId: string, payload: VoyageStopUpdate): Promise<VoyageStop> => {
    const { data } = await api.patch(`${BASE}/voyages/${voyageId}/stops/${stopId}`, payload)
    return data
  },

  deleteVoyageStop: async (voyageId: string, stopId: string): Promise<void> => {
    await api.delete(`${BASE}/voyages/${voyageId}/stops/${stopId}`)
  },

  // ── Voyage Events (journal de bord) ──
  getVoyageEvents: async (tripId: string): Promise<VoyageEvent[]> => {
    const { data } = await api.get(`${BASE}/voyages/${tripId}/events`)
    return data
  },

  recordVoyageEvent: async (tripId: string, payload: VoyageEventCreate): Promise<VoyageEvent> => {
    const { data } = await api.post(`${BASE}/voyages/${tripId}/events`, payload)
    return data
  },

  // ── Trip KPIs ──
  getTripKpis: async (tripId: string): Promise<TripKpi> => {
    const { data } = await api.get(`${BASE}/voyages/${tripId}/kpis`)
    return data
  },

  // ── Deck Layouts ──
  getDeckLayouts: async (tripId: string): Promise<DeckLayout[]> => {
    const { data } = await api.get(`${BASE}/voyages/${tripId}/deck-layouts`)
    return data
  },

  suggestDeckLayout: async (tripId: string, deckSurfaceId: string): Promise<DeckLayout> => {
    const { data } = await api.post(`${BASE}/voyages/${tripId}/deck-layouts/${deckSurfaceId}/suggest`)
    return data
  },

  validateDeckLayout: async (tripId: string, deckSurfaceId: string): Promise<DeckLayoutValidation> => {
    const { data } = await api.post(`${BASE}/voyages/${tripId}/deck-layouts/${deckSurfaceId}/validate`)
    return data
  },

  // ── Manifests ──
  listManifests: async (voyageId: string): Promise<Manifest[]> => {
    const { data } = await api.get(`${BASE}/voyages/${voyageId}/manifests`)
    return data
  },

  listAllManifests: async (params: ManifestListParams = {}): Promise<PaginatedResponse<ManifestWithTrip>> => {
    const { data } = await api.get(`${BASE}/manifests`, { params })
    return data
  },

  createManifest: async (voyageId: string, payload: ManifestCreate): Promise<Manifest> => {
    const { data } = await api.post(`${BASE}/voyages/${voyageId}/manifests`, payload)
    return data
  },

  validateManifest: async (voyageId: string, manifestId: string): Promise<Manifest> => {
    const { data } = await api.post(`${BASE}/voyages/${voyageId}/manifests/${manifestId}/validate`)
    return data
  },

  // ── Manifest Passengers ──
  listPassengers: async (voyageId: string, manifestId: string): Promise<ManifestPassenger[]> => {
    const { data } = await api.get(`${BASE}/voyages/${voyageId}/manifests/${manifestId}/passengers`)
    return data
  },

  addPassenger: async (voyageId: string, manifestId: string, payload: ManifestPassengerCreate): Promise<ManifestPassenger> => {
    const { data } = await api.post(`${BASE}/voyages/${voyageId}/manifests/${manifestId}/passengers`, payload)
    return data
  },

  updatePassenger: async (voyageId: string, manifestId: string, passengerId: string, payload: ManifestPassengerUpdate): Promise<ManifestPassenger> => {
    const { data } = await api.patch(`${BASE}/voyages/${voyageId}/manifests/${manifestId}/passengers/${passengerId}`, payload)
    return data
  },

  removePassenger: async (voyageId: string, manifestId: string, passengerId: string): Promise<void> => {
    await api.delete(`${BASE}/voyages/${voyageId}/manifests/${manifestId}/passengers/${passengerId}`)
  },

  // ── Cargo ──
  listCargo: async (params: CargoListParams = {}): Promise<PaginatedResponse<CargoItem>> => {
    const { data } = await api.get(`${BASE}/cargo`, { params })
    return data
  },

  getCargo: async (id: string): Promise<CargoItem> => {
    const { data } = await api.get(`${BASE}/cargo/${id}`)
    return data
  },

  createCargo: async (payload: CargoItemCreate): Promise<CargoItem> => {
    const { data } = await api.post(`${BASE}/cargo`, payload)
    return data
  },

  updateCargo: async (id: string, payload: CargoItemUpdate): Promise<CargoItem> => {
    const { data } = await api.patch(`${BASE}/cargo/${id}`, payload)
    return data
  },

  updateCargoStatus: async (id: string, payload: CargoStatusUpdate): Promise<CargoItem> => {
    const { data } = await api.patch(`${BASE}/cargo/${id}/status`, payload)
    return data
  },

  receiveCargo: async (id: string, payload: CargoReceive = {}): Promise<CargoItem> => {
    const { data } = await api.post(`${BASE}/cargo/${id}/receive`, payload)
    return data
  },

  initiateCargoReturn: async (cargoItemId: string, payload: CargoReturnCreate): Promise<CargoItem> => {
    const { data } = await api.post(`${BASE}/cargo/${cargoItemId}/return`, payload)
    return data
  },

  // ── Package Elements ──
  getPackageElements: async (cargoItemId: string): Promise<PackageElement[]> => {
    const { data } = await api.get(`${BASE}/cargo/${cargoItemId}/elements`)
    return data
  },

  addPackageElement: async (cargoItemId: string, payload: PackageElementCreate): Promise<PackageElement> => {
    const { data } = await api.post(`${BASE}/cargo/${cargoItemId}/elements`, payload)
    return data
  },

  // ── SAP Matching ──
  sapMatch: async (description: string): Promise<SapMatchResult> => {
    const { data } = await api.post(`${BASE}/articles/sap-match`, { description })
    return data
  },

  // ── Captain Portal ──
  authenticateCaptain: async (accessCode: string): Promise<CaptainAuth> => {
    const { data } = await api.post(`${BASE}/captain/auth`, { access_code: accessCode })
    return data
  },

  getCaptainManifest: async (tripId: string): Promise<CaptainManifest> => {
    const { data } = await api.get(`${BASE}/captain/voyages/${tripId}/manifest`)
    return data
  },

  captainRecordEvent: async (tripId: string, payload: VoyageEventCreate): Promise<VoyageEvent> => {
    const { data } = await api.post(`${BASE}/captain/voyages/${tripId}/events`, payload)
    return data
  },

  // ── Captain Logs ──
  listCaptainLogs: async (voyageId: string): Promise<CaptainLog[]> => {
    const { data } = await api.get(`${BASE}/voyages/${voyageId}/logs`)
    return data
  },

  createCaptainLog: async (voyageId: string, payload: CaptainLogCreate): Promise<CaptainLog> => {
    const { data } = await api.post(`${BASE}/voyages/${voyageId}/logs`, payload)
    return data
  },

  // ── Articles ──
  listArticles: async (params: ArticleListParams = {}): Promise<PaginatedResponse<TravelArticle>> => {
    const { data } = await api.get(`${BASE}/articles`, { params })
    if (Array.isArray(data)) {
      const items = data.map((item) => normalizeTravelArticle(item))
      return {
        items,
        total: items.length,
        page: 1,
        page_size: items.length || 1,
        pages: 1,
      }
    }
    return {
      ...data,
      items: Array.isArray(data.items)
        ? data.items.map((item: Record<string, unknown>) => normalizeTravelArticle(item))
        : [],
    }
  },

  createArticle: async (payload: TravelArticleCreate): Promise<TravelArticle> => {
    const { data } = await api.post(`${BASE}/articles`, payload)
    return normalizeTravelArticle(data)
  },

  importArticlesCsv: async (file: File): Promise<TravelArticleImportResult> => {
    const formData = new FormData()
    formData.append('file', file)
    const { data } = await api.post(`${BASE}/articles/import-csv`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return data
  },

  // ── Capacity ──
  checkCapacity: async (voyageId: string): Promise<VoyageCapacity> => {
    const { data } = await api.get(`${BASE}/voyages/${voyageId}/capacity`)
    return data
  },

  // ── Dashboard ──
  getTripsToday: async (): Promise<TravelDashboardTripsToday> => {
    const { data } = await api.get(`${BASE}/dashboard/trips-today`)
    return data
  },

  getCargoPending: async (): Promise<TravelDashboardCargoPending> => {
    const { data } = await api.get(`${BASE}/dashboard/cargo-pending`)
    return data
  },

  getFleetKpis: async (): Promise<TravelFleetKpi> => {
    const { data } = await api.get(`${BASE}/dashboard/fleet-kpis`)
    return data
  },

  // ── Fleet Tracking ──
  getFleetPositions: async (): Promise<FleetPositionResponse> => {
    const { data } = await api.get(`${BASE}/tracking/fleet`)
    return data
  },

  getVehicleTrack: async (vectorId: string, params?: { from?: string; to?: string }): Promise<VehicleTrack> => {
    const { data } = await api.get(`${BASE}/fleet/vectors/${vectorId}/track`, { params })
    return data
  },

  recordPosition: async (vectorId: string, payload: { latitude: number; longitude: number; speed_knots?: number; heading?: number }): Promise<void> => {
    await api.post(`${BASE}/fleet/vectors/${vectorId}/position`, payload)
  },

  // ── Weather ──
  getLatestWeather: async (siteId?: string): Promise<WeatherData[]> => {
    const { data } = await api.get(`${BASE}/weather/latest`, { params: siteId ? { site_id: siteId } : {} })
    return data
  },

  getWeatherHistory: async (siteId: string, params?: { from?: string; to?: string }): Promise<WeatherData[]> => {
    const { data } = await api.get(`${BASE}/weather/sites/${siteId}/history`, { params })
    return data
  },

  reportWeather: async (tripId: string, payload: WeatherReport): Promise<WeatherData> => {
    const { data } = await api.post(`${BASE}/captain/voyages/${tripId}/weather`, payload)
    return data
  },

  captainReportWeather: async (tripId: string, payload: CaptainWeatherReport): Promise<void> => {
    await api.post(`${BASE}/captain/voyages/${tripId}/weather`, payload)
  },

  // ── Pickup Rounds (Ramassage) ──
  listPickupRounds: async (params: PaginationParams & { status?: string; date?: string } = {}): Promise<PaginatedResponse<PickupRound>> => {
    const { data } = await api.get(`${BASE}/pickup-rounds`, { params })
    return data
  },

  getPickupRound: async (id: string): Promise<PickupRound & { stops: PickupStop[] }> => {
    const { data } = await api.get(`${BASE}/pickup-rounds/${id}`)
    return data
  },

  recordPickupStop: async (roundId: string, stopId: string, payload: { status: string; actual_time?: string }): Promise<PickupStop> => {
    const { data } = await api.patch(`${BASE}/pickup-rounds/${roundId}/stops/${stopId}`, payload)
    return data
  },

  closePickupRound: async (id: string): Promise<PickupRound> => {
    const { data } = await api.post(`${BASE}/pickup-rounds/${id}/close`)
    return data
  },
}
