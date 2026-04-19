"""MOC (Management of Change) ORM models.

Digitalises the Perenco Cameroon MOC workflow per CDC rev 00:
* MOC creation with auto-numbered reference `MOC_<NNN>_<PF>`
* 11-status FSM: created → approved → submitted_to_confirm → ...
  → approved_to_study → under_study → study_in_validation → validated
  → execution → executed_docs_pending
* Parallel validation matrix (HSE, Lead Process, Production Manager,
  Gas Manager, Maintenance, métier) with cost bucket and DO/DG approvals
* HAZOP/HAZID/Environmental flags and PID/ESD update tracking
* Audit trail: status history + comment thread (polymorphic via Note)
* Attachments: polymorphic via Attachment (PID, ESD, photos, studies)
"""

from datetime import date, datetime
from uuid import UUID as PyUUID

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, SoftDeleteMixin, TimestampMixin, UUIDPrimaryKeyMixin

# ─── Enumerations ─────────────────────────────────────────────────────────────

MOC_STATUSES = (
    "created",                # a. Créé
    "approved",               # b. Approuvé (Chef de site)
    "submitted_to_confirm",   # c. Soumis à confirmer (Directeur)
    "cancelled",              # d. Annulé
    "stand_by",               # e. Stand-by
    "approved_to_study",      # f. Confirmé à étudier (DO/DG)
    "under_study",            # g. En étude Process
    "study_in_validation",    # h. Étudié en validation
    "validated",              # i. Validé à exécuter
    "execution",              # j. Exécution
    "executed_docs_pending",  # k. Exécuté, PID/ESD à mettre à jour
    "closed",                 # All docs updated, fully closed
)

MOC_MODIFICATION_TYPES = ("permanent", "temporary")
MOC_PRIORITIES = ("1", "2", "3")  # 1=highest, 2=normal, 3=low
MOC_COST_BUCKETS = (
    "lt_20",       # 0 < X < 20 MXAF
    "20_to_50",    # 20 MXAF < X < 50 MXAF
    "50_to_100",   # 50 MXAF < X < 100 MXAF
    "gt_100",      # X > 100 MXAF
)
MOC_VALIDATION_LEVELS = ("DO", "DG", "DO_AND_DG")

# Entity roles that validate an MOC study (parallel validation step h.)
MOC_VALIDATION_ROLES = (
    "hse",
    "lead_process",
    "production_manager",
    "gas_manager",
    "maintenance_manager",
    "process_engineer",    # study responsible — also validates in the matrix
    "metier",              # discipline specialist (elec, instru, etc.)
)

# Roles that can be assigned per site in `moc_site_assignments`.
MOC_SITE_ROLES = (
    "site_chief",
    "director",
    "lead_process",
    "hse",
    "production_manager",
    "gas_manager",
    "maintenance_manager",
)


# ─── Main MOC document ────────────────────────────────────────────────────────


class MOC(UUIDPrimaryKeyMixin, TimestampMixin, SoftDeleteMixin, Base):
    """Management of Change request.

    One row per MOC. The reference follows the pattern `MOC_<NNN>_<PF>` with
    NNN being the next sequential number per entity, PF the platform code.
    """

    __tablename__ = "mocs"
    __table_args__ = (
        CheckConstraint(f"status IN {MOC_STATUSES}", name="ck_moc_status"),
        CheckConstraint(
            f"modification_type IS NULL OR modification_type IN {MOC_MODIFICATION_TYPES}",
            name="ck_moc_modification_type",
        ),
        CheckConstraint(
            f"priority IS NULL OR priority IN {MOC_PRIORITIES}",
            name="ck_moc_priority",
        ),
        CheckConstraint(
            f"cost_bucket IS NULL OR cost_bucket IN {MOC_COST_BUCKETS}",
            name="ck_moc_cost_bucket",
        ),
        UniqueConstraint("entity_id", "reference", name="uq_moc_entity_reference"),
        Index("idx_mocs_entity", "entity_id"),
        Index("idx_mocs_status", "entity_id", "status"),
        Index("idx_mocs_site", "entity_id", "site_id"),
        Index("idx_mocs_installation", "entity_id", "installation_id"),
        Index("idx_mocs_initiator", "initiator_id"),
        Index("idx_mocs_created", "entity_id", "created_at"),
    )

    # Tenant scoping
    entity_id: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("entities.id"), nullable=False
    )

    # Auto-generated reference: MOC_001_BRF1
    reference: Mapped[str] = mapped_column(String(60), nullable=False)

    # ── Initiator (denormalised name/function for offline-capable forms) ──
    initiator_id: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    initiator_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    initiator_function: Mapped[str | None] = mapped_column(String(200), nullable=True)

    # ── Location ──
    # Site is a RDR zone (East/West/South) — can be modelled as a free string
    # or a FK to OilSite if asset_registry is enabled. We keep a string for
    # CDC compatibility ("RDR EAST" / "RDR WEST" / "SOUTH") plus optional FKs.
    site_label: Mapped[str] = mapped_column(String(100), nullable=False)
    site_id: Mapped[PyUUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("ar_sites.id", ondelete="SET NULL"), nullable=True
    )
    platform_code: Mapped[str] = mapped_column(String(60), nullable=False)
    installation_id: Mapped[PyUUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("ar_installations.id", ondelete="SET NULL"),
        nullable=True,
    )

    # ── Content ──
    objectives: Mapped[str | None] = mapped_column(Text, nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    current_situation: Mapped[str | None] = mapped_column(Text, nullable=True)
    proposed_changes: Mapped[str | None] = mapped_column(Text, nullable=True)
    impact_analysis: Mapped[str | None] = mapped_column(Text, nullable=True)
    modification_type: Mapped[str | None] = mapped_column(String(20), nullable=True)
    temporary_duration_days: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # ── Hierarchy review (step 2 of the paper form) ──
    is_real_change: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    hierarchy_reviewer_id: Mapped[PyUUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )
    hierarchy_review_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    hierarchy_review_comment: Mapped[str | None] = mapped_column(Text, nullable=True)

    # ── Site chief approval (step 3) ──
    site_chief_approved: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    site_chief_id: Mapped[PyUUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )
    site_chief_approved_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    site_chief_comment: Mapped[str | None] = mapped_column(Text, nullable=True)

    # ── Director confirmation (step 4) ──
    director_id: Mapped[PyUUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )
    director_confirmed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    director_comment: Mapped[str | None] = mapped_column(Text, nullable=True)
    priority: Mapped[str | None] = mapped_column(String(1), nullable=True)

    # ── Study phase ──
    lead_process_id: Mapped[PyUUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )
    responsible_id: Mapped[PyUUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True,
        comment="Process engineer in charge of the study",
    )
    study_started_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    study_completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    estimated_cost_mxaf: Mapped[float | None] = mapped_column(Numeric(12, 2), nullable=True)
    cost_bucket: Mapped[str | None] = mapped_column(String(20), nullable=True)

    # ── Parallel validation flags (HAZOP/HAZID/Environmental + PID/ESD) ──
    hazop_required: Mapped[bool] = mapped_column(Boolean, server_default="false")
    hazop_completed: Mapped[bool] = mapped_column(Boolean, server_default="false")
    hazid_required: Mapped[bool] = mapped_column(Boolean, server_default="false")
    hazid_completed: Mapped[bool] = mapped_column(Boolean, server_default="false")
    environmental_required: Mapped[bool] = mapped_column(Boolean, server_default="false")
    environmental_completed: Mapped[bool] = mapped_column(Boolean, server_default="false")
    pid_update_required: Mapped[bool] = mapped_column(Boolean, server_default="false")
    pid_update_completed: Mapped[bool] = mapped_column(Boolean, server_default="false")
    esd_update_required: Mapped[bool] = mapped_column(Boolean, server_default="false")
    esd_update_completed: Mapped[bool] = mapped_column(Boolean, server_default="false")

    # ── Execution phase ──
    execution_started_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    execution_completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    execution_supervisor_id: Mapped[PyUUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )

    # ── "Réalisation du MOC" — DO + DG dual sign-off (paper form page 5) ──
    # Both must be `True` before the `validated → execution` transition is
    # allowed. `None` means not yet decided, `False` means explicit refusal.
    do_execution_accord: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    dg_execution_accord: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    do_execution_accord_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True,
    )
    dg_execution_accord_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True,
    )
    do_execution_accord_by: Mapped[PyUUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True,
    )
    dg_execution_accord_by: Mapped[PyUUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True,
    )
    do_execution_comment: Mapped[str | None] = mapped_column(Text, nullable=True)
    dg_execution_comment: Mapped[str | None] = mapped_column(Text, nullable=True)

    # ── Status ──
    status: Mapped[str] = mapped_column(
        String(30), nullable=False, server_default="created"
    )
    status_changed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    # ── Planned vs actual implementation date ──
    planned_implementation_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    actual_implementation_date: Mapped[date | None] = mapped_column(Date, nullable=True)

    # ── Free-form extras ──
    tags: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    metadata_: Mapped[dict | None] = mapped_column("metadata", JSONB, nullable=True)

    # Relationships
    status_history = relationship(
        "MOCStatusHistory",
        back_populates="moc",
        cascade="all, delete-orphan",
        order_by="MOCStatusHistory.created_at.desc()",
    )
    validations = relationship(
        "MOCValidation",
        back_populates="moc",
        cascade="all, delete-orphan",
        order_by="MOCValidation.created_at",
    )


# ─── Status transitions audit log ─────────────────────────────────────────────


class MOCStatusHistory(UUIDPrimaryKeyMixin, Base):
    """One row per status transition. Read-only audit trail."""

    __tablename__ = "moc_status_history"
    __table_args__ = (
        Index("idx_moc_status_history_moc", "moc_id"),
    )

    moc_id: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("mocs.id", ondelete="CASCADE"), nullable=False
    )
    old_status: Mapped[str | None] = mapped_column(String(30), nullable=True)
    new_status: Mapped[str] = mapped_column(String(30), nullable=False)
    changed_by: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    moc = relationship("MOC", back_populates="status_history")


# ─── Parallel validation matrix ───────────────────────────────────────────────


class MOCValidation(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Per-role validation entry during the `study_in_validation` phase.

    The CDC formulaire matrix has columns:
      * Entité (HSE / Lead Process / Production Manager / Gaz Manager /
        Maintenance Manager / Métier)
      * Nécessaire oui/non
      * Réalisé oui/non
      * Commentaires / recommandations
      * Date / visa
      * Validation level (DO / DG / DO+DG)

    Each MOC has one row per role that has been asked to validate. Rows
    are created lazily when an actor opts in (instead of pre-seeding all
    6 rows) so the matrix reflects real participation.
    """

    __tablename__ = "moc_validations"
    __table_args__ = (
        CheckConstraint(
            f"role IN {MOC_VALIDATION_ROLES}",
            name="ck_moc_validation_role",
        ),
        CheckConstraint(
            f"level IS NULL OR level IN {MOC_VALIDATION_LEVELS}",
            name="ck_moc_validation_level",
        ),
        UniqueConstraint("moc_id", "role", "metier_code", name="uq_moc_validation_role"),
        Index("idx_moc_validations_moc", "moc_id"),
    )

    moc_id: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("mocs.id", ondelete="CASCADE"), nullable=False
    )
    role: Mapped[str] = mapped_column(String(30), nullable=False)
    # When role == "metier", specify the discipline (elec, instru, piping…)
    metier_code: Mapped[str | None] = mapped_column(String(40), nullable=True)

    required: Mapped[bool] = mapped_column(Boolean, server_default="false")
    completed: Mapped[bool] = mapped_column(Boolean, server_default="false")
    approved: Mapped[bool | None] = mapped_column(Boolean, nullable=True)

    validator_id: Mapped[PyUUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )
    validator_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    level: Mapped[str | None] = mapped_column(String(20), nullable=True)
    # Free-text metier label ("Électricité", "Piping", "Instru"…) when role="metier".
    # Complements the rigid metier_code used for uniqueness — admins can
    # customise the display without touching the CHECK constraint.
    metier_name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    comments: Mapped[str | None] = mapped_column(Text, nullable=True)
    validated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    moc = relationship("MOC", back_populates="validations")


# ─── Per-site person directory (CDC §4.4) ─────────────────────────────────────


class MOCSiteAssignment(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Maps a user to a role on a specific site_label within an entity.

    Used by the notification layer so we only alert the chef de site of
    RDR EAST when an MOC on RDR EAST changes status — instead of pinging
    every user that happens to hold `moc.site_chief.approve` on the entity.

    Kept deliberately simple: free-text site_label (matches what the MOC
    stores) + enum role + FK to user. Admins manage assignments via
    Settings → MOC → Site assignments.
    """

    __tablename__ = "moc_site_assignments"
    __table_args__ = (
        CheckConstraint(
            f"role IN {MOC_SITE_ROLES}",
            name="ck_moc_site_assignment_role",
        ),
        UniqueConstraint(
            "entity_id", "site_label", "role", "user_id",
            name="uq_moc_site_assignment",
        ),
        Index("idx_moc_site_assignments_entity_site", "entity_id", "site_label"),
    )

    entity_id: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("entities.id"), nullable=False,
    )
    site_label: Mapped[str] = mapped_column(String(100), nullable=False)
    role: Mapped[str] = mapped_column(String(30), nullable=False)
    user_id: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False,
    )
    active: Mapped[bool] = mapped_column(Boolean, server_default="true", nullable=False)
