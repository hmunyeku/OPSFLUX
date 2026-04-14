"""Phones: unique (owner_type, owner_id, number) + de-dupe existing rows.

Revision ID: 128_phones_unique_constraint
Revises: 127_mobile_pairing_and_verifications
Create Date: 2026-04-14

Prevents duplicate phone rows created by retried / parallel POSTs
(audit finding CONC-001). Before adding the constraint we collapse any
existing duplicates so the migration can actually apply on prod.

De-dup strategy: for each (owner_type, owner_id, number) group keep the
oldest row (lowest created_at, then lowest id) and soft-merge verified
state up from the duplicates onto the survivor.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "128_phones_unique_constraint"
down_revision = "127_mobile_pairing_and_verifications"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── 1. Merge verified state from duplicates onto the survivor ──
    #
    # For every (owner_type, owner_id, number) group with >1 rows,
    # the survivor is the oldest (ties broken by lowest id). If ANY
    # duplicate in the group has verified=true, the survivor becomes
    # verified as well (don't lose verification work).
    op.execute(
        """
        UPDATE phones p
        SET verified = true,
            verified_at = COALESCE(p.verified_at, NOW())
        WHERE p.verified = false
          AND EXISTS (
            SELECT 1 FROM phones d
            WHERE d.owner_type = p.owner_type
              AND d.owner_id   = p.owner_id
              AND d.number     = p.number
              AND d.verified   = true
          )
          AND p.id = (
            SELECT id FROM phones q
            WHERE q.owner_type = p.owner_type
              AND q.owner_id   = p.owner_id
              AND q.number     = p.number
            ORDER BY q.created_at ASC, q.id ASC
            LIMIT 1
          )
        """
    )

    # ── 2. Delete the duplicate rows (keep oldest per group) ───────
    op.execute(
        """
        DELETE FROM phones
        WHERE id IN (
            SELECT id FROM (
                SELECT id,
                       ROW_NUMBER() OVER (
                         PARTITION BY owner_type, owner_id, number
                         ORDER BY created_at ASC, id ASC
                       ) AS rn
                FROM phones
            ) ranked
            WHERE rn > 1
        )
        """
    )

    # ── 3. Finally add the unique constraint ───────────────────────
    op.create_unique_constraint(
        "uq_phones_owner_number",
        "phones",
        ["owner_type", "owner_id", "number"],
    )


def downgrade() -> None:
    op.drop_constraint("uq_phones_owner_number", "phones", type_="unique")
