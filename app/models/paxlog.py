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
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, SoftDeleteMixin, TimestampMixin, UUIDPrimaryKeyMixin


# ─── PAX Groups ──────────────────────────────────────────────────────────────

class PaxGroup(UUIDPrimaryKeyMixin, Base):
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

class CredentialType(UUIDPrimaryKeyMixin, Base):
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

class ComplianceMatrixEntry(UUIDPrimaryKeyMixin, Base):
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

class AdsPax(UUIDPrimaryKeyMixin, Base):
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

class PaxIncident(UUIDPrimaryKeyMixin, Base):
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
