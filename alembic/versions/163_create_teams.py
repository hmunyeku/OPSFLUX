"""Create teams + team_members + project_teams tables.

Equipes transverses reutilisables — feature demandee par Bastien (mai 2026)
pour pouvoir creer un ADS pour une equipe entiere, attacher une equipe a un
projet, et plus tard supporter le pointage d'equipe.

Pattern membres : XOR user_id/contact_id (meme contrainte que ads_pax).
Historisation : soft-end via team_members.left_at — pas de table d'audit
separee. Partial unique index assure unicite du membre actif par equipe
mais permet re-entry et appartenance multi-equipes simultanee.

Revision ID: 163_create_teams
Revises: 162_bump_agent_default_max_lines
Create Date: 2026-05-12
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB, UUID

revision: str = "163_create_teams"
down_revision: Union[str, None] = "162_bump_agent_default_max_lines"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


TEAM_VISIBILITIES = ("public", "private")
TEAM_MEMBER_ROLES = ("lead", "senior", "member", "observer")
PROJECT_TEAM_ROLES = ("main_team", "support_team", "consulting", "subcontractor")


def upgrade() -> None:
    # ─── teams ────────────────────────────────────────────────────────────
    op.create_table(
        "teams",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("entity_id", UUID(as_uuid=True), sa.ForeignKey("entities.id"), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("visibility", sa.String(20), server_default="public", nullable=False),
        sa.Column("created_by", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("tags", JSONB(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            f"visibility IN {TEAM_VISIBILITIES}",
            name="ck_team_visibility",
        ),
        sa.UniqueConstraint("entity_id", "name", name="uq_team_entity_name"),
    )
    op.create_index("idx_teams_entity", "teams", ["entity_id"])
    op.create_index("idx_teams_visibility", "teams", ["entity_id", "visibility"])
    op.create_index("idx_teams_created_by", "teams", ["created_by"])

    # ─── team_members ─────────────────────────────────────────────────────
    op.create_table(
        "team_members",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("team_id", UUID(as_uuid=True), sa.ForeignKey("teams.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("contact_id", UUID(as_uuid=True), sa.ForeignKey("tier_contacts.id"), nullable=True),
        sa.Column("role", sa.String(30), server_default="member", nullable=False),
        sa.Column("joined_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        # left_at NULL = membre actif.
        sa.Column("left_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("added_by", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("moved_to_team_id", UUID(as_uuid=True), sa.ForeignKey("teams.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint(
            "(user_id IS NOT NULL AND contact_id IS NULL) OR "
            "(user_id IS NULL AND contact_id IS NOT NULL)",
            name="ck_team_member_xor",
        ),
        sa.CheckConstraint(
            f"role IN {TEAM_MEMBER_ROLES}",
            name="ck_team_member_role",
        ),
    )
    # Partial unique indexes — un membre actif par equipe (NULLs distincts).
    op.create_index(
        "uq_team_member_active_user",
        "team_members",
        ["team_id", "user_id"],
        unique=True,
        postgresql_where=sa.text("left_at IS NULL AND user_id IS NOT NULL"),
    )
    op.create_index(
        "uq_team_member_active_contact",
        "team_members",
        ["team_id", "contact_id"],
        unique=True,
        postgresql_where=sa.text("left_at IS NULL AND contact_id IS NOT NULL"),
    )
    op.create_index("idx_team_members_team", "team_members", ["team_id"])
    op.create_index("idx_team_members_user", "team_members", ["user_id"])
    op.create_index("idx_team_members_contact", "team_members", ["contact_id"])
    op.create_index("idx_team_members_left_at", "team_members", ["team_id", "left_at"])

    # ─── project_teams ────────────────────────────────────────────────────
    op.create_table(
        "project_teams",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("project_id", UUID(as_uuid=True), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("team_id", UUID(as_uuid=True), sa.ForeignKey("teams.id", ondelete="CASCADE"), nullable=False),
        sa.Column("role", sa.String(30), nullable=True),
        sa.Column("attached_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("attached_by", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("project_id", "team_id", name="uq_project_team"),
        sa.CheckConstraint(
            f"role IS NULL OR role IN {PROJECT_TEAM_ROLES}",
            name="ck_project_team_role",
        ),
    )
    op.create_index("idx_project_teams_project", "project_teams", ["project_id"])
    op.create_index("idx_project_teams_team", "project_teams", ["team_id"])


def downgrade() -> None:
    op.drop_index("idx_project_teams_team", table_name="project_teams")
    op.drop_index("idx_project_teams_project", table_name="project_teams")
    op.drop_table("project_teams")

    op.drop_index("idx_team_members_left_at", table_name="team_members")
    op.drop_index("idx_team_members_contact", table_name="team_members")
    op.drop_index("idx_team_members_user", table_name="team_members")
    op.drop_index("idx_team_members_team", table_name="team_members")
    op.drop_index("uq_team_member_active_contact", table_name="team_members")
    op.drop_index("uq_team_member_active_user", table_name="team_members")
    op.drop_table("team_members")

    op.drop_index("idx_teams_created_by", table_name="teams")
    op.drop_index("idx_teams_visibility", table_name="teams")
    op.drop_index("idx_teams_entity", table_name="teams")
    op.drop_table("teams")
