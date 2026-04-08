/**
 * PaxLog module API service — profiles, credentials, compliance, AdS, incidents,
 * imputations, rotation cycles, external links, stay programs, profile types, signalements.
 */
import api from '@/lib/api'
import type { PaginatedResponse, PaginationParams } from '@/types/api'

// ── Types ──────────────────────────────────────────────────────

// PAX Profiles
export interface PaxProfile {
  id: string
  pax_source: 'user' | 'contact'
  entity_id: string
  pax_type: 'internal' | 'external'
  first_name: string
  last_name: string
  birth_date: string | null
  nationality: string | null
  company_id: string | null
  company_name: string | null
  group_id: string | null
  badge_number: string | null
  photo_url: string | null
  email: string | null
  linked_user_id: string | null
  linked_user_email: string | null
  linked_user_active: boolean | null
  active: boolean
  created_at: string | null
  updated_at: string | null
}

export interface PaxProfileSummary {
  id: string
  pax_source: 'user' | 'contact'
  entity_id: string | null
  pax_type: 'internal' | 'external'
  first_name: string
  last_name: string
  company_id: string | null
  company_name: string | null
  badge_number: string | null
  active: boolean
  created_at: string | null
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

export interface PaxGroup {
  id: string
  entity_id: string
  name: string
  company_id: string | null
  company_name: string | null
  active: boolean
}

export interface PaxSitePresence {
  ads_id: string
  ads_reference: string
  ads_status: string
  pax_status: string | null
  site_asset_id: string
  site_name: string | null
  start_date: string | null
  end_date: string | null
  visit_purpose: string | null
  visit_category: string | null
  boarding_status: string | null
  boarded_at: string | null
  approved_at: string | null
  completed_at: string | null
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
  user_id: string | null
  contact_id: string | null
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
  user_id: string | null
  contact_id: string | null
  asset_id: string
  compliant: boolean
  missing_credentials: string[]
  expired_credentials: string[]
  pending_credentials: string[]
  results?: Array<{
    credential_type_code: string
    credential_type_name: string
    status: string
    message: string
    expiry_date: string | null
    layer?: string | null
    layer_label?: string | null
    blocking?: boolean
  }>
  covered_layers?: string[]
  summary_by_status?: Record<string, number>
  verification_sequence?: string[]
}

export interface ComplianceStats {
  total_pax: number
  compliant_pax: number
  non_compliant_pax: number
  compliance_rate: number
  expiring_soon: number
  expired: number
}

export interface ExpiringCredential {
  id: string
  user_id: string | null
  contact_id: string | null
  pax_first_name: string
  pax_last_name: string
  pax_company_name: string | null
  credential_type_id: string
  credential_type_name: string
  credential_type_category: string
  expiry_date: string
  days_remaining: number
  alert_bucket: 'j0' | 'j7' | 'j30' | 'future'
  status: string
}

// Avis de Sejour (AdS)
export interface Ads {
  id: string
  entity_id: string
  reference: string
  type: 'individual' | 'team'
  status: string
  workflow_id: string | null
  created_by: string
  created_by_name?: string | null
  requester_id: string
  requester_name?: string | null
  site_entry_asset_id: string
  visit_purpose: string
  visit_category: string
  start_date: string
  end_date: string
  outbound_transport_mode: string | null
  return_transport_mode: string | null
  project_id: string | null
  linked_projects?: Array<{
    project_id: string
    project_name?: string | null
    project_manager_id?: string | null
    project_manager_name?: string | null
  }>
  allowed_company_ids?: string[]
  allowed_company_names?: string[]
  project_manager_id?: string | null
  project_manager_name?: string | null
  planner_activity_id: string | null
  planner_activity_title?: string | null
  planner_activity_status?: string | null
  cross_company_flag: boolean
  submitted_at: string | null
  approved_at: string | null
  rejected_at: string | null
  rejection_reason: string | null
  origin_mission_notice_id?: string | null
  origin_mission_notice_reference?: string | null
  origin_mission_notice_title?: string | null
  origin_mission_program_id?: string | null
  origin_mission_program_activity?: string | null
  archived: boolean
  created_at: string
  updated_at: string
  // Enriched
  site_name?: string | null
  project_name?: string | null
  pax_count?: number
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
  allowed_company_ids?: string[]
  allowed_company_names?: string[]
  pax_count: number
  created_at: string
  requester_name?: string | null
  site_name?: string | null
}

export interface AdsValidationQueueItem {
  id: string
  reference: string
  status: string
  requester_id: string
  requester_name: string | null
  site_entry_asset_id: string
  site_name: string | null
  visit_category: string
  start_date: string
  end_date: string
  pax_count: number
  planner_activity_id: string | null
  planner_activity_title: string | null
  capacity_scope: string | null
  capacity_limit: number | null
  reserved_pax_count: number | null
  remaining_capacity: number | null
  forecast_pax: number | null
  real_pob: number | null
  blocked_pax_count: number
  linked_project_count: number
  linked_project_names: string[]
  stay_program_count: number
  daily_capacity_preview: AdsValidationDailyPreviewItem[]
  created_at: string
}

export interface AdsValidationDailyPreviewItem {
  date: string
  forecast_pax: number | null
  real_pob: number | null
  capacity_limit: number | null
  remaining_capacity: number | null
  saturation_pct: number | null
  is_critical: boolean
}

export interface AdsEvent {
  id: string
  entity_id: string
  ads_id: string
  ads_pax_id: string | null
  event_type: string
  old_status: string | null
  new_status: string | null
  actor_id: string | null
  reason: string | null
  metadata_json: Record<string, unknown> | null
  recorded_at: string
}

export interface AdsCreate {
  type?: 'individual' | 'team'
  requester_id?: string | null
  site_entry_asset_id: string
  visit_purpose: string
  visit_category: string
  start_date: string
  end_date: string
  pax_entries?: Array<{ user_id?: string | null; contact_id?: string | null }>
  project_id?: string | null
  planner_activity_id?: string | null
  allowed_company_ids?: string[]
  outbound_transport_mode?: string | null
  outbound_departure_base_id?: string | null
  outbound_notes?: string | null
  return_transport_mode?: string | null
  return_departure_base_id?: string | null
  return_notes?: string | null
}

/** Candidate from /pax/candidates search — unified user/contact/profile */
export interface PaxCandidate {
  id: string
  source: 'user' | 'contact'
  user_id?: string
  contact_id?: string
  first_name: string
  last_name: string
  pax_type: 'internal' | 'external'
  /** @deprecated use pax_type */
  type?: 'internal' | 'external'
  badge?: string | null
  company_id?: string | null
  email?: string
  position?: string
}

export interface AddPaxBody {
  user_id?: string | null
  contact_id?: string | null
}

export interface AdsUpdate {
  visit_purpose?: string
  visit_category?: string
  start_date?: string
  end_date?: string
  allowed_company_ids?: string[] | null
  outbound_transport_mode?: string | null
  outbound_departure_base_id?: string | null
  outbound_notes?: string | null
  return_transport_mode?: string | null
  return_departure_base_id?: string | null
  return_notes?: string | null
}

export interface AdsStayChangeRequest {
  reason: string
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

export interface AdsManualDepartureRequest {
  reason: string
}

export interface AdsPax {
  id: string
  ads_id: string
  user_id: string | null
  contact_id: string | null
  pax_source?: 'user' | 'contact' | null
  status: string
  compliance_checked_at: string | null
  compliance_summary: Record<string, unknown> | null
  booking_request_sent: boolean
  current_onboard: boolean
  priority_score: number
  priority_source?: string | null
  // Enriched
  pax_company_id?: string | null
  pax_first_name?: string | null
  pax_last_name?: string | null
  pax_badge?: string | null
  pax_type?: string | null
  pax_company_name?: string | null
  pax_email?: string | null
  pax_phone?: string | null
  compliant?: boolean | null
}

export interface AdsPaxDecision {
  action: 'approve' | 'reject' | 'waitlist'
  reason?: string | null
}

export interface AdsWaitlistItem {
  ads_id: string
  ads_reference: string
  ads_status: string
  ads_pax_id: string
  planner_activity_id: string | null
  planner_activity_title: string | null
  site_entry_asset_id: string | null
  site_name: string | null
  requester_id: string | null
  requester_name: string | null
  user_id: string | null
  contact_id: string | null
  pax_first_name: string
  pax_last_name: string
  pax_company_name: string | null
  priority_score: number
  priority_source: string | null
  capacity_scope: string | null
  capacity_limit: number | null
  reserved_pax_count: number | null
  remaining_capacity: number | null
  submitted_at: string | null
  waitlisted_at: string | null
}

export interface AdsWaitlistPriorityUpdate {
  priority_score: number
  reason?: string | null
}

// AdS Imputations
export interface AdsImputation {
  id: string
  ads_id: string
  project_id: string
  cost_center_id: string
  percentage: number
  wbs_id: string | null
  project_name?: string | null
  cost_center_name?: string | null
  created_at: string
}

export interface AdsImputationSuggestion {
  owner_type: string
  owner_id: string
  project_id: string | null
  project_name: string | null
  project_source: string
  cost_center_id: string | null
  cost_center_name: string | null
  cost_center_source: string
  resolution_notes: string[]
}

export interface AdsImputationCreate {
  project_id: string
  cost_center_id: string
  percentage: number
  wbs_id?: string | null
}

// External Links
export interface AdsExternalLink {
  id: string
  ads_id: string
  token: string
  url: string
  otp_required: boolean
  otp_sent_to: string | null
  expires_at: string
  max_uses: number
  use_count: number
  active: boolean
  created_at: string
}

export interface AdsExternalLinkSecurityEvent {
  timestamp: string | null
  action: string
  otp_validated: boolean | null
  metadata: Record<string, unknown> | null
}

export interface AdsExternalLinkSecurity {
  id: string
  ads_id: string
  created_by: string
  otp_required: boolean
  otp_destination_masked: string | null
  expires_at: string
  max_uses: number
  use_count: number
  remaining_uses: number | null
  revoked: boolean
  active: boolean
  created_at: string
  session_expires_at: string | null
  last_validated_at: string | null
  anomaly_count: number
  anomaly_actions: Record<string, number>
  recent_events: AdsExternalLinkSecurityEvent[]
}

export interface AdsExternalLinkCreate {
  otp_required?: boolean
  otp_sent_to?: string | null
  recipient_user_id?: string | null
  recipient_contact_id?: string | null
  expires_hours?: number
  max_uses?: number
}

function buildExternalPortalBase(): string {
  const { protocol, hostname } = window.location
  if (hostname.startsWith('ext.')) return `${protocol}//${hostname}`
  if (hostname.startsWith('app.')) return `${protocol}//ext.${hostname.slice(4)}`
  if (hostname.startsWith('web.')) return `${protocol}//ext.${hostname.split('.').slice(1).join('.')}`
  if (hostname.startsWith('api.')) return `${protocol}//ext.${hostname.slice(4)}`
  if (hostname === 'localhost' || hostname === '127.0.0.1') return `${protocol}//${hostname}:4175`
  return `${protocol}//${hostname}`
}

// PAX Incidents / Signalements
export interface PaxIncident {
  id: string
  entity_id: string
  user_id: string | null
  contact_id: string | null
  company_id: string | null
  pax_group_id: string | null
  asset_id: string | null
  severity: 'info' | 'warning' | 'site_ban' | 'temp_ban' | 'permanent_ban'
  description: string
  incident_date: string
  ban_start_date: string | null
  ban_end_date: string | null
  recorded_by: string
  resolved_at: string | null
  resolved_by: string | null
  resolution_notes: string | null
  created_at: string
  // Enriched
  pax_first_name?: string | null
  pax_last_name?: string | null
  company_name?: string | null
  group_name?: string | null
  asset_name?: string | null
}

export interface PaxIncidentCreate {
  user_id?: string | null
  contact_id?: string | null
  company_id?: string | null
  pax_group_id?: string | null
  asset_id?: string | null
  severity: 'info' | 'warning' | 'site_ban' | 'temp_ban' | 'permanent_ban'
  description: string
  incident_date: string
  ban_start_date?: string | null
  ban_end_date?: string | null
}

export interface PaxIncidentResolve {
  resolution_notes?: string | null
}

// Rotation Cycles
export interface RotationCycle {
  id: string
  entity_id: string
  user_id: string | null
  contact_id: string | null
  site_asset_id: string
  status: 'active' | 'paused' | 'completed'
  days_on: number
  days_off: number
  start_date: string
  end_date: string | null
  current_cycle_start: string | null
  next_rotation_date: string | null
  notes: string | null
  created_at: string
  updated_at: string
  // Enriched
  pax_first_name?: string | null
  pax_last_name?: string | null
  site_name?: string | null
  company_name?: string | null
  auto_create_ads?: boolean
  ads_lead_days?: number
  compliance_risk_level?: 'clear' | 'blocked'
  compliance_issue_count?: number
  compliance_issue_preview?: string[]
}

export interface RotationCycleCreate {
  user_id?: string | null
  contact_id?: string | null
  site_asset_id: string
  days_on: number
  days_off: number
  start_date: string
  notes?: string | null
}

export interface RotationCycleUpdate {
  days_on?: number
  days_off?: number
  status?: 'active' | 'paused' | 'completed'
  notes?: string | null
}

// Stay Programs
export interface StayProgram {
  id: string
  ads_id: string | null
  user_id: string | null
  contact_id: string | null
  status: 'draft' | 'submitted' | 'approved' | 'rejected'
  movements: Array<Record<string, unknown>>
  created_at: string
}

export interface StayProgramCreate {
  ads_id?: string | null
  user_id?: string | null
  contact_id?: string | null
  movements: Array<Record<string, unknown>>
}

// Profile Types & Habilitation Matrix
export interface ProfileType {
  id: string
  entity_id: string
  code: string
  name: string
  description: string | null
  active: boolean
  created_at: string
}

export interface ProfileTypeCreate {
  code: string
  name: string
  description?: string | null
}

export interface PaxProfileType {
  id: string
  user_id: string | null
  contact_id: string | null
  profile_type_id: string
  assigned_at: string
  profile_type_name?: string | null
  profile_type_code?: string | null
}

export interface HabilitationMatrixEntry {
  profile_type_id: string
  profile_type_name: string
  credential_type_id: string
  credential_type_name: string
  mandatory: boolean
}

// Avis de Mission (AVM)
export interface MissionProgramCreate {
  activity_description: string
  activity_type?: 'visit' | 'meeting' | 'inspection' | 'training' | 'handover' | 'other'
  site_asset_id?: string | null
  planned_start_date?: string | null
  planned_end_date?: string | null
  project_id?: string | null
  pax_entries?: Array<{ user_id?: string | null; contact_id?: string | null }>
  notes?: string | null
}

export interface MissionProgramRead {
  id: string
  mission_notice_id: string
  order_index: number
  activity_description: string
  activity_type: string
  site_asset_id: string | null
  planned_start_date: string | null
  planned_end_date: string | null
  project_id: string | null
  generated_ads_id: string | null
  generated_ads_reference?: string | null
  generated_ads_status?: string | null
  notes: string | null
  pax_entries: Array<{ user_id?: string | null; contact_id?: string | null }>
  site_name: string | null
}

export interface MissionPreparationTaskRead {
  id: string
  mission_notice_id: string
  title: string
  task_type: string
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled' | 'blocked' | 'na'
  assigned_to_user_id: string | null
  assigned_to_user_name?: string | null
  linked_ads_id: string | null
  linked_ads_reference?: string | null
  due_date: string | null
  completed_at: string | null
  notes: string | null
  auto_generated: boolean
}

export interface MissionPreparationTaskUpdate {
  status?: 'pending' | 'in_progress' | 'completed' | 'cancelled' | 'blocked' | 'na'
  assigned_to_user_id?: string | null
  due_date?: string | null
  notes?: string | null
}

export interface MissionVisaFollowupRead {
  id: string
  mission_notice_id: string
  preparation_task_id?: string | null
  user_id?: string | null
  contact_id?: string | null
  pax_name?: string | null
  company_name?: string | null
  status: 'to_initiate' | 'submitted' | 'in_review' | 'obtained' | 'refused'
  visa_type?: string | null
  country?: string | null
  submitted_at?: string | null
  obtained_at?: string | null
  refused_at?: string | null
  notes?: string | null
  created_at: string
  updated_at: string
}

export interface MissionVisaFollowupUpdate {
  status?: 'to_initiate' | 'submitted' | 'in_review' | 'obtained' | 'refused'
  visa_type?: string | null
  country?: string | null
  notes?: string | null
}

export interface MissionAllowanceRequestRead {
  id: string
  mission_notice_id: string
  preparation_task_id?: string | null
  user_id?: string | null
  contact_id?: string | null
  pax_name?: string | null
  company_name?: string | null
  status: 'draft' | 'submitted' | 'approved' | 'paid'
  amount?: number | null
  currency?: string | null
  submitted_at?: string | null
  approved_at?: string | null
  paid_at?: string | null
  payment_reference?: string | null
  notes?: string | null
  created_at: string
  updated_at: string
}

export interface MissionAllowanceRequestUpdate {
  status?: 'draft' | 'submitted' | 'approved' | 'paid'
  amount?: number | null
  currency?: string | null
  payment_reference?: string | null
  notes?: string | null
}

export interface MissionNoticeCreate {
  title: string
  description?: string | null
  planned_start_date?: string | null
  planned_end_date?: string | null
  mission_type?: 'standard' | 'vip' | 'regulatory' | 'emergency'
  pax_quota?: number
  requires_badge?: boolean
  requires_epi?: boolean
  requires_visa?: boolean
  eligible_displacement_allowance?: boolean
  epi_measurements?: Record<string, unknown> | null
  global_attachments_config?: string[]
  per_pax_attachments_config?: string[]
  programs?: MissionProgramCreate[]
}

export interface MissionNoticeUpdate {
  title?: string
  description?: string | null
  planned_start_date?: string | null
  planned_end_date?: string | null
  mission_type?: 'standard' | 'vip' | 'regulatory' | 'emergency'
  pax_quota?: number
  requires_badge?: boolean
  requires_epi?: boolean
  requires_visa?: boolean
  eligible_displacement_allowance?: boolean
  epi_measurements?: Record<string, unknown> | null
  global_attachments_config?: string[] | null
  per_pax_attachments_config?: string[] | null
}

export interface MissionNoticeModifyRequest extends MissionNoticeUpdate {
  reason: string
}

export interface MissionNoticeRead {
  id: string
  entity_id: string
  reference: string
  title: string
  description: string | null
  created_by: string
  status: 'draft' | 'in_preparation' | 'active' | 'ready' | 'completed' | 'cancelled'
  planned_start_date: string | null
  planned_end_date: string | null
  requires_badge: boolean
  requires_epi: boolean
  requires_visa: boolean
  eligible_displacement_allowance: boolean
  epi_measurements: Record<string, unknown> | null
  global_attachments_config: string[]
  per_pax_attachments_config: string[]
  mission_type: 'standard' | 'vip' | 'regulatory' | 'emergency'
  pax_quota: number
  archived: boolean
  cancellation_reason: string | null
  created_at: string
  updated_at: string
  // Enriched
  creator_name: string | null
  programs: MissionProgramRead[]
  preparation_tasks: MissionPreparationTaskRead[]
  visa_followups: MissionVisaFollowupRead[]
  allowance_requests: MissionAllowanceRequestRead[]
  preparation_progress: number
  open_preparation_tasks: number
  ready_for_approval: boolean
  last_modification_reason?: string | null
  last_modified_at?: string | null
  last_modified_by_name?: string | null
  last_modified_fields?: string[]
  last_modification_changes?: Record<string, { before: unknown; after: unknown }> | null
  last_linked_ads_set_to_review?: number
  last_linked_ads_references?: string[]
}

export interface MissionNoticeSummary {
  id: string
  entity_id: string
  reference: string
  title: string
  status: 'draft' | 'in_preparation' | 'active' | 'ready' | 'completed' | 'cancelled'
  mission_type: string
  pax_quota: number
  planned_start_date: string | null
  planned_end_date: string | null
  created_by: string
  creator_name: string | null
  pax_count: number
  preparation_progress: number
  open_preparation_tasks: number
  ready_for_approval: boolean
  created_at: string
}

// ── Params ─────────────────────────────────────────────────────

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
  search?: string
  requester_id?: string
  scope?: 'my' | 'all'
  date_from?: string
  date_to?: string
}

interface IncidentListParams extends PaginationParams {
  user_id?: string
  contact_id?: string
  company_id?: string
  pax_group_id?: string
  asset_id?: string
  severity?: string
  active_only?: boolean
}

interface RotationCycleListParams extends PaginationParams {
  user_id?: string
  contact_id?: string
  site_asset_id?: string
  status?: string
}

interface StayProgramListParams extends PaginationParams {
  ads_id?: string
  user_id?: string
  contact_id?: string
  status?: string
}

interface AvmListParams extends PaginationParams {
  search?: string
  status?: string
  mission_type?: string
  scope?: 'my' | 'all'
}

// ── Service ────────────────────────────────────────────────────

export const paxlogService = {
  // ── PAX Profiles ──

  listProfiles: async (params: ProfileListParams = {}): Promise<PaginatedResponse<PaxProfileSummary>> => {
    const { data } = await api.get('/api/v1/pax/profiles', { params })
    return data
  },

  listPaxGroups: async (params: { page?: number; page_size?: number; search?: string; company_id?: string } = {}): Promise<PaginatedResponse<PaxGroup>> => {
    const { data } = await api.get('/api/v1/pax/pax-groups', { params })
    return data
  },

  getProfile: async (id: string, paxSource: 'user' | 'contact'): Promise<PaxProfile> => {
    const { data } = await api.get(`/api/v1/pax/profiles/${id}`, { params: { pax_source: paxSource } })
    return data
  },

  getProfileSitePresenceHistory: async (id: string, paxSource: 'user' | 'contact'): Promise<PaxSitePresence[]> => {
    const { data } = await api.get(`/api/v1/pax/profiles/${id}/site-presence-history`, { params: { pax_source: paxSource } })
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

  getComplianceStats: async (): Promise<ComplianceStats> => {
    const { data } = await api.get('/api/v1/pax/compliance/stats')
    return data
  },

  getExpiringCredentials: async (daysAhead?: number): Promise<ExpiringCredential[]> => {
    const { data } = await api.get('/api/v1/pax/compliance/expiring', { params: daysAhead ? { days_ahead: daysAhead } : {} })
    return data
  },

  // ── Avis de Sejour (AdS) ──

  listAds: async (params: AdsListParams = {}): Promise<PaginatedResponse<AdsSummary>> => {
    const { data } = await api.get('/api/v1/pax/ads', { params })
    return data
  },

  listAdsValidationQueue: async (params: PaginationParams = {}): Promise<PaginatedResponse<AdsValidationQueueItem>> => {
    const { data } = await api.get('/api/v1/pax/ads-validation-queue', { params })
    return data
  },

  listAdsWaitlist: async (params: { page?: number; page_size?: number; search?: string; planner_activity_id?: string; site_entry_asset_id?: string } = {}): Promise<PaginatedResponse<AdsWaitlistItem>> => {
    const { data } = await api.get('/api/v1/pax/ads-waitlist', { params })
    return data
  },

  updateAdsWaitlistPriority: async (entryId: string, payload: AdsWaitlistPriorityUpdate): Promise<{ ads_pax_id: string; ads_id: string; priority_score: number; priority_source: string | null }> => {
    const { data } = await api.post(`/api/v1/pax/ads-waitlist/${entryId}/priority`, payload)
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

  startAdsProgress: async (id: string): Promise<Ads> => {
    const { data } = await api.post(`/api/v1/pax/ads/${id}/start-progress`)
    return data
  },

  cancelAds: async (id: string): Promise<Ads> => {
    const { data } = await api.post(`/api/v1/pax/ads/${id}/cancel`)
    return data
  },

  completeAds: async (id: string): Promise<Ads> => {
    const { data } = await api.post(`/api/v1/pax/ads/${id}/complete`)
    return data
  },

  manualDepartureAds: async (id: string, payload: AdsManualDepartureRequest): Promise<Ads> => {
    const { data } = await api.post(`/api/v1/pax/ads/${id}/manual-departure`, payload)
    return data
  },

  approveAds: async (id: string): Promise<Ads> => {
    const { data } = await api.post(`/api/v1/pax/ads/${id}/approve`)
    return data
  },

  rejectAds: async (id: string, reason?: string): Promise<Ads> => {
    const { data } = await api.post(`/api/v1/pax/ads/${id}/reject`, { reason })
    return data
  },

  requestReviewAds: async (id: string, reason: string): Promise<Ads> => {
    const { data } = await api.post(`/api/v1/pax/ads/${id}/request-review`, { reason })
    return data
  },

  requestAdsStayChange: async (id: string, payload: AdsStayChangeRequest): Promise<Ads> => {
    const { data } = await api.post(`/api/v1/pax/ads/${id}/request-stay-change`, payload)
    return data
  },

  listAdsEvents: async (adsId: string): Promise<AdsEvent[]> => {
    const { data } = await api.get<AdsEvent[]>(`/api/v1/pax/ads/${adsId}/events`)
    return data
  },

  resubmitAds: async (adsId: string, reason: string): Promise<Ads> => {
    const { data } = await api.post(`/api/v1/pax/ads/${adsId}/resubmit`, { reason })
    return data
  },

  getAdsByReference: async (reference: string): Promise<Ads> => {
    const { data } = await api.get(`/api/v1/pax/ads/by-reference/${encodeURIComponent(reference)}`)
    return data
  },

  getAdsPdf: async (id: string): Promise<Blob> => {
    const { data } = await api.get(`/api/v1/pax/ads/${id}/pdf`, { responseType: 'blob' })
    return data
  },

  listAdsPax: async (adsId: string): Promise<AdsPax[]> => {
    const { data } = await api.get(`/api/v1/pax/ads/${adsId}/pax`)
    return data
  },

  decideAdsPax: async (adsId: string, entryId: string, body: AdsPaxDecision): Promise<Ads> => {
    const { data } = await api.post(`/api/v1/pax/ads/${adsId}/pax/${entryId}/decision`, body)
    return data
  },

  addPaxToAds: async (adsId: string, paxId: string): Promise<AdsPax> => {
    const { data } = await api.post(`/api/v1/pax/ads/${adsId}/pax/${paxId}`)
    return data
  },

  /** Add a PAX by user_id or contact_id (auto-creates PaxProfile if needed) */
  addPaxToAdsV2: async (adsId: string, body: AddPaxBody) => {
    const { data } = await api.post(`/api/v1/pax/ads/${adsId}/add-pax`, body)
    return data as { status: string; user_id: string | null; contact_id: string | null; name: string; auto_created: boolean }
  },

  removePaxFromAds: async (adsId: string, entryId: string): Promise<void> => {
    await api.delete(`/api/v1/pax/ads/${adsId}/pax/${entryId}`)
  },

  /** Search PAX candidates: existing profiles + users + contacts */
  searchPaxCandidates: async (search: string): Promise<PaxCandidate[]> => {
    const { data } = await api.get('/api/v1/pax/candidates', { params: { search } })
    return data
  },

  // ── AdS Imputations ──

  getAdsImputations: async (adsId: string): Promise<AdsImputation[]> => {
    const { data } = await api.get(`/api/v1/pax/ads/${adsId}/imputations`)
    return data
  },

  getAdsImputationSuggestion: async (adsId: string): Promise<AdsImputationSuggestion> => {
    const { data } = await api.get(`/api/v1/pax/ads/${adsId}/imputation-suggestion`)
    return data
  },

  addImputation: async (adsId: string, payload: AdsImputationCreate): Promise<AdsImputation> => {
    const { data } = await api.post(`/api/v1/pax/ads/${adsId}/imputations`, payload)
    return data
  },

  deleteImputation: async (adsId: string, imputationId: string): Promise<void> => {
    await api.delete(`/api/v1/pax/ads/${adsId}/imputations/${imputationId}`)
  },

  // ── AdS External Links ──

  createExternalLink: async (adsId: string, payload: AdsExternalLinkCreate): Promise<AdsExternalLink> => {
    const { data } = await api.post(`/api/v1/pax/ads/${adsId}/external-link`, payload)
    return data
  },

  listExternalLinks: async (adsId: string): Promise<AdsExternalLinkSecurity[]> => {
    const { data } = await api.get(`/api/v1/pax/ads/${adsId}/external-links`)
    return data
  },

  resolveExternalLinkUrl: (link: AdsExternalLink): string => {
    if (/^https?:\/\//i.test(link.url)) return link.url
    if (link.url && !link.url.startsWith('/api/')) {
      return new URL(link.url, window.location.origin).toString()
    }
    return `${buildExternalPortalBase()}/?token=${encodeURIComponent(link.token)}`
  },

  // ── PAX Incidents / Signalements ──

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

  // ── Rotation Cycles ──

  listRotationCycles: async (params: RotationCycleListParams = {}): Promise<PaginatedResponse<RotationCycle>> => {
    const { data } = await api.get('/api/v1/pax/rotation-cycles', { params })
    return data
  },

  createRotationCycle: async (payload: RotationCycleCreate): Promise<RotationCycle> => {
    const { data } = await api.post('/api/v1/pax/rotation-cycles', payload)
    return data
  },

  updateRotationCycle: async (id: string, payload: RotationCycleUpdate): Promise<RotationCycle> => {
    const { data } = await api.patch(`/api/v1/pax/rotation-cycles/${id}`, payload)
    return data
  },

  endRotationCycle: async (id: string): Promise<RotationCycle> => {
    const { data } = await api.post(`/api/v1/pax/rotation-cycles/${id}/end`)
    return data
  },

  // ── Stay Programs ──

  listStayPrograms: async (params: StayProgramListParams = {}): Promise<StayProgram[]> => {
    const { data } = await api.get('/api/v1/pax/stay-programs', { params })
    return data
  },

  createStayProgram: async (payload: StayProgramCreate): Promise<StayProgram> => {
    const { data } = await api.post('/api/v1/pax/stay-programs', payload)
    return data
  },

  submitStayProgram: async (id: string): Promise<StayProgram> => {
    const { data } = await api.post(`/api/v1/pax/stay-programs/${id}/submit`)
    return data
  },

  approveStayProgram: async (id: string): Promise<StayProgram> => {
    const { data } = await api.post(`/api/v1/pax/stay-programs/${id}/approve`)
    return data
  },

  // ── Profile Types ──

  listProfileTypes: async (): Promise<ProfileType[]> => {
    const { data } = await api.get('/api/v1/pax/profile-types')
    return data
  },

  createProfileType: async (payload: ProfileTypeCreate): Promise<ProfileType> => {
    const { data } = await api.post('/api/v1/pax/profile-types', payload)
    return data
  },

  getPaxProfileTypes: async (paxId: string): Promise<PaxProfileType[]> => {
    const { data } = await api.get(`/api/v1/pax/profiles/${paxId}/profile-types`)
    return data
  },

  assignProfileType: async (paxId: string, profileTypeId: string): Promise<PaxProfileType> => {
    const { data } = await api.post(`/api/v1/pax/profiles/${paxId}/profile-types/${profileTypeId}`)
    return data
  },

  getHabilitationMatrix: async (profileTypeId?: string): Promise<HabilitationMatrixEntry[]> => {
    const { data } = await api.get('/api/v1/pax/habilitation-matrix', { params: profileTypeId ? { profile_type_id: profileTypeId } : {} })
    return data
  },

  // ── Avis de Mission (AVM) ──

  listAvm: async (params: AvmListParams = {}): Promise<PaginatedResponse<MissionNoticeSummary>> => {
    const { data } = await api.get('/api/v1/pax/avm', { params })
    return data
  },

  getAvm: async (id: string): Promise<MissionNoticeRead> => {
    const { data } = await api.get(`/api/v1/pax/avm/${id}`)
    return data
  },

  createAvm: async (payload: MissionNoticeCreate): Promise<MissionNoticeRead> => {
    const { data } = await api.post('/api/v1/pax/avm', payload)
    return data
  },

  updateAvm: async (id: string, payload: MissionNoticeUpdate): Promise<MissionNoticeRead> => {
    const { data } = await api.put(`/api/v1/pax/avm/${id}`, payload)
    return data
  },

  modifyAvm: async (id: string, payload: MissionNoticeModifyRequest): Promise<MissionNoticeRead> => {
    const { data } = await api.post(`/api/v1/pax/avm/${id}/modify`, payload)
    return data
  },

  submitAvm: async (id: string): Promise<Record<string, unknown>> => {
    const { data } = await api.post(`/api/v1/pax/avm/${id}/submit`)
    return data
  },

  approveAvm: async (id: string): Promise<Record<string, unknown>> => {
    const { data } = await api.post(`/api/v1/pax/avm/${id}/approve`)
    return data
  },

  completeAvm: async (id: string): Promise<Record<string, unknown>> => {
    const { data } = await api.post(`/api/v1/pax/avm/${id}/complete`)
    return data
  },

  cancelAvm: async (id: string, reason?: string): Promise<MissionNoticeRead> => {
    const { data } = await api.post(`/api/v1/pax/avm/${id}/cancel`, null, { params: reason ? { reason } : {} })
    return data
  },

  updateAvmPreparationTask: async (avmId: string, taskId: string, payload: MissionPreparationTaskUpdate): Promise<MissionPreparationTaskRead> => {
    const { data } = await api.patch(`/api/v1/pax/avm/${avmId}/preparation-tasks/${taskId}`, payload)
    return data
  },
  updateAvmVisaFollowup: async (avmId: string, followupId: string, payload: MissionVisaFollowupUpdate): Promise<MissionVisaFollowupRead> => {
    const { data } = await api.patch(`/api/v1/pax/avm/${avmId}/visa-followups/${followupId}`, payload)
    return data
  },
  updateAvmAllowanceRequest: async (avmId: string, requestId: string, payload: MissionAllowanceRequestUpdate): Promise<MissionAllowanceRequestRead> => {
    const { data } = await api.patch(`/api/v1/pax/avm/${avmId}/allowance-requests/${requestId}`, payload)
    return data
  },
}
