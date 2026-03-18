"""Polymorphic addresses — rename user_addresses to addresses, add owner_type/owner_id.

Removes address/country columns from tiers table (addresses managed via addresses table).

Revision ID: 003_polymorphic_addresses
Revises: 535582507b0f
Create Date: 2026-03-16
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "003_polymorphic_addresses"
down_revision = "535582507b0f"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── 1. Rename user_addresses → addresses ──
    op.rename_table("user_addresses", "addresses")

    # ── 2. Add owner_type and owner_id columns ──
    op.add_column("addresses", sa.Column("owner_type", sa.String(50), nullable=True))
    op.add_column("addresses", sa.Column("owner_id", UUID(as_uuid=True), nullable=True))

    # ── 3. Migrate existing data: user_id → owner_type='user', owner_id=user_id ──
    op.execute("UPDATE addresses SET owner_type = 'user', owner_id = user_id")

    # ── 4. Make columns NOT NULL now that data is migrated ──
    op.alter_column("addresses", "owner_type", nullable=False)
    op.alter_column("addresses", "owner_id", nullable=False)

    # ── 5. Drop old user_id FK and column ──
    # Drop FK constraint (name may vary — try common pattern)
    op.execute("""
        DO $$ BEGIN
            ALTER TABLE addresses DROP CONSTRAINT IF EXISTS user_addresses_user_id_fkey;
        EXCEPTION WHEN undefined_object THEN NULL;
        END $$;
    """)
    op.drop_column("addresses", "user_id")

    # ── 6. Create index on (owner_type, owner_id) ──
    op.create_index("idx_addresses_owner", "addresses", ["owner_type", "owner_id"])

    # ── 7. Remove address and country from tiers ──
    op.drop_column("tiers", "address")
    op.drop_column("tiers", "country")


def downgrade() -> None:
    # ── Reverse: add columns back to tiers ──
    op.add_column("tiers", sa.Column("country", sa.String(100), nullable=True))
    op.add_column("tiers", sa.Column("address", sa.Text(), nullable=True))

    # ── Reverse: add user_id back, migrate data, drop owner columns ──
    op.add_column("addresses", sa.Column("user_id", UUID(as_uuid=True), nullable=True))
    op.execute("UPDATE addresses SET user_id = owner_id WHERE owner_type = 'user'")

    op.drop_index("idx_addresses_owner", table_name="addresses")
    op.drop_column("addresses", "owner_id")
    op.drop_column("addresses", "owner_type")

    # Rename back
    op.rename_table("addresses", "user_addresses")
