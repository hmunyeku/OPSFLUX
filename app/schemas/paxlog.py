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


class ComplianceCheckResult(BaseModel):
    user_id: UUID | None = None
    contact_id: UUID | None = None
    asset_id: UUID
    compliant: bool
    missing_credentials: list[str] = []
    expired_credentials: list[str] = []
    pending_credentials: list[str] = []


# ══════════════════════════════════════════════════════════════════════════════
# AVIS DE SÉJOUR (AdS)
# ══════════════════════════════════════════════════════════════════════════════

class AdsPaxEntry(BaseModel):
    """Identifies a PAX by user_id or contact_id (exactly one)."""
    user_id: UUID | None = None
    contact_id: UUID | None = None


class AdsCreate(BaseModel):
    type: str = Field(default="individual", pattern=r"^(individual|team)$")
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
    outbound_transport_mode: str | None = None
    outbound_departure_base_id: UUID | None = None
    outbound_notes: str | None = None
    return_transport_mode: str | None = None
    return_departure_base_id: UUID | None = None
    return_notes: str | None = None


class AdsUpdate(BaseModel):
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


class AdsRead(OpsFluxSchema):
    id: UUID
    entity_id: UUID
    reference: str
    type: str
    status: str
    workflow_id: UUID | None
    planner_activity_id: UUID | None = None
    project_id: UUID | None = None
    requester_id: UUID
    site_entry_asset_id: UUID
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
    archived: bool
    created_at: datetime
    updated_at: datetime


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
    pax_count: int = 0
    created_at: datetime


# ══════════════════════════════════════════════════════════════════════════════
# PAX INCIDENTS
# ══════════════════════════════════════════════════════════════════════════════

class PaxIncidentCreate(BaseModel):
    user_id: UUID | None = None
    contact_id: UUID | None = None
    company_id: UUID | None = None
    asset_id: UUID | None = None
    severity: str = Field(pattern=r"^(info|warning|temp_ban|permanent_ban)$")
    description: str = Field(min_length=1)
    incident_date: date
    ban_start_date: date | None = None
    ban_end_date: date | None = None


class PaxIncidentResolve(BaseModel):
    resolution_notes: str | None = None


class PaxIncidentRead(OpsFluxSchema):
    id: UUID
    entity_id: UUID
    user_id: UUID | None = None
    contact_id: UUID | None = None
    company_id: UUID | None
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
    linked_ads_id: UUID | None
    due_date: date | None
    completed_at: datetime | None
    notes: str | None
    auto_generated: bool


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
    pax_quota: int | None = None


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
    preparation_progress: int = 0


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
    created_at: datetime
