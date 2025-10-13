"""
API endpoints for role management (RBAC).
Admin-only routes for managing roles and their permissions.
"""

import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import func, select

from app.api.deps import (
    CurrentUser,
    SessionDep,
    get_current_active_superuser,
)
from app.models_rbac import (
    Permission,
    Role,
    RoleCreate,
    RolePublic,
    RolesPublic,
    RoleUpdate,
    Message,
)

router = APIRouter(prefix="/roles", tags=["roles"])


@router.get("/", response_model=RolesPublic)
def read_roles(
    session: SessionDep,
    current_user: CurrentUser,
    skip: int = 0,
    limit: int = 100,
    is_active: bool = True,
    include_permissions: bool = False,
) -> Any:
    """
    Retrieve roles.
    Requires rbac.read permission.
    """
    # TODO: Check rbac.read permission
    count_statement = select(func.count()).select_from(Role)
    statement = select(Role)

    if is_active is not None:
        count_statement = count_statement.where(Role.is_active == is_active)
        statement = statement.where(Role.is_active == is_active)

    # Filter deleted items
    count_statement = count_statement.where(Role.deleted_at.is_(None))
    statement = statement.where(Role.deleted_at.is_(None))

    count = session.exec(count_statement).one()
    statement = statement.offset(skip).limit(limit).order_by(Role.priority.desc(), Role.name)
    roles = session.exec(statement).all()

    # Load permissions if requested
    if include_permissions:
        for role in roles:
            # Force load permissions relationship
            _ = role.permissions

    return RolesPublic(data=roles, count=count)


@router.get("/{role_id}", response_model=RolePublic)
def read_role(
    role_id: uuid.UUID,
    session: SessionDep,
    current_user: CurrentUser,
    include_permissions: bool = True,
) -> Any:
    """
    Get a specific role by id with its permissions.
    Requires rbac.read permission.
    """
    # TODO: Check rbac.read permission
    role = session.get(Role, role_id)
    if not role or role.deleted_at is not None:
        raise HTTPException(status_code=404, detail="Role not found")

    if include_permissions:
        _ = role.permissions

    return role


@router.post(
    "/",
    dependencies=[Depends(get_current_active_superuser)],
    response_model=RolePublic,
)
def create_role(
    *,
    session: SessionDep,
    role_in: RoleCreate,
    current_user: CurrentUser,
) -> Any:
    """
    Create new role.
    Requires rbac.manage permission or superuser.
    """
    # Check if code already exists
    statement = select(Role).where(
        Role.code == role_in.code,
        Role.deleted_at.is_(None)
    )
    existing = session.exec(statement).first()
    if existing:
        raise HTTPException(
            status_code=400,
            detail=f"Role with code '{role_in.code}' already exists",
        )

    # Extract permission_ids
    permission_ids = role_in.permission_ids
    role_data = role_in.model_dump(exclude={"permission_ids"})

    role = Role.model_validate(
        role_data,
        update={"created_by_id": current_user.id, "updated_by_id": current_user.id}
    )

    # Assign permissions if provided
    if permission_ids:
        permissions = session.exec(
            select(Permission).where(Permission.id.in_(permission_ids))
        ).all()
        role.permissions = permissions

    session.add(role)
    session.commit()
    session.refresh(role)
    return role


@router.patch(
    "/{role_id}",
    dependencies=[Depends(get_current_active_superuser)],
    response_model=RolePublic,
)
def update_role(
    *,
    session: SessionDep,
    role_id: uuid.UUID,
    role_in: RoleUpdate,
    current_user: CurrentUser,
) -> Any:
    """
    Update a role.
    Requires rbac.manage permission or superuser.
    """
    db_role = session.get(Role, role_id)
    if not db_role or db_role.deleted_at is not None:
        raise HTTPException(
            status_code=404,
            detail="The role with this id does not exist in the system",
        )

    # Prevent modification of system roles
    if db_role.is_system and not current_user.is_superuser:
        raise HTTPException(
            status_code=403,
            detail="System roles can only be modified by superusers"
        )

    # Check code uniqueness if changed
    if role_in.code and role_in.code != db_role.code:
        statement = select(Role).where(
            Role.code == role_in.code,
            Role.deleted_at.is_(None)
        )
        existing = session.exec(statement).first()
        if existing:
            raise HTTPException(
                status_code=409,
                detail=f"Role with code '{role_in.code}' already exists"
            )

    # Update permissions if provided
    permission_ids = role_in.permission_ids
    role_data = role_in.model_dump(exclude={"permission_ids"}, exclude_unset=True)

    db_role.sqlmodel_update(role_data)
    db_role.update_audit_trail(current_user.id)

    if permission_ids is not None:
        permissions = session.exec(
            select(Permission).where(Permission.id.in_(permission_ids))
        ).all()
        db_role.permissions = permissions

    session.add(db_role)
    session.commit()
    session.refresh(db_role)
    return db_role


@router.delete(
    "/{role_id}",
    dependencies=[Depends(get_current_active_superuser)],
    response_model=Message,
)
def delete_role(
    session: SessionDep,
    current_user: CurrentUser,
    role_id: uuid.UUID,
) -> Message:
    """
    Soft delete a role.
    Requires rbac.manage permission or superuser.
    """
    role = session.get(Role, role_id)
    if not role or role.deleted_at is not None:
        raise HTTPException(status_code=404, detail="Role not found")

    # Prevent deletion of system roles
    if role.is_system:
        raise HTTPException(
            status_code=403,
            detail="System roles cannot be deleted"
        )

    # Soft delete
    role.soft_delete(current_user.id)
    session.add(role)
    session.commit()

    return Message(message="Role deleted successfully")
