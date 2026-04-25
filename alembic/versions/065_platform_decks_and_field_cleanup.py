"""Add platform_decks table + cleanup asset dimension fields.

- platform_decks: per-deck dimensions, elevation, load capacity for platforms
- deck_id FK on assets: equipment references its deck
- jacket_length_m, jacket_width_m: replace string jacket_dimensions
- pile_diameter_inch, pile_count_per_leg: replace string pile_diameter
- Old string fields kept for backward compat (will be deprecated)

Revision ID: 065
"""

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID
from alembic import op

revision = "065"
down_revision = "064"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Platform decks table
    op.create_table(
        "platform_decks",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("asset_id", UUID(as_uuid=True), sa.ForeignKey("assets.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(50), nullable=False),
        sa.Column("level_number", sa.Integer(), server_default="1", nullable=False),
        sa.Column("elevation_msl", sa.Float(), nullable=True),
        sa.Column("length_m", sa.Float(), nullable=True),
        sa.Column("width_m", sa.Float(), nullable=True),
        sa.Column("max_load_t_m2", sa.Float(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("active", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
    )
    op.create_index("idx_platform_decks_asset", "platform_decks", ["asset_id"])

    # New numeric fields on assets (replacing string dimensions)
    op.add_column("assets", sa.Column("deck_id", UUID(as_uuid=True), sa.ForeignKey("platform_decks.id"), nullable=True))
    op.add_column("assets", sa.Column("jacket_length_m", sa.Float(), nullable=True))
    op.add_column("assets", sa.Column("jacket_width_m", sa.Float(), nullable=True))
    op.add_column("assets", sa.Column("pile_diameter_inch", sa.Float(), nullable=True))
    op.add_column("assets", sa.Column("pile_count_per_leg", sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column("assets", "pile_count_per_leg")
    op.drop_column("assets", "pile_diameter_inch")
    op.drop_column("assets", "jacket_width_m")
    op.drop_column("assets", "jacket_length_m")
    op.drop_column("assets", "deck_id")
    op.drop_table("platform_decks")
