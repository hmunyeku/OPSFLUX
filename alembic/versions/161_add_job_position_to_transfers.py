"""Add new_job_position_id to tier_contact_transfers.

Allows changing employee job position during transfer, which updates
compliance requirements (different HSE certifications per position).

Revision ID: 161_add_job_position_to_transfers
Revises: 160_voyage_stop_pax_cargo_flow
Create Date: 2026-05-11
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision: str = "161_add_job_position_to_transfers"
down_revision: Union[str, None] = "160_voyage_stop_pax_cargo_flow"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "tier_contact_transfers",
        sa.Column("new_job_position_id", UUID(as_uuid=True), sa.ForeignKey("job_positions.id"), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("tier_contact_transfers", "new_job_position_id")
