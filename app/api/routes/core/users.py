"""User management routes."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_entity, get_current_user, require_permission
from app.core.database import get_db
from app.core.pagination import PaginationParams, paginate
from app.core.security import hash_password
from app.models.common import (
    Permission,
    Role,
    RolePermission,
    User,
    UserGroup,
    UserGroupMember,
)
from app.schemas.common import PaginatedResponse, UserCreate, UserRead, UserUpdate

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
