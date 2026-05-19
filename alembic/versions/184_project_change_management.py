"""Add project change management.

Revision ID: 184_project_change_management
Revises: 183_project_situation_summary
Create Date: 2026-05-19
"""

from alembic import op


revision = "184_project_change_management"
down_revision = "183_project_situation_summary"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE task_deliverables ADD COLUMN IF NOT EXISTS type_code VARCHAR(100)")
    op.execute("ALTER TABLE project_wbs_nodes ADD COLUMN IF NOT EXISTS type_code VARCHAR(100)")

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS project_changes (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            entity_id UUID NOT NULL REFERENCES entities(id),
            project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            reference VARCHAR(60) NOT NULL,
            title VARCHAR(220) NOT NULL,
            change_type VARCHAR(100) NOT NULL DEFAULT 'other',
            status VARCHAR(30) NOT NULL DEFAULT 'draft',
            priority VARCHAR(20) NOT NULL DEFAULT 'medium',
            source VARCHAR(100),
            requested_by UUID REFERENCES users(id) ON DELETE SET NULL,
            decided_by UUID REFERENCES users(id) ON DELETE SET NULL,
            decided_at TIMESTAMPTZ,
            description TEXT,
            decision_summary TEXT,
            planning_impact_days INTEGER,
            budget_impact_amount DOUBLE PRECISION,
            currency VARCHAR(10),
            affected_task_ids JSONB,
            impact_snapshot JSONB,
            active BOOLEAN NOT NULL DEFAULT true
        )
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS idx_project_changes_project ON project_changes(project_id)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_project_changes_entity_status ON project_changes(entity_id, status)")
    op.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_project_changes_reference ON project_changes(entity_id, reference)")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_project_changes_reference")
    op.execute("DROP INDEX IF EXISTS idx_project_changes_entity_status")
    op.execute("DROP INDEX IF EXISTS idx_project_changes_project")
    op.execute("DROP TABLE IF EXISTS project_changes")
    op.execute("ALTER TABLE project_wbs_nodes DROP COLUMN IF EXISTS type_code")
    op.execute("ALTER TABLE task_deliverables DROP COLUMN IF EXISTS type_code")
