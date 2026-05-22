"""Add subject scope to compliance rules.

Revision ID: 192_compliance_rule_subject_scope
Revises: 191_compliance_authorized_center_accreditation
Create Date: 2026-05-22
"""

from alembic import op
import sqlalchemy as sa


revision = "192_compliance_rule_subject_scope"
down_revision = "191_compliance_authorized_center_accreditation"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "compliance_rules",
        sa.Column("subject_scope", sa.String(length=20), server_default="person", nullable=False),
    )
    op.execute(
        """
        UPDATE compliance_rules
        SET subject_scope = CASE
            WHEN target_type = 'tier_type' THEN 'company'
            WHEN target_type = 'asset' THEN 'asset'
            WHEN target_type = 'packlog_cargo' THEN 'cargo'
            ELSE 'person'
        END
        """
    )
    op.create_index(
        "idx_compliance_rules_subject_scope",
        "compliance_rules",
        ["entity_id", "subject_scope"],
    )


def downgrade() -> None:
    op.drop_index("idx_compliance_rules_subject_scope", table_name="compliance_rules")
    op.drop_column("compliance_rules", "subject_scope")
