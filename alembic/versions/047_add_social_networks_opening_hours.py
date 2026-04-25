"""Add social_networks and opening_hours polymorphic tables.

Revision ID: 047
Revises: 046
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision = "047"
down_revision = "046"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "social_networks",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("owner_type", sa.String(50), nullable=False),
        sa.Column("owner_id", UUID(as_uuid=True), nullable=False),
        sa.Column("network", sa.String(50), nullable=False),
        sa.Column("url", sa.String(500), nullable=False),
        sa.Column("label", sa.String(100), nullable=True),
        sa.Column("sort_order", sa.Integer, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("idx_social_networks_owner", "social_networks", ["owner_type", "owner_id"])

    op.create_table(
        "opening_hours",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("owner_type", sa.String(50), nullable=False),
        sa.Column("owner_id", UUID(as_uuid=True), nullable=False),
        sa.Column("day_of_week", sa.Integer, nullable=False),
        sa.Column("open_time", sa.String(5), nullable=True),
        sa.Column("close_time", sa.String(5), nullable=True),
        sa.Column("is_closed", sa.Boolean, server_default="false"),
        sa.Column("label", sa.String(100), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("idx_opening_hours_owner", "opening_hours", ["owner_type", "owner_id"])


def downgrade() -> None:
    op.drop_index("idx_opening_hours_owner", table_name="opening_hours")
    op.drop_table("opening_hours")
    op.drop_index("idx_social_networks_owner", table_name="social_networks")
    op.drop_table("social_networks")
