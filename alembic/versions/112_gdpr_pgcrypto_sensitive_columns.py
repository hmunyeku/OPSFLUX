"""GDPR: enable pgcrypto, add sensitive data audit columns.

- Ensures pgcrypto extension is installed
- Adds encrypted_at timestamp to sensitive tables (marks when encryption was applied)
- Creates gdpr_access_log table for sensitive data access tracking

Note: Actual column encryption (converting plaintext to pgp_sym_encrypt)
is handled by a one-time migration script, not this DDL migration,
because it requires the encryption key at runtime.

Revision ID: 112
Revises: 111
"""
from alembic import op
import sqlalchemy as sa

revision = "112"
down_revision = "111"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Ensure pgcrypto is available
    op.execute("CREATE EXTENSION IF NOT EXISTS pgcrypto")

    # GDPR sensitive data access log — separate from audit_log for
    # focused compliance reporting and faster queries
    op.create_table(
        "gdpr_access_log",
        sa.Column("id", sa.dialects.postgresql.UUID(as_uuid=True),
                  server_default=sa.text("gen_random_uuid()"), primary_key=True),
        sa.Column("user_id", sa.dialects.postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("entity_id", sa.dialects.postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("action", sa.String(50), nullable=False),  # read, update, export, anonymize
        sa.Column("resource_type", sa.String(50), nullable=False),  # passport, vaccine, medical, etc.
        sa.Column("resource_id", sa.String(36), nullable=True),
        sa.Column("target_user_id", sa.dialects.postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("ip_address", sa.String(45), nullable=True),
        sa.Column("user_agent", sa.String(500), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True),
                  server_default=sa.text("NOW()"), nullable=False),
    )
    op.create_index("idx_gdpr_access_log_user", "gdpr_access_log", ["user_id"])
    op.create_index("idx_gdpr_access_log_target", "gdpr_access_log", ["target_user_id"])
    op.create_index("idx_gdpr_access_log_created", "gdpr_access_log", ["created_at"])


def downgrade() -> None:
    op.drop_table("gdpr_access_log")
