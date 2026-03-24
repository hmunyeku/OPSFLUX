"""Add identity_verified fields to users.

When identity_verified=true, identity fields (first_name, last_name, gender,
nationality, birth_country, birth_date, birth_city, passport_name) are locked.
Only users with conformite.verify can modify them.

Revision ID: 060
"""

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID
from alembic import op

revision = "060"
down_revision = "059"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("identity_verified", sa.Boolean(), server_default="false", nullable=False))
    op.add_column("users", sa.Column("identity_verified_by", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True))
    op.add_column("users", sa.Column("identity_verified_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "identity_verified_at")
    op.drop_column("users", "identity_verified_by")
    op.drop_column("users", "identity_verified")
