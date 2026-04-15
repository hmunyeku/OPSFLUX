"""Planner ORM models — activities, conflicts, dependencies, capacity scheduling,
scenarios (what-if simulation with persistence)."""

from datetime import date, datetime
from uuid import UUID as PyUUID

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    SmallInteger,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, SoftDeleteMixin, TimestampMixin, UUIDPrimaryKeyMixin


# ─── Planner Activities ──────────────────────────────────────────────────────

class PlannerActivity(UUIDPrimaryKeyMixin, TimestampMixin, SoftDeleteMixin, Base):
    """Activite planifiee — projet, workover, drilling, maintenance, etc."""
    __tablename__ = "planner_activities"
    __table_args__ = (
        Index("idx_planner_act_entity", "entity_id"),
        Index("idx_planner_act_asset", "asset_id"),
        Index("idx_planner_act_status", "status"),
        Index("idx_planner_act_type", "type"),
        Index("idx_planner_act_project", "project_id"),
        CheckConstraint(
            "type IN ('project','workover','drilling','integrity',"
            "'maintenance','permanent_ops','inspection','event')",
            name="ck_planner_act_type",
        ),
        CheckConstraint(
            "subtype IS NULL OR subtype IN ('preventive','corrective','regulatory')",
            name="ck_planner_act_subtype",
        ),
        CheckConstraint(
            "status IN ('draft','submitted','validated','rejected',"
            "'cancelled','in_progress','completed')",
            name="ck_planner_act_status",
        ),
        CheckConstraint(
            "priority IN ('low','medium','high','critical')",
            name="ck_planner_act_priority",
        ),
    )

    entity_id: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("entities.id"), nullable=False
    )
    asset_id: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("ar_installations.id"), nullable=False
    )
    project_id: Mapped[PyUUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id")
    )
    source_task_id: Mapped[PyUUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("project_tasks.id", ondelete="SET NULL"),
        comment="The project task this activity was created from (Projets → Planner link)",
    )
    parent_id: Mapped[PyUUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("planner_activities.id", ondelete="SET NULL"),
        comment="Parent activity for hierarchy (POB sums up at each level)",
    )
    type: Mapped[str] = mapped_column(String(30), nullable=False)
    subtype: Mapped[str | None] = mapped_column(String(30))
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="draft")
    priority: Mapped[str] = mapped_column(String(10), nullable=False, default="medium")
    pax_quota: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    pax_quota_mode: Mapped[str] = mapped_column(
        String(10), nullable=False, default="constant",
        comment="'constant' = single pax_quota for all days; 'variable' = per-day values in pax_quota_daily",
    )
    pax_quota_daily: Mapped[dict | None] = mapped_column(
        JSONB, default=None,
        comment="Per-day PAX quota: {'2026-04-10': 5, '2026-04-11': 8, ...}. Only used when pax_quota_mode='variable'.",
    )
    start_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    end_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    actual_start: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    actual_end: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    # Workover-specific
    well_reference: Mapped[str | None] = mapped_column(String(100))
    rig_name: Mapped[str | None] = mapped_column(String(100))

    # Drilling-specific
    spud_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    target_depth: Mapped[float | None] = mapped_column(Float)
    drilling_program_ref: Mapped[str | None] = mapped_column(String(100))

    # Integrity / maintenance regulatory
    regulatory_ref: Mapped[str | None] = mapped_column(String(200))
    work_order_ref: Mapped[str | None] = mapped_column(String(50))

    # Workflow
    submitted_by: Mapped[PyUUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id")
    )
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    validated_by: Mapped[PyUUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id")
    )
    validated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    rejected_by: Mapped[PyUUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id")
    )
    rejected_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    rejection_reason: Mapped[str | None] = mapped_column(Text)
    created_by: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    # Per-activity override of the progress weighting method, with the
    # following resolution chain (see _resolve_activity_progress_method
    # in app/services/modules/planner_service.py):
    #   1. activity.progress_weight_method (this field — explicit override)
    #   2. linked Project.progress_weight_method (when activity.project_id set)
    #   3. entity-scoped setting `planner.default_progress_weight_method`
    #   4. fallback 'equal'
    # Allowed values: 'equal' | 'effort' | 'duration' | 'manual'
    progress_weight_method: Mapped[str | None] = mapped_column(String(20), nullable=True)
    # Manual weight used when the resolved method is 'manual'. NULL/0
    # means the activity contributes nothing to its parent's weighted
    # average (the parent then falls back to equal weighting if ALL
    # children have NULL/0 weights — same fallback as for project tasks).
    weight: Mapped[float | None] = mapped_column(Numeric(10, 2), nullable=True)
    active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    # Relationships
    dependencies_as_predecessor: Mapped[list["PlannerActivityDependency"]] = relationship(
        foreign_keys="PlannerActivityDependency.predecessor_id",
        back_populates="predecessor",
        cascade="all, delete-orphan",
    )
    dependencies_as_successor: Mapped[list["PlannerActivityDependency"]] = relationship(
        foreign_keys="PlannerActivityDependency.successor_id",
        back_populates="successor",
        cascade="all, delete-orphan",
    )


# ─── Planner Conflicts ──────────────────────────────────────────────────────

class PlannerConflict(UUIDPrimaryKeyMixin, TimestampMixin, SoftDeleteMixin, Base):
    """Conflit de capacite detecte sur un site a une date donnee."""
    __tablename__ = "planner_conflicts"
    __table_args__ = (
        Index("idx_planner_conf_entity", "entity_id"),
        Index("idx_planner_conf_asset", "asset_id"),
        Index("idx_planner_conf_status", "status"),
        CheckConstraint(
            "status IN ('open','resolved','deferred')",
            name="ck_planner_conf_status",
        ),
        CheckConstraint(
            "resolution IS NULL OR resolution IN ("
            "'approve_both','reschedule','reduce_pax','cancel','deferred')",
            name="ck_planner_conf_resolution",
        ),
    )

    entity_id: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("entities.id"), nullable=False
    )
    asset_id: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("ar_installations.id"), nullable=False
    )
    conflict_date: Mapped[date] = mapped_column(Date, nullable=False)
    conflict_type: Mapped[str] = mapped_column(
        String(30), nullable=False, default="pax_overflow",
        server_default="pax_overflow",
    )
    overflow_amount: Mapped[int | None] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="open")
    resolution: Mapped[str | None] = mapped_column(String(30))
    resolution_note: Mapped[str | None] = mapped_column(Text)
    resolved_by: Mapped[PyUUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id")
    )
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    # Relationships
    activities: Mapped[list["PlannerActivity"]] = relationship(
        secondary="planner_conflict_activities",
        viewonly=True,
    )


# ─── Conflict <-> Activity Junction ─────────────────────────────────────────

class PlannerConflictActivity(Base):
    """Association entre un conflit et les activites impliquees."""
    __tablename__ = "planner_conflict_activities"

    conflict_id: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("planner_conflicts.id", ondelete="CASCADE"),
        primary_key=True,
    )
    activity_id: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("planner_activities.id", ondelete="CASCADE"),
        primary_key=True,
    )


# ─── Activity Dependencies ──────────────────────────────────────────────────

class PlannerActivityDependency(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Dependance entre deux activites (FS, SS, FF, SF)."""
    __tablename__ = "planner_activity_dependencies"
    __table_args__ = (
        Index("idx_planner_dep_pred", "predecessor_id"),
        Index("idx_planner_dep_succ", "successor_id"),
        CheckConstraint(
            "dependency_type IN ('FS','SS','FF','SF')",
            name="ck_planner_dep_type",
        ),
    )

    predecessor_id: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("planner_activities.id"), nullable=False
    )
    successor_id: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("planner_activities.id"), nullable=False
    )
    dependency_type: Mapped[str] = mapped_column(
        String(10), nullable=False, default="FS"
    )
    lag_days: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    # Relationships
    predecessor: Mapped["PlannerActivity"] = relationship(
        foreign_keys=[predecessor_id],
        back_populates="dependencies_as_predecessor",
    )
    successor: Mapped["PlannerActivity"] = relationship(
        foreign_keys=[successor_id],
        back_populates="dependencies_as_successor",
    )


# ─── Conflict Audit Trail ────────────────────────────────────────────────────
class PlannerConflictAudit(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Append-only audit log for all conflict resolution changes.

    One row per resolve / re-resolve / defer operation, keyed by
    conflict_id. Stores the old + new resolution so managers can trace
    who changed what, and when. Never deleted — even if the conflict
    row itself is archived.
    """

    __tablename__ = "planner_conflict_audit"
    __table_args__ = (
        Index("idx_planner_conflict_audit_conflict", "conflict_id"),
        Index("idx_planner_conflict_audit_actor", "actor_id"),
    )

    conflict_id: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("planner_conflicts.id", ondelete="CASCADE"),
        nullable=False,
    )
    actor_id: Mapped[PyUUID | None] = mapped_column(UUID(as_uuid=True))
    action: Mapped[str] = mapped_column(
        String(30),
        nullable=False,
        default="resolve",
    )  # resolve | re_resolve | defer | reopen
    old_status: Mapped[str | None] = mapped_column(String(20))
    new_status: Mapped[str | None] = mapped_column(String(20))
    old_resolution: Mapped[str | None] = mapped_column(String(50))
    new_resolution: Mapped[str | None] = mapped_column(String(50))
    resolution_note: Mapped[str | None] = mapped_column(Text)
    context: Mapped[str | None] = mapped_column(String(100))  # e.g. "single" | "bulk"


# ─── Scenarios (What-If simulation with persistence) ────────────────────────

class PlannerScenario(UUIDPrimaryKeyMixin, TimestampMixin, SoftDeleteMixin, Base):
    """Persistent what-if scenario for capacity/conflict simulation.

    A scenario captures a set of **proposed activities** (new or modified)
    that do NOT exist in the live plan. The user can:

    1. Create a scenario (with title, description)
    2. Add/modify/remove proposed activities inside the scenario
    3. Simulate the impact (conflicts, saturation) via the existing
       simulate_scenario service
    4. Compare two scenarios side-by-side
    5. Promote a scenario — convert its proposed activities into real
       PlannerActivity rows in the live plan (arbiter permission)
    6. Archive a scenario once it's no longer relevant

    The baseline_snapshot_at captures the moment the scenario was created
    so diff computations can compare the scenario's proposed state against
    the plan as it was at creation time.
    """

    __tablename__ = "planner_scenarios"
    __table_args__ = (
        Index("idx_planner_scenario_entity", "entity_id"),
        Index("idx_planner_scenario_status", "status"),
        CheckConstraint(
            "status IN ('draft','validated','promoted','archived')",
            name="ck_planner_scenario_status",
        ),
    )

    entity_id: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("entities.id"), nullable=False
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="draft"
    )  # draft | validated | promoted | archived
    created_by: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    promoted_by: Mapped[PyUUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id")
    )
    promoted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # JSONB snapshot of the plan state at the time the scenario was created.
    # Used by diff computation to know "what changed compared to baseline".
    # Contains: { activities: [...], capacity: {...} } — a lightweight
    # summary, not a full clone of every row.
    baseline_snapshot: Mapped[dict | None] = mapped_column(JSONB)
    baseline_snapshot_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # Last simulation result — cached so the list view can show
    # conflict_days / worst_overflow without re-running the full algo.
    last_simulation_result: Mapped[dict | None] = mapped_column(JSONB)
    last_simulated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    # Exactly one scenario per entity is the live reference plan.
    # All other scenarios are simulations / what-if branches.
    is_reference: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    # Relationships
    proposed_activities: Mapped[list["PlannerScenarioActivity"]] = relationship(
        back_populates="scenario", cascade="all, delete-orphan"
    )


class PlannerScenarioActivity(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """A proposed or modified activity within a scenario.

    Two modes:
    - **New activity** (source_activity_id IS NULL): a brand-new activity
      proposed by the scenario that doesn't exist in the live plan. All
      fields (asset_id, pax_quota, dates, type, etc.) are on this row.
    - **Modified activity** (source_activity_id IS NOT NULL): an override
      of an existing live activity. Only the fields the user changed are
      set; NULLs mean "keep the live value". The diff computation merges
      the two to show what would change.

    When a scenario is promoted, new activities are created as real
    PlannerActivity rows and modified activities are PATCHed.
    """

    __tablename__ = "planner_scenario_activities"
    __table_args__ = (
        Index("idx_planner_scenario_act_scenario", "scenario_id"),
        Index("idx_planner_scenario_act_source", "source_activity_id"),
    )

    scenario_id: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("planner_scenarios.id", ondelete="CASCADE"),
        nullable=False,
    )
    # If set: this row is an override of an existing live activity.
    # If NULL: this is a brand-new proposed activity.
    source_activity_id: Mapped[PyUUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("planner_activities.id", ondelete="SET NULL")
    )
    # Activity fields — all nullable so modified-activity rows can leave
    # unchanged fields as NULL (meaning "keep the live value").
    title: Mapped[str | None] = mapped_column(String(255))
    asset_id: Mapped[PyUUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("ar_installations.id")
    )
    type: Mapped[str | None] = mapped_column(String(30))
    priority: Mapped[str | None] = mapped_column(String(20))
    pax_quota: Mapped[int | None] = mapped_column(Integer)
    start_date: Mapped[date | None] = mapped_column(Date)
    end_date: Mapped[date | None] = mapped_column(Date)
    notes: Mapped[str | None] = mapped_column(Text)
    # Flags
    is_removed: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False
    )  # True = "remove this activity from the plan in this scenario"

    # Relationships
    scenario: Mapped["PlannerScenario"] = relationship(back_populates="proposed_activities")
