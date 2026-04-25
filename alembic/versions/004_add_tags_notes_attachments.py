"""Add polymorphic tags, notes and attachments tables.

Revision ID: 004_add_tags_notes_attachments
Revises: 003_polymorphic_addresses
Create Date: 2026-03-16
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "004_add_tags_notes_attachments"
down_revision = "003_polymorphic_addresses"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── Tags table ───────────────────────────────────────
    op.create_table(
        "tags",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("owner_type", sa.String(50), nullable=False),
        sa.Column("owner_id", UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("color", sa.String(20), nullable=False, server_default="#6b7280"),
        sa.Column("visibility", sa.String(10), nullable=False, server_default="public"),
        sa.Column("created_by", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("idx_tags_owner", "tags", ["owner_type", "owner_id"])
    op.create_index("idx_tags_created_by", "tags", ["created_by"])

    # ── Notes table ──────────────────────────────────────
    op.create_table(
        "notes",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("owner_type", sa.String(50), nullable=False),
        sa.Column("owner_id", UUID(as_uuid=True), nullable=False),
        sa.Column("content", sa.Text, nullable=False),
        sa.Column("visibility", sa.String(10), nullable=False, server_default="public"),
        sa.Column("pinned", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("created_by", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("idx_notes_owner", "notes", ["owner_type", "owner_id"])
    op.create_index("idx_notes_created_by", "notes", ["created_by"])

    # ── Attachments table ────────────────────────────────
    op.create_table(
        "attachments",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("owner_type", sa.String(50), nullable=False),
        sa.Column("owner_id", UUID(as_uuid=True), nullable=False),
        sa.Column("filename", sa.String(255), nullable=False),
        sa.Column("original_name", sa.String(255), nullable=False),
        sa.Column("content_type", sa.String(100), nullable=False),
        sa.Column("size_bytes", sa.Integer, nullable=False),
        sa.Column("storage_path", sa.String(500), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("uploaded_by", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("idx_attachments_owner", "attachments", ["owner_type", "owner_id"])


def downgrade() -> None:
    op.drop_table("attachments")
    op.drop_table("notes")
    op.drop_table("tags")
