"""add project currency

Revision ID: 118_add_project_currency
Revises: 117_project_task_pob_quota
Create Date: 2026-04-11
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op


revision: str = "118_add_project_currency"
down_revision: str | Sequence[str] | None = "117_project_task_pob_quota"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("projects", sa.Column("currency", sa.String(length=10), nullable=True))
    op.execute("UPDATE projects SET currency = 'XAF' WHERE currency IS NULL")
    op.alter_column("projects", "currency", existing_type=sa.String(length=10), nullable=False)


def downgrade() -> None:
    op.drop_column("projects", "currency")
