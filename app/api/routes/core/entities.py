"""Entity CRUD — manage entities, assign users to entities."""

import math
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_entity, get_current_user, require_permission
from app.core.database import get_db
from app.core.pagination import PaginationParams
from app.models.common import (
    Entity,
    User,
    UserGroup,
    UserGroupMember,
)
from app.schemas.common import OpsFluxSchema, PaginatedResponse

router = APIRouter(prefix="/api/v1/entities", tags=["entities"])


# ── Schemas ────────────────────────────────────────────────────────────────


class EntityRead(OpsFluxSchema):
    id: UUID
    code: str
    name: str
    country: str | None = None
    timezone: str
    active: bool
    created_at: str | None = None
    updated_at: str | None = None
    user_count: int = 0


class EntityDetail(EntityRead):
    """Entity detail with additional statistics."""
    pass


class EntityCreate(BaseModel):
    code: str = Field(..., min_length=1, max_length=50)
    name: str = Field(..., min_length=1, max_length=200)
    country: str | None = None
    timezone: str = Field(default="Africa/Douala", max_length=50)
    active: bool = True


class EntityUpdate(BaseModel):
    code: str | None = None
    name: str | None = None
    country: str | None = None
    timezone: str | None = None
    active: bool | None = None


class EntityUserRead(OpsFluxSchema):
    user_id: UUID
    first_name: str
    last_name: str
    email: str
    active: bool
    avatar_url: str | None = None
    group_names: list[str] = []


class EntityUserAdd(BaseModel):
    user_id: UUID


# ── List all entities (admin) ──────────────────────────────────────────────


@router.get(
    "",
    response_model=PaginatedResponse[EntityRead],
    dependencies=[require_permission("admin.system")],
)
async def list_entities(
    search: str | None = None,
    active: bool | None = None,
    pagination: PaginationParams = Depends(),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all entities with pagination (admin only)."""
    # Subquery for user count per entity (via UserGroup → UserGroupMember)
    user_count_sq = (
        select(func.count(func.distinct(UserGroupMember.user_id)))
        .select_from(UserGroupMember)
        .join(UserGroup, UserGroup.id == UserGroupMember.group_id)
        .where(UserGroup.entity_id == Entity.id)
        .correlate(Entity)
        .scalar_subquery()
    )

    stmt = select(Entity, user_count_sq.label("user_count"))

    # Apply filters
    if search:
        stmt = stmt.where(
            Entity.name.ilike(f"%{search}%") | Entity.code.ilike(f"%{search}%")
        )
    if active is not None:
        stmt = stmt.where(Entity.active == active)

    stmt = stmt.order_by(Entity.name)

    # Count total before pagination
    count_stmt = select(func.count()).select_from(stmt.subquery())
    total = (await db.execute(count_stmt)).scalar() or 0

    # Apply pagination
    stmt = stmt.offset(pagination.offset).limit(pagination.page_size)
    result = await db.execute(stmt)

    items = [
        EntityRead(
            id=row.Entity.id,
            code=row.Entity.code,
            name=row.Entity.name,
            country=row.Entity.country,
            timezone=row.Entity.timezone,
            active=row.Entity.active,
            created_at=row.Entity.created_at.isoformat() if row.Entity.created_at else None,
            updated_at=row.Entity.updated_at.isoformat() if row.Entity.updated_at else None,
            user_count=row.user_count or 0,
        )
        for row in result.all()
    ]

    pages = math.ceil(total / pagination.page_size) if total > 0 else 0

    return {
        "items": items,
        "total": total,
        "page": pagination.page,
        "page_size": pagination.page_size,
        "pages": pages,
    }


# ── Create entity ─────────────────────────────────────────────────────────


@router.post(
    "",
    response_model=EntityRead,
    status_code=201,
    dependencies=[require_permission("admin.system")],
)
async def create_entity(
    body: EntityCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new entity (admin only)."""
    # Check uniqueness of code
    existing = await db.execute(select(Entity).where(Entity.code == body.code))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail=f"Entity code '{body.code}' already exists")

    entity = Entity(
        code=body.code,
        name=body.name,
        country=body.country,
        timezone=body.timezone,
        active=body.active,
    )
    db.add(entity)
    await db.commit()
    await db.refresh(entity)

    return EntityRead(
        id=entity.id,
        code=entity.code,
        name=entity.name,
        country=entity.country,
        timezone=entity.timezone,
        active=entity.active,
        created_at=entity.created_at.isoformat() if entity.created_at else None,
        updated_at=entity.updated_at.isoformat() if entity.updated_at else None,
        user_count=0,
    )


# ── Get entity detail ─────────────────────────────────────────────────────


@router.get(
    "/{entity_id}",
    response_model=EntityDetail,
    dependencies=[require_permission("admin.system")],
)
async def get_entity(
    entity_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get entity detail."""
    user_count_sq = (
        select(func.count(func.distinct(UserGroupMember.user_id)))
        .select_from(UserGroupMember)
        .join(UserGroup, UserGroup.id == UserGroupMember.group_id)
        .where(UserGroup.entity_id == Entity.id)
        .correlate(Entity)
        .scalar_subquery()
    )

    stmt = select(Entity, user_count_sq.label("user_count")).where(Entity.id == entity_id)
    result = await db.execute(stmt)
    row = result.one_or_none()

    if not row:
        raise HTTPException(status_code=404, detail="Entity not found")

    return EntityDetail(
        id=row.Entity.id,
        code=row.Entity.code,
        name=row.Entity.name,
        country=row.Entity.country,
        timezone=row.Entity.timezone,
        active=row.Entity.active,
        created_at=row.Entity.created_at.isoformat() if row.Entity.created_at else None,
        updated_at=row.Entity.updated_at.isoformat() if row.Entity.updated_at else None,
        user_count=row.user_count or 0,
    )


# ── Update entity ─────────────────────────────────────────────────────────


@router.patch(
    "/{entity_id}",
    response_model=EntityRead,
    dependencies=[require_permission("admin.system")],
)
async def update_entity(
    entity_id: UUID,
    body: EntityUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update an entity (admin only)."""
    result = await db.execute(select(Entity).where(Entity.id == entity_id))
    entity = result.scalar_one_or_none()
    if not entity:
        raise HTTPException(status_code=404, detail="Entity not found")

    if body.code is not None:
        # Check code uniqueness (excluding self)
        existing = await db.execute(
            select(Entity).where(Entity.code == body.code, Entity.id != entity_id)
        )
        if existing.scalar_one_or_none():
            raise HTTPException(status_code=400, detail=f"Entity code '{body.code}' already exists")
        entity.code = body.code
    if body.name is not None:
        entity.name = body.name
    if body.country is not None:
        entity.country = body.country
    if body.timezone is not None:
        entity.timezone = body.timezone
    if body.active is not None:
        entity.active = body.active

    await db.commit()
    await db.refresh(entity)

    # Get user count
    user_count_result = await db.execute(
        select(func.count(func.distinct(UserGroupMember.user_id)))
        .select_from(UserGroupMember)
        .join(UserGroup, UserGroup.id == UserGroupMember.group_id)
        .where(UserGroup.entity_id == entity_id)
    )
    user_count = user_count_result.scalar() or 0

    return EntityRead(
        id=entity.id,
        code=entity.code,
        name=entity.name,
        country=entity.country,
        timezone=entity.timezone,
        active=entity.active,
        created_at=entity.created_at.isoformat() if entity.created_at else None,
        updated_at=entity.updated_at.isoformat() if entity.updated_at else None,
        user_count=user_count,
    )


# ── Delete (archive) entity ───────────────────────────────────────────────


@router.delete(
    "/{entity_id}",
    dependencies=[require_permission("admin.system")],
)
async def delete_entity_endpoint(
    entity_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Soft-delete (archive) an entity."""
    result = await db.execute(select(Entity).where(Entity.id == entity_id))
    entity = result.scalar_one_or_none()
    if not entity:
        raise HTTPException(status_code=404, detail="Entity not found")

    entity.active = False
    await db.commit()

    return {"detail": "Entity archived", "id": str(entity_id)}


# ── Entity users ──────────────────────────────────────────────────────────


@router.get(
    "/{entity_id}/users",
    response_model=list[EntityUserRead],
    dependencies=[require_permission("admin.system")],
)
async def list_entity_users(
    entity_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List users associated with this entity via UserGroup membership."""
    # Verify entity exists
    entity_result = await db.execute(select(Entity).where(Entity.id == entity_id))
    if not entity_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Entity not found")

    # Get distinct users who are members of groups in this entity
    stmt = (
        select(User)
        .join(UserGroupMember, UserGroupMember.user_id == User.id)
        .join(UserGroup, UserGroup.id == UserGroupMember.group_id)
        .where(UserGroup.entity_id == entity_id)
        .distinct()
        .order_by(User.last_name, User.first_name)
    )
    result = await db.execute(stmt)
    users = result.scalars().all()

    # For each user, get their group names in this entity
    items = []
    for user in users:
        group_stmt = (
            select(UserGroup.name)
            .join(UserGroupMember, UserGroupMember.group_id == UserGroup.id)
            .where(
                UserGroupMember.user_id == user.id,
                UserGroup.entity_id == entity_id,
            )
        )
        group_result = await db.execute(group_stmt)
        group_names = [row[0] for row in group_result.all()]

        items.append(
            EntityUserRead(
                user_id=user.id,
                first_name=user.first_name,
                last_name=user.last_name,
                email=user.email,
                active=user.active,
                avatar_url=user.avatar_url,
                group_names=group_names,
            )
        )

    return items


# ── Add user to entity ────────────────────────────────────────────────────


@router.post(
    "/{entity_id}/users",
    dependencies=[require_permission("admin.system")],
    status_code=201,
)
async def add_user_to_entity(
    entity_id: UUID,
    body: EntityUserAdd,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Add a user to an entity by creating a UserGroupMember in a default group."""
    # Verify entity exists
    entity_result = await db.execute(select(Entity).where(Entity.id == entity_id))
    entity = entity_result.scalar_one_or_none()
    if not entity:
        raise HTTPException(status_code=404, detail="Entity not found")

    # Verify user exists
    user_result = await db.execute(select(User).where(User.id == body.user_id))
    user = user_result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Check if user already belongs to any group in this entity
    existing = await db.execute(
        select(UserGroupMember)
        .join(UserGroup, UserGroup.id == UserGroupMember.group_id)
        .where(
            UserGroupMember.user_id == body.user_id,
            UserGroup.entity_id == entity_id,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="User already belongs to this entity")

    # Find or create a default group for this entity (role_code = 'viewer')
    default_group_result = await db.execute(
        select(UserGroup).where(
            UserGroup.entity_id == entity_id,
            UserGroup.name == "Default",
            UserGroup.active == True,
        )
    )
    default_group = default_group_result.scalar_one_or_none()

    if not default_group:
        default_group = UserGroup(
            entity_id=entity_id,
            name="Default",
            role_code="viewer",
            active=True,
        )
        db.add(default_group)
        await db.flush()

    # Add user to the default group
    membership = UserGroupMember(
        user_id=body.user_id,
        group_id=default_group.id,
    )
    db.add(membership)
    await db.commit()

    return {"detail": "User added to entity", "user_id": str(body.user_id), "entity_id": str(entity_id)}


# ── Remove user from entity ──────────────────────────────────────────────


@router.delete(
    "/{entity_id}/users/{user_id}",
    dependencies=[require_permission("admin.system")],
    status_code=204,
)
async def remove_user_from_entity(
    entity_id: UUID,
    user_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Remove a user from all groups in an entity."""
    # Verify entity exists
    entity_result = await db.execute(select(Entity).where(Entity.id == entity_id))
    if not entity_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Entity not found")

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
