"""Teams ORM models — equipes transverses reutilisables.

Une `Team` est un objet first-class reutilisable transverse :
* attache a un ADS (expansion en pax via `ads_pax.from_team_id`)
* attache a un Projet via `project_teams`
* potentiellement utilisable plus tard pour pointage/AVM/etc.

Pattern membres : XOR user/contact (meme contrainte que `ads_pax`).
Historisation : soft-end via `team_members.left_at` — pas de table d'audit
separee, le simple INSERT/UPDATE suffit (`left_at IS NULL` = membre actif).
Visibility : `public` (visible par tous users avec teams.read) ou `private`
(visible seulement par le createur + admins teams.manage).

Cree suite a la demande Bastien (mai 2026):
> "Une equipe peut etre constituee de plusieurs membres de la meme
>  entreprise ou pas et ca permet de creer un ADS pour une equipe
>  directement [...] on peut ajouter une equipe comme membre d'un projet
>  etc."
"""

from datetime import datetime
from uuid import UUID as PyUUID

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    String,
    Text,
    UniqueConstraint,
    func,
    literal_column,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, SoftDeleteMixin, TimestampMixin, UUIDPrimaryKeyMixin

# ─── Enumerations ─────────────────────────────────────────────────────────────

TEAM_VISIBILITIES = ("public", "private")
TEAM_MEMBER_ROLES = ("lead", "senior", "member", "observer")

# Roles d'attachement d'une equipe a un projet (libre extension futur — pour
# l'instant on garde simple). NULL accepte.
PROJECT_TEAM_ROLES = (
    "main_team",       # equipe principale
    "support_team",    # equipe en appui
    "consulting",      # equipe externe consultative
    "subcontractor",   # sous-traitance
)

# Roles d'attachement d'une equipe a une activite planner. Memes valeurs que
# ProjectTeam mais en table separee — utile pour le pointage Phase 4 ou on
# materialise les heures travaillees par equipe attachee a une activite.
ACTIVITY_TEAM_ROLES = PROJECT_TEAM_ROLES


# ─── Team ─────────────────────────────────────────────────────────────────────


class Team(UUIDPrimaryKeyMixin, TimestampMixin, SoftDeleteMixin, Base):
    """Equipe transverse — reutilisable a travers ADS, Projet, et plus tard
    Activites/AVM/Pointage.

    Cree inline depuis le contexte d'utilisation (pas via Settings).
    Le createur est implicitement le `owner` des teams `private`.
    """

    __tablename__ = "teams"
    __table_args__ = (
        CheckConstraint(
            f"visibility IN {TEAM_VISIBILITIES}",
            name="ck_team_visibility",
        ),
        UniqueConstraint("entity_id", "name", name="uq_team_entity_name"),
        Index("idx_teams_entity", "entity_id"),
        Index("idx_teams_visibility", "entity_id", "visibility"),
        Index("idx_teams_created_by", "created_by"),
    )

    entity_id: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("entities.id"), nullable=False,
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Visibility — gate de read access (cf. _can_read_team helper).
    visibility: Mapped[str] = mapped_column(
        String(20), server_default="public", nullable=False,
    )
    # Createur = owner implicite (pour visibility=private). Pas de FK cascade:
    # si l'user est supprime, la team reste (consultable par admins).
    created_by: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False,
    )
    active: Mapped[bool] = mapped_column(Boolean, server_default="true", nullable=False)
    tags: Mapped[list | None] = mapped_column(JSONB, nullable=True)

    # TeamMember a 2 FK vers `teams` (team_id + moved_to_team_id). Sans
    # foreign_keys explicite, SQLAlchemy refuse de configurer le mapper.
    members = relationship(
        "TeamMember",
        back_populates="team",
        cascade="all, delete-orphan",
        order_by="TeamMember.joined_at",
        foreign_keys="TeamMember.team_id",
    )
    project_links = relationship(
        "ProjectTeam",
        back_populates="team",
        cascade="all, delete-orphan",
    )


# ─── TeamMember ──────────────────────────────────────────────────────────────


class TeamMember(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Membre d'une equipe — XOR user/contact, historise via left_at.

    Pattern :
      * `left_at = NULL` -> membre actif.
      * `left_at IS NOT NULL` -> membre sorti, garde en historique.
      * Re-entry = INSERT nouvelle row (pas UPDATE de la sortie).
      * Move entre teams = atomic UPDATE source (left_at=NOW) + INSERT target.

    Partial unique index sur (team_id, member_pk) WHERE left_at IS NULL :
    un membre actif unique par equipe, mais re-entry permise, et un membre
    peut etre actif dans plusieurs equipes simultanement.
    """

    __tablename__ = "team_members"
    __table_args__ = (
        CheckConstraint(
            "(user_id IS NOT NULL AND contact_id IS NULL) OR "
            "(user_id IS NULL AND contact_id IS NOT NULL)",
            name="ck_team_member_xor",
        ),
        CheckConstraint(
            f"role IN {TEAM_MEMBER_ROLES}",
            name="ck_team_member_role",
        ),
        # Partial unique : un membre actif (left_at IS NULL) par equipe.
        # NB: alembic doit creer ca avec `op.create_index(..., postgresql_where=...)`.
        Index(
            "uq_team_member_active_user",
            "team_id", "user_id",
            unique=True,
            postgresql_where=literal_column("left_at IS NULL AND user_id IS NOT NULL"),
        ),
        Index(
            "uq_team_member_active_contact",
            "team_id", "contact_id",
            unique=True,
            postgresql_where=literal_column("left_at IS NULL AND contact_id IS NOT NULL"),
        ),
        Index("idx_team_members_team", "team_id"),
        Index("idx_team_members_user", "user_id"),
        Index("idx_team_members_contact", "contact_id"),
        Index("idx_team_members_left_at", "team_id", "left_at"),
    )

    team_id: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("teams.id", ondelete="CASCADE"), nullable=False,
    )
    user_id: Mapped[PyUUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True,
    )
    contact_id: Mapped[PyUUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tier_contacts.id"), nullable=True,
    )
    role: Mapped[str] = mapped_column(
        String(30), server_default="member", nullable=False,
    )
    joined_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False,
    )
    # NULL = membre actif. NOT NULL = sorti de l'equipe.
    left_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True,
    )
    added_by: Mapped[PyUUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True,
    )
    # Si sorti via "move", trace la team de destination pour audit/UX.
    moved_to_team_id: Mapped[PyUUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("teams.id", ondelete="SET NULL"), nullable=True,
    )

    team = relationship("Team", back_populates="members", foreign_keys=[team_id])


# ─── ProjectTeam — jonction simple projet <-> equipe ─────────────────────────


class ProjectTeam(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Attache une equipe a un projet en tant que partie prenante.

    Pas d'expansion: une equipe attachee a un projet reste un objet
    'equipe' au niveau projet (vs. ADS ou on materialise en pax). Si on
    veut lister les *individus* sur le projet plus tard, on fera un join
    via team_members actifs.

    Pas de left_at non plus: un projet peut detacher une equipe et la
    re-attacher (delete + insert). Si on a besoin d'historiser, on
    ajoutera une table d'audit dediee dans une iteration future.
    """

    __tablename__ = "project_teams"
    __table_args__ = (
        UniqueConstraint("project_id", "team_id", name="uq_project_team"),
        CheckConstraint(
            f"role IS NULL OR role IN {PROJECT_TEAM_ROLES}",
            name="ck_project_team_role",
        ),
        Index("idx_project_teams_project", "project_id"),
        Index("idx_project_teams_team", "team_id"),
    )

    project_id: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False,
    )
    team_id: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("teams.id", ondelete="CASCADE"), nullable=False,
    )
    role: Mapped[str | None] = mapped_column(String(30), nullable=True)
    attached_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False,
    )
    attached_by: Mapped[PyUUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True,
    )

    team = relationship("Team", back_populates="project_links")


# ─── ActivityTeam — jonction activite planner <-> equipe ──────────────────────


class ActivityTeam(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Attache une equipe a une activite planner.

    Comme `ProjectTeam` : pas d'expansion en individus, on garde l'equipe
    comme objet first-class au niveau activite. Prepare la Phase 4
    (pointage par equipe sur les activites).

    Visible dans le detail panel de l'activite (planner). La meme equipe
    peut etre attachee a plusieurs activites simultanement.
    """

    __tablename__ = "activity_teams"
    __table_args__ = (
        UniqueConstraint("activity_id", "team_id", name="uq_activity_team"),
        CheckConstraint(
            f"role IS NULL OR role IN {ACTIVITY_TEAM_ROLES}",
            name="ck_activity_team_role",
        ),
        Index("idx_activity_teams_activity", "activity_id"),
        Index("idx_activity_teams_team", "team_id"),
    )

    activity_id: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("planner_activities.id", ondelete="CASCADE"),
        nullable=False,
    )
    team_id: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("teams.id", ondelete="CASCADE"), nullable=False,
    )
    role: Mapped[str | None] = mapped_column(String(30), nullable=True)
    attached_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False,
    )
    attached_by: Mapped[PyUUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True,
    )
