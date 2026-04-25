"""Add verification fields to phones/contact_emails and translations to dictionary_entries.

Revision ID: 048
Revises: 047
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = "048"
down_revision = "047"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Phone verification fields
    op.add_column("phones", sa.Column("verification_code", sa.String(10), nullable=True))
    op.add_column("phones", sa.Column("verification_expires_at", sa.DateTime(timezone=True), nullable=True))

    # ContactEmail verification fields
    op.add_column("contact_emails", sa.Column("verification_token", sa.String(200), nullable=True))
    op.add_column("contact_emails", sa.Column("verification_expires_at", sa.DateTime(timezone=True), nullable=True))

    # Dictionary translations
    op.add_column("dictionary_entries", sa.Column("translations", JSONB, nullable=True))


def downgrade() -> None:
    op.drop_column("dictionary_entries", "translations")
    op.drop_column("contact_emails", "verification_expires_at")
    op.drop_column("contact_emails", "verification_token")
    op.drop_column("phones", "verification_expires_at")
    op.drop_column("phones", "verification_code")
