"""Add external_ref column to projects table for Gouti sync tracking.

Revision ID: 023_add_project_external_ref
Revises: 022_add_pdf_templates
Create Date: 2026-03-19
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "023_add_project_external_ref"
down_revision: Union[str, None] = "022_add_pdf_templates"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("projects", sa.Column("external_ref", sa.String(200), nullable=True))
    op.create_index("idx_projects_external_ref", "projects", ["external_ref"])


def downgrade() -> None:
    op.drop_index("idx_projects_external_ref", table_name="projects")
    op.drop_column("projects", "external_ref")
