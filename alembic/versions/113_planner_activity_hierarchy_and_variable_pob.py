"""Planner: add activity hierarchy and variable POB mode.

- parent_id FK for activity parent/child hierarchy (spec §2.5)
- pax_quota_mode ('constant'|'variable') and pax_quota_daily JSONB (spec §2.4)

Revision ID: 113_planner_activity_hierarchy_and_variable_pob
Revises: 112_gdpr_pgcrypto_sensitive_columns
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "113_planner_activity_hierarchy_and_variable_pob"
down_revision = "112_gdpr_pgcrypto_sensitive_columns"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "planner_activities",
        sa.Column("parent_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("planner_activities.id", ondelete="SET NULL"), nullable=True),
    )
    op.create_index("idx_planner_act_parent", "planner_activities", ["parent_id"])

    op.add_column(
        "planner_activities",
        sa.Column("pax_quota_mode", sa.String(10), nullable=False, server_default="constant"),
    )
    op.add_column(
        "planner_activities",
        sa.Column("pax_quota_daily", postgresql.JSONB, nullable=True),
    )


def downgrade() -> None:
    op.drop_column("planner_activities", "pax_quota_daily")
    op.drop_column("planner_activities", "pax_quota_mode")
    op.drop_index("idx_planner_act_parent", table_name="planner_activities")
    op.drop_column("planner_activities", "parent_id")
