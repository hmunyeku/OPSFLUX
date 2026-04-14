"""i18n server-driven catalog.

Creates three tables:
  - i18n_languages:       available languages (code PK)
  - i18n_messages:        (key, language_code) -> value
  - i18n_catalog_meta:    per-language catalog hash for cache-busting

The i18n system is namespaced so the same `key` can live under different
scopes (e.g. "mobile" vs "backoffice") without colliding. The default
namespace is `mobile`.

Seeds the four baseline languages FR / EN / ES / PT so the system has
something to serve immediately. Actual message rows are seeded by a
separate data script (see scripts/seed_i18n.py).

Revision ID: 126
"""

import sqlalchemy as sa
from alembic import op


revision = "126_i18n_catalog"
down_revision = "125_planner_scenarios"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── i18n_languages ────────────────────────────────────────────────
    op.create_table(
        "i18n_languages",
        sa.Column("code", sa.String(10), primary_key=True),
        sa.Column("label", sa.String(100), nullable=False),
        sa.Column("english_label", sa.String(100), nullable=False),
        sa.Column("active", sa.Boolean, nullable=False, server_default=sa.text("true")),
        sa.Column("rtl", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column("sort_order", sa.Integer, nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )

    # ── i18n_messages ─────────────────────────────────────────────────
    op.create_table(
        "i18n_messages",
        sa.Column("id", sa.dialects.postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("key", sa.String(255), nullable=False),
        sa.Column("language_code", sa.String(10), sa.ForeignKey("i18n_languages.code", ondelete="CASCADE"), nullable=False),
        sa.Column("namespace", sa.String(50), nullable=False, server_default="mobile"),
        sa.Column("value", sa.Text, nullable=False),
        sa.Column("notes", sa.Text, nullable=True),
        sa.Column("updated_by", sa.dialects.postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index("uq_i18n_message", "i18n_messages", ["key", "language_code"], unique=True)
    op.create_index("ix_i18n_message_namespace_lang", "i18n_messages", ["namespace", "language_code"])

    # ── i18n_catalog_meta ─────────────────────────────────────────────
    op.create_table(
        "i18n_catalog_meta",
        sa.Column("language_code", sa.String(10), sa.ForeignKey("i18n_languages.code", ondelete="CASCADE"), primary_key=True),
        sa.Column("namespace", sa.String(50), primary_key=True, server_default="mobile"),
        sa.Column("hash", sa.String(64), nullable=False),
        sa.Column("message_count", sa.Integer, nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )

    # ── Seed baseline languages ────────────────────────────────────────
    op.execute(
        """
        INSERT INTO i18n_languages (code, label, english_label, active, rtl, sort_order) VALUES
            ('fr', 'Français', 'French', true, false, 10),
            ('en', 'English', 'English', true, false, 20),
            ('es', 'Español', 'Spanish', true, false, 30),
            ('pt', 'Português', 'Portuguese', true, false, 40);
        """
    )


def downgrade() -> None:
    op.drop_index("ix_i18n_message_namespace_lang", table_name="i18n_messages")
    op.drop_index("uq_i18n_message", table_name="i18n_messages")
    op.drop_table("i18n_catalog_meta")
    op.drop_table("i18n_messages")
    op.drop_table("i18n_languages")
