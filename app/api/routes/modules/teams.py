"""Teams module routes — CRUD equipes + gestion des membres + integrations.

Endpoints:
  GET    /api/v1/teams                  list (filtres: search, visibility, include_inactive)
  POST   /api/v1/teams                  create (avec membres initiaux optionnels)
  GET    /api/v1/teams/{id}             detail (members actifs + historique passes)
  PATCH  /api/v1/teams/{id}             update (name, desc, visibility, active, tags)
  DELETE /api/v1/teams/{id}             soft-delete
  POST   /api/v1/teams/{id}/members             add member
  PATCH  /api/v1/teams/{id}/members/{mid}       update role
  DELETE /api/v1/teams/{id}/members/{mid}       set left_at (sort le membre)
  POST   /api/v1/teams/{id}/members/{mid}/move  move to other team
  GET    /api/v1/teams/{id}/history             chronologie complete

Visibility :
  * public  -> visible par tous users de l'entite avec teams.read
  * private -> visible par created_by + holders de teams.manage uniquement

Membre actif = `left_at IS NULL`. Pour sortir un membre, on UPDATE left_at,
on ne DELETE pas (historisation). Pour deplacer un membre, on UPDATE source
(left_at=NOW + moved_to_team_id) + INSERT target dans une transaction.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import (
    get_current_entity,
    get_current_user,
    has_user_permission,
    require_permission,
)
from app.core.audit import record_audit
from app.core.database import get_db
from app.core.errors import StructuredHTTPException
from app.core.pagination import PaginationParams, paginate
from app.models.common import Tier, TierContact, User
from app.models.teams import ProjectTeam, Team, TeamMember
from app.schemas.common import PaginatedResponse
from app.schemas.teams import (
    TeamCreate,
    TeamMemberCreate,
    TeamMemberMove,
    TeamMemberRead,
    TeamMemberUpdate,
    TeamRead,
    TeamUpdate,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/teams", tags=["teams"])


# ─── Helpers ──────────────────────────────────────────────────────────────────


async def _can_read_team(
    team: Team, *, current_user: User, entity_id: UUID, db: AsyncSession,
) -> bool:
    """Visibility gate :
      * public -> tout user avec teams.read
      * private -> created_by OU teams.manage
    """
    if team.visibility == "public":
        return True
    if team.created_by == current_user.id:
        return True
    return await has_user_permission(current_user, entity_id, "teams.manage", db)


async def _can_write_team(
    team: Team, *, current_user: User, entity_id: UUID, db: AsyncSession,
) -> bool:
    """Write access : creator OU teams.manage."""
    if team.created_by == current_user.id:
        return True
    return await has_user_permission(current_user, entity_id, "teams.manage", db)


async def _get_team_or_404(
    db: AsyncSession, team_id: UUID, entity_id: UUID,
    *, with_members: bool = False,
) -> Team:
    stmt = select(Team).where(
        Team.id == team_id,
        Team.entity_id == entity_id,
        Team.deleted_at.is_(None),
    )
    if with_members:
        stmt = stmt.options(selectinload(Team.members))
    team = (await db.execute(stmt)).scalar_one_or_none()
    if not team:
        raise StructuredHTTPException(
            404, code="TEAM_NOT_FOUND", message="Equipe introuvable.",
        )
    return team


async def _hydrate_member(
    db: AsyncSession, member: TeamMember,
    *, users_cache: dict[UUID, User] | None = None,
    contacts_cache: dict[UUID, TierContact] | None = None,
    tier_names_cache: dict[UUID, str] | None = None,
) -> TeamMemberRead:
    """Resout user/contact + job_position + company pour un membre.

    Caches optionnels pour batch usage par l'appelant.
    """
    out = TeamMemberRead.model_validate(member)
    if member.user_id:
        u = (users_cache or {}).get(member.user_id)
        if u is None:
            u = (await db.execute(
                select(User)
                .options(selectinload(User.job_position))
                .where(User.id == member.user_id)
            )).scalar_one_or_none()
        if u:
            out.pax_source = "user"
            out.first_name = u.first_name
            out.last_name = u.last_name
            out.email = u.email
            out.avatar_url = u.avatar_url
            jp = getattr(u, "job_position", None)
            out.job_position_name = jp.name if jp else getattr(u, "position", None)
            # company via tier_contact lie (employes externes)
            tc_id = getattr(u, "tier_contact_id", None)
            if tc_id:
                tc = (await db.execute(
                    select(TierContact).where(TierContact.id == tc_id)
                )).scalar_one_or_none()
                if tc and tc.tier_id:
                    if tier_names_cache and tc.tier_id in tier_names_cache:
                        out.company_name = tier_names_cache[tc.tier_id]
                    else:
                        out.company_name = await db.scalar(
                            select(Tier.name).where(Tier.id == tc.tier_id)
                        )
    elif member.contact_id:
        c = (contacts_cache or {}).get(member.contact_id)
        if c is None:
            c = (await db.execute(
                select(TierContact)
                .options(selectinload(TierContact.job_position))
                .where(TierContact.id == member.contact_id)
            )).scalar_one_or_none()
        if c:
            out.pax_source = "contact"
            out.first_name = c.first_name
            out.last_name = c.last_name
            out.email = c.email
            out.avatar_url = c.photo_url
            jp = getattr(c, "job_position", None)
            out.job_position_name = jp.name if jp else getattr(c, "position", None)
            if c.tier_id:
                if tier_names_cache and c.tier_id in tier_names_cache:
                    out.company_name = tier_names_cache[c.tier_id]
                else:
                    out.company_name = await db.scalar(
                        select(Tier.name).where(Tier.id == c.tier_id)
                    )
    return out


async def _hydrate_team(
    db: AsyncSession, team: Team,
    *, include_members: bool = False,
    include_history: bool = False,
) -> TeamRead:
    """Construit le TeamRead enrichi (createur_name, member_count, members).

    Avec include_members=True : populate active_members.
    Avec include_history=True : populate past_members (members avec left_at).
    """
    creator_name = None
    if team.created_by:
        u = (await db.execute(
            select(User.first_name, User.last_name, User.email)
            .where(User.id == team.created_by)
        )).one_or_none()
        if u:
            creator_name = f"{u.first_name or ''} {u.last_name or ''}".strip() or u.email

    member_count = await db.scalar(
        select(func.count()).select_from(TeamMember).where(
            TeamMember.team_id == team.id, TeamMember.left_at.is_(None),
        )
    ) or 0

    out = TeamRead.model_validate(team)
    out.created_by_name = creator_name
    out.member_count = int(member_count)

    if include_members:
        active = (await db.execute(
            select(TeamMember)
            .where(TeamMember.team_id == team.id, TeamMember.left_at.is_(None))
            .order_by(TeamMember.joined_at)
        )).scalars().all()
        out.active_members = [await _hydrate_member(db, m) for m in active]

    if include_history:
        past = (await db.execute(
            select(TeamMember)
            .where(TeamMember.team_id == team.id, TeamMember.left_at.is_not(None))
            .order_by(TeamMember.left_at.desc())
        )).scalars().all()
        out.past_members = [await _hydrate_member(db, m) for m in past]

    return out


# ─── List + Create ────────────────────────────────────────────────────────────


@router.get("", response_model=PaginatedResponse[TeamRead])
async def list_teams(
    pagination: PaginationParams = Depends(),
    search: str | None = Query(None, description="Filtre sur le nom (ilike)"),
    visibility: str | None = Query(None, pattern=r"^(public|private)$"),
    include_inactive: bool = False,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = Depends(require_permission("teams.read")),
    db: AsyncSession = Depends(get_db),
):
    """Liste les equipes accessibles.

    Filtres :
      * search : ilike sur Team.name
      * visibility : 'public' ou 'private' (ne montre que celles auxquelles
                     on a acces — meme avec 'private', on ne voit que les
                     siennes sauf si on a teams.manage)
      * include_inactive : par defaut on cache les `active=false`

    Pagination : standard PaginationParams.
    """
    can_see_all_private = await has_user_permission(
        current_user, entity_id, "teams.manage", db,
    )

    stmt = select(Team).where(
        Team.entity_id == entity_id,
        Team.deleted_at.is_(None),
    )
    if not include_inactive:
        stmt = stmt.where(Team.active.is_(True))
    if search:
        stmt = stmt.where(Team.name.ilike(f"%{search}%"))
    if visibility:
        stmt = stmt.where(Team.visibility == visibility)

    # Visibility gate : si pas admin teams.manage, on cache les private
    # des autres users. Visible si visibility=public OR created_by=me.
    if not can_see_all_private:
        stmt = stmt.where(
            or_(Team.visibility == "public", Team.created_by == current_user.id)
        )

    stmt = stmt.order_by(Team.name)
    paged = await paginate(db, stmt, pagination)
    items = []
    for team in paged.items:
        items.append(await _hydrate_team(db, team))
    return PaginatedResponse[TeamRead](
        items=items,
        total=paged.total,
        page=paged.page,
        page_size=paged.page_size,
    )


@router.post("", response_model=TeamRead, status_code=201)
async def create_team(
    payload: TeamCreate,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = Depends(require_permission("teams.create")),
    db: AsyncSession = Depends(get_db),
):
    """Cree une equipe. Si `initial_members` est fourni, les ajoute en 1 transaction."""
    # Verifie unicite name dans l'entite
    existing = (await db.execute(
        select(Team.id).where(
            Team.entity_id == entity_id,
            Team.name == payload.name,
            Team.deleted_at.is_(None),
        )
    )).scalar_one_or_none()
    if existing:
        raise StructuredHTTPException(
            409, code="TEAM_NAME_DUPLICATE",
            message=f"Une equipe nommee '{payload.name}' existe deja.",
        )

    team = Team(
        entity_id=entity_id,
        name=payload.name,
        description=payload.description,
        visibility=payload.visibility,
        created_by=current_user.id,
        active=True,
        tags=payload.tags,
    )
    db.add(team)
    await db.flush()

    # Membres initiaux — silently dedup les XOR doublons.
    seen_keys: set[tuple[str, UUID]] = set()
    for m in payload.initial_members:
        key = ("user", m.user_id) if m.user_id else ("contact", m.contact_id)  # type: ignore
        if key in seen_keys:
            continue
        seen_keys.add(key)
        db.add(TeamMember(
            team_id=team.id,
            user_id=m.user_id, contact_id=m.contact_id,
            role=m.role,
            added_by=current_user.id,
        ))

    await db.commit()
    await record_audit(
        db, current_user.id, entity_id, "team.create",
        target_type="team", target_id=team.id,
        metadata={"name": team.name, "visibility": team.visibility,
                  "initial_members": len(payload.initial_members)},
    )
    await db.refresh(team)
    return await _hydrate_team(db, team, include_members=True)


# ─── Detail / Update / Delete ────────────────────────────────────────────────


@router.get("/{team_id}", response_model=TeamRead)
async def get_team(
    team_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = Depends(require_permission("teams.read")),
    db: AsyncSession = Depends(get_db),
):
    team = await _get_team_or_404(db, team_id, entity_id)
    if not await _can_read_team(team, current_user=current_user, entity_id=entity_id, db=db):
        raise StructuredHTTPException(
            403, code="TEAM_PRIVATE",
            message="Cette equipe est privee.",
        )
    return await _hydrate_team(db, team, include_members=True, include_history=True)


@router.patch("/{team_id}", response_model=TeamRead)
async def update_team(
    team_id: UUID,
    payload: TeamUpdate,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = Depends(require_permission("teams.update")),
    db: AsyncSession = Depends(get_db),
):
    team = await _get_team_or_404(db, team_id, entity_id)
    if not await _can_write_team(team, current_user=current_user, entity_id=entity_id, db=db):
        raise StructuredHTTPException(
            403, code="TEAM_NOT_OWNER",
            message="Seul le createur ou un admin peut modifier cette equipe.",
        )

    data = payload.model_dump(exclude_unset=True)
    # Si renommage, verifier unicite.
    if "name" in data and data["name"] != team.name:
        dup = (await db.execute(
            select(Team.id).where(
                Team.entity_id == entity_id,
                Team.name == data["name"],
                Team.id != team_id,
                Team.deleted_at.is_(None),
            )
        )).scalar_one_or_none()
        if dup:
            raise StructuredHTTPException(
                409, code="TEAM_NAME_DUPLICATE",
                message=f"Une equipe nommee '{data['name']}' existe deja.",
            )

    for k, v in data.items():
        setattr(team, k, v)
    team.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(team)
    return await _hydrate_team(db, team, include_members=True)


@router.delete("/{team_id}", status_code=204)
async def delete_team(
    team_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = Depends(require_permission("teams.delete")),
    db: AsyncSession = Depends(get_db),
):
    team = await _get_team_or_404(db, team_id, entity_id)
    if not await _can_write_team(team, current_user=current_user, entity_id=entity_id, db=db):
        raise StructuredHTTPException(
            403, code="TEAM_NOT_OWNER",
            message="Seul le createur ou un admin peut supprimer cette equipe.",
        )
    team.deleted_at = datetime.now(timezone.utc)
    await db.commit()
    await record_audit(
        db, current_user.id, entity_id, "team.delete",
        target_type="team", target_id=team.id,
    )


# ─── Members ──────────────────────────────────────────────────────────────────


@router.post("/{team_id}/members", response_model=TeamMemberRead, status_code=201)
async def add_team_member(
    team_id: UUID,
    payload: TeamMemberCreate,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = Depends(require_permission("teams.member.manage")),
    db: AsyncSession = Depends(get_db),
):
    team = await _get_team_or_404(db, team_id, entity_id)
    if not await _can_write_team(team, current_user=current_user, entity_id=entity_id, db=db):
        raise StructuredHTTPException(403, code="TEAM_NOT_OWNER", message="Acces refuse.")

    # Verifie qu'il n'est pas deja actif
    cond = (
        TeamMember.user_id == payload.user_id if payload.user_id
        else TeamMember.contact_id == payload.contact_id
    )
    existing = (await db.execute(
        select(TeamMember.id).where(
            TeamMember.team_id == team_id,
            TeamMember.left_at.is_(None),
            cond,
        )
    )).scalar_one_or_none()
    if existing:
        raise StructuredHTTPException(
            409, code="TEAM_MEMBER_DUPLICATE",
            message="Ce membre est deja actif dans cette equipe.",
        )

    member = TeamMember(
        team_id=team_id,
        user_id=payload.user_id, contact_id=payload.contact_id,
        role=payload.role,
        added_by=current_user.id,
    )
    db.add(member)
    await db.commit()
    await db.refresh(member)
    return await _hydrate_member(db, member)


@router.patch("/{team_id}/members/{member_id}", response_model=TeamMemberRead)
async def update_team_member(
    team_id: UUID,
    member_id: UUID,
    payload: TeamMemberUpdate,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = Depends(require_permission("teams.member.manage")),
    db: AsyncSession = Depends(get_db),
):
    team = await _get_team_or_404(db, team_id, entity_id)
    if not await _can_write_team(team, current_user=current_user, entity_id=entity_id, db=db):
        raise StructuredHTTPException(403, code="TEAM_NOT_OWNER", message="Acces refuse.")
    member = (await db.execute(
        select(TeamMember).where(
            TeamMember.id == member_id, TeamMember.team_id == team_id,
        )
    )).scalar_one_or_none()
    if not member:
        raise StructuredHTTPException(404, code="TEAM_MEMBER_NOT_FOUND", message="Membre introuvable.")
    if member.left_at is not None:
        raise StructuredHTTPException(
            400, code="TEAM_MEMBER_INACTIVE",
            message="Ce membre est sorti — pas modifiable.",
        )
    member.role = payload.role
    await db.commit()
    await db.refresh(member)
    return await _hydrate_member(db, member)


@router.delete("/{team_id}/members/{member_id}", status_code=204)
async def remove_team_member(
    team_id: UUID,
    member_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = Depends(require_permission("teams.member.manage")),
    db: AsyncSession = Depends(get_db),
):
    """Sort un membre de l'equipe (UPDATE left_at = NOW). Pas de DELETE."""
    team = await _get_team_or_404(db, team_id, entity_id)
    if not await _can_write_team(team, current_user=current_user, entity_id=entity_id, db=db):
        raise StructuredHTTPException(403, code="TEAM_NOT_OWNER", message="Acces refuse.")
    member = (await db.execute(
        select(TeamMember).where(
            TeamMember.id == member_id, TeamMember.team_id == team_id,
        )
    )).scalar_one_or_none()
    if not member:
        raise StructuredHTTPException(404, code="TEAM_MEMBER_NOT_FOUND", message="Membre introuvable.")
    if member.left_at is not None:
        # Idempotent : pas d'erreur si deja sorti.
        return
    member.left_at = datetime.now(timezone.utc)
    await db.commit()


@router.post("/{team_id}/members/{member_id}/move", response_model=TeamMemberRead, status_code=200)
async def move_team_member(
    team_id: UUID,
    member_id: UUID,
    payload: TeamMemberMove,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = Depends(require_permission("teams.member.manage")),
    db: AsyncSession = Depends(get_db),
):
    """Deplace un membre vers une autre equipe.

    Atomic :
      1. UPDATE source membership SET left_at=NOW, moved_to_team_id=target
      2. INSERT new membership dans target (avec meme user/contact + role optionnel)

    Echoue si :
      * source/target meme equipe
      * pas write-access sur l'une des deux
      * membre deja actif dans target
    """
    if payload.target_team_id == team_id:
        raise StructuredHTTPException(
            400, code="TEAM_MOVE_SAME_TEAM",
            message="La cible doit etre une equipe differente.",
        )
    source = await _get_team_or_404(db, team_id, entity_id)
    target = await _get_team_or_404(db, payload.target_team_id, entity_id)
    if not await _can_write_team(source, current_user=current_user, entity_id=entity_id, db=db):
        raise StructuredHTTPException(403, code="TEAM_NOT_OWNER", message="Acces refuse source.")
    if not await _can_write_team(target, current_user=current_user, entity_id=entity_id, db=db):
        raise StructuredHTTPException(403, code="TEAM_NOT_OWNER", message="Acces refuse cible.")
    member = (await db.execute(
        select(TeamMember).where(
            TeamMember.id == member_id, TeamMember.team_id == team_id,
        )
    )).scalar_one_or_none()
    if not member or member.left_at is not None:
        raise StructuredHTTPException(
            404, code="TEAM_MEMBER_NOT_FOUND",
            message="Membre actif introuvable dans l'equipe source.",
        )

    # Verifie pas deja actif dans target.
    cond = (
        TeamMember.user_id == member.user_id if member.user_id
        else TeamMember.contact_id == member.contact_id
    )
    already = (await db.execute(
        select(TeamMember.id).where(
            TeamMember.team_id == target.id,
            TeamMember.left_at.is_(None),
            cond,
        )
    )).scalar_one_or_none()
    if already:
        raise StructuredHTTPException(
            409, code="TEAM_MEMBER_DUPLICATE",
            message="Ce membre est deja actif dans l'equipe cible.",
        )

    # Atomic: ferme source + ouvre target.
    member.left_at = datetime.now(timezone.utc)
    member.moved_to_team_id = target.id
    new_member = TeamMember(
        team_id=target.id,
        user_id=member.user_id, contact_id=member.contact_id,
        role=payload.role or member.role,
        added_by=current_user.id,
    )
    db.add(new_member)
    await db.commit()
    await db.refresh(new_member)
    return await _hydrate_member(db, new_member)


@router.get("/{team_id}/history", response_model=list[TeamMemberRead])
async def get_team_history(
    team_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = Depends(require_permission("teams.read")),
    db: AsyncSession = Depends(get_db),
):
    """Tous les membres (actifs + sortis), ordres chronologiquement DESC.

    Permet a l'UI de construire une timeline complete des entrees/sorties.
    """
    team = await _get_team_or_404(db, team_id, entity_id)
    if not await _can_read_team(team, current_user=current_user, entity_id=entity_id, db=db):
        raise StructuredHTTPException(403, code="TEAM_PRIVATE", message="Equipe privee.")
    members = (await db.execute(
        select(TeamMember)
        .where(TeamMember.team_id == team_id)
        .order_by(TeamMember.joined_at.desc())
    )).scalars().all()
    return [await _hydrate_member(db, m) for m in members]
