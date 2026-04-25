"""User driving license routes — CRUD for user driving license records."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.requests import Request

from app.api.deps import get_current_user, check_user_data_access, check_verified_lock
from app.core.database import get_db
from app.services.core.delete_service import delete_entity
from app.models.common import DrivingLicense, User
from app.schemas.common import DrivingLicenseCreate, DrivingLicenseRead, DrivingLicenseUpdate

router = APIRouter(prefix="/api/v1/users/{user_id}/driving-licenses", tags=["user-driving-licenses"])


@router.get("", response_model=list[DrivingLicenseRead])
async def list_driving_licenses(
    user_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(DrivingLicense).where(DrivingLicense.user_id == user_id).order_by(DrivingLicense.created_at)
    )
    return result.scalars().all()


@router.post("", response_model=DrivingLicenseRead, status_code=201)
async def create_driving_license(
    user_id: UUID,
    body: DrivingLicenseCreate,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await check_user_data_access(user_id, current_user, db, request)
    obj = DrivingLicense(**body.model_dump(exclude={"user_id"}), user_id=user_id)
    db.add(obj)
    await db.commit()
    await db.refresh(obj)
    return obj


@router.patch("/{driving_license_id}", response_model=DrivingLicenseRead)
async def update_driving_license(
    user_id: UUID,
    driving_license_id: UUID,
    body: DrivingLicenseUpdate,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await check_user_data_access(user_id, current_user, db, request)
    result = await db.execute(select(DrivingLicense).where(DrivingLicense.id == driving_license_id))
    obj = result.scalar_one_or_none()
    if not obj:
        raise HTTPException(status_code=404, detail="Driving license not found")
    await check_verified_lock(obj, current_user, db=db)
    update_data = body.model_dump(exclude_unset=True)
    if not update_data:
        raise HTTPException(status_code=400, detail="No fields to update")
    for field, value in update_data.items():
        setattr(obj, field, value)
    await db.commit()
    await db.refresh(obj)
    return obj


@router.delete("/{driving_license_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_driving_license(
    user_id: UUID,
    driving_license_id: UUID,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await check_user_data_access(user_id, current_user, db, request)
    result = await db.execute(select(DrivingLicense).where(DrivingLicense.id == driving_license_id))
    obj = result.scalar_one_or_none()
    if not obj:
        raise HTTPException(status_code=404, detail="Driving license not found")
    await check_verified_lock(obj, current_user, db=db)
    await delete_entity(obj, db, "driving_license", entity_id=obj.id, user_id=current_user.id)
