"""Add doc type scope to Papyrus forms.

Revision ID: 120_add_doc_type_scope_to_papyrus_forms
Revises: 119_finalize_packlog_permission_namespace
Create Date: 2026-04-11 11:30:00.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision = "120_add_doc_type_scope_to_papyrus_forms"
down_revision = "119_finalize_packlog_permission_namespace"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "papyrus_forms",
        sa.Column("doc_type_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        "fk_papyrus_forms_doc_type_id",
        "papyrus_forms",
        "doc_types",
        ["doc_type_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(
        "idx_papyrus_forms_doc_type_created",
        "papyrus_forms",
        ["doc_type_id", "created_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("idx_papyrus_forms_doc_type_created", table_name="papyrus_forms")
    op.drop_constraint("fk_papyrus_forms_doc_type_id", "papyrus_forms", type_="foreignkey")
    op.drop_column("papyrus_forms", "doc_type_id")
