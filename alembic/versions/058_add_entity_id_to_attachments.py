"""Add entity_id to attachments for multi-tenant scoping.

Allows each attachment to be scoped to an entity, enabling
multi-tenant filtering on file attachments.

Revision ID: 058
"""

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID
from alembic import op

revision = "058"
down_revision = "057"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "attachments",
        sa.Column("entity_id", UUID(as_uuid=True), sa.ForeignKey("entities.id"), nullable=True),
    )
    op.create_index("idx_attachments_entity", "attachments", ["entity_id"])


def downgrade() -> None:
    op.drop_index("idx_attachments_entity", table_name="attachments")
    op.drop_column("attachments", "entity_id")
