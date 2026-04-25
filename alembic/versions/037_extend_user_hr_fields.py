"""Extend users table with HR identity, travel, health, and misc fields.

Adds 18 new nullable columns to support complete HR profile:
- Identity: passport_name, gender, nationality, birth_country, birth_date, birth_city
- Travel: contractual_airport, nearest_airport, nearest_station, loyalty_program
- Health: last_medical_check, last_international_medical_check, last_subsidiary_medical_check
- Misc: retirement_date, vantage_number, ppe_clothing_size, ppe_shoe_size, extension_number

Revision ID: 037
Create Date: 2026-03-21
"""
from alembic import op
import sqlalchemy as sa

revision = "037"
down_revision = "036"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # HR Identity
    op.add_column("users", sa.Column("passport_name", sa.String(200), nullable=True))
    op.add_column("users", sa.Column("gender", sa.String(1), nullable=True))
    op.add_column("users", sa.Column("nationality", sa.String(100), nullable=True))
    op.add_column("users", sa.Column("birth_country", sa.String(100), nullable=True))
    op.add_column("users", sa.Column("birth_date", sa.Date(), nullable=True))
    op.add_column("users", sa.Column("birth_city", sa.String(100), nullable=True))

    # Travel
    op.add_column("users", sa.Column("contractual_airport", sa.String(200), nullable=True))
    op.add_column("users", sa.Column("nearest_airport", sa.String(200), nullable=True))
    op.add_column("users", sa.Column("nearest_station", sa.String(200), nullable=True))
    op.add_column("users", sa.Column("loyalty_program", sa.String(200), nullable=True))

    # Health / Medical
    op.add_column("users", sa.Column("last_medical_check", sa.Date(), nullable=True))
    op.add_column("users", sa.Column("last_international_medical_check", sa.Date(), nullable=True))
    op.add_column("users", sa.Column("last_subsidiary_medical_check", sa.Date(), nullable=True))

    # Misc / HR
    op.add_column("users", sa.Column("retirement_date", sa.Date(), nullable=True))
    op.add_column("users", sa.Column("vantage_number", sa.String(50), nullable=True))
    op.add_column("users", sa.Column("ppe_clothing_size", sa.String(20), nullable=True))
    op.add_column("users", sa.Column("ppe_shoe_size", sa.String(20), nullable=True))
    op.add_column("users", sa.Column("extension_number", sa.String(20), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "extension_number")
    op.drop_column("users", "ppe_shoe_size")
    op.drop_column("users", "ppe_clothing_size")
    op.drop_column("users", "vantage_number")
    op.drop_column("users", "retirement_date")
    op.drop_column("users", "last_subsidiary_medical_check")
    op.drop_column("users", "last_international_medical_check")
    op.drop_column("users", "last_medical_check")
    op.drop_column("users", "loyalty_program")
    op.drop_column("users", "nearest_station")
    op.drop_column("users", "nearest_airport")
    op.drop_column("users", "contractual_airport")
    op.drop_column("users", "birth_city")
    op.drop_column("users", "birth_date")
    op.drop_column("users", "birth_country")
    op.drop_column("users", "nationality")
    op.drop_column("users", "gender")
    op.drop_column("users", "passport_name")
