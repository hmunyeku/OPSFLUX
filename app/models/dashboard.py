"""Dashboard ORM models — full dashboards, tabs, permissions, widgets, TV mode.

Each module can have its own dashboard tabs, scoped via `target_module`.
When a user enters a module page, the frontend fetches tabs where
`target_module` matches that module's slug (e.g. "planner", "paxlog",
"travelwiz", "projets", "conformite").  Tabs with `target_module = NULL`
appear on the global/home dashboard.
"""

from datetime import datetime
from uuid import UUID as PyUUID

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Index, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, SoftDeleteMixin, TimestampMixin, UUIDPrimaryKeyMixin


# ─── Dashboard Tabs (mandatory, admin-defined) ─────────────────────────────

class DashboardTab(UUIDPrimaryKeyMixin, SoftDeleteMixin, Base):
    """Admin-defined mandatory dashboard tab — assigned by role and/or module."""

    __tablename__ = "dashboard_tabs"
    __table_args__ = (
        Index("idx_dashboard_tabs_entity", "entity_id"),
        Index("idx_dashboard_tabs_role", "entity_id", "target_role"),
        Index("idx_dashboard_tabs_module", "entity_id", "target_module"),
    )

    entity_id: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("entities.id"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    is_mandatory: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    target_role: Mapped[str | None] = mapped_column(String(50), nullable=True)
    target_module: Mapped[str | None] = mapped_column(
        String(50), nullable=True,
        comment="Module slug this tab belongs to (NULL = global dashboard)",
    )
    tab_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    widgets: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    created_by: Mapped[PyUUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), onupdate=func.now(), nullable=True
    )
    is_active: Mapped[bool] = mapped_column(
        Boolean, default=True, server_default="true", nullable=False
    )


# ─── User Personal Dashboard Tabs ──────────────────────────────────────────

class UserDashboardTab(UUIDPrimaryKeyMixin, Base):
    """User-created personal dashboard tab — drag-and-drop, closable."""

    __tablename__ = "user_dashboard_tabs"
    __table_args__ = (
        Index("idx_user_dashboard_tabs_user_entity", "user_id", "entity_id"),
    )

    user_id: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    entity_id: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("entities.id"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    tab_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    widgets: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), onupdate=func.now(), nullable=True
    )


# ─── Full Dashboard Object ─────────────────────────────────────────────────

class Dashboard(UUIDPrimaryKeyMixin, SoftDeleteMixin, Base):
    """Full dashboard object with GridStack layouts, widgets, and navigation."""

    __tablename__ = "dashboards"
    __table_args__ = (
        Index("idx_dashboards_tenant_entity", "tenant_id", "entity_id"),
        Index("idx_dashboards_owner", "owner_id"),
        Index("idx_dashboards_nav", "tenant_id", "nav_show_in_sidebar"),
    )

    tenant_id: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("entities.id"), nullable=False
    )
    entity_id: Mapped[PyUUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("entities.id"), nullable=True,
        comment="NULL = cross-entity dashboard",
    )
    bu_id: Mapped[PyUUID | None] = mapped_column(
        UUID(as_uuid=True), nullable=True  # BU scope (no FK — managed at app level, nullable=True
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    owner_id: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    is_public: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default="false", nullable=False
    )

    # Navigation sidebar integration
    nav_menu_parent: Mapped[str | None] = mapped_column(
        String(100), nullable=True,
        comment="Parent menu path (e.g. 'dashboards', 'operations')",
    )
    nav_menu_label: Mapped[str | None] = mapped_column(String(200), nullable=True)
    nav_menu_icon: Mapped[str | None] = mapped_column(String(50), nullable=True)
    nav_menu_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    nav_show_in_sidebar: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default="false", nullable=False
    )

    # Global filters (e.g. date range, asset filter, BU filter)
    global_filters: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    # Responsive GridStack layouts
    layout_mobile: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    layout_tablet: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    layout_desktop: Mapped[list | None] = mapped_column(JSONB, nullable=True)

    # Widget definitions (array of widget configs)
    widgets: Mapped[list | None] = mapped_column(JSONB, nullable=True, default=list)

    # TV mode
    tv_token: Mapped[str | None] = mapped_column(
        String(64), unique=True, nullable=True,
        comment="Token for unauthenticated TV display access",
    )
    tv_token_expires_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    tv_refresh_seconds: Mapped[int] = mapped_column(
        Integer, default=60, nullable=False,
        comment="Auto-refresh interval for TV mode (seconds)",
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), onupdate=func.now(), nullable=True
    )


# ─── Dashboard Permissions ──────────────────────────────────────────────────

class DashboardPermission(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Access control for dashboards — role, user, group, or BU scoped."""

    __tablename__ = "dashboard_permissions"
    __table_args__ = (
        Index("idx_dashboard_perm_dashboard", "dashboard_id"),
        Index("idx_dashboard_perm_type_value", "permission_type", "permission_value"),
    )

    dashboard_id: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("dashboards.id", ondelete="CASCADE"),
        nullable=False,
    )
    permission_type: Mapped[str] = mapped_column(
        String(20), nullable=False,
        comment="Type: 'role', 'user', 'group', 'bu', 'entity'",
    )
    permission_value: Mapped[str] = mapped_column(
        String(200), nullable=False,
        comment="Role code, user UUID, group UUID, BU UUID, or entity UUID",
    )
    inherit_from_parent: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default="false", nullable=False
    )
    allow_anonymous: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default="false", nullable=False,
        comment="Allow unauthenticated access (TV mode)",
    )


# ─── Home Page Settings ────────────────────────────────────────────────────

class HomePageSetting(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Home page dashboard resolution: user > role > BU > global."""

    __tablename__ = "home_page_settings"
    __table_args__ = (
        Index(
            "idx_home_page_tenant_scope",
            "tenant_id", "scope_type", "scope_value",
            unique=True,
        ),
    )

    tenant_id: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("entities.id"), nullable=False
    )
    scope_type: Mapped[str] = mapped_column(
        String(20), nullable=False,
        comment="Scope: 'user', 'role', 'bu', 'global'",
    )
    scope_value: Mapped[str | None] = mapped_column(
        String(200), nullable=True,
        comment="user UUID, role code, BU UUID, or NULL for global",
    )
    dashboard_id: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("dashboards.id", ondelete="CASCADE"),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(),
        onupdate=func.now(), nullable=False,
    )


# ─── Widget Cache ──────────────────────────────────────────────────────────

class WidgetCache(UUIDPrimaryKeyMixin, Base):
    """Server-side cache for expensive widget queries."""

    __tablename__ = "widget_cache"
    __table_args__ = (
        Index("idx_widget_cache_key", "tenant_id", "cache_key", unique=True),
        Index("idx_widget_cache_expires", "expires_at"),
    )

    tenant_id: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("entities.id"), nullable=False
    )
    dashboard_id: Mapped[PyUUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("dashboards.id", ondelete="CASCADE"),
        nullable=True,
    )
    widget_id: Mapped[str] = mapped_column(
        String(100), nullable=False,
        comment="Widget identifier within the dashboard",
    )
    cache_key: Mapped[str] = mapped_column(
        String(500), nullable=False,
        comment="Hash of widget config + filters for cache lookup",
    )
    data: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    row_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    generated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )


# ─── Dashboard Access Logs ─────────────────────────────────────────────────

class DashboardAccessLog(UUIDPrimaryKeyMixin, Base):
    """Audit trail for dashboard access (analytics + security)."""

    __tablename__ = "dashboard_access_logs"
    __table_args__ = (
        Index("idx_access_log_dashboard", "dashboard_id"),
        Index("idx_access_log_user", "user_id"),
        Index("idx_access_log_created", "created_at"),
    )

    tenant_id: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("entities.id"), nullable=False
    )
    dashboard_id: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("dashboards.id", ondelete="CASCADE"),
        nullable=False,
    )
    user_id: Mapped[PyUUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True,
        comment="NULL for anonymous TV access",
    )
    access_type: Mapped[str] = mapped_column(
        String(20), nullable=False, default="view",
        comment="Type: 'view', 'edit', 'tv', 'export', 'api'",
    )
    ip_address: Mapped[str | None] = mapped_column(String(45), nullable=True)
    session_duration_seconds: Mapped[int | None] = mapped_column(
        Integer, nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
