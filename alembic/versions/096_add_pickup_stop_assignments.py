"""add pickup stop assignments

Revision ID: 096_add_pickup_stop_assignments
Revises: 094_planner_conflict_audit
Create Date: 2026-04-06
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID


revision = "096_add_pickup_stop_assignments"
down_revision = "094_planner_conflict_audit"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "pickup_stop_assignments",
        sa.Column(
            "id",
            UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "pickup_stop_id",
            UUID(as_uuid=True),
            sa.ForeignKey("pickup_stops.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "manifest_passenger_id",
            UUID(as_uuid=True),
            sa.ForeignKey("manifest_passengers.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("reminder_sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "active",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
        ),
        sa.UniqueConstraint(
            "pickup_stop_id",
            "manifest_passenger_id",
            name="uq_pickup_stop_assignment",
        ),
    )
    op.create_index(
        "idx_pickup_assignment_stop",
        "pickup_stop_assignments",
        ["pickup_stop_id"],
    )
    op.create_index(
        "idx_pickup_assignment_passenger",
        "pickup_stop_assignments",
        ["manifest_passenger_id"],
    )


def downgrade() -> None:
    op.drop_index("idx_pickup_assignment_passenger", table_name="pickup_stop_assignments")
    op.drop_index("idx_pickup_assignment_stop", table_name="pickup_stop_assignments")
    op.drop_table("pickup_stop_assignments")
