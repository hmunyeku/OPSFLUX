"""AUP §5.2 — password history + max age + UPN-inclusion enforcement.

Revision ID: 144_password_history
Revises: 143_moc_rename_roles

Adds a `password_history` table to track the last N bcrypt hashes per
user. The `change-password` and `reset-password` endpoints now refuse
to recycle any password still in the history. Retention window and
history size are configurable via Setting keys.

Default policy (aligned with AUP §5.2):
  * history size  = 5 previous hashes
  * max age       = 180 days (roughly 6 months)
  * UPN-inclusion = rejected (handled in code, no DB change)
"""

from alembic import op
import sqlalchemy as sa


revision = "144_password_history"
down_revision = "143_moc_rename_roles"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "password_history",
        sa.Column("id", sa.dialects.postgresql.UUID(as_uuid=True), primary_key=True,
                  server_default=sa.text("gen_random_uuid()")),
        sa.Column("user_id", sa.dialects.postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("hashed_password", sa.String(length=255), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True),
                  server_default=sa.func.now(), nullable=False),
    )
    # Looked up by (user_id, created_at DESC) — index covers both filtering
    # on the user and ordering the latest N entries for the history check.
    op.create_index(
        "idx_password_history_user_created",
        "password_history",
        ["user_id", sa.text("created_at DESC")],
    )


def downgrade() -> None:
    op.drop_index("idx_password_history_user_created", table_name="password_history")
    op.drop_table("password_history")
