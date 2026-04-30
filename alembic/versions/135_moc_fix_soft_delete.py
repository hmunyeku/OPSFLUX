"""Fix MOCTrack soft-delete column: archived_at → deleted_at.

Revision ID: 135_moc_fix_soft_delete
Revises: 134_moc_module

The initial MOC migration (134) USED to create `mocs.archived_at`, but
the SoftDeleteMixin in app/models/base.py uses `deleted_at`. This
migration renamed the column on existing prod databases.

134 has since been fixed at the source to create `deleted_at` directly,
so on a **fresh** database this migration must be a no-op — otherwise
alembic crashes with `column "archived_at" does not exist`.

Detect both states with a one-shot information_schema check.
"""

import sqlalchemy as sa
from alembic import op

revision = "135_moc_fix_soft_delete"
down_revision = "134_moc_module"
branch_labels = None
depends_on = None


def _column_exists(table: str, column: str) -> bool:
    bind = op.get_bind()
    return bool(
        bind.execute(
            sa.text(
                "SELECT 1 FROM information_schema.columns "
                "WHERE table_name = :t AND column_name = :c"
            ),
            {"t": table, "c": column},
        ).first()
    )


def upgrade() -> None:
    if _column_exists("mocs", "archived_at"):
        op.alter_column("mocs", "archived_at", new_column_name="deleted_at")
    # else: 134 already created deleted_at — nothing to do.


def downgrade() -> None:
    if _column_exists("mocs", "deleted_at") and not _column_exists("mocs", "archived_at"):
        op.alter_column("mocs", "deleted_at", new_column_name="archived_at")
