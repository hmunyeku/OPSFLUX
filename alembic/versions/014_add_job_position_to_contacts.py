"""Add job_position_id FK on tier_contacts.

Links employees to their job position (fiche de poste) for
HSE compliance tracking.

Revision ID: 014_add_job_position_to_contacts
Revises: 013_add_job_positions_transfers
Create Date: 2026-03-18
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision: str = "014_add_job_position_to_contacts"
down_revision: Union[str, None] = "013_add_job_positions_transfers"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "tier_contacts",
        sa.Column("job_position_id", UUID(as_uuid=True), sa.ForeignKey("job_positions.id"), nullable=True),
    )
    op.create_index("idx_tier_contacts_job_position", "tier_contacts", ["job_position_id"])


def downgrade() -> None:
    op.drop_index("idx_tier_contacts_job_position", table_name="tier_contacts")
    op.drop_column("tier_contacts", "job_position_id")
