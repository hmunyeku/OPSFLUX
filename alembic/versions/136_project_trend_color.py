"""Add trend + color to projects.

Revision ID: 136_project_trend_color
Revises: 135_project_task_allocations
Create Date: 2026-04-25

Two new columns on projects:
  - trend  String(10) NOT NULL DEFAULT 'flat' — qualitative project
    trend (up / flat / down) tracked by the project manager.
  - color  String(9) NULLABLE — hex color used to visually
    differentiate the project in lists, Kanban, Gantt.
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "136_project_trend_color"
down_revision = "135_project_task_allocations"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "projects",
        sa.Column("trend", sa.String(length=10), nullable=False, server_default="flat"),
    )
    op.add_column(
        "projects",
        sa.Column("color", sa.String(length=9), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("projects", "color")
    op.drop_column("projects", "trend")
