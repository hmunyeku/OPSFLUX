"""Mobile QR pairing tokens and user verification audit trail.

Two tables:
  - mobile_pairing_tokens: short-lived tokens the web generates so the
    mobile can scan a QR and log in without typing credentials
    (WhatsApp-Web pattern). The token is stored as SHA-256 hash only.
  - user_verifications: append-only audit of attribute verifications
    (phone, email, location, id_document, biometric) — carries the
    evidence and trust level of each verification event.

Revision ID: 127
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


revision = "127_mobile_pairing_and_verifications"
down_revision = "126_i18n_catalog"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── mobile_pairing_tokens ─────────────────────────────────────────
    op.create_table(
        "mobile_pairing_tokens",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("token_hash", sa.String(64), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("entity_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("entities.id"), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_ip", sa.String(45), nullable=True),
        sa.Column("created_user_agent", sa.String(500), nullable=True),
        sa.Column("consumed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("consumed_ip", sa.String(45), nullable=True),
        sa.Column("consumed_device_info", postgresql.JSONB, nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="pending"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index("ix_mobile_pairing_token_hash", "mobile_pairing_tokens", ["token_hash"], unique=True)
    op.create_index("ix_mobile_pairing_user_status", "mobile_pairing_tokens", ["user_id", "status"])

    # ── user_verifications ────────────────────────────────────────────
    op.create_table(
        "user_verifications",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("type", sa.String(30), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="pending"),
        sa.Column("method", sa.String(30), nullable=False),
        sa.Column("evidence", postgresql.JSONB, nullable=True),
        sa.Column("verified_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("verified_by_user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("rejection_reason", sa.String(500), nullable=True),
        sa.Column("target_phone_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("target_email_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index("ix_user_verification_user_type", "user_verifications", ["user_id", "type"])
    op.create_index("ix_user_verification_status", "user_verifications", ["status"])


def downgrade() -> None:
    op.drop_index("ix_user_verification_status", table_name="user_verifications")
    op.drop_index("ix_user_verification_user_type", table_name="user_verifications")
    op.drop_table("user_verifications")

    op.drop_index("ix_mobile_pairing_user_status", table_name="mobile_pairing_tokens")
    op.drop_index("ix_mobile_pairing_token_hash", table_name="mobile_pairing_tokens")
    op.drop_table("mobile_pairing_tokens")
