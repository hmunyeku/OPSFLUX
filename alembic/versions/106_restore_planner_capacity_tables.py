"""Restore planner capacity + recurrence tables after assets->AR migration.

Revision ID: 106_restore_planner_capacity_tables
Revises: 105_add_pob_capacity_to_fields
Create Date: 2026-04-08
"""

from alembic import op


revision = "106_restore_planner_capacity_tables"
down_revision = "105_add_pob_capacity_to_fields"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS asset_capacities (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            entity_id UUID NOT NULL REFERENCES entities(id),
            asset_id UUID NOT NULL REFERENCES ar_installations(id),
            max_pax_total SMALLINT NOT NULL,
            permanent_ops_quota SMALLINT NOT NULL DEFAULT 0,
            max_pax_per_company JSONB DEFAULT '{}'::jsonb,
            effective_date DATE NOT NULL DEFAULT CURRENT_DATE,
            reason TEXT NOT NULL,
            changed_by UUID NOT NULL REFERENCES users(id),
            created_at TIMESTAMPTZ DEFAULT now()
        )
        """
    )
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_asset_cap_asset
        ON asset_capacities (asset_id, effective_date DESC)
        """
    )
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_asset_cap_entity
        ON asset_capacities (entity_id)
        """
    )

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS activity_recurrence_rules (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            activity_id UUID NOT NULL REFERENCES planner_activities(id) ON DELETE CASCADE,
            frequency VARCHAR(20) NOT NULL,
            interval_value SMALLINT NOT NULL DEFAULT 1,
            day_of_week SMALLINT,
            day_of_month SMALLINT,
            end_date DATE,
            last_generated_at TIMESTAMPTZ,
            active BOOLEAN DEFAULT true,
            created_at TIMESTAMPTZ DEFAULT now()
        )
        """
    )
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_recurrence_activity
        ON activity_recurrence_rules (activity_id)
        """
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_recurrence_activity")
    op.execute("DROP TABLE IF EXISTS activity_recurrence_rules")
    op.execute("DROP INDEX IF EXISTS idx_asset_cap_entity")
    op.execute("DROP INDEX IF EXISTS idx_asset_cap_asset")
    op.execute("DROP TABLE IF EXISTS asset_capacities")
