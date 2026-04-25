"""Fix Asset.code uniqueness: global → per-entity.

Previously code was globally unique (unique=True on column), preventing
two entities from having the same asset code. Now unique per entity.

Revision ID: 064
"""

from alembic import op

revision = "064"
down_revision = "063"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Drop global unique constraint on assets.code
    op.drop_constraint("assets_code_key", "assets", type_="unique")
    # Add per-entity unique constraint
    op.create_unique_constraint("uq_asset_entity_code", "assets", ["entity_id", "code"])


def downgrade() -> None:
    op.drop_constraint("uq_asset_entity_code", "assets", type_="unique")
    op.create_unique_constraint("assets_code_key", "assets", ["code"])
