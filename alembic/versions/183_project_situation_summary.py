"""Add summary title to project situations.

Revision ID: 183_project_situation_summary
Revises: 182_project_task_relative_pob
Create Date: 2026-05-19
"""

from alembic import op
import sqlalchemy as sa


revision = "183_project_situation_summary"
down_revision = "182_project_task_relative_pob"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "project_situations",
        sa.Column("situation_summary", sa.String(length=220), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("project_situations", "situation_summary")
