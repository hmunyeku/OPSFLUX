"""
API endpoints for address management.
Supports polymorphic address association with users, companies, and other entities.
"""

import uuid
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import col, func, select

from app.api.deps import (
    CurrentUser,
    SessionDep,
)
from app.models_address import (
    Address,
    AddressCreate,
    AddressPublic,
    AddressesPublic,
    AddressUpdate,
    Message,
)

router = APIRouter(prefix="/addresses", tags=["addresses"])


@router.get("/", response_model=AddressesPublic)
def read_addresses(
    session: SessionDep,
    current_user: CurrentUser,
    skip: int = 0,
    limit: int = 100,
    entity_type: Optional[str] = Query(None, description="Filter by entity type (user, company, etc.)"),
    entity_id: Optional[uuid.UUID] = Query(None, description="Filter by entity ID"),
    address_type_id: Optional[uuid.UUID] = Query(None, description="Filter by address type"),
    is_default: Optional[bool] = Query(None, description="Filter by default addresses"),
    country: Optional[str] = Query(None, description="Filter by country code"),
) -> Any:
    """
    Retrieve addresses with optional filters.
    Regular users can only see their own addresses unless superuser.
    """
    count_statement = select(func.count()).select_from(Address)
    statement = select(Address)

    # Apply filters
    if entity_type:
        count_statement = count_statement.where(Address.entity_type == entity_type)
        statement = statement.where(Address.entity_type == entity_type)

    if entity_id:
        count_statement = count_statement.where(Address.entity_id == entity_id)
        statement = statement.where(Address.entity_id == entity_id)

    if address_type_id:
        count_statement = count_statement.where(Address.address_type_id == address_type_id)
        statement = statement.where(Address.address_type_id == address_type_id)

    if is_default is not None:
        count_statement = count_statement.where(Address.is_default == is_default)
        statement = statement.where(Address.is_default == is_default)

    if country:
        count_statement = count_statement.where(Address.country == country)
        statement = statement.where(Address.country == country)

    # Regular users can only see addresses for their own user entity (unless superuser)
    if not current_user.is_superuser:
        # If no entity filter specified, default to showing user's own addresses
        if not entity_type and not entity_id:
            count_statement = count_statement.where(
                Address.entity_type == "user",
                Address.entity_id == current_user.id
            )
            statement = statement.where(
                Address.entity_type == "user",
                Address.entity_id == current_user.id
            )
        # If entity specified but not the user's own, deny access
        elif entity_type == "user" and entity_id != current_user.id:
            raise HTTPException(
                status_code=403,
                detail="You can only view your own addresses"
            )

    # Filter deleted items
    count_statement = count_statement.where(Address.deleted_at.is_(None))
    statement = statement.where(Address.deleted_at.is_(None))

    count = session.exec(count_statement).one()
    statement = statement.offset(skip).limit(limit).order_by(
        Address.is_default.desc(),
        Address.created_at.desc()
    )
    addresses = session.exec(statement).all()

    return AddressesPublic(data=addresses, count=count)


@router.get("/{address_id}", response_model=AddressPublic)
def read_address(
    address_id: uuid.UUID,
    session: SessionDep,
    current_user: CurrentUser,
) -> Any:
    """
    Get a specific address by id.
    """
    address = session.get(Address, address_id)
    if not address or address.deleted_at is not None:
        raise HTTPException(status_code=404, detail="Address not found")

    # Check permissions
    if not current_user.is_superuser:
        if address.entity_type == "user" and address.entity_id != current_user.id:
            raise HTTPException(
                status_code=403,
                detail="You can only view your own addresses"
            )

    return address


@router.post("/", response_model=AddressPublic)
def create_address(
    *,
    session: SessionDep,
    address_in: AddressCreate,
    current_user: CurrentUser,
) -> Any:
    """
    Create new address.
    Users can create addresses for themselves, superusers for any entity.
    """
    # Check permissions
    if not current_user.is_superuser:
        if address_in.entity_type != "user" or address_in.entity_id != current_user.id:
            raise HTTPException(
                status_code=403,
                detail="You can only create addresses for yourself"
            )

    # If this is set as default, unset other defaults for same entity/type
    if address_in.is_default:
        statement = select(Address).where(
            Address.entity_type == address_in.entity_type,
            Address.entity_id == address_in.entity_id,
            Address.address_type_id == address_in.address_type_id,
            Address.is_default == True,
            Address.deleted_at.is_(None)
        )
        existing_defaults = session.exec(statement).all()
        for existing in existing_defaults:
            existing.is_default = False
            session.add(existing)

    address = Address.model_validate(
        address_in,
        update={"created_by_id": current_user.id, "updated_by_id": current_user.id}
    )
    session.add(address)
    session.commit()
    session.refresh(address)
    return address


@router.patch("/{address_id}", response_model=AddressPublic)
def update_address(
    *,
    session: SessionDep,
    address_id: uuid.UUID,
    address_in: AddressUpdate,
    current_user: CurrentUser,
) -> Any:
    """
    Update an address.
    """
    db_address = session.get(Address, address_id)
    if not db_address or db_address.deleted_at is not None:
        raise HTTPException(
            status_code=404,
            detail="The address with this id does not exist in the system",
        )

    # Check permissions
    if not current_user.is_superuser:
        if db_address.entity_type == "user" and db_address.entity_id != current_user.id:
            raise HTTPException(
                status_code=403,
                detail="You can only update your own addresses"
            )

    # If setting as default, unset other defaults
    if address_in.is_default and not db_address.is_default:
        statement = select(Address).where(
            Address.entity_type == db_address.entity_type,
            Address.entity_id == db_address.entity_id,
            Address.address_type_id == db_address.address_type_id,
            Address.is_default == True,
            Address.deleted_at.is_(None),
            Address.id != address_id
        )
        existing_defaults = session.exec(statement).all()
        for existing in existing_defaults:
            existing.is_default = False
            session.add(existing)

    address_data = address_in.model_dump(exclude_unset=True)
    db_address.sqlmodel_update(address_data)
    db_address.update_audit_trail(current_user.id)

    session.add(db_address)
    session.commit()
    session.refresh(db_address)
    return db_address


@router.delete("/{address_id}", response_model=Message)
def delete_address(
    session: SessionDep,
    current_user: CurrentUser,
    address_id: uuid.UUID,
) -> Message:
    """
    Soft delete an address.
    """
    address = session.get(Address, address_id)
    if not address or address.deleted_at is not None:
        raise HTTPException(status_code=404, detail="Address not found")

    # Check permissions
    if not current_user.is_superuser:
        if address.entity_type == "user" and address.entity_id != current_user.id:
            raise HTTPException(
                status_code=403,
                detail="You can only delete your own addresses"
            )

    # Soft delete
    address.soft_delete(current_user.id)
    session.add(address)
    session.commit()

    return Message(message="Address deleted successfully")


# TODO: Implement Google Maps integration endpoints
# These will require Google Maps API key configuration

# @router.post("/validate", response_model=AddressValidationResponse)
# async def validate_address(
#     *,
#     session: SessionDep,
#     current_user: CurrentUser,
#     validation_request: AddressValidationRequest,
# ) -> Any:
#     """
#     Validate an address using Google Maps API.
#     Returns formatted address, coordinates, and validation status.
#     """
#     # TODO: Implement Google Maps Address Validation API
#     pass


# @router.post("/geocode", response_model=GeocodeResponse)
# async def geocode_address(
#     *,
#     session: SessionDep,
#     current_user: CurrentUser,
#     geocode_request: GeocodeRequest,
# ) -> Any:
#     """
#     Geocode an address to get coordinates using Google Maps API.
#     """
#     # TODO: Implement Google Maps Geocoding API
#     pass
