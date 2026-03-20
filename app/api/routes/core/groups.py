"""User Groups CRUD — manage groups, members, and asset scoping.

Groups are the link between Users and Roles. A user gets permissions through group membership.
Groups are entity-scoped and can optionally be scoped to a specific asset (asset_scope).
"""

import math
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_entity, get_current_user, require_permission
from app.core.database import get_db
from app.core.pagination import PaginationParams
from app.core.rbac import invalidate_rbac_cache
from app.models.common import (
    Asset,
    Role,
    User,
    UserGroup,
    UserGroupMember,
)
from app.schemas.common import OpsFluxSchema, PaginatedResponse
from app.services.core.delete_service import delete_entity

router = APIRouter(prefix="/api/v1/rbac/groups", tags=["rbac-groups"])


# ── Schemas ────────────────────────────────────────────────────────────────


class GroupMemberRead(OpsFluxSchema):
    user_id: UUID
    first_name: str
    last_name: str
    email: str
    joined_at: str | None = None


class GroupRead(OpsFluxSchema):
    id: UUID
    entity_id: UUID
    name: str
    role_code: str
    role_name: str | None = None
    asset_scope: UUID | None
    asset_scope_name: str | None = None
    active: bool
    member_count: int = 0


class GroupDetail(OpsFluxSchema):
    id: UUID
    entity_id: UUID
    name: str
    role_code: str
    role_name: str | None = None
    asset_scope: UUID | None
    asset_scope_name: str | None = None
    active: bool
    member_count: int = 0
    members: list[GroupMemberRead] = []


class GroupCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    role_code: str = Field(..., min_length=1, max_length=50)
    asset_scope: UUID | None = None


class GroupUpdate(BaseModel):
    name: str | None = None
    role_code: str | None = None
    asset_scope: UUID | None = None
    active: bool | None = None


class GroupMemberAdd(BaseModel):
    user_ids: list[UUID] = Field(..., min_length=1)


# ── Group endpoints ────────────────────────────────────────────────────────


@router.get("", response_model=PaginatedResponse[GroupRead])
async def list_groups(
    search: str | None = None,
    role_code: str | None = None,
    active: bool | None = None,
    pagination: PaginationParams = Depends(),
    entity_id: UUID = Depends(get_current_entity),
    _: None = require_permission("core.rbac.read"),
    db: AsyncSession = Depends(get_db),
):
    """List groups in the current entity with optional search and filters."""
    member_count_sq = (
        select(func.count())
        .select_from(UserGroupMember)
        .where(UserGroupMember.group_id == UserGroup.id)
        .correlate(UserGroup)
        .scalar_subquery()
    )

    stmt = (
        select(
            UserGroup,
            Role.name.label("role_name"),
            Asset.name.label("asset_scope_name"),
            member_count_sq.label("member_count"),
        )
        .outerjoin(Role, Role.code == UserGroup.role_code)
        .outerjoin(Asset, Asset.id == UserGroup.asset_scope)
        .where(UserGroup.entity_id == entity_id)
    )

    # Apply filters
    if search:
        stmt = stmt.where(UserGroup.name.ilike(f"%{search}%"))
    if role_code:
        stmt = stmt.where(UserGroup.role_code == role_code)
    if active is not None:
        stmt = stmt.where(UserGroup.active == active)

    stmt = stmt.order_by(UserGroup.name)

    # Count total before pagination
    count_stmt = select(func.count()).select_from(stmt.subquery())
    total = (await db.execute(count_stmt)).scalar() or 0

    # Apply pagination
    stmt = stmt.offset(pagination.offset).limit(pagination.page_size)
    result = await db.execute(stmt)

    items = [
        GroupRead(
            id=row.UserGroup.id,
            entity_id=row.UserGroup.entity_id,
            name=row.UserGroup.name,
            role_code=row.UserGroup.role_code,
            role_name=row.role_name,
            asset_scope=row.UserGroup.asset_scope,
            asset_scope_name=row.asset_scope_name,
            active=row.UserGroup.active,
            member_count=row.member_count or 0,
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


@router.post("", response_model=GroupRead, status_code=201)
async def create_group(
    body: GroupCreate,
    entity_id: UUID = Depends(get_current_entity),
    _: None = require_permission("core.rbac.manage"),
    db: AsyncSession = Depends(get_db),
):
    """Create a new user group."""
    # Validate role exists
    role_result = await db.execute(select(Role).where(Role.code == body.role_code))
    role = role_result.scalar_one_or_none()
    if not role:
        raise HTTPException(status_code=400, detail=f"Role '{body.role_code}' not found")

    # Validate asset scope if provided
    asset_name = None
    if body.asset_scope:
        asset_result = await db.execute(
            select(Asset).where(Asset.id == body.asset_scope, Asset.entity_id == entity_id)
        )
        asset = asset_result.scalar_one_or_none()
        if not asset:
            raise HTTPException(status_code=400, detail="Asset scope not found in this entity")
        asset_name = asset.name

    group = UserGroup(
        entity_id=entity_id,
        name=body.name,
        role_code=body.role_code,
        asset_scope=body.asset_scope,
    )
    db.add(group)
    await db.commit()
    await db.refresh(group)

    return GroupRead(
        id=group.id,
        entity_id=group.entity_id,
        name=group.name,
        role_code=group.role_code,
        role_name=role.name,
        asset_scope=group.asset_scope,
        asset_scope_name=asset_name,
        active=group.active,
        member_count=0,
    )


@router.get("/{group_id}", response_model=GroupDetail)
async def get_group(
    group_id: UUID,
    members_page: int = Query(1, ge=1, description="Members page number"),
    members_page_size: int = Query(50, ge=1, le=200, description="Members per page"),
    entity_id: UUID = Depends(get_current_entity),
    _: None = require_permission("core.rbac.read"),
    db: AsyncSession = Depends(get_db),
):
    """Get group detail with paginated members."""
    stmt = (
        select(
            UserGroup,
            Role.name.label("role_name"),
            Asset.name.label("asset_scope_name"),
        )
        .outerjoin(Role, Role.code == UserGroup.role_code)
        .outerjoin(Asset, Asset.id == UserGroup.asset_scope)
        .where(UserGroup.id == group_id, UserGroup.entity_id == entity_id)
    )
    result = await db.execute(stmt)
    row = result.one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Group not found")

    group = row.UserGroup

    # Count total members
    member_count_result = await db.execute(
        select(func.count()).where(UserGroupMember.group_id == group_id)
    )
    member_count = member_count_result.scalar() or 0

    # Load paginated members with user info
    members_offset = (members_page - 1) * members_page_size
    members_result = await db.execute(
        select(UserGroupMember, User)
        .join(User, User.id == UserGroupMember.user_id)
        .where(UserGroupMember.group_id == group_id)
        .order_by(User.last_name, User.first_name)
        .offset(members_offset)
        .limit(members_page_size)
    )
    members = [
        GroupMemberRead(
            user_id=m.User.id,
            first_name=m.User.first_name,
            last_name=m.User.last_name,
            email=m.User.email,
            joined_at=m.UserGroupMember.joined_at.isoformat() if m.UserGroupMember.joined_at else None,
        )
        for m in members_result.all()
    ]

    return GroupDetail(
        id=group.id,
        entity_id=group.entity_id,
        name=group.name,
        role_code=group.role_code,
        role_name=row.role_name,
        asset_scope=group.asset_scope,
        asset_scope_name=row.asset_scope_name,
        active=group.active,
        member_count=member_count,
        members=members,
    )


@router.patch("/{group_id}", response_model=GroupRead)
async def update_group(
    group_id: UUID,
    body: GroupUpdate,
    entity_id: UUID = Depends(get_current_entity),
    _: None = require_permission("core.rbac.manage"),
    db: AsyncSession = Depends(get_db),
):
    """Update a group."""
    result = await db.execute(
        select(UserGroup).where(
            UserGroup.id == group_id, UserGroup.entity_id == entity_id
        )
    )
    group = result.scalar_one_or_none()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")

    if body.name is not None:
        group.name = body.name
    if body.role_code is not None:
        role_result = await db.execute(select(Role).where(Role.code == body.role_code))
        if not role_result.scalar_one_or_none():
            raise HTTPException(status_code=400, detail=f"Role '{body.role_code}' not found")
        group.role_code = body.role_code
    if body.asset_scope is not None:
        group.asset_scope = body.asset_scope
    if body.active is not None:
        group.active = body.active

    await db.commit()

    # Invalidate cache for all group members
    await invalidate_rbac_cache()

    # Fetch enriched data
    enriched = await db.execute(
        select(
            Role.name.label("role_name"),
            Asset.name.label("asset_scope_name"),
        )
        .outerjoin(Role, Role.code == group.role_code)
        .outerjoin(Asset, Asset.id == group.asset_scope)
        .where(Role.code == group.role_code)
    )
    row = enriched.one_or_none()

    member_count_result = await db.execute(
        select(func.count()).where(UserGroupMember.group_id == group_id)
    )

    return GroupRead(
        id=group.id,
        entity_id=group.entity_id,
        name=group.name,
        role_code=group.role_code,
        role_name=row.role_name if row else None,
        asset_scope=group.asset_scope,
        asset_scope_name=row.asset_scope_name if row else None,
        active=group.active,
        member_count=member_count_result.scalar() or 0,
    )


# ── Member management ──────────────────────────────────────────────────────


@router.post("/{group_id}/members", response_model=GroupDetail)
async def add_members(
    group_id: UUID,
    body: GroupMemberAdd,
    entity_id: UUID = Depends(get_current_entity),
    _: None = require_permission("core.rbac.manage"),
    db: AsyncSession = Depends(get_db),
):
    """Add users to a group."""
    result = await db.execute(
        select(UserGroup).where(
            UserGroup.id == group_id, UserGroup.entity_id == entity_id
        )
    )
    group = result.scalar_one_or_none()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")

    # Get existing members to avoid duplicates
    existing = await db.execute(
        select(UserGroupMember.user_id).where(UserGroupMember.group_id == group_id)
    )
    existing_ids = {row[0] for row in existing.all()}

    added = 0
    for user_id in body.user_ids:
        if user_id in existing_ids:
            continue
        # Validate user exists
        user_result = await db.execute(select(User).where(User.id == user_id))
        if not user_result.scalar_one_or_none():
            continue
        db.add(UserGroupMember(user_id=user_id, group_id=group_id))
        added += 1

    await db.commit()

    # Invalidate cache for affected users
    for user_id in body.user_ids:
        await invalidate_rbac_cache(user_id)

    return await get_group(group_id, entity_id=entity_id, db=db)


@router.delete("/{group_id}/members/{user_id}", status_code=204)
async def remove_member(
    group_id: UUID,
    user_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("core.rbac.manage"),
    db: AsyncSession = Depends(get_db),
):
    """Remove a user from a group."""
    result = await db.execute(
        select(UserGroup).where(
            UserGroup.id == group_id, UserGroup.entity_id == entity_id
        )
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Group not found")

    member_result = await db.execute(
        select(UserGroupMember).where(
            UserGroupMember.group_id == group_id,
            UserGroupMember.user_id == user_id,
        )
    )
    member = member_result.scalar_one_or_none()
    if not member:
        raise HTTPException(status_code=404, detail="Member not found in group")

    await delete_entity(member, db, "user_group_member", entity_id=member.id, user_id=current_user.id)
    await db.commit()

    await invalidate_rbac_cache(user_id)
