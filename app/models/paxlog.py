"""PaxLog ORM models — PAX profiles, credentials, compliance, AdS, incidents."""

from datetime import date, datetime
from decimal import Decimal
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
    SmallInteger,
    String,
    Text,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, SoftDeleteMixin, TimestampMixin, UUIDPrimaryKeyMixin


# ─── PAX Groups ──────────────────────────────────────────────────────────────

class PaxGroup(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "pax_groups"
    __table_args__ = (
        Index("idx_pax_groups_entity", "entity_id"),
    )

    entity_id: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("entities.id"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    company_id: Mapped[PyUUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tiers.id")
    )
    active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


# ─── PAX Profiles ────────────────────────────────────────────────────────────

class PaxProfile(UUIDPrimaryKeyMixin, TimestampMixin, SoftDeleteMixin, Base):
    __tablename__ = "pax_profiles"
    __table_args__ = (
        Index("idx_pax_entity", "entity_id"),
        Index("idx_pax_company", "company_id"),
        Index("idx_pax_user", "user_id"),
        # Duplicate prevention: same person (normalized names + birth_date) per entity
        UniqueConstraint(
            "entity_id", "first_name_normalized", "last_name_normalized", "birth_date",
            name="uq_pax_identity",
        ),
        # Badge number unique per entity (when not NULL)
        Index(
            "uq_pax_badge_entity",
            "entity_id", "badge_number",
            unique=True,
            postgresql_where=text("badge_number IS NOT NULL AND archived = false"),
        ),
        CheckConstraint(
            "status IN ('active','incomplete','suspended','archived')",
            name="ck_pax_status",
        ),
        CheckConstraint("type IN ('internal','external')", name="ck_pax_type"),
        CheckConstraint(
            "profile_completeness BETWEEN 0 AND 100",
            name="ck_pax_completeness",
        ),
    )

    entity_id: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("entities.id"), nullable=False
    )
    type: Mapped[str] = mapped_column(String(20), nullable=False)
    first_name: Mapped[str] = mapped_column(String(100), nullable=False)
    last_name: Mapped[str] = mapped_column(String(100), nullable=False)
    first_name_normalized: Mapped[str] = mapped_column(String(100), nullable=False)
    last_name_normalized: Mapped[str] = mapped_column(String(100), nullable=False)
    birth_date: Mapped[date | None] = mapped_column(Date)
    nationality: Mapped[str | None] = mapped_column(String(100))
    company_id: Mapped[PyUUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tiers.id")
    )
    group_id: Mapped[PyUUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("pax_groups.id")
    )
    user_id: Mapped[PyUUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id")
    )
    badge_number: Mapped[str | None] = mapped_column(String(100))
    photo_url: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="active")
    profile_completeness: Mapped[int] = mapped_column(
        SmallInteger, nullable=False, default=0
    )
    synced_from_intranet: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False
    )
    intranet_id: Mapped[str | None] = mapped_column(String(100))
    last_synced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    credentials: Mapped[list["PaxCredential"]] = relationship(
        back_populates="pax_profile", cascade="all, delete-orphan"
    )


# ─── Credential Types (global reference — no entity_id) ─────────────────────

class CredentialType(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "credential_types"
    __table_args__ = (
        CheckConstraint(
            "category IN ('safety','medical','technical','administrative')",
            name="ck_credtype_category",
        ),
    )

    code: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    category: Mapped[str] = mapped_column(String(30), nullable=False)
    has_expiry: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    validity_months: Mapped[int | None] = mapped_column(SmallInteger)
    proof_required: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    booking_service_id: Mapped[PyUUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("departments.id")
    )
    active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


# ─── PAX Credentials ────────────────────────────────────────────────────────

class PaxCredential(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "pax_credentials"
    __table_args__ = (
        UniqueConstraint("pax_id", "credential_type_id", name="uq_pax_credential"),
        Index("idx_creds_pax", "pax_id"),
        Index("idx_creds_status", "status"),
        CheckConstraint(
            "status IN ('valid','expired','pending_validation','rejected')",
            name="ck_cred_status",
        ),
    )

    pax_id: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("pax_profiles.id"), nullable=False
    )
    credential_type_id: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("credential_types.id"), nullable=False
    )
    obtained_date: Mapped[date] = mapped_column(Date, nullable=False)
    expiry_date: Mapped[date | None] = mapped_column(Date)
    proof_url: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(
        String(30), nullable=False, default="pending_validation"
    )
    validated_by: Mapped[PyUUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id")
    )
    validated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    rejection_reason: Mapped[str | None] = mapped_column(Text)
    notes: Mapped[str | None] = mapped_column(Text)

    pax_profile: Mapped["PaxProfile"] = relationship(back_populates="credentials")
    credential_type: Mapped["CredentialType"] = relationship()


# ─── Compliance Matrix ───────────────────────────────────────────────────────

class ComplianceMatrixEntry(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "compliance_matrix"
    __table_args__ = (
        UniqueConstraint(
            "entity_id", "asset_id", "credential_type_id", "scope",
            name="uq_compliance_matrix",
        ),
        Index("idx_matrix_asset", "asset_id"),
        CheckConstraint(
            "scope IN ('all_visitors','contractors_only','permanent_staff_only')",
            name="ck_matrix_scope",
        ),
        CheckConstraint(
            "defined_by IN ('hse_central','site')",
            name="ck_matrix_defined_by",
        ),
    )

    entity_id: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("entities.id"), nullable=False
    )
    asset_id: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("assets.id"), nullable=False
    )
    credential_type_id: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("credential_types.id"), nullable=False
    )
    mandatory: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    scope: Mapped[str] = mapped_column(
        String(30), nullable=False, default="all_visitors"
    )
    defined_by: Mapped[str] = mapped_column(String(20), nullable=False)
    set_by: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    effective_date: Mapped[date] = mapped_column(Date, nullable=False)
    notes: Mapped[str | None] = mapped_column(Text)


# ─── Avis de Séjour (AdS) ───────────────────────────────────────────────────

class Ads(UUIDPrimaryKeyMixin, TimestampMixin, SoftDeleteMixin, Base):
    __tablename__ = "ads"
    __table_args__ = (
        Index("idx_ads_entity", "entity_id"),
        Index("idx_ads_status", "entity_id", "status"),
        Index("idx_ads_asset", "site_entry_asset_id"),
        Index("idx_ads_dates", "start_date", "end_date"),
        Index("idx_ads_requester", "requester_id"),
        CheckConstraint("end_date >= start_date", name="ck_ads_dates"),
        CheckConstraint(
            "status IN ('draft','submitted','pending_initiator_review',"
            "'pending_project_review','pending_compliance','pending_validation',"
            "'approved','rejected','cancelled','requires_review',"
            "'pending_arbitration','in_progress','completed')",
            name="ck_ads_status",
        ),
        CheckConstraint(
            "type IN ('individual','team')",
            name="ck_ads_type",
        ),
        CheckConstraint(
            "visit_category IN ('project_work','maintenance','inspection',"
            "'visit','permanent_ops','other')",
            name="ck_ads_visit_category",
        ),
    )

    entity_id: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("entities.id"), nullable=False
    )
    reference: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    type: Mapped[str] = mapped_column(String(20), nullable=False, default="individual")
    status: Mapped[str] = mapped_column(String(40), nullable=False, default="draft")
    workflow_id: Mapped[PyUUID | None] = mapped_column(UUID(as_uuid=True))
    planner_activity_id: Mapped[PyUUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("planner_activities.id")
    )
    project_id: Mapped[PyUUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id")
    )
    requester_id: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    site_entry_asset_id: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("assets.id"), nullable=False
    )
    visit_purpose: Mapped[str] = mapped_column(Text, nullable=False)
    visit_category: Mapped[str] = mapped_column(String(50), nullable=False)
    visit_category_requires_planner: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False
    )
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date] = mapped_column(Date, nullable=False)
    outbound_transport_mode: Mapped[str | None] = mapped_column(String(50))
    outbound_departure_base_id: Mapped[PyUUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("assets.id")
    )
    outbound_notes: Mapped[str | None] = mapped_column(Text)
    return_transport_mode: Mapped[str | None] = mapped_column(String(50))
    return_departure_base_id: Mapped[PyUUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("assets.id")
    )
    return_notes: Mapped[str | None] = mapped_column(Text)
    cross_company_flag: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False
    )
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    rejected_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    rejection_reason: Mapped[str | None] = mapped_column(Text)

    pax_entries: Mapped[list["AdsPax"]] = relationship(
        back_populates="ads", cascade="all, delete-orphan"
    )


# ─── PAX in an AdS ──────────────────────────────────────────────────────────

class AdsPax(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "ads_pax"
    __table_args__ = (
        UniqueConstraint("ads_id", "pax_id", name="uq_ads_pax"),
        Index("idx_ads_pax_ads", "ads_id"),
        Index("idx_ads_pax_pax", "pax_id"),
        Index("idx_ads_pax_status", "status"),
        CheckConstraint(
            "status IN ('pending_check','compliant','blocked','approved','rejected','no_show')",
            name="ck_ads_pax_status",
        ),
    )

    ads_id: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("ads.id", ondelete="CASCADE"), nullable=False
    )
    pax_id: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("pax_profiles.id"), nullable=False
    )
    status: Mapped[str] = mapped_column(
        String(30), nullable=False, default="pending_check"
    )
    compliance_checked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    compliance_summary: Mapped[dict | None] = mapped_column(JSONB)
    booking_request_sent: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False
    )
    current_onboard: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False
    )
    priority_score: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    priority_source: Mapped[str | None] = mapped_column(String(50))

    ads: Mapped["Ads"] = relationship(back_populates="pax_entries")


# ─── PAX Incidents ───────────────────────────────────────────────────────────

class PaxIncident(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "pax_incidents"
    __table_args__ = (
        Index("idx_incidents_pax", "pax_id"),
        Index("idx_incidents_company", "company_id"),
        CheckConstraint(
            "severity IN ('info','warning','temp_ban','permanent_ban')",
            name="ck_incident_severity",
        ),
    )

    entity_id: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("entities.id"), nullable=False
    )
    pax_id: Mapped[PyUUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("pax_profiles.id")
    )
    company_id: Mapped[PyUUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tiers.id")
    )
    asset_id: Mapped[PyUUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("assets.id")
    )
    severity: Mapped[str] = mapped_column(String(20), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    incident_date: Mapped[date] = mapped_column(Date, nullable=False)
    ban_start_date: Mapped[date | None] = mapped_column(Date)
    ban_end_date: Mapped[date | None] = mapped_column(Date)
    recorded_by: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    resolved_by: Mapped[PyUUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id")
    )
    resolution_notes: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


# ─── Avis de Mission (AVM) ─────────────────────────────────────────────────

class MissionNotice(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """AVM — Avis de Mission: full mission dossier orchestrating all preparation tasks."""
    __tablename__ = "mission_notices"
    __table_args__ = (
        Index("idx_avm_entity", "entity_id", "status"),
        Index("idx_avm_creator", "created_by"),
        CheckConstraint(
            "status IN ('draft','in_preparation','active','ready','completed','cancelled')",
            name="ck_avm_status",
        ),
        CheckConstraint(
            "mission_type IN ('standard','vip','regulatory','emergency')",
            name="ck_avm_mission_type",
        ),
    )

    entity_id: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("entities.id"), nullable=False
    )
    reference: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    created_by: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="draft")
    planned_start_date: Mapped[date | None] = mapped_column(Date)
    planned_end_date: Mapped[date | None] = mapped_column(Date)
    requires_badge: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    requires_epi: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    requires_visa: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    eligible_displacement_allowance: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False
    )
    epi_measurements: Mapped[dict | None] = mapped_column(JSONB, default=dict)
    global_attachments_config: Mapped[list | None] = mapped_column(JSONB, default=list)
    per_pax_attachments_config: Mapped[list | None] = mapped_column(JSONB, default=list)
    mission_type: Mapped[str] = mapped_column(
        String(50), nullable=False, default="standard"
    )
    pax_quota: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    archived: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    cancellation_reason: Mapped[str | None] = mapped_column(Text)

    programs: Mapped[list["MissionProgram"]] = relationship(
        back_populates="mission_notice", cascade="all, delete-orphan"
    )
    preparation_tasks: Mapped[list["MissionPreparationTask"]] = relationship(
        back_populates="mission_notice", cascade="all, delete-orphan"
    )
    stakeholders: Mapped[list["MissionStakeholder"]] = relationship(
        back_populates="mission_notice", cascade="all, delete-orphan"
    )


class MissionProgram(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Program line — one activity/site within a mission."""
    __tablename__ = "mission_programs"
    __table_args__ = (
        UniqueConstraint("mission_notice_id", "order_index", name="uq_mission_program_order"),
        Index("idx_mission_program", "mission_notice_id"),
        CheckConstraint(
            "activity_type IN ('visit','meeting','inspection','training','handover','other')",
            name="ck_mission_program_activity",
        ),
    )

    mission_notice_id: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("mission_notices.id", ondelete="CASCADE"), nullable=False
    )
    order_index: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=0)
    activity_description: Mapped[str] = mapped_column(Text, nullable=False)
    activity_type: Mapped[str] = mapped_column(String(50), nullable=False, default="visit")
    site_asset_id: Mapped[PyUUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("assets.id")
    )
    planned_start_date: Mapped[date | None] = mapped_column(Date)
    planned_end_date: Mapped[date | None] = mapped_column(Date)
    project_id: Mapped[PyUUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id")
    )
    generated_ads_id: Mapped[PyUUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("ads.id")
    )
    notes: Mapped[str | None] = mapped_column(Text)

    mission_notice: Mapped["MissionNotice"] = relationship(back_populates="programs")
    pax_entries: Mapped[list["MissionProgramPax"]] = relationship(
        back_populates="mission_program", cascade="all, delete-orphan"
    )


class MissionProgramPax(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """PAX assigned to a program line."""
    __tablename__ = "mission_program_pax"
    __table_args__ = (
        UniqueConstraint("mission_program_id", "pax_id", name="uq_mission_program_pax"),
    )

    mission_program_id: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("mission_programs.id", ondelete="CASCADE"), nullable=False
    )
    pax_id: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("pax_profiles.id"), nullable=False
    )
    role_in_mission: Mapped[str | None] = mapped_column(String(100))

    mission_program: Mapped["MissionProgram"] = relationship(back_populates="pax_entries")


class MissionPreparationTask(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Preparation task for a mission (visa, badge, EPI, etc.)."""
    __tablename__ = "mission_preparation_tasks"
    __table_args__ = (
        Index("idx_mission_prep", "mission_notice_id", "status"),
        CheckConstraint(
            "status IN ('pending','in_progress','completed','cancelled','blocked','na')",
            name="ck_mission_prep_status",
        ),
        CheckConstraint(
            "task_type IN ('visa','badge','epi_order','allowance','ads_creation',"
            "'document_collection','meeting_booking','briefing','other')",
            name="ck_mission_prep_type",
        ),
    )

    mission_notice_id: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("mission_notices.id", ondelete="CASCADE"), nullable=False
    )
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    task_type: Mapped[str] = mapped_column(String(50), nullable=False)
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="pending")
    assigned_to_user_id: Mapped[PyUUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id")
    )
    linked_ads_id: Mapped[PyUUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("ads.id")
    )
    due_date: Mapped[date | None] = mapped_column(Date)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    notes: Mapped[str | None] = mapped_column(Text)
    auto_generated: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    mission_notice: Mapped["MissionNotice"] = relationship(back_populates="preparation_tasks")


class MissionStakeholder(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Stakeholder receiving notifications about a mission."""
    __tablename__ = "mission_stakeholders"
    __table_args__ = (
        UniqueConstraint("mission_notice_id", "user_id", name="uq_mission_stakeholder"),
        CheckConstraint(
            "notification_level IN ('full','summary','milestone')",
            name="ck_stakeholder_notif_level",
        ),
    )

    mission_notice_id: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("mission_notices.id", ondelete="CASCADE"), nullable=False
    )
    user_id: Mapped[PyUUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id")
    )
    external_name: Mapped[str | None] = mapped_column(String(200))
    external_email: Mapped[str | None] = mapped_column(String(200))
    notification_level: Mapped[str] = mapped_column(
        String(20), nullable=False, default="summary"
    )

    mission_notice: Mapped["MissionNotice"] = relationship(back_populates="stakeholders")


# ─── AdS Imputation ──────────────────────────────────────────────────────

class AdsImputation(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Cost imputation split for an Avis de Sejour."""
    __tablename__ = "ads_imputations"
    __table_args__ = (
        Index("idx_ads_imp_ads", "ads_id"),
        Index("idx_ads_imp_project", "project_id"),
        CheckConstraint(
            "percentage > 0 AND percentage <= 100",
            name="ck_ads_imp_pct",
        ),
    )

    ads_id: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("ads.id", ondelete="CASCADE"), nullable=False
    )
    project_id: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id"), nullable=False
    )
    wbs_id: Mapped[PyUUID | None] = mapped_column(UUID(as_uuid=True))
    cost_center_id: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("cost_centers.id"), nullable=False
    )
    percentage: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False)
    cross_imputation: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default="false", nullable=False
    )
    notes: Mapped[str | None] = mapped_column(Text)


# ─── External Access Link ────────────────────────────────────────────────

class ExternalAccessLink(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Token-based external access link for AdS self-service."""
    __tablename__ = "external_access_links"
    __table_args__ = (
        Index(
            "idx_ext_links_token",
            "token",
            postgresql_where=text("revoked = FALSE"),
        ),
        Index("idx_ext_links_ads", "ads_id"),
    )

    ads_id: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("ads.id"), nullable=False
    )
    token: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    created_by: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    preconfigured_data: Mapped[dict | None] = mapped_column(JSONB)
    otp_required: Mapped[bool] = mapped_column(
        Boolean, default=True, server_default="true", nullable=False
    )
    otp_sent_to: Mapped[str | None] = mapped_column(String(255))
    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    max_uses: Mapped[int] = mapped_column(SmallInteger, default=1, nullable=False)
    use_count: Mapped[int] = mapped_column(SmallInteger, default=0, nullable=False)
    revoked: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default="false", nullable=False
    )
    access_log: Mapped[list | None] = mapped_column(JSONB, default=list)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


# ─── Pax Rotation Cycle ─────────────────────────────────────────────────

class PaxRotationCycle(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """On/off rotation cycle for a PAX at a specific site."""
    __tablename__ = "pax_rotation_cycles"
    __table_args__ = (
        Index("idx_rotation_pax", "pax_id"),
        Index("idx_rotation_site", "site_asset_id"),
        Index(
            "idx_rotation_active",
            "entity_id",
            postgresql_where=text("status = 'active'"),
        ),
        UniqueConstraint(
            "pax_id", "site_asset_id", "status",
            name="uq_rotation_pax_site_status",
        ),
        CheckConstraint("rotation_days_on > 0", name="ck_rotation_days_on"),
        CheckConstraint("rotation_days_off > 0", name="ck_rotation_days_off"),
    )

    entity_id: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("entities.id"), nullable=False
    )
    pax_id: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("pax_profiles.id"), nullable=False
    )
    site_asset_id: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("assets.id"), nullable=False
    )
    rotation_days_on: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    rotation_days_off: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    cycle_start_date: Mapped[date] = mapped_column(Date, nullable=False)
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="active", server_default="active"
    )
    auto_create_ads: Mapped[bool] = mapped_column(
        Boolean, default=True, server_default="true", nullable=False
    )
    ads_lead_days: Mapped[int] = mapped_column(
        SmallInteger, default=7, server_default="7", nullable=False
    )
    default_project_id: Mapped[PyUUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id")
    )
    default_cc_id: Mapped[PyUUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("cost_centers.id")
    )
    created_by: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


# ─── Stay Program ────────────────────────────────────────────────────────

class StayProgram(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Detailed movement program for a PAX during a stay."""
    __tablename__ = "stay_programs"
    __table_args__ = (
        Index("idx_stay_programs_ads", "ads_id"),
        Index("idx_stay_programs_pax", "pax_id"),
    )

    entity_id: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("entities.id"), nullable=False
    )
    ads_id: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("ads.id"), nullable=False
    )
    pax_id: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("pax_profiles.id"), nullable=False
    )
    status: Mapped[str] = mapped_column(
        String(30), nullable=False, default="draft", server_default="draft"
    )
    movements: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    approved_by: Mapped[PyUUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id")
    )
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    rejection_reason: Mapped[str | None] = mapped_column(Text)
    notes: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


# ─── Profile Type ────────────────────────────────────────────────────────

class ProfileType(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Configurable PAX profile type (e.g. operator, contractor, VIP)."""
    __tablename__ = "profile_types"
    __table_args__ = (
        UniqueConstraint("entity_id", "code", name="uq_profile_type_entity_code"),
    )

    entity_id: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("entities.id"), nullable=False
    )
    code: Mapped[str] = mapped_column(String(50), nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    active: Mapped[bool] = mapped_column(
        Boolean, default=True, server_default="true", nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


# ─── Pax Profile Type (junction) ─────────────────────────────────────────

class PaxProfileType(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Junction linking a PAX to one or more profile types."""
    __tablename__ = "pax_profile_types"
    __table_args__ = (
        UniqueConstraint("pax_id", "profile_type_id", name="uq_pax_profile_type"),
    )

    pax_id: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("pax_profiles.id", ondelete="CASCADE"), nullable=False
    )
    profile_type_id: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("profile_types.id"), nullable=False
    )
    assigned_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    assigned_by: Mapped[PyUUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id")
    )


# ─── Profile Habilitation Matrix ─────────────────────────────────────────

class ProfileHabilitationMatrix(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Maps which credentials are required for each profile type."""
    __tablename__ = "profile_habilitation_matrix"
    __table_args__ = (
        UniqueConstraint(
            "entity_id", "profile_type_id", "credential_type_id",
            name="uq_hab_matrix",
        ),
    )

    entity_id: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("entities.id"), nullable=False
    )
    profile_type_id: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("profile_types.id"), nullable=False
    )
    credential_type_id: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("credential_types.id"), nullable=False
    )
    mandatory: Mapped[bool] = mapped_column(
        Boolean, default=True, server_default="true", nullable=False
    )
    set_by: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    effective_date: Mapped[date] = mapped_column(Date, nullable=False)
    notes: Mapped[str | None] = mapped_column(Text)


# ─── Pax Company Group ──────────────────────────────────────────────────

class PaxCompanyGroup(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Company-level grouping for PAX management."""
    __tablename__ = "pax_company_groups"
    __table_args__ = (
        Index("idx_pax_company_groups_tiers", "tiers_id"),
    )

    entity_id: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("entities.id"), nullable=False
    )
    tiers_id: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tiers.id"), nullable=False
    )
    group_name: Mapped[str] = mapped_column(String(200), nullable=False)
    supervisor_id: Mapped[PyUUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id")
    )
    active: Mapped[bool] = mapped_column(
        Boolean, default=True, server_default="true", nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
