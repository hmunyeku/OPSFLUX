"""Dashboard ORM models — admin-defined mandatory tabs and user personal tabs."""

from datetime import datetime
from uuid import UUID as PyUUID

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, Integer, String, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, UUIDPrimaryKeyMixin


# ─── Dashboard Tabs (mandatory, admin-defined) ─────────────────────────────

class DashboardTab(UUIDPrimaryKeyMixin, Base):
    """Admin-defined mandatory dashboard tab — assigned by role."""

    __tablename__ = "dashboard_tabs"
    __table_args__ = (
        Index("idx_dashboard_tabs_entity", "entity_id"),
        Index("idx_dashboard_tabs_role", "entity_id", "target_role"),
    )

    entity_id: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("entities.id"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    is_mandatory: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    target_role: Mapped[str | None] = mapped_column(String(50), nullable=True)
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
