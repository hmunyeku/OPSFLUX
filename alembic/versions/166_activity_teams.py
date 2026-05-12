"""Create activity_teams jonction table (planner activities <-> teams).

Pareil que `project_teams` mais pour les activites planner. Permet
d'attacher une equipe a une activite + prepare la Phase 4 (pointage
par equipe sur les heures travaillees d'une activite).

Revision ID: 166_activity_teams
Revises: 165_teams_archived_column
Create Date: 2026-05-12
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision: str = "166_activity_teams"
down_revision: Union[str, None] = "165_teams_archived_column"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

ACTIVITY_TEAM_ROLES = ("main_team", "support_team", "consulting", "subcontractor")


def upgrade() -> None:
    op.create_table(
        "activity_teams",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column(
            "activity_id",
            UUID(as_uuid=True),
            sa.ForeignKey("planner_activities.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "team_id",
            UUID(as_uuid=True),
            sa.ForeignKey("teams.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("role", sa.String(30), nullable=True),
        sa.Column(
            "attached_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "attached_by",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id"),
            nullable=True,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.UniqueConstraint("activity_id", "team_id", name="uq_activity_team"),
        sa.CheckConstraint(
            f"role IS NULL OR role IN {ACTIVITY_TEAM_ROLES}",
            name="ck_activity_team_role",
        ),
    )
    op.create_index("idx_activity_teams_activity", "activity_teams", ["activity_id"])
    op.create_index("idx_activity_teams_team", "activity_teams", ["team_id"])


def downgrade() -> None:
    op.drop_index("idx_activity_teams_team", table_name="activity_teams")
    op.drop_index("idx_activity_teams_activity", table_name="activity_teams")
    op.drop_table("activity_teams")
