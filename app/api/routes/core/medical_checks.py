"""Medical check routes — polymorphic CRUD for medical check records."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from starlette.requests import Request

from app.api.deps import get_current_user, check_verified_lock, check_polymorphic_owner_access
from app.core.database import get_db
from app.services.core.delete_service import delete_entity
from app.models.common import MedicalCheck, User
from app.schemas.common import MedicalCheckCreate, MedicalCheckRead, MedicalCheckUpdate
from app.core.errors import StructuredHTTPException

router = APIRouter(prefix="/api/v1/medical-checks", tags=["medical-checks"])


@router.get("/{owner_type}/{owner_id}", response_model=list[MedicalCheckRead])
async def list_medical_checks(
    owner_type: str,
    owner_id: UUID,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await check_polymorphic_owner_access(owner_type, owner_id, current_user, db, request)
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
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await check_polymorphic_owner_access(owner_type, owner_id, current_user, db, request, write=True)
    obj = MedicalCheck(**body.model_dump(), owner_type=owner_type, owner_id=owner_id)
    db.add(obj)
    await db.commit()
    await db.refresh(obj)
    return obj


@router.patch("/{check_id}", response_model=MedicalCheckRead)
async def update_medical_check(
    check_id: UUID,
    body: MedicalCheckUpdate,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(MedicalCheck).where(MedicalCheck.id == check_id))
    obj = result.scalar_one_or_none()
    if not obj:
        raise StructuredHTTPException(
            404,
            code="MEDICAL_CHECK_NOT_FOUND",
            message="Medical check not found",
        )
    # SUP-secu : verifier l'acces a l'owner avant toute mutation (IDOR-fix).
    await check_polymorphic_owner_access(obj.owner_type, obj.owner_id, current_user, db, request, write=True)
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


@router.delete("/{check_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_medical_check(
    check_id: UUID,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(MedicalCheck).where(MedicalCheck.id == check_id))
    obj = result.scalar_one_or_none()
    if not obj:
        raise StructuredHTTPException(
            404,
            code="MEDICAL_CHECK_NOT_FOUND",
            message="Medical check not found",
        )
    # SUP-secu : verifier l'acces a l'owner avant la suppression (IDOR-fix).
    await check_polymorphic_owner_access(obj.owner_type, obj.owner_id, current_user, db, request, write=True)
    await check_verified_lock(obj, current_user, db=db)
    await delete_entity(obj, db, "medical_check", entity_id=obj.id, user_id=current_user.id)
    await db.commit()
