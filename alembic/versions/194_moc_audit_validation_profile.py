"""Allow MOC validation profile for compliance audits.

Revision ID: 194_moc_audit_validation_profile
Revises: 193_compliance_supplier_audits
Create Date: 2026-05-22
"""

from alembic import op


revision = "194_moc_audit_validation_profile"
down_revision = "193_compliance_supplier_audits"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE mocs DROP CONSTRAINT IF EXISTS ck_moc_workflow_profile")
    op.execute(
        "ALTER TABLE mocs ADD CONSTRAINT ck_moc_workflow_profile "
        "CHECK (workflow_profile IN ('process_moc', 'project_change', 'audit_validation'))"
    )


def downgrade() -> None:
    op.execute("ALTER TABLE mocs DROP CONSTRAINT IF EXISTS ck_moc_workflow_profile")
    op.execute(
        "ALTER TABLE mocs ADD CONSTRAINT ck_moc_workflow_profile "
        "CHECK (workflow_profile IN ('process_moc', 'project_change'))"
    )
