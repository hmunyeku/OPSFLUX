"""User Groups CRUD — manage groups, members, and asset scoping.

Groups are the link between Users and Roles. A user gets permissions through group membership.
A group can have multiple roles (many-to-many via user_group_roles).
Groups are entity-scoped and can optionally be scoped to a specific asset (asset_scope).
"""

import math
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_entity, get_current_user, require_permission
from app.core.database import get_db
from app.core.pagination import PaginationParams
from app.core.rbac import invalidate_rbac_cache
from app.models.common import (
    Asset,
    Entity,
    GroupPermissionOverride,
    Permission,
    Role,
    User,
    UserGroup,
    UserGroupMember,
    UserGroupRole,
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


class GroupRoleRead(OpsFluxSchema):
    code: str
    name: str


class GroupRead(OpsFluxSchema):
    id: UUID
    entity_id: UUID
    entity_name: str | None = None
    name: str
    role_codes: list[str] = []
    role_names: list[str] = []
    asset_scope: UUID | None
    asset_scope_name: str | None = None
    active: bool
    member_count: int = 0
    created_at: str | None = None
    updated_at: str | None = None


class PermissionOverrideRead(OpsFluxSchema):
    permission_code: str
    granted: bool


class PermissionOverrideSet(BaseModel):
    """Replace all group permission overrides at once."""
    overrides: list[PermissionOverrideRead] = Field(default_factory=list)


class GroupDetail(OpsFluxSchema):
    id: UUID
    entity_id: UUID
    entity_name: str | None = None
    name: str
    role_codes: list[str] = []
    role_names: list[str] = []
    asset_scope: UUID | None
    asset_scope_name: str | None = None
    active: bool
    member_count: int = 0
    members: list[GroupMemberRead] = []
    permission_overrides: list[PermissionOverrideRead] = []


class GroupCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    role_codes: list[str] = Field(..., min_length=1)
    asset_scope: UUID | None = None


class GroupUpdate(BaseModel):
    name: str | None = None
    role_codes: list[str] | None = None
    asset_scope: UUID | None = None
    active: bool | None = None


class GroupMemberAdd(BaseModel):
    user_ids: list[UUID] = Field(..., min_length=1)


# ── Helpers ────────────────────────────────────────────────────────────────


async def _load_group_roles(group_ids: list[UUID], db: AsyncSession) -> dict[UUID, list[tuple[str, str]]]:
    """Load (role_code, role_name) pairs for a batch of group IDs."""
    if not group_ids:
        return {}
    result = await db.execute(
        select(UserGroupRole.group_id, Role.code, Role.name)
        .join(Role, Role.code == UserGroupRole.role_code)
        .where(UserGroupRole.group_id.in_(group_ids))
        .order_by(Role.name)
    )
    mapping: dict[UUID, list[tuple[str, str]]] = {}
    for row in result.all():
        mapping.setdefault(row[0], []).append((row[1], row[2]))
    return mapping


async def _set_group_roles(group_id: UUID, role_codes: list[str], db: AsyncSession) -> list[tuple[str, str]]:
    """Replace all roles for a group. Returns list of (code, name) pairs."""
    # Validate all role codes exist
    if role_codes:
        valid_result = await db.execute(
            select(Role.code, Role.name).where(Role.code.in_(role_codes))
        )
        valid_roles = {row[0]: row[1] for row in valid_result.all()}
        invalid = set(role_codes) - set(valid_roles.keys())
        if invalid:
            raise HTTPException(status_code=400, detail=f"Unknown roles: {', '.join(sorted(invalid))}")
    else:
        valid_roles = {}

    # Replace: delete existing, insert new
    await db.execute(
        delete(UserGroupRole).where(UserGroupRole.group_id == group_id)
    )
    for code in role_codes:
        db.add(UserGroupRole(group_id=group_id, role_code=code))

    return [(code, valid_roles[code]) for code in role_codes]


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
            Asset.name.label("asset_scope_name"),
            Entity.name.label("entity_name"),
            member_count_sq.label("member_count"),
        )
        .outerjoin(Asset, Asset.id == UserGroup.asset_scope)
        .outerjoin(Entity, Entity.id == UserGroup.entity_id)
        .where(UserGroup.entity_id == entity_id)
    )

    # Apply filters
    if search:
        stmt = stmt.where(UserGroup.name.ilike(f"%{search}%"))
    if role_code:
        # Filter groups that have this role via junction table
        stmt = stmt.where(
            UserGroup.id.in_(
                select(UserGroupRole.group_id).where(UserGroupRole.role_code == role_code)
            )
        )
    if active is not None:
        stmt = stmt.where(UserGroup.active == active)

    stmt = stmt.order_by(UserGroup.name)

    # Count total before pagination
    count_stmt = select(func.count()).select_from(stmt.subquery())
    total = (await db.execute(count_stmt)).scalar() or 0

    # Apply pagination
    stmt = stmt.offset(pagination.offset).limit(pagination.page_size)
    result = await db.execute(stmt)
    rows = result.all()

    # Batch-load roles for all groups
    group_ids = [row.UserGroup.id for row in rows]
    roles_map = await _load_group_roles(group_ids, db)

    items = []
    for row in rows:
        gid = row.UserGroup.id
        role_pairs = roles_map.get(gid, [])
        items.append(GroupRead(
            id=gid,
            entity_id=row.UserGroup.entity_id,
            entity_name=row.entity_name,
            name=row.UserGroup.name,
            role_codes=[r[0] for r in role_pairs],
            role_names=[r[1] for r in role_pairs],
            asset_scope=row.UserGroup.asset_scope,
            asset_scope_name=row.asset_scope_name,
            active=row.UserGroup.active,
            member_count=row.member_count or 0,
            created_at=row.UserGroup.created_at.isoformat() if row.UserGroup.created_at else None,
            updated_at=row.UserGroup.updated_at.isoformat() if row.UserGroup.updated_at else None,
        ))

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
        asset_scope=body.asset_scope,
    )
    db.add(group)
    await db.flush()  # get group.id

    # Set roles via junction table
    role_pairs = await _set_group_roles(group.id, body.role_codes, db)

    await db.commit()
    await db.refresh(group)

    return GroupRead(
        id=group.id,
        entity_id=group.entity_id,
        name=group.name,
        role_codes=[r[0] for r in role_pairs],
        role_names=[r[1] for r in role_pairs],
        asset_scope=group.asset_scope,
        asset_scope_name=asset_name,
        active=group.active,
        member_count=0,
        created_at=group.created_at.isoformat() if group.created_at else None,
        updated_at=group.updated_at.isoformat() if group.updated_at else None,
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
            Asset.name.label("asset_scope_name"),
            Entity.name.label("entity_name"),
        )
        .outerjoin(Asset, Asset.id == UserGroup.asset_scope)
        .outerjoin(Entity, Entity.id == UserGroup.entity_id)
        .where(UserGroup.id == group_id, UserGroup.entity_id == entity_id)
    )
    result = await db.execute(stmt)
    row = result.one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Group not found")

    group = row.UserGroup

    # Load roles
    roles_map = await _load_group_roles([group_id], db)
    role_pairs = roles_map.get(group_id, [])

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

    # Load permission overrides
    overrides_result = await db.execute(
        select(GroupPermissionOverride)
        .where(GroupPermissionOverride.group_id == group_id)
        .order_by(GroupPermissionOverride.permission_code)
    )
    perm_overrides = [
        PermissionOverrideRead(permission_code=o.permission_code, granted=o.granted)
        for o in overrides_result.scalars().all()
    ]

    return GroupDetail(
        id=group.id,
        entity_id=group.entity_id,
        entity_name=row.entity_name,
        name=group.name,
        role_codes=[r[0] for r in role_pairs],
        role_names=[r[1] for r in role_pairs],
        asset_scope=group.asset_scope,
        asset_scope_name=row.asset_scope_name,
        active=group.active,
        member_count=member_count,
        members=members,
        permission_overrides=perm_overrides,
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
    if body.role_codes is not None:
        await _set_group_roles(group_id, body.role_codes, db)
    if body.asset_scope is not None:
        group.asset_scope = body.asset_scope
    if body.active is not None:
        group.active = body.active

    await db.commit()

    # Invalidate cache for all group members
    await invalidate_rbac_cache()

    # Load enriched data
    roles_map = await _load_group_roles([group_id], db)
    role_pairs = roles_map.get(group_id, [])

    asset_name = None
    if group.asset_scope:
        asset_result = await db.execute(select(Asset.name).where(Asset.id == group.asset_scope))
        asset_name = asset_result.scalar_one_or_none()

    member_count_result = await db.execute(
        select(func.count()).where(UserGroupMember.group_id == group_id)
    )

    return GroupRead(
        id=group.id,
        entity_id=group.entity_id,
        name=group.name,
        role_codes=[r[0] for r in role_pairs],
        role_names=[r[1] for r in role_pairs],
        asset_scope=group.asset_scope,
        asset_scope_name=asset_name,
        active=group.active,
        member_count=member_count_result.scalar() or 0,
        created_at=group.created_at.isoformat() if group.created_at else None,
        updated_at=group.updated_at.isoformat() if group.updated_at else None,
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


# ── Group permission overrides ────────────────────────────────────────────


@router.get("/{group_id}/permissions", response_model=list[PermissionOverrideRead])
async def get_group_permission_overrides(
    group_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    _: None = require_permission("core.rbac.read"),
    db: AsyncSession = Depends(get_db),
):
    """Get all permission overrides for a group."""
    grp = await db.execute(
        select(UserGroup).where(UserGroup.id == group_id, UserGroup.entity_id == entity_id)
    )
    if not grp.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Group not found")

    result = await db.execute(
        select(GroupPermissionOverride)
        .where(GroupPermissionOverride.group_id == group_id)
        .order_by(GroupPermissionOverride.permission_code)
    )
    return [
        PermissionOverrideRead(permission_code=o.permission_code, granted=o.granted)
        for o in result.scalars().all()
    ]


@router.put("/{group_id}/permissions", response_model=list[PermissionOverrideRead])
async def set_group_permission_overrides(
    group_id: UUID,
    body: PermissionOverrideSet,
    entity_id: UUID = Depends(get_current_entity),
    _: None = require_permission("core.rbac.manage"),
    db: AsyncSession = Depends(get_db),
):
    """Replace all permission overrides for a group."""
    grp = await db.execute(
        select(UserGroup).where(UserGroup.id == group_id, UserGroup.entity_id == entity_id)
    )
    if not grp.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Group not found")

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
        delete(GroupPermissionOverride).where(GroupPermissionOverride.group_id == group_id)
    )
    for override in body.overrides:
        db.add(GroupPermissionOverride(
            group_id=group_id,
            permission_code=override.permission_code,
            granted=override.granted,
        ))

    await db.commit()
    await invalidate_rbac_cache()

    return [
        PermissionOverrideRead(permission_code=o.permission_code, granted=o.granted)
        for o in body.overrides
    ]


@router.post("/{group_id}/copy-permissions", response_model=list[PermissionOverrideRead])
async def copy_group_permissions(
    group_id: UUID,
    source_group_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    _: None = require_permission("core.rbac.manage"),
    db: AsyncSession = Depends(get_db),
):
    """Copy permission overrides from another group."""
    for gid, label in [(group_id, "Target"), (source_group_id, "Source")]:
        result = await db.execute(
            select(UserGroup).where(UserGroup.id == gid, UserGroup.entity_id == entity_id)
        )
        if not result.scalar_one_or_none():
            raise HTTPException(status_code=404, detail=f"{label} group not found")

    # Load source overrides
    source_result = await db.execute(
        select(GroupPermissionOverride)
        .where(GroupPermissionOverride.group_id == source_group_id)
    )
    source_overrides = source_result.scalars().all()

    # Replace target overrides
    await db.execute(
        delete(GroupPermissionOverride).where(GroupPermissionOverride.group_id == group_id)
    )
    new_overrides = []
    for o in source_overrides:
        db.add(GroupPermissionOverride(
            group_id=group_id,
            permission_code=o.permission_code,
            granted=o.granted,
        ))
        new_overrides.append(
            PermissionOverrideRead(permission_code=o.permission_code, granted=o.granted)
        )

    await db.commit()
    await invalidate_rbac_cache()

    return new_overrides
