"""Medical checks polymorphic — rename table, replace user_id with owner_type/owner_id.

Revision ID: 049
Revises: 048
"""
from alembic import op
import sqlalchemy as sa

revision = "049"
down_revision = "048"
branch_labels = None
depends_on = None


def upgrade():
    # Drop old index (actual name from DB: ix_user_medical_checks_user_id)
    op.drop_index("ix_user_medical_checks_user_id", table_name="user_medical_checks")

    # Drop FK constraint (actual name from DB: user_medical_checks_user_id_fkey)
    op.drop_constraint("user_medical_checks_user_id_fkey", "user_medical_checks", type_="foreignkey")

    # Rename table
    op.rename_table("user_medical_checks", "medical_checks")

    # Add owner_type column (non-nullable with default 'user')
    op.add_column("medical_checks", sa.Column("owner_type", sa.String(50), nullable=False, server_default="user"))

    # Rename user_id → owner_id
    op.alter_column("medical_checks", "user_id", new_column_name="owner_id")

    # Remove server default on owner_type (was only for migration)
    op.alter_column("medical_checks", "owner_type", server_default=None)

    # Create new polymorphic index
    op.create_index("idx_medical_checks_owner", "medical_checks", ["owner_type", "owner_id"])


def downgrade():
    op.drop_index("idx_medical_checks_owner", table_name="medical_checks")
    op.alter_column("medical_checks", "owner_id", new_column_name="user_id")
    op.drop_column("medical_checks", "owner_type")
    op.rename_table("medical_checks", "user_medical_checks")
    op.create_foreign_key("user_medical_checks_user_id_fkey", "user_medical_checks", "users", ["user_id"], ["id"])
    op.create_index("ix_user_medical_checks_user_id", "user_medical_checks", ["user_id"])
