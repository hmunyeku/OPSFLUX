"""User passport routes — CRUD for user passport documents."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from starlette.requests import Request

from app.api.deps import get_current_user, check_user_data_access
from app.core.database import get_db
from app.services.core.delete_service import delete_entity
from app.models.common import UserPassport, User
from app.schemas.common import UserPassportCreate, UserPassportRead, UserPassportUpdate

router = APIRouter(prefix="/api/v1/users/{user_id}/passports", tags=["user-passports"])


@router.get("", response_model=list[UserPassportRead])
async def list_passports(
    user_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(UserPassport).where(UserPassport.user_id == user_id).order_by(UserPassport.created_at)
    )
    return result.scalars().all()


@router.post("", response_model=UserPassportRead, status_code=201)
async def create_passport(
    user_id: UUID,
    body: UserPassportCreate,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await check_user_data_access(user_id, current_user, db, request)
    obj = UserPassport(**body.model_dump(exclude={"user_id"}), user_id=user_id)
    db.add(obj)
    await db.commit()
    await db.refresh(obj)
    return obj


@router.patch("/{passport_id}", response_model=UserPassportRead)
async def update_passport(
    user_id: UUID,
    passport_id: UUID,
    body: UserPassportUpdate,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await check_user_data_access(user_id, current_user, db, request)
    result = await db.execute(select(UserPassport).where(UserPassport.id == passport_id))
    obj = result.scalar_one_or_none()
    if not obj:
        raise HTTPException(status_code=404, detail="Passport not found")
    update_data = body.model_dump(exclude_unset=True)
    if not update_data:
        raise HTTPException(status_code=400, detail="No fields to update")
    for field, value in update_data.items():
        setattr(obj, field, value)
    await db.commit()
    await db.refresh(obj)
    return obj


@router.delete("/{passport_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_passport(
    user_id: UUID,
    passport_id: UUID,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await check_user_data_access(user_id, current_user, db, request)
    result = await db.execute(select(UserPassport).where(UserPassport.id == passport_id))
    obj = result.scalar_one_or_none()
    if not obj:
        raise HTTPException(status_code=404, detail="Passport not found")
    await delete_entity(obj, db, "user_passport", entity_id=obj.id, user_id=current_user.id)
    await db.commit()
