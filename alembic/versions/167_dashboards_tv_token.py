"""Add missing tv_token + tv_token_expires_at columns to dashboards.

Le modele `Dashboard` declarait ces 2 colonnes mais aucune migration
ne les avait creees en BDD. Resultat : GET /api/v1/dashboards plantait
avec asyncpg.UndefinedColumnError "column dashboards.tv_token does not
exist" -- bug bloquant decouvert via stress test endpoints en QA nuit.

Revision ID: 167_dashboards_tv_token
Revises: 166_activity_teams
Create Date: 2026-05-13
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "167_dashboards_tv_token"
down_revision: Union[str, None] = "166_activity_teams"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Tolerant aux retries : ne plante pas si la colonne existe deja.
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_cols = {c["name"] for c in inspector.get_columns("dashboards")}

    if "tv_token" not in existing_cols:
        op.add_column(
            "dashboards",
            sa.Column("tv_token", sa.String(length=64), nullable=True),
        )
        op.create_index(
            "ix_dashboards_tv_token",
            "dashboards",
            ["tv_token"],
            unique=True,
        )

    if "tv_token_expires_at" not in existing_cols:
        op.add_column(
            "dashboards",
            sa.Column(
                "tv_token_expires_at",
                sa.DateTime(timezone=True),
                nullable=True,
            ),
        )


def downgrade() -> None:
    op.drop_index("ix_dashboards_tv_token", table_name="dashboards")
    op.drop_column("dashboards", "tv_token_expires_at")
    op.drop_column("dashboards", "tv_token")
