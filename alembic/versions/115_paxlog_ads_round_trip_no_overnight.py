"""Paxlog: add Ads.is_round_trip_no_overnight flag.

Spec section 3.5: ADS aller-retour sans nuitee. These ADS apparaissent dans
le forecast Pax du jour mais sans consommer de POB nuitee. Le flag est
binaire et stocke directement sur l'ADS pour eviter de calculer dynamiquement
a partir des dates start/end.

Revision ID: 115_paxlog_ads_round_trip_no_overnight
Revises: 114_planner_dependency_add_sf_type
"""
from alembic import op
import sqlalchemy as sa


revision = "115_paxlog_ads_round_trip_no_overnight"
down_revision = "114_planner_dependency_add_sf_type"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "ads",
        sa.Column(
            "is_round_trip_no_overnight",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )
    # Drop the server_default after backfilling so future inserts must
    # explicitly set the value (matches the model's default=False).
    op.alter_column("ads", "is_round_trip_no_overnight", server_default=None)


def downgrade() -> None:
    op.drop_column("ads", "is_round_trip_no_overnight")
