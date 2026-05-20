"""Seed project scope change attachment type.

Revision ID: 187_project_scope_change_attachment_type
Revises: 186_moc_workflow_profiles
Create Date: 2026-05-20
"""

from alembic import op


revision = "187_project_scope_change_attachment_type"
down_revision = "186_moc_workflow_profiles"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        INSERT INTO public.dictionary_entries
          (category, code, label, sort_order, active, translations)
        VALUES
          ('project_attachment_type', 'scope_change', 'Changement de scope', 9, true, '{"en": "Scope change"}'::jsonb)
        ON CONFLICT (category, code) DO UPDATE
        SET label = EXCLUDED.label,
            sort_order = EXCLUDED.sort_order,
            active = true,
            translations = COALESCE(public.dictionary_entries.translations, EXCLUDED.translations);
        """
    )


def downgrade() -> None:
    op.execute(
        """
        DELETE FROM public.dictionary_entries
        WHERE category = 'project_attachment_type'
          AND code = 'scope_change';
        """
    )
