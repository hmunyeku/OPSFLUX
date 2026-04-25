"""expand tier profile to match entity

Revision ID: 085_expand_tier_profile_to_match_entity
Revises: 084_link_users_to_tier_contacts
Create Date: 2026-04-04
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "085_expand_tier_profile_to_match_entity"
down_revision = "084_link_users_to_tier_contacts"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("tiers", sa.Column("trade_name", sa.String(length=200), nullable=True))
    op.add_column("tiers", sa.Column("logo_url", sa.String(length=500), nullable=True))
    op.add_column("tiers", sa.Column("fax", sa.String(length=50), nullable=True))
    op.add_column("tiers", sa.Column("registration_number", sa.String(length=100), nullable=True))
    op.add_column("tiers", sa.Column("tax_id", sa.String(length=100), nullable=True))
    op.add_column("tiers", sa.Column("vat_number", sa.String(length=100), nullable=True))
    op.add_column("tiers", sa.Column("fiscal_year_start", sa.Integer(), nullable=False, server_default="1"))
    op.add_column("tiers", sa.Column("founded_date", sa.Date(), nullable=True))
    op.add_column("tiers", sa.Column("address_line1", sa.String(length=300), nullable=True))
    op.add_column("tiers", sa.Column("address_line2", sa.String(length=300), nullable=True))
    op.add_column("tiers", sa.Column("city", sa.String(length=100), nullable=True))
    op.add_column("tiers", sa.Column("state", sa.String(length=100), nullable=True))
    op.add_column("tiers", sa.Column("zip_code", sa.String(length=20), nullable=True))
    op.add_column("tiers", sa.Column("country", sa.String(length=100), nullable=True))
    op.add_column("tiers", sa.Column("timezone", sa.String(length=50), nullable=False, server_default="Africa/Douala"))
    op.add_column("tiers", sa.Column("language", sa.String(length=10), nullable=False, server_default="fr"))
    op.add_column("tiers", sa.Column("social_networks", postgresql.JSONB(astext_type=sa.Text()), nullable=True))
    op.add_column("tiers", sa.Column("opening_hours", postgresql.JSONB(astext_type=sa.Text()), nullable=True))
    op.add_column("tiers", sa.Column("notes", sa.Text(), nullable=True))

    op.execute("UPDATE tiers SET fiscal_year_start = 1 WHERE fiscal_year_start IS NULL")
    op.execute("UPDATE tiers SET timezone = 'Africa/Douala' WHERE timezone IS NULL")
    op.execute("UPDATE tiers SET language = 'fr' WHERE language IS NULL")

    op.alter_column("tiers", "fiscal_year_start", server_default=None)
    op.alter_column("tiers", "timezone", server_default=None)
    op.alter_column("tiers", "language", server_default=None)


def downgrade() -> None:
    op.drop_column("tiers", "notes")
    op.drop_column("tiers", "opening_hours")
    op.drop_column("tiers", "social_networks")
    op.drop_column("tiers", "language")
    op.drop_column("tiers", "timezone")
    op.drop_column("tiers", "country")
    op.drop_column("tiers", "zip_code")
    op.drop_column("tiers", "state")
    op.drop_column("tiers", "city")
    op.drop_column("tiers", "address_line2")
    op.drop_column("tiers", "address_line1")
    op.drop_column("tiers", "founded_date")
    op.drop_column("tiers", "fiscal_year_start")
    op.drop_column("tiers", "vat_number")
    op.drop_column("tiers", "tax_id")
    op.drop_column("tiers", "registration_number")
    op.drop_column("tiers", "fax")
    op.drop_column("tiers", "logo_url")
    op.drop_column("tiers", "trade_name")
