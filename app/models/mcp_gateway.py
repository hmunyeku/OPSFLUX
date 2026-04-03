"""MCP Gateway models — tokens and backends for remote MCP proxy."""

from datetime import datetime
from uuid import UUID as PyUUID

from sqlalchemy import Boolean, DateTime, Index, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class McpGatewayBackend(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """An upstream MCP server that the gateway can proxy to."""

    __tablename__ = "mcp_gateway_backends"
    __table_args__ = {"schema": "public"}

    slug: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    upstream_url: Mapped[str] = mapped_column(String(500), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    config: Mapped[dict | None] = mapped_column(
        JSONB, nullable=True,
        comment="Backend-specific config (credentials for native backends)",
    )


class McpGatewayToken(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Bearer token for external MCP clients (e.g., claude.ai)."""

    __tablename__ = "mcp_gateway_tokens"
    __table_args__ = (
        Index("ix_mcp_gw_token_hash", "token_hash"),
        {"schema": "public"},
    )

    name: Mapped[str] = mapped_column(String(200), nullable=False)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    scopes: Mapped[str] = mapped_column(
        String(500), nullable=False, default="*",
        comment="Comma-separated backend slugs, or '*' for all",
    )
    created_by: Mapped[PyUUID | None] = mapped_column(
        UUID(as_uuid=True), nullable=True,
        comment="User ID who created this token (no FK — users are in tenant schemas)",
    )
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    revoked: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
