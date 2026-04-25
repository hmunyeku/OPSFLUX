"""Merge divergent heads 095 + 096

Revision ID: 097_merge_heads
Revises: 095_project_debt_cleanup, 096_add_pickup_stop_assignments
Create Date: 2026-04-06
"""

revision = "097_merge_heads"
down_revision = ("095_project_debt_cleanup", "096_add_pickup_stop_assignments")
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
