"""Add from_team_id on ads_pax for team-origin tracking.

Quand on ajoute une equipe a un ADS, on materialise chaque membre en
ads_pax avec from_team_id = team.id. Permet :
* d'afficher le badge "via Equipe X" sur le pax
* de retirer en bloc tous les pax issus d'une equipe
* de reconcilier plus tard (re-sync depuis equipe si membres modifies)

Snapshot semantic : le pax reste en place meme si la team change apres
coup. C'est une copie au moment de l'add-team, pas un live link.

Revision ID: 164_ads_pax_from_team
Revises: 163_create_teams
Create Date: 2026-05-12
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision: str = "164_ads_pax_from_team"
down_revision: Union[str, None] = "163_create_teams"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "ads_pax",
        sa.Column(
            "from_team_id",
            UUID(as_uuid=True),
            sa.ForeignKey("teams.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.create_index("idx_ads_pax_from_team", "ads_pax", ["from_team_id"])


def downgrade() -> None:
    op.drop_index("idx_ads_pax_from_team", table_name="ads_pax")
    op.drop_column("ads_pax", "from_team_id")
