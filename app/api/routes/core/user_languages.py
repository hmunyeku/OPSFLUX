"""User language routes — CRUD for user language records."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.requests import Request

from app.api.deps import get_current_user, check_user_data_access
from app.core.database import get_db
from app.services.core.delete_service import delete_entity
from app.models.common import UserLanguage, User
from app.schemas.common import UserLanguageCreate, UserLanguageRead, UserLanguageUpdate
from app.core.errors import StructuredHTTPException

router = APIRouter(prefix="/api/v1/users/{user_id}/languages", tags=["user-languages"])


@router.get("", response_model=list[UserLanguageRead])
async def list_languages(
    user_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(UserLanguage).where(UserLanguage.user_id == user_id).order_by(UserLanguage.created_at)
    )
    return result.scalars().all()


@router.post("", response_model=UserLanguageRead, status_code=201)
async def create_language(
    user_id: UUID,
    body: UserLanguageCreate,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await check_user_data_access(user_id, current_user, db, request)
    obj = UserLanguage(**body.model_dump(exclude={"user_id"}), user_id=user_id)
    db.add(obj)
    await db.commit()
    await db.refresh(obj)
    return obj


@router.patch("/{language_id}", response_model=UserLanguageRead)
async def update_language(
    user_id: UUID,
    language_id: UUID,
    body: UserLanguageUpdate,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await check_user_data_access(user_id, current_user, db, request)
    result = await db.execute(select(UserLanguage).where(UserLanguage.id == language_id))
    obj = result.scalar_one_or_none()
    if not obj:
        raise StructuredHTTPException(
            404,
            code="LANGUAGE_NOT_FOUND",
            message="Language not found",
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


@router.delete("/{language_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_language(
    user_id: UUID,
    language_id: UUID,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await check_user_data_access(user_id, current_user, db, request)
    result = await db.execute(select(UserLanguage).where(UserLanguage.id == language_id))
    obj = result.scalar_one_or_none()
    if not obj:
        raise StructuredHTTPException(
            404,
            code="LANGUAGE_NOT_FOUND",
            message="Language not found",
        )
    await delete_entity(obj, db, "user_language", entity_id=obj.id, user_id=current_user.id)
