/**
 * Shared API types matching backend schemas.
 */

// ── Pagination ──────────────────────────────────────────────
export interface PaginatedResponse<T> {
  items: T[]
  total: number
  page: number
  page_size: number
  pages: number
}

export interface PaginationParams {
  page?: number
  page_size?: number
}

// ── Assets ──────────────────────────────────────────────────
export interface Asset {
  id: string
  entity_id: string
  site_id: string
  code: string
  name: string
  installation_type: string
  environment: string
  status: string
  latitude?: number | null
  longitude?: number | null
  water_depth_m?: number | null
  is_manned: boolean
  pob_capacity?: number | null
  design_life_years?: number | null
  notes?: string | null
  created_at: string
  updated_at: string
}

export interface AssetTreeNode {
  id: string
  code: string
  name: string
  type: string
  status: string
  children: AssetTreeNode[]
}

// ── Tiers (Companies) ────────────────────────────────────────
export interface Tier {
  id: string
  entity_id: string
  code: string
  name: string
  alias: string | null
  trade_name: string | null
  logo_url: string | null
  type: string | null
  website: string | null
  // Legacy convenience fields (prefer polymorphic phones/emails)
  phone: string | null
  fax: string | null
  email: string | null
  // Corporate
  legal_form: string | null
  registration_number: string | null
  tax_id: string | null
  vat_number: string | null
  capital: number | null
  currency: string
  fiscal_year_start: number
  industry: string | null
  founded_date: string | null
  payment_terms: string | null
  description: string | null
  address_line1: string | null
  address_line2: string | null
  city: string | null
  state: string | null
  zip_code: string | null
  country: string | null
  timezone: string
  language: string
  social_networks: Record<string, unknown> | null
  opening_hours: Record<string, unknown> | null
  notes: string | null
  active: boolean
  archived: boolean
  is_blocked: boolean
  contact_count: number
  created_at: string
}

export interface TierCreate {
  // Note: code is auto-generated server-side via the TIR numbering pattern.
  name: string
  alias?: string | null
  trade_name?: string | null
  logo_url?: string | null
  type?: string | null
  website?: string | null
  phone?: string | null
  fax?: string | null
  email?: string | null
  legal_form?: string | null
  registration_number?: string | null
  tax_id?: string | null
  vat_number?: string | null
  capital?: number | null
  currency?: string
  fiscal_year_start?: number
  industry?: string | null
  founded_date?: string | null
  payment_terms?: string | null
  description?: string | null
  address_line1?: string | null
  address_line2?: string | null
  city?: string | null
  state?: string | null
  zip_code?: string | null
  country?: string | null
  timezone?: string
  language?: string
  social_networks?: Record<string, unknown> | null
  opening_hours?: Record<string, unknown> | null
  notes?: string | null
}

// ── Tier Contacts (Employees) ────────────────────────────────
export interface TierContact {
  id: string
  tier_id: string
  civility: string | null
  first_name: string
  last_name: string
  email: string | null
  phone: string | null
  position: string | null
  department: string | null
  job_position_id: string | null
  photo_url: string | null
  is_primary: boolean
  active: boolean
  linked_user_id: string | null
  linked_user_email: string | null
  linked_user_active: boolean | null
  created_at: string
}

/** Contact enriched with parent tier info — for global contacts listing. */
export interface TierContactWithTier extends TierContact {
  tier_name: string
  tier_code: string
}

export interface TierContactCreate {
  civility?: string | null
  first_name: string
  last_name: string
  email?: string | null
  phone?: string | null
  position?: string | null
  department?: string | null
  photo_url?: string | null
  is_primary?: boolean
}

export interface TierContactUpdate {
  civility?: string | null
  first_name?: string
  last_name?: string
  email?: string | null
  phone?: string | null
  position?: string | null
  department?: string | null
  photo_url?: string | null
  is_primary?: boolean
  active?: boolean
}

export interface TierContactPromoteUserRequest {
  role?: string
  language?: string
  send_invitation?: boolean
}

// ── Legal Identifiers (polymorphic) ──────────────────────────
export interface LegalIdentifier {
  id: string
  owner_type: string
  owner_id: string
  type: string
  value: string
  country: string | null
  issued_at: string | null
  expires_at: string | null
  created_at: string
}

export interface LegalIdentifierCreate {
  type: string
  value: string
  country?: string | null
  issued_at?: string | null
  expires_at?: string | null
}

export interface LegalIdentifierUpdate {
  type?: string
  value?: string
  country?: string | null
  issued_at?: string | null
  expires_at?: string | null
}

// ── Tier Blocks (Blocking/Unblocking) ───────────────────────
export interface TierBlock {
  id: string
  entity_id: string
  tier_id: string
  action: string
  reason: string
  block_type: string
  start_date: string | null
  end_date: string | null
  performed_by: string
  active: boolean
  created_at: string
  performer_name: string | null
}

export interface TierBlockCreate {
  reason: string
  block_type?: string
  start_date?: string | null
  end_date?: string | null
}

// ── External References ─────────────────────────────────────
export interface ExternalReference {
  id: string
  owner_type: string
  owner_id: string
  system: string
  code: string
  label: string | null
  url: string | null
  notes: string | null
  created_by: string | null
  created_at: string
}

export interface ExternalReferenceCreate {
  system: string
  code: string
  label?: string | null
  url?: string | null
  notes?: string | null
}

// ── SAP Import Result ───────────────────────────────────────
export interface SapImportResult {
  created: number
  updated: number
  skipped: number
  blocked: number
  errors: string[]
}

// ── Users ───────────────────────────────────────────────────
export interface UserRead {
  id: string
  email: string
  first_name: string
  last_name: string
  active: boolean
  default_entity_id: string | null
  tier_contact_id: string | null
  intranet_id: string | null
  language: string
  avatar_url: string | null
  // Auth & security
  auth_type: string
  mfa_enabled: boolean
  failed_login_count: number
  locked_until: string | null
  last_login_ip: string | null
  account_expires_at: string | null
  password_changed_at: string | null
  // HR Identity
  passport_name: string | null
  gender: string | null
  nationality: string | null
  birth_country: string | null
  birth_date: string | null
  birth_city: string | null
  // Identity verification
  identity_verified: boolean
  identity_verified_by: string | null
  identity_verified_at: string | null
  // Business unit
  business_unit_id: string | null
  business_unit_name: string | null
  // Travel
  contractual_airport: string | null
  nearest_airport: string | null
  nearest_station: string | null
  loyalty_program: string | null
  // Health / Medical
  last_medical_check: string | null
  last_international_medical_check: string | null
  last_subsidiary_medical_check: string | null
  // Body measurements / Mensurations
  height: number | null
  weight: number | null
  ppe_clothing_size: string | null
  ppe_clothing_size_bottom: string | null
  ppe_shoe_size: string | null
  // Misc / HR
  retirement_date: string | null
  vantage_number: string | null
  extension_number: string | null
  // Classification
  user_type: string
  // Job position (conformité)
  job_position_id: string | null
  job_position_name: string | null
  // Messaging preference
  preferred_messaging_channel: string
  // Timestamps
  last_login_at: string | null
  created_at: string
  updated_at: string | null
}

export interface UserBrief {
  id: string
  first_name: string
  last_name: string
  email: string
  avatar_url: string | null
}

export interface UserDelegation {
  id: string
  delegator_id: string
  delegate_id: string
  entity_id: string
  permissions: string[]
  start_date: string
  end_date: string
  active: boolean
  reason: string | null
  delegator: UserBrief | null
  delegate: UserBrief | null
}

export interface UserDelegationCreate {
  delegate_id: string
  start_date: string
  end_date: string
  reason?: string | null
  scope_type?: 'all' | 'role' | 'permissions'
  role_code?: string | null
  permission_codes?: string[]
}

export interface UserDelegationUpdate {
  start_date?: string
  end_date?: string
  reason?: string | null
  active?: boolean
}

export interface ActingContext {
  key: string
  mode: 'own' | 'delegate' | 'simulate'
  label: string
  target_user_id?: string | null
  target_user?: UserBrief | null
  cumulative: boolean
  permission_count?: number | null
}

export interface ActingContextStatus {
  key: string
  mode: 'own' | 'delegate' | 'simulate'
  cumulative: boolean
  target_user_id?: string | null
  target_user?: UserBrief | null
  permission_count: number
}

export interface UserCreate {
  email: string
  first_name: string
  last_name: string
  password?: string | null
  default_entity_id?: string | null
  intranet_id?: string | null
  language?: string
  user_type?: string
  // HR Identity (optional at creation)
  passport_name?: string | null
  gender?: string | null
  nationality?: string | null
  birth_country?: string | null
  birth_date?: string | null
  birth_city?: string | null
  job_position_id?: string | null
}

export interface UserUpdate extends Partial<UserCreate> {
  active?: boolean
  account_expires_at?: string | null
  failed_login_count?: number
  locked_until?: string | null
  // Travel
  contractual_airport?: string | null
  nearest_airport?: string | null
  nearest_station?: string | null
  loyalty_program?: string | null
  // Health / Medical
  last_medical_check?: string | null
  last_international_medical_check?: string | null
  last_subsidiary_medical_check?: string | null
  // Body measurements / Mensurations
  height?: number | null
  weight?: number | null
  ppe_clothing_size?: string | null
  ppe_clothing_size_bottom?: string | null
  ppe_shoe_size?: string | null
  // Misc / HR
  retirement_date?: string | null
  vantage_number?: string | null
  extension_number?: string | null
}

export interface UserTierLinkRead {
  id: string
  tier_id: string
  tier_code: string
  tier_name: string
  tier_type: string | null
  role: string
  created_at: string | null
}

export interface UserHealthConditionRead {
  id: string
  user_id: string
  condition_code: string
  notes: string | null
  created_at: string
  updated_at: string
}

// ── User Sub-Models ─────────────────────────────────────────
export interface UserPassportRead {
  id: string
  user_id: string
  passport_type: string | null
  number: string
  country: string
  passport_name: string | null
  issue_date: string | null
  expiry_date: string | null
  document_url: string | null
  created_at: string
  updated_at: string
}
export interface UserPassportCreate {
  passport_type?: string | null
  number: string
  country: string
  passport_name?: string | null
  issue_date?: string | null
  expiry_date?: string | null
  document_url?: string | null
}

export interface UserVisaRead {
  id: string
  user_id: string
  visa_type: string
  number: string | null
  country: string
  issue_date: string | null
  expiry_date: string | null
  document_url: string | null
  created_at: string
  updated_at: string
}
export interface UserVisaCreate {
  visa_type: string
  country: string
  number?: string | null
  issue_date?: string | null
  expiry_date?: string | null
  document_url?: string | null
}

export interface EmergencyContactRead {
  id: string
  user_id: string
  relationship_type: string
  name: string
  phone_number: string | null
  email: string | null
  created_at: string
  updated_at: string
}
export interface EmergencyContactCreate {
  relationship_type: string
  name: string
  phone_number?: string | null
  email?: string | null
}

export interface SocialSecurityRead {
  id: string
  user_id: string
  country: string
  number: string
  created_at: string
  updated_at: string
}
export interface SocialSecurityCreate {
  country: string
  number: string
}

export interface UserVaccineRead {
  id: string
  user_id: string
  vaccine_type: string
  date_administered: string | null
  expiry_date: string | null
  batch_number: string | null
  created_at: string
  updated_at: string
}
export interface UserVaccineCreate {
  vaccine_type: string
  date_administered?: string | null
  expiry_date?: string | null
  batch_number?: string | null
}

export interface UserLanguageRead {
  id: string
  user_id: string
  language_code: string
  proficiency_level: string | null
  created_at: string
  updated_at: string
}
export interface UserLanguageCreate {
  language_code: string
  proficiency_level?: string | null
}

export interface DrivingLicenseRead {
  id: string
  user_id: string
  license_type: string
  country: string
  expiry_date: string | null
  document_url: string | null
  created_at: string
  updated_at: string
}
export interface DrivingLicenseCreate {
  license_type: string
  country: string
  expiry_date?: string | null
  document_url?: string | null
}

// ── Medical Checks (polymorphic) ──────────────────────────
export interface MedicalCheckRead {
  id: string
  owner_type: string
  owner_id: string
  check_type: string
  check_date: string
  expiry_date: string | null
  provider: string | null
  notes: string | null
  document_url: string | null
  created_at: string
  updated_at: string
}
export interface MedicalCheckCreate {
  check_type: string
  check_date: string
  expiry_date?: string | null
  provider?: string | null
  notes?: string | null
  document_url?: string | null
}
// ── User SSO Providers ────────────────────────────────────
export interface UserSSOProviderRead {
  id: string
  user_id: string
  provider: string
  sso_subject: string
  email: string | null
  display_name: string | null
  linked_at: string
  last_used_at: string | null
  created_at: string
  updated_at: string
}
export interface UserSSOProviderCreate {
  provider: string
  sso_subject: string
  email?: string | null
  display_name?: string | null
}

// ── User Entities ─────────────────────────────────────────
export interface UserEntityGroup {
  group_id: string
  group_name: string
  role_codes: string[]
  role_names: string[]
}

export interface UserEntity {
  entity_id: string
  entity_code: string
  entity_name: string
  groups: UserEntityGroup[]
}

// ── Dashboard Stats ─────────────────────────────────────────
export interface DashboardStats {
  assets_count: number
  users_count: number
  tiers_count: number
  active_workflows: number
  recent_activity_count: number
}

// ── Profile ────────────────────────────────────────────────
export interface ProfileUpdate {
  first_name?: string
  last_name?: string
  language?: string
  // HR Identity (self-service)
  passport_name?: string | null
  gender?: string | null
  nationality?: string | null
  birth_country?: string | null
  birth_date?: string | null
  birth_city?: string | null
  // Travel
  contractual_airport?: string | null
  nearest_airport?: string | null
  nearest_station?: string | null
  loyalty_program?: string | null
  // Health / Medical
  last_medical_check?: string | null
  last_international_medical_check?: string | null
  last_subsidiary_medical_check?: string | null
  // Body measurements / PPE
  height?: number | null
  weight?: number | null
  ppe_clothing_size?: string | null
  ppe_clothing_size_bottom?: string | null
  ppe_shoe_size?: string | null
  // Misc
  retirement_date?: string | null
  vantage_number?: string | null
  extension_number?: string | null
  // Job position (conformité)
  job_position_id?: string | null
  // Messaging preference
  preferred_messaging_channel?: string
}

export interface ChangePasswordRequest {
  current_password: string
  new_password: string
}

// ── Personal Access Tokens ─────────────────────────────────
export interface AccessToken {
  id: string
  name: string
  token_prefix: string
  scopes: string[]
  expires_at: string | null
  last_used_at: string | null
  revoked: boolean
  created_at: string
}

export interface AccessTokenCreate {
  name: string
  scopes: string[]
  expires_at?: string | null
}

/** Returned only at creation — includes the full token value (shown once). */
export interface AccessTokenCreated {
  id: string
  name: string
  token: string
  scopes: string[]
  expires_at: string | null
  created_at: string
}

// ── Sessions ───────────────────────────────────────────────
export interface UserSession {
  id: string
  ip_address: string | null
  browser: string | null
  os: string | null
  device_type: 'desktop' | 'mobile' | 'tablet'
  last_active_at: string
  created_at: string
  is_current: boolean
}

// ── User Emails ────────────────────────────────────────────
export interface UserEmail {
  id: string
  email: string
  is_primary: boolean
  is_notification: boolean
  verified: boolean
  verified_at: string | null
  created_at: string
}

// ── OAuth Applications ─────────────────────────────────────
export interface OAuthApp {
  id: string
  name: string
  client_id: string
  redirect_uris: string[]
  scopes: string[]
  confidential: boolean
  active: boolean
  created_at: string
}

export interface OAuthAppCreate {
  name: string
  redirect_uris: string[]
  scopes: string[]
  confidential: boolean
}

/** Returned only at creation — includes the client secret (shown once). */
export interface OAuthAppCreated {
  id: string
  name: string
  client_id: string
  client_secret: string | null
  redirect_uris: string[]
  scopes: string[]
  confidential: boolean
}

export interface OAuthAuthorization {
  id: string
  application: OAuthApp
  scopes: string[]
  created_at: string
}

// ── Addresses (polymorphic — linked to any object) ────────
export interface Address {
  id: string
  owner_type: string
  owner_id: string
  label: string
  address_line1: string
  address_line2: string | null
  city: string
  state_province: string | null
  postal_code: string | null
  country: string
  latitude: number | null
  longitude: number | null
  is_default: boolean
  created_at: string
}

export interface AddressCreate {
  owner_type: string
  owner_id: string
  label: string
  address_line1: string
  address_line2?: string | null
  city: string
  state_province?: string | null
  postal_code?: string | null
  country: string
  latitude?: number | null
  longitude?: number | null
  is_default?: boolean
}

export type AddressUpdate = Partial<Omit<AddressCreate, 'owner_type' | 'owner_id'>>

// ── Notification Preferences ───────────────────────────────
export interface NotificationPreference {
  global_level: string
  notification_email_id: string | null
  notify_own_actions: boolean
  group_overrides: Record<string, { level: string; email_id?: string }> | null
}

export type NotificationPreferenceUpdate = Partial<NotificationPreference>

// ── Audit Log ──────────────────────────────────────────────
export interface AuditLogEntry {
  id: string
  user_id: string | null
  action: string
  resource_type: string
  resource_id: string | null
  details: Record<string, unknown> | null
  ip_address: string | null
  created_at: string
}

// ── Roles & Permissions ────────────────────────────────────
export interface RoleRead {
  code: string
  name: string
  description: string | null
  module: string | null
}

export interface UserGroupRead {
  id: string
  name: string
  role_codes: string[]
  member_count: number
}

export interface PermissionMatrix {
  module: string
  permissions: string[]
}

// ── MFA ──────────────────────────────────────────────────
export interface MFASetupResponse {
  secret: string
  provisioning_uri: string
}

export interface MFABackupCodesResponse {
  backup_codes: string[]
}

export interface MFAStatus {
  mfa_enabled: boolean
  has_totp: boolean
}

// ── Tags (polymorphic — linked to any object) ─────────────
export interface Tag {
  id: string
  owner_type: string
  owner_id: string
  name: string
  color: string
  visibility: 'public' | 'private'
  created_by: string
  parent_id: string | null
  created_at: string
}

export interface TagTree extends Tag {
  children: TagTree[]
}

export interface TagCreate {
  owner_type: string
  owner_id: string
  name: string
  color?: string
  visibility?: 'public' | 'private'
  parent_id?: string | null
}

export type TagUpdate = Partial<Omit<TagCreate, 'owner_type' | 'owner_id'>>

// ── Phones (polymorphic — linked to any object) ───────────
export interface Phone {
  id: string
  owner_type: string
  owner_id: string
  label: string
  number: string
  country_code: string | null
  is_default: boolean
  verified: boolean
  verified_at: string | null
  created_at: string
}

export interface PhoneCreate {
  owner_type: string
  owner_id: string
  label?: string
  number: string
  country_code?: string | null
  is_default?: boolean
}

export type PhoneUpdate = Partial<Omit<PhoneCreate, 'owner_type' | 'owner_id'>>

// ── Contact Emails (polymorphic — linked to any object) ───
export interface ContactEmail {
  id: string
  owner_type: string
  owner_id: string
  label: string
  email: string
  is_default: boolean
  verified: boolean
  verified_at: string | null
  created_at: string
}

export interface ContactEmailCreate {
  owner_type: string
  owner_id: string
  label?: string
  email: string
  is_default?: boolean
}

export type ContactEmailUpdate = Partial<Omit<ContactEmailCreate, 'owner_type' | 'owner_id'>>

// ── Notes (polymorphic — linked to any object) ────────────
export interface Note {
  id: string
  owner_type: string
  owner_id: string
  content: string
  visibility: 'public' | 'private'
  pinned: boolean
  created_by: string
  created_at: string
  updated_at: string
  author_name: string | null
}

export interface NoteCreate {
  owner_type: string
  owner_id: string
  content: string
  visibility?: 'public' | 'private'
  pinned?: boolean
}

export type NoteUpdate = Partial<Omit<NoteCreate, 'owner_type' | 'owner_id'>>

// ── Attachments (polymorphic — files linked to any object) ─
export interface FileAttachment {
  id: string
  owner_type: string
  owner_id: string
  filename: string
  original_name: string
  content_type: string
  size_bytes: number
  description: string | null
  /** Optional typed category (driven by per-module dictionary, e.g. `moc_attachment_type`). */
  category: string | null
  uploaded_by: string
  created_at: string
}

// ── Settings ──────────────────────────────────────────────
export interface SettingRead {
  key: string
  value: Record<string, unknown>
  scope: string
  scope_id: string | null
}

// ── Search ───────────────────────────────────────────────
export interface SearchResult {
  type: string
  id: string
  title: string
  subtitle: string | null
  url: string
}

export interface SearchResponse {
  results: SearchResult[]
}

// ── Compliance / Conformite ──────────────────────────────────

export interface ComplianceType {
  id: string
  entity_id: string
  category: 'formation' | 'certification' | 'habilitation' | 'audit' | 'medical'
  code: string
  name: string
  description: string | null
  validity_days: number | null
  is_mandatory: boolean
  active: boolean
  compliance_source: 'opsflux' | 'external' | 'both'
  external_provider: string | null
  external_mapping: Record<string, string> | null
  created_at: string
}

export interface ComplianceTypeCreate {
  category: string
  code?: string
  name: string
  description?: string | null
  validity_days?: number | null
  is_mandatory?: boolean
  compliance_source?: string
  external_provider?: string | null
  external_mapping?: Record<string, string> | null
}

export interface ComplianceTypeUpdate {
  category?: string
  code?: string
  name?: string
  description?: string | null
  validity_days?: number | null
  is_mandatory?: boolean
  active?: boolean
  compliance_source?: string
  external_provider?: string | null
  external_mapping?: Record<string, string> | null
}

export interface ComplianceRule {
  id: string
  entity_id: string
  compliance_type_id: string
  target_type: string
  target_value: string | null
  description: string | null
  active: boolean
  // V2 fields
  version: number
  effective_from: string | null
  effective_to: string | null
  priority: string
  applicability: string  // permanent | contextual
  override_validity_days: number | null
  grace_period_days: number | null
  renewal_reminder_days: number | null
  condition_json: Record<string, unknown> | null
  change_reason: string | null
  changed_by: string | null
  created_at: string
}

export interface ComplianceRuleCreate {
  compliance_type_id: string
  target_type: string
  target_value?: string | null
  description?: string | null
  // V2 optional fields
  effective_from?: string | null
  effective_to?: string | null
  priority?: string
  applicability?: string  // permanent | contextual
  override_validity_days?: number | null
  grace_period_days?: number | null
  renewal_reminder_days?: number | null
  condition_json?: Record<string, unknown> | null
}

export interface ComplianceRuleUpdate {
  target_type?: string | null
  target_value?: string | null
  description?: string | null
  active?: boolean | null
  effective_from?: string | null
  effective_to?: string | null
  priority?: string | null
  applicability?: string | null  // permanent | contextual
  override_validity_days?: number | null
  grace_period_days?: number | null
  renewal_reminder_days?: number | null
  condition_json?: Record<string, unknown> | null
  change_reason?: string | null
}

export interface ComplianceRuleHistory {
  id: string
  rule_id: string
  version: number
  action: string
  snapshot: Record<string, unknown>
  change_reason: string | null
  changed_by: string | null
  changed_at: string
}

export interface ComplianceRecord {
  id: string
  entity_id: string
  compliance_type_id: string
  owner_type: string
  owner_id: string
  status: 'valid' | 'expired' | 'pending' | 'rejected'
  issued_at: string | null
  expires_at: string | null
  issuer: string | null
  reference_number: string | null
  notes: string | null
  verified_by: string | null
  created_by: string
  active: boolean
  created_at: string
  type_name?: string | null
  type_category?: string | null
  attachment_count?: number
}

export interface ComplianceRecordCreate {
  compliance_type_id: string
  owner_type: string
  owner_id: string
  status?: string
  issued_at?: string | null
  expires_at?: string | null
  issuer?: string | null
  reference_number?: string | null
  notes?: string | null
}

export interface ComplianceRecordUpdate {
  status?: string
  issued_at?: string | null
  expires_at?: string | null
  issuer?: string | null
  reference_number?: string | null
  notes?: string | null
}

export interface ComplianceCheckResult {
  owner_type: string
  owner_id: string
  account_verified: boolean
  total_required: number
  total_valid: number
  total_expired: number
  total_missing: number
  total_unverified: number
  is_compliant: boolean
  details: Record<string, unknown>[]
}

// ── Compliance Exemptions ────────────────────────────────────

export interface ComplianceExemption {
  id: string
  entity_id: string
  compliance_record_id: string
  reason: string
  approved_by: string | null
  status: 'pending' | 'approved' | 'rejected' | 'expired'
  start_date: string
  end_date: string
  conditions: string | null
  rejection_reason: string | null
  created_by: string
  active: boolean
  created_at: string
  updated_at: string
  record_type_name?: string | null
  record_type_category?: string | null
  owner_name?: string | null
  approver_name?: string | null
  creator_name?: string | null
}

export interface ComplianceExemptionCreate {
  compliance_record_id: string
  reason: string
  start_date: string
  end_date: string
  conditions?: string | null
}

export interface ComplianceExemptionUpdate {
  status?: string
  conditions?: string | null
  end_date?: string | null
}

// ── Job Positions / Fiches de Poste ──────────────────────────

export interface JobPosition {
  id: string
  entity_id: string
  code: string
  name: string
  description: string | null
  department: string | null
  active: boolean
  created_at: string
}

export interface JobPositionCreate {
  code?: string
  name: string
  description?: string | null
  department?: string | null
}

export interface JobPositionUpdate {
  code?: string
  name?: string
  description?: string | null
  department?: string | null
  active?: boolean
}

// ── Employee Transfers ──────────────────────────────────────

export interface TierContactTransfer {
  id: string
  contact_id: string
  from_tier_id: string
  to_tier_id: string
  transfer_date: string
  reason: string | null
  transferred_by: string
  created_at: string
  contact_name?: string | null
  from_tier_name?: string | null
  to_tier_name?: string | null
}

export interface TierContactTransferCreate {
  contact_id: string
  from_tier_id: string
  to_tier_id: string
  transfer_date: string
  reason?: string | null
}

// ── Projects / Projets ───────────────────────────────────────

export interface Project {
  id: string
  entity_id: string
  code: string
  name: string
  description: string | null
  status: 'draft' | 'planned' | 'active' | 'on_hold' | 'completed' | 'cancelled'
  priority: 'low' | 'medium' | 'high' | 'critical'
  weather: 'sunny' | 'cloudy' | 'rainy' | 'stormy'
  progress: number
  start_date: string | null
  end_date: string | null
  actual_end_date: string | null
  budget: number | null
  currency: string
  manager_id: string | null
  parent_id: string | null
  tier_id: string | null
  asset_id: string | null
  external_ref: string | null  // e.g. "gouti:<id>" for imported projects
  project_type: string  // project, workover, drilling, integrity, maintenance, inspection, event
  department_id: string | null
  /** Méthode de pondération pour calculer Project.progress depuis les tâches.
   *  null → utilise le défaut admin (`projets.default_progress_weight_method`),
   *  puis 'equal' en dernier recours. Voir _resolve_project_progress_method() backend. */
  progress_weight_method?: ProgressWeightMethod | null
  active: boolean
  archived: boolean
  created_at: string
  manager_name?: string | null
  tier_name?: string | null
  parent_name?: string | null
  asset_name?: string | null
  task_count?: number
  member_count?: number
  children_count?: number
}

export type ProgressWeightMethod = 'equal' | 'effort' | 'duration' | 'manual'

/** UI-friendly metadata for each weighting method. Reused by the
 *  CreateProjectPanel picker, the ProjectDetailPanel inline edit and the
 *  admin default setting tab. Single source of truth for labels +
 *  descriptions so the wording stays consistent across the app. */
export const PROGRESS_WEIGHT_METHOD_OPTIONS: { value: ProgressWeightMethod; label: string; description: string }[] = [
  {
    value: 'equal',
    label: 'Égale',
    description:
      'Toutes les tâches comptent pour autant. Moyenne arithmétique simple. Adapté quand les tâches sont homogènes en taille.',
  },
  {
    value: 'effort',
    label: 'Par effort estimé',
    description:
      "Pondération par les heures estimées de chaque tâche. Le standard pragmatique : une tâche estimée à 100h pèse 100× plus qu'une tâche estimée à 1h. Tâches sans estimation : retombent en mode égal.",
  },
  {
    value: 'duration',
    label: 'Par durée',
    description:
      'Pondération par la durée prévue de chaque tâche (date de fin − date de début). Utile quand les heures estimées ne sont pas saisies mais les dates le sont.',
  },
  {
    value: 'manual',
    label: 'Manuelle',
    description:
      'Pondération par un champ "poids" saisi à la main sur chaque tâche. Donne le contrôle total au chef de projet pour gérer les jalons et tâches non standard.',
  },
]

export interface ProjectCreate {
  code?: string
  name: string
  description?: string | null
  status?: string
  priority?: string
  weather?: string
  start_date?: string | null
  end_date?: string | null
  budget?: number | null
  currency?: string
  manager_id?: string | null
  parent_id?: string | null
  tier_id?: string | null
  // Spec §1.4: site/installation rattachement obligatoire pour création
  // native (Gouti import contourne ce schema).
  asset_id: string
  // Optionnel : laisser vide pour utiliser le défaut admin.
  progress_weight_method?: ProgressWeightMethod | null
  // Client-generated UUID used during create to stage polymorphic children
  // (attachments, notes, tags…) before the project row exists. Backend
  // re-targets rows with owner_type='project_staging' on successful create.
  staging_ref?: string | null
  // Optional seed tasks created alongside the project in the same transaction.
  initial_tasks?: ProjectInitialTask[]
}

export interface ProjectInitialTask {
  title: string
  priority?: 'low' | 'medium' | 'high' | 'critical'
  start_date?: string | null
  due_date?: string | null
  is_milestone?: boolean
  estimated_hours?: number | null
  /** 0-based index into the same initial_tasks list. Creates a
   *  ProjectTaskDependency from that task to this one at save time. */
  predecessor_index?: number | null
  dependency_type?: 'finish_to_start' | 'start_to_start' | 'finish_to_finish' | 'start_to_finish'
  lag_days?: number
}

export interface ProjectUpdate {
  code?: string
  name?: string
  description?: string | null
  status?: string
  priority?: string
  weather?: string
  progress?: number
  start_date?: string | null
  end_date?: string | null
  actual_end_date?: string | null
  budget?: number | null
  currency?: string | null
  manager_id?: string | null
  tier_id?: string | null
  asset_id?: string | null
  progress_weight_method?: ProgressWeightMethod | null
}

export interface ProjectMember {
  id: string
  project_id: string
  user_id: string | null
  contact_id: string | null
  role: string
  active: boolean
  created_at: string
  member_name?: string | null
}

export interface ProjectMemberCreate {
  user_id?: string | null
  contact_id?: string | null
  role?: string
}

export interface ProjectTask {
  id: string
  project_id: string
  parent_id: string | null
  code: string | null
  title: string
  description: string | null
  status: 'todo' | 'in_progress' | 'review' | 'done' | 'cancelled'
  priority: string
  assignee_id: string | null
  progress: number
  start_date: string | null
  due_date: string | null
  completed_at: string | null
  estimated_hours: number | null
  actual_hours: number | null
  /** POB demande for the task — inherited by linked PlannerActivity (spec 1.5 / 2.4). */
  pob_quota: number
  /** Manual weight — only used when the project's progress_weight_method == 'manual'.
   *  Setting this on a task that's a parent has no effect (parent progress is
   *  always derived from its children). */
  weight: number | null
  order: number
  active: boolean
  /** True = jalon (start_date == due_date, pas de sous-tâche). Rendered as a diamond on the Gantt and with a ♦ indicator in task tables. */
  is_milestone: boolean
  created_at: string
  assignee_name?: string | null
}

/** Task with project info — for cross-project spreadsheet view. */
export interface ProjectTaskEnriched extends ProjectTask {
  project_code?: string | null
  project_name?: string | null
}

export interface ProjectTaskCreate {
  parent_id?: string | null
  code?: string | null
  title: string
  description?: string | null
  status?: string
  priority?: string
  assignee_id?: string | null
  start_date?: string | null
  due_date?: string | null
  estimated_hours?: number | null
  pob_quota?: number
  weight?: number | null
  is_milestone?: boolean
}

export interface ProjectTaskUpdate {
  title?: string
  description?: string | null
  status?: string
  priority?: string
  assignee_id?: string | null
  progress?: number
  start_date?: string | null
  due_date?: string | null
  completed_at?: string | null
  estimated_hours?: number | null
  actual_hours?: number | null
  order?: number
  pob_quota?: number
  weight?: number | null
  is_milestone?: boolean
  parent_id?: string | null
}

export interface ProjectMilestone {
  id: string
  project_id: string
  name: string
  description: string | null
  due_date: string | null
  completed_at: string | null
  status: 'pending' | 'completed' | 'overdue'
  active: boolean
  created_at: string
}

export interface ProjectMilestoneCreate {
  name: string
  description?: string | null
  due_date?: string | null
}

export interface ProjectMilestoneUpdate {
  name?: string
  description?: string | null
  due_date?: string | null
  completed_at?: string | null
  status?: string
}

// ── Planning Revisions ──────────────────────────────────────

export interface PlanningRevision {
  id: string
  project_id: string
  revision_number: number
  name: string
  description: string | null
  is_active: boolean
  is_simulation: boolean
  snapshot_data: Record<string, unknown> | null
  created_by: string
  active: boolean
  created_at: string
  creator_name?: string | null
}

export interface PlanningRevisionCreate {
  name: string
  description?: string | null
  is_simulation?: boolean
}

export interface PlanningRevisionUpdate {
  name?: string
  description?: string | null
  is_simulation?: boolean
  is_active?: boolean
}

// ── Task Deliverables ───────────────────────────────────────

export interface TaskDeliverable {
  id: string
  task_id: string
  name: string
  description: string | null
  status: 'pending' | 'in_progress' | 'delivered' | 'accepted' | 'rejected'
  due_date: string | null
  delivered_at: string | null
  accepted_by: string | null
  active: boolean
  created_at: string
}

export interface TaskDeliverableCreate {
  name: string
  description?: string | null
  status?: string
  due_date?: string | null
}

export interface TaskDeliverableUpdate {
  name?: string
  description?: string | null
  status?: string
  due_date?: string | null
  delivered_at?: string | null
  accepted_by?: string | null
}

// ── Task Actions / Checklists ───────────────────────────────

export interface TaskAction {
  id: string
  task_id: string
  title: string
  completed: boolean
  completed_at: string | null
  completed_by: string | null
  order: number
  active: boolean
  created_at: string
}

export interface TaskActionCreate {
  title: string
  completed?: boolean
}

export interface TaskActionUpdate {
  title?: string
  completed?: boolean
  order?: number
}

// ── Project WBS (Work Breakdown Structure) ─────────────────

export interface ProjectWBSNode {
  id: string
  project_id: string
  parent_id: string | null
  code: string
  name: string
  description: string | null
  cost_center_id: string | null
  budget: number | null
  order: number
  active: boolean
  // enriched
  cost_center_name?: string | null
  children_count?: number
  task_count?: number
}

export interface ProjectWBSNodeCreate {
  parent_id?: string | null
  code: string
  name: string
  description?: string | null
  cost_center_id?: string | null
  budget?: number | null
  order?: number
}

export interface ProjectWBSNodeUpdate {
  parent_id?: string | null
  code?: string
  name?: string
  description?: string | null
  cost_center_id?: string | null
  budget?: number | null
  order?: number
}

// ── CPM (Critical Path Method) ──────────────────────────────

export interface CPMTaskInfo {
  id: string
  title: string
  early_start: number
  early_finish: number
  late_start: number
  late_finish: number
  slack: number
  is_critical: boolean
  duration_days: number
}

export interface CPMResult {
  project_duration_days: number
  critical_path_task_ids: string[]
  tasks: CPMTaskInfo[]
  has_cycles: boolean
  warnings: string[]
}

// ── Task Dependencies ───────────────────────────────────────

export type DependencyType = 'finish_to_start' | 'start_to_start' | 'finish_to_finish' | 'start_to_finish'

export interface TaskDependency {
  id: string
  from_task_id: string
  to_task_id: string
  dependency_type: DependencyType
  lag_days: number
  from_task_title?: string | null
  to_task_title?: string | null
}

export interface TaskDependencyCreate {
  from_task_id: string
  to_task_id: string
  dependency_type?: DependencyType
  lag_days?: number
}

// ── Task Change Log ─────────────────────────────────────────

export interface TaskChangeLog {
  id: string
  task_id: string
  change_type: string
  field_name: string
  old_value: string | null
  new_value: string | null
  reason: string | null
  changed_by: string
  created_at: string
  author_name?: string | null
}

// ── Project Templates ──────────────────────────────────────

export interface ProjectTemplate {
  id: string
  name: string
  description: string | null
  category: string | null
  thumbnail_url: string | null
  source_project_id: string | null
  created_by: string
  active: boolean
  usage_count: number
  created_at: string
  updated_at: string
}

export interface ProjectTemplateCreate {
  project_id: string
  name: string
  description?: string | null
  category?: string | null
}

// ── Custom Fields (EAV) ───────────────────────────────────

export interface CustomFieldDef {
  id: string
  slug: string
  label: string
  field_type: string
  options: unknown | null
  required: boolean
  default_value: string | null
  order: number
  value_text?: string | null
  value_json?: unknown | null
}

export interface CustomFieldValuePayload {
  value_text?: string | null
  value_json?: unknown | null
}

// ── Project Comments ──────────────────────────────────────

export interface ProjectComment {
  id: string
  owner_type: string
  owner_id: string
  author_id: string
  body: string
  mentions: string[] | null
  parent_id: string | null
  edited_at: string | null
  active: boolean
  created_at: string
  author_name: string | null
}

export interface ProjectCommentCreate {
  body: string
  mentions?: string[] | null
  parent_id?: string | null
}

// ── Activity Feed ─────────────────────────────────────────

export interface ActivityFeedItem {
  type: 'status_change' | 'task_change' | 'comment'
  date: string
  user: string | null
  detail?: string
  reason?: string | null
  task_title?: string
  field?: string
  old?: unknown
  new?: unknown
  change_type?: string
  body?: string
  owner_type?: string
}

// ── TravelWiz — Vectors ─────────────────────────────────────

export interface TravelVector {
  id: string
  entity_id: string
  registration: string
  name: string
  type: string
  mode: string
  pax_capacity: number
  weight_capacity_kg: number | null
  volume_capacity_m3: number | null
  home_base_id: string | null
  requires_weighing: boolean
  mmsi_number: string | null
  active: boolean
  created_at: string
  // Enriched
  home_base_name?: string | null
  zone_count?: number
  voyage_count?: number
}

export interface TravelVectorCreate {
  registration: string
  name: string
  type: string
  mode: string
  pax_capacity?: number
  weight_capacity_kg?: number | null
  volume_capacity_m3?: number | null
  home_base_id?: string | null
  requires_weighing?: boolean
  mmsi_number?: string | null
  description?: string | null
}

export interface TravelVectorUpdate {
  registration?: string
  name?: string
  type?: string
  mode?: string
  pax_capacity?: number | null
  weight_capacity_kg?: number | null
  volume_capacity_m3?: number | null
  home_base_id?: string | null
  requires_weighing?: boolean | null
  mmsi_number?: string | null
  active?: boolean
}

// ── TravelWiz — Vector Zones ────────────────────────────────

export interface VectorZone {
  id: string
  vector_id: string
  name: string
  zone_type: string
  capacity: number | null
  description: string | null
  active: boolean
  created_at: string
}

export interface VectorZoneCreate {
  name: string
  zone_type: string
  capacity?: number | null
  description?: string | null
}

export interface VectorZoneUpdate {
  name?: string
  zone_type?: string
  capacity?: number | null
  description?: string | null
  active?: boolean
}

// ── TravelWiz — Rotations ───────────────────────────────────

export interface Rotation {
  id: string
  entity_id: string
  name: string
  vector_id: string
  departure_base_id: string
  schedule_cron: string | null
  schedule_description: string | null
  active: boolean
  created_at: string
  vector_name?: string | null
  departure_base_name?: string | null
}

export interface RotationCreate {
  name: string
  vector_id: string
  departure_base_id: string
  schedule_cron?: string | null
  schedule_description?: string | null
  staging_ref?: string | null
}

export interface RotationUpdate {
  name?: string
  vector_id?: string | null
  departure_base_id?: string | null
  schedule_cron?: string | null
  schedule_description?: string | null
  active?: boolean
}

// ── TravelWiz — Voyages ─────────────────────────────────────

export interface Voyage {
  id: string
  entity_id: string
  code: string
  vector_id: string | null
  rotation_id: string | null
  status: 'planned' | 'confirmed' | 'boarding' | 'departed' | 'arrived' | 'closed' | 'completed' | 'delayed' | 'cancelled'
  departure_base_id: string | null
  scheduled_departure: string | null
  scheduled_arrival: string | null
  actual_departure: string | null
  actual_arrival: string | null
  delay_reason: string | null
  active: boolean
  created_at: string
  vector_name?: string | null
  vector_type?: string | null
  departure_base_name?: string | null
  rotation_name?: string | null
  stop_count?: number
  pax_count?: number
  cargo_count?: number
  departure_at?: string | null
  arrival_at?: string | null
  origin?: string | null
  destination?: string | null
  description?: string | null
}

export interface VoyageCreate {
  vector_id: string
  departure_base_id: string
  scheduled_departure: string
  scheduled_arrival?: string | null
  rotation_id?: string | null
}

export interface VoyageUpdate {
  code?: string
  vector_id?: string | null
  departure_base_id?: string | null
  rotation_id?: string | null
  scheduled_departure?: string | null
  scheduled_arrival?: string | null
  departure_at?: string | null
  arrival_at?: string | null
  origin?: string | null
  destination?: string | null
  description?: string | null
}

export interface VoyageStatusUpdate {
  status: string
  notes?: string | null
}

// ── TravelWiz — Voyage Stops ────────────────────────────────

export interface VoyageStop {
  id: string
  voyage_id: string
  location: string
  stop_order: number
  arrival_at: string | null
  departure_at: string | null
  description: string | null
  active: boolean
  created_at: string
}

export interface VoyageStopCreate {
  location: string
  stop_order?: number
  arrival_at?: string | null
  departure_at?: string | null
  description?: string | null
}

export interface VoyageStopUpdate {
  location?: string
  stop_order?: number
  arrival_at?: string | null
  departure_at?: string | null
  description?: string | null
}

// ── TravelWiz — Manifests ───────────────────────────────────

export interface Manifest {
  id: string
  voyage_id: string
  manifest_type: string
  reference: string | null
  status: 'draft' | 'validated' | 'closed'
  validated_by: string | null
  validated_at: string | null
  notes: string | null
  active: boolean
  created_at: string
  passenger_count?: number
}

export interface ManifestCreate {
  manifest_type?: string
  reference?: string | null
  notes?: string | null
}

// ── TravelWiz — Manifest Passengers ─────────────────────────

export interface ManifestPassenger {
  id: string
  manifest_id: string
  contact_id: string | null
  first_name: string
  last_name: string
  nationality: string | null
  document_type: string | null
  document_number: string | null
  seat: string | null
  boarding_status: 'registered' | 'checked_in' | 'boarded' | 'no_show'
  notes: string | null
  created_at: string
}

export interface ManifestPassengerCreate {
  contact_id?: string | null
  first_name: string
  last_name: string
  nationality?: string | null
  document_type?: string | null
  document_number?: string | null
  seat?: string | null
  notes?: string | null
}

export interface ManifestPassengerUpdate {
  first_name?: string
  last_name?: string
  nationality?: string | null
  document_type?: string | null
  document_number?: string | null
  seat?: string | null
  boarding_status?: string
  notes?: string | null
}

// ── TravelWiz — Cargo ───────────────────────────────────────

export interface CargoItem {
  id: string
  entity_id: string
  request_id: string | null
  manifest_id: string | null
  planned_zone_id: string | null
  tracking_code: string
  code: string
  description: string
  designation: string | null
  workflow_status: 'draft' | 'prepared' | 'ready_for_review' | 'approved' | 'rejected' | 'assigned' | 'in_transit' | 'delivered' | 'cancelled'
  weight_kg: number
  width_cm: number | null
  length_cm: number | null
  height_cm: number | null
  surface_m2: number | null
  package_count: number
  stackable: boolean
  volume_m3: number | null
  cargo_type: string
  status: 'registered' | 'ready' | 'ready_for_loading' | 'loaded' | 'in_transit' | 'delivered' | 'delivered_intermediate' | 'delivered_final' | 'return_declared' | 'return_in_transit' | 'returned' | 'reintegrated' | 'scrapped' | 'damaged' | 'missing'
  sender_tier_id: string | null
  receiver_name: string | null
  destination_asset_id: string | null
  project_id: string | null
  imputation_reference_id: string | null
  ownership_type: string | null
  pickup_location_label: string | null
  pickup_latitude: number | null
  pickup_longitude: number | null
  requester_name: string | null
  document_prepared_at: string | null
  available_from: string | null
  pickup_contact_user_id: string | null
  pickup_contact_tier_contact_id: string | null
  pickup_contact_name: string | null
  pickup_contact_phone: string | null
  pickup_contact_display_name?: string | null
  lifting_provider: string | null
  lifting_points_certified: boolean
  weight_ticket_provided: boolean
  photo_evidence_count: number
  document_attachment_count: number
  sap_article_code: string | null
  hazmat_validated: boolean
  received_by: string | null
  received_at: string | null
  damage_notes: string | null
  notes?: string | null
  registered_by: string
  active: boolean
  created_at: string
  sender_name?: string | null
  destination_name?: string | null
  imputation_reference_code?: string | null
  imputation_reference_name?: string | null
  request_code?: string | null
  request_title?: string | null
  request_project_id?: string | null
  request_receiver_name?: string | null
  request_requester_name?: string | null
  planned_zone_name?: string | null
  voyage_code?: string | null
  hazmat_class?: string | null
  is_urgent?: boolean
  // Emballage + reusable
  parent_cargo_id?: string | null
  is_reusable?: boolean
  expected_return_date?: string | null
  sub_item_count?: number
}

export interface CargoItemCreate {
  request_id?: string | null
  description: string
  designation?: string | null
  cargo_type: string
  weight_kg: number
  width_cm?: number | null
  length_cm?: number | null
  height_cm?: number | null
  surface_m2?: number | null
  package_count?: number
  stackable?: boolean
  sender_tier_id?: string | null
  receiver_name?: string | null
  destination_asset_id?: string | null
  project_id?: string | null
  imputation_reference_id?: string | null
  ownership_type?: string | null
  pickup_location_label?: string | null
  pickup_latitude?: number | null
  pickup_longitude?: number | null
  requester_name?: string | null
  document_prepared_at?: string | null
  available_from?: string | null
  pickup_contact_user_id?: string | null
  pickup_contact_tier_contact_id?: string | null
  pickup_contact_name?: string | null
  pickup_contact_phone?: string | null
  lifting_provider?: string | null
  lifting_points_certified?: boolean
  weight_ticket_provided?: boolean
  photo_evidence_count?: number
  document_attachment_count?: number
  manifest_id?: string | null
  planned_zone_id?: string | null
  sap_article_code?: string | null
  hazmat_validated?: boolean
  parent_cargo_id?: string | null
  is_reusable?: boolean
  expected_return_date?: string | null
  staging_ref?: string | null
}

export interface CargoItemUpdate {
  request_id?: string | null
  code?: string
  description?: string | null
  designation?: string | null
  weight_kg?: number | null
  width_cm?: number | null
  length_cm?: number | null
  height_cm?: number | null
  surface_m2?: number | null
  package_count?: number | null
  stackable?: boolean | null
  volume_m3?: number | null
  cargo_type?: string | null
  sender_tier_id?: string | null
  receiver_name?: string | null
  destination_asset_id?: string | null
  project_id?: string | null
  imputation_reference_id?: string | null
  ownership_type?: string | null
  pickup_location_label?: string | null
  pickup_latitude?: number | null
  pickup_longitude?: number | null
  requester_name?: string | null
  document_prepared_at?: string | null
  available_from?: string | null
  pickup_contact_user_id?: string | null
  pickup_contact_tier_contact_id?: string | null
  pickup_contact_name?: string | null
  pickup_contact_phone?: string | null
  lifting_provider?: string | null
  lifting_points_certified?: boolean | null
  weight_ticket_provided?: boolean | null
  photo_evidence_count?: number | null
  document_attachment_count?: number | null
  manifest_id?: string | null
  planned_zone_id?: string | null
  sap_article_code?: string | null
  hazmat_validated?: boolean
  notes?: string | null
  parent_cargo_id?: string | null
  is_reusable?: boolean | null
  expected_return_date?: string | null
}

export interface CargoWorkflowStatusUpdate {
  workflow_status: CargoItem['workflow_status']
}

export interface CargoRequest {
  id: string
  entity_id: string
  request_code: string
  title: string
  description: string | null
  status: 'draft' | 'submitted' | 'approved' | 'assigned' | 'in_progress' | 'closed' | 'cancelled'
  project_id: string | null
  imputation_reference_id: string | null
  sender_tier_id: string | null
  sender_contact_tier_contact_id: string | null
  receiver_name: string | null
  destination_asset_id: string | null
  requester_user_id: string | null
  requester_name: string | null
  requester_display_name?: string | null
  sender_contact_name?: string | null
  requested_by: string
  active: boolean
  created_at: string
  cargo_count: number
  sender_name?: string | null
  destination_name?: string | null
  imputation_reference_code?: string | null
  imputation_reference_name?: string | null
  is_ready_for_submission: boolean
  missing_requirements: string[]
}

export interface CargoLoadingOption {
  voyage_id: string
  voyage_code: string
  voyage_status: string
  scheduled_departure: string
  vector_id: string
  vector_name: string | null
  departure_base_name: string | null
  manifest_id: string | null
  manifest_status: string | null
  destination_match: boolean
  remaining_weight_kg: number | null
  total_request_weight_kg: number
  total_request_surface_m2: number
  all_items_stackable: boolean
  compatible_zones: Array<{
    zone_id: string
    zone_name: string
    zone_type: string
    surface_m2: number | null
    max_weight_kg: number | null
  }>
  requires_manifest_creation: boolean
  can_load: boolean
  blocking_reasons: string[]
}

export interface CargoRequestCreate {
  title: string
  description?: string | null
  project_id?: string | null
  imputation_reference_id?: string | null
  sender_tier_id?: string | null
  sender_contact_tier_contact_id?: string | null
  receiver_name?: string | null
  destination_asset_id?: string | null
  requester_user_id?: string | null
  requester_name?: string | null
  staging_ref?: string | null
}

export interface CargoRequestUpdate {
  title?: string | null
  description?: string | null
  status?: CargoRequest['status'] | null
  project_id?: string | null
  imputation_reference_id?: string | null
  sender_tier_id?: string | null
  sender_contact_tier_contact_id?: string | null
  receiver_name?: string | null
  destination_asset_id?: string | null
  requester_user_id?: string | null
  requester_name?: string | null
}

export interface CargoAttachmentEvidence {
  attachment_id: string
  evidence_type: 'cargo_photo' | 'weight_ticket' | 'lifting_certificate' | 'transport_document' | 'hazmat_document' | 'delivery_proof' | 'other'
  original_name: string
  content_type: string
  created_at: string
}

export interface CargoStatusUpdate {
  status: string
  damage_notes?: string | null
  notes?: string | null
}

export interface CargoReceive {
  received_quantity?: number | null
  declared_quantity?: number | null
  recipient_available?: boolean
  signature_collected?: boolean
  damage_notes?: string | null
  photo_evidence_count?: number
  notes?: string | null
}

// ── TravelWiz — Captain Logs ────────────────────────────────

export interface CaptainLog {
  id: string
  voyage_id: string
  log_type: string
  content: string
  logged_at: string
  logged_by: string
  created_at: string
  author_name?: string | null
}

export interface CaptainLogCreate {
  log_type?: string
  content: string
  logged_at?: string | null
}

// ── TravelWiz — Voyage Capacity ─────────────────────────────

export interface VoyageCapacity {
  voyage_id: string
  vector_capacity_pax: number | null
  vector_capacity_cargo_kg: number | null
  current_pax: number
  current_cargo_kg: number
  remaining_pax: number | null
  remaining_cargo_kg: number | null
  pax_utilization_pct: number | null
  cargo_utilization_pct: number | null
}

// ── Planner — Activities ─────────────────────────────────────

export interface PlannerActivity {
  id: string
  entity_id: string
  asset_id: string
  project_id: string | null
  parent_id: string | null
  type: string
  subtype: string | null
  title: string
  description: string | null
  status: 'draft' | 'submitted' | 'validated' | 'rejected' | 'cancelled' | 'in_progress' | 'completed'
  priority: 'low' | 'medium' | 'high' | 'critical'
  pax_quota: number
  pax_quota_mode: 'constant' | 'variable'
  pax_quota_daily: Record<string, number> | null
  start_date: string | null
  end_date: string | null
  actual_start: string | null
  actual_end: string | null
  // Workover
  well_reference: string | null
  rig_name: string | null
  // Drilling
  spud_date: string | null
  target_depth: number | null
  drilling_program_ref: string | null
  // Regulatory / maintenance
  regulatory_ref: string | null
  work_order_ref: string | null
  // Workflow
  submitted_by: string | null
  submitted_at: string | null
  validated_by: string | null
  validated_at: string | null
  rejected_by: string | null
  rejected_at: string | null
  rejection_reason: string | null
  created_by: string
  active: boolean
  created_at: string
  updated_at: string
  // Enriched
  asset_name: string | null
  project_name: string | null
  created_by_name: string | null
  submitted_by_name: string | null
  validated_by_name: string | null
  // §2.5 — parent POB = sum of children POB
  children_pob_total: number | null
  children_pob_daily: Record<string, number> | null
  has_children: boolean
}

export interface PlannerActivityCreate {
  asset_id: string
  project_id?: string | null
  parent_id?: string | null
  type: string
  subtype?: string | null
  title: string
  description?: string | null
  priority?: string
  pax_quota?: number
  pax_quota_mode?: 'constant' | 'variable'
  pax_quota_daily?: Record<string, number> | null
  start_date?: string | null
  end_date?: string | null
  well_reference?: string | null
  rig_name?: string | null
  spud_date?: string | null
  target_depth?: number | null
  drilling_program_ref?: string | null
  regulatory_ref?: string | null
  work_order_ref?: string | null
  // Client-generated UUID to commit polymorphic children staged during Create.
  staging_ref?: string | null
}

export interface PlannerActivityUpdate {
  asset_id?: string | null
  project_id?: string | null
  type?: string | null
  subtype?: string | null
  title?: string | null
  description?: string | null
  priority?: string | null
  pax_quota?: number | null
  pax_quota_mode?: 'constant' | 'variable' | null
  pax_quota_daily?: Record<string, number> | null
  start_date?: string | null
  end_date?: string | null
  actual_start?: string | null
  actual_end?: string | null
  well_reference?: string | null
  rig_name?: string | null
  spud_date?: string | null
  target_depth?: number | null
  drilling_program_ref?: string | null
  regulatory_ref?: string | null
  work_order_ref?: string | null
}

// ── Planner — Conflicts ──────────────────────────────────────

export interface PlannerConflict {
  id: string
  entity_id: string
  asset_id: string
  conflict_date: string
  conflict_type: 'pax_overflow' | 'priority_clash' | string
  overflow_amount: number | null
  status: 'open' | 'resolved' | 'deferred'
  resolution: string | null
  resolution_note: string | null
  resolved_by: string | null
  resolved_at: string | null
  created_at: string
  active: boolean
  // Enriched
  asset_name: string | null
  resolved_by_name: string | null
  activity_ids: string[]
  activity_titles: string[]
}

export interface PlannerConflictResolve {
  resolution: string
  resolution_note?: string | null
}

export interface PlannerRevisionSignal {
  id: string
  created_at: string
  task_id: string | null
  task_title: string | null
  task_status: string | null
  project_id: string | null
  project_code: string | null
  project_name: string | null
  changed_fields: string[]
  planner_activity_ids: string[]
  planner_activity_count: number
  actor_id: string | null
  actor_name: string | null
}

export interface PlannerRevisionSignalImpactActivity {
  activity_id: string
  activity_title: string | null
  activity_status: string | null
  ads_affected: number
  manifests_affected: number
  open_conflict_days: number
}

export interface PlannerRevisionSignalImpactSummary {
  signal_id: string
  activity_count: number
  total_ads_affected: number
  total_manifests_affected: number
  total_open_conflict_days: number
  activities: PlannerRevisionSignalImpactActivity[]
}

export interface PlannerRevisionDecisionRequest {
  id: string
  signal_id: string
  created_at: string
  due_at: string | null
  status: 'pending' | 'responded' | 'forced' | 'counter_accepted'
  project_id: string | null
  project_code: string | null
  project_name: string | null
  task_id: string | null
  task_title: string | null
  planner_activity_ids: string[]
  requester_user_id: string | null
  requester_user_name: string | null
  target_user_id: string | null
  target_user_name: string | null
  note: string | null
  proposed_start_date: string | null
  proposed_end_date: string | null
  proposed_pax_quota: number | null
  proposed_status: string | null
  response: 'accepted' | 'counter_proposed' | null
  response_note: string | null
  counter_start_date: string | null
  counter_end_date: string | null
  counter_pax_quota: number | null
  counter_status: string | null
  responded_at: string | null
  forced_at: string | null
  forced_reason: string | null
  application_result: {
    applied_to_task?: boolean
    task_requires_manual_breakdown?: boolean
    applied_activity_count?: number
    applied_fields?: string[]
  } | null
}

export interface PlannerRevisionDecisionRequestCreate {
  note?: string | null
  due_at?: string | null
  proposed_start_date?: string | null
  proposed_end_date?: string | null
  proposed_pax_quota?: number | null
  proposed_status?: string | null
}

export interface PlannerRevisionDecisionRespond {
  response: 'accepted' | 'counter_proposed'
  response_note?: string | null
  counter_start_date?: string | null
  counter_end_date?: string | null
  counter_pax_quota?: number | null
  counter_status?: string | null
}

// ── Planner — Capacity ───────────────────────────────────────

export interface PlannerCapacity {
  asset_id: string
  asset_name: string | null
  date: string
  total_capacity: number
  used_capacity: number
  residual_capacity: number
  saturation_pct: number
}

// ── Planner — Dependencies ───────────────────────────────────

export interface PlannerDependency {
  id: string
  predecessor_id: string
  successor_id: string
  dependency_type: 'FS' | 'SS' | 'FF' | 'SF'
  lag_days: number
  predecessor_title?: string | null
  successor_title?: string | null
}

export interface PlannerDependencyCreate {
  predecessor_id: string
  successor_id: string
  dependency_type?: string
  lag_days?: number
}

// ── Planner — Gantt ──────────────────────────────────────────

export interface GanttActivity {
  id: string
  title: string
  type: string
  subtype: string | null
  status: string
  priority: string
  pax_quota: number
  pax_quota_mode?: 'constant' | 'variable'
  pax_quota_daily?: Record<string, number> | null
  start_date: string
  end_date: string
  project_id: string | null
  parent_id?: string | null
  source_task_id?: string | null
  progress?: number
  created_by: string
  well_reference: string | null
  work_order_ref: string | null
  // §2.5 — parent POB = sum of children POB
  children_pob_total?: number | null
  children_pob_daily?: Record<string, number> | null
  has_children?: boolean
}

export interface GanttAssetCapacity {
  max_pax: number
  permanent_ops_quota: number
}

export interface GanttAsset {
  id: string
  name: string
  parent_id: string | null
  capacity: GanttAssetCapacity
  activities: GanttActivity[]
}

export interface GanttDependencyLink {
  id: string
  predecessor_id: string
  successor_id: string
  dependency_type: 'FS' | 'SS' | 'FF' | 'SF' | string
  lag_days: number
}

export interface GanttResponse {
  assets: GanttAsset[]
  dependencies?: GanttDependencyLink[]
}

// ── Planner — Asset Capacity (historized) ────────────────────

export interface AssetCapacity {
  id: string
  asset_id: string
  max_pax_total: number
  permanent_ops_quota: number
  max_pax_per_company: number | null
  effective_date: string
  reason: string
  changed_by: string
}

export interface AssetCapacityCreate {
  max_pax_total: number
  permanent_ops_quota: number
  reason: string
  effective_date?: string
}

// ── Planner — Daily Load / Availability ──────────────────────

export interface DailyLoad {
  date: string
  max_pax_total: number
  permanent_ops_quota: number
  used_by_activities: number
  total_used: number
  residual: number
  saturation_pct: number
}

export interface AvailabilityResponse {
  asset_id: string
  asset_name: string | null
  start_date: string
  end_date: string
  worst_residual: number
  max_capacity: number
  days: DailyLoad[]
}

// ── Planner — Capacity Heatmap ───────────────────────────────

export interface CapacityHeatmapDay {
  date: string
  asset_id: string
  asset_name: string | null
  saturation_pct: number
  forecast_pax: number
  real_pob: number
  remaining_capacity: number
  capacity_limit: number
}

export interface CapacityHeatmapConfig {
  threshold_low: number
  threshold_medium: number
  threshold_high: number
  threshold_critical: number
  color_low: string
  color_medium: string
  color_high: string
  color_critical: string
  color_overflow: string
}

export interface CapacityHeatmapResponse {
  days: CapacityHeatmapDay[]
  config: CapacityHeatmapConfig
}

// ── Planner — Impact Preview ─────────────────────────────────

export interface ImpactChange {
  field: string
  old_value: string | null
  new_value: string | null
}

export interface ImpactPreview {
  activity_id: string
  activity_title: string
  ads_affected: number
  manifests_affected: number
  potential_conflict_days: string[]
  changes: ImpactChange[]
}

// ── Planner — Recurrence ─────────────────────────────────────

export interface RecurrenceConfig {
  frequency: string
  interval_value: number
  day_of_week: number | null
  day_of_month: number | null
  end_date: string | null
}

export interface RecurrenceCreate {
  frequency: string
  interval_value: number
  day_of_week?: number
  day_of_month?: number
  end_date?: string
}

// ── Planner — Bulk Resolve / Audit / Scenarios / Forecast ───

export interface BulkConflictResolveItem {
  conflict_id: string
  resolution: string
  resolution_note?: string | null
}

export interface BulkConflictResolveResult {
  resolved: number
  skipped: number
  errors: string[]
  conflict_ids: string[]
}

export interface ConflictAuditEntry {
  id: string
  conflict_id: string
  actor_id: string | null
  actor_name: string | null
  action: string
  old_status: string | null
  new_status: string | null
  old_resolution: string | null
  new_resolution: string | null
  resolution_note: string | null
  context: string | null
  created_at: string
}

export interface ProposedActivity {
  asset_id: string
  pax_quota: number
  start_date: string
  end_date: string
  title?: string
}

export interface ScenarioRequest {
  proposed_activities: ProposedActivity[]
  start_date: string
  end_date: string
}

export interface ScenarioDailyLoad {
  asset_id: string
  date: string
  current_load: number
  proposed_extra: number
  projected_load: number
  max_capacity: number
  saturation_pct: number
  overflow: number
}

export interface ScenarioConflict {
  asset_id: string
  date: string
  overflow: number
}

export interface ScenarioResult {
  daily_loads: ScenarioDailyLoad[]
  projected_conflicts: ScenarioConflict[]
  summary: {
    total_days: number
    conflict_days: number
    worst_overflow: number
    worst_date: string | null
    proposed_count: number
  }
}

export interface ForecastDay {
  date: string
  projected_load: number
  scheduled_load: number
  combined_load: number
  real_pob: number
  max_capacity: number
  at_risk: boolean
  saturation_pct: number
}

export interface ForecastResult {
  forecast: ForecastDay[]
  summary: {
    at_risk_days: number
    avg_projected_load: number
    avg_real_pob: number
    peak_date: string | null
    peak_load: number
    max_capacity: number
    horizon_days: number
  }
}

// ── TravelWiz — Voyage Events (Journal de bord) ─────────────

export interface VoyageEvent {
  id: string
  voyage_id: string
  event_code: string
  recorded_at: string
  latitude: number | null
  longitude: number | null
  asset_id: string | null
  payload: Record<string, unknown> | null
  notes: string | null
  recorded_by: string | null
  created_at: string
  recorded_by_name?: string | null
  asset_name?: string | null
}

export interface VoyageEventCreate {
  event_code: string
  recorded_at: string
  latitude?: number | null
  longitude?: number | null
  asset_id?: string | null
  payload?: Record<string, unknown> | null
  notes?: string | null
}

// ── TravelWiz — Trip KPIs ───────────────────────────────────

export interface TripKpi {
  trip_id: string
  total_pax: number
  total_cargo_kg: number
  no_shows: number
  on_time: boolean
  delay_minutes: number | null
  events_count: number
  hazmat_items: number
}

// ── TravelWiz — Deck Layouts ────────────────────────────────

export interface DeckLayout {
  id: string
  voyage_id: string
  deck_surface_id: string
  items: DeckLayoutItem[]
  suggested: boolean
  validated: boolean
  created_at: string
}

export interface DeckLayoutItem {
  cargo_item_id: string
  position_x: number
  position_y: number
  width: number
  height: number
  description?: string | null
}

export interface DeckLayoutValidation {
  valid: boolean
  warnings: string[]
  errors: string[]
}

// ── TravelWiz — Package Elements ────────────────────────────

export interface PackageElement {
  id: string
  cargo_item_id: string
  description: string
  quantity: number
  quantity_returned: number
  weight_kg: number | null
  sap_code: string | null
  return_status: string
  return_notes?: string | null
  created_at: string
}

export interface PackageElementCreate {
  description: string
  quantity?: number
  weight_kg?: number | null
  sap_code?: string | null
}

export interface PackageElementReturnUpdate {
  quantity_returned: number
  return_notes?: string | null
}

export interface PackageElementDispositionUpdate {
  return_status: 'returned' | 'reintegrated' | 'scrapped' | 'yard_storage'
  return_notes?: string | null
}

export interface CargoHistoryEntry {
  id: string
  action: string
  created_at: string
  actor_id: string | null
  actor_name: string | null
  details: Record<string, unknown> | null
}

export interface VoyageCargoOperationsReportItem {
  cargo_id: string
  tracking_code: string
  request_code: string | null
  designation: string | null
  description: string
  status: string
  workflow_status: string
  destination_name: string | null
  weight_kg: number
  package_count: number
  damage_notes: string | null
  received_at: string | null
  package_element_count: number
  total_sent_units: number
  total_returned_units: number
  return_coverage_ratio: number
  aggregate_return_status: string
  aggregate_disposition: string
}

export interface VoyageCargoOperationsReport {
  voyage_id: string
  cargo_count: number
  delivered_count: number
  damaged_count: number
  missing_count: number
  return_started_count: number
  items: VoyageCargoOperationsReportItem[]
}

// ── TravelWiz — Articles (SAP) ─────────────────────────────

export interface TravelArticle {
  id: string
  entity_id?: string
  sap_code: string
  description: string
  management_type: string | null
  packaging: string | null
  is_hazmat: boolean
  hazmat_class: string | null
  unit: string | null
  active: boolean
  created_at: string
}

export interface TravelArticleCreate {
  sap_code: string
  description: string
  management_type?: string | null
  packaging?: string | null
  is_hazmat?: boolean
  hazmat_class?: string | null
  unit?: string | null
}

export interface TravelArticleImportResult {
  status: string
  imported: number
  updated: number
  errors: string[]
  total_rows: number
}

export interface SapMatchResult {
  article_id: string | null
  sap_code: string | null
  description: string
  confidence: number
  matched: boolean
}

// ── TravelWiz — Cargo Return ────────────────────────────────

export interface CargoReturnCreate {
  return_type: string
  notes?: string | null
  waste_manifest_ref?: string | null
  pass_number?: string | null
  inventory_reference?: string | null
  sap_code_confirmed?: boolean
  photo_evidence_count?: number
  double_signature_confirmed?: boolean
  yard_justification?: string | null
}

// ── TravelWiz — Captain Portal ──────────────────────────────

export interface CaptainAuth {
  token: string
  voyage_id: string
  captain_name: string
}

export interface CaptainManifest {
  voyage: Voyage
  manifests: Manifest[]
  cargo_items: CargoItem[]
  stops: VoyageStop[]
}

// ── TravelWiz — Dashboard Aggregates ────────────────────────

export interface TravelDashboardTripsToday {
  trips: Voyage[]
  total: number
}

export interface TravelDashboardCargoPending {
  items: CargoItem[]
  total: number
  total_weight_kg: number
}

export interface TravelFleetKpi {
  total_vectors: number
  active_vectors: number
  active_voyages: number
  voyages_today: number
  pax_in_transit: number
  cargo_in_transit: number
  pending_cargo: number
  in_transit_cargo: number
  no_shows_month: number
  utilization_by_type: Record<string, { total: number; active: number }>
}

// ── TravelWiz — Manifest (enhanced for standalone listing) ──

export interface ManifestListParams extends PaginationParams {
  status?: string
  search?: string
}

export interface ManifestWithTrip extends Manifest {
  voyage_code?: string | null
  voyage_origin?: string | null
  voyage_destination?: string | null
  voyage_departure_at?: string | null
  total_weight_kg?: number | null
}

// ── TravelWiz — Article List Params ─────────────────────────

export interface ArticleListParams extends PaginationParams {
  search?: string
  sap_code?: string
  management_type?: string
  is_hazmat?: boolean
}

// ── TravelWiz — Fleet Tracking ──────────────────────────────

export interface VehiclePosition {
  vector_id: string
  vector_name: string
  transport_mode: string
  status: 'active' | 'idle' | 'in_transit' | 'maintenance'
  latitude: number
  longitude: number
  speed_knots: number | null
  heading: number | null
  current_trip_id: string | null
  current_trip_code: string | null
  last_update: string
}

export interface FleetPositionResponse {
  positions: VehiclePosition[]
  updated_at: string
}

export interface VehicleTrack {
  vector_id: string
  points: { lat: number; lng: number; ts: string }[]
}

// ── TravelWiz — Weather ─────────────────────────────────────

export interface WeatherData {
  id: string
  site_id: string
  site_name: string
  recorded_at: string
  wind_speed_knots: number | null
  wind_direction: string | null
  sea_state: string | null
  visibility_nm: number | null
  temperature_c: number | null
  conditions: string | null
  flight_status: 'green' | 'amber' | 'red' | null
  notes: string | null
}

export interface WeatherReport {
  wind_speed_knots?: number | null
  wind_direction?: string | null
  sea_state?: string | null
  visibility_nm?: number | null
  temperature_c?: number | null
  conditions?: string | null
  notes?: string | null
}

// ── TravelWiz — Pickup Rounds (Ramassage) ───────────────────

export interface PickupRound {
  id: string
  code: string
  date: string
  vehicle_name: string | null
  driver_name: string | null
  status: 'planned' | 'in_progress' | 'completed' | 'cancelled'
  stops_count: number
  pax_collected: number
  created_at: string
}

export interface PickupStop {
  id: string
  round_id: string
  sequence: number
  location_name: string
  latitude: number | null
  longitude: number | null
  scheduled_time: string | null
  actual_time: string | null
  pax_names: string[]
  status: 'pending' | 'arrived' | 'departed' | 'skipped'
}

// ── TravelWiz — Captain Weather Report ──────────────────────

export interface CaptainWeatherReport {
  wind_speed_knots?: number | null
  wind_direction?: string | null
  sea_state?: string | null
  visibility_nm?: number | null
  notes?: string | null
}

// ── Import Assistant ─────────────────────────────────────────

export type ImportTargetObject = 'asset' | 'tier' | 'contact' | 'pax_profile' | 'project' | 'compliance_record' | 'imputation_reference' | 'imputation_otp_template' | 'imputation_assignment' | 'user' | 'group' | 'ar_field' | 'ar_site' | 'ar_installation' | 'ar_equipment' | 'ar_pipeline'
export type DuplicateStrategy = 'skip' | 'update' | 'fail'

/** Column transformation applied client-side before sending to backend */
export type TransformType =
  | 'none'
  | 'uppercase'
  | 'lowercase'
  | 'trim'
  | 'capitalize'         // first letter upper
  | 'date_format'        // reformat date string
  | 'concat'             // merge multiple columns
  | 'split'              // split column by delimiter
  | 'arithmetic'         // +, -, *, / with another column or constant
  | 'math_func'          // sin, cos, tan, pow, sqrt, log, ln, abs, round, ceil, floor
  | 'replace'            // find & replace substring
  | 'default_value'      // fill empty cells with a default
  | 'expression'         // free-form JS-safe expression using column refs

export type MathFunction =
  | 'abs' | 'round' | 'ceil' | 'floor' | 'sqrt'
  | 'pow' | 'nroot'
  | 'log' | 'log10' | 'ln'
  | 'sin' | 'cos' | 'tan' | 'asin' | 'acos' | 'atan'
  | 'exp' | 'sign' | 'min' | 'max'

export interface ColumnTransform {
  type: TransformType
  /** For concat: other column names; for split: unused; for arithmetic: other column or constant */
  params?: {
    columns?: string[]         // other columns involved (concat, arithmetic, min, max)
    separator?: string         // delimiter for concat/split
    splitIndex?: number        // which part to keep after split (0-based)
    operator?: '+' | '-' | '*' | '/'
    constant?: number | string // constant value for arithmetic or default_value
    dateInputFormat?: string   // e.g. "DD/MM/YYYY"
    dateOutputFormat?: string  // always "YYYY-MM-DD" (OpsFlux canonical)
    find?: string              // for replace transform
    replaceWith?: string       // for replace transform
    mathFunc?: MathFunction    // for math_func transform
    exponent?: number          // for pow / nroot
    sourceColumn?: string      // source column name for virtual columns
  }
}

export interface TargetFieldDef {
  key: string
  label: string
  type: string
  required: boolean
  example?: string
  lookup_target?: string
}

export interface TargetObjectInfo {
  key: ImportTargetObject
  label: string
  fields: TargetFieldDef[]
}

export interface ImportMapping {
  id: string
  entity_id: string
  name: string
  description: string | null
  target_object: string
  column_mapping: Record<string, string>
  transforms: Record<string, ColumnTransform> | null
  file_headers: string[] | null
  file_settings: Record<string, unknown> | null
  last_used_at: string | null
  use_count: number
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface ImportMappingCreate {
  name: string
  description?: string
  target_object: ImportTargetObject
  column_mapping: Record<string, string>
  transforms?: Record<string, ColumnTransform>
  file_headers?: string[]
  file_settings?: Record<string, unknown>
}

export interface RowValidationError {
  row_index: number
  field: string
  message: string
  severity: 'error' | 'warning'
}

export interface ImportPreviewResponse {
  valid_count: number
  error_count: number
  warning_count: number
  duplicate_count: number
  errors: RowValidationError[]
  preview_rows: Record<string, unknown>[]
}

export interface ImportExecuteResponse {
  created: number
  updated: number
  skipped: number
  errors: RowValidationError[]
  total_processed: number
}
