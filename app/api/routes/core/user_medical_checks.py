"""User medical check routes — CRUD for user medical check records."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from starlette.requests import Request

from app.api.deps import get_current_user, check_user_data_access
from app.core.database import get_db
from app.models.common import UserMedicalCheck, User
from app.schemas.common import UserMedicalCheckCreate, UserMedicalCheckRead, UserMedicalCheckUpdate
from app.core.errors import StructuredHTTPException

router = APIRouter(prefix="/api/v1/users/{user_id}/medical-checks", tags=["user-medical-checks"])


@router.get("", response_model=list[UserMedicalCheckRead])
async def list_medical_checks(
    user_id: UUID,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await check_user_data_access(user_id, current_user, db, request)
    result = await db.execute(
        select(UserMedicalCheck).where(UserMedicalCheck.user_id == user_id).order_by(UserMedicalCheck.check_date.desc())
    )
    return result.scalars().all()


@router.post("", response_model=UserMedicalCheckRead, status_code=201)
async def create_medical_check(
    user_id: UUID,
    body: UserMedicalCheckCreate,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await check_user_data_access(user_id, current_user, db, request)
    obj = UserMedicalCheck(**body.model_dump(exclude={"user_id"}), user_id=user_id)
    db.add(obj)
    await db.commit()
    await db.refresh(obj)
    return obj


@router.patch("/{check_id}", response_model=UserMedicalCheckRead)
async def update_medical_check(
    user_id: UUID,
    check_id: UUID,
    body: UserMedicalCheckUpdate,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await check_user_data_access(user_id, current_user, db, request)
    result = await db.execute(
        select(UserMedicalCheck).where(
            UserMedicalCheck.id == check_id,
            UserMedicalCheck.user_id == user_id,
        )
    )
    obj = result.scalar_one_or_none()
    if not obj:
        raise StructuredHTTPException(
            404,
            code="MEDICAL_CHECK_NOT_FOUND",
            message="Medical check not found",
        )
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


@router.delete("/{check_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_medical_check(
    user_id: UUID,
    check_id: UUID,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await check_user_data_access(user_id, current_user, db, request)
    result = await db.execute(
        select(UserMedicalCheck).where(
            UserMedicalCheck.id == check_id,
            UserMedicalCheck.user_id == user_id,
        )
    )
    obj = result.scalar_one_or_none()
    if not obj:
        raise StructuredHTTPException(
            404,
            code="MEDICAL_CHECK_NOT_FOUND",
            message="Medical check not found",
        )
    await db.delete(obj)
    await db.commit()
