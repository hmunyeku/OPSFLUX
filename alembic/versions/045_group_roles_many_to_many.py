"""Add group_roles junction table for many-to-many groups↔roles.

Replaces the scalar user_groups.role_code FK with a junction table
so that one group can have multiple roles.

Revision ID: 045
Revises: 044
"""

import sqlalchemy as sa
from alembic import op

revision = "045"
down_revision = "044"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Create junction table
    op.create_table(
        "user_group_roles",
        sa.Column("group_id", sa.UUID(as_uuid=True), sa.ForeignKey("user_groups.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("role_code", sa.String(50), sa.ForeignKey("roles.code", ondelete="CASCADE"), primary_key=True),
    )

    # 2. Migrate existing data: copy current role_code into junction table
    op.execute("""
        INSERT INTO user_group_roles (group_id, role_code)
        SELECT id, role_code FROM user_groups
        WHERE role_code IS NOT NULL
    """)

    # 3. Drop the old FK constraint and column
    # First drop the FK constraint (name varies by DB — use naming convention)
    op.drop_constraint("user_groups_role_code_fkey", "user_groups", type_="foreignkey")
    op.drop_column("user_groups", "role_code")


def downgrade() -> None:
    # 1. Re-add the column
    op.add_column("user_groups", sa.Column("role_code", sa.String(50), nullable=True))

    # 2. Migrate data back: pick first role per group
    op.execute("""
        UPDATE user_groups SET role_code = (
            SELECT role_code FROM user_group_roles
            WHERE user_group_roles.group_id = user_groups.id
            LIMIT 1
        )
    """)

    # 3. Set NOT NULL + FK
    op.alter_column("user_groups", "role_code", nullable=False)
    op.create_foreign_key("user_groups_role_code_fkey", "user_groups", "roles", ["role_code"], ["code"])

    # 4. Drop junction table
    op.drop_table("user_group_roles")
