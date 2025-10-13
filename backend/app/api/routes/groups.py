"""
API endpoints for group management (RBAC).
Admin-only routes for managing groups and their permissions.
"""

import uuid
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import func, select

from app.api.deps import (
    CurrentUser,
    SessionDep,
    get_current_active_superuser,
)
from app.models_rbac import (
    Group,
    GroupCreate,
    GroupPublic,
    GroupsPublic,
    GroupUpdate,
    Message,
    Permission,
)

router = APIRouter(prefix="/groups", tags=["groups"])


@router.get("/", response_model=GroupsPublic)
def read_groups(
    session: SessionDep,
    current_user: CurrentUser,
    skip: int = 0,
    limit: int = 100,
    parent_id: Optional[uuid.UUID] = Query(None, description="Filter by parent group"),
    is_active: bool = True,
    include_permissions: bool = False,
) -> Any:
    """
    Retrieve groups.
    Requires rbac.read permission.
    """
    # TODO: Check rbac.read permission
    count_statement = select(func.count()).select_from(Group)
    statement = select(Group)

    if parent_id is not None:
        count_statement = count_statement.where(Group.parent_id == parent_id)
        statement = statement.where(Group.parent_id == parent_id)

    if is_active is not None:
        count_statement = count_statement.where(Group.is_active == is_active)
        statement = statement.where(Group.is_active == is_active)

    # Filter deleted items
    count_statement = count_statement.where(Group.deleted_at.is_(None))
    statement = statement.where(Group.deleted_at.is_(None))

    count = session.exec(count_statement).one()
    statement = statement.offset(skip).limit(limit).order_by(Group.name)
    groups = session.exec(statement).all()

    # Load permissions if requested
    if include_permissions:
        for group in groups:
            _ = group.permissions

    return GroupsPublic(data=groups, count=count)


@router.get("/{group_id}", response_model=GroupPublic)
def read_group(
    group_id: uuid.UUID,
    session: SessionDep,
    current_user: CurrentUser,
    include_permissions: bool = True,
) -> Any:
    """
    Get a specific group by id with its permissions.
    Requires rbac.read permission.
    """
    # TODO: Check rbac.read permission
    group = session.get(Group, group_id)
    if not group or group.deleted_at is not None:
        raise HTTPException(status_code=404, detail="Group not found")

    if include_permissions:
        _ = group.permissions

    return group


@router.post(
    "/",
    dependencies=[Depends(get_current_active_superuser)],
    response_model=GroupPublic,
)
def create_group(
    *,
    session: SessionDep,
    group_in: GroupCreate,
    current_user: CurrentUser,
) -> Any:
    """
    Create new group.
    Requires rbac.manage permission or superuser.
    """
    # Check if code already exists
    statement = select(Group).where(
        Group.code == group_in.code,
        Group.deleted_at.is_(None)
    )
    existing = session.exec(statement).first()
    if existing:
        raise HTTPException(
            status_code=400,
            detail=f"Group with code '{group_in.code}' already exists",
        )

    # Validate parent_id if provided
    if group_in.parent_id:
        parent = session.get(Group, group_in.parent_id)
        if not parent or parent.deleted_at is not None:
            raise HTTPException(
                status_code=404,
                detail="Parent group not found"
            )

    # Extract permission_ids
    permission_ids = group_in.permission_ids
    group_data = group_in.model_dump(exclude={"permission_ids"})

    group = Group.model_validate(
        group_data,
        update={"created_by_id": current_user.id, "updated_by_id": current_user.id}
    )

    # Assign permissions if provided
    if permission_ids:
        permissions = session.exec(
            select(Permission).where(Permission.id.in_(permission_ids))
        ).all()
        group.permissions = permissions

    session.add(group)
    session.commit()
    session.refresh(group)
    return group


@router.patch(
    "/{group_id}",
    dependencies=[Depends(get_current_active_superuser)],
    response_model=GroupPublic,
)
def update_group(
    *,
    session: SessionDep,
    group_id: uuid.UUID,
    group_in: GroupUpdate,
    current_user: CurrentUser,
) -> Any:
    """
    Update a group.
    Requires rbac.manage permission or superuser.
    """
    db_group = session.get(Group, group_id)
    if not db_group or db_group.deleted_at is not None:
        raise HTTPException(
            status_code=404,
            detail="The group with this id does not exist in the system",
        )

    # Check code uniqueness if changed
    if group_in.code and group_in.code != db_group.code:
        statement = select(Group).where(
            Group.code == group_in.code,
            Group.deleted_at.is_(None)
        )
        existing = session.exec(statement).first()
        if existing:
            raise HTTPException(
                status_code=409,
                detail=f"Group with code '{group_in.code}' already exists"
            )

    # Validate parent_id if being changed
    if group_in.parent_id and group_in.parent_id != db_group.parent_id:
        # Prevent circular references
        if group_in.parent_id == group_id:
            raise HTTPException(
                status_code=400,
                detail="A group cannot be its own parent"
            )

        parent = session.get(Group, group_in.parent_id)
        if not parent or parent.deleted_at is not None:
            raise HTTPException(
                status_code=404,
                detail="Parent group not found"
            )

    # Update permissions if provided
    permission_ids = group_in.permission_ids
    group_data = group_in.model_dump(exclude={"permission_ids"}, exclude_unset=True)

    db_group.sqlmodel_update(group_data)
    db_group.update_audit_trail(current_user.id)

    if permission_ids is not None:
        permissions = session.exec(
            select(Permission).where(Permission.id.in_(permission_ids))
        ).all()
        db_group.permissions = permissions

    session.add(db_group)
    session.commit()
    session.refresh(db_group)
    return db_group


@router.delete(
    "/{group_id}",
    dependencies=[Depends(get_current_active_superuser)],
    response_model=Message,
)
def delete_group(
    session: SessionDep,
    current_user: CurrentUser,
    group_id: uuid.UUID,
) -> Message:
    """
    Soft delete a group.
    Requires rbac.manage permission or superuser.
    """
    group = session.get(Group, group_id)
    if not group or group.deleted_at is not None:
        raise HTTPException(status_code=404, detail="Group not found")

    # Soft delete
    group.soft_delete(current_user.id)
    session.add(group)
    session.commit()

    return Message(message="Group deleted successfully")
