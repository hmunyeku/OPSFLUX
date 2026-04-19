"""Pydantic schemas for MOC (Management of Change) module."""

from __future__ import annotations

from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


# ─── Create / Update ──────────────────────────────────────────────────────────


class MOCCreate(BaseModel):
    """Initial MOC creation — minimal required fields per CDC §4.1.

    Either `installation_id` (preferred — auto-derives site + platform from
    the asset registry hierarchy) OR both `site_label` + `platform_code`
    must be provided. Backend raises a 400 otherwise.
    """

    initiator_name: str | None = None
    initiator_function: str | None = None
    site_label: str | None = Field(default=None, max_length=100)
    site_id: UUID | None = None
    platform_code: str | None = Field(default=None, max_length=60)
    installation_id: UUID | None = None
    objectives: str | None = None
    description: str | None = None
    current_situation: str | None = None
    proposed_changes: str | None = None
    impact_analysis: str | None = None
    modification_type: str | None = Field(
        default=None, pattern="^(permanent|temporary)$"
    )
    temporary_duration_days: int | None = Field(default=None, ge=1)
    temporary_start_date: date | None = None
    temporary_end_date: date | None = None
    planned_implementation_date: date | None = None
    tags: list[str] | None = None
    metadata_: dict | None = Field(default=None, alias="metadata")


class MOCUpdate(BaseModel):
    """Update any MOC field — access controlled by status+role in service."""

    initiator_name: str | None = None
    initiator_function: str | None = None
    site_label: str | None = None
    site_id: UUID | None = None
    platform_code: str | None = None
    installation_id: UUID | None = None
    objectives: str | None = None
    description: str | None = None
    current_situation: str | None = None
    proposed_changes: str | None = None
    impact_analysis: str | None = None
    modification_type: str | None = None
    temporary_duration_days: int | None = None
    temporary_start_date: date | None = None
    temporary_end_date: date | None = None
    planned_implementation_date: date | None = None
    actual_implementation_date: date | None = None
    tags: list[str] | None = None
    # Hierarchy / site chief review
    is_real_change: bool | None = None
    hierarchy_review_comment: str | None = None
    site_chief_approved: bool | None = None
    site_chief_comment: str | None = None
    # Director
    director_comment: str | None = None
    priority: str | None = Field(default=None, pattern="^[123]$")
    # Study
    estimated_cost_mxaf: float | None = None
    cost_bucket: str | None = Field(
        default=None, pattern="^(lt_20|20_to_50|50_to_100|gt_100)$"
    )
    # Parallel validation flags
    hazop_required: bool | None = None
    hazop_completed: bool | None = None
    hazid_required: bool | None = None
    hazid_completed: bool | None = None
    environmental_required: bool | None = None
    environmental_completed: bool | None = None
    pid_update_required: bool | None = None
    pid_update_completed: bool | None = None
    esd_update_required: bool | None = None
    esd_update_completed: bool | None = None
    # DO / DG execution accords — "Réalisation du MOC" paper form p.5
    do_execution_accord: bool | None = None
    dg_execution_accord: bool | None = None
    do_execution_comment: str | None = None
    dg_execution_comment: str | None = None


# ─── Status transition ────────────────────────────────────────────────────────


class MOCTransition(BaseModel):
    """Fire a status transition.

    `to_status` must match one of the states declared in app.models.moc.
    Extra payload is merged into the matching MOC column (e.g. `priority`
    when moving to `approved_to_study`).
    """

    to_status: str = Field(..., min_length=1, max_length=30)
    comment: str | None = None
    payload: dict | None = None


# ─── Validation matrix entries ────────────────────────────────────────────────


class MOCValidationUpsert(BaseModel):
    role: str = Field(
        ...,
        pattern="^(hse|lead_process|production_manager|gas_manager|maintenance_manager|process_engineer|metier)$",
    )
    metier_code: str | None = None
    metier_name: str | None = None
    required: bool | None = None
    completed: bool | None = None
    approved: bool | None = None
    level: str | None = Field(default=None, pattern="^(DO|DG|DO_AND_DG)$")
    comments: str | None = None


class MOCValidationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    role: str
    metier_code: str | None
    metier_name: str | None
    required: bool
    completed: bool
    approved: bool | None
    validator_id: UUID | None
    validator_name: str | None
    level: str | None
    comments: str | None
    validated_at: datetime | None


# ─── Execution accords (DO / DG — paper form "Réalisation du MOC") ────────────


class MOCExecutionAccord(BaseModel):
    """Body for POST /moc/{id}/execution-accord — DO or DG giving Accord/Refus."""

    actor: str = Field(..., pattern="^(do|dg)$")
    accord: bool  # True = Accord, False = Refus
    comment: str | None = None


# ─── Site assignments (CDC §4.4 "contacts des valideurs") ─────────────────────


class MOCSiteAssignmentCreate(BaseModel):
    site_label: str = Field(..., min_length=1, max_length=100)
    role: str = Field(
        ...,
        pattern="^(site_chief|director|lead_process|hse|production_manager|gas_manager|maintenance_manager)$",
    )
    user_id: UUID
    active: bool = True


class MOCSiteAssignmentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    site_label: str
    role: str
    user_id: UUID
    user_display: str | None = None
    active: bool
    created_at: datetime


# ─── Status history ───────────────────────────────────────────────────────────


class MOCStatusHistoryRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    old_status: str | None
    new_status: str
    changed_by: UUID
    changed_by_name: str | None = None
    note: str | None
    created_at: datetime


# ─── Main Read schema ─────────────────────────────────────────────────────────


class MOCRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    reference: str
    status: str
    status_changed_at: datetime
    created_at: datetime
    updated_at: datetime

    # Location
    site_label: str
    site_id: UUID | None
    platform_code: str
    installation_id: UUID | None

    # Initiator
    initiator_id: UUID
    initiator_name: str | None
    initiator_function: str | None

    # Content
    objectives: str | None
    description: str | None
    current_situation: str | None
    proposed_changes: str | None
    impact_analysis: str | None
    modification_type: str | None
    temporary_duration_days: int | None
    temporary_start_date: date | None
    temporary_end_date: date | None

    # Hierarchy review
    is_real_change: bool | None
    hierarchy_reviewer_id: UUID | None
    hierarchy_review_at: datetime | None
    hierarchy_review_comment: str | None

    # Site chief
    site_chief_approved: bool | None
    site_chief_id: UUID | None
    site_chief_approved_at: datetime | None
    site_chief_comment: str | None

    # Director
    director_id: UUID | None
    director_confirmed_at: datetime | None
    director_comment: str | None
    priority: str | None

    # Study
    lead_process_id: UUID | None
    responsible_id: UUID | None
    study_started_at: datetime | None
    study_completed_at: datetime | None
    estimated_cost_mxaf: float | None
    cost_bucket: str | None

    # Validation flags
    hazop_required: bool
    hazop_completed: bool
    hazid_required: bool
    hazid_completed: bool
    environmental_required: bool
    environmental_completed: bool
    pid_update_required: bool
    pid_update_completed: bool
    esd_update_required: bool
    esd_update_completed: bool

    # DO / DG execution accords
    do_execution_accord: bool | None
    dg_execution_accord: bool | None
    do_execution_accord_at: datetime | None
    dg_execution_accord_at: datetime | None
    do_execution_accord_by: UUID | None
    dg_execution_accord_by: UUID | None
    do_execution_comment: str | None
    dg_execution_comment: str | None

    # Execution
    execution_started_at: datetime | None
    execution_completed_at: datetime | None
    execution_supervisor_id: UUID | None
    planned_implementation_date: date | None
    actual_implementation_date: date | None

    tags: list | None
    metadata_: dict | None = Field(default=None, alias="metadata")

    # Enrichments (populated by service)
    initiator_display: str | None = None
    site_chief_display: str | None = None
    director_display: str | None = None
    responsible_display: str | None = None


class MOCReadWithDetails(MOCRead):
    """Extended read schema with status history + validations."""

    status_history: list[MOCStatusHistoryRead] = []
    validations: list[MOCValidationRead] = []


# ─── Stats ────────────────────────────────────────────────────────────────────


class MOCStatsByStatus(BaseModel):
    status: str
    count: int


class MOCStatsBySite(BaseModel):
    site_label: str
    count: int
    percentage: float


class MOCStatsByType(BaseModel):
    modification_type: str
    count: int
    percentage: float


class MOCStatsSummary(BaseModel):
    total: int
    by_status: list[MOCStatsByStatus]
    by_site: list[MOCStatsBySite]
    by_type: list[MOCStatsByType]
    by_priority: list[MOCStatsByStatus]  # reuse shape
    avg_cycle_time_days: float | None
