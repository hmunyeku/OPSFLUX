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
    UserGroupRole,
)
from app.schemas.common import OpsFluxSchema, PaginatedResponse

router = APIRouter(prefix="/api/v1/entities", tags=["entities"])


# ── Schemas ────────────────────────────────────────────────────────────────


class EntityRead(OpsFluxSchema):
    id: UUID
    code: str
    name: str
    trade_name: str | None = None
    logo_url: str | None = None
    parent_id: UUID | None = None
    # Legal
    legal_form: str | None = None
    registration_number: str | None = None
    tax_id: str | None = None
    vat_number: str | None = None
    capital: float | None = None
    currency: str = "XAF"
    fiscal_year_start: int = 1
    industry: str | None = None
    founded_date: str | None = None
    # Address
    address_line1: str | None = None
    address_line2: str | None = None
    city: str | None = None
    state: str | None = None
    zip_code: str | None = None
    country: str | None = None
    # Contact
    phone: str | None = None
    fax: str | None = None
    email: str | None = None
    website: str | None = None
    # Config
    timezone: str = "Africa/Douala"
    language: str = "fr"
    active: bool = True
    # Extended
    social_networks: dict | None = None
    opening_hours: dict | None = None
    notes: str | None = None
    # Computed
    created_at: str | None = None
    updated_at: str | None = None
    user_count: int = 0


class EntityDetail(EntityRead):
    """Entity detail with children count and parent info."""
    parent_name: str | None = None
    children_count: int = 0


class EntityCreate(BaseModel):
    code: str = Field(..., min_length=1, max_length=50)
    name: str = Field(..., min_length=1, max_length=200)
    trade_name: str | None = None
    parent_id: UUID | None = None
    # Legal
    legal_form: str | None = None
    registration_number: str | None = None
    tax_id: str | None = None
    vat_number: str | None = None
    capital: float | None = None
    currency: str = "XAF"
    fiscal_year_start: int = Field(default=1, ge=1, le=12)
    industry: str | None = None
    founded_date: str | None = None
    # Address
    address_line1: str | None = None
    address_line2: str | None = None
    city: str | None = None
    state: str | None = None
    zip_code: str | None = None
    country: str | None = None
    # Contact
    phone: str | None = None
    fax: str | None = None
    email: str | None = None
    website: str | None = None
    # Config
    timezone: str = Field(default="Africa/Douala", max_length=50)
    language: str = Field(default="fr", max_length=10)
    active: bool = True
    # Extended
    social_networks: dict | None = None
    opening_hours: dict | None = None
    notes: str | None = None


class EntityUpdate(BaseModel):
    code: str | None = None
    name: str | None = None
    trade_name: str | None = None
    parent_id: UUID | None = None
    logo_url: str | None = None
    # Legal
    legal_form: str | None = None
    registration_number: str | None = None
    tax_id: str | None = None
    vat_number: str | None = None
    capital: float | None = None
    currency: str | None = None
    fiscal_year_start: int | None = None
    industry: str | None = None
    founded_date: str | None = None
    # Address
    address_line1: str | None = None
    address_line2: str | None = None
    city: str | None = None
    state: str | None = None
    zip_code: str | None = None
    country: str | None = None
    # Contact
    phone: str | None = None
    fax: str | None = None
    email: str | None = None
    website: str | None = None
    # Config
    timezone: str | None = None
    language: str | None = None
    active: bool | None = None
    # Extended
    social_networks: dict | None = None
    opening_hours: dict | None = None
    notes: str | None = None


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


# ── Helpers ───────────────────────────────────────────────────────────────


def _entity_to_read(entity: Entity, user_count: int = 0) -> EntityRead:
    """Serialize an Entity ORM model to EntityRead schema."""
    return EntityRead(
        id=entity.id,
        code=entity.code,
        name=entity.name,
        trade_name=entity.trade_name,
        logo_url=entity.logo_url,
        parent_id=entity.parent_id,
        legal_form=entity.legal_form,
        registration_number=entity.registration_number,
        tax_id=entity.tax_id,
        vat_number=entity.vat_number,
        capital=entity.capital,
        currency=entity.currency,
        fiscal_year_start=entity.fiscal_year_start,
        industry=entity.industry,
        founded_date=entity.founded_date.isoformat() if entity.founded_date else None,
        address_line1=entity.address_line1,
        address_line2=entity.address_line2,
        city=entity.city,
        state=entity.state,
        zip_code=entity.zip_code,
        country=entity.country,
        phone=entity.phone,
        fax=entity.fax,
        email=entity.email,
        website=entity.website,
        timezone=entity.timezone,
        language=entity.language,
        active=entity.active,
        social_networks=entity.social_networks,
        opening_hours=entity.opening_hours,
        notes=entity.notes,
        created_at=entity.created_at.isoformat() if entity.created_at else None,
        updated_at=entity.updated_at.isoformat() if entity.updated_at else None,
        user_count=user_count,
    )


def _apply_create_or_update(entity: Entity, data: dict) -> None:
    """Apply non-None fields from a dict to an Entity model."""
    for field, value in data.items():
        if value is not None and hasattr(entity, field):
            setattr(entity, field, value)


# ── List all entities (admin) ──────────────────────────────────────────────


@router.get(
    "",
    response_model=PaginatedResponse[EntityRead],
    dependencies=[require_permission("core.entity.read")],
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
        _entity_to_read(row.Entity, user_count=row.user_count or 0)
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
    dependencies=[require_permission("core.entity.create")],
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

    entity = Entity(code=body.code, name=body.name)
    _apply_create_or_update(entity, body.model_dump(exclude_unset=True, exclude={"code", "name"}))
    db.add(entity)
    await db.commit()
    await db.refresh(entity)

    return _entity_to_read(entity, user_count=0)


# ── Get entity detail ─────────────────────────────────────────────────────


@router.get(
    "/{entity_id}",
    response_model=EntityDetail,
    dependencies=[require_permission("core.entity.read")],
)
async def get_entity(
    entity_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get entity detail with parent info and children count."""
    user_count_sq = (
        select(func.count(func.distinct(UserGroupMember.user_id)))
        .select_from(UserGroupMember)
        .join(UserGroup, UserGroup.id == UserGroupMember.group_id)
        .where(UserGroup.entity_id == Entity.id)
        .correlate(Entity)
        .scalar_subquery()
    )

    children_count_sq = (
        select(func.count())
        .select_from(Entity)
        .where(Entity.parent_id == entity_id)
        .correlate()
        .scalar_subquery()
    )

    stmt = select(
        Entity,
        user_count_sq.label("user_count"),
        children_count_sq.label("children_count"),
    ).where(Entity.id == entity_id)
    result = await db.execute(stmt)
    row = result.one_or_none()

    if not row:
        raise HTTPException(status_code=404, detail="Entity not found")

    # Get parent name if parent_id is set
    parent_name = None
    if row.Entity.parent_id:
        parent_result = await db.execute(
            select(Entity.name).where(Entity.id == row.Entity.parent_id)
        )
        parent_name = parent_result.scalar_one_or_none()

    base = _entity_to_read(row.Entity, user_count=row.user_count or 0)
    return EntityDetail(
        **base.model_dump(),
        parent_name=parent_name,
        children_count=row.children_count or 0,
    )


# ── Update entity ─────────────────────────────────────────────────────────


@router.patch(
    "/{entity_id}",
    response_model=EntityRead,
    dependencies=[require_permission("core.entity.update")],
)
async def update_entity(
    entity_id: UUID,
    body: EntityUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update an entity."""
    result = await db.execute(select(Entity).where(Entity.id == entity_id))
    entity = result.scalar_one_or_none()
    if not entity:
        raise HTTPException(status_code=404, detail="Entity not found")

    update_data = body.model_dump(exclude_unset=True)

    if "code" in update_data and update_data["code"] is not None:
        existing = await db.execute(
            select(Entity).where(Entity.code == update_data["code"], Entity.id != entity_id)
        )
        if existing.scalar_one_or_none():
            raise HTTPException(status_code=400, detail=f"Entity code '{update_data['code']}' already exists")

    _apply_create_or_update(entity, update_data)

    await db.commit()
    await db.refresh(entity)

    user_count_result = await db.execute(
        select(func.count(func.distinct(UserGroupMember.user_id)))
        .select_from(UserGroupMember)
        .join(UserGroup, UserGroup.id == UserGroupMember.group_id)
        .where(UserGroup.entity_id == entity_id)
    )
    user_count = user_count_result.scalar() or 0

    return _entity_to_read(entity, user_count=user_count)


# ── Delete (archive) entity ───────────────────────────────────────────────


@router.delete(
    "/{entity_id}",
    dependencies=[require_permission("core.entity.delete")],
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
    dependencies=[require_permission("core.entity.read")],
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
    dependencies=[require_permission("core.entity.update")],
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

    # Find or create a default group for this entity
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
            active=True,
        )
        db.add(default_group)
        await db.flush()
        # Assign viewer role via junction table
        db.add(UserGroupRole(group_id=default_group.id, role_code="viewer"))

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
    dependencies=[require_permission("core.entity.update")],
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
