/**
 * Types for Third Parties module
 */

// Enums
export enum CompanyType {
  CLIENT = "client",
  SUPPLIER = "supplier",
  PARTNER = "partner",
  CONTRACTOR = "contractor",
  COMPETITOR = "competitor",
  OTHER = "other",
}

export enum CompanyStatus {
  ACTIVE = "active",
  INACTIVE = "inactive",
  PROSPECT = "prospect",
  ARCHIVED = "archived",
}

export enum ContactStatus {
  ACTIVE = "active",
  INACTIVE = "inactive",
  INVITED = "invited",
  ARCHIVED = "archived",
}

export enum ContactRole {
  CEO = "ceo",
  MANAGER = "manager",
  EMPLOYEE = "employee",
  CONSULTANT = "consultant",
  TECHNICAL = "technical",
  COMMERCIAL = "commercial",
  ADMIN = "admin",
  OTHER = "other",
}

export enum InvitationStatus {
  PENDING = "pending",
  ACCEPTED = "accepted",
  EXPIRED = "expired",
  REVOKED = "revoked",
}

// Company
export interface Company {
  id: string
  name: string
  legal_name?: string
  registration_number?: string
  vat_number?: string
  company_type: CompanyType
  status: CompanyStatus
  email?: string
  phone?: string
  website?: string
  address_line1?: string
  address_line2?: string
  city?: string
  postal_code?: string
  state?: string
  country?: string
  description?: string
  notes?: string
  logo_url?: string
  industry?: string
  employee_count?: number
  annual_revenue?: number
  tags: string[]
  metadata: Record<string, any>
  created_at: string
  updated_at?: string
  contact_count?: number
}

export interface CompanyCreate {
  name: string
  legal_name?: string
  registration_number?: string
  vat_number?: string
  company_type: CompanyType
  status?: CompanyStatus
  email?: string
  phone?: string
  website?: string
  address_line1?: string
  address_line2?: string
  city?: string
  postal_code?: string
  state?: string
  country?: string
  description?: string
  notes?: string
  logo_url?: string
  industry?: string
  employee_count?: number
  annual_revenue?: number
  tags?: string[]
  metadata?: Record<string, any>
}

export interface CompanyUpdate extends Partial<CompanyCreate> {}

// Contact
export interface Contact {
  id: string
  company_id: string
  first_name: string
  last_name: string
  civility?: string
  job_title?: string
  department?: string
  role: ContactRole
  email: string
  phone?: string
  mobile?: string
  extension?: string
  linkedin_url?: string
  twitter_handle?: string
  status: ContactStatus
  avatar_url?: string
  notes?: string
  is_primary: boolean
  metadata: Record<string, any>
  user_id?: string
  created_at: string
  updated_at?: string
  full_name?: string
  has_user_account: boolean
}

export interface ContactCreate {
  company_id: string
  first_name: string
  last_name: string
  civility?: string
  job_title?: string
  department?: string
  role?: ContactRole
  email: string
  phone?: string
  mobile?: string
  extension?: string
  linkedin_url?: string
  twitter_handle?: string
  status?: ContactStatus
  avatar_url?: string
  notes?: string
  is_primary?: boolean
  metadata?: Record<string, any>
}

export interface ContactUpdate extends Partial<ContactCreate> {}

// Invitation
export interface ContactInvitation {
  id: string
  contact_id: string
  token: string
  message?: string
  expires_at: string
  can_be_admin: boolean
  initial_permissions: string[]
  status: InvitationStatus
  accepted_at?: string
  revoked_at?: string
  two_factor_verified: boolean
  created_at: string
  created_by_id: string
}

export interface ContactInvitationCreate {
  contact_id: string
  message?: string
  expires_in_days?: number
  can_be_admin?: boolean
  initial_permissions?: string[]
}

// Labels
export const CompanyTypeLabels: Record<CompanyType, string> = {
  [CompanyType.CLIENT]: "Client",
  [CompanyType.SUPPLIER]: "Fournisseur",
  [CompanyType.PARTNER]: "Partenaire",
  [CompanyType.CONTRACTOR]: "Sous-traitant",
  [CompanyType.COMPETITOR]: "Concurrent",
  [CompanyType.OTHER]: "Autre",
}

export const CompanyStatusLabels: Record<CompanyStatus, string> = {
  [CompanyStatus.ACTIVE]: "Actif",
  [CompanyStatus.INACTIVE]: "Inactif",
  [CompanyStatus.PROSPECT]: "Prospect",
  [CompanyStatus.ARCHIVED]: "Archivé",
}

export const ContactRoleLabels: Record<ContactRole, string> = {
  [ContactRole.CEO]: "Directeur Général",
  [ContactRole.MANAGER]: "Manager",
  [ContactRole.EMPLOYEE]: "Employé",
  [ContactRole.CONSULTANT]: "Consultant",
  [ContactRole.TECHNICAL]: "Technique",
  [ContactRole.COMMERCIAL]: "Commercial",
  [ContactRole.ADMIN]: "Administratif",
  [ContactRole.OTHER]: "Autre",
}

export const ContactStatusLabels: Record<ContactStatus, string> = {
  [ContactStatus.ACTIVE]: "Actif",
  [ContactStatus.INACTIVE]: "Inactif",
  [ContactStatus.INVITED]: "Invité",
  [ContactStatus.ARCHIVED]: "Archivé",
}

export const InvitationStatusLabels: Record<InvitationStatus, string> = {
  [InvitationStatus.PENDING]: "En attente",
  [InvitationStatus.ACCEPTED]: "Acceptée",
  [InvitationStatus.EXPIRED]: "Expirée",
  [InvitationStatus.REVOKED]: "Révoquée",
}
