"""Bind personal MCP tokens to tenant schema and entity scope.

Revision ID: 107_mcp_personal_token_context
Revises: 106_restore_planner_capacity_tables
Create Date: 2026-04-08
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID


revision = "107_mcp_personal_token_context"
down_revision = "106_restore_planner_capacity_tables"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("mcp_gateway_tokens", sa.Column("tenant_schema", sa.String(length=63), nullable=True), schema="public")
    op.add_column("mcp_gateway_tokens", sa.Column("entity_id", UUID(as_uuid=True), nullable=True), schema="public")
    op.create_index(
        "ix_mcp_gw_token_creator_context",
        "mcp_gateway_tokens",
        ["created_by", "tenant_schema", "entity_id"],
        unique=False,
        schema="public",
    )


def downgrade() -> None:
    op.drop_index("ix_mcp_gw_token_creator_context", table_name="mcp_gateway_tokens", schema="public")
    op.drop_column("mcp_gateway_tokens", "entity_id", schema="public")
    op.drop_column("mcp_gateway_tokens", "tenant_schema", schema="public")
