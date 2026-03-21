"""Add user_type field and user_tier_links table.

Revision ID: 043
Revises: 042
"""

import sqlalchemy as sa
from alembic import op

revision = "043"
down_revision = "042"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add user_type column to users table
    op.add_column(
        "users",
        sa.Column("user_type", sa.String(20), nullable=False, server_default="internal"),
    )

    # Create user_tier_links table
    op.create_table(
        "user_tier_links",
        sa.Column("id", sa.dialects.postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("user_id", sa.dialects.postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False, index=True),
        sa.Column("tier_id", sa.dialects.postgresql.UUID(as_uuid=True), sa.ForeignKey("tiers.id"), nullable=False, index=True),
        sa.Column("role", sa.String(50), nullable=False, server_default="viewer"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("user_id", "tier_id", name="uq_user_tier"),
    )


def downgrade() -> None:
    op.drop_table("user_tier_links")
    op.drop_column("users", "user_type")
