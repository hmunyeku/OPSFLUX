"""Medical check routes — polymorphic CRUD for medical check records."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, check_verified_lock
from app.core.database import get_db
from app.services.core.delete_service import delete_entity
from app.models.common import MedicalCheck, User
from app.schemas.common import MedicalCheckCreate, MedicalCheckRead, MedicalCheckUpdate

router = APIRouter(prefix="/api/v1/medical-checks", tags=["medical-checks"])


@router.get("/{owner_type}/{owner_id}", response_model=list[MedicalCheckRead])
async def list_medical_checks(
    owner_type: str,
    owner_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(MedicalCheck)
        .where(MedicalCheck.owner_type == owner_type, MedicalCheck.owner_id == owner_id)
        .order_by(MedicalCheck.check_date.desc())
    )
    return result.scalars().all()


@router.post("/{owner_type}/{owner_id}", response_model=MedicalCheckRead, status_code=201)
async def create_medical_check(
    owner_type: str,
    owner_id: UUID,
    body: MedicalCheckCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    obj = MedicalCheck(**body.model_dump(), owner_type=owner_type, owner_id=owner_id)
    db.add(obj)
    await db.commit()
    await db.refresh(obj)
    return obj


@router.patch("/{check_id}", response_model=MedicalCheckRead)
async def update_medical_check(
    check_id: UUID,
    body: MedicalCheckUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(MedicalCheck).where(MedicalCheck.id == check_id))
    obj = result.scalar_one_or_none()
    if not obj:
        raise HTTPException(status_code=404, detail="Medical check not found")
    await check_verified_lock(obj, current_user, db=db)
    update_data = body.model_dump(exclude_unset=True)
    if not update_data:
        raise HTTPException(status_code=400, detail="No fields to update")
    for field, value in update_data.items():
        setattr(obj, field, value)
    await db.commit()
    await db.refresh(obj)
    return obj


@router.delete("/{check_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_medical_check(
    check_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(MedicalCheck).where(MedicalCheck.id == check_id))
    obj = result.scalar_one_or_none()
    if not obj:
        raise HTTPException(status_code=404, detail="Medical check not found")
    await check_verified_lock(obj, current_user, db=db)
    await delete_entity(obj, db, "medical_check", entity_id=obj.id, user_id=current_user.id)
    await db.commit()
