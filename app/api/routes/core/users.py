"""User management routes."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

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
    User,
    UserGroup,
    UserGroupMember,
)
from app.schemas.common import OpsFluxSchema, PaginatedResponse, UserCreate, UserRead, UserUpdate

router = APIRouter(prefix="/api/v1/users", tags=["users"])


@router.get("", response_model=PaginatedResponse[UserRead])
async def list_users(
    search: str | None = None,
    pagination: PaginationParams = Depends(),
    _: None = require_permission("user.read"),
    db: AsyncSession = Depends(get_db),
):
    """List users with pagination and optional search."""
    query = select(User).where(User.active == True)
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
    _: None = require_permission("user.create"),
    db: AsyncSession = Depends(get_db),
):
    """Create a new user."""
    # Check email uniqueness
    existing = await db.execute(select(User).where(User.email == body.email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Email already registered")

    user = User(
        email=body.email,
        first_name=body.first_name,
        last_name=body.last_name,
        hashed_password=hash_password(body.password) if body.password else None,
        default_entity_id=body.default_entity_id,
        language=body.language,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
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
    role_code: str
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
        .join(UserGroup, UserGroup.role_code == Role.code)
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
            UserGroup.role_code,
            member_count_subq.label("member_count"),
        )
        .join(UserGroupMember, UserGroupMember.group_id == UserGroup.id)
        .where(UserGroupMember.user_id == current_user.id, UserGroup.active == True)  # noqa: E712
        .order_by(UserGroup.name)
    )
    return [
        MyGroupRead(id=row.id, name=row.name, role_code=row.role_code, member_count=row.member_count or 0)
        for row in result.all()
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


@router.get("/{user_id}", response_model=UserRead)
async def get_user(
    user_id: UUID,
    _: None = require_permission("user.read"),
    db: AsyncSession = Depends(get_db),
):
    """Get user by ID."""
    result = await db.execute(select(User).where(User.id == user_id))
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
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    update_data = body.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(user, field, value)

    await db.commit()
    await db.refresh(user)
    return user


# ── User entities with groups/roles ─────────────────────────────────────────


class UserEntityGroupRead(OpsFluxSchema):
    group_id: UUID
    group_name: str
    role_code: str
    role_name: str | None = None


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

    # Get all groups+entities+roles for this user in one query
    stmt = (
        select(
            Entity.id.label("entity_id"),
            Entity.code.label("entity_code"),
            Entity.name.label("entity_name"),
            UserGroup.id.label("group_id"),
            UserGroup.name.label("group_name"),
            UserGroup.role_code,
            Role.name.label("role_name"),
        )
        .select_from(UserGroupMember)
        .join(UserGroup, UserGroup.id == UserGroupMember.group_id)
        .join(Entity, Entity.id == UserGroup.entity_id)
        .outerjoin(Role, Role.code == UserGroup.role_code)
        .where(
            UserGroupMember.user_id == user_id,
            UserGroup.active == True,  # noqa: E712
        )
        .order_by(Entity.name, UserGroup.name)
    )
    result = await db.execute(stmt)
    rows = result.all()

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
        entities_map[eid].groups.append(
            UserEntityGroupRead(
                group_id=row.group_id,
                group_name=row.group_name,
                role_code=row.role_code,
                role_name=row.role_name,
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
            role_code="viewer",
            active=True,
        )
        db.add(default_group)
        await db.flush()

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
