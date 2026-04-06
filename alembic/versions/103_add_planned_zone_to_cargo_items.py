"""add planned loading zone to cargo items

Revision ID: 103_add_planned_zone_to_cargo_items
Revises: 102_add_cargo_requests
Create Date: 2026-04-06
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision = "103_add_planned_zone_to_cargo_items"
down_revision = "102_add_cargo_requests"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "cargo_items",
        sa.Column("planned_zone_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        "fk_cargo_items_planned_zone_id_transport_vector_zones",
        "cargo_items",
        "transport_vector_zones",
        ["planned_zone_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint(
        "fk_cargo_items_planned_zone_id_transport_vector_zones",
        "cargo_items",
        type_="foreignkey",
    )
    op.drop_column("cargo_items", "planned_zone_id")
