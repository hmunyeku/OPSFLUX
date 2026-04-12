"""User emergency contact routes — CRUD for user emergency contacts."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.requests import Request

from app.api.deps import check_user_data_access, get_current_user
from app.core.database import get_db
from app.models.common import EmergencyContact, User
from app.schemas.common import EmergencyContactCreate, EmergencyContactRead, EmergencyContactUpdate
from app.services.core.delete_service import delete_entity

router = APIRouter(prefix="/api/v1/users/{user_id}/emergency-contacts", tags=["user-emergency-contacts"])


@router.get("", response_model=list[EmergencyContactRead])
async def list_emergency_contacts(
    user_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(EmergencyContact).where(EmergencyContact.user_id == user_id).order_by(EmergencyContact.created_at)
    )
    return result.scalars().all()


@router.post("", response_model=EmergencyContactRead, status_code=201)
async def create_emergency_contact(
    user_id: UUID,
    body: EmergencyContactCreate,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await check_user_data_access(user_id, current_user, db, request)
    obj = EmergencyContact(**body.model_dump(exclude={"user_id"}), user_id=user_id)
    db.add(obj)
    await db.commit()
    await db.refresh(obj)
    return obj


@router.patch("/{emergency_contact_id}", response_model=EmergencyContactRead)
async def update_emergency_contact(
    user_id: UUID,
    emergency_contact_id: UUID,
    body: EmergencyContactUpdate,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await check_user_data_access(user_id, current_user, db, request)
    result = await db.execute(select(EmergencyContact).where(EmergencyContact.id == emergency_contact_id))
    obj = result.scalar_one_or_none()
    if not obj:
        raise HTTPException(status_code=404, detail="Emergency contact not found")
    update_data = body.model_dump(exclude_unset=True)
    if not update_data:
        raise HTTPException(status_code=400, detail="No fields to update")
    for field, value in update_data.items():
        setattr(obj, field, value)
    await db.commit()
    await db.refresh(obj)
    return obj


@router.delete("/{emergency_contact_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_emergency_contact(
    user_id: UUID,
    emergency_contact_id: UUID,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await check_user_data_access(user_id, current_user, db, request)
    result = await db.execute(select(EmergencyContact).where(EmergencyContact.id == emergency_contact_id))
    obj = result.scalar_one_or_none()
    if not obj:
        raise HTTPException(status_code=404, detail="Emergency contact not found")
    await delete_entity(obj, db, "emergency_contact", entity_id=obj.id, user_id=current_user.id)
    await db.commit()
