"""Fix settings primary key and scoped uniqueness.

Revision ID: 079_fix_settings_scope_uniqueness
Revises: 078_seed_mcp_token
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID as PG_UUID


revision = "079_fix_settings_scope_uniqueness"
down_revision = "078_seed_mcp_token"


def upgrade() -> None:
    op.add_column(
        "settings",
        sa.Column(
            "id",
            PG_UUID(as_uuid=True),
            nullable=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
    )
    op.execute("UPDATE settings SET id = gen_random_uuid() WHERE id IS NULL")
    op.alter_column("settings", "id", nullable=False)

    op.drop_constraint("settings_pkey", "settings", type_="primary")
    op.create_primary_key("settings_pkey", "settings", ["id"])

    op.create_index(
        "idx_settings_scope_scope_id",
        "settings",
        ["scope", "scope_id"],
        unique=False,
    )
    op.execute(
        "CREATE UNIQUE INDEX uq_settings_key_scope_scope_id_expr "
        "ON settings (key, scope, COALESCE(scope_id, ''))"
    )


def downgrade() -> None:
    conn = op.get_bind()
    duplicate_count = conn.execute(
        sa.text(
            """
            SELECT count(*) FROM (
              SELECT key
              FROM settings
              GROUP BY key
              HAVING count(*) > 1
            ) d
            """
        )
    ).scalar()
    if duplicate_count:
        raise RuntimeError(
            "Cannot downgrade settings primary key: duplicate keys now exist across scopes."
        )

    op.execute("DROP INDEX IF EXISTS uq_settings_key_scope_scope_id_expr")
    op.drop_index("idx_settings_scope_scope_id", table_name="settings")
    op.drop_constraint("settings_pkey", "settings", type_="primary")
    op.create_primary_key("settings_pkey", "settings", ["key"])
    op.drop_column("settings", "id")

