"""add travel profile fields to tier contacts

Revision ID: 091_add_travel_profile_fields_to_tier_contacts
Revises: 090_project_wbs_nodes
Create Date: 2026-04-05 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "091_add_travel_profile_fields_to_tier_contacts"
down_revision = "090_project_wbs_nodes"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("tier_contacts", sa.Column("contractual_airport", sa.String(length=200), nullable=True))
    op.add_column("tier_contacts", sa.Column("nearest_airport", sa.String(length=200), nullable=True))
    op.add_column("tier_contacts", sa.Column("nearest_station", sa.String(length=200), nullable=True))


def downgrade() -> None:
    op.drop_column("tier_contacts", "nearest_station")
    op.drop_column("tier_contacts", "nearest_airport")
    op.drop_column("tier_contacts", "contractual_airport")
