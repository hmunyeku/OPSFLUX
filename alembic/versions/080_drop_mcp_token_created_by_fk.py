"""Drop FK constraint on mcp_gateway_tokens.created_by.

Users live in tenant schemas, not public — the FK to public.users is invalid.

Revision ID: 080_drop_mcp_token_created_by_fk
Revises: 079_fix_settings_scope_uniqueness
"""
from alembic import op
import sqlalchemy as sa

revision = "080_drop_mcp_token_created_by_fk"
down_revision = "079_fix_settings_scope_uniqueness"


def upgrade() -> None:
    conn = op.get_bind()
    # Find and drop any FK constraint on created_by column
    result = conn.execute(sa.text("""
        SELECT conname
        FROM pg_constraint
        WHERE conrelid = 'public.mcp_gateway_tokens'::regclass
          AND contype = 'f'
          AND EXISTS (
              SELECT 1
              FROM unnest(conkey) k
              JOIN pg_attribute a ON a.attrelid = conrelid AND a.attnum = k
              WHERE a.attname = 'created_by'
          )
    """))
    for row in result:
        op.drop_constraint(row[0], "mcp_gateway_tokens", schema="public")


def downgrade() -> None:
    # Don't re-add the broken FK
    pass
