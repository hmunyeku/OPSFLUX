"""User management routes."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import get_current_entity, get_current_user, require_permission
from app.core.database import get_db
from app.core.pagination import PaginationParams, paginate
from app.core.rbac import invalidate_rbac_cache
from app.core.security import hash_password
from app.models.common import (
    Entity,
    Permission,
    Role,
    RolePermission,
    Tier,
    User,
    UserGroup,
    UserGroupMember,
    UserGroupRole,
    UserPermissionOverride,
    UserTierLink,
)
from app.schemas.common import OpsFluxSchema, PaginatedResponse, UserCreate, UserRead, UserUpdate

router = APIRouter(prefix="/api/v1/users", tags=["users"])


@router.get("", response_model=PaginatedResponse[UserRead])
async def list_users(
    search: str | None = None,
    active: bool | None = None,
    user_type: str | None = None,
    mfa_enabled: bool | None = None,
    pagination: PaginationParams = Depends(),
    _: None = require_permission("user.read"),
    db: AsyncSession = Depends(get_db),
):
    """List users with pagination and optional search/filters."""
    query = select(User).options(selectinload(User.job_position))
    if active is not None:
        query = query.where(User.active == active)
    if user_type is not None:
        query = query.where(User.user_type == user_type)
    if mfa_enabled is not None:
        query = query.where(User.mfa_enabled == mfa_enabled)
    if search:
        like = f"%{search}%"
        query = query.where(
            User.first_name.ilike(like) | User.last_name.ilike(like) | User.email.ilike(like)
        )
    query = query.order_by(User.last_name)
    return await paginate(db, query, pagination)


@router.post("", response_model=UserRead, status_code=201)
async def create_user(
    body: UserCreate,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("user.create"),
    db: AsyncSession = Depends(get_db),
):
    """Create a new user and send an invitation email."""
    # Check email uniqueness
    existing = await db.execute(select(User).where(User.email == body.email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Email already registered")

    user = User(
        email=body.email,
        first_name=body.first_name,
        last_name=body.last_name,
        hashed_password=hash_password(body.password) if body.password else None,
        default_entity_id=body.default_entity_id or entity_id,
        language=body.language,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    # Auto-assign user to entity's default group (if entity has one)
    target_entity_id = body.default_entity_id or entity_id
    if target_entity_id:
        from app.models.common import UserGroup, UserGroupMember, EntityUserAssignment
        # Find entity's default group (first group linked to this entity)
        default_group = await db.execute(
            select(UserGroup).where(
                UserGroup.entity_id == target_entity_id,
                UserGroup.active == True,
            ).limit(1)
        )
        group = default_group.scalar_one_or_none()
        if group:
            # Check if already member
            existing_member = await db.execute(
                select(UserGroupMember).where(
                    UserGroupMember.user_id == user.id,
                    UserGroupMember.group_id == group.id,
                )
            )
            if not existing_member.scalar_one_or_none():
                db.add(UserGroupMember(user_id=user.id, group_id=group.id))
                await db.commit()

    # Send invitation email (non-blocking — don't fail creation if email fails)
    try:
        from app.core.security import create_password_reset_token
        from app.core.email_templates import render_and_send_email
        from app.core.config import settings as app_settings

        reset_token = create_password_reset_token(user_id=user.id, email=user.email)
        invitation_url = f"{app_settings.FRONTEND_URL}/reset-password?token={reset_token}"

        # Fetch entity name for template
        from app.models.common import Entity
        entity = await db.get(Entity, entity_id)

        await render_and_send_email(
            db=db,
            slug="user_invitation",
            entity_id=entity_id,
            language=user.language or "fr",
            to=user.email,
            variables={
                "invitation_url": invitation_url,
                "user": {"first_name": user.first_name, "last_name": user.last_name, "email": user.email},
                "inviter": {"first_name": current_user.first_name, "last_name": current_user.last_name},
                "entity": {"name": entity.name if entity else "OpsFlux"},
            },
        )
    except Exception:
        import logging
        logging.getLogger(__name__).warning("Failed to send invitation email to %s", user.email, exc_info=True)

    return user


# ── Current-user "me" endpoints (must be before /{user_id}) ──────────────


class MyRoleRead(BaseModel):
    code: str
    name: str
    description: str | None = None
    module: str | None = None


class MyGroupRead(BaseModel):
    id: UUID
    name: str
    role_codes: list[str] = []
    member_count: int = 0


class PermissionMatrixEntry(BaseModel):
    module: str
    permissions: list[str]


@router.get("/me/roles", response_model=list[MyRoleRead])
async def get_my_roles(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get roles assigned to the current user via group memberships."""
    result = await db.execute(
        select(Role)
        .join(UserGroupRole, UserGroupRole.role_code == Role.code)
        .join(UserGroup, UserGroup.id == UserGroupRole.group_id)
        .join(UserGroupMember, UserGroupMember.group_id == UserGroup.id)
        .where(UserGroupMember.user_id == current_user.id, UserGroup.active == True)  # noqa: E712
        .distinct()
        .order_by(Role.code)
    )
    return [MyRoleRead(code=r.code, name=r.name, description=r.description, module=r.module) for r in result.scalars().all()]


@router.get("/me/groups", response_model=list[MyGroupRead])
async def get_my_groups(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get groups the current user belongs to."""
    member_count_subq = (
        select(func.count())
        .select_from(UserGroupMember)
        .where(UserGroupMember.group_id == UserGroup.id)
        .correlate(UserGroup)
        .scalar_subquery()
    )
    result = await db.execute(
        select(
            UserGroup.id,
            UserGroup.name,
            member_count_subq.label("member_count"),
        )
        .join(UserGroupMember, UserGroupMember.group_id == UserGroup.id)
        .where(UserGroupMember.user_id == current_user.id, UserGroup.active == True)  # noqa: E712
        .order_by(UserGroup.name)
    )
    rows = result.all()

    # Batch-load role codes per group
    group_ids = [row.id for row in rows]
    roles_map: dict[UUID, list[str]] = {}
    if group_ids:
        roles_result = await db.execute(
            select(UserGroupRole.group_id, UserGroupRole.role_code)
            .where(UserGroupRole.group_id.in_(group_ids))
        )
        for gr in roles_result.all():
            roles_map.setdefault(gr[0], []).append(gr[1])

    return [
        MyGroupRead(id=row.id, name=row.name, role_codes=roles_map.get(row.id, []), member_count=row.member_count or 0)
        for row in rows
    ]


@router.get("/me/permissions", response_model=list[PermissionMatrixEntry])
async def get_my_permissions_matrix(
    current_user: User = Depends(get_current_user),
    entity_id: UUID = Depends(get_current_entity),
    db: AsyncSession = Depends(get_db),
):
    """Get the current user's effective permissions grouped by module."""
    from app.core.rbac import get_user_permissions

    perms = await get_user_permissions(current_user.id, entity_id, db)
    # Group by module prefix
    grouped: dict[str, list[str]] = {}
    for p in sorted(perms):
        parts = p.split(".", 1)
        module = parts[0] if len(parts) > 1 else "core"
        grouped.setdefault(module, []).append(p)
    return [PermissionMatrixEntry(module=mod, permissions=codes) for mod, codes in sorted(grouped.items())]


# ── Stats (must be before /{user_id} routes) ────────────────────────────


@router.get("/stats/overview")
async def get_users_stats(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get user statistics for dashboard overview."""
    from app.models.common import UserSession
    from sqlalchemy import func as sqlfunc
    from datetime import datetime, timezone, timedelta

    total = (await db.execute(select(sqlfunc.count(User.id)))).scalar() or 0
    active = (await db.execute(select(sqlfunc.count(User.id)).where(User.active == True))).scalar() or 0  # noqa: E712
    mfa_count = (await db.execute(select(sqlfunc.count(User.id)).where(User.mfa_enabled == True))).scalar() or 0  # noqa: E712
    locked_count = (await db.execute(
        select(sqlfunc.count(User.id)).where(
            User.locked_until.isnot(None),
            User.locked_until > datetime.now(timezone.utc),
        )
    )).scalar() or 0

    # Online: sessions active in last 15 minutes
    threshold = datetime.now(timezone.utc) - timedelta(minutes=15)
    online = (await db.execute(
        select(sqlfunc.count(sqlfunc.distinct(UserSession.user_id))).where(
            UserSession.revoked == False,  # noqa: E712
            UserSession.last_active_at > threshold,
        )
    )).scalar() or 0

    return {
        "total": total,
        "active": active,
        "inactive": total - active,
        "online": online,
        "mfa_count": mfa_count,
        "locked_count": locked_count,
    }


@router.get("/stats/recent")
async def get_recent_activity(
    limit: int = 5,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get recently created/modified users, groups, and roles for dashboard widgets."""
    from app.models.common import UserGroup, Role as RoleModel
    from sqlalchemy import func as sqlfunc
    from datetime import timedelta

    # Recent users (ordered by updated_at desc)
    users_result = await db.execute(
        select(User).order_by(User.updated_at.desc()).limit(limit)
    )
    users = []
    for u in users_result.scalars().all():
        # If updated_at is within 2 seconds of created_at, consider it "created"
        is_created = (u.updated_at - u.created_at) < timedelta(seconds=2)
        users.append({
            "id": str(u.id),
            "first_name": u.first_name,
            "last_name": u.last_name,
            "email": u.email,
            "avatar_url": u.avatar_url,
            "created_at": u.created_at.isoformat(),
            "updated_at": u.updated_at.isoformat(),
            "action": "created" if is_created else "modified",
        })

    # Recent groups (ordered by updated_at desc)
    member_count_sq = (
        select(func.count())
        .select_from(UserGroupMember)
        .where(UserGroupMember.group_id == UserGroup.id)
        .correlate(UserGroup)
        .scalar_subquery()
    )
    groups_result = await db.execute(
        select(
            UserGroup,
            member_count_sq.label("member_count"),
        )
        .order_by(UserGroup.updated_at.desc())
        .limit(limit)
    )
    group_rows = groups_result.all()

    # Batch-load roles for these groups
    from app.models.common import UserGroupRole as UGR
    g_ids = [row.UserGroup.id for row in group_rows]
    g_roles_map: dict = {}
    if g_ids:
        gr_result = await db.execute(
            select(UGR.group_id, RoleModel.code, RoleModel.name)
            .join(RoleModel, RoleModel.code == UGR.role_code)
            .where(UGR.group_id.in_(g_ids))
        )
        for gr in gr_result.all():
            g_roles_map.setdefault(gr[0], []).append({"code": gr[1], "name": gr[2]})

    groups = []
    for row in group_rows:
        g = row.UserGroup
        is_created = (g.updated_at - g.created_at) < timedelta(seconds=2)
        role_pairs = g_roles_map.get(g.id, [])
        groups.append({
            "id": str(g.id),
            "name": g.name,
            "role_codes": [r["code"] for r in role_pairs],
            "role_names": [r["name"] for r in role_pairs],
            "member_count": row.member_count or 0,
            "created_at": g.created_at.isoformat(),
            "updated_at": g.updated_at.isoformat(),
            "action": "created" if is_created else "modified",
        })

    # Recent roles (ordered by updated_at desc)
    roles_result = await db.execute(
        select(RoleModel).order_by(RoleModel.updated_at.desc()).limit(limit)
    )
    roles = []
    for r in roles_result.scalars().all():
        is_created = (r.updated_at - r.created_at) < timedelta(seconds=2)
        roles.append({
            "code": r.code,
            "name": r.name,
            "module": r.module,
            "created_at": r.created_at.isoformat(),
            "updated_at": r.updated_at.isoformat(),
            "action": "created" if is_created else "modified",
        })

    return {"users": users, "groups": groups, "roles": roles}


@router.get("/{user_id}", response_model=UserRead)
async def get_user(
    user_id: UUID,
    _: None = require_permission("user.read"),
    db: AsyncSession = Depends(get_db),
):
    """Get user by ID."""
    result = await db.execute(
        select(User).options(selectinload(User.job_position)).where(User.id == user_id)
    )
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


@router.patch("/{user_id}", response_model=UserRead)
async def update_user(
    user_id: UUID,
    body: UserUpdate,
    _: None = require_permission("user.update"),
    db: AsyncSession = Depends(get_db),
):
    """Update user details."""
    result = await db.execute(
        select(User).options(selectinload(User.job_position)).where(User.id == user_id)
    )
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    update_data = body.model_dump(exclude_unset=True)

    # Check email uniqueness if changing email
    if "email" in update_data and update_data["email"] != user.email:
        dup = await db.execute(select(User).where(User.email == update_data["email"]))
        if dup.scalar_one_or_none():
            raise HTTPException(status_code=409, detail="Email already registered")

    for field, value in update_data.items():
        setattr(user, field, value)

    await db.commit()
    await db.refresh(user)
    return user


# ── User entities with groups/roles ─────────────────────────────────────────


class UserEntityGroupRead(OpsFluxSchema):
    group_id: UUID
    group_name: str
    role_codes: list[str] = []
    role_names: list[str] = []


class UserEntityRead(OpsFluxSchema):
    entity_id: UUID
    entity_code: str
    entity_name: str
    groups: list[UserEntityGroupRead] = []


class UserEntityAssign(BaseModel):
    entity_id: UUID


@router.get(
    "/{user_id}/entities",
    response_model=list[UserEntityRead],
    dependencies=[require_permission("user.read")],
)
async def get_user_entities(
    user_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    """Get all entities a user belongs to, with their groups and roles per entity."""
    # Verify user exists
    user_result = await db.execute(select(User).where(User.id == user_id))
    if not user_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="User not found")

    # Get all groups+entities for this user
    stmt = (
        select(
            Entity.id.label("entity_id"),
            Entity.code.label("entity_code"),
            Entity.name.label("entity_name"),
            UserGroup.id.label("group_id"),
            UserGroup.name.label("group_name"),
        )
        .select_from(UserGroupMember)
        .join(UserGroup, UserGroup.id == UserGroupMember.group_id)
        .join(Entity, Entity.id == UserGroup.entity_id)
        .where(
            UserGroupMember.user_id == user_id,
            UserGroup.active == True,  # noqa: E712
        )
        .order_by(Entity.name, UserGroup.name)
    )
    result = await db.execute(stmt)
    rows = result.all()

    # Batch-load roles for all groups
    all_group_ids = list({row.group_id for row in rows})
    roles_map: dict[UUID, list[tuple[str, str]]] = {}
    if all_group_ids:
        roles_result = await db.execute(
            select(UserGroupRole.group_id, Role.code, Role.name)
            .join(Role, Role.code == UserGroupRole.role_code)
            .where(UserGroupRole.group_id.in_(all_group_ids))
            .order_by(Role.name)
        )
        for r in roles_result.all():
            roles_map.setdefault(r[0], []).append((r[1], r[2]))

    # Group by entity
    entities_map: dict[UUID, UserEntityRead] = {}
    for row in rows:
        eid = row.entity_id
        if eid not in entities_map:
            entities_map[eid] = UserEntityRead(
                entity_id=eid,
                entity_code=row.entity_code,
                entity_name=row.entity_name,
                groups=[],
            )
        role_pairs = roles_map.get(row.group_id, [])
        entities_map[eid].groups.append(
            UserEntityGroupRead(
                group_id=row.group_id,
                group_name=row.group_name,
                role_codes=[r[0] for r in role_pairs],
                role_names=[r[1] for r in role_pairs],
            )
        )

    return list(entities_map.values())


@router.post(
    "/{user_id}/entities",
    dependencies=[require_permission("user.update")],
    status_code=201,
)
async def assign_user_to_entity(
    user_id: UUID,
    body: UserEntityAssign,
    db: AsyncSession = Depends(get_db),
):
    """Add a user to an entity by creating a membership in the default group."""
    # Verify user exists
    user_result = await db.execute(select(User).where(User.id == user_id))
    if not user_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="User not found")

    # Verify entity exists
    entity_result = await db.execute(select(Entity).where(Entity.id == body.entity_id))
    if not entity_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Entity not found")

    # Check if user already belongs to any group in this entity
    existing = await db.execute(
        select(UserGroupMember)
        .join(UserGroup, UserGroup.id == UserGroupMember.group_id)
        .where(
            UserGroupMember.user_id == user_id,
            UserGroup.entity_id == body.entity_id,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="User already belongs to this entity")

    # Find or create a default group for this entity
    default_group_result = await db.execute(
        select(UserGroup).where(
            UserGroup.entity_id == body.entity_id,
            UserGroup.name == "Default",
            UserGroup.active == True,  # noqa: E712
        )
    )
    default_group = default_group_result.scalar_one_or_none()

    if not default_group:
        default_group = UserGroup(
            entity_id=body.entity_id,
            name="Default",
            active=True,
        )
        db.add(default_group)
        await db.flush()
        db.add(UserGroupRole(group_id=default_group.id, role_code="viewer"))

    # Add user to the default group
    membership = UserGroupMember(user_id=user_id, group_id=default_group.id)
    db.add(membership)
    await db.commit()

    await invalidate_rbac_cache(user_id)

    return {"detail": "User added to entity", "user_id": str(user_id), "entity_id": str(body.entity_id)}


@router.delete(
    "/{user_id}/entities/{entity_id}",
    dependencies=[require_permission("user.update")],
    status_code=204,
)
async def remove_user_from_entity(
    user_id: UUID,
    entity_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    """Remove a user from all groups in an entity."""
    # Find all memberships for this user in groups belonging to this entity
    memberships_stmt = (
        select(UserGroupMember)
        .join(UserGroup, UserGroup.id == UserGroupMember.group_id)
        .where(
            UserGroupMember.user_id == user_id,
            UserGroup.entity_id == entity_id,
        )
    )
    memberships_result = await db.execute(memberships_stmt)
    memberships = memberships_result.scalars().all()

    if not memberships:
        raise HTTPException(status_code=404, detail="User not found in this entity")

    for membership in memberships:
        await db.delete(membership)

    await db.commit()

    await invalidate_rbac_cache(user_id)


# ── User permission overrides ─────────────────────────────────────────────


class UserPermOverrideRead(OpsFluxSchema):
    permission_code: str
    granted: bool


class UserPermOverrideSet(BaseModel):
    """Replace all permission overrides for a user."""
    overrides: list[UserPermOverrideRead] = Field(default_factory=list)


@router.get(
    "/{user_id}/permission-overrides",
    response_model=list[UserPermOverrideRead],
    dependencies=[require_permission("core.rbac.read")],
)
async def get_user_permission_overrides(
    user_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    """Get all permission overrides for a user."""
    user_result = await db.execute(select(User).where(User.id == user_id))
    if not user_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="User not found")

    result = await db.execute(
        select(UserPermissionOverride)
        .where(UserPermissionOverride.user_id == user_id)
        .order_by(UserPermissionOverride.permission_code)
    )
    return [
        UserPermOverrideRead(permission_code=o.permission_code, granted=o.granted)
        for o in result.scalars().all()
    ]


@router.put(
    "/{user_id}/permission-overrides",
    response_model=list[UserPermOverrideRead],
    dependencies=[require_permission("core.rbac.manage")],
)
async def set_user_permission_overrides(
    user_id: UUID,
    body: UserPermOverrideSet,
    db: AsyncSession = Depends(get_db),
):
    """Replace all permission overrides for a user."""
    user_result = await db.execute(select(User).where(User.id == user_id))
    if not user_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="User not found")

    # Validate permission codes
    if body.overrides:
        codes = [o.permission_code for o in body.overrides]
        valid_result = await db.execute(
            select(Permission.code).where(Permission.code.in_(codes))
        )
        valid_codes = {row[0] for row in valid_result.all()}
        invalid = set(codes) - valid_codes
        if invalid:
            raise HTTPException(
                status_code=400,
                detail=f"Unknown permissions: {', '.join(sorted(invalid))}",
            )

    # Replace: delete all existing, insert new
    await db.execute(
        delete(UserPermissionOverride).where(UserPermissionOverride.user_id == user_id)
    )
    for override in body.overrides:
        db.add(UserPermissionOverride(
            user_id=user_id,
            permission_code=override.permission_code,
            granted=override.granted,
        ))

    await db.commit()
    await invalidate_rbac_cache(user_id)

    return [
        UserPermOverrideRead(permission_code=o.permission_code, granted=o.granted)
        for o in body.overrides
    ]


@router.get(
    "/{user_id}/effective-permissions",
    dependencies=[require_permission("core.rbac.read")],
)
async def get_user_effective_permissions(
    user_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    db: AsyncSession = Depends(get_db),
):
    """Get a user's effective permissions with source tracking for badge display."""
    from app.core.rbac import get_user_permissions_with_sources

    user_result = await db.execute(select(User).where(User.id == user_id))
    if not user_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="User not found")

    perms = await get_user_permissions_with_sources(user_id, entity_id, db)
    return [
        {"permission_code": code, "source": source}
        for code, source in sorted(perms.items())
    ]


@router.get("/{user_id}/ip-location")
async def get_user_ip_location(
    user_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get geolocation for a user's last login IP."""
    from app.core.ip_geolocation import get_ip_location
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if not user.last_login_ip:
        return {"ip": None, "location": None}
    location = await get_ip_location(user.last_login_ip)
    return {"ip": user.last_login_ip, "location": location}


@router.get("/{user_id}/profile-completeness")
async def get_profile_completeness(
    user_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Compute profile completeness percentage and list missing fields."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Define required profile fields and their labels
    profile_fields = {
        "first_name": "Prénom",
        "last_name": "Nom",
        "email": "Email",
        "gender": "Genre",
        "nationality": "Nationalité",
        "birth_country": "Pays de naissance",
        "birth_date": "Date de naissance",
        "birth_city": "Ville de naissance",
        "contractual_airport": "Aéroport contractuel",
        "nearest_airport": "Aéroport le plus proche",
        "passport_name": "Nom passeport",
    }

    filled = 0
    missing = []
    for field, label in profile_fields.items():
        value = getattr(user, field, None)
        if value:
            filled += 1
        else:
            missing.append({"field": field, "label": label})

    total = len(profile_fields)
    percentage = round((filled / total) * 100) if total > 0 else 0

    return {
        "percentage": percentage,
        "filled": filled,
        "total": total,
        "missing": missing,
    }


# ── User Tier Links (external company linking) ───────────────────────────────


class UserTierLinkRead(OpsFluxSchema):
    id: UUID
    tier_id: UUID
    tier_code: str
    tier_name: str
    tier_type: str | None = None
    role: str
    created_at: str | None = None


class UserTierLinkCreate(BaseModel):
    tier_id: UUID
    role: str = "viewer"


@router.get("/{user_id}/tier-links", response_model=list[UserTierLinkRead])
async def get_user_tier_links(
    user_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get all tiers (companies) linked to a user."""
    stmt = (
        select(UserTierLink, Tier.code, Tier.name, Tier.type)
        .join(Tier, Tier.id == UserTierLink.tier_id)
        .where(UserTierLink.user_id == user_id)
        .order_by(Tier.name)
    )
    result = await db.execute(stmt)
    return [
        UserTierLinkRead(
            id=row.UserTierLink.id,
            tier_id=row.UserTierLink.tier_id,
            tier_code=row.code,
            tier_name=row.name,
            tier_type=row.type,
            role=row.UserTierLink.role,
            created_at=row.UserTierLink.created_at.isoformat() if row.UserTierLink.created_at else None,
        )
        for row in result.all()
    ]


@router.post("/{user_id}/tier-links", status_code=201)
async def link_user_to_tier(
    user_id: UUID,
    body: UserTierLinkCreate,
    current_user: User = Depends(get_current_user),
    _: None = require_permission("core.users.manage"),
    db: AsyncSession = Depends(get_db),
):
    """Link a user to a tier (company). Typically used for external users."""
    # Verify user exists
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Verify tier exists
    tier = await db.get(Tier, body.tier_id)
    if not tier:
        raise HTTPException(status_code=404, detail="Tier not found")

    # Check not already linked
    existing = await db.execute(
        select(UserTierLink).where(
            UserTierLink.user_id == user_id,
            UserTierLink.tier_id == body.tier_id,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="User already linked to this tier")

    link = UserTierLink(user_id=user_id, tier_id=body.tier_id, role=body.role)
    db.add(link)
    await db.commit()
    await db.refresh(link)

    return UserTierLinkRead(
        id=link.id,
        tier_id=link.tier_id,
        tier_code=tier.code,
        tier_name=tier.name,
        tier_type=tier.type,
        role=link.role,
        created_at=link.created_at.isoformat() if link.created_at else None,
    )


@router.delete("/{user_id}/tier-links/{link_id}", status_code=204)
async def unlink_user_from_tier(
    user_id: UUID,
    link_id: UUID,
    current_user: User = Depends(get_current_user),
    _: None = require_permission("core.users.manage"),
    db: AsyncSession = Depends(get_db),
):
    """Remove a user-tier link."""
    link = await db.execute(
        select(UserTierLink).where(
            UserTierLink.id == link_id,
            UserTierLink.user_id == user_id,
        )
    )
    link_obj = link.scalar_one_or_none()
    if not link_obj:
        raise HTTPException(status_code=404, detail="Tier link not found")

    await db.delete(link_obj)
    await db.commit()
