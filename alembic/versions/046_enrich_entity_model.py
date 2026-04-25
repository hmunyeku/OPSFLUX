"""Enrich Entity model with company fields — address, legal, contact, social networks, opening hours, hierarchy.

Inspired by Dolibarr multicompany module. Adds all fields needed for proper
multi-entity ERP management: legal identity, fiscal info, full address,
contact details, social networks, opening hours, parent entity hierarchy.

Revision ID: 046
Revises: 045
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB, UUID

revision = "046"
down_revision = "045"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── Identity ──
    op.add_column("entities", sa.Column("trade_name", sa.String(200), nullable=True))
    op.add_column("entities", sa.Column("logo_url", sa.String(500), nullable=True))
    op.add_column("entities", sa.Column("parent_id", UUID(as_uuid=True), sa.ForeignKey("entities.id"), nullable=True))

    # ── Legal ──
    op.add_column("entities", sa.Column("legal_form", sa.String(100), nullable=True))
    op.add_column("entities", sa.Column("registration_number", sa.String(100), nullable=True))
    op.add_column("entities", sa.Column("tax_id", sa.String(100), nullable=True))
    op.add_column("entities", sa.Column("vat_number", sa.String(100), nullable=True))
    op.add_column("entities", sa.Column("capital", sa.Float, nullable=True))
    op.add_column("entities", sa.Column("currency", sa.String(10), nullable=False, server_default="XAF"))
    op.add_column("entities", sa.Column("fiscal_year_start", sa.Integer, nullable=False, server_default="1"))
    op.add_column("entities", sa.Column("industry", sa.String(200), nullable=True))
    op.add_column("entities", sa.Column("founded_date", sa.Date, nullable=True))

    # ── Address ──
    op.add_column("entities", sa.Column("address_line1", sa.String(300), nullable=True))
    op.add_column("entities", sa.Column("address_line2", sa.String(300), nullable=True))
    op.add_column("entities", sa.Column("city", sa.String(100), nullable=True))
    op.add_column("entities", sa.Column("state", sa.String(100), nullable=True))
    op.add_column("entities", sa.Column("zip_code", sa.String(20), nullable=True))

    # ── Contact ──
    op.add_column("entities", sa.Column("phone", sa.String(50), nullable=True))
    op.add_column("entities", sa.Column("fax", sa.String(50), nullable=True))
    op.add_column("entities", sa.Column("email", sa.String(200), nullable=True))
    op.add_column("entities", sa.Column("website", sa.String(300), nullable=True))

    # ── Config ──
    op.add_column("entities", sa.Column("language", sa.String(10), nullable=False, server_default="fr"))

    # ── Extended (JSONB) ──
    op.add_column("entities", sa.Column("social_networks", JSONB, nullable=True))
    op.add_column("entities", sa.Column("opening_hours", JSONB, nullable=True))
    op.add_column("entities", sa.Column("notes", sa.Text, nullable=True))

    # Index for parent hierarchy queries
    op.create_index("ix_entities_parent_id", "entities", ["parent_id"])


def downgrade() -> None:
    op.drop_index("ix_entities_parent_id", table_name="entities")
    for col in [
        "trade_name", "logo_url", "parent_id",
        "legal_form", "registration_number", "tax_id", "vat_number",
        "capital", "currency", "fiscal_year_start", "industry", "founded_date",
        "address_line1", "address_line2", "city", "state", "zip_code",
        "phone", "fax", "email", "website",
        "language",
        "social_networks", "opening_hours", "notes",
    ]:
        op.drop_column("entities", col)
