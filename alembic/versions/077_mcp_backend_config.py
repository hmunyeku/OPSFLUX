"""Add config JSONB column to mcp_gateway_backends for native backend credentials.

Revision ID: 077_mcp_backend_config
Revises: 076_mcp_gateway
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = "077_mcp_backend_config"
down_revision = "076_mcp_gateway"


def upgrade() -> None:
    op.add_column(
        "mcp_gateway_backends",
        sa.Column("config", JSONB, nullable=True,
                  comment="Backend-specific config (credentials for native backends)"),
        schema="public",
    )


def downgrade() -> None:
    op.drop_column("mcp_gateway_backends", "config", schema="public")
