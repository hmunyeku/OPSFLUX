"""Seed initial MCP gateway token for Claude.ai access.

Revision ID: 078_seed_mcp_token
Revises: 077_mcp_backend_config
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID as PG_UUID

revision = "078_seed_mcp_token"
down_revision = "077_mcp_backend_config"


def upgrade() -> None:
    # Insert token only if none exist yet (idempotent)
    conn = op.get_bind()
    count = conn.execute(
        sa.text("SELECT count(*) FROM public.mcp_gateway_tokens")
    ).scalar()
    if count == 0:
        conn.execute(sa.text(
            "INSERT INTO public.mcp_gateway_tokens "
            "(id, name, token_hash, scopes, revoked, created_at, updated_at) "
            "VALUES ("
            "  gen_random_uuid(), "
            "  'claude-ai-token', "
            "  '116b598674242c08d7bc53370d1cb059c97e586c441e676df40b63b33fc86f86', "
            "  '*', "
            "  false, "
            "  now(), "
            "  now()"
            ")"
        ))


def downgrade() -> None:
    op.get_bind().execute(sa.text(
        "DELETE FROM public.mcp_gateway_tokens WHERE name = 'claude-ai-token'"
    ))
