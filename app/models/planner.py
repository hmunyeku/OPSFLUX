"""Planner ORM models — activities, conflicts, dependencies, capacity scheduling."""

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
