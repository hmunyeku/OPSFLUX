import api from '@/lib/api'
import type {
  CargoAttachmentEvidence,
  CargoItem,
  CargoItemCreate,
  CargoItemUpdate,
  CargoLoadingOption,
  CargoRequest,
  CargoRequestCreate,
  CargoRequestUpdate,
  CargoReturnCreate,
  CargoStatusUpdate,
  CargoWorkflowStatusUpdate,
  PackageElement,
  PackageElementCreate,
  PackageElementDispositionUpdate,
  PackageElementReturnUpdate,
  CargoHistoryEntry,
  PaginationParams,
  PaginatedResponse,
  SapMatchResult,
  TravelArticle,
  TravelArticleCreate,
  TravelArticleImportResult,
} from '@/types/api'

const BASE = '/api/v1/packlog'

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
    notes: typeof data.notes === 'string' ? data.notes : typeof data.damage_notes === 'string' ? data.damage_notes : null,
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
    created_at: typeof data.created_at === 'string' ? data.created_at : new Date().toISOString(),
    cargo_count: typeof data.cargo_count === 'number' ? data.cargo_count : 0,
    destination_name: typeof data.destination_name === 'string' ? data.destination_name : null,
    sender_name: typeof data.sender_name === 'string' ? data.sender_name : null,
    imputation_reference_code: typeof data.imputation_reference_code === 'string' ? data.imputation_reference_code : null,
    imputation_reference_name: typeof data.imputation_reference_name === 'string' ? data.imputation_reference_name : null,
    active: typeof data.active === 'boolean' ? data.active : true,
    is_ready_for_submission: typeof data.is_ready_for_submission === 'boolean' ? data.is_ready_for_submission : false,
    missing_requirements: Array.isArray(data.missing_requirements) ? data.missing_requirements.map(String) : [],
  }
}

function normalizeCargoLoadingOption(data: Record<string, unknown>): CargoLoadingOption {
  return {
    voyage_id: String(data.voyage_id ?? ''),
    voyage_code: String(data.voyage_code ?? ''),
    voyage_status: String(data.voyage_status ?? ''),
    scheduled_departure: String(data.scheduled_departure ?? ''),
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
      ? data.compatible_zones.map((zone) => ({
          zone_id: String((zone as Record<string, unknown>).zone_id ?? ''),
          zone_name: String((zone as Record<string, unknown>).zone_name ?? ''),
          zone_type: String((zone as Record<string, unknown>).zone_type ?? ''),
          surface_m2: typeof (zone as Record<string, unknown>).surface_m2 === 'number' ? ((zone as Record<string, unknown>).surface_m2 as number) : null,
          max_weight_kg: typeof (zone as Record<string, unknown>).max_weight_kg === 'number' ? ((zone as Record<string, unknown>).max_weight_kg as number) : null,
        }))
      : [],
    requires_manifest_creation: typeof data.requires_manifest_creation === 'boolean' ? data.requires_manifest_creation : false,
    can_load: typeof data.can_load === 'boolean' ? data.can_load : false,
    blocking_reasons: Array.isArray(data.blocking_reasons) ? data.blocking_reasons.map(String) : [],
  }
}

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

interface CargoListParams extends PaginationParams {
  status?: string
  cargo_type?: string
  manifest_id?: string
  destination_asset_id?: string
  request_id?: string
  search?: string
  scope?: string
}

interface CargoRequestListParams extends PaginationParams {
  status?: string
  search?: string
}

interface ArticleListParams extends PaginationParams {
  search?: string
  sap_code?: string
  management_type?: string
  is_hazmat?: boolean
}

type PackLogTrackingPayload = Record<string, unknown>

export const packlogService = {
  listCargoRequests: async (params: CargoRequestListParams = {}): Promise<PaginatedResponse<CargoRequest>> => {
    const { data } = await api.get(`${BASE}/cargo-requests`, { params })
    return { ...data, items: Array.isArray(data.items) ? data.items.map((item: Record<string, unknown>) => normalizeCargoRequest(item)) : [] }
  },
  getCargoRequest: async (id: string): Promise<CargoRequest> => {
    const { data } = await api.get(`${BASE}/cargo-requests/${id}`)
    return normalizeCargoRequest(data)
  },
  getArticle: async (id: string): Promise<TravelArticle> => {
    const { data } = await api.get(`${BASE}/articles/${id}`)
    return normalizeTravelArticle(data)
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
    return { ...data, items: Array.isArray(data.items) ? data.items.map((item: Record<string, unknown>) => normalizeCargo(item)) : [] }
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
    const { data } = await api.patch(`${BASE}/cargo/${id}`, payload)
    return normalizeCargo(data)
  },
  updateCargoStatus: async (id: string, payload: CargoStatusUpdate): Promise<CargoItem> => {
    const { data } = await api.patch(`${BASE}/cargo/${id}/status`, { status: payload.status, damage_notes: payload.damage_notes ?? payload.notes })
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
  updateCargoAttachmentEvidence: async (cargoId: string, attachmentId: string, evidence_type: CargoAttachmentEvidence['evidence_type']): Promise<CargoAttachmentEvidence> => {
    const { data } = await api.put(`${BASE}/cargo/${cargoId}/attachments/${attachmentId}/evidence-type`, { evidence_type })
    return data
  },
  receiveCargo: async (id: string, payload: { received_by?: string | null; notes?: string | null } = {}): Promise<CargoItem> => {
    const { data } = await api.post(`${BASE}/cargo/${id}/receive`, payload)
    return normalizeCargo(data)
  },
  initiateCargoReturn: async (cargoItemId: string, payload: CargoReturnCreate): Promise<CargoItem> => {
    const { data } = await api.post(`${BASE}/cargo/${cargoItemId}/return`, payload)
    return normalizeCargo(data)
  },
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
  updatePackageElementReturn: async (cargoItemId: string, elementId: string, payload: PackageElementReturnUpdate): Promise<PackageElement> => {
    const { data } = await api.patch(`${BASE}/cargo/${cargoItemId}/elements/${elementId}/return`, payload)
    return data
  },
  updatePackageElementDisposition: async (cargoItemId: string, elementId: string, payload: PackageElementDispositionUpdate): Promise<PackageElement> => {
    const { data } = await api.patch(`${BASE}/cargo/${cargoItemId}/elements/${elementId}/disposition`, payload)
    return data
  },
  sapMatch: async (description: string): Promise<SapMatchResult> => {
    const { data } = await api.post(`${BASE}/cargo/sap-match`, { description })
    return data
  },
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
  getPublicCargoTracking: async (trackingCode: string): Promise<PackLogTrackingPayload> => {
    const { data } = await api.get(`${BASE}/public/cargo/${encodeURIComponent(trackingCode)}`)
    return data
  },
  getPublicVoyageCargoTracking: async (voyageCode: string): Promise<PackLogTrackingPayload> => {
    const { data } = await api.get(`${BASE}/public/voyages/${encodeURIComponent(voyageCode)}/cargo`)
    return data
  },
  getCargoLabelPdf: async (cargoId: string, language: 'fr' | 'en' = 'fr'): Promise<Blob> => {
    const { data } = await api.get(`${BASE}/cargo/${cargoId}/label.pdf`, {
      params: { language },
      responseType: 'blob',
    })
    return data
  },
}
