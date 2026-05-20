"""Add polymorphic MOC context.

Revision ID: 185_polymorphic_moc_context
Revises: 184_project_change_management
Create Date: 2026-05-20
"""

from alembic import op


revision = "185_polymorphic_moc_context"
down_revision = "184_project_change_management"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE mocs ADD COLUMN IF NOT EXISTS context_type VARCHAR(60)")
    op.execute("ALTER TABLE mocs ADD COLUMN IF NOT EXISTS context_id UUID")
    op.execute("ALTER TABLE mocs ADD COLUMN IF NOT EXISTS context_module VARCHAR(80)")
    op.execute("ALTER TABLE mocs ADD COLUMN IF NOT EXISTS context_payload JSONB")
    op.execute("CREATE INDEX IF NOT EXISTS idx_mocs_context ON mocs(entity_id, context_type, context_id)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_mocs_context_module ON mocs(entity_id, context_module)")
    op.execute("ALTER TABLE project_changes ADD COLUMN IF NOT EXISTS moc_id UUID REFERENCES mocs(id) ON DELETE SET NULL")
    op.execute("CREATE INDEX IF NOT EXISTS idx_project_changes_moc ON project_changes(moc_id)")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_project_changes_moc")
    op.execute("ALTER TABLE project_changes DROP COLUMN IF EXISTS moc_id")
    op.execute("DROP INDEX IF EXISTS idx_mocs_context_module")
    op.execute("DROP INDEX IF EXISTS idx_mocs_context")
    op.execute("ALTER TABLE mocs DROP COLUMN IF EXISTS context_payload")
    op.execute("ALTER TABLE mocs DROP COLUMN IF EXISTS context_module")
    op.execute("ALTER TABLE mocs DROP COLUMN IF EXISTS context_id")
    op.execute("ALTER TABLE mocs DROP COLUMN IF EXISTS context_type")
