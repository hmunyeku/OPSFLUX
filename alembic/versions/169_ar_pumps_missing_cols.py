"""Add missing api_type_designation + fluid_viscosity_cst to ar_pumps.

Bug #26 : audit modeles vs BDD revele que ces 2 colonnes etaient
declarees dans le modele Pump (asset_registry.py:1060, :1069) mais
n'avaient jamais ete creees en BDD. Toute tentative de SELECT ou
UPDATE sur ces colonnes (ex: page de detail Pump) plantait avec
asyncpg.UndefinedColumnError -- meme pattern que bug #25 (dashboards
tv_token).

Revision ID: 169_ar_pumps_missing_cols
Revises: 168_dashboards_tv_refresh
Create Date: 2026-05-13
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "169_ar_pumps_missing_cols"
down_revision: Union[str, None] = "168_dashboards_tv_refresh"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing = {c["name"] for c in inspector.get_columns("ar_pumps")}

    if "api_type_designation" not in existing:
        op.add_column(
            "ar_pumps",
            sa.Column("api_type_designation", sa.String(length=10), nullable=True),
        )

    if "fluid_viscosity_cst" not in existing:
        op.add_column(
            "ar_pumps",
            sa.Column("fluid_viscosity_cst", sa.Numeric(precision=10, scale=5), nullable=True),
        )


def downgrade() -> None:
    op.drop_column("ar_pumps", "fluid_viscosity_cst")
    op.drop_column("ar_pumps", "api_type_designation")
