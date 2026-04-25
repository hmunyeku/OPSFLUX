"""Add currency_rates table for historical exchange rates.

Revision ID: 133_currency_rates
Revises: 132_planner_scenario_reference
Create Date: 2026-04-25

Per-entity historical exchange rates. Conversions are reproducible by
date — `convert(amount, from, to, on_date)` picks the most recent rate
with effective_date ≤ on_date. Stored on the imputations module by
design (financial conversions need historical traceability).
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID


revision = "133_currency_rates"
# Chained after 156 (newer agent_run_attachments_manifest) to keep a single
# linear migration head. Originally branched from 132 in the cranky-wilbur
# branch, but 132 had since been superseded by 133→...→156 on main.
down_revision = "156_agent_run_attachments_manifest"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "currency_rates",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("entity_id", UUID(as_uuid=True), sa.ForeignKey("entities.id", ondelete="CASCADE"), nullable=False),
        sa.Column("from_currency", sa.String(10), nullable=False),
        sa.Column("to_currency", sa.String(10), nullable=False),
        sa.Column("rate", sa.Float, nullable=False),
        sa.Column("effective_date", sa.Date, nullable=False),
        sa.Column("source", sa.String(50)),
        sa.Column("notes", sa.Text),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index(
        "idx_currency_rate_lookup",
        "currency_rates",
        ["entity_id", "from_currency", "to_currency", "effective_date"],
    )
    op.create_index(
        "uq_currency_rate_unique",
        "currency_rates",
        ["entity_id", "from_currency", "to_currency", "effective_date"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index("uq_currency_rate_unique", table_name="currency_rates")
    op.drop_index("idx_currency_rate_lookup", table_name="currency_rates")
    op.drop_table("currency_rates")
