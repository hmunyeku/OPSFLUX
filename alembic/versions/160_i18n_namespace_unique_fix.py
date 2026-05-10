"""Fix i18n_messages unique index to include namespace.

The original `uq_i18n_message` index was created on
`(key, language_code)` only, but the table has always had a `namespace`
column intended to let the same key live under different scopes
(e.g. `common.cancel` under both `mobile` and `app`). The missing
`namespace` column meant:

  - The unique constraint silently prevented cross-namespace cohabitation.
  - The admin upsert routes used `ON CONFLICT (key, language_code)`,
    which matched any row with the same (key, language_code) regardless
    of namespace and updated it — corrupting cross-namespace data.

This migration drops the buggy index and recreates it with `namespace`
included. The recreate cannot fail on existing data: the old constraint
already guaranteed unicity on the (key, language_code) pair, which is
strictly stronger than the new (key, language_code, namespace) triple.

Companion code change (same commit):
  - app/models/common.py: I18nMessage.__table_args__ updated.
  - app/api/routes/core/i18n.py: both upsert sites updated to
    `index_elements=["key", "language_code", "namespace"]`.
"""

from alembic import op


revision = "160_i18n_namespace_unique_fix"
down_revision = "159_transport_vector_deck_plan"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_index("uq_i18n_message", table_name="i18n_messages")
    op.create_index(
        "uq_i18n_message",
        "i18n_messages",
        ["key", "language_code", "namespace"],
        unique=True,
    )


def downgrade() -> None:
    # Reverting only succeeds if no two rows share (key, language_code)
    # with different namespaces. Once the new index has been live and
    # used, downgrading WILL fail on real data — that is the intended
    # safeguard, not a bug.
    op.drop_index("uq_i18n_message", table_name="i18n_messages")
    op.create_index(
        "uq_i18n_message",
        "i18n_messages",
        ["key", "language_code"],
        unique=True,
    )
