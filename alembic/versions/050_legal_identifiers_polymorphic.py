"""Legal identifiers polymorphic — rename tier_identifiers, replace tier_id with owner_type/owner_id.

Revision ID: 050
Revises: 049
"""
from alembic import op
import sqlalchemy as sa

revision = "050"
down_revision = "049"
branch_labels = None
depends_on = None


def upgrade():
    # Drop old tier-specific index
    op.drop_index("idx_tier_identifiers_tier", table_name="tier_identifiers")

    # Drop FK constraint (tier_id → tiers.id)
    op.drop_constraint("tier_identifiers_tier_id_fkey", "tier_identifiers", type_="foreignkey")

    # Rename table
    op.rename_table("tier_identifiers", "legal_identifiers")

    # Add owner_type column (default 'tier' for existing rows)
    op.add_column("legal_identifiers", sa.Column("owner_type", sa.String(50), nullable=False, server_default="tier"))

    # Rename tier_id → owner_id
    op.alter_column("legal_identifiers", "tier_id", new_column_name="owner_id")

    # Remove server default on owner_type (was only for migration)
    op.alter_column("legal_identifiers", "owner_type", server_default=None)

    # Create polymorphic index
    op.create_index("idx_legal_identifiers_owner", "legal_identifiers", ["owner_type", "owner_id"])


def downgrade():
    op.drop_index("idx_legal_identifiers_owner", table_name="legal_identifiers")
    op.alter_column("legal_identifiers", "owner_id", new_column_name="tier_id")
    op.drop_column("legal_identifiers", "owner_type")
    op.rename_table("legal_identifiers", "tier_identifiers")
    op.create_foreign_key("tier_identifiers_tier_id_fkey", "tier_identifiers", "tiers", ["tier_id"], ["id"])
    op.create_index("idx_tier_identifiers_tier", "tier_identifiers", ["tier_id"])
