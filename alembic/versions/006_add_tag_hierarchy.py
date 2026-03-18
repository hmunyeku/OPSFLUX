"""Add tag hierarchy (parent_id) and search index.

Revision ID: 006_add_tag_hierarchy
Revises: 005_add_email_templates
"""

from alembic import op
import sqlalchemy as sa

revision = "006_add_tag_hierarchy"
down_revision = "005_add_email_templates"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add parent_id column for nesting
    op.add_column(
        "tags",
        sa.Column(
            "parent_id",
            sa.Uuid(),
            sa.ForeignKey("tags.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.create_index("idx_tags_parent_id", "tags", ["parent_id"])

    # Add trigram index for autocomplete search (requires pg_trgm extension)
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")
    op.execute(
        "CREATE INDEX idx_tags_name_trgm ON tags USING gin (name gin_trgm_ops)"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_tags_name_trgm")
    op.drop_index("idx_tags_parent_id", "tags")
    op.drop_column("tags", "parent_id")
