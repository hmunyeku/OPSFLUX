"""Add target_module to dashboard_tabs for per-module dashboards.

Each module page (Planner, PaxLog, TravelWiz, Projets, etc.) renders
its own configurable dashboard. The admin assigns tabs to modules via
target_module.  Tabs with NULL target_module appear on the global
(home) dashboard.

Revision ID: 018_add_dashboard_target_module
Revises: 017_add_capacity_and_inter_module_links
Create Date: 2026-03-18
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "018_add_dashboard_target_module"
down_revision: Union[str, None] = "017_add_capacity_and_inter_module_links"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "dashboard_tabs",
        sa.Column(
            "target_module",
            sa.String(50),
            nullable=True,
            comment="Module slug this tab belongs to (NULL = global dashboard)",
        ),
    )
    op.create_index(
        "idx_dashboard_tabs_module",
        "dashboard_tabs",
        ["entity_id", "target_module"],
    )


def downgrade() -> None:
    op.drop_index("idx_dashboard_tabs_module", table_name="dashboard_tabs")
    op.drop_column("dashboard_tabs", "target_module")
