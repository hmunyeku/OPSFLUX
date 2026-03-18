"""Address routes — polymorphic addresses linked to any object.

Query by owner_type + owner_id to get addresses for any entity.
For user addresses: owner_type='user', owner_id=current_user.id.
"""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models.common import Address, User
from app.schemas.common import AddressCreate, AddressRead, AddressUpdate

router = APIRouter(prefix="/api/v1/addresses", tags=["addresses"])


@router.get("", response_model=list[AddressRead])
async def list_addresses(
    owner_type: str = Query(..., description="Object type: user, tier, asset, entity"),
    owner_id: UUID = Query(..., description="UUID of the owning object"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List addresses for a given owner (object type + id)."""
    result = await db.execute(
        select(Address)
        .where(Address.owner_type == owner_type, Address.owner_id == owner_id)
        .order_by(Address.is_default.desc(), Address.created_at)
    )
    return result.scalars().all()


@router.post("", response_model=AddressRead, status_code=201)
async def create_address(
    body: AddressCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new address linked to any object."""
    # If setting as default, unset other defaults for this owner
    if body.is_default:
        await db.execute(
            update(Address)
            .where(
                Address.owner_type == body.owner_type,
                Address.owner_id == body.owner_id,
            )
            .values(is_default=False)
        )

    address = Address(
        owner_type=body.owner_type,
        owner_id=body.owner_id,
        label=body.label,
        address_line1=body.address_line1,
        address_line2=body.address_line2,
        city=body.city,
        state_province=body.state_province,
        postal_code=body.postal_code,
        country=body.country,
        latitude=body.latitude,
        longitude=body.longitude,
        is_default=body.is_default,
    )
    db.add(address)
    await db.commit()
    await db.refresh(address)
    return address


@router.patch("/{address_id}", response_model=AddressRead)
async def update_address(
    address_id: UUID,
    body: AddressUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update an existing address."""
    result = await db.execute(
        select(Address).where(Address.id == address_id)
    )
    address = result.scalar_one_or_none()
    if not address:
        raise HTTPException(status_code=404, detail="Address not found")

    update_data = body.model_dump(exclude_unset=True)
    if not update_data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No fields to update",
        )

    # If setting as default, unset other defaults for same owner
    if update_data.get("is_default") is True:
        await db.execute(
            update(Address)
            .where(
                Address.owner_type == address.owner_type,
                Address.owner_id == address.owner_id,
                Address.id != address_id,
            )
            .values(is_default=False)
        )

    for field, value in update_data.items():
        setattr(address, field, value)

    await db.commit()
    await db.refresh(address)
    return address


@router.delete("/{address_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_address(
    address_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete an address."""
    result = await db.execute(
        select(Address).where(Address.id == address_id)
    )
    address = result.scalar_one_or_none()
    if not address:
        raise HTTPException(status_code=404, detail="Address not found")

    await db.delete(address)
    await db.commit()
