"""Add missing tv_refresh_seconds column to dashboards.

La migration 167 ajoutait deja tv_token + tv_token_expires_at mais
tv_refresh_seconds manquait aussi (revele par le 2e cycle de QA).
Comme 167 est deja appliquee en BDD prod, alembic ne re-applique pas
les changements ajoutes a posteriori dans 167 -- d'ou cette 168.

Revision ID: 168_dashboards_tv_refresh
Revises: 167_dashboards_tv_token
Create Date: 2026-05-13
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "168_dashboards_tv_refresh"
down_revision: Union[str, None] = "167_dashboards_tv_token"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_cols = {c["name"] for c in inspector.get_columns("dashboards")}

    if "tv_refresh_seconds" not in existing_cols:
        op.add_column(
            "dashboards",
            sa.Column(
                "tv_refresh_seconds",
                sa.Integer(),
                nullable=False,
                server_default="60",
                comment="Auto-refresh interval for TV mode (seconds)",
            ),
        )


def downgrade() -> None:
    op.drop_column("dashboards", "tv_refresh_seconds")
