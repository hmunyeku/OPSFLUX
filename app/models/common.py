"""Core ORM models — entities, users, roles, assets, tiers, departments, etc."""

from datetime import date, datetime
from decimal import Decimal
from uuid import UUID as PyUUID

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Column,
    Date,
    DateTime,
    Float,
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

from app.models.base import Base, SoftDeleteMixin, TimestampMixin, UUIDPrimaryKeyMixin, VerifiableMixin


# ─── Entities ────────────────────────────────────────────────────────────────

class Entity(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "entities"

    # ── Identity ──
    code: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    trade_name: Mapped[str | None] = mapped_column(String(200))
    logo_url: Mapped[str | None] = mapped_column(String(500))
    parent_id: Mapped[PyUUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("entities.id")
    )

    # ── Legal ──
    legal_form: Mapped[str | None] = mapped_column(String(100))
    registration_number: Mapped[str | None] = mapped_column(String(100))
    tax_id: Mapped[str | None] = mapped_column(String(100))
    vat_number: Mapped[str | None] = mapped_column(String(100))
    capital: Mapped[float | None] = mapped_column(Float)
    currency: Mapped[str] = mapped_column(String(10), nullable=False, default="XAF")
    fiscal_year_start: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    industry: Mapped[str | None] = mapped_column(String(200))
    founded_date: Mapped[date | None] = mapped_column(Date)

    # ── Address ──
    address_line1: Mapped[str | None] = mapped_column(String(300))
    address_line2: Mapped[str | None] = mapped_column(String(300))
    city: Mapped[str | None] = mapped_column(String(100))
    state: Mapped[str | None] = mapped_column(String(100))
    zip_code: Mapped[str | None] = mapped_column(String(20))
    country: Mapped[str | None] = mapped_column(String(100))

    # ── Contact ──
    phone: Mapped[str | None] = mapped_column(String(50))
    fax: Mapped[str | None] = mapped_column(String(50))
    email: Mapped[str | None] = mapped_column(String(200))
    website: Mapped[str | None] = mapped_column(String(300))

    # ── Region / Config ──
    timezone: Mapped[str] = mapped_column(String(50), nullable=False, default="Africa/Douala")
    language: Mapped[str] = mapped_column(String(10), nullable=False, default="fr")
    active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    # ── Extended (JSONB) ──
    social_networks: Mapped[dict | None] = mapped_column(JSONB)
    opening_hours: Mapped[dict | None] = mapped_column(JSONB)
    notes: Mapped[str | None] = mapped_column(Text)

    # ── Relationships ──
    parent: Mapped["Entity | None"] = relationship(
        "Entity", remote_side="Entity.id", back_populates="children"
    )
    children: Mapped[list["Entity"]] = relationship(
        "Entity", back_populates="parent"
    )
    business_units: Mapped[list["BusinessUnit"]] = relationship(back_populates="entity")
    cost_centers: Mapped[list["CostCenter"]] = relationship(back_populates="entity")


# ─── Business Units ──────────────────────────────────────────────────────────

class BusinessUnit(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Business Unit — subdivision organisationnelle d'une entité."""
    __tablename__ = "business_units"
    __table_args__ = (
        Index("uq_business_unit_entity_code", "entity_id", "code", unique=True),
    )

    entity_id: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("entities.id"), nullable=False
    )
    code: Mapped[str] = mapped_column(String(50), nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    manager_id: Mapped[PyUUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )
    active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    entity: Mapped["Entity"] = relationship(back_populates="business_units")
    manager: Mapped["User | None"] = relationship(foreign_keys=[manager_id])

# Keep Department as alias for backward compatibility
Department = BusinessUnit


# ─── Cost Centers ────────────────────────────────────────────────────────────

class CostCenter(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "cost_centers"
    __table_args__ = (
        Index("uq_cost_center_entity_code", "entity_id", "code", unique=True),
    )

    entity_id: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("entities.id"), nullable=False
    )
    code: Mapped[str] = mapped_column(String(50), nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    department_id: Mapped[PyUUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("departments.id")
    )
    active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    entity: Mapped["Entity"] = relationship(back_populates="cost_centers")


# ─── Users ───────────────────────────────────────────────────────────────────

class User(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "users"

    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    first_name: Mapped[str] = mapped_column(String(100), nullable=False)
    last_name: Mapped[str] = mapped_column(String(100), nullable=False)
    hashed_password: Mapped[str | None] = mapped_column(String(200))
    active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    default_entity_id: Mapped[PyUUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("entities.id")
    )
    intranet_id: Mapped[str | None] = mapped_column(String(100), unique=True, index=True)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    language: Mapped[str] = mapped_column(String(5), default="fr", nullable=False)
    avatar_url: Mapped[str | None] = mapped_column(String(500))

    # MFA (TOTP)
    totp_secret: Mapped[str | None] = mapped_column(String(200), nullable=True)
    mfa_enabled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    mfa_backup_codes: Mapped[list | None] = mapped_column(JSONB, nullable=True)

    # Auth security (AUTH.md §7)
    auth_type: Mapped[str] = mapped_column(
        String(20), default="email_password", nullable=False
    )  # email_password | sso | both
    sso_subject: Mapped[str | None] = mapped_column(String(255), nullable=True)
    failed_login_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    locked_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_login_ip: Mapped[str | None] = mapped_column(String(45), nullable=True)
    account_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    password_changed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # HR Identity
    passport_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    gender: Mapped[str | None] = mapped_column(String(1), nullable=True)  # M, F, X
    nationality: Mapped[str | None] = mapped_column(String(100), nullable=True)
    birth_country: Mapped[str | None] = mapped_column(String(100), nullable=True)
    birth_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    birth_city: Mapped[str | None] = mapped_column(String(100), nullable=True)

    # Identity verification — locks identity fields after admin verification
    identity_verified: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false", nullable=False)
    identity_verified_by: Mapped[PyUUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    identity_verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Travel
    contractual_airport: Mapped[str | None] = mapped_column(String(200), nullable=True)
    nearest_airport: Mapped[str | None] = mapped_column(String(200), nullable=True)
    nearest_station: Mapped[str | None] = mapped_column(String(200), nullable=True)
    loyalty_program: Mapped[str | None] = mapped_column(String(200), nullable=True)

    # Health / Medical
    last_medical_check: Mapped[date | None] = mapped_column(Date, nullable=True)
    last_international_medical_check: Mapped[date | None] = mapped_column(Date, nullable=True)
    last_subsidiary_medical_check: Mapped[date | None] = mapped_column(Date, nullable=True)

    # Body measurements / Mensurations
    height: Mapped[int | None] = mapped_column(Integer, nullable=True)  # cm
    weight: Mapped[float | None] = mapped_column(Float, nullable=True)  # kg
    ppe_clothing_size: Mapped[str | None] = mapped_column(String(20), nullable=True)
    ppe_shoe_size: Mapped[str | None] = mapped_column(String(20), nullable=True)
    ppe_clothing_size_bottom: Mapped[str | None] = mapped_column(String(20), nullable=True)

    # Misc / HR
    retirement_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    vantage_number: Mapped[str | None] = mapped_column(String(50), nullable=True)
    extension_number: Mapped[str | None] = mapped_column(String(20), nullable=True)

    # User classification (internal = entity member, external = linked to tier/company)
    user_type: Mapped[str] = mapped_column(
        String(20), default="internal", nullable=False
    )  # internal | external

    # Messaging preferences — user can override admin defaults
    preferred_messaging_channel: Mapped[str] = mapped_column(
        String(20), default="auto", nullable=False
    )  # auto | whatsapp | sms | email

    # Job position (linked to conformité — determines required referentiels)
    job_position_id: Mapped[PyUUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("job_positions.id"), nullable=True
    )
    business_unit_id: Mapped[PyUUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("business_units.id"), nullable=True
    )

    job_position: Mapped["JobPosition | None"] = relationship(foreign_keys=[job_position_id])
    business_unit: Mapped["BusinessUnit | None"] = relationship(foreign_keys=[business_unit_id])

    group_memberships: Mapped[list["UserGroupMember"]] = relationship(back_populates="user")
    tier_links: Mapped[list["UserTierLink"]] = relationship(back_populates="user")
    access_tokens: Mapped[list["PersonalAccessToken"]] = relationship(back_populates="user")
    sessions: Mapped[list["UserSession"]] = relationship(back_populates="user")
    emails: Mapped[list["UserEmail"]] = relationship(back_populates="user")
    oauth_applications: Mapped[list["OAuthApplication"]] = relationship(back_populates="user")

    # ── PAX-specific fields (migrated from pax_profiles) ──
    badge_number: Mapped[str | None] = mapped_column(String(100))
    pax_group_id: Mapped[PyUUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("pax_groups.id", ondelete="SET NULL")
    )
    pax_status: Mapped[str] = mapped_column(
        String(20), default="active", server_default="active", nullable=False
    )  # active | incomplete | suspended | archived

    @property
    def pax_type(self) -> str:
        """PAX type derived from user_type (for compliance scope filtering)."""
        return self.user_type  # 'internal' or 'external'

    @property
    def full_name(self) -> str:
        return f"{self.first_name} {self.last_name}"

    @property
    def job_position_name(self) -> str | None:
        """Safe access to job_position.name — returns None if relationship not loaded (async context)."""
        from sqlalchemy.orm import InstanceState
        state: InstanceState = self.__dict__.get("_sa_instance_state")  # type: ignore[assignment]
        if state and "job_position" not in state.dict:
            return None
        jp = self.__dict__.get("job_position")
        return jp.name if jp else None

    @property
    def business_unit_name(self) -> str | None:
        """Safe access to business_unit.name."""
        from sqlalchemy.orm import InstanceState
        state: InstanceState = self.__dict__.get("_sa_instance_state")  # type: ignore[assignment]
        if state and "business_unit" not in state.dict:
            return None
        bu = self.__dict__.get("business_unit")
        return bu.name if bu else None


# ─── Roles ───────────────────────────────────────────────────────────────────

class Role(TimestampMixin, Base):
    __tablename__ = "roles"

    code: Mapped[str] = mapped_column(String(50), primary_key=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    module: Mapped[str | None] = mapped_column(String(50))


# ─── Permissions ─────────────────────────────────────────────────────────────

class Permission(Base):
    __tablename__ = "permissions"

    code: Mapped[str] = mapped_column(String(100), primary_key=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    module: Mapped[str | None] = mapped_column(String(50))
    description: Mapped[str | None] = mapped_column(Text)


class RolePermission(Base):
    __tablename__ = "role_permissions"

    role_code: Mapped[str] = mapped_column(
        String(50), ForeignKey("roles.code"), primary_key=True
    )
    permission_code: Mapped[str] = mapped_column(
        String(100), ForeignKey("permissions.code"), primary_key=True
    )


# ─── User Groups (role + asset scope) ───────────────────────────────────────

class UserGroupRole(Base):
    """Junction table: many-to-many between UserGroup and Role."""
    __tablename__ = "user_group_roles"

    group_id: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("user_groups.id", ondelete="CASCADE"), primary_key=True
    )
    role_code: Mapped[str] = mapped_column(
        String(50), ForeignKey("roles.code", ondelete="CASCADE"), primary_key=True
    )


class UserGroup(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "user_groups"

    entity_id: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("entities.id"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    asset_scope: Mapped[PyUUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("ar_installations.id")
    )
    active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    members: Mapped[list["UserGroupMember"]] = relationship(back_populates="group")
    roles: Mapped[list["UserGroupRole"]] = relationship(cascade="all, delete-orphan")
    permission_overrides: Mapped[list["GroupPermissionOverride"]] = relationship(
        back_populates="group", cascade="all, delete-orphan"
    )


class UserGroupMember(Base):
    __tablename__ = "user_group_members"

    user_id: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), primary_key=True
    )
    group_id: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("user_groups.id"), primary_key=True
    )
    joined_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    user: Mapped["User"] = relationship(back_populates="group_memberships")
    group: Mapped["UserGroup"] = relationship(back_populates="members")


class UserTierLink(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Link a user to a tier (company).  External users are scoped to their linked tiers."""
    __tablename__ = "user_tier_links"
    __table_args__ = (
        UniqueConstraint("user_id", "tier_id", name="uq_user_tier"),
    )

    user_id: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True
    )
    tier_id: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tiers.id"), nullable=False, index=True
    )
    role: Mapped[str] = mapped_column(String(50), default="viewer", nullable=False)

    user: Mapped["User"] = relationship(back_populates="tier_links")
    tier: Mapped["Tier"] = relationship()


# ─── Permission Overrides (group-level and user-level) ───────────────────────

class GroupPermissionOverride(Base):
    """Per-group permission override. Lowest priority layer."""
    __tablename__ = "group_permission_overrides"

    group_id: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("user_groups.id", ondelete="CASCADE"),
        primary_key=True,
    )
    permission_code: Mapped[str] = mapped_column(
        String(100), ForeignKey("permissions.code"), primary_key=True
    )
    granted: Mapped[bool] = mapped_column(Boolean, nullable=False)

    group: Mapped["UserGroup"] = relationship(back_populates="permission_overrides")


class UserPermissionOverride(Base):
    """Per-user permission override. Highest priority layer."""
    __tablename__ = "user_permission_overrides"

    user_id: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
    )
    permission_code: Mapped[str] = mapped_column(
        String(100), ForeignKey("permissions.code"), primary_key=True
    )
    granted: Mapped[bool] = mapped_column(Boolean, nullable=False)


# ─── Refresh Tokens ──────────────────────────────────────────────────────────

class RefreshToken(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "refresh_tokens"
    __table_args__ = (
        Index("idx_refresh_tokens_user", "user_id", postgresql_where=Column("revoked") == False),
    )

    user_id: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    token_hash: Mapped[str] = mapped_column(String(200), unique=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    revoked: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)


# ─── Reference Sequences ────────────────────────────────────────────────────

class ReferenceSequence(Base):
    __tablename__ = "reference_sequences"

    prefix: Mapped[str] = mapped_column(String(20), primary_key=True)
    year: Mapped[int] = mapped_column(primary_key=True)
    last_value: Mapped[int] = mapped_column(default=0, nullable=False)


# ─── Event Store ─────────────────────────────────────────────────────────────

class EventStore(Base):
    __tablename__ = "event_store"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    event_name: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    payload: Mapped[dict] = mapped_column(JSONB, nullable=False)
    emitted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    processed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    handler: Mapped[str | None] = mapped_column(String(100))
    retry_count: Mapped[int] = mapped_column(default=0, nullable=False)
    error: Mapped[str | None] = mapped_column(Text)


# ─── Audit Log ───────────────────────────────────────────────────────────────

class AuditLog(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "audit_log"

    entity_id: Mapped[PyUUID | None] = mapped_column(UUID(as_uuid=True))
    user_id: Mapped[PyUUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"))
    action: Mapped[str] = mapped_column(String(50), nullable=False)
    resource_type: Mapped[str] = mapped_column(String(100), nullable=False)
    resource_id: Mapped[str | None] = mapped_column(String(36))
    details: Mapped[dict | None] = mapped_column(JSONB)
    ip_address: Mapped[str | None] = mapped_column(String(45))
    user_agent: Mapped[str | None] = mapped_column(String(500))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


# ─── Notifications ──────────────────────────────────────────────────────────

class Notification(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "notifications"

    entity_id: Mapped[PyUUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    user_id: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    body: Mapped[str | None] = mapped_column(Text)
    category: Mapped[str] = mapped_column(String(50), nullable=False)
    link: Mapped[str | None] = mapped_column(String(500))
    read: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


# ─── Settings (DB-stored tenant/user preferences) ───────────────────────────

class Setting(Base):
    __tablename__ = "settings"

    key: Mapped[str] = mapped_column(String(200), primary_key=True)
    value: Mapped[dict] = mapped_column(JSONB, nullable=False)
    scope: Mapped[str] = mapped_column(
        String(20), nullable=False, default="tenant"
    )  # tenant | entity | user
    scope_id: Mapped[str | None] = mapped_column(String(36))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


# ─── Tiers (companies) ──────────────────────────────────────────────────────

class Tier(UUIDPrimaryKeyMixin, TimestampMixin, SoftDeleteMixin, Base):
    """Company / third-party (client, supplier, sub-contractor, partner).

    All contact info (phones, emails, addresses) is managed via polymorphic
    components with owner_type='tier'. Legal identifiers (SIRET, RCCM, NIU,
    TVA...) are stored in the TierIdentifier table. Notes, files, tags are
    likewise polymorphic.
    """
    __tablename__ = "tiers"

    entity_id: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("entities.id"), nullable=False
    )
    code: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    alias: Mapped[str | None] = mapped_column(String(200))  # trade name / DBA
    type: Mapped[str | None] = mapped_column(String(50))  # client, supplier, subcontractor, partner
    website: Mapped[str | None] = mapped_column(String(500))
    # Legacy convenience fields (kept for backwards compat; prefer polymorphic)
    phone: Mapped[str | None] = mapped_column(String(50))
    email: Mapped[str | None] = mapped_column(String(255))
    # Legal / corporate
    legal_form: Mapped[str | None] = mapped_column(String(100))  # SARL, SA, SAS, GIE, etc.
    capital: Mapped[float | None] = mapped_column(Float)
    currency: Mapped[str] = mapped_column(String(10), default="XAF", nullable=False)
    # Business
    industry: Mapped[str | None] = mapped_column(String(100))
    payment_terms: Mapped[str | None] = mapped_column(String(100))
    incoterm: Mapped[str | None] = mapped_column(String(20))         # EXW, FOB, CIF, DDP, etc.
    incoterm_city: Mapped[str | None] = mapped_column(String(100))   # Ville d'incoterm (Douala, etc.)
    description: Mapped[str | None] = mapped_column(Text)
    # Status
    active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    metadata_: Mapped[dict | None] = mapped_column("metadata", JSONB)

    is_blocked: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    scope: Mapped[str] = mapped_column(String(20), default="local", nullable=False)  # 'local' or 'international'

    contacts: Mapped[list["TierContact"]] = relationship(back_populates="tier")


class TierContact(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Employee / contact person at a company (Tier).

    Each contact is a first-class entity: it owns polymorphic components
    (phones, emails, addresses, notes, attachments) via owner_type='tier_contact'.
    NO direct phone/email fields — all managed via polymorphic tables.
    A contact can be promoted to a PaxProfile for PaxLog tracking.
    """
    __tablename__ = "tier_contacts"
    __table_args__ = (
        Index("idx_tier_contacts_tier", "tier_id"),
    )

    tier_id: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tiers.id"), nullable=False
    )
    civility: Mapped[str | None] = mapped_column(String(20))  # Mr, Mme, Dr, etc.
    first_name: Mapped[str] = mapped_column(String(100), nullable=False)
    last_name: Mapped[str] = mapped_column(String(100), nullable=False)
    # Legacy convenience fields (kept for backwards compat; prefer polymorphic)
    email: Mapped[str | None] = mapped_column(String(255))
    phone: Mapped[str | None] = mapped_column(String(50))
    position: Mapped[str | None] = mapped_column(String(100))  # job title (free text, legacy)
    department: Mapped[str | None] = mapped_column(String(100))
    job_position_id: Mapped[PyUUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("job_positions.id"), nullable=True
    )  # FK to referentiel fiche de poste
    is_primary: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    # ── PAX-specific fields (migrated from pax_profiles) ──
    birth_date: Mapped[date | None] = mapped_column(Date)
    nationality: Mapped[str | None] = mapped_column(String(100))
    badge_number: Mapped[str | None] = mapped_column(String(100))
    photo_url: Mapped[str | None] = mapped_column(Text)
    pax_group_id: Mapped[PyUUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("pax_groups.id", ondelete="SET NULL")
    )
    pax_status: Mapped[str] = mapped_column(
        String(20), default="active", server_default="active", nullable=False
    )  # active | incomplete | suspended | archived

    tier: Mapped["Tier"] = relationship(back_populates="contacts")
    job_position: Mapped["JobPosition | None"] = relationship(foreign_keys=[job_position_id])

    @property
    def pax_type(self) -> str:
        """TierContacts are always external PAX."""
        return "external"

    @property
    def full_name(self) -> str:
        return f"{self.first_name} {self.last_name}"


class LegalIdentifier(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Legal / fiscal identifier — polymorphic (entity, tier, user, etc.).

    Examples: SIRET, RCCM, NIU, TVA intracommunautaire, NIF, tax_id, etc.
    Types are dictionary-driven (category=legal_identifier_type) with per-country metadata.
    """
    __tablename__ = "legal_identifiers"
    __table_args__ = (
        Index("idx_legal_identifiers_owner", "owner_type", "owner_id"),
    )

    owner_type: Mapped[str] = mapped_column(String(50), nullable=False)  # entity, tier, user
    owner_id: Mapped[PyUUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    type: Mapped[str] = mapped_column(String(50), nullable=False)  # siret, rccm, niu, tva, nif, ...
    value: Mapped[str] = mapped_column(String(200), nullable=False)
    country: Mapped[str | None] = mapped_column(String(100))
    issued_at: Mapped[str | None] = mapped_column(String(20))  # ISO date string
    expires_at: Mapped[str | None] = mapped_column(String(20))


# Keep backward-compatible alias
TierIdentifier = LegalIdentifier


# ─── Tier Blocks (blocking/unblocking history) ──────────────────────────────

class TierBlock(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Blocking/unblocking history for a company (Tier).

    Tracks when a tier is blocked (purchasing, payment, all) and unblocked,
    with reason and date range. The latest active record determines whether
    the tier is currently blocked.
    """
    __tablename__ = "tier_blocks"
    __table_args__ = (
        Index("idx_tier_blocks_tier", "tier_id"),
        Index("idx_tier_blocks_entity", "entity_id"),
    )

    entity_id: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("entities.id"), nullable=False
    )
    tier_id: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tiers.id"), nullable=False
    )
    action: Mapped[str] = mapped_column(
        String(20), nullable=False
    )  # 'block' or 'unblock'
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    block_type: Mapped[str] = mapped_column(
        String(50), nullable=False, default="purchasing"
    )  # purchasing, payment, all
    start_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    end_date: Mapped[date | None] = mapped_column(Date, nullable=True)  # null = indefinite
    performed_by: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    tier: Mapped["Tier"] = relationship(foreign_keys=[tier_id])
    performer: Mapped["User"] = relationship(foreign_keys=[performed_by])


# ─── Workflow Definitions ────────────────────────────────────────────────────

class WorkflowDefinition(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "workflow_definitions"
    __table_args__ = (
        Index("idx_wf_def_entity", "entity_id"),
        Index("idx_wf_def_entity_slug", "entity_id", "slug"),
    )

    entity_id: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("entities.id"), nullable=False
    )
    slug: Mapped[str] = mapped_column(String(100), nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    entity_type: Mapped[str] = mapped_column(String(100), nullable=False)
    version: Mapped[int] = mapped_column(default=1, nullable=False)
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="draft"
    )  # draft | published | archived
    states: Mapped[dict] = mapped_column(JSONB, nullable=False)
    transitions: Mapped[dict] = mapped_column(JSONB, nullable=False)
    active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_by: Mapped[PyUUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id")
    )


class WorkflowInstance(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "workflow_instances"
    __table_args__ = (
        Index("idx_wf_inst_entity", "entity_id"),
        Index("idx_wf_inst_definition", "workflow_definition_id"),
    )

    entity_id: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("entities.id"), nullable=False
    )
    workflow_definition_id: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workflow_definitions.id"), nullable=False
    )
    entity_type: Mapped[str] = mapped_column(String(100), nullable=False)
    entity_id_ref: Mapped[str] = mapped_column(String(36), nullable=False)
    current_state: Mapped[str] = mapped_column(String(50), nullable=False)
    metadata_: Mapped[dict | None] = mapped_column("metadata", JSONB)
    version: Mapped[int] = mapped_column(default=1, server_default="1", nullable=False)
    created_by: Mapped[PyUUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id")
    )


class WorkflowTransition(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "workflow_transitions"
    __table_args__ = (
        Index("idx_wf_trans_instance", "instance_id"),
    )

    instance_id: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workflow_instances.id"), nullable=False
    )
    from_state: Mapped[str] = mapped_column(String(50), nullable=False)
    to_state: Mapped[str] = mapped_column(String(50), nullable=False)
    actor_id: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    comment: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


# ─── User Delegations ───────────────────────────────────────────────────────

class UserDelegation(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "user_delegations"

    delegator_id: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    delegate_id: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    entity_id: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("entities.id"), nullable=False
    )
    permissions: Mapped[list[str]] = mapped_column(JSONB, nullable=False)
    start_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    end_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    reason: Mapped[str | None] = mapped_column(Text)


# ─── Personal Access Tokens ─────────────────────────────────────────────────

class PersonalAccessToken(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "personal_access_tokens"

    user_id: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    token_hash: Mapped[str] = mapped_column(String(128), unique=True, nullable=False)
    token_prefix: Mapped[str] = mapped_column(String(8), nullable=False)
    scopes: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    revoked: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default="false", nullable=False
    )

    user: Mapped["User"] = relationship(back_populates="access_tokens")


# ─── User Sessions ──────────────────────────────────────────────────────────

class UserSession(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "user_sessions"

    user_id: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    token_hash: Mapped[str] = mapped_column(String(128), nullable=False)
    ip_address: Mapped[str | None] = mapped_column(String(45), nullable=True)
    user_agent: Mapped[str | None] = mapped_column(Text, nullable=True)
    browser: Mapped[str | None] = mapped_column(String(100), nullable=True)
    os: Mapped[str | None] = mapped_column(String(100), nullable=True)
    device_type: Mapped[str] = mapped_column(String(20), default="desktop", nullable=False)
    last_active_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    revoked: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default="false", nullable=False
    )

    user: Mapped["User"] = relationship(back_populates="sessions")


# ─── User Emails ────────────────────────────────────────────────────────────

class UserEmail(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "user_emails"

    user_id: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    email: Mapped[str] = mapped_column(String(255), nullable=False)
    is_primary: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_notification: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    verified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    verification_token: Mapped[str | None] = mapped_column(String(128), nullable=True)
    verification_sent_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    user: Mapped["User"] = relationship(back_populates="emails")


# ─── OAuth Applications ─────────────────────────────────────────────────────

class OAuthApplication(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "oauth_applications"

    user_id: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    client_id: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    client_secret_hash: Mapped[str | None] = mapped_column(String(128), nullable=True)
    redirect_uris: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    scopes: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    confidential: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    user: Mapped["User"] = relationship(back_populates="oauth_applications")


# ─── OAuth Authorizations ───────────────────────────────────────────────────

class OAuthAuthorization(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "oauth_authorizations"

    user_id: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    application_id: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("oauth_applications.id"), nullable=False
    )
    scopes: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    revoked: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default="false", nullable=False
    )

    application: Mapped["OAuthApplication"] = relationship()


# ─── Addresses (polymorphic — linked to any object) ─────────────────────────

class Address(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Polymorphic address — linked to any entity via owner_type + owner_id.

    owner_type: 'user', 'tier', 'asset', 'entity', etc.
    owner_id:   UUID of the owning object.
    """
    __tablename__ = "addresses"
    __table_args__ = (
        Index("idx_addresses_owner", "owner_type", "owner_id"),
    )

    owner_type: Mapped[str] = mapped_column(String(50), nullable=False)
    owner_id: Mapped[PyUUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    label: Mapped[str] = mapped_column(String(50), nullable=False)
    address_line1: Mapped[str] = mapped_column(String(255), nullable=False)
    address_line2: Mapped[str | None] = mapped_column(String(255), nullable=True)
    city: Mapped[str] = mapped_column(String(100), nullable=False)
    state_province: Mapped[str | None] = mapped_column(String(100), nullable=True)
    postal_code: Mapped[str | None] = mapped_column(String(20), nullable=True)
    country: Mapped[str] = mapped_column(String(100), nullable=False)
    latitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    longitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    is_default: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)


# ─── Phones (polymorphic — linked to any object) ─────────────────────────────

class Phone(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Polymorphic phone number — linked to any entity via owner_type + owner_id.

    owner_type: 'user', 'tier', 'tier_contact', 'asset', 'entity', etc.
    owner_id:   UUID of the owning object.
    label:      e.g. 'mobile', 'office', 'fax', 'home'.
    """
    __tablename__ = "phones"
    __table_args__ = (
        Index("idx_phones_owner", "owner_type", "owner_id"),
    )

    owner_type: Mapped[str] = mapped_column(String(50), nullable=False)
    owner_id: Mapped[PyUUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    label: Mapped[str] = mapped_column(String(50), nullable=False, default="mobile")
    number: Mapped[str] = mapped_column(String(50), nullable=False)
    country_code: Mapped[str | None] = mapped_column(String(10), nullable=True)
    is_default: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    verified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    verification_code: Mapped[str | None] = mapped_column(String(10), nullable=True)
    verification_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


# ─── ContactEmails (polymorphic — linked to any object) ──────────────────────

class ContactEmail(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Polymorphic email address — linked to any entity via owner_type + owner_id.

    Distinct from UserEmail (which is auth-specific). This is for general
    contact emails on tiers, tier contacts, assets, entities, etc.

    owner_type: 'tier', 'tier_contact', 'asset', 'entity', etc.
    owner_id:   UUID of the owning object.
    label:      e.g. 'work', 'personal', 'billing', 'support'.
    """
    __tablename__ = "contact_emails"
    __table_args__ = (
        Index("idx_contact_emails_owner", "owner_type", "owner_id"),
    )

    owner_type: Mapped[str] = mapped_column(String(50), nullable=False)
    owner_id: Mapped[PyUUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    label: Mapped[str] = mapped_column(String(50), nullable=False, default="work")
    email: Mapped[str] = mapped_column(String(255), nullable=False)
    is_default: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    verified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    verification_token: Mapped[str | None] = mapped_column(String(200), nullable=True)
    verification_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


# ─── Tags (polymorphic — linked to any object) ──────────────────────────────

class Tag(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Polymorphic tag/category — linked to any entity via owner_type + owner_id.

    owner_type: 'user', 'tier', 'asset', 'entity', etc.
    owner_id:   UUID of the owning object.
    visibility: 'public' (all users see) or 'private' (creator only).
    parent_id:  Optional self-referencing FK for hierarchical (nested) tags.
    """
    __tablename__ = "tags"
    __table_args__ = (
        Index("idx_tags_owner", "owner_type", "owner_id"),
        Index("idx_tags_created_by", "created_by"),
    )

    owner_type: Mapped[str] = mapped_column(String(50), nullable=False)
    owner_id: Mapped[PyUUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    color: Mapped[str] = mapped_column(String(20), nullable=False, default="#6b7280")
    visibility: Mapped[str] = mapped_column(
        String(10), nullable=False, default="public"
    )  # public | private
    created_by: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    parent_id: Mapped[PyUUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tags.id", ondelete="SET NULL"), nullable=True
    )

    # Relationships
    parent: Mapped["Tag | None"] = relationship(
        "Tag", remote_side="Tag.id", foreign_keys=[parent_id], lazy="selectin"
    )
    children: Mapped[list["Tag"]] = relationship(
        "Tag", back_populates="parent", foreign_keys=[parent_id], lazy="selectin"
    )


# ─── Notes (polymorphic — linked to any object) ─────────────────────────────

class Note(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Polymorphic note/comment — linked to any entity via owner_type + owner_id.

    Historizable: each note is immutable after creation (edit creates new version).
    visibility: 'public' (all users see) or 'private' (creator only).
    """
    __tablename__ = "notes"
    __table_args__ = (
        Index("idx_notes_owner", "owner_type", "owner_id"),
        Index("idx_notes_created_by", "created_by"),
    )

    owner_type: Mapped[str] = mapped_column(String(50), nullable=False)
    owner_id: Mapped[PyUUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    visibility: Mapped[str] = mapped_column(
        String(10), nullable=False, default="public"
    )  # public | private
    pinned: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_by: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )

    author: Mapped["User"] = relationship(foreign_keys=[created_by])


# ─── Attachments (polymorphic — files linked to any object) ──────────────────

class Attachment(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Polymorphic file attachment — linked to any entity via owner_type + owner_id.

    Stores file metadata. Actual files live on disk/object storage.
    """
    __tablename__ = "attachments"
    __table_args__ = (
        Index("idx_attachments_owner", "owner_type", "owner_id"),
        Index("idx_attachments_entity", "entity_id"),
    )

    owner_type: Mapped[str] = mapped_column(String(50), nullable=False)
    owner_id: Mapped[PyUUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    original_name: Mapped[str] = mapped_column(String(255), nullable=False)
    content_type: Mapped[str] = mapped_column(String(100), nullable=False)
    size_bytes: Mapped[int] = mapped_column(nullable=False)
    storage_path: Mapped[str] = mapped_column(String(500), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    uploaded_by: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    entity_id: Mapped[PyUUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("entities.id"), nullable=True
    )

    uploader: Mapped["User"] = relationship(foreign_keys=[uploaded_by])


# ─── Cost Imputations (polymorphic — cost splits for any object) ─────────

class CostImputation(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Polymorphic cost imputation split — linked to any entity via owner_type + owner_id.

    Allows fractional cost allocation across projects and cost centers.
    Sum of percentages per owner must equal 100 (application-level constraint).
    owner_type: 'ads', 'voyage', 'mission', 'purchase_order', etc.
    owner_id:   UUID of the owning object.
    """
    __tablename__ = "cost_imputations"
    __table_args__ = (
        Index("idx_cost_imp_owner", "owner_type", "owner_id"),
        Index("idx_cost_imp_project", "project_id"),
        Index("idx_cost_imp_cost_center", "cost_center_id"),
        CheckConstraint(
            "percentage > 0 AND percentage <= 100",
            name="ck_cost_imp_pct",
        ),
    )

    owner_type: Mapped[str] = mapped_column(String(50), nullable=False)
    owner_id: Mapped[PyUUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    project_id: Mapped[PyUUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id"), nullable=True
    )
    wbs_id: Mapped[PyUUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    cost_center_id: Mapped[PyUUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("cost_centers.id"), nullable=True
    )
    percentage: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False)
    cross_imputation: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default="false", nullable=False
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )

    # Relationships
    project: Mapped["Project | None"] = relationship(foreign_keys=[project_id])
    cost_center: Mapped["CostCenter | None"] = relationship(foreign_keys=[cost_center_id])
    author: Mapped["User"] = relationship(foreign_keys=[created_by])


# ─── Social Networks (polymorphic — links for any object) ──────────────────

class SocialNetwork(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Polymorphic social network link — linked to any entity via owner_type + owner_id."""
    __tablename__ = "social_networks"
    __table_args__ = (
        Index("idx_social_networks_owner", "owner_type", "owner_id"),
    )

    owner_type: Mapped[str] = mapped_column(String(50), nullable=False)
    owner_id: Mapped[PyUUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    network: Mapped[str] = mapped_column(String(50), nullable=False)  # linkedin, twitter, facebook, instagram, youtube, website, other
    url: Mapped[str] = mapped_column(String(500), nullable=False)
    label: Mapped[str | None] = mapped_column(String(100), nullable=True)
    sort_order: Mapped[int] = mapped_column(default=0, server_default="0")


# ─── Opening Hours (polymorphic — schedule for any object) ──────────────────

class OpeningHour(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Polymorphic opening hours — linked to any entity via owner_type + owner_id."""
    __tablename__ = "opening_hours"
    __table_args__ = (
        Index("idx_opening_hours_owner", "owner_type", "owner_id"),
    )

    owner_type: Mapped[str] = mapped_column(String(50), nullable=False)
    owner_id: Mapped[PyUUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    day_of_week: Mapped[int] = mapped_column(nullable=False)  # 0=Monday, 6=Sunday
    open_time: Mapped[str | None] = mapped_column(String(5), nullable=True)  # "08:00"
    close_time: Mapped[str | None] = mapped_column(String(5), nullable=True)  # "17:00"
    is_closed: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    label: Mapped[str | None] = mapped_column(String(100), nullable=True)  # "Matin" for split hours


# ─── Email Templates ───────────────────────────────────────────────────────

class EmailTemplate(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Email template definition — one per slug per entity.

    Templates are entity-scoped and identified by a slug (e.g. 'user_invitation').
    Each template can have multiple versions in multiple languages.
    """
    __tablename__ = "email_templates"
    __table_args__ = (
        Index("uq_email_template_entity_slug", "entity_id", "slug", unique=True),
    )

    entity_id: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("entities.id"), nullable=False
    )
    slug: Mapped[str] = mapped_column(String(100), nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    object_type: Mapped[str] = mapped_column(
        String(50), nullable=False, default="system"
    )  # user, tier, asset, system, etc.
    enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    variables_schema: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    versions: Mapped[list["EmailTemplateVersion"]] = relationship(
        back_populates="template", cascade="all, delete-orphan"
    )
    links: Mapped[list["EmailTemplateLink"]] = relationship(
        back_populates="template", cascade="all, delete-orphan"
    )


class EmailTemplateVersion(UUIDPrimaryKeyMixin, Base):
    """A specific version of a template in a given language.

    Only one version per language can be active at any time (per template).
    Supports scheduling: valid_from/valid_until restrict when a version is usable.
    """
    __tablename__ = "email_template_versions"
    __table_args__ = (
        Index("idx_etv_template_lang", "template_id", "language"),
    )

    template_id: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("email_templates.id", ondelete="CASCADE"), nullable=False
    )
    version: Mapped[int] = mapped_column(nullable=False, default=1)
    language: Mapped[str] = mapped_column(String(5), nullable=False, default="fr")
    subject: Mapped[str] = mapped_column(String(500), nullable=False)
    body_html: Mapped[str] = mapped_column(Text, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    valid_from: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    valid_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_by: Mapped[PyUUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    template: Mapped["EmailTemplate"] = relationship(back_populates="versions")


class EmailTemplateLink(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Link a template to a specific tier, entity, or other object.

    When links exist, the template is only used for matching linked objects.
    When no links exist, the template is used globally for the entity.
    """
    __tablename__ = "email_template_links"
    __table_args__ = (
        Index("idx_etl_template", "template_id"),
        Index("idx_etl_target", "link_type", "link_id"),
    )

    template_id: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("email_templates.id", ondelete="CASCADE"), nullable=False
    )
    link_type: Mapped[str] = mapped_column(
        String(50), nullable=False
    )  # tier, entity, department, etc.
    link_id: Mapped[PyUUID] = mapped_column(UUID(as_uuid=True), nullable=False)

    template: Mapped["EmailTemplate"] = relationship(back_populates="links")


# ─── Notification Preferences ───────────────────────────────────────────────

class NotificationPreference(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "notification_preferences"

    user_id: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, unique=True
    )
    global_level: Mapped[str] = mapped_column(
        String(20), default="participate", nullable=False
    )
    notification_email_id: Mapped[PyUUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("user_emails.id"), nullable=True
    )
    notify_own_actions: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    group_overrides: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


# ─── Compliance / Conformite ────────────────────────────────────────────────


class ComplianceType(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Referentiel: type de formation, certification, habilitation, audit, medical."""
    __tablename__ = "compliance_types"
    __table_args__ = (
        Index("idx_compliance_types_entity", "entity_id"),
        Index("idx_compliance_types_category", "category"),
    )

    entity_id: Mapped[PyUUID] = mapped_column(UUID(as_uuid=True), ForeignKey("entities.id"), nullable=False)
    category: Mapped[str] = mapped_column(String(30), nullable=False)  # formation, certification, habilitation, audit, medical, epi
    code: Mapped[str] = mapped_column(String(50), nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    validity_days: Mapped[int | None] = mapped_column(Integer)  # null = permanent
    is_mandatory: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    # External compliance source configuration
    compliance_source: Mapped[str] = mapped_column(
        String(20), default="opsflux", nullable=False
    )  # opsflux | external | both
    external_provider: Mapped[str | None] = mapped_column(String(50))  # riseup | intranet_medical | ...
    external_mapping: Mapped[dict | None] = mapped_column(JSONB)  # {"certificate_id": "42", ...}

    rules: Mapped[list["ComplianceRule"]] = relationship(back_populates="compliance_type", cascade="all, delete-orphan")


class ComplianceRule(UUIDPrimaryKeyMixin, TimestampMixin, SoftDeleteMixin, Base):
    """Regle d'obligation: a qui s'applique un ComplianceType.

    V2: versioning, effective dates, per-rule constraints, audit trail.
    Uses SoftDeleteMixin for configurable delete policy (archive vs hard delete).
    """
    __delete_policy__ = {"category": "main", "default_mode": "soft"}
    __tablename__ = "compliance_rules"
    __table_args__ = (Index("idx_compliance_rules_type", "compliance_type_id"),)

    entity_id: Mapped[PyUUID] = mapped_column(UUID(as_uuid=True), ForeignKey("entities.id"), nullable=False)
    compliance_type_id: Mapped[PyUUID] = mapped_column(UUID(as_uuid=True), ForeignKey("compliance_types.id"), nullable=False)
    target_type: Mapped[str] = mapped_column(String(30), nullable=False)  # tier_type, asset, department, job_position, all
    target_value: Mapped[str | None] = mapped_column(String(200))  # e.g. 'client', asset_id, 'Operations'
    description: Mapped[str | None] = mapped_column(Text)
    active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    # ── V2: Versioning & audit ──
    version: Mapped[int] = mapped_column(Integer, default=1, server_default="1", nullable=False)
    effective_from: Mapped[date | None] = mapped_column(Date)
    effective_to: Mapped[date | None] = mapped_column(Date)
    superseded_by: Mapped[PyUUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("compliance_rules.id", ondelete="SET NULL"))
    change_reason: Mapped[str | None] = mapped_column(String(500))
    changed_by: Mapped[PyUUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))

    # ── V2: Per-rule constraint overrides ──
    override_validity_days: Mapped[int | None] = mapped_column(Integer)
    grace_period_days: Mapped[int | None] = mapped_column(Integer)
    renewal_reminder_days: Mapped[int | None] = mapped_column(Integer)
    attachment_required: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true", nullable=False)
    priority: Mapped[str] = mapped_column(String(20), default="normal", server_default="normal", nullable=False)
    applicability: Mapped[str] = mapped_column(String(20), default="permanent", server_default="permanent", nullable=False)  # permanent | contextual
    condition_json: Mapped[dict | None] = mapped_column(JSONB)  # structured conditions

    compliance_type: Mapped["ComplianceType"] = relationship(back_populates="rules")
    history: Mapped[list["ComplianceRuleHistory"]] = relationship(back_populates="rule", cascade="all, delete-orphan")


class ComplianceRuleHistory(UUIDPrimaryKeyMixin, Base):
    """Audit log for compliance rule changes."""
    __tablename__ = "compliance_rule_history"
    __table_args__ = (
        Index("idx_rule_history_rule_id", "rule_id"),
        Index("idx_rule_history_changed_at", "changed_at"),
    )

    rule_id: Mapped[PyUUID] = mapped_column(UUID(as_uuid=True), ForeignKey("compliance_rules.id", ondelete="CASCADE"), nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    action: Mapped[str] = mapped_column(String(20), nullable=False)  # created, updated, archived, restored
    snapshot: Mapped[dict] = mapped_column(JSONB, nullable=False)  # full state at this point
    change_reason: Mapped[str | None] = mapped_column(String(500))
    changed_by: Mapped[PyUUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    changed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    rule: Mapped["ComplianceRule"] = relationship(back_populates="history")


class ComplianceRecord(UUIDPrimaryKeyMixin, TimestampMixin, VerifiableMixin, Base):
    """Instance: enregistrement de conformite lie a un employe, tiers, asset, ou user."""
    __tablename__ = "compliance_records"
    __table_args__ = (
        Index("idx_compliance_records_owner", "owner_type", "owner_id"),
        Index("idx_compliance_records_type", "compliance_type_id"),
        Index("idx_compliance_records_status", "status"),
    )

    entity_id: Mapped[PyUUID] = mapped_column(UUID(as_uuid=True), ForeignKey("entities.id"), nullable=False)
    compliance_type_id: Mapped[PyUUID] = mapped_column(UUID(as_uuid=True), ForeignKey("compliance_types.id"), nullable=False)
    owner_type: Mapped[str] = mapped_column(String(50), nullable=False)  # tier_contact, tier, asset, user
    owner_id: Mapped[PyUUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="valid")  # valid, expired, pending, rejected
    issued_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    issuer: Mapped[str | None] = mapped_column(String(200))  # organisme certificateur
    reference_number: Mapped[str | None] = mapped_column(String(100))
    notes: Mapped[str | None] = mapped_column(Text)
    created_by: Mapped[PyUUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    compliance_type: Mapped["ComplianceType"] = relationship()
    creator: Mapped["User"] = relationship(foreign_keys=[created_by])


class ComplianceExemption(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Temporary exemption from a compliance requirement (e.g. expired cert waiver)."""
    __tablename__ = "compliance_exemptions"
    __table_args__ = (
        Index("idx_compliance_exemptions_entity", "entity_id"),
        Index("idx_compliance_exemptions_record", "compliance_record_id"),
        Index("idx_compliance_exemptions_status", "status"),
    )

    entity_id: Mapped[PyUUID] = mapped_column(UUID(as_uuid=True), ForeignKey("entities.id"), nullable=False)
    compliance_record_id: Mapped[PyUUID] = mapped_column(UUID(as_uuid=True), ForeignKey("compliance_records.id"), nullable=False)
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    approved_by: Mapped[PyUUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"))
    status: Mapped[str] = mapped_column(String(20), default="pending", nullable=False)  # pending, approved, rejected, expired
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date] = mapped_column(Date, nullable=False)
    conditions: Mapped[str | None] = mapped_column(Text)
    rejection_reason: Mapped[str | None] = mapped_column(Text)
    created_by: Mapped[PyUUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    compliance_record: Mapped["ComplianceRecord"] = relationship()
    approver: Mapped["User | None"] = relationship(foreign_keys=[approved_by])
    creator: Mapped["User"] = relationship(foreign_keys=[created_by])


# ─── Job Positions / Fiches de Poste ─────────────────────────────────────────


class JobPosition(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Referentiel des fiches de poste — chaque poste definit des exigences HSE."""
    __tablename__ = "job_positions"
    __table_args__ = (
        Index("idx_job_positions_entity", "entity_id"),
        Index("idx_job_positions_code", "code"),
    )

    entity_id: Mapped[PyUUID] = mapped_column(UUID(as_uuid=True), ForeignKey("entities.id"), nullable=False)
    code: Mapped[str] = mapped_column(String(50), nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    department: Mapped[str | None] = mapped_column(String(100))
    active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


# ─── Employee Transfer Log ───────────────────────────────────────────────────


class TierContactTransfer(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Log de transfert d'un employe d'un tier a un autre."""
    __tablename__ = "tier_contact_transfers"
    __table_args__ = (
        Index("idx_tc_transfers_contact", "contact_id"),
        Index("idx_tc_transfers_from", "from_tier_id"),
        Index("idx_tc_transfers_to", "to_tier_id"),
    )

    contact_id: Mapped[PyUUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tier_contacts.id"), nullable=False)
    from_tier_id: Mapped[PyUUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tiers.id"), nullable=False)
    to_tier_id: Mapped[PyUUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tiers.id"), nullable=False)
    transfer_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    reason: Mapped[str | None] = mapped_column(Text)
    transferred_by: Mapped[PyUUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)

    contact: Mapped["TierContact"] = relationship(foreign_keys=[contact_id])
    from_tier: Mapped["Tier"] = relationship(foreign_keys=[from_tier_id])
    to_tier: Mapped["Tier"] = relationship(foreign_keys=[to_tier_id])
    actor: Mapped["User"] = relationship(foreign_keys=[transferred_by])


# ─── Projects / Projets ─────────────────────────────────────────────────────


class Project(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Projet — inspire de Gouti."""
    __tablename__ = "projects"
    __table_args__ = (
        Index("idx_projects_entity", "entity_id"),
        Index("idx_projects_status", "status"),
        Index("idx_projects_manager", "manager_id"),
    )

    entity_id: Mapped[PyUUID] = mapped_column(UUID(as_uuid=True), ForeignKey("entities.id"), nullable=False)
    code: Mapped[str] = mapped_column(String(50), nullable=False)
    name: Mapped[str] = mapped_column(String(300), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="draft")  # draft, planned, active, on_hold, completed, cancelled
    priority: Mapped[str] = mapped_column(String(10), nullable=False, default="medium")  # low, medium, high, critical
    weather: Mapped[str] = mapped_column(String(10), nullable=False, default="sunny")  # sunny, cloudy, rainy, stormy
    progress: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    start_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    end_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    actual_end_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    budget: Mapped[float | None] = mapped_column(Float)
    manager_id: Mapped[PyUUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"))
    parent_id: Mapped[PyUUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("projects.id", ondelete="SET NULL"))
    tier_id: Mapped[PyUUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("tiers.id"))
    asset_id: Mapped[PyUUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("ar_installations.id"))
    external_ref: Mapped[str | None] = mapped_column(String(200), index=True)  # e.g. "gouti:<id>" for synced projects
    active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    archived: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    manager: Mapped["User | None"] = relationship(foreign_keys=[manager_id])
    parent: Mapped["Project | None"] = relationship(remote_side="Project.id", foreign_keys=[parent_id])
    tier: Mapped["Tier | None"] = relationship(foreign_keys=[tier_id])
    members: Mapped[list["ProjectMember"]] = relationship(back_populates="project", cascade="all, delete-orphan")
    tasks: Mapped[list["ProjectTask"]] = relationship(back_populates="project", cascade="all, delete-orphan")
    milestones: Mapped[list["ProjectMilestone"]] = relationship(back_populates="project", cascade="all, delete-orphan")


class ProjectMember(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Membre d'une equipe projet."""
    __tablename__ = "project_members"
    __table_args__ = (Index("idx_project_members_project", "project_id"),)

    project_id: Mapped[PyUUID] = mapped_column(UUID(as_uuid=True), ForeignKey("projects.id"), nullable=False)
    user_id: Mapped[PyUUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"))
    contact_id: Mapped[PyUUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("tier_contacts.id"))
    role: Mapped[str] = mapped_column(String(20), nullable=False, default="member")  # manager, member, reviewer, stakeholder
    active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    project: Mapped["Project"] = relationship(back_populates="members")
    user: Mapped["User | None"] = relationship(foreign_keys=[user_id])
    contact: Mapped["TierContact | None"] = relationship(foreign_keys=[contact_id])


class ProjectTask(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Tache de projet — supporte les sous-taches."""
    __tablename__ = "project_tasks"
    __table_args__ = (
        Index("idx_project_tasks_project", "project_id"),
        Index("idx_project_tasks_assignee", "assignee_id"),
        Index("idx_project_tasks_status", "status"),
    )

    project_id: Mapped[PyUUID] = mapped_column(UUID(as_uuid=True), ForeignKey("projects.id"), nullable=False)
    parent_id: Mapped[PyUUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("project_tasks.id", ondelete="SET NULL"))
    code: Mapped[str | None] = mapped_column(String(50))
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="todo")  # todo, in_progress, review, done, cancelled
    priority: Mapped[str] = mapped_column(String(10), nullable=False, default="medium")
    assignee_id: Mapped[PyUUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"))
    progress: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    start_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    due_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    estimated_hours: Mapped[float | None] = mapped_column(Float)
    actual_hours: Mapped[float | None] = mapped_column(Float)
    order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    project: Mapped["Project"] = relationship(back_populates="tasks")
    parent: Mapped["ProjectTask | None"] = relationship(remote_side="ProjectTask.id", foreign_keys=[parent_id])
    assignee: Mapped["User | None"] = relationship(foreign_keys=[assignee_id])


class ProjectMilestone(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Jalon de projet."""
    __tablename__ = "project_milestones"
    __table_args__ = (Index("idx_project_milestones_project", "project_id"),)

    project_id: Mapped[PyUUID] = mapped_column(UUID(as_uuid=True), ForeignKey("projects.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    due_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending")  # pending, completed, overdue
    active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    project: Mapped["Project"] = relationship(back_populates="milestones")


# ─── Planning Revisions ─────────────────────────────────────────────────────
class PlanningRevision(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Snapshot of a project planning — supports simulation vs committed revisions."""
    __tablename__ = "planning_revisions"
    __table_args__ = (
        Index("idx_planning_revisions_project", "project_id"),
    )

    project_id: Mapped[PyUUID] = mapped_column(UUID(as_uuid=True), ForeignKey("projects.id"), nullable=False)
    revision_number: Mapped[int] = mapped_column(Integer, nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_simulation: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    snapshot_data: Mapped[dict | None] = mapped_column(JSONB)  # Full JSON snapshot of tasks/milestones/dates
    created_by: Mapped[PyUUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    project: Mapped["Project"] = relationship(foreign_keys=[project_id])
    creator: Mapped["User"] = relationship(foreign_keys=[created_by])


# ─── Task Deliverables (Livrables) ──────────────────────────────────────────
class TaskDeliverable(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Livrable associé à une tâche de projet."""
    __tablename__ = "task_deliverables"
    __table_args__ = (
        Index("idx_task_deliverables_task", "task_id"),
    )

    task_id: Mapped[PyUUID] = mapped_column(UUID(as_uuid=True), ForeignKey("project_tasks.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(300), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending")  # pending, in_progress, delivered, accepted, rejected
    due_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    delivered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    accepted_by: Mapped[PyUUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"))
    active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    task: Mapped["ProjectTask"] = relationship(foreign_keys=[task_id])
    acceptor: Mapped["User | None"] = relationship(foreign_keys=[accepted_by])


# ─── Task Actions / Checklists ──────────────────────────────────────────────
class TaskAction(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Action (checklist item) within a project task."""
    __tablename__ = "task_actions"
    __table_args__ = (
        Index("idx_task_actions_task", "task_id"),
    )

    task_id: Mapped[PyUUID] = mapped_column(UUID(as_uuid=True), ForeignKey("project_tasks.id"), nullable=False)
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    completed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    completed_by: Mapped[PyUUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"))
    order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    task: Mapped["ProjectTask"] = relationship(foreign_keys=[task_id])
    completer: Mapped["User | None"] = relationship(foreign_keys=[completed_by])


# ─── Task Change Log (historisation) ────────────────────────────────────────
class TaskChangeLog(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Tracks changes to a project task (dates, scope, status) for audit/history."""
    __tablename__ = "task_change_logs"
    __table_args__ = (
        Index("idx_task_change_logs_task", "task_id"),
    )

    task_id: Mapped[PyUUID] = mapped_column(UUID(as_uuid=True), ForeignKey("project_tasks.id"), nullable=False)
    change_type: Mapped[str] = mapped_column(String(50), nullable=False)  # date_change, scope_change, status_change, assignment_change, priority_change
    field_name: Mapped[str] = mapped_column(String(50), nullable=False)
    old_value: Mapped[str | None] = mapped_column(Text)
    new_value: Mapped[str | None] = mapped_column(Text)
    reason: Mapped[str | None] = mapped_column(Text)
    changed_by: Mapped[PyUUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)

    task: Mapped["ProjectTask"] = relationship(foreign_keys=[task_id])
    author: Mapped["User"] = relationship(foreign_keys=[changed_by])


# ─── Task Dependencies ───────────────────────────────────────────────────────
class ProjectTaskDependency(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "project_task_dependencies"
    __table_args__ = (
        Index("idx_task_dep_from", "from_task_id"),
        Index("idx_task_dep_to", "to_task_id"),
    )

    from_task_id: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("project_tasks.id", ondelete="CASCADE"), nullable=False
    )
    to_task_id: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("project_tasks.id", ondelete="CASCADE"), nullable=False
    )
    dependency_type: Mapped[str] = mapped_column(
        String(30), nullable=False, default="finish_to_start"
    )  # finish_to_start | start_to_start | finish_to_finish | start_to_finish
    lag_days: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


# ─── PDF Templates ──────────────────────────────────────────────────────────

class PdfTemplate(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """PDF template definition -- one per slug per entity (or global if entity_id is NULL).

    Templates are identified by a slug (e.g. 'ads.ticket').
    Each template can have multiple versions in multiple languages.
    """
    __tablename__ = "pdf_templates"
    __table_args__ = (
        Index("uq_pdf_template_entity_slug", "entity_id", "slug", unique=True),
    )

    entity_id: Mapped[PyUUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("entities.id"), nullable=True
    )
    slug: Mapped[str] = mapped_column(String(100), nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    object_type: Mapped[str] = mapped_column(
        String(50), nullable=False, default="system"
    )  # ads, document, voyage, system, etc.
    enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    variables_schema: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    # Page layout settings
    page_size: Mapped[str] = mapped_column(String(10), nullable=False, default="A4")  # A4, A5, A6, Letter
    orientation: Mapped[str] = mapped_column(String(10), nullable=False, default="portrait")  # portrait, landscape
    margin_top: Mapped[int] = mapped_column(Integer, nullable=False, default=15)  # mm
    margin_right: Mapped[int] = mapped_column(Integer, nullable=False, default=12)  # mm
    margin_bottom: Mapped[int] = mapped_column(Integer, nullable=False, default=15)  # mm
    margin_left: Mapped[int] = mapped_column(Integer, nullable=False, default=12)  # mm

    versions: Mapped[list["PdfTemplateVersion"]] = relationship(
        back_populates="template", cascade="all, delete-orphan"
    )


class PdfTemplateVersion(UUIDPrimaryKeyMixin, Base):
    """A specific version of a PDF template in a given language.

    Only one published version per language can be active at any time (per template).
    """
    __tablename__ = "pdf_template_versions"
    __table_args__ = (
        Index("idx_ptv_template_lang", "template_id", "language"),
    )

    template_id: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("pdf_templates.id", ondelete="CASCADE"), nullable=False
    )
    version_number: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    language: Mapped[str] = mapped_column(String(5), nullable=False, default="fr")
    body_html: Mapped[str] = mapped_column(Text, nullable=False)
    header_html: Mapped[str | None] = mapped_column(Text, nullable=True)
    footer_html: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_published: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_by: Mapped[PyUUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    template: Mapped["PdfTemplate"] = relationship(back_populates="versions")


# ─── External References (polymorphic) ───────────────────────────────────────


class ExternalReference(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Polymorphic external references — multiple external IDs per object.

    Any OpsFlux object can have multiple external references (SAP code,
    legacy system ID, partner reference, customs number, etc.).
    Uses the same (owner_type, owner_id) polymorphic pattern as Address, Tag, etc.
    """
    __tablename__ = "external_references"
    __table_args__ = (
        Index("idx_ext_ref_owner", "owner_type", "owner_id"),
        Index("idx_ext_ref_system_code", "system", "code"),
    )

    owner_type: Mapped[str] = mapped_column(
        String(50), nullable=False
    )  # e.g. "asset", "tier", "project", "ads", "voyage", "cargo_item", "pax_profile", "document", "pid_document"
    owner_id: Mapped[PyUUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    system: Mapped[str] = mapped_column(
        String(50), nullable=False
    )  # e.g. "sap", "legacy", "customs", "partner", "gouti", "intranet"
    code: Mapped[str] = mapped_column(String(200), nullable=False)  # the external reference value
    label: Mapped[str | None] = mapped_column(
        String(200), nullable=True
    )  # human-readable label (e.g. "SAP Material Number")
    url: Mapped[str | None] = mapped_column(
        String(500), nullable=True
    )  # optional link to external system
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by: Mapped[PyUUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


# ─── Import Mappings ─────────────────────────────────────────────────────────


class ImportMapping(UUIDPrimaryKeyMixin, TimestampMixin, SoftDeleteMixin, Base):
    """Saved column mappings for the Excel/CSV import assistant.

    Users map file columns to target object fields (asset, tier, pax_profile, etc.)
    and save the mapping for reuse on future imports.
    """
    __tablename__ = "import_mappings"
    __table_args__ = (
        Index("idx_import_mapping_entity", "entity_id"),
        Index("idx_import_mapping_target", "entity_id", "target_object"),
    )

    entity_id: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("entities.id"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    target_object: Mapped[str] = mapped_column(String(50), nullable=False)
    column_mapping: Mapped[dict] = mapped_column(JSONB, nullable=False)
    transforms: Mapped[dict | None] = mapped_column(JSONB)  # {target_field: {type, params}}
    file_headers: Mapped[list | None] = mapped_column(JSONB)  # original file headers for auto-match
    file_settings: Mapped[dict | None] = mapped_column(JSONB)
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    use_count: Mapped[int] = mapped_column(Integer, default=0, server_default="0", nullable=False)
    created_by: Mapped[PyUUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id")
    )


# ─── User Sub-Models (direct FK — exclusively user-owned) ────────────────────

class UserPassport(UUIDPrimaryKeyMixin, TimestampMixin, VerifiableMixin, Base):
    """User passport document."""
    __tablename__ = "user_passports"
    __table_args__ = (
        Index("idx_user_passports_user", "user_id"),
    )

    user_id: Mapped[PyUUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    passport_type: Mapped[str | None] = mapped_column(String(50), nullable=True)  # ordinary, diplomatic, service, etc.
    number: Mapped[str] = mapped_column(String(50), nullable=False)
    country: Mapped[str] = mapped_column(String(100), nullable=False)
    passport_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    issue_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    expiry_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    document_url: Mapped[str | None] = mapped_column(String(500), nullable=True)

    user: Mapped["User"] = relationship(foreign_keys=[user_id])


class UserVisa(UUIDPrimaryKeyMixin, TimestampMixin, VerifiableMixin, Base):
    """User visa document."""
    __tablename__ = "user_visas"
    __table_args__ = (
        Index("idx_user_visas_user", "user_id"),
    )

    user_id: Mapped[PyUUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    visa_type: Mapped[str] = mapped_column(String(100), nullable=False)
    number: Mapped[str | None] = mapped_column(String(100), nullable=True)
    country: Mapped[str] = mapped_column(String(100), nullable=False)
    issue_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    expiry_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    document_url: Mapped[str | None] = mapped_column(String(500), nullable=True)

    user: Mapped["User"] = relationship(foreign_keys=[user_id])


class EmergencyContact(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """User emergency contact."""
    __tablename__ = "emergency_contacts"
    __table_args__ = (
        Index("idx_emergency_contacts_user", "user_id"),
    )

    user_id: Mapped[PyUUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    relationship_type: Mapped[str] = mapped_column(String(50), nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    phone_number: Mapped[str | None] = mapped_column(String(50), nullable=True)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)

    user: Mapped["User"] = relationship(foreign_keys=[user_id])


class SocialSecurity(UUIDPrimaryKeyMixin, TimestampMixin, VerifiableMixin, Base):
    """User social security number per country."""
    __tablename__ = "social_securities"
    __table_args__ = (
        Index("idx_social_securities_user", "user_id"),
        Index("idx_social_securities_unique", "user_id", "country", unique=True),
    )

    user_id: Mapped[PyUUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    country: Mapped[str] = mapped_column(String(100), nullable=False)
    number: Mapped[str] = mapped_column(String(100), nullable=False)

    user: Mapped["User"] = relationship(foreign_keys=[user_id])


class UserVaccine(UUIDPrimaryKeyMixin, TimestampMixin, VerifiableMixin, Base):
    """User vaccination record."""
    __tablename__ = "user_vaccines"
    __table_args__ = (
        Index("idx_user_vaccines_user", "user_id"),
    )

    user_id: Mapped[PyUUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    vaccine_type: Mapped[str] = mapped_column(String(100), nullable=False)
    date_administered: Mapped[date | None] = mapped_column(Date, nullable=True)
    expiry_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    batch_number: Mapped[str | None] = mapped_column(String(100), nullable=True)

    user: Mapped["User"] = relationship(foreign_keys=[user_id])


class MedicalCheck(UUIDPrimaryKeyMixin, TimestampMixin, VerifiableMixin, Base):
    """Polymorphic medical check record — applicable to users, tiers, assets, etc."""
    __tablename__ = "medical_checks"
    __table_args__ = (
        Index("idx_medical_checks_owner", "owner_type", "owner_id"),
    )

    owner_type: Mapped[str] = mapped_column(String(50), nullable=False)  # e.g. "user", "tier"
    owner_id: Mapped[PyUUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    check_type: Mapped[str] = mapped_column(String(50), nullable=False)  # general, international, subsidiary
    check_date: Mapped[date] = mapped_column(Date, nullable=False)
    expiry_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    provider: Mapped[str | None] = mapped_column(String(200), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    document_url: Mapped[str | None] = mapped_column(String(500), nullable=True)


class UserLanguage(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """User language proficiency."""
    __tablename__ = "user_languages"
    __table_args__ = (
        Index("idx_user_languages_user", "user_id"),
        Index("idx_user_languages_unique", "user_id", "language_code", unique=True),
    )

    user_id: Mapped[PyUUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    language_code: Mapped[str] = mapped_column(String(10), nullable=False)
    proficiency_level: Mapped[str | None] = mapped_column(String(50), nullable=True)

    user: Mapped["User"] = relationship(foreign_keys=[user_id])


class DrivingLicense(UUIDPrimaryKeyMixin, TimestampMixin, VerifiableMixin, Base):
    """User driving license."""
    __tablename__ = "driving_licenses"
    __table_args__ = (
        Index("idx_driving_licenses_user", "user_id"),
    )

    user_id: Mapped[PyUUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    license_type: Mapped[str] = mapped_column(String(50), nullable=False)
    country: Mapped[str] = mapped_column(String(100), nullable=False)
    expiry_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    document_url: Mapped[str | None] = mapped_column(String(500), nullable=True)

    user: Mapped["User"] = relationship(foreign_keys=[user_id])


# ─── UserSSOProvider ─────────────────────────────────────────────────────────

class UserSSOProvider(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Links a user account to an external SSO identity provider."""
    __tablename__ = "user_sso_providers"
    __table_args__ = (
        Index("idx_user_sso_providers_user", "user_id"),
        Index("idx_user_sso_providers_unique", "user_id", "provider", unique=True),
    )

    user_id: Mapped[PyUUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    provider: Mapped[str] = mapped_column(String(50), nullable=False)  # azure, google, microsoft
    sso_subject: Mapped[str] = mapped_column(String(255), nullable=False)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    display_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    linked_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    user: Mapped["User"] = relationship(foreign_keys=[user_id])


# ─── Dictionary (configurable dropdown lists) ────────────────────────────────

class DictionaryEntry(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Configurable dropdown list entry — used for visa types, vaccine types, etc."""
    __tablename__ = "dictionary_entries"
    __table_args__ = (
        Index("idx_dictionary_category", "category"),
        Index("idx_dictionary_unique", "category", "code", unique=True),
    )

    category: Mapped[str] = mapped_column(String(50), nullable=False)
    code: Mapped[str] = mapped_column(String(100), nullable=False)
    label: Mapped[str] = mapped_column(String(200), nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    metadata_json: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    translations: Mapped[dict | None] = mapped_column(JSONB, nullable=True)


# ─── User Health Conditions ───────────────────────────────────────────────────

class UserHealthCondition(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Health condition flags for a user — references dictionary category 'health_condition'."""
    __tablename__ = "user_health_conditions"
    __table_args__ = (
        Index("ix_user_health_conditions_user_id", "user_id"),
        Index("ix_user_health_conditions_unique", "user_id", "condition_code", unique=True),
    )

    user_id: Mapped[PyUUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    condition_code: Mapped[str] = mapped_column(String(100), nullable=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)


# ═══════════════════════════════════════════════════════════════════════════════
# Scheduler — Job execution log
# ═══════════════════════════════════════════════════════════════════════════════

class JobExecution(UUIDPrimaryKeyMixin, Base):
    """Log of each scheduled job execution — success, failure, duration, error."""
    __tablename__ = "job_executions"
    __table_args__ = (
        Index("idx_job_executions_job_id", "job_id"),
        Index("idx_job_executions_started_at", "started_at"),
    )

    job_id: Mapped[str] = mapped_column(String(100), nullable=False)
    job_name: Mapped[str] = mapped_column(String(200), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False)  # running | success | error
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    duration_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    error_traceback: Mapped[str | None] = mapped_column(Text, nullable=True)
    triggered_by: Mapped[str] = mapped_column(String(20), default="scheduler", server_default="scheduler", nullable=False)  # scheduler | manual
