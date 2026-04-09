"""Pydantic schemas for PaxLog module.

PAX identity lives on User (internal) and TierContact (external).
"PAX Profile" is a virtual read-view projected from either source.
"""

from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, Field

from app.schemas.common import OpsFluxSchema


# ══════════════════════════════════════════════════════════════════════════════
# PAX PROFILES (virtual view over User / TierContact)
# ══════════════════════════════════════════════════════════════════════════════

class PaxProfileRead(OpsFluxSchema):
    """Unified read DTO for a PAX — backed by either User or TierContact."""
    id: UUID
    pax_source: str  # "user" | "contact"
    entity_id: UUID
    pax_type: str  # "internal" | "external"
    first_name: str
    last_name: str
    birth_date: date | None = None
    nationality: str | None = None
    company_id: UUID | None = None
    company_name: str | None = None
    group_id: UUID | None = None
    badge_number: str | None = None
    photo_url: str | None = None
    email: str | None = None
    linked_user_id: UUID | None = None
    linked_user_email: str | None = None
    linked_user_active: bool | None = None
    active: bool = True
    created_at: datetime | None = None
    updated_at: datetime | None = None


class PaxProfileSummary(OpsFluxSchema):
    """Lightweight PAX summary for lists and pickers."""
    id: UUID
    pax_source: str  # "user" | "contact"
    entity_id: UUID | None = None
    pax_type: str
    first_name: str
    last_name: str
    company_id: UUID | None = None
    company_name: str | None = None
    badge_number: str | None = None
    active: bool = True
    created_at: datetime | None = None


class PaxProfileUpdate(BaseModel):
    """Update PAX-specific fields on a User or TierContact."""
    birth_date: date | None = None
    nationality: str | None = None
    badge_number: str | None = None
    photo_url: str | None = None
    pax_group_id: UUID | None = None


class PaxSitePresenceRead(OpsFluxSchema):
    ads_id: UUID
    ads_reference: str
    ads_status: str
    pax_status: str | None = None
    site_asset_id: UUID
    site_name: str | None = None
    start_date: date | None = None
    end_date: date | None = None
    visit_purpose: str | None = None
    visit_category: str | None = None
    boarding_status: str | None = None
    boarded_at: datetime | None = None
    approved_at: datetime | None = None
    completed_at: datetime | None = None


# ══════════════════════════════════════════════════════════════════════════════
# CREDENTIAL TYPES
# ══════════════════════════════════════════════════════════════════════════════

class CredentialTypeCreate(BaseModel):
    code: str = Field(min_length=1, max_length=50)
    name: str = Field(min_length=1, max_length=200)
    category: str = Field(pattern=r"^(safety|medical|technical|administrative)$")
    has_expiry: bool = True
    validity_months: int | None = None
    proof_required: bool = True
    booking_service_id: UUID | None = None


class CredentialTypeRead(OpsFluxSchema):
    id: UUID
    code: str
    name: str
    category: str
    has_expiry: bool
    validity_months: int | None
    proof_required: bool
    booking_service_id: UUID | None
    active: bool
    created_at: datetime


# ══════════════════════════════════════════════════════════════════════════════
# PAX CREDENTIALS
# ══════════════════════════════════════════════════════════════════════════════

class PaxCredentialCreate(BaseModel):
    credential_type_id: UUID
    obtained_date: date
    expiry_date: date | None = None
    proof_url: str | None = None
    notes: str | None = None


class PaxCredentialValidate(BaseModel):
    action: str = Field(pattern=r"^(approve|reject)$")
    rejection_reason: str | None = None


class PaxCredentialRead(OpsFluxSchema):
    id: UUID
    user_id: UUID | None = None
    contact_id: UUID | None = None
    credential_type_id: UUID
    obtained_date: date
    expiry_date: date | None
    proof_url: str | None
    status: str
    validated_by: UUID | None
    validated_at: datetime | None
    rejection_reason: str | None
    notes: str | None
    created_at: datetime
    updated_at: datetime


# ══════════════════════════════════════════════════════════════════════════════
# COMPLIANCE MATRIX
# ══════════════════════════════════════════════════════════════════════════════

class ComplianceMatrixCreate(BaseModel):
    asset_id: UUID
    credential_type_id: UUID
    mandatory: bool = True
    scope: str = Field(
        default="all_visitors",
        pattern=r"^(all_visitors|contractors_only|permanent_staff_only)$",
    )
    defined_by: str = Field(pattern=r"^(hse_central|site)$")
    effective_date: date | None = None
    notes: str | None = None


class ComplianceMatrixRead(OpsFluxSchema):
    id: UUID
    entity_id: UUID
    asset_id: UUID
    credential_type_id: UUID
    mandatory: bool
    scope: str
    defined_by: str
    set_by: UUID
    effective_date: date
    notes: str | None


class ComplianceRequirementResult(BaseModel):
    credential_type_code: str
    credential_type_name: str
    status: str
    message: str
    expiry_date: date | None = None
    layer: str | None = None
    layer_label: str | None = None
    blocking: bool = True


class ComplianceCheckResult(BaseModel):
    user_id: UUID | None = None
    contact_id: UUID | None = None
    asset_id: UUID
    compliant: bool
    missing_credentials: list[str] = []
    expired_credentials: list[str] = []
    pending_credentials: list[str] = []
    results: list[ComplianceRequirementResult] = []
    covered_layers: list[str] = []
    summary_by_status: dict[str, int] = Field(default_factory=dict)
    verification_sequence: list[str] = []


# ══════════════════════════════════════════════════════════════════════════════
# AVIS DE SÉJOUR (AdS)
# ══════════════════════════════════════════════════════════════════════════════

class AdsPaxEntry(BaseModel):
    """Identifies a PAX by user_id or contact_id (exactly one)."""
    user_id: UUID | None = None
    contact_id: UUID | None = None


class AdsCreate(BaseModel):
    type: str = Field(default="individual", pattern=r"^(individual|team)$")
    requester_id: UUID | None = None
    site_entry_asset_id: UUID
    visit_purpose: str = Field(min_length=1)
    visit_category: str = Field(
        pattern=r"^(project_work|maintenance|inspection|visit|permanent_ops|other)$"
    )
    start_date: date
    end_date: date
    pax_entries: list[AdsPaxEntry] = []
    planner_activity_id: UUID | None = None
    project_id: UUID | None = None
    allowed_company_ids: list[UUID] = []
    outbound_transport_mode: str | None = None
    outbound_departure_base_id: UUID | None = None
    outbound_notes: str | None = None
    return_transport_mode: str | None = None
    return_departure_base_id: UUID | None = None
    return_notes: str | None = None


class AdsUpdate(BaseModel):
    project_id: UUID | None = None
    visit_purpose: str | None = None
    visit_category: str | None = None
    start_date: date | None = None
    end_date: date | None = None
    allowed_company_ids: list[UUID] | None = None
    outbound_transport_mode: str | None = None
    outbound_departure_base_id: UUID | None = None
    outbound_notes: str | None = None
    return_transport_mode: str | None = None
    return_departure_base_id: UUID | None = None
    return_notes: str | None = None


class AdsStayChangeRequest(BaseModel):
    reason: str = Field(min_length=1)
    visit_purpose: str | None = None
    visit_category: str | None = None
    start_date: date | None = None
    end_date: date | None = None
    outbound_transport_mode: str | None = None
    outbound_departure_base_id: UUID | None = None
    outbound_notes: str | None = None
    return_transport_mode: str | None = None
    return_departure_base_id: UUID | None = None
    return_notes: str | None = None


class AdsManualDepartureRequest(BaseModel):
    reason: str = Field(min_length=1)


class AdsPaxDecision(BaseModel):
    action: str = Field(pattern=r"^(approve|reject|waitlist)$")
    reason: str | None = None


class AdsWaitlistPriorityUpdate(BaseModel):
    priority_score: int = Field(ge=0, le=9999)
    reason: str | None = None


class AdsPaxRead(OpsFluxSchema):
    id: UUID
    ads_id: UUID
    user_id: UUID | None = None
    contact_id: UUID | None = None
    status: str
    compliance_checked_at: datetime | None
    compliance_summary: dict | None
    booking_request_sent: bool
    current_onboard: bool
    priority_score: int
    priority_source: str | None = None


class AdsWaitlistItemRead(OpsFluxSchema):
    ads_id: UUID
    ads_reference: str
    ads_status: str
    ads_pax_id: UUID
    planner_activity_id: UUID | None = None
    planner_activity_title: str | None = None
    site_entry_asset_id: UUID | None = None
    site_name: str | None = None
    requester_id: UUID | None = None
    requester_name: str | None = None
    user_id: UUID | None = None
    contact_id: UUID | None = None
    pax_first_name: str
    pax_last_name: str
    pax_company_name: str | None = None
    priority_score: int
    priority_source: str | None = None
    capacity_scope: str | None = None
    capacity_limit: int | None = None
    reserved_pax_count: int | None = None
    remaining_capacity: int | None = None
    submitted_at: datetime | None = None
    waitlisted_at: datetime | None = None


class AdsRead(OpsFluxSchema):
    id: UUID
    entity_id: UUID
    reference: str
    type: str
    status: str
    workflow_id: UUID | None
    created_by: UUID
    created_by_name: str | None = None
    planner_activity_id: UUID | None = None
    planner_activity_title: str | None = None
    planner_activity_status: str | None = None
    project_id: UUID | None = None
    project_name: str | None = None
    linked_projects: list["AdsLinkedProjectRead"] = []
    allowed_company_ids: list[UUID] = []
    allowed_company_names: list[str] = []
    project_manager_id: UUID | None = None
    project_manager_name: str | None = None
    requester_id: UUID
    requester_name: str | None = None
    site_entry_asset_id: UUID
    site_name: str | None = None
    visit_purpose: str
    visit_category: str
    start_date: date
    end_date: date
    outbound_transport_mode: str | None
    return_transport_mode: str | None
    cross_company_flag: bool
    submitted_at: datetime | None
    approved_at: datetime | None
    rejected_at: datetime | None
    rejection_reason: str | None
    origin_mission_notice_id: UUID | None = None
    origin_mission_notice_reference: str | None = None
    origin_mission_notice_title: str | None = None
    origin_mission_program_id: UUID | None = None
    origin_mission_program_activity: str | None = None
    archived: bool
    created_at: datetime
    updated_at: datetime


class AdsBoardingUnassignedPaxRead(OpsFluxSchema):
    ads_pax_id: UUID
    user_id: UUID | None = None
    contact_id: UUID | None = None
    name: str
    company: str | None = None
    badge_number: str | None = None
    pax_status: str | None = None


class AdsBoardingPassengerRead(OpsFluxSchema):
    id: UUID
    ads_pax_id: UUID | None = None
    manifest_id: UUID
    voyage_id: UUID
    user_id: UUID | None = None
    contact_id: UUID | None = None
    name: str
    company: str | None = None
    badge_number: str | None = None
    pax_status: str | None = None
    boarding_status: str
    boarded_at: datetime | None = None
    standby: bool = False


class AdsBoardingManifestRead(OpsFluxSchema):
    manifest_id: UUID
    manifest_status: str
    voyage_id: UUID
    voyage_code: str
    voyage_status: str
    scheduled_departure: datetime | None = None
    scheduled_arrival: datetime | None = None
    passenger_count: int = 0
    boarded_count: int = 0
    passengers: list[AdsBoardingPassengerRead] = []


class AdsBoardingContextRead(OpsFluxSchema):
    ads_id: UUID
    entity_id: UUID
    reference: str
    status: str
    site_name: str | None = None
    visit_purpose: str | None = None
    visit_category: str | None = None
    start_date: date | None = None
    end_date: date | None = None
    pax_count: int = 0
    qr_url: str | None = None
    manifests: list[AdsBoardingManifestRead] = []
    unassigned_pax: list[AdsBoardingUnassignedPaxRead] = []


class AdsBoardingPassengerUpdate(BaseModel):
    boarding_status: str = Field(pattern=r"^(pending|checked_in|boarded|no_show|offloaded)$")


class AdsLinkedProjectRead(OpsFluxSchema):
    project_id: UUID
    project_name: str | None = None
    project_manager_id: UUID | None = None
    project_manager_name: str | None = None


class AdsSummary(OpsFluxSchema):
    id: UUID
    entity_id: UUID
    reference: str
    type: str
    status: str
    requester_id: UUID
    site_entry_asset_id: UUID
    visit_category: str
    start_date: date
    end_date: date
    allowed_company_ids: list[UUID] = []
    allowed_company_names: list[str] = []
    pax_count: int = 0
    pax_display_name: str | None = None
    imputation_label: str | None = None
    created_at: datetime


class AdsValidationQueueItemRead(OpsFluxSchema):
    id: UUID
    reference: str
    status: str
    requester_id: UUID
    requester_name: str | None = None
    site_entry_asset_id: UUID
    site_name: str | None = None
    visit_category: str
    start_date: date
    end_date: date
    pax_count: int = 0
    planner_activity_id: UUID | None = None
    planner_activity_title: str | None = None
    capacity_scope: str | None = None
    capacity_limit: int | None = None
    reserved_pax_count: int | None = None
    remaining_capacity: int | None = None
    forecast_pax: int | None = None
    real_pob: int | None = None
    blocked_pax_count: int = 0
    linked_project_count: int = 0
    linked_project_names: list[str] = []
    stay_program_count: int = 0
    daily_capacity_preview: list["AdsValidationDailyPreviewItemRead"] = []
    created_at: datetime


class AdsValidationDailyPreviewItemRead(OpsFluxSchema):
    date: date
    forecast_pax: int | None = None
    real_pob: int | None = None
    capacity_limit: int | None = None
    remaining_capacity: int | None = None
    saturation_pct: float | None = None
    is_critical: bool = False


class AdsEventRead(OpsFluxSchema):
    id: UUID
    entity_id: UUID
    ads_id: UUID
    ads_pax_id: UUID | None = None
    event_type: str
    old_status: str | None = None
    new_status: str | None = None
    actor_id: UUID | None = None
    reason: str | None = None
    metadata_json: dict | None = None
    recorded_at: datetime


class ExternalAccessEventRead(BaseModel):
    timestamp: datetime | None = None
    action: str
    otp_validated: bool | None = None
    metadata: dict | None = None


class AdsExternalLinkSecurityRead(OpsFluxSchema):
    id: UUID
    ads_id: UUID
    created_by: UUID
    otp_required: bool
    otp_destination_masked: str | None = None
    expires_at: datetime
    max_uses: int
    use_count: int
    remaining_uses: int | None = None
    revoked: bool
    active: bool
    created_at: datetime
    session_expires_at: datetime | None = None
    last_validated_at: datetime | None = None
    anomaly_count: int = 0
    anomaly_actions: dict[str, int] = {}
    recent_events: list[ExternalAccessEventRead] = []


class ExternalPaxCredentialRead(BaseModel):
    id: str
    credential_type_code: str | None = None
    credential_type_name: str | None = None
    status: str
    obtained_date: str | None = None
    expiry_date: str | None = None
    proof_url: str | None = None


class ExternalPaxComplianceBlockerRead(BaseModel):
    credential_type_code: str | None = None
    credential_type_name: str | None = None
    status: str | None = None
    message: str | None = None
    expiry_date: str | None = None
    layer_label: str | None = None


class ExternalPaxRequiredActionRead(BaseModel):
    code: str
    kind: str
    field: str | None = None
    credential_type_code: str | None = None
    status: str | None = None
    label: str | None = None
    message: str | None = None
    layer_label: str | None = None
    expiry_date: str | None = None


class ExternalPaxDossierRead(BaseModel):
    entry_id: str
    contact_id: str
    user_id: str | None = None
    pax_source: str | None = None
    first_name: str
    last_name: str
    birth_date: str | None = None
    nationality: str | None = None
    badge_number: str | None = None
    photo_url: str | None = None
    email: str | None = None
    phone: str | None = None
    contractual_airport: str | None = None
    nearest_airport: str | None = None
    nearest_station: str | None = None
    pickup_address_line1: str | None = None
    pickup_address_line2: str | None = None
    pickup_city: str | None = None
    pickup_state_province: str | None = None
    pickup_postal_code: str | None = None
    pickup_country: str | None = None
    job_position_id: str | None = None
    job_position_name: str | None = None
    position: str | None = None
    status: str
    company_id: str
    compliance_ok: bool
    compliance_blocker_count: int = 0
    compliance_blockers: list[ExternalPaxComplianceBlockerRead] = []
    missing_identity_fields: list[str] = []
    required_actions: list[ExternalPaxRequiredActionRead] = []
    credentials: list[ExternalPaxCredentialRead] = []
    linked_user_id: str | None = None
    linked_user_email: str | None = None
    linked_user_active: bool | None = None


class ExternalAdsSummaryRead(BaseModel):
    id: str
    reference: str
    status: str
    visit_purpose: str
    visit_category: str
    start_date: str
    end_date: str
    site_entry_asset_id: str
    site_name: str | None = None
    project_id: str | None = None
    project_name: str | None = None
    linked_projects: list["ExternalLinkedProjectRead"] = []
    outbound_transport_mode: str | None = None
    outbound_departure_base_id: str | None = None
    outbound_departure_base_name: str | None = None
    outbound_notes: str | None = None
    return_transport_mode: str | None = None
    return_departure_base_id: str | None = None
    return_departure_base_name: str | None = None
    return_notes: str | None = None
    rejection_reason: str | None = None


class ExternalLinkedProjectRead(BaseModel):
    project_id: str
    project_name: str | None = None


class ExternalPaxSummaryRead(BaseModel):
    total: int = 0
    pending_check: int = 0
    compliant: int = 0
    blocked: int = 0
    approved: int = 0


class ExternalAdsDossierRead(BaseModel):
    ads: ExternalAdsSummaryRead
    allowed_company_id: str | None = None
    allowed_company_name: str | None = None
    allowed_company_ids: list[str] = []
    allowed_company_names: list[str] = []
    scope_label: str | None = None
    ready_for_submission: bool = False
    submission_blockers: list[str] = []
    can_submit: bool = False
    can_resubmit: bool = False
    preconfigured_data: dict = {}
    pax_summary: ExternalPaxSummaryRead = Field(default_factory=ExternalPaxSummaryRead)
    pax: list[ExternalPaxDossierRead] = []


class AdsImputationSuggestionRead(BaseModel):
    owner_type: str = "ads"
    owner_id: UUID
    imputation_reference_id: UUID | None = None
    imputation_reference_code: str | None = None
    imputation_reference_name: str | None = None
    imputation_type: str | None = None
    otp_policy: str | None = None
    project_id: UUID | None = None
    project_name: str | None = None
    project_source: str = "none"
    cost_center_id: UUID | None = None
    cost_center_name: str | None = None
    cost_center_source: str = "none"
    resolution_notes: list[str] = []


# ══════════════════════════════════════════════════════════════════════════════
# PAX INCIDENTS
# ══════════════════════════════════════════════════════════════════════════════

class PaxIncidentCreate(BaseModel):
    user_id: UUID | None = None
    contact_id: UUID | None = None
    company_id: UUID | None = None
    pax_group_id: UUID | None = None
    asset_id: UUID | None = None
    severity: str = Field(pattern=r"^(info|warning|site_ban|temp_ban|permanent_ban)$")
    description: str = Field(min_length=1)
    incident_date: date
    ban_start_date: date | None = None
    ban_end_date: date | None = None
    category: str | None = None
    decision: str | None = None
    decision_duration_days: int | None = None


class PaxIncidentResolve(BaseModel):
    resolution_notes: str | None = None


class PaxIncidentRead(OpsFluxSchema):
    id: UUID
    entity_id: UUID
    user_id: UUID | None = None
    contact_id: UUID | None = None
    company_id: UUID | None
    pax_group_id: UUID | None = None
    asset_id: UUID | None
    severity: str
    description: str
    incident_date: date
    ban_start_date: date | None
    ban_end_date: date | None
    recorded_by: UUID
    resolved_at: datetime | None
    resolved_by: UUID | None
    resolution_notes: str | None
    created_at: datetime
    reference: str | None = None
    category: str | None = None
    decision: str | None = None
    decision_duration_days: int | None = None
    decision_end_date: date | None = None
    evidence_urls: list | None = None
    pax_first_name: str | None = None
    pax_last_name: str | None = None
    company_name: str | None = None
    group_name: str | None = None
    asset_name: str | None = None


class PaxGroupRead(OpsFluxSchema):
    id: UUID
    entity_id: UUID
    name: str
    company_id: UUID | None = None
    company_name: str | None = None
    active: bool


class RotationCycleRead(OpsFluxSchema):
    id: UUID
    entity_id: UUID
    user_id: UUID | None = None
    contact_id: UUID | None = None
    site_asset_id: UUID
    status: str
    days_on: int
    days_off: int
    start_date: date | None = None
    end_date: date | None = None
    current_cycle_start: date | None = None
    next_rotation_date: date | None = None
    notes: str | None = None
    auto_create_ads: bool = True
    ads_lead_days: int = 7
    default_project_id: UUID | None = None
    default_cc_id: UUID | None = None
    created_at: datetime
    updated_at: datetime | None = None
    pax_first_name: str | None = None
    pax_last_name: str | None = None
    site_name: str | None = None
    company_name: str | None = None
    compliance_risk_level: str = "clear"
    compliance_issue_count: int = 0
    compliance_issue_preview: list[str] = []


# ══════════════════════════════════════════════════════════════════════════════
# AVIS DE MISSION (AVM)
# ══════════════════════════════════════════════════════════════════════════════

class MissionProgramCreate(BaseModel):
    activity_description: str = Field(min_length=1)
    activity_type: str = Field(
        default="visit",
        pattern=r"^(visit|meeting|inspection|training|handover|other)$",
    )
    site_asset_id: UUID | None = None
    planned_start_date: date | None = None
    planned_end_date: date | None = None
    project_id: UUID | None = None
    pax_entries: list[AdsPaxEntry] = []
    notes: str | None = None


class MissionProgramRead(OpsFluxSchema):
    id: UUID
    mission_notice_id: UUID
    order_index: int
    activity_description: str
    activity_type: str
    site_asset_id: UUID | None
    planned_start_date: date | None
    planned_end_date: date | None
    project_id: UUID | None
    generated_ads_id: UUID | None
    generated_ads_reference: str | None = None
    generated_ads_status: str | None = None
    notes: str | None
    pax_entries: list[AdsPaxEntry] = []
    site_name: str | None = None


class MissionPreparationTaskRead(OpsFluxSchema):
    id: UUID
    mission_notice_id: UUID
    title: str
    task_type: str
    status: str
    assigned_to_user_id: UUID | None
    assigned_to_user_name: str | None = None
    linked_ads_id: UUID | None
    linked_ads_reference: str | None = None
    due_date: date | None
    completed_at: datetime | None
    notes: str | None
    auto_generated: bool


class MissionPreparationTaskUpdate(BaseModel):
    status: str | None = Field(
        default=None,
        pattern=r"^(pending|in_progress|completed|cancelled|blocked|na)$",
    )
    assigned_to_user_id: UUID | None = None
    due_date: date | None = None
    notes: str | None = Field(default=None, max_length=2000)


class MissionVisaFollowupRead(OpsFluxSchema):
    id: UUID
    mission_notice_id: UUID
    preparation_task_id: UUID | None = None
    user_id: UUID | None = None
    contact_id: UUID | None = None
    pax_name: str | None = None
    company_name: str | None = None
    status: str
    visa_type: str | None = None
    country: str | None = None
    submitted_at: datetime | None = None
    obtained_at: datetime | None = None
    refused_at: datetime | None = None
    notes: str | None = None
    created_at: datetime
    updated_at: datetime


class MissionVisaFollowupUpdate(BaseModel):
    status: str | None = Field(
        default=None,
        pattern=r"^(to_initiate|submitted|in_review|obtained|refused)$",
    )
    visa_type: str | None = None
    country: str | None = None
    notes: str | None = Field(default=None, max_length=2000)


class MissionAllowanceRequestRead(OpsFluxSchema):
    id: UUID
    mission_notice_id: UUID
    preparation_task_id: UUID | None = None
    user_id: UUID | None = None
    contact_id: UUID | None = None
    pax_name: str | None = None
    company_name: str | None = None
    status: str
    amount: float | None = None
    currency: str | None = None
    submitted_at: datetime | None = None
    approved_at: datetime | None = None
    paid_at: datetime | None = None
    payment_reference: str | None = None
    notes: str | None = None
    created_at: datetime
    updated_at: datetime


class MissionAllowanceRequestUpdate(BaseModel):
    status: str | None = Field(
        default=None,
        pattern=r"^(draft|submitted|approved|paid)$",
    )
    amount: float | None = None
    currency: str | None = None
    payment_reference: str | None = None
    notes: str | None = Field(default=None, max_length=2000)


class MissionNoticeCreate(BaseModel):
    title: str = Field(min_length=1, max_length=300)
    description: str | None = None
    planned_start_date: date | None = None
    planned_end_date: date | None = None
    mission_type: str = Field(
        default="standard",
        pattern=r"^(standard|vip|regulatory|emergency)$",
    )
    requires_badge: bool = False
    requires_epi: bool = False
    requires_visa: bool = False
    eligible_displacement_allowance: bool = False
    epi_measurements: dict | None = None
    global_attachments_config: list[str] = []
    per_pax_attachments_config: list[str] = []
    pax_quota: int = Field(default=0, ge=0)
    programs: list[MissionProgramCreate] = []


class MissionNoticeUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    planned_start_date: date | None = None
    planned_end_date: date | None = None
    mission_type: str | None = Field(
        default=None,
        pattern=r"^(standard|vip|regulatory|emergency)$",
    )
    requires_badge: bool | None = None
    requires_epi: bool | None = None
    requires_visa: bool | None = None
    eligible_displacement_allowance: bool | None = None
    epi_measurements: dict | None = None
    global_attachments_config: list[str] | None = None
    per_pax_attachments_config: list[str] | None = None
    pax_quota: int | None = None


class MissionNoticeModifyRequest(MissionNoticeUpdate):
    reason: str = Field(min_length=3, max_length=1000)


class MissionNoticeRead(OpsFluxSchema):
    id: UUID
    entity_id: UUID
    reference: str
    title: str
    description: str | None
    created_by: UUID
    status: str
    planned_start_date: date | None
    planned_end_date: date | None
    requires_badge: bool
    requires_epi: bool
    requires_visa: bool
    eligible_displacement_allowance: bool
    epi_measurements: dict | None
    global_attachments_config: list[str] = []
    per_pax_attachments_config: list[str] = []
    mission_type: str
    pax_quota: int
    archived: bool
    cancellation_reason: str | None = None
    created_at: datetime
    updated_at: datetime
    # Enriched
    creator_name: str | None = None
    programs: list[MissionProgramRead] = []
    preparation_tasks: list[MissionPreparationTaskRead] = []
    visa_followups: list[MissionVisaFollowupRead] = []
    allowance_requests: list[MissionAllowanceRequestRead] = []
    preparation_progress: int = 0
    open_preparation_tasks: int = 0
    ready_for_approval: bool = False
    last_modification_reason: str | None = None
    last_modified_at: datetime | None = None
    last_modified_by_name: str | None = None
    last_modified_fields: list[str] = []
    last_modification_changes: dict | None = None
    last_linked_ads_set_to_review: int = 0
    last_linked_ads_references: list[str] = []


class MissionNoticeSummary(OpsFluxSchema):
    id: UUID
    entity_id: UUID
    reference: str
    title: str
    status: str
    mission_type: str
    pax_quota: int = 0
    planned_start_date: date | None
    planned_end_date: date | None
    created_by: UUID
    creator_name: str | None = None
    pax_count: int = 0
    preparation_progress: int = 0
    open_preparation_tasks: int = 0
    ready_for_approval: bool = False
    created_at: datetime
