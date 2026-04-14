"""Schema drift cleanup: columns the model expects but the DB doesn't have.

Revision ID: 129_schema_drift_travelwiz
Revises: 128_phones_unique_constraint
Create Date: 2026-04-14

During the audit a brand-new voyage triggered two 500s that traced
back to **missing columns** on production — the model was updated but
no migration propagated the change:

* ``manifest_passengers`` — SQLAlchemy model uses ``TimestampMixin``
  but migration 016 created the table without ``created_at`` /
  ``updated_at``. Migration 033's ``TABLES_NEED_BOTH`` forgot to
  include it. Error surfaces on any SELECT that projects all columns
  (list_manifests, pax-manifest PDF).

* ``vector_positions`` — model has ``heading`` (Float nullable) and
  ``payload`` (JSONB nullable); migration 016 created neither and no
  later migration added them. The OsmAnd endpoint raised
  ``ProgrammingError: UndefinedColumnError`` as soon as a position
  with heading or battery payload was stored.

* ``voyage_manifests`` — model has ``TimestampMixin`` (both
  created_at + updated_at). Migration 016 created ``created_at``
  only. Migration 033 added ``updated_at`` via
  ``TABLES_NEED_UPDATED_AT`` for voyage-related tables but missed
  ``voyage_manifests`` specifically. Double-check and add if
  missing.

Each ADD is idempotent via an information_schema lookup so the
migration can be re-run safely if partially applied.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "129_schema_drift_travelwiz"
down_revision = "128_phones_unique_constraint"
branch_labels = None
depends_on = None


def _has_column(table: str, column: str) -> bool:
    result = op.get_bind().execute(
        sa.text(
            "SELECT 1 FROM information_schema.columns "
            "WHERE table_name = :t AND column_name = :c"
        ),
        {"t": table, "c": column},
    )
    return result.fetchone() is not None


def upgrade() -> None:
    # ── manifest_passengers: +created_at, +updated_at ──
    if not _has_column("manifest_passengers", "created_at"):
        op.add_column(
            "manifest_passengers",
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                nullable=False,
                server_default=sa.func.now(),
            ),
        )
    if not _has_column("manifest_passengers", "updated_at"):
        op.add_column(
            "manifest_passengers",
            sa.Column(
                "updated_at",
                sa.DateTime(timezone=True),
                nullable=False,
                server_default=sa.func.now(),
            ),
        )

    # ── vector_positions: +heading, +payload ──
    if not _has_column("vector_positions", "heading"):
        op.add_column(
            "vector_positions",
            sa.Column("heading", sa.Float, nullable=True),
        )
    if not _has_column("vector_positions", "payload"):
        op.add_column(
            "vector_positions",
            sa.Column(
                "payload",
                sa.dialects.postgresql.JSONB,
                nullable=True,
            ),
        )

    # ── voyage_manifests: ensure updated_at ──
    if not _has_column("voyage_manifests", "updated_at"):
        op.add_column(
            "voyage_manifests",
            sa.Column(
                "updated_at",
                sa.DateTime(timezone=True),
                nullable=False,
                server_default=sa.func.now(),
            ),
        )


def downgrade() -> None:
    # Dropping these would re-break the app — keep as no-op.
    pass
