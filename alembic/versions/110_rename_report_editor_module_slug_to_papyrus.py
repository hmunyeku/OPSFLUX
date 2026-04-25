"""rename report editor module slug to papyrus

Revision ID: 110_rename_report_editor_module_slug_to_papyrus
Revises: 109_add_papyrus_forms_and_external_submissions
Create Date: 2026-04-09
"""

from alembic import op


# revision identifiers, used by Alembic.
revision = "110_rename_report_editor_module_slug_to_papyrus"
down_revision = "109_add_papyrus_forms_and_external_submissions"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        UPDATE permissions
        SET module = 'papyrus'
        WHERE module = 'report_editor'
        """
    )
    op.execute(
        """
        UPDATE roles
        SET module = 'papyrus'
        WHERE module = 'report_editor'
        """
    )
    op.execute(
        """
        UPDATE dashboard_tabs
        SET target_module = 'papyrus'
        WHERE target_module = 'report_editor'
        """
    )


def downgrade() -> None:
    op.execute(
        """
        UPDATE permissions
        SET module = 'report_editor'
        WHERE module = 'papyrus'
          AND code IN (
            'document.read',
            'document.create',
            'document.edit',
            'document.delete',
            'document.submit',
            'document.approve',
            'document.reject',
            'document.publish',
            'document.admin',
            'document.share',
            'template.read',
            'template.create',
            'template.edit',
            'template.delete'
          )
        """
    )
    op.execute(
        """
        UPDATE roles
        SET module = 'report_editor'
        WHERE module = 'papyrus'
          AND code IN (
            'DOC_ADMIN',
            'DOC_MANAGER',
            'DOC_REVIEWER',
            'DOC_AUTHOR',
            'DOC_READER'
          )
        """
    )
    op.execute(
        """
        UPDATE dashboard_tabs
        SET target_module = 'report_editor'
        WHERE target_module = 'papyrus'
        """
    )
