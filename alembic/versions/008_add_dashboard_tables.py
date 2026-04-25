"""Add dashboard_tabs and user_dashboard_tabs tables.

Revision ID: 008_add_dashboard_tables
Revises: 007_add_phones_contact_emails
"""

from alembic import op
import sqlalchemy as sa

revision = "008_add_dashboard_tables"
down_revision = "007_add_phones_contact_emails"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── Dashboard tabs (admin-defined mandatory tabs) ─────────
    op.create_table(
        "dashboard_tabs",
        sa.Column("id", sa.Uuid(), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("entity_id", sa.Uuid(), sa.ForeignKey("entities.id"), nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("is_mandatory", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("target_role", sa.String(50), nullable=True),
        sa.Column("tab_order", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("widgets", sa.dialects.postgresql.JSONB(), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("created_by", sa.Uuid(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
    )
    op.create_index("idx_dashboard_tabs_entity", "dashboard_tabs", ["entity_id"])
    op.create_index("idx_dashboard_tabs_role", "dashboard_tabs", ["entity_id", "target_role"])

    # ── User personal dashboard tabs ──────────────────────────
    op.create_table(
        "user_dashboard_tabs",
        sa.Column("id", sa.Uuid(), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("user_id", sa.Uuid(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("entity_id", sa.Uuid(), sa.ForeignKey("entities.id"), nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("tab_order", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("widgets", sa.dialects.postgresql.JSONB(), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("idx_user_dashboard_tabs_user_entity", "user_dashboard_tabs", ["user_id", "entity_id"])


def downgrade() -> None:
    op.drop_table("user_dashboard_tabs")
    op.drop_table("dashboard_tabs")
