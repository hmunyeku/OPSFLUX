"""Dashboard Pydantic schemas — request/response models for tabs, dashboards, and widgets."""

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
    user_id: UUID | None = None
    entity_id: UUID
    name: str
    tab_order: int
    widgets: list[dict[str, Any]]
    created_at: datetime | str | None = None
    updated_at: datetime | str | None = None
    is_mandatory: bool = False


# ─── Admin (Mandatory) Tab schemas ────────────────────────────────────────

class AdminTabCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    is_mandatory: bool = True
    target_role: str | None = Field(None, max_length=50)
    target_module: str | None = Field(
        None, max_length=50,
        description="Module slug (planner, paxlog, travelwiz, projets…). NULL = global dashboard.",
    )
    tab_order: int = Field(0, ge=0)
    widgets: list[WidgetConfig] = Field(default_factory=list)


class AdminTabUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=100)
    is_mandatory: bool | None = None
    target_role: str | None = None
    target_module: str | None = None
    tab_order: int | None = Field(None, ge=0)
    widgets: list[WidgetConfig] | None = None


class AdminTabRead(OpsFluxSchema):
    id: UUID
    entity_id: UUID
    name: str
    is_mandatory: bool
    target_role: str | None
    target_module: str | None = None
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
    target_module: str | None = None
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


# ═══════════════════════════════════════════════════════════════════════════
#  Full Dashboard schemas (CRUD)
# ═══════════════════════════════════════════════════════════════════════════

class DashboardCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    description: str | None = None
    is_public: bool = False

    # Navigation
    nav_menu_parent: str | None = Field(None, max_length=100)
    nav_menu_label: str | None = Field(None, max_length=200)
    nav_menu_icon: str | None = Field(None, max_length=50)
    nav_menu_order: int = Field(0, ge=0)
    nav_show_in_sidebar: bool = False

    # Filters & layouts
    global_filters: dict[str, Any] | None = None
    layout_mobile: list[dict[str, Any]] | None = None
    layout_tablet: list[dict[str, Any]] | None = None
    layout_desktop: list[dict[str, Any]] | None = None

    # Widgets
    widgets: list[dict[str, Any]] = Field(default_factory=list)

    # TV mode
    tv_refresh_seconds: int = Field(60, ge=10, le=3600)


class DashboardUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=200)
    description: str | None = None
    is_public: bool | None = None

    # Navigation
    nav_menu_parent: str | None = None
    nav_menu_label: str | None = None
    nav_menu_icon: str | None = None
    nav_menu_order: int | None = None
    nav_show_in_sidebar: bool | None = None

    # Filters & layouts
    global_filters: dict[str, Any] | None = None
    layout_mobile: list[dict[str, Any]] | None = None
    layout_tablet: list[dict[str, Any]] | None = None
    layout_desktop: list[dict[str, Any]] | None = None

    # Widgets
    widgets: list[dict[str, Any]] | None = None

    # TV mode
    tv_refresh_seconds: int | None = Field(None, ge=10, le=3600)


class DashboardRead(OpsFluxSchema):
    id: UUID
    tenant_id: UUID
    entity_id: UUID | None
    bu_id: UUID | None = None
    name: str
    description: str | None
    owner_id: UUID
    is_public: bool

    # Navigation
    nav_menu_parent: str | None
    nav_menu_label: str | None
    nav_menu_icon: str | None
    nav_menu_order: int
    nav_show_in_sidebar: bool

    # Filters & layouts
    global_filters: dict[str, Any] | None
    layout_mobile: list[dict[str, Any]] | None
    layout_tablet: list[dict[str, Any]] | None
    layout_desktop: list[dict[str, Any]] | None

    # Widgets
    widgets: list[dict[str, Any]] | None

    # TV mode
    tv_refresh_seconds: int

    created_at: datetime
    updated_at: datetime | None


class DashboardSummaryRead(OpsFluxSchema):
    """Lightweight read for list views."""
    id: UUID
    name: str
    description: str | None
    owner_id: UUID
    is_public: bool
    nav_show_in_sidebar: bool
    widget_count: int = 0
    created_at: datetime
    updated_at: datetime | None


# ═══════════════════════════════════════════════════════════════════════════
#  Widget Catalog
# ═══════════════════════════════════════════════════════════════════════════

class WidgetCatalogEntry(BaseModel):
    """A predefined widget that modules register for the catalog."""
    id: str
    type: str = Field(..., description="kpi, table, chart, map, custom")
    title: str
    description: str | None = None
    permissions: list[str] = Field(default_factory=list)
    roles: list[str] = Field(
        default_factory=lambda: ["*"],
        description="Role codes allowed to use this widget (* = all)",
    )
    default_config: dict[str, Any] = Field(default_factory=dict)
    source_module: str = "core"


# ═══════════════════════════════════════════════════════════════════════════
#  Widget Data Request / Response
# ═══════════════════════════════════════════════════════════════════════════

class WidgetDataRequest(BaseModel):
    """Request data for a specific widget instance."""
    widget_id: str = Field(..., min_length=1, max_length=100)
    widget_type: str = Field(..., min_length=1, max_length=50)
    config: dict[str, Any] = Field(default_factory=dict)
    filters: dict[str, Any] = Field(default_factory=dict)


class WidgetDataResponse(BaseModel):
    """Response containing widget data."""
    widget_id: str
    widget_type: str
    data: Any = None
    row_count: int = 0
    cached: bool = False
    generated_at: datetime | None = None
    error: str | None = None


# ═══════════════════════════════════════════════════════════════════════════
#  SQL Widget
# ═══════════════════════════════════════════════════════════════════════════

class SQLWidgetRequest(BaseModel):
    """Execute a user-defined SQL query for a widget (read-only, validated)."""
    query: str = Field(..., min_length=1, max_length=5000)
    params: dict[str, Any] = Field(default_factory=dict)
    max_rows: int = Field(1000, ge=1, le=10000)
    timeout_seconds: int = Field(30, ge=1, le=120)


class SQLWidgetResponse(BaseModel):
    """Result of a SQL widget query."""
    columns: list[str] = Field(default_factory=list)
    rows: list[list[Any]] = Field(default_factory=list)
    row_count: int = 0
    truncated: bool = False
    execution_time_ms: float = 0
    error: str | None = None


# ═══════════════════════════════════════════════════════════════════════════
#  Home Page Settings
# ═══════════════════════════════════════════════════════════════════════════

class HomePageSettingCreate(BaseModel):
    """Set a dashboard as the home page for a given scope."""
    scope_type: str = Field(
        ..., pattern=r"^(user|role|bu|global)$",
        description="Scope level: user, role, bu, or global",
    )
    scope_value: str | None = Field(
        None,
        description="user UUID, role code, BU UUID — NULL for global scope",
    )
    dashboard_id: UUID


class HomePageSettingRead(OpsFluxSchema):
    id: UUID
    tenant_id: UUID
    scope_type: str
    scope_value: str | None
    dashboard_id: UUID
    updated_at: datetime


# ═══════════════════════════════════════════════════════════════════════════
#  Import / Export
# ═══════════════════════════════════════════════════════════════════════════

class DashboardExport(BaseModel):
    """Full dashboard export payload (JSON-serializable)."""
    version: str = "1.0"
    name: str
    description: str | None = None
    global_filters: dict[str, Any] | None = None
    layout_mobile: list[dict[str, Any]] | None = None
    layout_tablet: list[dict[str, Any]] | None = None
    layout_desktop: list[dict[str, Any]] | None = None
    widgets: list[dict[str, Any]] = Field(default_factory=list)
    nav_menu_parent: str | None = None
    nav_menu_label: str | None = None
    nav_menu_icon: str | None = None
    nav_menu_order: int = 0
    nav_show_in_sidebar: bool = False
    tv_refresh_seconds: int = 60


class DashboardImport(BaseModel):
    """Payload for importing a dashboard from JSON."""
    dashboard: DashboardExport
    overwrite_id: UUID | None = Field(
        None, description="If set, overwrite existing dashboard instead of creating new",
    )


# ═══════════════════════════════════════════════════════════════════════════
#  TV Mode
# ═══════════════════════════════════════════════════════════════════════════

class TVLinkCreate(BaseModel):
    """Generate a TV link for a dashboard."""
    expires_hours: int = Field(720, ge=1, le=8760, description="Token validity in hours (default 30 days)")
    refresh_seconds: int = Field(60, ge=10, le=3600)


class TVLinkRead(BaseModel):
    """Response with generated TV link details."""
    dashboard_id: UUID
    token: str
    url: str
    expires_at: datetime
    refresh_seconds: int
