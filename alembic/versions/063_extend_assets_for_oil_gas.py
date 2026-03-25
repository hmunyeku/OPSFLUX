"""Extend assets model for oil & gas operations.

Asset hierarchy: Field → Site → Platform → Equipment (crane, well, separator, etc.)
All technical specs are direct SQL columns (no JSONB) for queryability.
JSONB metadata_ kept for ancillary custom data only.

Revision ID: 063
"""

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID
from alembic import op

revision = "063"
down_revision = "062"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Common
    op.add_column("assets", sa.Column("year_installed", sa.Integer(), nullable=True))
    op.add_column("assets", sa.Column("description", sa.Text(), nullable=True))
    op.add_column("assets", sa.Column("orientation", sa.String(50), nullable=True))
    # Platform structure
    op.add_column("assets", sa.Column("water_depth", sa.Float(), nullable=True))
    op.add_column("assets", sa.Column("altitude", sa.Float(), nullable=True))
    op.add_column("assets", sa.Column("jacket_dimensions", sa.String(100), nullable=True))
    op.add_column("assets", sa.Column("jacket_weight", sa.Float(), nullable=True))
    op.add_column("assets", sa.Column("nb_piles", sa.Integer(), nullable=True))
    op.add_column("assets", sa.Column("pile_diameter", sa.String(50), nullable=True))
    op.add_column("assets", sa.Column("deck_dimensions", sa.String(100), nullable=True))
    op.add_column("assets", sa.Column("deck_level", sa.Integer(), nullable=True))
    op.add_column("assets", sa.Column("top_deck_load", sa.Float(), nullable=True))
    op.add_column("assets", sa.Column("has_winj", sa.Boolean(), nullable=True))
    op.add_column("assets", sa.Column("has_power", sa.Boolean(), nullable=True))
    # Equipment
    op.add_column("assets", sa.Column("capacity", sa.Float(), nullable=True))
    op.add_column("assets", sa.Column("max_range", sa.Float(), nullable=True))
    op.add_column("assets", sa.Column("equipment_subtype", sa.String(50), nullable=True))
    op.add_column("assets", sa.Column("manufacturer", sa.String(200), nullable=True))
    op.add_column("assets", sa.Column("model_ref", sa.String(200), nullable=True))
    op.add_column("assets", sa.Column("last_inspection", sa.Date(), nullable=True))
    op.add_column("assets", sa.Column("next_inspection", sa.Date(), nullable=True))
    # Pipeline
    op.add_column("assets", sa.Column("connected_asset_id", UUID(as_uuid=True), sa.ForeignKey("assets.id"), nullable=True))
    op.add_column("assets", sa.Column("pipeline_type", sa.String(30), nullable=True))
    op.add_column("assets", sa.Column("pipeline_diameter", sa.String(50), nullable=True))
    op.add_column("assets", sa.Column("pipeline_length", sa.Float(), nullable=True))


def downgrade() -> None:
    for col in [
        "pipeline_length", "pipeline_diameter", "pipeline_type", "connected_asset_id",
        "next_inspection", "last_inspection", "model_ref", "manufacturer",
        "equipment_subtype", "max_range", "capacity",
        "has_power", "has_winj", "top_deck_load", "deck_level", "deck_dimensions",
        "pile_diameter", "nb_piles", "jacket_weight", "jacket_dimensions",
        "altitude", "water_depth", "orientation", "description", "year_installed",
    ]:
        op.drop_column("assets", col)
