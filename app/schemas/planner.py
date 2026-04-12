"""Planner Pydantic schemas — activities, conflicts, capacity, scenarios."""

from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


# ─── Base ────────────────────────────────────────────────────────────────────

class PlannerSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# ─── Activity schemas ────────────────────────────────────────────────────────

class ActivityRead(PlannerSchema):
    id: UUID
    entity_id: UUID
    asset_id: UUID
    project_id: UUID | None = None
    parent_id: UUID | None = None
    type: str
    subtype: str | None = None
    title: str
    description: str | None = None
    status: str
    priority: str
    pax_quota: int
    pax_quota_mode: str = "constant"
    pax_quota_daily: dict | None = None
    start_date: datetime | None = None
    end_date: datetime | None = None
    actual_start: datetime | None = None
    actual_end: datetime | None = None
    # Workover
    well_reference: str | None = None
    rig_name: str | None = None
    # Drilling
    spud_date: datetime | None = None
    target_depth: float | None = None
    drilling_program_ref: str | None = None
    # Regulatory / maintenance
    regulatory_ref: str | None = None
    work_order_ref: str | None = None
    # CMMS / maintenance
    maintenance_type: str | None = None
    equipment_asset_id: UUID | None = None
    estimated_duration_h: float | None = None
    actual_duration_h: float | None = None
    completion_notes: str | None = None
    # Workover extra
    workover_type: str | None = None
    well_name: str | None = None
    # Event
    location_free_text: str | None = None
    # Tracking
    pax_actual: int = 0
    requester_id: UUID | None = None
    notes: str | None = None
    archived: bool = False
    # Priority override
    priority_override_by: UUID | None = None
    priority_override_reason: str | None = None
    # Workflow
    submitted_by: UUID | None = None
    submitted_at: datetime | None = None
    validated_by: UUID | None = None
    validated_at: datetime | None = None
    rejected_by: UUID | None = None
    rejected_at: datetime | None = None
    rejection_reason: str | None = None
    created_by: UUID
    # Per-activity progress weighting override (NULL → fall back to
    # linked Project's method, then to entity-scoped admin setting,
    # then to 'equal'). See _resolve_activity_progress_method() in
    # planner_service.py for the resolution chain.
    progress_weight_method: str | None = None
    # Manual weight used when the resolved method is 'manual'.
    weight: float | None = None
    active: bool
    created_at: datetime
    updated_at: datetime
    # Enriched
    asset_name: str | None = None
    project_name: str | None = None
    created_by_name: str | None = None
    submitted_by_name: str | None = None
    validated_by_name: str | None = None


class ActivityCreate(BaseModel):
    asset_id: UUID
    project_id: UUID | None = None
    parent_id: UUID | None = None
    type: str = Field(..., pattern=r"^(project|workover|drilling|integrity|maintenance|permanent_ops|inspection|event)$")
    subtype: str | None = Field(None, pattern=r"^(preventive|corrective|regulatory)$")
    title: str = Field(..., min_length=1, max_length=300)
    description: str | None = None
    priority: str = Field(default="medium", pattern=r"^(low|medium|high|critical)$")
    pax_quota: int = Field(default=0, ge=0)
    pax_quota_mode: str = Field(default="constant", pattern=r"^(constant|variable)$")
    pax_quota_daily: dict | None = None
    start_date: datetime | None = None
    end_date: datetime | None = None
    # Workover
    well_reference: str | None = None
    rig_name: str | None = None
    # Drilling
    spud_date: datetime | None = None
    target_depth: float | None = None
    drilling_program_ref: str | None = None
    # Regulatory / maintenance
    regulatory_ref: str | None = None
    work_order_ref: str | None = None
    # Progress weighting (optional override on creation)
    progress_weight_method: str | None = Field(
        default=None,
        pattern=r"^(equal|effort|duration|manual)$",
    )
    weight: float | None = Field(default=None, ge=0)


class ActivityUpdate(BaseModel):
    asset_id: UUID | None = None
    project_id: UUID | None = None
    type: str | None = None
    subtype: str | None = None
    title: str | None = None
    description: str | None = None
    priority: str | None = None
    pax_quota: int | None = None
    # Variable POB plan: 'constant' or 'variable' + optional day-keyed dict
    # e.g. {"2026-04-10": 12, "2026-04-11": 8}. Both fields were missing
    # from ActivityUpdate so Pydantic silently dropped them in PATCH
    # payloads — the variable POB editor in the detail panel could never
    # persist its changes. Adding them here fixes the round-trip.
    pax_quota_mode: str | None = Field(default=None, pattern=r"^(constant|variable)$")
    pax_quota_daily: dict | None = None
    start_date: datetime | None = None
    end_date: datetime | None = None
    actual_start: datetime | None = None
    actual_end: datetime | None = None
    well_reference: str | None = None
    rig_name: str | None = None
    spud_date: datetime | None = None
    target_depth: float | None = None
    drilling_program_ref: str | None = None
    regulatory_ref: str | None = None
    work_order_ref: str | None = None
    # Progress weighting override (NULL clears the override → fall back
    # to linked project / entity default).
    progress_weight_method: str | None = Field(
        default=None,
        pattern=r"^(equal|effort|duration|manual)$",
    )
    weight: float | None = Field(default=None, ge=0)


class ActivityStatusUpdate(BaseModel):
    status: str = Field(..., pattern=r"^(draft|submitted|validated|rejected|cancelled|in_progress|completed)$")


# ─── Conflict schemas ────────────────────────────────────────────────────────

class ConflictRead(PlannerSchema):
    id: UUID
    entity_id: UUID
    asset_id: UUID
    conflict_date: date
    conflict_type: str = "pax_overflow"
    overflow_amount: int | None = None
    status: str
    resolution: str | None = None
    resolution_note: str | None = None
    resolved_by: UUID | None = None
    resolved_at: datetime | None = None
    created_at: datetime
    active: bool
    # Enriched
    asset_name: str | None = None
    resolved_by_name: str | None = None
    activity_ids: list[UUID] = Field(default_factory=list)
    activity_titles: list[str] = Field(default_factory=list)


class ConflictResolve(BaseModel):
    resolution: str = Field(..., pattern=r"^(approve_both|reschedule|reduce_pax|cancel|deferred)$")
    resolution_note: str | None = None


class BulkConflictResolveItem(BaseModel):
    conflict_id: UUID
    resolution: str = Field(..., pattern=r"^(approve_both|reschedule|reduce_pax|cancel|deferred)$")
    resolution_note: str | None = None


class BulkConflictResolveRequest(BaseModel):
    items: list[BulkConflictResolveItem] = Field(..., min_length=1, max_length=200)


class BulkConflictResolveResult(BaseModel):
    resolved: int
    skipped: int
    errors: list[str] = []
    conflict_ids: list[UUID] = []


class ConflictAuditRead(PlannerSchema):
    id: UUID
    conflict_id: UUID
    actor_id: UUID | None = None
    actor_name: str | None = None
    action: str
    old_status: str | None = None
    new_status: str | None = None
    old_resolution: str | None = None
    new_resolution: str | None = None
    resolution_note: str | None = None
    context: str | None = None
    created_at: datetime


class RevisionSignalRead(PlannerSchema):
    id: UUID
    created_at: datetime
    task_id: UUID | None = None
    task_title: str | None = None
    task_status: str | None = None
    project_id: UUID | None = None
    project_code: str | None = None
    project_name: str | None = None
    changed_fields: list[str] = Field(default_factory=list)
    planner_activity_ids: list[UUID] = Field(default_factory=list)
    planner_activity_count: int = 0
    actor_id: UUID | None = None
    actor_name: str | None = None


class RevisionSignalAcknowledgeRead(BaseModel):
    acknowledged: bool
    signal_id: UUID


class RevisionSignalImpactActivityRead(PlannerSchema):
    activity_id: UUID
    activity_title: str | None = None
    activity_status: str | None = None
    ads_affected: int = 0
    manifests_affected: int = 0
    open_conflict_days: int = 0


class RevisionSignalImpactRead(PlannerSchema):
    signal_id: UUID
    activity_count: int = 0
    total_ads_affected: int = 0
    total_manifests_affected: int = 0
    total_open_conflict_days: int = 0
    activities: list[RevisionSignalImpactActivityRead] = Field(default_factory=list)


class RevisionDecisionRequestCreate(BaseModel):
    note: str | None = Field(default=None, max_length=4000)
    due_at: datetime | None = None
    proposed_start_date: datetime | None = None
    proposed_end_date: datetime | None = None
    proposed_pax_quota: int | None = Field(default=None, ge=0)
    proposed_status: str | None = Field(default=None, max_length=50)


class RevisionDecisionRespond(BaseModel):
    response: str = Field(pattern=r"^(accepted|counter_proposed)$")
    response_note: str | None = Field(default=None, max_length=4000)
    counter_start_date: datetime | None = None
    counter_end_date: datetime | None = None
    counter_pax_quota: int | None = Field(default=None, ge=0)
    counter_status: str | None = Field(default=None, max_length=50)


class RevisionDecisionForce(BaseModel):
    reason: str | None = Field(default=None, max_length=2000)


class RevisionDecisionRequestRead(PlannerSchema):
    id: UUID
    signal_id: UUID
    created_at: datetime
    due_at: datetime | None = None
    status: str
    project_id: UUID | None = None
    project_code: str | None = None
    project_name: str | None = None
    task_id: UUID | None = None
    task_title: str | None = None
    planner_activity_ids: list[UUID] = Field(default_factory=list)
    requester_user_id: UUID | None = None
    requester_user_name: str | None = None
    target_user_id: UUID | None = None
    target_user_name: str | None = None
    note: str | None = None
    proposed_start_date: datetime | None = None
    proposed_end_date: datetime | None = None
    proposed_pax_quota: int | None = None
    proposed_status: str | None = None
    response: str | None = None
    response_note: str | None = None
    counter_start_date: datetime | None = None
    counter_end_date: datetime | None = None
    counter_pax_quota: int | None = None
    counter_status: str | None = None
    responded_at: datetime | None = None
    forced_at: datetime | None = None
    forced_reason: str | None = None
    application_result: dict | None = None


# ─── Capacity schemas ────────────────────────────────────────────────────────

class CapacityRead(BaseModel):
    asset_id: UUID
    asset_name: str | None = None
    date: date
    total_capacity: int
    used_capacity: int
    residual_capacity: int
    saturation_pct: float


class CapacityHeatmapDayRead(BaseModel):
    asset_id: UUID
    asset_name: str | None = None
    date: date
    saturation_pct: float
    forecast_pax: int
    real_pob: int
    remaining_capacity: int
    capacity_limit: int


class CapacityHeatmapConfigRead(BaseModel):
    threshold_low: float
    threshold_medium: float
    threshold_high: float
    threshold_critical: float
    color_low: str
    color_medium: str
    color_high: str
    color_critical: str
    color_overflow: str


class CapacityHeatmapResponse(BaseModel):
    days: list[CapacityHeatmapDayRead] = Field(default_factory=list)
    config: CapacityHeatmapConfigRead


# ─── Dependency schemas ──────────────────────────────────────────────────────

class DependencyRead(PlannerSchema):
    id: UUID
    predecessor_id: UUID
    successor_id: UUID
    dependency_type: str
    lag_days: int
    predecessor_title: str | None = None
    successor_title: str | None = None


class DependencyCreate(BaseModel):
    predecessor_id: UUID
    successor_id: UUID
    dependency_type: str = Field(default="FS", pattern=r"^(FS|SS|FF|SF)$")
    lag_days: int = 0


# ─── Asset Capacity schemas ─────────────────────────────────────────────────

class AssetCapacityRead(PlannerSchema):
    id: UUID
    entity_id: UUID
    asset_id: UUID
    max_pax_total: int
    permanent_ops_quota: int
    max_pax_per_company: dict | None = None
    effective_date: date
    reason: str
    changed_by: UUID
    created_at: datetime


class AssetCapacityCreate(BaseModel):
    max_pax_total: int = Field(..., ge=0)
    permanent_ops_quota: int = Field(0, ge=0)
    max_pax_per_company: dict | None = None
    effective_date: date | None = None
    reason: str = Field(..., min_length=1)


# ─── Availability schemas ────────────────────────────────────────────────────

class DailyLoad(BaseModel):
    date: date
    max_pax_total: int
    permanent_ops_quota: int
    used_by_activities: int
    total_used: int
    residual: int
    saturation_pct: float


class AvailabilityResponse(BaseModel):
    asset_id: UUID
    asset_name: str | None = None
    start_date: date
    end_date: date
    worst_residual: int
    max_capacity: int
    days: list[DailyLoad]


# ─── Impact Preview schemas ─────────────────────────────────────────────────

class ImpactChange(BaseModel):
    old: str | int | None = None
    new: str | int | None = None
    delta_days: int | None = None


class ImpactPreviewResponse(BaseModel):
    activity_id: UUID
    activity_title: str
    ads_affected: int = 0
    manifests_affected: int = 0
    potential_conflict_days: int = 0
    changes: dict[str, ImpactChange] = Field(default_factory=dict)


# ─── Gantt schemas ───────────────────────────────────────────────────────────

class GanttActivity(BaseModel):
    id: UUID
    title: str
    type: str
    subtype: str | None = None
    status: str
    priority: str
    pax_quota: int
    pax_quota_mode: str = "constant"
    pax_quota_daily: dict | None = None
    start_date: datetime | None = None
    end_date: datetime | None = None
    project_id: UUID | None = None
    source_task_id: UUID | None = None
    # Progress 0..100. For activities linked to a project task via
    # source_task_id, this is the linked task's progress field. Otherwise
    # it is computed from dates + status server-side.
    progress: int = 0
    created_by: UUID
    well_reference: str | None = None
    rig_name: str | None = None
    work_order_ref: str | None = None


class GanttAsset(BaseModel):
    id: UUID
    name: str
    parent_id: UUID | None = None
    capacity: dict
    activities: list[GanttActivity]


class GanttDependency(BaseModel):
    """A predecessor → successor link between two visible activities."""
    id: UUID
    predecessor_id: UUID
    successor_id: UUID
    dependency_type: str
    lag_days: int = 0


class GanttResponse(BaseModel):
    assets: list[GanttAsset]
    dependencies: list[GanttDependency] = []


# ─── Recurrence schemas ─────────────────────────────────────────────────────

# ─── Scenario simulation schemas ─────────────────────────────────────────

class ProposedActivity(BaseModel):
    asset_id: UUID
    pax_quota: int = Field(ge=1)
    start_date: date
    end_date: date
    title: str | None = None


class ScenarioRequest(BaseModel):
    proposed_activities: list[ProposedActivity] = Field(..., min_length=1, max_length=50)
    start_date: date
    end_date: date


# ─── Forecast schemas ────────────────────────────────────────────────────

class ForecastRequest(BaseModel):
    asset_id: UUID
    horizon_days: int = Field(90, ge=7, le=365)


class ForecastDayRead(BaseModel):
    date: date
    projected_load: float
    scheduled_load: int
    combined_load: float
    real_pob: int
    max_capacity: int
    at_risk: bool
    saturation_pct: float


class ForecastSummaryRead(BaseModel):
    at_risk_days: int
    avg_projected_load: float
    avg_real_pob: float
    peak_date: date | None = None
    peak_load: float
    max_capacity: int
    horizon_days: int


class ForecastResponse(BaseModel):
    forecast: list[ForecastDayRead] = Field(default_factory=list)
    summary: ForecastSummaryRead


# ─── Recurrence schemas ─────────────────────────────────────────────────────

class RecurrenceRuleCreate(BaseModel):
    frequency: str = Field(..., pattern=r"^(daily|weekly|monthly|quarterly|annually)$")
    interval_value: int = Field(1, ge=1, le=365)
    day_of_week: int | None = Field(None, ge=0, le=6)
    day_of_month: int | None = Field(None, ge=1, le=28)
    end_date: date | None = None


class RecurrenceRuleRead(PlannerSchema):
    id: UUID
    activity_id: UUID
    frequency: str
    interval_value: int
    day_of_week: int | None = None
    day_of_month: int | None = None
    end_date: date | None = None
    last_generated_at: datetime | None = None
    active: bool


# ─── Scenario schemas ───────────────────────────────────────────────────────

class ScenarioActivityCreate(BaseModel):
    """Add a proposed activity to a scenario."""
    source_activity_id: UUID | None = None  # NULL = new, set = override
    title: str | None = None
    asset_id: UUID | None = None
    type: str | None = None
    priority: str | None = None
    pax_quota: int | None = Field(None, ge=1)
    start_date: date | None = None
    end_date: date | None = None
    notes: str | None = None
    is_removed: bool = False


class ScenarioActivityUpdate(BaseModel):
    title: str | None = None
    asset_id: UUID | None = None
    type: str | None = None
    priority: str | None = None
    pax_quota: int | None = Field(None, ge=1)
    start_date: date | None = None
    end_date: date | None = None
    notes: str | None = None
    is_removed: bool | None = None


class ScenarioActivityRead(PlannerSchema):
    id: UUID
    scenario_id: UUID
    source_activity_id: UUID | None = None
    title: str | None = None
    asset_id: UUID | None = None
    type: str | None = None
    priority: str | None = None
    pax_quota: int | None = None
    start_date: date | None = None
    end_date: date | None = None
    notes: str | None = None
    is_removed: bool
    created_at: datetime
    # Enriched (from source_activity if override)
    source_activity_title: str | None = None
    asset_name: str | None = None


class ScenarioCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    description: str | None = None
    # Optional: seed the scenario with a list of proposed activities
    proposed_activities: list[ScenarioActivityCreate] | None = None


class ScenarioUpdate(BaseModel):
    title: str | None = Field(None, min_length=1, max_length=200)
    description: str | None = None
    status: str | None = Field(None, pattern=r"^(draft|validated|archived)$")


class ScenarioRead(PlannerSchema):
    id: UUID
    entity_id: UUID
    title: str
    description: str | None = None
    status: str
    created_by: UUID
    promoted_by: UUID | None = None
    promoted_at: datetime | None = None
    baseline_snapshot_at: datetime | None = None
    last_simulated_at: datetime | None = None
    active: bool
    created_at: datetime
    updated_at: datetime
    # Enriched
    created_by_name: str | None = None
    promoted_by_name: str | None = None
    activity_count: int = 0
    # Cached simulation summary
    conflict_days: int | None = None
    worst_overflow: int | None = None


class ScenarioDetailRead(ScenarioRead):
    """Extended read with proposed activities + simulation result."""
    proposed_activities: list[ScenarioActivityRead] = []
    last_simulation_result: dict | None = None
    baseline_snapshot: dict | None = None


class ScenarioDiffRead(BaseModel):
    """Diff between scenario and baseline."""
    scenario_id: UUID
    new_activities: int = 0
    modified_activities: int = 0
    removed_activities: int = 0
    total_pax_delta: int = 0
    new_conflict_days: int | None = None
    items: list[dict] = []  # per-activity diff details


class ScenarioPromoteResult(BaseModel):
    scenario_id: UUID
    promoted_activity_count: int
    skipped_count: int
    errors: list[str] = []
