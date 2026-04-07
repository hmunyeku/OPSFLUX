"""add archived column to cargo_requests

Revision ID: 104_add_archived_to_cargo_requests
Revises: 103_add_planned_zone_to_cargo_items
Create Date: 2026-04-07
"""

from alembic import op
import sqlalchemy as sa


revision = "104_add_archived_to_cargo_requests"
down_revision = "103_add_planned_zone_to_cargo_items"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "cargo_requests",
        sa.Column("archived", sa.Boolean(), nullable=False, server_default="false"),
    )


def downgrade() -> None:
    op.drop_column("cargo_requests", "archived")
