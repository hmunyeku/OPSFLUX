/**
 * TravelWiz (transport & logistics) API service.
 */
import api from '@/lib/api'
import type {
  TravelVector, TravelVectorCreate, TravelVectorUpdate,
  VectorDeckPlan, VectorDeckPlanUpdate,
  VectorZone, VectorZoneCreate, VectorZoneUpdate,
  Rotation, RotationCreate, RotationUpdate,
  Voyage, VoyageCreate, VoyageUpdate, VoyageStatusUpdate,
  VoyageStop, VoyageStopCreate, VoyageStopUpdate,
  Manifest, ManifestCreate, ManifestWithTrip,
  ManifestPassenger, ManifestPassengerCreate, ManifestPassengerUpdate,
  CaptainLog, CaptainLogCreate,
  VoyageCapacity,
  VoyageEvent, VoyageEventCreate,
  TripKpi,
  DeckLayout, DeckLayoutValidation,
  VoyageCargoOperationsReport,
  CaptainAuth, CaptainManifest,
  TravelDashboardTripsToday, TravelDashboardCargoPending, TravelFleetKpi,
  FleetPositionResponse, VehicleTrack,
  WeatherData, WeatherReport, CaptainWeatherReport,
  PickupRound, PickupStop,
  PaginatedResponse, PaginationParams,
} from '@/types/api'

const BASE = '/api/v1/travelwiz'

function normalizeVoyage(data: Record<string, unknown>): Voyage {
  const scheduledDeparture = typeof data.scheduled_departure === 'string' ? data.scheduled_departure : null
  const scheduledArrival = typeof data.scheduled_arrival === 'string' ? data.scheduled_arrival : null
  return {
    id: String(data.id),
    entity_id: String(data.entity_id),
    code: String(data.code ?? ''),
    vector_id: typeof data.vector_id === 'string' ? data.vector_id : null,
    rotation_id: typeof data.rotation_id === 'string' ? data.rotation_id : null,
    status: String(data.status ?? 'planned') as Voyage['status'],
    departure_base_id: typeof data.departure_base_id === 'string' ? data.departure_base_id : null,
    scheduled_departure: scheduledDeparture,
    scheduled_arrival: scheduledArrival,
    actual_departure: typeof data.actual_departure === 'string' ? data.actual_departure : null,
    actual_arrival: typeof data.actual_arrival === 'string' ? data.actual_arrival : null,
    delay_reason: typeof data.delay_reason === 'string' ? data.delay_reason : null,
    active: typeof data.active === 'boolean' ? data.active : true,
    created_at: typeof data.created_at === 'string' ? data.created_at : new Date().toISOString(),
    vector_name: typeof data.vector_name === 'string' ? data.vector_name : null,
    vector_type: typeof data.vector_type === 'string' ? data.vector_type : null,
    departure_base_name: typeof data.departure_base_name === 'string' ? data.departure_base_name : null,
    rotation_name: typeof data.rotation_name === 'string' ? data.rotation_name : null,
    stop_count: typeof data.stop_count === 'number' ? data.stop_count : 0,
    pax_count: typeof data.pax_count === 'number' ? data.pax_count : 0,
    cargo_count: typeof data.cargo_count === 'number' ? data.cargo_count : 0,
    departure_at: scheduledDeparture,
    arrival_at: scheduledArrival,
    origin: typeof data.departure_base_name === 'string' ? data.departure_base_name : null,
    destination: typeof data.destination_name === 'string' ? data.destination_name : null,
    description: typeof data.description === 'string' ? data.description : null,
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

interface ManifestListParams extends PaginationParams {
  status?: string
  search?: string
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

  // ── Vector Deck Plan (Draw.io authoring) ──
  getVectorDeckPlan: async (vectorId: string): Promise<VectorDeckPlan> => {
    const { data } = await api.get(`${BASE}/vectors/${vectorId}/deck-plan`)
    return data
  },

  saveVectorDeckPlan: async (
    vectorId: string,
    payload: VectorDeckPlanUpdate,
  ): Promise<VectorDeckPlan> => {
    const { data } = await api.put(`${BASE}/vectors/${vectorId}/deck-plan`, payload)
    return data
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
    return {
      ...data,
      items: Array.isArray(data.items) ? data.items.map((item: Record<string, unknown>) => normalizeVoyage(item)) : [],
    }
  },

  getVoyage: async (id: string): Promise<Voyage> => {
    const { data } = await api.get(`${BASE}/voyages/${id}`)
    return normalizeVoyage(data)
  },

  createVoyage: async (payload: VoyageCreate): Promise<Voyage> => {
    const { data } = await api.post(`${BASE}/voyages`, payload)
    return normalizeVoyage(data)
  },

  updateVoyage: async (id: string, payload: VoyageUpdate): Promise<Voyage> => {
    const normalizedPayload = {
      vector_id: payload.vector_id,
      departure_base_id: payload.departure_base_id,
      rotation_id: payload.rotation_id,
      scheduled_departure: payload.scheduled_departure ?? payload.departure_at,
      scheduled_arrival: payload.scheduled_arrival ?? payload.arrival_at,
    }
    const { data } = await api.patch(`${BASE}/voyages/${id}`, normalizedPayload)
    return normalizeVoyage(data)
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

  getVoyagePaxManifestPdf: async (id: string): Promise<Blob> => {
    const { data } = await api.get(`${BASE}/voyages/${id}/pdf/pax-manifest`, { responseType: 'blob' })
    return data
  },

  getVoyageCargoManifestPdf: async (id: string): Promise<Blob> => {
    const { data } = await api.get(`${BASE}/voyages/${id}/pdf/cargo-manifest`, { responseType: 'blob' })
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
  //
  // Backend route is /voyage-events (not /events) — /events gets caught
  // by /{event_type_id} dynamic matches elsewhere and returns 404.
  getVoyageEvents: async (tripId: string): Promise<VoyageEvent[]> => {
    const { data } = await api.get(`${BASE}/voyages/${tripId}/voyage-events`)
    return data
  },

  recordVoyageEvent: async (tripId: string, payload: VoyageEventCreate): Promise<VoyageEvent> => {
    const { data } = await api.post(`${BASE}/voyages/${tripId}/voyage-events`, payload)
    return data
  },

  // ── Trip KPIs ──
  getTripKpis: async (tripId: string): Promise<TripKpi> => {
    const { data } = await api.get(`${BASE}/voyages/${tripId}/kpis`)
    return data
  },

  getVoyageCargoOperationsReport: async (tripId: string): Promise<VoyageCargoOperationsReport> => {
    const { data } = await api.get(`${BASE}/voyages/${tripId}/cargo-operations-report`)
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
    const { data } = await api.get(`${BASE}/weather/sites`, { params: siteId ? { site_id: siteId } : {} })
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
