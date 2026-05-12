"""Add missing `archived` column on teams (SoftDeleteMixin).

Le modele `Team` herite de `SoftDeleteMixin` qui injecte 2 colonnes:
* `archived: bool` (NOT NULL, default false)
* `deleted_at: datetime | None`

Migration 163 (create teams) avait cree `deleted_at` mais avait oublie
`archived` -> SELECT * sur teams crash avec "column teams.archived does
not exist" (cf. logs Dokploy backend, GET /teams retourne HTTP 500).

Cette migration ajoute la colonne en NOT NULL avec default false (les
rows existantes sont automatiquement marquees comme actives).

Revision ID: 165_teams_archived_column
Revises: 164_ads_pax_from_team
Create Date: 2026-05-12
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "165_teams_archived_column"
down_revision: Union[str, None] = "164_ads_pax_from_team"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "teams",
        sa.Column(
            "archived",
            sa.Boolean(),
            server_default=sa.text("false"),
            nullable=False,
        ),
    )


def downgrade() -> None:
    op.drop_column("teams", "archived")
