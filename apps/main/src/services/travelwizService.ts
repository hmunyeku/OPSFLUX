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
  CargoAttachmentEvidence, CargoItem, CargoItemCreate, CargoItemUpdate, CargoRequest, CargoRequestCreate, CargoRequestUpdate, CargoLoadingOption, CargoStatusUpdate, CargoWorkflowStatusUpdate, CargoReceive, CargoReturnCreate,
  CaptainLog, CaptainLogCreate,
  VoyageCapacity,
  VoyageEvent, VoyageEventCreate,
  TripKpi,
  DeckLayout, DeckLayoutValidation,
  PackageElement, PackageElementCreate, PackageElementDispositionUpdate, PackageElementReturnUpdate, CargoHistoryEntry,
  VoyageCargoOperationsReport,
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

function normalizeCargo(data: Record<string, unknown>): CargoItem {
  const widthCm = typeof data.width_cm === 'number' ? data.width_cm : null
  const lengthCm = typeof data.length_cm === 'number' ? data.length_cm : null
  const heightCm = typeof data.height_cm === 'number' ? data.height_cm : null
  const volumeM3 = widthCm && lengthCm && heightCm
    ? Number((((widthCm / 100) * (lengthCm / 100) * (heightCm / 100))).toFixed(4))
    : null
  const trackingCode = String(data.tracking_code ?? '')
  return {
    id: String(data.id),
    entity_id: String(data.entity_id),
    request_id: typeof data.request_id === 'string' ? data.request_id : null,
    manifest_id: typeof data.manifest_id === 'string' ? data.manifest_id : null,
    planned_zone_id: typeof data.planned_zone_id === 'string' ? data.planned_zone_id : null,
    tracking_code: trackingCode,
    code: trackingCode,
    description: String(data.description ?? ''),
    designation: typeof data.designation === 'string' ? data.designation : null,
    workflow_status: String(data.workflow_status ?? 'draft') as CargoItem['workflow_status'],
    weight_kg: typeof data.weight_kg === 'number' ? data.weight_kg : 0,
    width_cm: widthCm,
    length_cm: lengthCm,
    height_cm: heightCm,
    surface_m2: typeof data.surface_m2 === 'number' ? data.surface_m2 : null,
    package_count: typeof data.package_count === 'number' ? data.package_count : 1,
    stackable: Boolean(data.stackable),
    volume_m3: volumeM3,
    cargo_type: String(data.cargo_type ?? ''),
    status: String(data.status ?? 'registered') as CargoItem['status'],
    sender_tier_id: typeof data.sender_tier_id === 'string' ? data.sender_tier_id : null,
    receiver_name: typeof data.receiver_name === 'string' ? data.receiver_name : null,
    destination_asset_id: typeof data.destination_asset_id === 'string' ? data.destination_asset_id : null,
    project_id: typeof data.project_id === 'string' ? data.project_id : null,
    imputation_reference_id: typeof data.imputation_reference_id === 'string' ? data.imputation_reference_id : null,
    ownership_type: typeof data.ownership_type === 'string' ? data.ownership_type : null,
    pickup_location_label: typeof data.pickup_location_label === 'string' ? data.pickup_location_label : null,
    pickup_latitude: typeof data.pickup_latitude === 'number' ? data.pickup_latitude : null,
    pickup_longitude: typeof data.pickup_longitude === 'number' ? data.pickup_longitude : null,
    requester_name: typeof data.requester_name === 'string' ? data.requester_name : null,
    document_prepared_at: typeof data.document_prepared_at === 'string' ? data.document_prepared_at : null,
    available_from: typeof data.available_from === 'string' ? data.available_from : null,
    pickup_contact_user_id: typeof data.pickup_contact_user_id === 'string' ? data.pickup_contact_user_id : null,
    pickup_contact_tier_contact_id: typeof data.pickup_contact_tier_contact_id === 'string' ? data.pickup_contact_tier_contact_id : null,
    pickup_contact_name: typeof data.pickup_contact_name === 'string' ? data.pickup_contact_name : null,
    pickup_contact_phone: typeof data.pickup_contact_phone === 'string' ? data.pickup_contact_phone : null,
    pickup_contact_display_name: typeof data.pickup_contact_display_name === 'string' ? data.pickup_contact_display_name : null,
    lifting_provider: typeof data.lifting_provider === 'string' ? data.lifting_provider : null,
    lifting_points_certified: Boolean(data.lifting_points_certified),
    weight_ticket_provided: Boolean(data.weight_ticket_provided),
    photo_evidence_count: typeof data.photo_evidence_count === 'number' ? data.photo_evidence_count : 0,
    document_attachment_count: typeof data.document_attachment_count === 'number' ? data.document_attachment_count : 0,
    sap_article_code: typeof data.sap_article_code === 'string' ? data.sap_article_code : null,
    hazmat_validated: Boolean(data.hazmat_validated),
    received_by: typeof data.received_by === 'string' ? data.received_by : null,
    received_at: typeof data.received_at === 'string' ? data.received_at : null,
    damage_notes: typeof data.damage_notes === 'string' ? data.damage_notes : null,
    notes: typeof data.notes === 'string'
      ? data.notes
      : typeof data.damage_notes === 'string'
        ? data.damage_notes
        : null,
    registered_by: typeof data.registered_by === 'string' ? data.registered_by : '',
    active: typeof data.active === 'boolean' ? data.active : true,
    created_at: typeof data.created_at === 'string' ? data.created_at : new Date().toISOString(),
    sender_name: typeof data.sender_name === 'string' ? data.sender_name : null,
    destination_name: typeof data.destination_name === 'string' ? data.destination_name : null,
    imputation_reference_code: typeof data.imputation_reference_code === 'string' ? data.imputation_reference_code : null,
    imputation_reference_name: typeof data.imputation_reference_name === 'string' ? data.imputation_reference_name : null,
    request_code: typeof data.request_code === 'string' ? data.request_code : null,
    request_title: typeof data.request_title === 'string' ? data.request_title : null,
    planned_zone_name: typeof data.planned_zone_name === 'string' ? data.planned_zone_name : null,
    voyage_code: typeof data.voyage_code === 'string' ? data.voyage_code : null,
    hazmat_class: typeof data.hazmat_class === 'string' ? data.hazmat_class : null,
    is_urgent: typeof data.is_urgent === 'boolean' ? data.is_urgent : undefined,
  }
}

function normalizeCargoRequest(data: Record<string, unknown>): CargoRequest {
  return {
    id: String(data.id),
    entity_id: String(data.entity_id),
    request_code: String(data.request_code ?? ''),
    title: String(data.title ?? ''),
    description: typeof data.description === 'string' ? data.description : null,
    status: String(data.status ?? 'draft') as CargoRequest['status'],
    project_id: typeof data.project_id === 'string' ? data.project_id : null,
    imputation_reference_id: typeof data.imputation_reference_id === 'string' ? data.imputation_reference_id : null,
    sender_tier_id: typeof data.sender_tier_id === 'string' ? data.sender_tier_id : null,
    sender_contact_tier_contact_id: typeof data.sender_contact_tier_contact_id === 'string' ? data.sender_contact_tier_contact_id : null,
    receiver_name: typeof data.receiver_name === 'string' ? data.receiver_name : null,
    destination_asset_id: typeof data.destination_asset_id === 'string' ? data.destination_asset_id : null,
    requester_user_id: typeof data.requester_user_id === 'string' ? data.requester_user_id : null,
    requester_name: typeof data.requester_name === 'string' ? data.requester_name : null,
    requester_display_name: typeof data.requester_display_name === 'string' ? data.requester_display_name : null,
    sender_contact_name: typeof data.sender_contact_name === 'string' ? data.sender_contact_name : null,
    requested_by: typeof data.requested_by === 'string' ? data.requested_by : '',
    active: typeof data.active === 'boolean' ? data.active : true,
    created_at: typeof data.created_at === 'string' ? data.created_at : new Date().toISOString(),
    cargo_count: typeof data.cargo_count === 'number' ? data.cargo_count : 0,
    sender_name: typeof data.sender_name === 'string' ? data.sender_name : null,
    destination_name: typeof data.destination_name === 'string' ? data.destination_name : null,
    imputation_reference_code: typeof data.imputation_reference_code === 'string' ? data.imputation_reference_code : null,
    imputation_reference_name: typeof data.imputation_reference_name === 'string' ? data.imputation_reference_name : null,
    is_ready_for_submission: typeof data.is_ready_for_submission === 'boolean' ? data.is_ready_for_submission : false,
    missing_requirements: Array.isArray(data.missing_requirements)
      ? data.missing_requirements.filter((item): item is string => typeof item === 'string')
      : [],
  }
}

function normalizeCargoLoadingOption(data: Record<string, unknown>): CargoLoadingOption {
  return {
    voyage_id: String(data.voyage_id ?? ''),
    voyage_code: String(data.voyage_code ?? ''),
    voyage_status: String(data.voyage_status ?? ''),
    scheduled_departure: typeof data.scheduled_departure === 'string' ? data.scheduled_departure : new Date().toISOString(),
    vector_id: String(data.vector_id ?? ''),
    vector_name: typeof data.vector_name === 'string' ? data.vector_name : null,
    departure_base_name: typeof data.departure_base_name === 'string' ? data.departure_base_name : null,
    manifest_id: typeof data.manifest_id === 'string' ? data.manifest_id : null,
    manifest_status: typeof data.manifest_status === 'string' ? data.manifest_status : null,
    destination_match: typeof data.destination_match === 'boolean' ? data.destination_match : false,
    remaining_weight_kg: typeof data.remaining_weight_kg === 'number' ? data.remaining_weight_kg : null,
    total_request_weight_kg: typeof data.total_request_weight_kg === 'number' ? data.total_request_weight_kg : 0,
    total_request_surface_m2: typeof data.total_request_surface_m2 === 'number' ? data.total_request_surface_m2 : 0,
    all_items_stackable: typeof data.all_items_stackable === 'boolean' ? data.all_items_stackable : false,
    compatible_zones: Array.isArray(data.compatible_zones)
      ? data.compatible_zones.map((item) => {
          const zone = item as Record<string, unknown>
          return {
            zone_id: String(zone.zone_id ?? ''),
            zone_name: typeof zone.zone_name === 'string' ? zone.zone_name : '',
            zone_type: typeof zone.zone_type === 'string' ? zone.zone_type : '',
            surface_m2: typeof zone.surface_m2 === 'number' ? zone.surface_m2 : null,
            max_weight_kg: typeof zone.max_weight_kg === 'number' ? zone.max_weight_kg : null,
          }
        })
      : [],
    requires_manifest_creation: typeof data.requires_manifest_creation === 'boolean' ? data.requires_manifest_creation : false,
    can_load: typeof data.can_load === 'boolean' ? data.can_load : false,
    blocking_reasons: Array.isArray(data.blocking_reasons)
      ? data.blocking_reasons.filter((item): item is string => typeof item === 'string')
      : [],
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
  request_id?: string
  search?: string
}

interface CargoRequestListParams extends PaginationParams {
  status?: string
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

  // ── Cargo ──
  listCargoRequests: async (params: CargoRequestListParams = {}): Promise<PaginatedResponse<CargoRequest>> => {
    const { data } = await api.get(`${BASE}/cargo-requests`, { params })
    return {
      ...data,
      items: Array.isArray(data.items) ? data.items.map((item: Record<string, unknown>) => normalizeCargoRequest(item)) : [],
    }
  },

  getCargoRequest: async (id: string): Promise<CargoRequest> => {
    const { data } = await api.get(`${BASE}/cargo-requests/${id}`)
    return normalizeCargoRequest(data)
  },

  getCargoRequestLtPdf: async (id: string): Promise<Blob> => {
    const { data } = await api.get(`${BASE}/cargo-requests/${id}/pdf/lt`, { responseType: 'blob' })
    return data
  },

  createCargoRequest: async (payload: CargoRequestCreate): Promise<CargoRequest> => {
    const { data } = await api.post(`${BASE}/cargo-requests`, payload)
    return normalizeCargoRequest(data)
  },

  updateCargoRequest: async (id: string, payload: CargoRequestUpdate): Promise<CargoRequest> => {
    const { data } = await api.patch(`${BASE}/cargo-requests/${id}`, payload)
    return normalizeCargoRequest(data)
  },

  getCargoRequestLoadingOptions: async (id: string): Promise<CargoLoadingOption[]> => {
    const { data } = await api.get(`${BASE}/cargo-requests/${id}/loading-options`)
    return Array.isArray(data) ? data.map((item: Record<string, unknown>) => normalizeCargoLoadingOption(item)) : []
  },

  applyCargoRequestLoadingOption: async (id: string, voyageId: string): Promise<CargoRequest> => {
    const { data } = await api.post(`${BASE}/cargo-requests/${id}/loading-options/${voyageId}/apply`)
    return normalizeCargoRequest(data)
  },

  listCargo: async (params: CargoListParams = {}): Promise<PaginatedResponse<CargoItem>> => {
    const { data } = await api.get(`${BASE}/cargo`, { params })
    return {
      ...data,
      items: Array.isArray(data.items) ? data.items.map((item: Record<string, unknown>) => normalizeCargo(item)) : [],
    }
  },

  getCargo: async (id: string): Promise<CargoItem> => {
    const { data } = await api.get(`${BASE}/cargo/${id}`)
    return normalizeCargo(data)
  },

  createCargo: async (payload: CargoItemCreate): Promise<CargoItem> => {
    const { data } = await api.post(`${BASE}/cargo`, payload)
    return normalizeCargo(data)
  },

  updateCargo: async (id: string, payload: CargoItemUpdate): Promise<CargoItem> => {
    const normalizedPayload = {
      request_id: payload.request_id,
      description: payload.description,
      designation: payload.designation,
      weight_kg: payload.weight_kg,
      width_cm: payload.width_cm,
      length_cm: payload.length_cm,
      height_cm: payload.height_cm,
      surface_m2: payload.surface_m2,
      package_count: payload.package_count,
      stackable: payload.stackable,
      cargo_type: payload.cargo_type,
      sender_tier_id: payload.sender_tier_id,
      receiver_name: payload.receiver_name,
      destination_asset_id: payload.destination_asset_id,
      project_id: payload.project_id,
      imputation_reference_id: payload.imputation_reference_id,
      ownership_type: payload.ownership_type,
      pickup_location_label: payload.pickup_location_label,
      pickup_latitude: payload.pickup_latitude,
      pickup_longitude: payload.pickup_longitude,
      requester_name: payload.requester_name,
      document_prepared_at: payload.document_prepared_at,
      available_from: payload.available_from,
      pickup_contact_user_id: payload.pickup_contact_user_id,
      pickup_contact_tier_contact_id: payload.pickup_contact_tier_contact_id,
      pickup_contact_name: payload.pickup_contact_name,
      pickup_contact_phone: payload.pickup_contact_phone,
      lifting_provider: payload.lifting_provider,
      lifting_points_certified: payload.lifting_points_certified,
      weight_ticket_provided: payload.weight_ticket_provided,
      photo_evidence_count: payload.photo_evidence_count,
      document_attachment_count: payload.document_attachment_count,
      manifest_id: payload.manifest_id,
      planned_zone_id: payload.planned_zone_id,
      sap_article_code: payload.sap_article_code,
      hazmat_validated: payload.hazmat_validated,
    }
    const { data } = await api.patch(`${BASE}/cargo/${id}`, normalizedPayload)
    return normalizeCargo(data)
  },

  updateCargoStatus: async (id: string, payload: CargoStatusUpdate): Promise<CargoItem> => {
    const normalizedPayload = {
      status: payload.status,
      damage_notes: payload.damage_notes ?? payload.notes,
    }
    const { data } = await api.patch(`${BASE}/cargo/${id}/status`, normalizedPayload)
    return normalizeCargo(data)
  },

  updateCargoWorkflowStatus: async (id: string, payload: CargoWorkflowStatusUpdate): Promise<CargoItem> => {
    const { data } = await api.patch(`${BASE}/cargo/${id}/workflow-status`, payload)
    return normalizeCargo(data)
  },

  listCargoAttachmentEvidence: async (id: string): Promise<CargoAttachmentEvidence[]> => {
    const { data } = await api.get(`${BASE}/cargo/${id}/attachment-evidence`)
    return data
  },

  updateCargoAttachmentEvidence: async (
    cargoId: string,
    attachmentId: string,
    evidence_type: CargoAttachmentEvidence['evidence_type'],
  ): Promise<CargoAttachmentEvidence> => {
    const { data } = await api.put(`${BASE}/cargo/${cargoId}/attachments/${attachmentId}/evidence-type`, { evidence_type })
    return data
  },

  receiveCargo: async (id: string, payload: CargoReceive = {}): Promise<CargoItem> => {
    const { data } = await api.post(`${BASE}/cargo/${id}/receive`, payload)
    return normalizeCargo(data)
  },

  initiateCargoReturn: async (cargoItemId: string, payload: CargoReturnCreate): Promise<CargoItem> => {
    const { data } = await api.post(`${BASE}/cargo/${cargoItemId}/return`, payload)
    return normalizeCargo(data)
  },

  // ── Package Elements ──
  getPackageElements: async (cargoItemId: string): Promise<PackageElement[]> => {
    const { data } = await api.get(`${BASE}/cargo/${cargoItemId}/elements`)
    return data
  },

  getCargoHistory: async (cargoItemId: string): Promise<CargoHistoryEntry[]> => {
    const { data } = await api.get(`${BASE}/cargo/${cargoItemId}/history`)
    return data
  },

  addPackageElement: async (cargoItemId: string, payload: PackageElementCreate): Promise<PackageElement> => {
    const { data } = await api.post(`${BASE}/cargo/${cargoItemId}/elements`, payload)
    return data
  },

  updatePackageElementReturn: async (
    cargoItemId: string,
    elementId: string,
    payload: PackageElementReturnUpdate,
  ): Promise<PackageElement> => {
    const { data } = await api.patch(`${BASE}/cargo/${cargoItemId}/elements/${elementId}/return`, payload)
    return data
  },

  updatePackageElementDisposition: async (
    cargoItemId: string,
    elementId: string,
    payload: PackageElementDispositionUpdate,
  ): Promise<PackageElement> => {
    const { data } = await api.patch(`${BASE}/cargo/${cargoItemId}/elements/${elementId}/disposition`, payload)
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
