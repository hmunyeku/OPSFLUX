"""Planner: add SF (Start-to-Finish) dependency type.

The original CheckConstraint on planner_activity_dependencies only allowed
the 3 common types: FS / SS / FF. This migration extends it to also allow
SF (Start-to-Finish) which is the standard 4th MS-Project / Primavera type.

Revision ID: 114_planner_dependency_add_sf_type
Revises: 113_planner_activity_hierarchy_and_variable_pob
"""
from alembic import op


revision = "114_planner_dependency_add_sf_type"
down_revision = "113_planner_activity_hierarchy_and_variable_pob"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # The original table was created without the CheckConstraint despite the
    # model declaring one (the constraint never made it into a migration).
    # Use IF EXISTS to handle both states: table with old constraint and
    # table with no constraint at all.
    op.execute(
        "ALTER TABLE planner_activity_dependencies "
        "DROP CONSTRAINT IF EXISTS ck_planner_dep_type"
    )
    op.create_check_constraint(
        "ck_planner_dep_type",
        "planner_activity_dependencies",
        "dependency_type IN ('FS','SS','FF','SF')",
    )


def downgrade() -> None:
    # Before reverting, any rows with dependency_type='SF' must be removed
    # otherwise the old constraint will fail to recreate.
    op.execute(
        "DELETE FROM planner_activity_dependencies WHERE dependency_type = 'SF'"
    )
    op.execute(
        "ALTER TABLE planner_activity_dependencies "
        "DROP CONSTRAINT IF EXISTS ck_planner_dep_type"
    )
    op.create_check_constraint(
        "ck_planner_dep_type",
        "planner_activity_dependencies",
        "dependency_type IN ('FS','SS','FF')",
    )
