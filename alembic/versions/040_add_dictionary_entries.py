"""Add dictionary_entries table for configurable dropdown lists.

Revision ID: 040
Create Date: 2026-03-21
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB

revision = "040"
down_revision = "039"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "dictionary_entries",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("category", sa.String(50), nullable=False),
        sa.Column("code", sa.String(100), nullable=False),
        sa.Column("label", sa.String(200), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("metadata_json", JSONB, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("idx_dictionary_category", "dictionary_entries", ["category"])
    op.create_index("idx_dictionary_unique", "dictionary_entries", ["category", "code"], unique=True)


def downgrade() -> None:
    op.drop_index("idx_dictionary_unique", table_name="dictionary_entries")
    op.drop_index("idx_dictionary_category", table_name="dictionary_entries")
    op.drop_table("dictionary_entries")
