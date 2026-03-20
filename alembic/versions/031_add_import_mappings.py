"""Add import_mappings table for the Excel/CSV import assistant.

Revision ID: 031
Revises: 030
Create Date: 2026-03-19
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB, UUID

# revision identifiers
revision = "031"
down_revision = "030"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "import_mappings",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("entity_id", UUID(as_uuid=True), sa.ForeignKey("entities.id"), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("target_object", sa.String(50), nullable=False),
        sa.Column("column_mapping", JSONB, nullable=False),
        sa.Column("transforms", JSONB, nullable=True),
        sa.Column("file_headers", JSONB, nullable=True),
        sa.Column("file_settings", JSONB, nullable=True),
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("use_count", sa.Integer, nullable=False, server_default="0"),
        sa.Column("created_by", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("archived", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("idx_import_mapping_entity", "import_mappings", ["entity_id"])
    op.create_index("idx_import_mapping_target", "import_mappings", ["entity_id", "target_object"])


def downgrade() -> None:
    op.drop_table("import_mappings")
