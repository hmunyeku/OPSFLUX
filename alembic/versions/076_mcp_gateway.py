"""MCP Gateway — backends and tokens tables for centralized MCP auth proxy.

Revision ID: 076_mcp_gateway
Revises: 075_polymorphic_cost_imputations
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "076_mcp_gateway"
down_revision = "075_polymorphic_cost_imputations"


def upgrade() -> None:
    op.create_table(
        "mcp_gateway_backends",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("slug", sa.String(50), unique=True, nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("upstream_url", sa.String(500), nullable=False),
        sa.Column("description", sa.Text),
        sa.Column("active", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        schema="public",
    )

    op.create_table(
        "mcp_gateway_tokens",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("token_hash", sa.String(64), unique=True, nullable=False),
        sa.Column("scopes", sa.String(500), nullable=False, server_default="*"),
        sa.Column("created_by", UUID(as_uuid=True), sa.ForeignKey("public.users.id"), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True)),
        sa.Column("revoked", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("last_used_at", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        schema="public",
    )

    op.create_index(
        "ix_mcp_gw_token_hash",
        "mcp_gateway_tokens",
        ["token_hash"],
        schema="public",
    )


def downgrade() -> None:
    op.drop_index("ix_mcp_gw_token_hash", table_name="mcp_gateway_tokens", schema="public")
    op.drop_table("mcp_gateway_tokens", schema="public")
    op.drop_table("mcp_gateway_backends", schema="public")
