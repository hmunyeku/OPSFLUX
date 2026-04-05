"""add pax group scope to incidents

Revision ID: 087_pax_incidents_add_pax_group_scope
Revises: 086_ads_creator_and_initiator_review
Create Date: 2026-04-05
"""

from alembic import op


revision = "087_pax_incidents_add_pax_group_scope"
down_revision = "086_ads_creator_and_initiator_review"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE pax_incidents ADD COLUMN IF NOT EXISTS pax_group_id UUID")
    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint WHERE conname = 'fk_pax_incidents_pax_group'
            ) THEN
                ALTER TABLE pax_incidents
                ADD CONSTRAINT fk_pax_incidents_pax_group
                FOREIGN KEY (pax_group_id) REFERENCES pax_groups(id);
            END IF;
        END $$;
        """
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_incidents_pax_group ON pax_incidents (pax_group_id)"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_incidents_pax_group")
    op.execute(
        """
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1 FROM pg_constraint WHERE conname = 'fk_pax_incidents_pax_group'
            ) THEN
                ALTER TABLE pax_incidents DROP CONSTRAINT fk_pax_incidents_pax_group;
            END IF;
        END $$;
        """
    )
    op.execute("ALTER TABLE pax_incidents DROP COLUMN IF EXISTS pax_group_id")
