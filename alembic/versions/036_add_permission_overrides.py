"""Add group_permission_overrides and user_permission_overrides tables.

Implements the 3-layer RBAC model:
  Layer 1 (lowest):  Group permission overrides
  Layer 2 (middle):  Role permissions (existing)
  Layer 3 (highest): User permission overrides

Revision ID: 036
Create Date: 2026-03-21
"""
from alembic import op
import sqlalchemy as sa

revision = "036"
down_revision = "035"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # -- group_permission_overrides --
    op.create_table(
        "group_permission_overrides",
        sa.Column("group_id", sa.dialects.postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("user_groups.id", ondelete="CASCADE"),
                  primary_key=True),
        sa.Column("permission_code", sa.String(100),
                  sa.ForeignKey("permissions.code"),
                  primary_key=True),
        sa.Column("granted", sa.Boolean(), nullable=False),
    )

    # -- user_permission_overrides --
    op.create_table(
        "user_permission_overrides",
        sa.Column("user_id", sa.dialects.postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("users.id", ondelete="CASCADE"),
                  primary_key=True),
        sa.Column("permission_code", sa.String(100),
                  sa.ForeignKey("permissions.code"),
                  primary_key=True),
        sa.Column("granted", sa.Boolean(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("user_permission_overrides")
    op.drop_table("group_permission_overrides")
