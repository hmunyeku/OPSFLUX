"""Messaging ORM models — announcements, login events, user activity journal."""

from datetime import datetime
from uuid import UUID as PyUUID

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, SoftDeleteMixin, TimestampMixin, UUIDPrimaryKeyMixin

# ─── System Announcements ────────────────────────────────────────────────────


class Announcement(UUIDPrimaryKeyMixin, TimestampMixin, SoftDeleteMixin, Base):
    """System announcements / broadcast messages from admin to users."""

    __tablename__ = "announcements"
    __table_args__ = (
        Index("idx_announcements_entity", "entity_id"),
        Index("idx_announcements_active", "active", "published_at", "expires_at"),
        Index("idx_announcements_location", "display_location"),
        CheckConstraint(
            "priority IN ('info','warning','critical','maintenance')",
            name="ck_announcement_priority",
        ),
        CheckConstraint(
            "target_type IN ('all','entity','role','module','user')",
            name="ck_announcement_target_type",
        ),
        CheckConstraint(
            "display_location IN ('dashboard','login','banner','modal','logout','all')",
            name="ck_announcement_display_location",
        ),
    )

    entity_id: Mapped[PyUUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("entities.id"), nullable=True)
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    body_html: Mapped[str | None] = mapped_column(Text, nullable=True)
    priority: Mapped[str] = mapped_column(String(20), nullable=False, default="info")

    # Targeting
    target_type: Mapped[str] = mapped_column(
        String(20), nullable=False, default="all"
    )  # all, entity, role, module, user
    target_value: Mapped[str | None] = mapped_column(
        String(200), nullable=True
    )  # role code, module slug, user id, etc.

    # Display
    display_location: Mapped[str] = mapped_column(
        String(20), nullable=False, default="dashboard"
    )  # dashboard, login, banner, modal, logout, all

    # Scheduling
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Delivery options
    send_email: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    email_sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Metadata
    sender_id: Mapped[PyUUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    pinned: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    # Read tracking metadata (JSONB: list of user_ids who dismissed it)
    dismissed_by: Mapped[dict | None] = mapped_column(JSONB, nullable=True)


# ─── Announcement Read Receipts (per-user tracking) ─────────────────────────


class AnnouncementReceipt(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Track which users have seen/dismissed an announcement."""

    __tablename__ = "announcement_receipts"
    __table_args__ = (
        Index("idx_receipts_announcement", "announcement_id"),
        Index("idx_receipts_user", "user_id"),
        Index(
            "uq_announcement_receipt",
            "announcement_id",
            "user_id",
            unique=True,
        ),
    )

    announcement_id: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("announcements.id", ondelete="CASCADE"),
        nullable=False,
    )
    user_id: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id"),
        nullable=False,
    )
    read_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    dismissed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)


# ─── Login Events Journal (security audit) ──────────────────────────────────


class LoginEvent(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Track every login attempt for security analysis."""

    __tablename__ = "login_events"
    __table_args__ = (
        Index("idx_login_events_user", "user_id"),
        Index("idx_login_events_ip", "ip_address"),
        Index("idx_login_events_created", "created_at"),
        Index("idx_login_events_success", "success"),
        Index("idx_login_events_email", "email"),
    )

    user_id: Mapped[PyUUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )  # Null for attempts with unknown email
    email: Mapped[str] = mapped_column(String(255), nullable=False)
    ip_address: Mapped[str] = mapped_column(String(45), nullable=False)
    user_agent: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Parsed UA
    browser: Mapped[str | None] = mapped_column(String(100), nullable=True)
    os: Mapped[str | None] = mapped_column(String(100), nullable=True)
    device_type: Mapped[str] = mapped_column(String(20), nullable=False, default="desktop")

    # Geolocation (from IP)
    country: Mapped[str | None] = mapped_column(String(100), nullable=True)
    country_code: Mapped[str | None] = mapped_column(String(5), nullable=True)
    city: Mapped[str | None] = mapped_column(String(200), nullable=True)

    # Result
    success: Mapped[bool] = mapped_column(Boolean, nullable=False)
    failure_reason: Mapped[str | None] = mapped_column(String(100), nullable=True)
    # Possible reasons: invalid_email, invalid_password, account_locked,
    # account_expired, account_inactive, rate_limited, captcha_failed,
    # geo_blocked, mfa_required

    # Security flags
    suspicious: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    suspicious_reasons: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    # e.g. {"new_country": true, "new_device": true, "rapid_attempts": true}

    blocked: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    blocked_reason: Mapped[str | None] = mapped_column(String(200), nullable=True)

    # MFA
    mfa_used: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


# ─── Security Rules (admin-configurable) ─────────────────────────────────────


class SecurityRule(UUIDPrimaryKeyMixin, TimestampMixin, SoftDeleteMixin, Base):
    """Admin-configurable login security rules."""

    __tablename__ = "security_rules"
    __table_args__ = (
        Index("idx_security_rules_entity", "entity_id"),
        CheckConstraint(
            "rule_type IN ('geo_block','ip_whitelist','ip_blacklist',"
            "'max_attempts','time_window','device_trust','mfa_enforce')",
            name="ck_security_rule_type",
        ),
    )

    entity_id: Mapped[PyUUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("entities.id"), nullable=True
    )  # Null = global rule
    rule_type: Mapped[str] = mapped_column(String(30), nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    config: Mapped[dict] = mapped_column(JSONB, nullable=False)
    # Examples:
    #   geo_block: {"allowed_countries": ["CM", "FR", "GA"]}
    #   ip_whitelist: {"ips": ["10.0.0.0/8"]}
    #   max_attempts: {"max": 5, "window_minutes": 15, "lockout_minutes": 30}
    #   device_trust: {"require_known_device": true, "max_devices": 5}
    #   mfa_enforce: {"roles": ["SUPER_ADMIN", "DO"]}
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    priority: Mapped[int] = mapped_column(Integer, nullable=False, default=0)  # Higher = evaluated first
    created_by: Mapped[PyUUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
