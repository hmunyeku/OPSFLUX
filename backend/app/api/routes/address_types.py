"""
API endpoints for address type management.
Admin-only routes for configuring address types used in the system.
"""

import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import col, delete, func, select

from app.api.deps import (
    CurrentUser,
    SessionDep,
    get_current_active_superuser,
)
from app.models_address import (
    AddressType,
    AddressTypeCreate,
    AddressTypePublic,
    AddressTypesPublic,
    AddressTypeUpdate,
    Message,
)

router = APIRouter(prefix="/address-types", tags=["address-types"])


@router.get("/", response_model=AddressTypesPublic)
def read_address_types(
    session: SessionDep,
    current_user: CurrentUser,
    skip: int = 0,
    limit: int = 100,
    active_only: bool = True,
) -> Any:
    """
    Retrieve address types.
    Regular users see only active types, superusers see all.
    """
    count_statement = select(func.count()).select_from(AddressType)
    statement = select(AddressType)

    # Regular users only see active types
    if not current_user.is_superuser and active_only:
        count_statement = count_statement.where(AddressType.is_active == True)
        statement = statement.where(AddressType.is_active == True)

    # Filter deleted items
    count_statement = count_statement.where(AddressType.deleted_at.is_(None))
    statement = statement.where(AddressType.deleted_at.is_(None))

    count = session.exec(count_statement).one()
    statement = statement.offset(skip).limit(limit).order_by(AddressType.name)
    address_types = session.exec(statement).all()

    return AddressTypesPublic(data=address_types, count=count)


@router.get("/{address_type_id}", response_model=AddressTypePublic)
def read_address_type(
    address_type_id: uuid.UUID,
    session: SessionDep,
    current_user: CurrentUser,
) -> Any:
    """
    Get a specific address type by id.
    """
    address_type = session.get(AddressType, address_type_id)
    if not address_type or address_type.deleted_at is not None:
        raise HTTPException(status_code=404, detail="Address type not found")

    # Regular users can only see active types
    if not current_user.is_superuser and not address_type.is_active:
        raise HTTPException(
            status_code=403,
            detail="The user doesn't have enough privileges",
        )

    return address_type


@router.post(
    "/",
    dependencies=[Depends(get_current_active_superuser)],
    response_model=AddressTypePublic,
)
def create_address_type(
    *,
    session: SessionDep,
    address_type_in: AddressTypeCreate,
    current_user: CurrentUser,
) -> Any:
    """
    Create new address type.
    Admin only.
    """
    # Check if code already exists
    statement = select(AddressType).where(
        AddressType.code == address_type_in.code,
        AddressType.deleted_at.is_(None)
    )
    existing = session.exec(statement).first()
    if existing:
        raise HTTPException(
            status_code=400,
            detail=f"Address type with code '{address_type_in.code}' already exists",
        )

    address_type = AddressType.model_validate(
        address_type_in,
        update={"created_by_id": current_user.id, "updated_by_id": current_user.id}
    )
    session.add(address_type)
    session.commit()
    session.refresh(address_type)
    return address_type


@router.patch(
    "/{address_type_id}",
    dependencies=[Depends(get_current_active_superuser)],
    response_model=AddressTypePublic,
)
def update_address_type(
    *,
    session: SessionDep,
    address_type_id: uuid.UUID,
    address_type_in: AddressTypeUpdate,
    current_user: CurrentUser,
) -> Any:
    """
    Update an address type.
    Admin only.
    """
    db_address_type = session.get(AddressType, address_type_id)
    if not db_address_type or db_address_type.deleted_at is not None:
        raise HTTPException(
            status_code=404,
            detail="The address type with this id does not exist in the system",
        )

    # Check code uniqueness if changed
    if address_type_in.code and address_type_in.code != db_address_type.code:
        statement = select(AddressType).where(
            AddressType.code == address_type_in.code,
            AddressType.deleted_at.is_(None)
        )
        existing = session.exec(statement).first()
        if existing:
            raise HTTPException(
                status_code=409,
                detail=f"Address type with code '{address_type_in.code}' already exists"
            )

    address_type_data = address_type_in.model_dump(exclude_unset=True)
    db_address_type.sqlmodel_update(address_type_data)
    db_address_type.update_audit_trail(current_user.id)

    session.add(db_address_type)
    session.commit()
    session.refresh(db_address_type)
    return db_address_type


@router.delete(
    "/{address_type_id}",
    dependencies=[Depends(get_current_active_superuser)],
    response_model=Message,
)
def delete_address_type(
    session: SessionDep,
    current_user: CurrentUser,
    address_type_id: uuid.UUID,
) -> Message:
    """
    Soft delete an address type.
    Admin only.
    """
    address_type = session.get(AddressType, address_type_id)
    if not address_type or address_type.deleted_at is not None:
        raise HTTPException(status_code=404, detail="Address type not found")

    # Soft delete
    address_type.soft_delete(current_user.id)
    session.add(address_type)
    session.commit()

    return Message(message="Address type deleted successfully")
