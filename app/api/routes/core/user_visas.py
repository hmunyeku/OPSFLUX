"""User visa routes — CRUD for user visa documents."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from starlette.requests import Request

from app.api.deps import get_current_user, check_user_data_access, check_verified_lock
from app.core.database import get_db
from app.services.core.delete_service import delete_entity
from app.models.common import UserVisa, User
from app.schemas.common import UserVisaCreate, UserVisaRead, UserVisaUpdate
from app.core.errors import StructuredHTTPException

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
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await check_user_data_access(user_id, current_user, db, request)
    obj = UserVisa(**body.model_dump(exclude={"user_id"}), user_id=user_id)
    db.add(obj)
    await db.commit()
    await db.refresh(obj)
    return obj


@router.patch("/{visa_id}", response_model=UserVisaRead)
async def update_visa(
    user_id: UUID,
    visa_id: UUID,
    body: UserVisaUpdate,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await check_user_data_access(user_id, current_user, db, request)
    result = await db.execute(select(UserVisa).where(UserVisa.id == visa_id))
    obj = result.scalar_one_or_none()
    if not obj:
        raise StructuredHTTPException(
            404,
            code="VISA_NOT_FOUND",
            message="Visa not found",
        )
    await check_verified_lock(obj, current_user, db=db)
    update_data = body.model_dump(exclude_unset=True)
    if not update_data:
        raise StructuredHTTPException(
            400,
            code="NO_FIELDS_UPDATE",
            message="No fields to update",
        )
    for field, value in update_data.items():
        setattr(obj, field, value)
    await db.commit()
    await db.refresh(obj)
    return obj


@router.delete("/{visa_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_visa(
    user_id: UUID,
    visa_id: UUID,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await check_user_data_access(user_id, current_user, db, request)
    result = await db.execute(select(UserVisa).where(UserVisa.id == visa_id))
    obj = result.scalar_one_or_none()
    if not obj:
        raise StructuredHTTPException(
            404,
            code="VISA_NOT_FOUND",
            message="Visa not found",
        )
    await check_verified_lock(obj, current_user, db=db)
    await delete_entity(obj, db, "user_visa", entity_id=obj.id, user_id=current_user.id)
    await db.commit()
