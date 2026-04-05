"""add ads creator identity for initiator review

Revision ID: 086_ads_creator_and_initiator_review
Revises: 085_expand_tier_profile_to_match_entity
Create Date: 2026-04-05
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "086_ads_creator_and_initiator_review"
down_revision = "085_expand_tier_profile_to_match_entity"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("ads", sa.Column("created_by", postgresql.UUID(as_uuid=True), nullable=True))
    op.execute("UPDATE ads SET created_by = requester_id WHERE created_by IS NULL")
    op.alter_column("ads", "created_by", nullable=False)
    op.create_foreign_key("fk_ads_created_by_users", "ads", "users", ["created_by"], ["id"])
    op.create_index("idx_ads_created_by", "ads", ["created_by"], unique=False)


def downgrade() -> None:
    op.drop_index("idx_ads_created_by", table_name="ads")
    op.drop_constraint("fk_ads_created_by_users", "ads", type_="foreignkey")
    op.drop_column("ads", "created_by")
