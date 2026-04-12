"""Planner scenarios — persistent what-if simulation.

Creates two new tables:
  - planner_scenarios: the scenario entity (title, description, status,
    baseline snapshot, cached simulation results)
  - planner_scenario_activities: proposed/modified activities within a
    scenario (junction to planner_activities for overrides, standalone
    rows for new proposals)

The lifecycle is: draft → validated → promoted (live) or archived.
Promotion converts scenario activities into real PlannerActivity rows
via a dedicated endpoint with arbiter-level permission.

Revision ID: 125
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "125"
down_revision = "124"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "planner_scenarios",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("entity_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("entities.id"), nullable=False),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="draft"),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("promoted_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("promoted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("baseline_snapshot", postgresql.JSONB, nullable=True),
        sa.Column("baseline_snapshot_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_simulation_result", postgresql.JSONB, nullable=True),
        sa.Column("last_simulated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("active", sa.Boolean, nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now(), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint("status IN ('draft','validated','promoted','archived')", name="ck_planner_scenario_status"),
    )
    op.create_index("idx_planner_scenario_entity", "planner_scenarios", ["entity_id"])
    op.create_index("idx_planner_scenario_status", "planner_scenarios", ["status"])

    op.create_table(
        "planner_scenario_activities",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("scenario_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("planner_scenarios.id", ondelete="CASCADE"), nullable=False),
        sa.Column("source_activity_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("planner_activities.id", ondelete="SET NULL"), nullable=True),
        sa.Column("title", sa.String(255), nullable=True),
        sa.Column("asset_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("ar_installations.id"), nullable=True),
        sa.Column("type", sa.String(30), nullable=True),
        sa.Column("priority", sa.String(20), nullable=True),
        sa.Column("pax_quota", sa.Integer, nullable=True),
        sa.Column("start_date", sa.Date, nullable=True),
        sa.Column("end_date", sa.Date, nullable=True),
        sa.Column("notes", sa.Text, nullable=True),
        sa.Column("is_removed", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now(), nullable=False),
    )
    op.create_index("idx_planner_scenario_act_scenario", "planner_scenario_activities", ["scenario_id"])
    op.create_index("idx_planner_scenario_act_source", "planner_scenario_activities", ["source_activity_id"])


def downgrade() -> None:
    op.drop_table("planner_scenario_activities")
    op.drop_table("planner_scenarios")
