"""RBAC routes — Roles, Permissions, and Role-Permission associations.

Admin endpoints for managing the RBAC system.
"""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_entity, require_permission
from app.core.database import get_db
from app.core.rbac import (
    get_permission_mode,
    invalidate_permission_mode_cache,
    invalidate_rbac_cache,
)
from app.models.asset_registry import Installation
from app.models.common import Permission, Role, RolePermission, Setting, UserGroup, UserGroupMember, UserGroupRole
from app.schemas.common import OpsFluxSchema

router = APIRouter(prefix="/api/v1/rbac", tags=["rbac"])


# ── Schemas ────────────────────────────────────────────────────────────────


class RoleRead(OpsFluxSchema):
    code: str
    name: str
    description: str | None
    module: str | None
    permission_count: int = 0
    group_count: int = 0
    user_count: int = 0
    created_at: str | None = None
    updated_at: str | None = None


class RoleCreate(BaseModel):
    code: str = Field(..., min_length=1, max_length=50, pattern=r"^[A-Z][A-Z0-9_]*$")
    name: str = Field(..., min_length=1, max_length=100)
    description: str | None = None
    module: str | None = None


class RoleUpdate(BaseModel):
    name: str | None = None
    description: str | None = None


class PermissionRead(OpsFluxSchema):
    code: str
    name: str
    module: str | None
    description: str | None


class RolePermissionAssign(BaseModel):
    permission_codes: list[str] = Field(..., min_length=1)


class GroupBrief(OpsFluxSchema):
    id: UUID
    name: str
    entity_id: UUID
    asset_scope_name: str | None = None
    member_count: int = 0
    active: bool


class RoleWithPermissions(OpsFluxSchema):
    code: str
    name: str
    description: str | None
    module: str | None
    permissions: list[PermissionRead] = []
    groups: list[GroupBrief] = []


# ── Role endpoints ─────────────────────────────────────────────────────────


@router.get("/roles", response_model=list[RoleRead])
async def list_roles(
    module: str | None = None,
    search: str | None = None,
    _: None = require_permission("core.rbac.read"),
    db: AsyncSession = Depends(get_db),
):
    """List all roles with permission, group, and user counts."""
    count_subq = (
        select(func.count())
        .select_from(RolePermission)
        .where(RolePermission.role_code == Role.code)
        .correlate(Role)
        .scalar_subquery()
    )

    group_count_subq = (
        select(func.count(func.distinct(UserGroupRole.group_id)))
        .select_from(UserGroupRole)
        .where(UserGroupRole.role_code == Role.code)
        .correlate(Role)
        .scalar_subquery()
    )

    user_count_subq = (
        select(func.count(func.distinct(UserGroupMember.user_id)))
        .select_from(UserGroupMember)
        .join(UserGroupRole, UserGroupRole.group_id == UserGroupMember.group_id)
        .where(UserGroupRole.role_code == Role.code)
        .correlate(Role)
        .scalar_subquery()
    )

    stmt = select(
        Role.code,
        Role.name,
        Role.description,
        Role.module,
        Role.created_at,
        Role.updated_at,
        count_subq.label("permission_count"),
        group_count_subq.label("group_count"),
        user_count_subq.label("user_count"),
    )
    if module:
        stmt = stmt.where(Role.module == module)
    if search:
        stmt = stmt.where(
            Role.name.ilike(f"%{search}%") | Role.code.ilike(f"%{search}%")
        )
    stmt = stmt.order_by(Role.code)

    result = await db.execute(stmt)
    return [
        RoleRead(
            code=row.code,
            name=row.name,
            description=row.description,
            module=row.module,
            permission_count=row.permission_count or 0,
            group_count=row.group_count or 0,
            user_count=row.user_count or 0,
            created_at=row.created_at.isoformat() if row.created_at else None,
            updated_at=row.updated_at.isoformat() if row.updated_at else None,
        )
        for row in result.all()
    ]


@router.post("/roles", response_model=RoleRead, status_code=201)
async def create_role(
    body: RoleCreate,
    _: None = require_permission("core.rbac.manage"),
    db: AsyncSession = Depends(get_db),
):
    """Create a new role."""
    existing = await db.execute(select(Role).where(Role.code == body.code))
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Role '{body.code}' already exists",
        )

    role = Role(
        code=body.code,
        name=body.name,
        description=body.description,
        module=body.module,
    )
    db.add(role)
    await db.commit()
    await db.refresh(role)
    return RoleRead(
        code=role.code,
        name=role.name,
        description=role.description,
        module=role.module,
        permission_count=0,
        created_at=role.created_at.isoformat() if role.created_at else None,
        updated_at=role.updated_at.isoformat() if role.updated_at else None,
    )


@router.get("/roles/{role_code}", response_model=RoleWithPermissions)
async def get_role(
    role_code: str,
    _: None = require_permission("core.rbac.read"),
    db: AsyncSession = Depends(get_db),
):
    """Get a role with all its permissions and groups."""
    result = await db.execute(select(Role).where(Role.code == role_code))
    role = result.scalar_one_or_none()
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")

    perm_result = await db.execute(
        select(Permission)
        .join(RolePermission, RolePermission.permission_code == Permission.code)
        .where(RolePermission.role_code == role_code)
        .order_by(Permission.code)
    )
    permissions = [
        PermissionRead.model_validate(p) for p in perm_result.scalars().all()
    ]

    # Fetch groups that use this role, with asset scope name and member count
    member_count_subq = (
        select(func.count())
        .select_from(UserGroupMember)
        .where(UserGroupMember.group_id == UserGroup.id)
        .correlate(UserGroup)
        .scalar_subquery()
    )
    groups_stmt = (
        select(
            UserGroup.id,
            UserGroup.name,
            UserGroup.entity_id,
            Installation.name.label("asset_scope_name"),
            member_count_subq.label("member_count"),
            UserGroup.active,
        )
        .join(UserGroupRole, UserGroupRole.group_id == UserGroup.id)
        .outerjoin(Installation, Installation.id == UserGroup.asset_scope)
        .where(UserGroupRole.role_code == role_code)
        .order_by(UserGroup.name)
    )
    groups_result = await db.execute(groups_stmt)
    groups = [
        GroupBrief(
            id=row.id,
            name=row.name,
            entity_id=row.entity_id,
            asset_scope_name=row.asset_scope_name,
            member_count=row.member_count or 0,
            active=row.active,
        )
        for row in groups_result.all()
    ]

    return RoleWithPermissions(
        code=role.code,
        name=role.name,
        description=role.description,
        module=role.module,
        permissions=permissions,
        groups=groups,
    )


@router.patch("/roles/{role_code}", response_model=RoleRead)
async def update_role(
    role_code: str,
    body: RoleUpdate,
    _: None = require_permission("core.rbac.manage"),
    db: AsyncSession = Depends(get_db),
):
    """Update a role's name or description."""
    result = await db.execute(select(Role).where(Role.code == role_code))
    role = result.scalar_one_or_none()
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")

    if body.name is not None:
        role.name = body.name
    if body.description is not None:
        role.description = body.description

    await db.commit()

    # Count permissions
    count_result = await db.execute(
        select(func.count()).where(RolePermission.role_code == role_code)
    )
    return RoleRead(
        code=role.code,
        name=role.name,
        description=role.description,
        module=role.module,
        permission_count=count_result.scalar() or 0,
    )


@router.put("/roles/{role_code}/permissions", response_model=RoleWithPermissions)
async def set_role_permissions(
    role_code: str,
    body: RolePermissionAssign,
    _: None = require_permission("core.rbac.manage"),
    db: AsyncSession = Depends(get_db),
):
    """Replace all permissions for a role."""
    result = await db.execute(select(Role).where(Role.code == role_code))
    role = result.scalar_one_or_none()
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")

    # Validate all permission codes exist
    perm_result = await db.execute(
        select(Permission.code).where(Permission.code.in_(body.permission_codes))
    )
    valid_codes = {row[0] for row in perm_result.all()}
    invalid = set(body.permission_codes) - valid_codes
    if invalid:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown permissions: {', '.join(sorted(invalid))}",
        )

    # Replace: delete existing, insert new
    await db.execute(
        delete(RolePermission).where(RolePermission.role_code == role_code)
    )
    for perm_code in body.permission_codes:
        db.add(RolePermission(role_code=role_code, permission_code=perm_code))

    await db.commit()

    # Invalidate RBAC cache for all users (role change affects everyone)
    await invalidate_rbac_cache()

    # Return full role with new permissions
    return await get_role(role_code, db=db)


# ── Permission endpoints ───────────────────────────────────────────────────


@router.get("/permissions", response_model=list[PermissionRead])
async def list_permissions(
    module: str | None = None,
    search: str | None = None,
    _: None = require_permission("core.rbac.read"),
    db: AsyncSession = Depends(get_db),
):
    """List all available permissions."""
    stmt = select(Permission).order_by(Permission.module, Permission.code)
    if module:
        stmt = stmt.where(Permission.module == module)
    if search:
        stmt = stmt.where(
            Permission.name.ilike(f"%{search}%") | Permission.code.ilike(f"%{search}%")
        )

    result = await db.execute(stmt)
    return [PermissionRead.model_validate(p) for p in result.scalars().all()]


class ModulePermissionsRead(BaseModel):
    module: str
    permissions: list[PermissionRead]


@router.get("/modules", response_model=list[ModulePermissionsRead])
async def list_permission_modules(
    _: None = require_permission("core.rbac.read"),
    db: AsyncSession = Depends(get_db),
):
    """List all permissions grouped by module."""
    result = await db.execute(
        select(Permission).order_by(Permission.module, Permission.code)
    )
    all_perms = result.scalars().all()
    grouped: dict[str, list[PermissionRead]] = {}
    for p in all_perms:
        mod = p.module or "core"
        if mod not in grouped:
            grouped[mod] = []
        grouped[mod].append(PermissionRead.model_validate(p))
    return [
        ModulePermissionsRead(module=mod, permissions=perms)
        for mod, perms in sorted(grouped.items())
    ]


# ── Permission mode (additive / restrictive) ─────────────────────────────


class PermissionModeRead(BaseModel):
    mode: str  # "additive" | "restrictive"


class PermissionModeUpdate(BaseModel):
    mode: str = Field(..., pattern=r"^(additive|restrictive)$")


@router.get("/permission-mode", response_model=PermissionModeRead)
async def get_entity_permission_mode(
    entity_id: UUID = Depends(get_current_entity),
    _: None = require_permission("core.rbac.read"),
    db: AsyncSession = Depends(get_db),
):
    """Get the permission resolution mode for the current entity."""
    mode = await get_permission_mode(entity_id, db)
    return PermissionModeRead(mode=mode)


@router.put("/permission-mode", response_model=PermissionModeRead)
async def set_entity_permission_mode(
    body: PermissionModeUpdate,
    entity_id: UUID = Depends(get_current_entity),
    _: None = require_permission("core.rbac.manage"),
    db: AsyncSession = Depends(get_db),
):
    """Set the permission resolution mode for the current entity.

    - "additive": permissions accumulate across layers, no revocation possible.
    - "restrictive": higher-priority layers can revoke lower-layer grants.
    """
    key = "rbac.permission_mode"
    result = await db.execute(
        select(Setting).where(
            Setting.key == key,
            Setting.scope == "entity",
            Setting.scope_id == str(entity_id),
        )
    )
    existing = result.scalar_one_or_none()

    if existing:
        existing.value = {"value": body.mode}
    else:
        db.add(Setting(
            key=key,
            value={"value": body.mode},
            scope="entity",
            scope_id=str(entity_id),
        ))

    await db.commit()

    # Invalidate caches
    await invalidate_permission_mode_cache(entity_id)
    await invalidate_rbac_cache()

    return PermissionModeRead(mode=body.mode)
