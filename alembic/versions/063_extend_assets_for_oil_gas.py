"""Extend assets model for oil & gas operations.

Asset hierarchy: Field → Site → Platform → Equipment (crane, well, separator, etc.)
All technical specs are direct SQL columns (no JSONB) for queryability.
JSONB metadata_ kept for ancillary custom data only.

Revision ID: 063
"""

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB
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
    # GIS / Geometry
    op.add_column("assets", sa.Column("geometry", JSONB(), nullable=True))
    op.add_column("assets", sa.Column("boundary", JSONB(), nullable=True))
    # Equipment positioning (3D)
    op.add_column("assets", sa.Column("deck_name", sa.String(50), nullable=True))
    op.add_column("assets", sa.Column("elevation_msl", sa.Float(), nullable=True))
    op.add_column("assets", sa.Column("position_x", sa.Float(), nullable=True))
    op.add_column("assets", sa.Column("position_y", sa.Float(), nullable=True))
    op.add_column("assets", sa.Column("position_z", sa.Float(), nullable=True))
    # Equipment dimensions
    op.add_column("assets", sa.Column("length_m", sa.Float(), nullable=True))
    op.add_column("assets", sa.Column("width_m", sa.Float(), nullable=True))
    op.add_column("assets", sa.Column("height_m", sa.Float(), nullable=True))
    op.add_column("assets", sa.Column("weight_t", sa.Float(), nullable=True))

    # Crane lifting charts
    op.create_table(
        "crane_lifting_charts",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("asset_id", UUID(as_uuid=True), sa.ForeignKey("assets.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("boom_length", sa.Float(), nullable=True),
        sa.Column("counterweight", sa.Float(), nullable=True),
        sa.Column("wind_speed_max", sa.Float(), nullable=True),
        sa.Column("operating_mode", sa.String(50), nullable=True),
        sa.Column("radius_unit", sa.String(10), server_default="m", nullable=False),
        sa.Column("capacity_unit", sa.String(10), server_default="T", nullable=False),
        sa.Column("data_points", JSONB(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("active", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
    )
    op.create_index("idx_crane_lifting_charts_asset", "crane_lifting_charts", ["asset_id"])


def downgrade() -> None:
    op.drop_table("crane_lifting_charts")
    for col in [
        "weight_t", "height_m", "width_m", "length_m",
        "position_z", "position_y", "position_x", "elevation_msl", "deck_name",
        "boundary", "geometry",
        "pipeline_length", "pipeline_diameter", "pipeline_type", "connected_asset_id",
        "next_inspection", "last_inspection", "model_ref", "manufacturer",
        "equipment_subtype", "max_range", "capacity",
        "has_power", "has_winj", "top_deck_load", "deck_level", "deck_dimensions",
        "pile_diameter", "nb_piles", "jacket_weight", "jacket_dimensions",
        "altitude", "water_depth", "orientation", "description", "year_installed",
    ]:
        op.drop_column("assets", col)
