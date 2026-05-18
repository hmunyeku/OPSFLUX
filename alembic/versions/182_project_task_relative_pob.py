"""Add relative POB planning fields to project tasks.

Revision ID: 182_project_task_relative_pob
Revises: 181_rbac_pdf_role_detail_action_fix
Create Date: 2026-05-18
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "182_project_task_relative_pob"
down_revision = "181_rbac_pdf_role_detail_action_fix"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "project_tasks",
        sa.Column(
            "pob_quota_mode",
            sa.String(length=10),
            nullable=False,
            server_default="constant",
            comment="'constant' = single pob_quota; 'variable' = relative per-day values in pob_quota_daily",
        ),
    )
    op.add_column(
        "project_tasks",
        sa.Column(
            "pob_quota_daily",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=True,
            comment="Relative per-day POB quota: {'J1': 5, 'J2': 8, ...}. Converted to absolute dates when sent to Planner.",
        ),
    )
    op.create_check_constraint(
        "ck_project_tasks_pob_quota_mode",
        "project_tasks",
        "pob_quota_mode IN ('constant','variable')",
    )


def downgrade():
    op.drop_constraint("ck_project_tasks_pob_quota_mode", "project_tasks", type_="check")
    op.drop_column("project_tasks", "pob_quota_daily")
    op.drop_column("project_tasks", "pob_quota_mode")
