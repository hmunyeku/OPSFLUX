"""Add job_positions and tier_contact_transfers tables.

job_positions: referentiel des fiches de poste (HSE requirements per position).
tier_contact_transfers: log of employee transfers between tiers.

Revision ID: 013_add_job_positions_transfers
Revises: 012_add_conformite_projets
Create Date: 2026-03-18
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision: str = "013_add_job_positions_transfers"
down_revision: Union[str, None] = "012_add_conformite_projets"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── job_positions ─────────────────────────────────────────────
    op.create_table(
        "job_positions",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("entity_id", UUID(as_uuid=True), sa.ForeignKey("entities.id"), nullable=False),
        sa.Column("code", sa.String(50), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("department", sa.String(100), nullable=True),
        sa.Column("active", sa.Boolean, nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("idx_job_positions_entity", "job_positions", ["entity_id"])
    op.create_index("idx_job_positions_code", "job_positions", ["code"])

    # ── tier_contact_transfers ────────────────────────────────────
    op.create_table(
        "tier_contact_transfers",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("contact_id", UUID(as_uuid=True), sa.ForeignKey("tier_contacts.id"), nullable=False),
        sa.Column("from_tier_id", UUID(as_uuid=True), sa.ForeignKey("tiers.id"), nullable=False),
        sa.Column("to_tier_id", UUID(as_uuid=True), sa.ForeignKey("tiers.id"), nullable=False),
        sa.Column("transfer_date", sa.DateTime(timezone=True), nullable=False),
        sa.Column("reason", sa.Text, nullable=True),
        sa.Column("transferred_by", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("idx_tc_transfers_contact", "tier_contact_transfers", ["contact_id"])
    op.create_index("idx_tc_transfers_from", "tier_contact_transfers", ["from_tier_id"])
    op.create_index("idx_tc_transfers_to", "tier_contact_transfers", ["to_tier_id"])


def downgrade() -> None:
    op.drop_index("idx_tc_transfers_to", table_name="tier_contact_transfers")
    op.drop_index("idx_tc_transfers_from", table_name="tier_contact_transfers")
    op.drop_index("idx_tc_transfers_contact", table_name="tier_contact_transfers")
    op.drop_table("tier_contact_transfers")

    op.drop_index("idx_job_positions_code", table_name="job_positions")
    op.drop_index("idx_job_positions_entity", table_name="job_positions")
    op.drop_table("job_positions")
