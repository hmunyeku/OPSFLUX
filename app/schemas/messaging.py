"""Pydantic schemas for the Messaging module — announcements, login events, security rules."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field

from app.schemas.common import OpsFluxSchema

# ── Announcements ────────────────────────────────────────────────────────────


class AnnouncementCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=300)
    body: str = Field(..., min_length=1)
    body_html: str | None = None
    priority: str = Field("info", pattern=r"^(info|warning|critical|maintenance)$")
    target_type: str = Field("all", pattern=r"^(all|entity|role|module|user)$")
    target_value: str | None = None
    display_location: str = Field("dashboard", pattern=r"^(dashboard|login|banner|modal|logout|all)$")
    published_at: datetime | None = None
    expires_at: datetime | None = None
    send_email: bool = False
    pinned: bool = False


class AnnouncementUpdate(BaseModel):
    title: str | None = Field(None, min_length=1, max_length=300)
    body: str | None = Field(None, min_length=1)
    body_html: str | None = None
    priority: str | None = Field(None, pattern=r"^(info|warning|critical|maintenance)$")
    target_type: str | None = Field(None, pattern=r"^(all|entity|role|module|user)$")
    target_value: str | None = None
    display_location: str | None = Field(None, pattern=r"^(dashboard|login|banner|modal|logout|all)$")
    published_at: datetime | None = None
    expires_at: datetime | None = None
    send_email: bool | None = None
    pinned: bool | None = None
    active: bool | None = None


class AnnouncementRead(OpsFluxSchema):
    id: UUID
    entity_id: UUID | None
    title: str
    body: str
    body_html: str | None
    priority: str
    target_type: str
    target_value: str | None
    display_location: str
    published_at: datetime | None
    expires_at: datetime | None
    send_email: bool
    email_sent_at: datetime | None
    sender_id: UUID
    active: bool
    pinned: bool
    created_at: datetime
    updated_at: datetime
    # Enriched fields (populated by route handler)
    sender_name: str | None = None
    is_read: bool = False


# ── Login Events ─────────────────────────────────────────────────────────────


class LoginEventRead(OpsFluxSchema):
    id: UUID
    user_id: UUID | None
    email: str
    ip_address: str
    user_agent: str | None
    browser: str | None
    os: str | None
    device_type: str
    country: str | None
    country_code: str | None
    city: str | None
    success: bool
    failure_reason: str | None
    suspicious: bool
    suspicious_reasons: dict | None
    blocked: bool
    blocked_reason: str | None
    mfa_used: bool
    created_at: datetime


class LoginEventStats(BaseModel):
    total: int
    successful: int
    failed: int
    blocked: int
    suspicious: int
    unique_ips: int
    top_failure_reasons: list[dict]
    attempts_by_hour: list[dict]


# ── Security Rules ───────────────────────────────────────────────────────────


class SecurityRuleCreate(BaseModel):
    rule_type: str = Field(
        ..., pattern=r"^(geo_block|ip_whitelist|ip_blacklist|max_attempts|time_window|device_trust|mfa_enforce)$"
    )
    name: str = Field(..., min_length=1, max_length=200)
    description: str | None = None
    config: dict = Field(...)
    enabled: bool = True
    priority: int = 0


class SecurityRuleUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=200)
    description: str | None = None
    config: dict | None = None
    enabled: bool | None = None
    priority: int | None = None


class SecurityRuleRead(OpsFluxSchema):
    id: UUID
    entity_id: UUID | None
    rule_type: str
    name: str
    description: str | None
    config: dict
    enabled: bool
    priority: int
    created_by: UUID
    created_at: datetime
    updated_at: datetime
