"""Add pob_capacity to ar_fields.

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
    op.add_column(
        "ar_fields",
        sa.Column("pob_capacity", sa.Integer, nullable=True, comment="Capacité POB globale du champ"),
    )


def downgrade() -> None:
    op.drop_column("ar_fields", "pob_capacity")
