/** Shared API response types matching the FastAPI backend. */

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
}

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: "bearer";
}

export interface LoginResponse extends TokenResponse {
  mfa_required?: boolean;
  mfa_token?: string;
}

// ── ADS (Avis de Séjour) ──────────────────────────────────────────────

export interface AdsSummary {
  id: string;
  reference: string;
  type: "individual" | "team";
  status: string;
  visit_purpose: string;
  visit_category: string;
  start_date: string;
  end_date: string;
  site_entry_asset_id: string;
  site_entry_asset_name?: string;
  requester_id: string;
  requester_display_name?: string;
  pax_count?: number;
  created_at: string;
}

export interface AdsBoardingPassenger {
  id: string;
  ads_pax_id: string | null;
  user_id: string | null;
  contact_id: string | null;
  display_name: string;
  badge_number: string | null;
  company_name: string | null;
  boarding_status: "pending" | "boarded" | "no_show" | "offloaded";
  boarded_at: string | null;
  compliance_ok: boolean;
}

export interface AdsBoardingManifest {
  manifest_id: string;
  voyage_reference: string;
  vessel_name: string | null;
  departure_date: string;
  passengers: AdsBoardingPassenger[];
}

export interface AdsBoardingContext {
  ads_id: string;
  ads_reference: string;
  status: string;
  site_name: string;
  start_date: string;
  end_date: string;
  visit_purpose: string;
  pax_total: number;
  pax_boarded: number;
  qr_url: string;
  manifests: AdsBoardingManifest[];
  unassigned_pax: AdsBoardingPassenger[];
  declared_pax: AdsBoardingPassenger[];
}

// ── PackLog (Cargo / Colis) ───────────────────────────────────────────

export interface CargoRead {
  id: string;
  reference: string;
  cargo_type: string;
  status: string;
  workflow_status: string;
  description: string | null;
  designation?: string | null;
  sender_name: string | null;
  recipient_name: string | null;
  receiver_name?: string | null;
  destination_asset_id: string | null;
  destination_asset_name: string | null;
  origin_name: string | null;
  weight_kg: number | null;
  // Dimensions
  width_cm?: number | null;
  length_cm?: number | null;
  height_cm?: number | null;
  surface_m2?: number | null;
  package_count?: number;
  stackable?: boolean;
  tracking_code: string | null;
  hazmat: boolean;
  hazmat_validated?: boolean;
  /** Linked cargo request (used to download the LT — lettre de transport). */
  request_id: string | null;
  request_code?: string | null;
  request_title?: string | null;
  created_at: string;
  received_at: string | null;
  received_by_name: string | null;
  // Pickup
  pickup_location_label?: string | null;
  pickup_latitude?: number | null;
  pickup_longitude?: number | null;
  pickup_contact_display_name?: string | null;
  pickup_contact_phone?: string | null;
  // Requester
  requester_name?: string | null;
  // Imputation / SAP
  imputation_reference_code?: string | null;
  imputation_reference_name?: string | null;
  sap_article_code?: string | null;
  // Lifting / evidence
  lifting_provider?: string | null;
  lifting_points_certified?: boolean;
  weight_ticket_provided?: boolean;
  photo_evidence_count?: number;
  document_attachment_count?: number;
  // Zone
  planned_zone_name?: string | null;
  // Damage / reception notes
  damage_notes?: string | null;
}

export interface CargoTrackingRead {
  reference: string;
  status: string;
  cargo_type: string;
  description: string | null;
  sender_name: string | null;
  recipient_name: string | null;
  destination_name: string | null;
  origin_name: string | null;
  created_at: string;
  events: CargoTrackingEvent[];
}

export interface CargoTrackingEvent {
  timestamp: string;
  status: string;
  location: string | null;
  notes: string | null;
}

export interface CargoComplianceCheck {
  cargo_id: string;
  overall_status: "pass" | "fail" | "pending";
  checks: CargoComplianceItem[];
}

export interface CargoComplianceItem {
  rule: string;
  status: "pass" | "fail" | "pending";
  message: string | null;
}

export interface PackageElement {
  id: string;
  cargo_id: string;
  description: string;
  quantity: number;
  weight_kg: number | null;
  sap_code: string | null;
  notes: string | null;
  return_status: string | null;
}

export interface CargoReceiptConfirm {
  received_quantity?: number | null;
  declared_quantity?: number | null;
  recipient_available?: boolean;
  signature_collected?: boolean;
  damage_notes?: string | null;
  photo_evidence_count?: number;
  notes?: string | null;
}
