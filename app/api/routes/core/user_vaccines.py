"""User vaccine routes — CRUD for user vaccine records."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.requests import Request

from app.api.deps import get_current_user, check_user_data_access
from app.core.database import get_db
from app.services.core.delete_service import delete_entity
from app.models.common import UserVaccine, User
from app.schemas.common import UserVaccineCreate, UserVaccineRead, UserVaccineUpdate

router = APIRouter(prefix="/api/v1/users/{user_id}/vaccines", tags=["user-vaccines"])


@router.get("", response_model=list[UserVaccineRead])
async def list_vaccines(
    user_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(UserVaccine).where(UserVaccine.user_id == user_id).order_by(UserVaccine.created_at)
    )
    return result.scalars().all()


@router.post("", response_model=UserVaccineRead, status_code=201)
async def create_vaccine(
    user_id: UUID,
    body: UserVaccineCreate,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await check_user_data_access(user_id, current_user, db, request)
    obj = UserVaccine(**body.model_dump(exclude={"user_id"}), user_id=user_id)
    db.add(obj)
    await db.commit()
    await db.refresh(obj)
    return obj


@router.patch("/{vaccine_id}", response_model=UserVaccineRead)
async def update_vaccine(
    user_id: UUID,
    vaccine_id: UUID,
    body: UserVaccineUpdate,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await check_user_data_access(user_id, current_user, db, request)
    result = await db.execute(select(UserVaccine).where(UserVaccine.id == vaccine_id))
    obj = result.scalar_one_or_none()
    if not obj:
        raise HTTPException(status_code=404, detail="Vaccine not found")
    update_data = body.model_dump(exclude_unset=True)
    if not update_data:
        raise HTTPException(status_code=400, detail="No fields to update")
    for field, value in update_data.items():
        setattr(obj, field, value)
    await db.commit()
    await db.refresh(obj)
    return obj


@router.delete("/{vaccine_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_vaccine(
    user_id: UUID,
    vaccine_id: UUID,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await check_user_data_access(user_id, current_user, db, request)
    result = await db.execute(select(UserVaccine).where(UserVaccine.id == vaccine_id))
    obj = result.scalar_one_or_none()
    if not obj:
        raise HTTPException(status_code=404, detail="Vaccine not found")
    await delete_entity(obj, db, "user_vaccine", entity_id=obj.id, user_id=current_user.id)
