"""add otp and session fields to external access links

Revision ID: 083_external_access_link_sessions
Revises: 082_cost_imputation_reference_link
Create Date: 2026-04-04 17:20:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "083_external_access_link_sessions"
down_revision: str | None = "082_cost_imputation_reference_link"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    op = __import__("alembic").op
    op.add_column("external_access_links", sa.Column("otp_code_hash", sa.String(length=128), nullable=True))
    op.add_column("external_access_links", sa.Column("otp_expires_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column(
        "external_access_links",
        sa.Column("otp_attempt_count", sa.SmallInteger(), nullable=False, server_default="0"),
    )
    op.add_column("external_access_links", sa.Column("session_token_hash", sa.String(length=128), nullable=True))
    op.add_column("external_access_links", sa.Column("session_expires_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("external_access_links", sa.Column("last_validated_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op = __import__("alembic").op
    op.drop_column("external_access_links", "last_validated_at")
    op.drop_column("external_access_links", "session_expires_at")
    op.drop_column("external_access_links", "session_token_hash")
    op.drop_column("external_access_links", "otp_attempt_count")
    op.drop_column("external_access_links", "otp_expires_at")
    op.drop_column("external_access_links", "otp_code_hash")
