"""Rename departments to business_units + add manager_id, description, user.business_unit_id.

Revision ID: 062
"""

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID
from alembic import op

revision = "062"
down_revision = "061"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Rename table
    op.rename_table("departments", "business_units")

    # Rename index
    op.execute("ALTER INDEX IF EXISTS uq_department_entity_code RENAME TO uq_business_unit_entity_code")

    # Add new columns to business_units
    op.add_column("business_units", sa.Column("description", sa.Text(), nullable=True))
    op.add_column("business_units", sa.Column("manager_id", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True))

    # Add business_unit_id to users
    op.add_column("users", sa.Column("business_unit_id", UUID(as_uuid=True), sa.ForeignKey("business_units.id"), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "business_unit_id")
    op.drop_column("business_units", "manager_id")
    op.drop_column("business_units", "description")
    op.execute("ALTER INDEX IF EXISTS uq_business_unit_entity_code RENAME TO uq_department_entity_code")
    op.rename_table("business_units", "departments")
