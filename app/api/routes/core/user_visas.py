"""User visa routes — CRUD for user visa documents."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models.common import UserVisa, User
from app.schemas.common import UserVisaCreate, UserVisaRead, UserVisaUpdate

router = APIRouter(prefix="/api/v1/users/{user_id}/visas", tags=["user-visas"])


@router.get("", response_model=list[UserVisaRead])
async def list_visas(
    user_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(UserVisa).where(UserVisa.user_id == user_id).order_by(UserVisa.created_at)
    )
    return result.scalars().all()


@router.post("", response_model=UserVisaRead, status_code=201)
async def create_visa(
    user_id: UUID,
    body: UserVisaCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    obj = UserVisa(**body.model_dump(exclude={"user_id"}), user_id=user_id)
    db.add(obj)
    await db.commit()
    await db.refresh(obj)
    return obj


@router.patch("/{visa_id}", response_model=UserVisaRead)
async def update_visa(
    visa_id: UUID,
    body: UserVisaUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(UserVisa).where(UserVisa.id == visa_id))
    obj = result.scalar_one_or_none()
    if not obj:
        raise HTTPException(status_code=404, detail="Visa not found")
    update_data = body.model_dump(exclude_unset=True)
    if not update_data:
        raise HTTPException(status_code=400, detail="No fields to update")
    for field, value in update_data.items():
        setattr(obj, field, value)
    await db.commit()
    await db.refresh(obj)
    return obj


@router.delete("/{visa_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_visa(
    visa_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(UserVisa).where(UserVisa.id == visa_id))
    obj = result.scalar_one_or_none()
    if not obj:
        raise HTTPException(status_code=404, detail="Visa not found")
    await db.delete(obj)
    await db.commit()
