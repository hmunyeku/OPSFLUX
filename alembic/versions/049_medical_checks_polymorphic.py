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
    # Rename table
    op.rename_table("user_medical_checks", "medical_checks")

    # Add owner_type column (non-nullable with default 'user')
    op.add_column("medical_checks", sa.Column("owner_type", sa.String(50), nullable=False, server_default="user"))

    # Rename user_id → owner_id
    op.alter_column("medical_checks", "user_id", new_column_name="owner_id")

    # Drop the old FK constraint on user_id (now owner_id)
    # The constraint name varies — use batch mode for safety
    with op.batch_alter_table("medical_checks") as batch:
        batch.drop_constraint("user_medical_checks_user_id_fkey", type_="foreignkey")

    # Remove server default on owner_type (was only for migration)
    op.alter_column("medical_checks", "owner_type", server_default=None)

    # Drop old index
    op.drop_index("idx_user_medical_checks_user", table_name="medical_checks")

    # Create new polymorphic index
    op.create_index("idx_medical_checks_owner", "medical_checks", ["owner_type", "owner_id"])


def downgrade():
    op.drop_index("idx_medical_checks_owner", table_name="medical_checks")
    op.create_index("idx_user_medical_checks_user", "medical_checks", ["owner_id"])

    with op.batch_alter_table("medical_checks") as batch:
        batch.create_foreign_key("user_medical_checks_user_id_fkey", "users", ["owner_id"], ["id"])

    op.alter_column("medical_checks", "owner_id", new_column_name="user_id")
    op.drop_column("medical_checks", "owner_type")
    op.rename_table("medical_checks", "user_medical_checks")
