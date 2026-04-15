"""Planner scenario: is_reference flag + auto-seed from live activities.

Revision ID: 132_planner_scenario_reference
Revises: 131_cargo_emballage_reusable
Create Date: 2026-04-15

Adds `is_reference` boolean to planner_scenarios so exactly one scenario
is the "live plan" at any point in time. The scenario previously called
"the plan" becomes the reference scenario; all other scenarios are
simulations / what-if branches.

Constraint: at most one scenario per entity may have is_reference=True.
This is enforced at the application layer (not DB UNIQUE because the row
must flip atomically during promotion).
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "132_planner_scenario_reference"
down_revision = "131_cargo_emballage_reusable"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "planner_scenarios",
        sa.Column(
            "is_reference",
            sa.Boolean,
            nullable=False,
            server_default="false",
            comment="Exactly one scenario per entity is the live reference plan.",
        ),
    )
    op.create_index(
        "idx_planner_scenario_is_reference",
        "planner_scenarios",
        ["entity_id", "is_reference"],
    )


def downgrade() -> None:
    op.drop_index("idx_planner_scenario_is_reference", table_name="planner_scenarios")
    op.drop_column("planner_scenarios", "is_reference")
