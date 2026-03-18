"""Enrich tiers and tier_contacts; add tier_identifiers table.

Tier: add alias, website, legal_form, capital, currency, industry,
payment_terms, description.

TierContact: add civility, department. Add index on tier_id.

TierIdentifier: new table for multiple legal/fiscal IDs per company
(SIRET, RCCM, NIU, TVA intracommunautaire, NIF, etc.)

Revision ID: 011_enrich_tiers_contacts
Revises: 010_workflow_hardening
Create Date: 2026-03-17
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision: str = "011_enrich_tiers_contacts"
down_revision: Union[str, None] = "010_workflow_hardening"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── Tier: new columns ─────────────────────────────────────────
    op.add_column("tiers", sa.Column("alias", sa.String(200), nullable=True))
    op.add_column("tiers", sa.Column("website", sa.String(500), nullable=True))
    op.add_column("tiers", sa.Column("legal_form", sa.String(100), nullable=True))
    op.add_column("tiers", sa.Column("capital", sa.Float, nullable=True))
    op.add_column("tiers", sa.Column("currency", sa.String(10), nullable=False, server_default="XAF"))
    op.add_column("tiers", sa.Column("industry", sa.String(100), nullable=True))
    op.add_column("tiers", sa.Column("payment_terms", sa.String(100), nullable=True))
    op.add_column("tiers", sa.Column("description", sa.Text, nullable=True))

    # ── TierContact: new columns + index ──────────────────────────
    op.add_column("tier_contacts", sa.Column("civility", sa.String(20), nullable=True))
    op.add_column("tier_contacts", sa.Column("department", sa.String(100), nullable=True))
    op.create_index("idx_tier_contacts_tier", "tier_contacts", ["tier_id"])

    # ── TierIdentifier: new table ─────────────────────────────────
    op.create_table(
        "tier_identifiers",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("tier_id", UUID(as_uuid=True), sa.ForeignKey("tiers.id"), nullable=False),
        sa.Column("type", sa.String(50), nullable=False),
        sa.Column("value", sa.String(200), nullable=False),
        sa.Column("country", sa.String(100), nullable=True),
        sa.Column("issued_at", sa.String(20), nullable=True),
        sa.Column("expires_at", sa.String(20), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("idx_tier_identifiers_tier", "tier_identifiers", ["tier_id"])


def downgrade() -> None:
    op.drop_index("idx_tier_identifiers_tier", table_name="tier_identifiers")
    op.drop_table("tier_identifiers")

    op.drop_index("idx_tier_contacts_tier", table_name="tier_contacts")
    op.drop_column("tier_contacts", "department")
    op.drop_column("tier_contacts", "civility")

    op.drop_column("tiers", "description")
    op.drop_column("tiers", "payment_terms")
    op.drop_column("tiers", "industry")
    op.drop_column("tiers", "currency")
    op.drop_column("tiers", "capital")
    op.drop_column("tiers", "legal_form")
    op.drop_column("tiers", "website")
    op.drop_column("tiers", "alias")
