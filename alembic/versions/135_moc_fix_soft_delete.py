"""Fix MOCTrack soft-delete column: archived_at → deleted_at.

Revision ID: 135_moc_fix_soft_delete
Revises: 134_moc_module

The initial MOC migration (134) created `mocs.archived_at`, but the
SoftDeleteMixin in app/models/base.py uses `deleted_at`. The mismatch
caused every SELECT on the mocs table to fail with:

    UndefinedColumnError: column mocs.deleted_at does not exist

Rename in place to avoid data loss (no existing rows should exist yet —
the column was always NULL — but we keep the safe path).
"""

import sqlalchemy as sa
from alembic import op

revision = "135_moc_fix_soft_delete"
down_revision = "134_moc_module"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column("mocs", "archived_at", new_column_name="deleted_at")


def downgrade() -> None:
    op.alter_column("mocs", "deleted_at", new_column_name="archived_at")
