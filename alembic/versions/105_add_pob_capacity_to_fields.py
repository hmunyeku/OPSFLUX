"""Add pob_capacity to ar_fields + rename pob_max to pob_capacity on ar_installations.

Revision ID: 105
Revises: 104_add_archived_to_cargo_requests
"""
from alembic import op
import sqlalchemy as sa

revision = "105_add_pob_capacity_to_fields"
down_revision = "104_add_archived_to_cargo_requests"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add pob_capacity to fields
    op.add_column(
        "ar_fields",
        sa.Column("pob_capacity", sa.Integer, nullable=True, comment="Capacité POB globale du champ"),
    )
    # Rename pob_max → pob_capacity on installations
    op.alter_column("ar_installations", "pob_max", new_column_name="pob_capacity")


def downgrade() -> None:
    op.alter_column("ar_installations", "pob_capacity", new_column_name="pob_max")
    op.drop_column("ar_fields", "pob_capacity")
