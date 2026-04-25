"""Planner activity progress weighting — per-activity override + manual weight.

Adds:
  - PlannerActivity.progress_weight_method (varchar(20), nullable)
      One of: 'equal' | 'effort' | 'duration' | 'manual'
      NULL  → fall back to the linked Project's method (when project_id is set),
              then to the entity-scoped admin setting
              `planner.default_progress_weight_method`,
              then to 'equal'.
  - PlannerActivity.weight (numeric(10,2), nullable)
      Manual weight, only used when the resolved method is 'manual'.

Both fields are nullable so the migration is non-breaking on production —
existing activities keep behaving exactly as before until the user picks
a method or assigns weights.

Revision ID: 123_planner_activity_progress_weight
Revises: 122_project_progress_weight
Create Date: 2026-04-11
"""

from alembic import op
import sqlalchemy as sa


revision = "123_planner_activity_progress_weight"
down_revision = "122_project_progress_weight"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "planner_activities",
        sa.Column("progress_weight_method", sa.String(length=20), nullable=True),
    )
    op.add_column(
        "planner_activities",
        sa.Column("weight", sa.Numeric(precision=10, scale=2), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("planner_activities", "weight")
    op.drop_column("planner_activities", "progress_weight_method")
