"""Dashboard Pydantic schemas — request/response models for tabs and widgets."""

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field

from app.schemas.common import OpsFluxSchema


# ─── Widget Position ───────────────────────────────────────────────────────

class WidgetPosition(BaseModel):
    x: int = Field(0, ge=0)
    y: int = Field(0, ge=0)
    w: int = Field(4, ge=1, le=12)
    h: int = Field(4, ge=1, le=20)


class WidgetConfig(BaseModel):
    type: str = Field(..., min_length=1, max_length=50)
    title: str = Field(..., min_length=1, max_length=200)
    config: dict[str, Any] = Field(default_factory=dict)
    position: WidgetPosition = Field(default_factory=WidgetPosition)


# ─── Personal Tab schemas ─────────────────────────────────────────────────

class PersonalTabCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    tab_order: int = Field(0, ge=0)
    widgets: list[WidgetConfig] = Field(default_factory=list)


class PersonalTabUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=100)
    tab_order: int | None = Field(None, ge=0)
    widgets: list[WidgetConfig] | None = None


class PersonalTabRead(OpsFluxSchema):
    id: UUID
    user_id: UUID
    entity_id: UUID
    name: str
    tab_order: int
    widgets: list[dict[str, Any]]
    created_at: datetime
    updated_at: datetime | None
    is_mandatory: bool = False  # Always False for personal tabs


# ─── Admin (Mandatory) Tab schemas ────────────────────────────────────────

class AdminTabCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    is_mandatory: bool = True
    target_role: str | None = Field(None, max_length=50)
    tab_order: int = Field(0, ge=0)
    widgets: list[WidgetConfig] = Field(default_factory=list)


class AdminTabUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=100)
    is_mandatory: bool | None = None
    target_role: str | None = None
    tab_order: int | None = Field(None, ge=0)
    widgets: list[WidgetConfig] | None = None


class AdminTabRead(OpsFluxSchema):
    id: UUID
    entity_id: UUID
    name: str
    is_mandatory: bool
    target_role: str | None
    tab_order: int
    widgets: list[dict[str, Any]]
    created_by: UUID | None
    created_at: datetime
    updated_at: datetime | None
    is_active: bool


# ─── Unified Tab Read (for GET /tabs — combines mandatory + personal) ────

class DashboardTabRead(OpsFluxSchema):
    id: UUID
    name: str
    tab_order: int
    widgets: list[dict[str, Any]]
    is_mandatory: bool
    is_closable: bool  # True for personal, False for mandatory
    target_role: str | None = None
    created_at: datetime
    updated_at: datetime | None = None


# ─── Widget Data schemas ──────────────────────────────────────────────────

class DashboardStats(BaseModel):
    total_assets: int = 0
    total_tiers: int = 0
    total_users: int = 0
    active_workflows: int = 0
    recent_activity_count: int = 0


class ActivityEntry(OpsFluxSchema):
    id: UUID
    user_id: UUID | None
    action: str
    resource_type: str
    resource_id: str | None
    details: dict[str, Any] | None
    created_at: datetime


class PendingItem(BaseModel):
    id: UUID
    workflow_definition_id: UUID
    entity_type: str
    entity_id_ref: str
    current_state: str
    metadata: dict[str, Any] | None = None
    created_at: datetime
