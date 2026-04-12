"""Opening hours routes — polymorphic schedule for any object."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models.common import OpeningHour, User
from app.schemas.common import OpeningHourCreate, OpeningHourRead, OpeningHourUpdate
from app.services.core.delete_service import delete_entity

router = APIRouter(prefix="/api/v1/opening-hours", tags=["opening-hours"])


@router.get("", response_model=list[OpeningHourRead])
async def list_opening_hours(
    owner_type: str = Query(...),
    owner_id: UUID = Query(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(OpeningHour)
        .where(OpeningHour.owner_type == owner_type, OpeningHour.owner_id == owner_id)
        .order_by(OpeningHour.day_of_week, OpeningHour.open_time)
    )
    return result.scalars().all()


@router.post("", response_model=OpeningHourRead, status_code=201)
async def create_opening_hour(
    body: OpeningHourCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    oh = OpeningHour(**body.model_dump())
    db.add(oh)
    await db.commit()
    await db.refresh(oh)
    return oh


@router.patch("/{item_id}", response_model=OpeningHourRead)
async def update_opening_hour(
    item_id: UUID,
    body: OpeningHourUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(OpeningHour).where(OpeningHour.id == item_id))
    oh = result.scalar_one_or_none()
    if not oh:
        raise HTTPException(status_code=404, detail="Opening hour not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(oh, field, value)
    await db.commit()
    await db.refresh(oh)
    return oh


@router.delete("/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_opening_hour(
    item_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(OpeningHour).where(OpeningHour.id == item_id))
    oh = result.scalar_one_or_none()
    if not oh:
        raise HTTPException(status_code=404, detail="Opening hour not found")
    await delete_entity(oh, db, "opening_hour", entity_id=oh.id, user_id=current_user.id)
    await db.commit()
