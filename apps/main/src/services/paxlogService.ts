/**
 * PaxLog module API service — profiles, credentials, compliance, AdS, incidents.
 */
import api from '@/lib/api'
import type { PaginatedResponse, PaginationParams } from '@/types/api'

// ── Types ──────────────────────────────────────────────────────────────────

// PAX Profiles
export interface PaxProfile {
  id: string
  entity_id: string
  type: 'internal' | 'external'
  first_name: string
  last_name: string
  birth_date: string | null
  nationality: string | null
  company_id: string | null
  company_name: string | null
  group_id: string | null
  user_id: string | null
  user_email: string | null
  badge_number: string | null
  photo_url: string | null
  status: 'active' | 'incomplete' | 'suspended' | 'archived'
  profile_completeness: number
  synced_from_intranet: boolean
  archived: boolean
  created_at: string
  updated_at: string
}

export interface PaxProfileSummary {
  id: string
  entity_id: string
  type: 'internal' | 'external'
  first_name: string
  last_name: string
  company_id: string | null
  company_name: string | null
  user_id: string | null
  badge_number: string | null
  status: string
  profile_completeness: number
  created_at: string
}

export interface PaxProfileCreate {
  type: 'internal' | 'external'
  first_name: string
  last_name: string
  birth_date?: string | null
  nationality?: string | null
  company_id?: string | null
  user_id?: string | null
  group_id?: string | null
  badge_number?: string | null
}

export interface PaxProfileUpdate {
  first_name?: string
  last_name?: string
  birth_date?: string | null
  nationality?: string | null
  company_id?: string | null
  group_id?: string | null
  badge_number?: string | null
  status?: 'active' | 'incomplete' | 'suspended' | 'archived'
}

// Credential Types
export interface CredentialType {
  id: string
  code: string
  name: string
  category: 'safety' | 'medical' | 'technical' | 'administrative'
  has_expiry: boolean
  validity_months: number | null
  proof_required: boolean
  booking_service_id: string | null
  active: boolean
  created_at: string
}

export interface CredentialTypeCreate {
  code: string
  name: string
  category: 'safety' | 'medical' | 'technical' | 'administrative'
  has_expiry?: boolean
  validity_months?: number | null
  proof_required?: boolean
  booking_service_id?: string | null
}

// PAX Credentials
export interface PaxCredential {
  id: string
  pax_id: string
  credential_type_id: string
  obtained_date: string
  expiry_date: string | null
  proof_url: string | null
  status: 'valid' | 'expired' | 'pending_validation' | 'rejected'
  validated_by: string | null
  validated_at: string | null
  rejection_reason: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface PaxCredentialCreate {
  credential_type_id: string
  obtained_date: string
  expiry_date?: string | null
  proof_url?: string | null
  notes?: string | null
}

export interface PaxCredentialValidate {
  action: 'approve' | 'reject'
  rejection_reason?: string | null
}

// Compliance
export interface ComplianceMatrixEntry {
  id: string
  entity_id: string
  asset_id: string
  credential_type_id: string
  mandatory: boolean
  scope: 'all_visitors' | 'contractors_only' | 'permanent_staff_only'
  defined_by: 'hse_central' | 'site'
  set_by: string
  effective_date: string
  notes: string | null
}

export interface ComplianceMatrixCreate {
  asset_id: string
  credential_type_id: string
  mandatory?: boolean
  scope?: 'all_visitors' | 'contractors_only' | 'permanent_staff_only'
  defined_by: 'hse_central' | 'site'
  effective_date?: string | null
  notes?: string | null
}

export interface ComplianceCheckResult {
  pax_id: string
  asset_id: string
  compliant: boolean
  missing_credentials: string[]
  expired_credentials: string[]
  pending_credentials: string[]
}

// Avis de Séjour (AdS)
export interface Ads {
  id: string
  entity_id: string
  reference: string
  type: 'individual' | 'team'
  status: string
  workflow_id: string | null
  requester_id: string
  site_entry_asset_id: string
  visit_purpose: string
  visit_category: string
  start_date: string
  end_date: string
  outbound_transport_mode: string | null
  return_transport_mode: string | null
  cross_company_flag: boolean
  submitted_at: string | null
  approved_at: string | null
  rejected_at: string | null
  rejection_reason: string | null
  archived: boolean
  created_at: string
  updated_at: string
}

export interface AdsSummary {
  id: string
  entity_id: string
  reference: string
  type: 'individual' | 'team'
  status: string
  requester_id: string
  site_entry_asset_id: string
  visit_category: string
  start_date: string
  end_date: string
  pax_count: number
  created_at: string
}

export interface AdsCreate {
  type?: 'individual' | 'team'
  site_entry_asset_id: string
  visit_purpose: string
  visit_category: string
  start_date: string
  end_date: string
  pax_ids?: string[]
  outbound_transport_mode?: string | null
  outbound_departure_base_id?: string | null
  outbound_notes?: string | null
  return_transport_mode?: string | null
  return_departure_base_id?: string | null
  return_notes?: string | null
}

export interface AdsUpdate {
  visit_purpose?: string
  visit_category?: string
  start_date?: string
  end_date?: string
  outbound_transport_mode?: string | null
  outbound_departure_base_id?: string | null
  outbound_notes?: string | null
  return_transport_mode?: string | null
  return_departure_base_id?: string | null
  return_notes?: string | null
}

export interface AdsPax {
  id: string
  ads_id: string
  pax_id: string
  status: string
  compliance_checked_at: string | null
  compliance_summary: Record<string, unknown> | null
  booking_request_sent: boolean
  current_onboard: boolean
  priority_score: number
}

// PAX Incidents
export interface PaxIncident {
  id: string
  entity_id: string
  pax_id: string | null
  company_id: string | null
  asset_id: string | null
  severity: 'info' | 'warning' | 'temp_ban' | 'permanent_ban'
  description: string
  incident_date: string
  ban_start_date: string | null
  ban_end_date: string | null
  recorded_by: string
  resolved_at: string | null
  resolved_by: string | null
  resolution_notes: string | null
  created_at: string
}

export interface PaxIncidentCreate {
  pax_id?: string | null
  company_id?: string | null
  asset_id?: string | null
  severity: 'info' | 'warning' | 'temp_ban' | 'permanent_ban'
  description: string
  incident_date: string
  ban_start_date?: string | null
  ban_end_date?: string | null
}

export interface PaxIncidentResolve {
  resolution_notes?: string | null
}

// ── Params ─────────────────────────────────────────────────────────────────

interface ProfileListParams extends PaginationParams {
  search?: string
  status?: string
  type?: string
  company_id?: string
}

interface AdsListParams extends PaginationParams {
  status?: string
  visit_category?: string
  site_entry_asset_id?: string
}

interface IncidentListParams extends PaginationParams {
  pax_id?: string
  active_only?: boolean
}

// ── Service ────────────────────────────────────────────────────────────────

export const paxlogService = {
  // ── PAX Profiles ──

  listProfiles: async (params: ProfileListParams = {}): Promise<PaginatedResponse<PaxProfileSummary>> => {
    const { data } = await api.get('/api/v1/pax/profiles', { params })
    return data
  },

  getProfile: async (id: string): Promise<PaxProfile> => {
    const { data } = await api.get(`/api/v1/pax/profiles/${id}`)
    return data
  },

  createProfile: async (payload: PaxProfileCreate): Promise<PaxProfile> => {
    const { data } = await api.post('/api/v1/pax/profiles', payload)
    return data
  },

  updateProfile: async (id: string, payload: PaxProfileUpdate): Promise<PaxProfile> => {
    const { data } = await api.patch(`/api/v1/pax/profiles/${id}`, payload)
    return data
  },

  // ── Credential Types ──

  listCredentialTypes: async (category?: string): Promise<CredentialType[]> => {
    const { data } = await api.get('/api/v1/pax/credential-types', { params: category ? { category } : {} })
    return data
  },

  createCredentialType: async (payload: CredentialTypeCreate): Promise<CredentialType> => {
    const { data } = await api.post('/api/v1/pax/credential-types', payload)
    return data
  },

  // ── PAX Credentials ──

  listCredentials: async (profileId: string): Promise<PaxCredential[]> => {
    const { data } = await api.get(`/api/v1/pax/profiles/${profileId}/credentials`)
    return data
  },

  createCredential: async (profileId: string, payload: PaxCredentialCreate): Promise<PaxCredential> => {
    const { data } = await api.post(`/api/v1/pax/profiles/${profileId}/credentials`, payload)
    return data
  },

  validateCredential: async (profileId: string, credentialId: string, payload: PaxCredentialValidate): Promise<PaxCredential> => {
    const { data } = await api.patch(`/api/v1/pax/profiles/${profileId}/credentials/${credentialId}/validate`, payload)
    return data
  },

  // ── Compliance ──

  listComplianceMatrix: async (assetId?: string): Promise<ComplianceMatrixEntry[]> => {
    const { data } = await api.get('/api/v1/pax/compliance-matrix', { params: assetId ? { asset_id: assetId } : {} })
    return data
  },

  createComplianceEntry: async (payload: ComplianceMatrixCreate): Promise<ComplianceMatrixEntry> => {
    const { data } = await api.post('/api/v1/pax/compliance-matrix', payload)
    return data
  },

  deleteComplianceEntry: async (id: string): Promise<void> => {
    await api.delete(`/api/v1/pax/compliance-matrix/${id}`)
  },

  checkCompliance: async (profileId: string, assetId: string): Promise<ComplianceCheckResult> => {
    const { data } = await api.get(`/api/v1/pax/profiles/${profileId}/compliance/${assetId}`)
    return data
  },

  // ── Avis de Séjour (AdS) ──

  listAds: async (params: AdsListParams = {}): Promise<PaginatedResponse<AdsSummary>> => {
    const { data } = await api.get('/api/v1/pax/ads', { params })
    return data
  },

  getAds: async (id: string): Promise<Ads> => {
    const { data } = await api.get(`/api/v1/pax/ads/${id}`)
    return data
  },

  createAds: async (payload: AdsCreate): Promise<Ads> => {
    const { data } = await api.post('/api/v1/pax/ads', payload)
    return data
  },

  updateAds: async (id: string, payload: AdsUpdate): Promise<Ads> => {
    const { data } = await api.patch(`/api/v1/pax/ads/${id}`, payload)
    return data
  },

  submitAds: async (id: string): Promise<Ads> => {
    const { data } = await api.post(`/api/v1/pax/ads/${id}/submit`)
    return data
  },

  cancelAds: async (id: string): Promise<Ads> => {
    const { data } = await api.post(`/api/v1/pax/ads/${id}/cancel`)
    return data
  },

  listAdsPax: async (adsId: string): Promise<AdsPax[]> => {
    const { data } = await api.get(`/api/v1/pax/ads/${adsId}/pax`)
    return data
  },

  addPaxToAds: async (adsId: string, paxId: string): Promise<AdsPax> => {
    const { data } = await api.post(`/api/v1/pax/ads/${adsId}/pax/${paxId}`)
    return data
  },

  removePaxFromAds: async (adsId: string, paxId: string): Promise<void> => {
    await api.delete(`/api/v1/pax/ads/${adsId}/pax/${paxId}`)
  },

  // ── PAX Incidents ──

  listIncidents: async (params: IncidentListParams = {}): Promise<PaginatedResponse<PaxIncident>> => {
    const { data } = await api.get('/api/v1/pax/incidents', { params })
    return data
  },

  createIncident: async (payload: PaxIncidentCreate): Promise<PaxIncident> => {
    const { data } = await api.post('/api/v1/pax/incidents', payload)
    return data
  },

  resolveIncident: async (id: string, payload: PaxIncidentResolve): Promise<PaxIncident> => {
    const { data } = await api.patch(`/api/v1/pax/incidents/${id}/resolve`, payload)
    return data
  },
}
