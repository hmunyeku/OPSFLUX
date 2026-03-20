"""Add duplicate prevention constraints to pax_profiles.

- Unique constraint: (entity_id, first_name_normalized, last_name_normalized, birth_date)
- Partial unique index: (entity_id, badge_number) WHERE badge_number IS NOT NULL AND archived = false

NOTE: These constraints were already included in 015b_add_paxlog_tables.
This migration is now a no-op.

Revision ID: 021_add_pax_duplicate_constraints
Revises: 020_add_pid_pfd_module
Create Date: 2026-03-18
"""
from typing import Sequence, Union

revision: str = "021_add_pax_duplicate_constraints"
down_revision: Union[str, None] = "020_add_pid_pfd_module"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Constraints already created in 015b_add_paxlog_tables — no-op.
    pass


def downgrade() -> None:
    # No-op.
    pass
