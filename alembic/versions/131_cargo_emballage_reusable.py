"""Cargo emballage (parent-child packages) and reusable package tracking.

Revision ID: 131_cargo_emballage_reusable
Revises: 130_cargo_scan_events
Create Date: 2026-04-15

Adds two concepts:

1. EMBALLAGE (container package):
   A CargoItem can now contain other CargoItems via parent_cargo_id.
   Example: a palette (parent) containing boxes (children), or a caisse
   containing sub-colis. The parent typically has cargo_type='packaging'.
   The hierarchy is single-level for now (no recursive nesting).

2. REUSABLE colis:
   is_reusable marks a colis as a returnable container (e.g. standard
   offshore baskets, skids, DNV containers). These are expected to be
   returned to the sender/base after delivery. The existing `status`
   field already supports return states (return_declared, return_in_transit,
   returned, reintegrated, scrapped) — no extra status columns needed.
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

# revision identifiers, used by Alembic.
revision = "131_cargo_emballage_reusable"
down_revision = "130_cargo_scan_events"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── Emballage: parent_cargo_id ────────────────────────────────
    op.add_column(
        "cargo_items",
        sa.Column(
            "parent_cargo_id",
            UUID(as_uuid=True),
            sa.ForeignKey("cargo_items.id", ondelete="SET NULL"),
            nullable=True,
            comment="If set, this colis is contained inside the parent emballage.",
        ),
    )
    op.create_index(
        "idx_cargo_items_parent_cargo",
        "cargo_items",
        ["parent_cargo_id"],
    )

    # ── Reusable flag ─────────────────────────────────────────────
    op.add_column(
        "cargo_items",
        sa.Column(
            "is_reusable",
            sa.Boolean,
            nullable=False,
            server_default="false",
            comment="Marks a colis as a returnable container (basket, skid, DNV box…).",
        ),
    )

    # ── Expected return date (optional, for reusable colis) ───────
    op.add_column(
        "cargo_items",
        sa.Column(
            "expected_return_date",
            sa.Date,
            nullable=True,
            comment="For reusable colis: date by which the container should be returned.",
        ),
    )


def downgrade() -> None:
    op.drop_index("idx_cargo_items_parent_cargo", table_name="cargo_items")
    op.drop_column("cargo_items", "parent_cargo_id")
    op.drop_column("cargo_items", "is_reusable")
    op.drop_column("cargo_items", "expected_return_date")
