"""link users to tier contacts

Revision ID: 084_link_users_to_tier_contacts
Revises: 083_external_access_link_sessions
Create Date: 2026-04-04
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision = "084_link_users_to_tier_contacts"
down_revision = "083_external_access_link_sessions"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("tier_contact_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.create_foreign_key(
        "fk_users_tier_contact_id_tier_contacts",
        "users",
        "tier_contacts",
        ["tier_contact_id"],
        ["id"],
    )
    op.create_index("ix_users_tier_contact_id", "users", ["tier_contact_id"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_users_tier_contact_id", table_name="users")
    op.drop_constraint("fk_users_tier_contact_id_tier_contacts", "users", type_="foreignkey")
    op.drop_column("users", "tier_contact_id")
