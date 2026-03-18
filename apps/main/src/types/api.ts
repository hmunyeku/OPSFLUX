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
  parent_id: string | null
  type: string
  code: string
  name: string
  path: string | null
  latitude: number | null
  longitude: number | null
  allow_overlap: boolean
  active: boolean
  created_at: string
}

export interface AssetCreate {
  parent_id?: string | null
  type: string
  code: string
  name: string
  latitude?: number | null
  longitude?: number | null
  allow_overlap?: boolean
  metadata?: Record<string, unknown> | null
}

export interface AssetTreeNode {
  id: string
  code: string
  name: string
  type: string
  children: AssetTreeNode[]
}

// ── Tiers (Companies) ────────────────────────────────────────
export interface Tier {
  id: string
  entity_id: string
  code: string
  name: string
  alias: string | null
  type: string | null
  website: string | null
  // Legacy convenience fields (prefer polymorphic phones/emails)
  phone: string | null
  email: string | null
  // Corporate
  legal_form: string | null
  capital: number | null
  currency: string
  industry: string | null
  payment_terms: string | null
  description: string | null
  active: boolean
  archived: boolean
  contact_count: number
  created_at: string
}

export interface TierCreate {
  code: string
  name: string
  alias?: string | null
  type?: string | null
  website?: string | null
  legal_form?: string | null
  capital?: number | null
  currency?: string
  industry?: string | null
  payment_terms?: string | null
  description?: string | null
}

// ── Tier Contacts (Employees) ────────────────────────────────
// NO direct phone/email — all managed via polymorphic Phone/ContactEmail
export interface TierContact {
  id: string
  tier_id: string
  civility: string | null
  first_name: string
  last_name: string
  position: string | null
  department: string | null
  is_primary: boolean
  active: boolean
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
  position?: string | null
  department?: string | null
  is_primary?: boolean
}

export interface TierContactUpdate {
  civility?: string | null
  first_name?: string
  last_name?: string
  position?: string | null
  department?: string | null
  is_primary?: boolean
  active?: boolean
}

// ── Tier Identifiers (Legal/Fiscal IDs) ─────────────────────
export interface TierIdentifier {
  id: string
  tier_id: string
  type: string
  value: string
  country: string | null
  issued_at: string | null
  expires_at: string | null
  created_at: string
}

export interface TierIdentifierCreate {
  type: string
  value: string
  country?: string | null
  issued_at?: string | null
  expires_at?: string | null
}

export interface TierIdentifierUpdate {
  type?: string
  value?: string
  country?: string | null
  issued_at?: string | null
  expires_at?: string | null
}

// ── Users ───────────────────────────────────────────────────
export interface UserRead {
  id: string
  email: string
  first_name: string
  last_name: string
  active: boolean
  default_entity_id: string | null
  language: string
  avatar_url: string | null
  last_login_at: string | null
  created_at: string
}

export interface UserCreate {
  email: string
  first_name: string
  last_name: string
  password?: string | null
  default_entity_id?: string | null
  language?: string
}

// ── Dashboard Stats ─────────────────────────────────────────
export interface DashboardStats {
  assets_count: number
  users_count: number
  tiers_count: number
}

// ── Profile ────────────────────────────────────────────────
export interface ProfileUpdate {
  first_name?: string
  last_name?: string
  language?: string
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

/** @deprecated Use Address instead */
export type UserAddress = Address
/** @deprecated Use AddressCreate instead */
export type UserAddressCreate = AddressCreate
/** @deprecated Use AddressUpdate instead */
export type UserAddressUpdate = AddressUpdate

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
  role_code: string
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
  created_at: string
}

export interface ComplianceTypeCreate {
  category: string
  code: string
  name: string
  description?: string | null
  validity_days?: number | null
  is_mandatory?: boolean
}

export interface ComplianceTypeUpdate {
  category?: string
  code?: string
  name?: string
  description?: string | null
  validity_days?: number | null
  is_mandatory?: boolean
  active?: boolean
}

export interface ComplianceRule {
  id: string
  entity_id: string
  compliance_type_id: string
  target_type: string
  target_value: string | null
  description: string | null
  active: boolean
  created_at: string
}

export interface ComplianceRuleCreate {
  compliance_type_id: string
  target_type: string
  target_value?: string | null
  description?: string | null
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
  total_required: number
  total_valid: number
  total_expired: number
  total_missing: number
  is_compliant: boolean
  details: Record<string, unknown>[]
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
  manager_id: string | null
  parent_id: string | null
  tier_id: string | null
  asset_id: string | null
  active: boolean
  archived: boolean
  created_at: string
  manager_name?: string | null
  tier_name?: string | null
  task_count?: number
  member_count?: number
}

export interface ProjectCreate {
  code: string
  name: string
  description?: string | null
  status?: string
  priority?: string
  weather?: string
  start_date?: string | null
  end_date?: string | null
  budget?: number | null
  manager_id?: string | null
  parent_id?: string | null
  tier_id?: string | null
  asset_id?: string | null
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
  manager_id?: string | null
  tier_id?: string | null
  asset_id?: string | null
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
  order: number
  active: boolean
  created_at: string
  assignee_name?: string | null
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
