"""Add MOC workflow profiles.

Revision ID: 186_moc_workflow_profiles
Revises: 185_polymorphic_moc_context
Create Date: 2026-05-20
"""

from alembic import op


revision = "186_moc_workflow_profiles"
down_revision = "185_polymorphic_moc_context"
branch_labels = None
depends_on = None


PROCESS_STATUSES = (
    "created", "approved", "submitted_to_confirm", "cancelled", "stand_by",
    "approved_to_study", "under_study", "study_in_validation", "validated",
    "execution", "executed_docs_pending", "closed",
)
PROJECT_STATUSES = (
    "draft", "submitted", "in_review", "rejected", "implemented",
)
ALL_STATUSES = PROCESS_STATUSES + PROJECT_STATUSES


def _quoted(values: tuple[str, ...]) -> str:
    return "(" + ", ".join(f"'{value}'" for value in values) + ")"


def upgrade() -> None:
    op.execute("ALTER TABLE mocs ADD COLUMN IF NOT EXISTS workflow_profile VARCHAR(40)")
    op.execute(
        """
        UPDATE mocs
        SET workflow_profile = CASE
            WHEN context_module = 'projets'
              OR context_type IN ('project', 'project_task')
            THEN 'project_change'
            ELSE 'process_moc'
        END
        WHERE workflow_profile IS NULL
        """
    )

    op.execute("ALTER TABLE mocs DROP CONSTRAINT IF EXISTS ck_moc_status")

    # Normalize project-context rows created before profiles existed. They were
    # stored with process MOC statuses even though their business semantics are
    # project changes.
    op.execute(
        """
        UPDATE mocs
        SET status = CASE status
            WHEN 'created' THEN 'draft'
            WHEN 'approved' THEN 'submitted'
            WHEN 'submitted_to_confirm' THEN 'submitted'
            WHEN 'approved_to_study' THEN 'in_review'
            WHEN 'under_study' THEN 'in_review'
            WHEN 'study_in_validation' THEN 'in_review'
            WHEN 'validated' THEN 'approved'
            WHEN 'execution' THEN 'implemented'
            WHEN 'executed_docs_pending' THEN 'implemented'
            ELSE status
        END
        WHERE workflow_profile = 'project_change'
          AND status NOT IN ('draft', 'submitted', 'in_review', 'approved', 'rejected', 'implemented', 'closed')
        """
    )

    op.execute(
        f"ALTER TABLE mocs ADD CONSTRAINT ck_moc_status CHECK (status IN {_quoted(ALL_STATUSES)})"
    )
    op.execute(
        "ALTER TABLE mocs DROP CONSTRAINT IF EXISTS ck_moc_workflow_profile"
    )
    op.execute(
        "ALTER TABLE mocs ADD CONSTRAINT ck_moc_workflow_profile "
        "CHECK (workflow_profile IN ('process_moc', 'project_change'))"
    )
    op.execute(
        "ALTER TABLE mocs ALTER COLUMN workflow_profile SET DEFAULT 'process_moc'"
    )
    op.execute("ALTER TABLE mocs ALTER COLUMN workflow_profile SET NOT NULL")
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_mocs_workflow_profile "
        "ON mocs(entity_id, workflow_profile, status)"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_mocs_workflow_profile")
    op.execute("ALTER TABLE mocs DROP CONSTRAINT IF EXISTS ck_moc_workflow_profile")
    op.execute("ALTER TABLE mocs DROP CONSTRAINT IF EXISTS ck_moc_status")
    op.execute(
        """
        UPDATE mocs
        SET status = CASE status
            WHEN 'draft' THEN 'created'
            WHEN 'submitted' THEN 'approved'
            WHEN 'in_review' THEN 'study_in_validation'
            WHEN 'implemented' THEN 'execution'
            WHEN 'rejected' THEN 'cancelled'
            ELSE status
        END
        WHERE workflow_profile = 'project_change'
        """
    )
    op.execute(
        f"ALTER TABLE mocs ADD CONSTRAINT ck_moc_status CHECK (status IN {_quoted(PROCESS_STATUSES)})"
    )
    op.execute("ALTER TABLE mocs DROP COLUMN IF EXISTS workflow_profile")
