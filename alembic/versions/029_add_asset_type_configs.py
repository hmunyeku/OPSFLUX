"""Add asset_type_configs table.

New table:
  asset_type_configs — configurable asset type definitions per entity
                       (icon, colour, map marker shape, etc.)

Revision ID: 029
Revises: 028
Create Date: 2026-03-19
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision: str = "029"
down_revision: Union[str, None] = "028"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "asset_type_configs",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("entity_id", UUID(as_uuid=True), sa.ForeignKey("entities.id"), nullable=False),
        sa.Column("asset_type", sa.String(50), nullable=False),
        sa.Column("label", sa.String(200), nullable=False),
        sa.Column("icon_name", sa.String(100), nullable=True),
        sa.Column("icon_url", sa.Text(), nullable=True),
        sa.Column("color", sa.String(20), nullable=True),
        sa.Column("map_marker_shape", sa.String(20), nullable=False, server_default="circle"),
        sa.Column("is_fixed_installation", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("show_on_map", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index(
        "uq_asset_type_entity",
        "asset_type_configs",
        ["entity_id", "asset_type"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index("uq_asset_type_entity", table_name="asset_type_configs")
    op.drop_table("asset_type_configs")
