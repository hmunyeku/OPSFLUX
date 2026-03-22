"""User social security routes — CRUD for user social security records."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.requests import Request

from app.api.deps import get_current_user, check_user_data_access
from app.core.database import get_db
from app.models.common import SocialSecurity, User
from app.schemas.common import SocialSecurityCreate, SocialSecurityRead, SocialSecurityUpdate
from app.services.core.delete_service import delete_entity

router = APIRouter(prefix="/api/v1/users/{user_id}/social-securities", tags=["user-social-securities"])


@router.get("", response_model=list[SocialSecurityRead])
async def list_social_securities(
    user_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(SocialSecurity).where(SocialSecurity.user_id == user_id).order_by(SocialSecurity.created_at)
    )
    return result.scalars().all()


@router.post("", response_model=SocialSecurityRead, status_code=201)
async def create_social_security(
    user_id: UUID,
    body: SocialSecurityCreate,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await check_user_data_access(user_id, current_user, db, request)
    obj = SocialSecurity(**body.model_dump(exclude={"user_id"}), user_id=user_id)
    db.add(obj)
    await db.commit()
    await db.refresh(obj)
    return obj


@router.patch("/{social_security_id}", response_model=SocialSecurityRead)
async def update_social_security(
    user_id: UUID,
    social_security_id: UUID,
    body: SocialSecurityUpdate,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await check_user_data_access(user_id, current_user, db, request)
    result = await db.execute(select(SocialSecurity).where(SocialSecurity.id == social_security_id))
    obj = result.scalar_one_or_none()
    if not obj:
        raise HTTPException(status_code=404, detail="Social security record not found")
    update_data = body.model_dump(exclude_unset=True)
    if not update_data:
        raise HTTPException(status_code=400, detail="No fields to update")
    for field, value in update_data.items():
        setattr(obj, field, value)
    await db.commit()
    await db.refresh(obj)
    return obj


@router.delete("/{social_security_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_social_security(
    user_id: UUID,
    social_security_id: UUID,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await check_user_data_access(user_id, current_user, db, request)
    result = await db.execute(select(SocialSecurity).where(SocialSecurity.id == social_security_id))
    obj = result.scalar_one_or_none()
    if not obj:
        raise HTTPException(status_code=404, detail="Social security record not found")
    await delete_entity(obj, db, "social_security", entity_id=obj.id, user_id=current_user.id)
