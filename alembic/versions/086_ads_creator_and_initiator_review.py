"""add ads creator identity for initiator review

Revision ID: 086_ads_creator_and_initiator_review
Revises: 085_expand_tier_profile_to_match_entity
Create Date: 2026-04-05
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "086_ads_creator_and_initiator_review"
down_revision = "085_expand_tier_profile_to_match_entity"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Idempotent: the column may already exist from an earlier partial
    # apply (model auto-sync) without the NOT NULL / FK / index parts.
    op.execute(
        "ALTER TABLE ads ADD COLUMN IF NOT EXISTS created_by UUID"
    )
    op.execute(
        "UPDATE ads SET created_by = requester_id WHERE created_by IS NULL"
    )
    op.execute(
        "ALTER TABLE ads ALTER COLUMN created_by SET NOT NULL"
    )
    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint WHERE conname = 'fk_ads_created_by_users'
            ) THEN
                ALTER TABLE ads
                ADD CONSTRAINT fk_ads_created_by_users
                FOREIGN KEY (created_by) REFERENCES users(id);
            END IF;
        END $$;
        """
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_ads_created_by ON ads (created_by)"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_ads_created_by")
    op.execute(
        """
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1 FROM pg_constraint WHERE conname = 'fk_ads_created_by_users'
            ) THEN
                ALTER TABLE ads DROP CONSTRAINT fk_ads_created_by_users;
            END IF;
        END $$;
        """
    )
    op.execute("ALTER TABLE ads DROP COLUMN IF EXISTS created_by")
