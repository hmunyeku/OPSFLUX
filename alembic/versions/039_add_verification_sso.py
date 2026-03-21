"""Add verification fields to phones/contact_emails and user_sso_providers table.

Revision ID: 039
Create Date: 2026-03-21
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "039"
down_revision = "038"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Create user_sso_providers table
    op.create_table(
        "user_sso_providers",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("provider", sa.String(50), nullable=False),
        sa.Column("sso_subject", sa.String(255), nullable=False),
        sa.Column("email", sa.String(255), nullable=True),
        sa.Column("display_name", sa.String(200), nullable=True),
        sa.Column("linked_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("idx_user_sso_providers_user", "user_sso_providers", ["user_id"])
    op.create_index("idx_user_sso_providers_unique", "user_sso_providers", ["user_id", "provider"], unique=True)

    # 2. Add verified columns to phones
    op.add_column("phones", sa.Column("verified", sa.Boolean(), nullable=False, server_default=sa.text("false")))
    op.add_column("phones", sa.Column("verified_at", sa.DateTime(timezone=True), nullable=True))

    # 3. Add verified columns to contact_emails
    op.add_column("contact_emails", sa.Column("verified", sa.Boolean(), nullable=False, server_default=sa.text("false")))
    op.add_column("contact_emails", sa.Column("verified_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    # Remove verified columns from contact_emails
    op.drop_column("contact_emails", "verified_at")
    op.drop_column("contact_emails", "verified")

    # Remove verified columns from phones
    op.drop_column("phones", "verified_at")
    op.drop_column("phones", "verified")

    # Drop user_sso_providers table
    op.drop_index("idx_user_sso_providers_unique", table_name="user_sso_providers")
    op.drop_index("idx_user_sso_providers_user", table_name="user_sso_providers")
    op.drop_table("user_sso_providers")
