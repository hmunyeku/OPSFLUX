"""Add attachment content hash for duplicate detection.

Revision ID: 190_attachment_hash_duplicate_guard
Revises: 189_compliance_external_certificate_verification
Create Date: 2026-05-21
"""

from alembic import op
import sqlalchemy as sa


revision = "190_attachment_hash_duplicate_guard"
down_revision = "189_compliance_external_certificate_verification"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("attachments", sa.Column("file_hash_sha256", sa.String(length=64), nullable=True))
    op.create_index(
        "idx_attachments_duplicate_guard",
        "attachments",
        ["entity_id", "owner_type", "owner_id", "uploaded_by", "category", "file_hash_sha256"],
    )


def downgrade() -> None:
    op.drop_index("idx_attachments_duplicate_guard", table_name="attachments")
    op.drop_column("attachments", "file_hash_sha256")

