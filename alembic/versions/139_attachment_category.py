"""Attachment — optional category column (typed uploads per owner type).

Revision ID: 139_attachment_category
Revises: 138_moc_types_invited_validators

Adds a free-form `category` column to `attachments`. Values are not
constrained by CHECK because the allowed list is driven by per-module
dictionary categories (e.g. `moc_attachment_type` exposes 'pid_initial',
'pid_modified', 'photo', 'study'). NULL = uncategorised, keeping full
backward compat with existing uploads.
"""

import sqlalchemy as sa
from alembic import op

revision = "139_attachment_category"
down_revision = "138_moc_types_invited_validators"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("attachments", sa.Column("category", sa.String(length=40), nullable=True))
    op.create_index(
        "idx_attachments_category",
        "attachments",
        ["owner_type", "category"],
    )


def downgrade() -> None:
    op.drop_index("idx_attachments_category", table_name="attachments")
    op.drop_column("attachments", "category")
