"""
API endpoints for user permissions management.
Routes to view and manage user permissions with source tracking.
"""

import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import select

from app.api.deps import (
    CurrentUser,
    SessionDep,
)
from app.models import User
from app.models_rbac import (
    Permission,
    PermissionSource,
    UserPermissionWithSource,
    UserPermissionsWithSources,
)

router = APIRouter(prefix="/user-permissions", tags=["user-permissions"])


@router.get("/me", response_model=UserPermissionsWithSources)
def get_my_permissions(
    session: SessionDep,
    current_user: CurrentUser,
) -> Any:
    """
    Get all permissions for the current user with their sources.
    Returns permissions tagged with source (default, role, group, personal).
    """
    return get_user_permissions_with_sources(session, current_user.id)


@router.get("/{user_id}", response_model=UserPermissionsWithSources)
def get_user_permissions(
    user_id: uuid.UUID,
    session: SessionDep,
    current_user: CurrentUser,
) -> Any:
    """
    Get all permissions for a specific user with their sources.
    Admin only or user viewing their own permissions.
    """
    # Check permissions
    if not current_user.is_superuser and user_id != current_user.id:
        raise HTTPException(
            status_code=403,
            detail="You can only view your own permissions"
        )

    # Check if user exists
    user = session.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    return get_user_permissions_with_sources(session, user_id)


def get_user_permissions_with_sources(
    session: SessionDep,
    user_id: uuid.UUID,
) -> UserPermissionsWithSources:
    """
    Helper function to get all permissions for a user with their sources.

    Returns a list of permissions with tags indicating if they come from:
    - DEFAULT: Default permission for all users (is_default=true)
    - ROLE: Permission from one of user's roles
    - GROUP: Permission from one of user's groups
    - PERSONAL: Permission directly assigned to the user
    """
    from sqlmodel import col
    from sqlalchemy.orm import selectinload
    from app.models_rbac import Role, Group, UserRoleLink, UserGroupLink, UserPermissionLink

    permissions_map: dict[uuid.UUID, UserPermissionWithSource] = {}

    # 1. Get default permissions (lowest priority)
    default_perms = session.exec(
        select(Permission).where(
            Permission.is_default == True,
            Permission.is_active == True,
            Permission.deleted_at.is_(None)
        )
    ).all()

    for perm in default_perms:
        permissions_map[perm.id] = UserPermissionWithSource(
            permission=perm,
            source=PermissionSource.DEFAULT,
            source_name="Système"
        )

    # 2. Get permissions from user's roles
    user_roles = session.exec(
        select(Role)
        .join(UserRoleLink, UserRoleLink.role_id == Role.id)
        .where(
            UserRoleLink.user_id == user_id,
            Role.is_active == True,
            Role.deleted_at.is_(None)
        )
        .options(selectinload(Role.permissions))
    ).all()

    for role in user_roles:
        for perm in role.permissions:
            if perm.is_active and perm.deleted_at is None:
                # Role permissions overwrite default permissions
                permissions_map[perm.id] = UserPermissionWithSource(
                    permission=perm,
                    source=PermissionSource.ROLE,
                    source_name=role.name
                )

    # 3. Get permissions from user's groups
    user_groups = session.exec(
        select(Group)
        .join(UserGroupLink, UserGroupLink.group_id == Group.id)
        .where(
            UserGroupLink.user_id == user_id,
            Group.is_active == True,
            Group.deleted_at.is_(None)
        )
        .options(selectinload(Group.permissions))
    ).all()

    for group in user_groups:
        for perm in group.permissions:
            if perm.is_active and perm.deleted_at is None:
                # Group permissions overwrite default and role permissions
                permissions_map[perm.id] = UserPermissionWithSource(
                    permission=perm,
                    source=PermissionSource.GROUP,
                    source_name=group.name
                )

    # 4. Get personal permissions (highest priority - overwrites others)
    personal_perms = session.exec(
        select(Permission)
        .join(UserPermissionLink, UserPermissionLink.permission_id == Permission.id)
        .where(
            UserPermissionLink.user_id == user_id,
            Permission.is_active == True,
            Permission.deleted_at.is_(None)
        )
    ).all()

    for perm in personal_perms:
        # Personal permissions have highest priority
        permissions_map[perm.id] = UserPermissionWithSource(
            permission=perm,
            source=PermissionSource.PERSONAL,
            source_name="Personnel"
        )

    # Convert to list
    permissions_list = list(permissions_map.values())

    return UserPermissionsWithSources(
        data=permissions_list,
        count=len(permissions_list)
    )
