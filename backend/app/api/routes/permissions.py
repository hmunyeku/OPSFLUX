"""
API endpoints for permission management (RBAC).
Admin-only routes for managing permissions.
"""

import uuid
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import col, func, select

from app.api.deps import (
    CurrentUser,
    SessionDep,
    get_current_active_superuser,
)
from app.models_rbac import (
    Permission,
    PermissionCreate,
    PermissionPublic,
    PermissionsPublic,
    PermissionUpdate,
    Message,
)
from app.models_modules import Module, ModuleStatus
from app.core.cache_service import cache_service

router = APIRouter(prefix="/permissions", tags=["permissions"])


@router.get("/", response_model=PermissionsPublic)
@cache_service.cached(
    namespace="rbac",
    key_builder=lambda session, current_user, skip, limit, module, is_default, is_active: f"permissions:{skip}:{limit}:{module}:{is_default}:{is_active}"
)
async def read_permissions(
    session: SessionDep,
    current_user: CurrentUser,
    skip: int = 0,
    limit: int = 100,
    module: Optional[str] = Query(None, description="Filter by module"),
    is_default: Optional[bool] = Query(None, description="Filter by default permissions"),
    is_active: Optional[bool] = Query(True, description="Filter by active status"),
) -> Any:
    """
    Retrieve permissions.
    Uses default TTL from settings (redis_default_ttl).
    Requires rbac.read permission.
    Only shows permissions from ACTIVE modules (core permissions are always shown).
    """
    # TODO: Check rbac.read permission
    count_statement = select(func.count()).select_from(Permission)
    statement = select(Permission)

    # Apply filters
    if module:
        count_statement = count_statement.where(Permission.module == module)
        statement = statement.where(Permission.module == module)

    if is_default is not None:
        count_statement = count_statement.where(Permission.is_default == is_default)
        statement = statement.where(Permission.is_default == is_default)

    if is_active is not None:
        count_statement = count_statement.where(Permission.is_active == is_active)
        statement = statement.where(Permission.is_active == is_active)

    # Filter deleted items
    count_statement = count_statement.where(Permission.deleted_at.is_(None))
    statement = statement.where(Permission.deleted_at.is_(None))

    # Filter by module status: only show permissions from ACTIVE modules
    # Core permissions are always shown (module == "core")
    count_statement = count_statement.outerjoin(
        Module, Permission.module == Module.code
    ).where(
        (Permission.module == "core") | (Module.status == ModuleStatus.ACTIVE)
    )

    statement = statement.outerjoin(
        Module, Permission.module == Module.code
    ).where(
        (Permission.module == "core") | (Module.status == ModuleStatus.ACTIVE)
    )

    count = session.exec(count_statement).one()
    statement = statement.offset(skip).limit(limit).order_by(Permission.module, Permission.name)
    permissions = session.exec(statement).all()

    return PermissionsPublic(data=permissions, count=count)


@router.get("/{permission_id}", response_model=PermissionPublic)
def read_permission(
    permission_id: uuid.UUID,
    session: SessionDep,
    current_user: CurrentUser,
) -> Any:
    """
    Get a specific permission by id.
    Requires rbac.read permission.
    """
    # TODO: Check rbac.read permission
    permission = session.get(Permission, permission_id)
    if not permission or permission.deleted_at is not None:
        raise HTTPException(status_code=404, detail="Permission not found")

    return permission


@router.post(
    "/",
    dependencies=[Depends(get_current_active_superuser)],
    response_model=PermissionPublic,
)
def create_permission(
    *,
    session: SessionDep,
    permission_in: PermissionCreate,
    current_user: CurrentUser,
) -> Any:
    """
    Create new permission.
    Requires rbac.manage permission or superuser.
    """
    # Check if code already exists
    statement = select(Permission).where(
        Permission.code == permission_in.code,
        Permission.deleted_at.is_(None)
    )
    existing = session.exec(statement).first()
    if existing:
        raise HTTPException(
            status_code=400,
            detail=f"Permission with code '{permission_in.code}' already exists",
        )

    permission = Permission.model_validate(
        permission_in,
        update={"created_by_id": current_user.id, "updated_by_id": current_user.id}
    )
    session.add(permission)
    session.commit()
    session.refresh(permission)
    return permission


@router.patch(
    "/{permission_id}",
    dependencies=[Depends(get_current_active_superuser)],
    response_model=PermissionPublic,
)
def update_permission(
    *,
    session: SessionDep,
    permission_id: uuid.UUID,
    permission_in: PermissionUpdate,
    current_user: CurrentUser,
) -> Any:
    """
    Update a permission.
    Requires rbac.manage permission or superuser.
    """
    db_permission = session.get(Permission, permission_id)
    if not db_permission or db_permission.deleted_at is not None:
        raise HTTPException(
            status_code=404,
            detail="The permission with this id does not exist in the system",
        )

    # Check code uniqueness if changed
    if permission_in.code and permission_in.code != db_permission.code:
        statement = select(Permission).where(
            Permission.code == permission_in.code,
            Permission.deleted_at.is_(None)
        )
        existing = session.exec(statement).first()
        if existing:
            raise HTTPException(
                status_code=409,
                detail=f"Permission with code '{permission_in.code}' already exists"
            )

    permission_data = permission_in.model_dump(exclude_unset=True)
    db_permission.sqlmodel_update(permission_data)
    db_permission.update_audit_trail(current_user.id)

    session.add(db_permission)
    session.commit()
    session.refresh(db_permission)
    return db_permission


@router.delete(
    "/{permission_id}",
    dependencies=[Depends(get_current_active_superuser)],
    response_model=Message,
)
def delete_permission(
    session: SessionDep,
    current_user: CurrentUser,
    permission_id: uuid.UUID,
) -> Message:
    """
    Soft delete a permission.
    Requires rbac.manage permission or superuser.
    """
    permission = session.get(Permission, permission_id)
    if not permission or permission.deleted_at is not None:
        raise HTTPException(status_code=404, detail="Permission not found")

    # Soft delete
    permission.soft_delete(current_user.id)
    session.add(permission)
    session.commit()

    return Message(message="Permission deleted successfully")


@router.get("/modules/list", response_model=list[str])
def list_modules(
    session: SessionDep,
    current_user: CurrentUser,
) -> Any:
    """
    Get list of all permission modules from ACTIVE modules.
    Requires rbac.read permission.
    """
    # TODO: Check rbac.read permission
    statement = select(Permission.module).outerjoin(
        Module, Permission.module == Module.code
    ).where(
        Permission.deleted_at.is_(None),
        Permission.is_active == True,
        (Permission.module == "core") | (Module.status == ModuleStatus.ACTIVE)
    ).distinct()
    modules = session.exec(statement).all()
    return sorted(modules)
