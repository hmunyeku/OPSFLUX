"""Phone routes — polymorphic phone numbers linked to any object.

Query by owner_type + owner_id. Supports multiple phones per record
with labels (mobile, office, fax, home) and is_default flag.
"""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models.common import Phone, User
from app.schemas.common import PhoneCreate, PhoneRead, PhoneUpdate
from app.services.core.delete_service import delete_entity

router = APIRouter(prefix="/api/v1/phones", tags=["phones"])


@router.get("", response_model=list[PhoneRead])
async def list_phones(
    owner_type: str = Query(..., description="Object type: user, tier, tier_contact, asset, entity"),
    owner_id: UUID = Query(..., description="UUID of the owning object"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List phone numbers for a given owner."""
    result = await db.execute(
        select(Phone)
        .where(Phone.owner_type == owner_type, Phone.owner_id == owner_id)
        .order_by(Phone.is_default.desc(), Phone.label, Phone.created_at)
    )
    return result.scalars().all()


@router.post("", response_model=PhoneRead, status_code=201)
async def create_phone(
    body: PhoneCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Add a phone number to any object."""
    # If setting as default, unset other defaults
    if body.is_default:
        existing = await db.execute(
            select(Phone).where(
                Phone.owner_type == body.owner_type,
                Phone.owner_id == body.owner_id,
                Phone.is_default == True,  # noqa: E712
            )
        )
        for p in existing.scalars().all():
            p.is_default = False

    phone = Phone(
        owner_type=body.owner_type,
        owner_id=body.owner_id,
        label=body.label,
        number=body.number,
        country_code=body.country_code,
        is_default=body.is_default,
    )
    db.add(phone)
    await db.commit()
    await db.refresh(phone)
    return phone


@router.patch("/{phone_id}", response_model=PhoneRead)
async def update_phone(
    phone_id: UUID,
    body: PhoneUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update a phone number."""
    result = await db.execute(select(Phone).where(Phone.id == phone_id))
    phone = result.scalar_one_or_none()
    if not phone:
        raise HTTPException(status_code=404, detail="Phone not found")

    update_data = body.model_dump(exclude_unset=True)
    if not update_data:
        raise HTTPException(status_code=400, detail="No fields to update")

    # Handle default toggle
    if update_data.get("is_default"):
        existing = await db.execute(
            select(Phone).where(
                Phone.owner_type == phone.owner_type,
                Phone.owner_id == phone.owner_id,
                Phone.is_default == True,  # noqa: E712
                Phone.id != phone_id,
            )
        )
        for p in existing.scalars().all():
            p.is_default = False

    for field, value in update_data.items():
        setattr(phone, field, value)

    await db.commit()
    await db.refresh(phone)
    return phone


@router.delete("/{phone_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_phone(
    phone_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a phone number."""
    result = await db.execute(select(Phone).where(Phone.id == phone_id))
    phone = result.scalar_one_or_none()
    if not phone:
        raise HTTPException(status_code=404, detail="Phone not found")

    await delete_entity(phone, db, "phone", entity_id=phone_id, user_id=current_user.id)
    await db.commit()


@router.post("/{phone_id}/send-verification", status_code=200)
async def send_phone_verification(
    phone_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Generate a 6-digit OTP and send it via the configured SMS provider."""
    import secrets
    from datetime import datetime, timezone, timedelta

    result = await db.execute(select(Phone).where(Phone.id == phone_id))
    phone = result.scalar_one_or_none()
    if not phone:
        raise HTTPException(status_code=404, detail="Phone not found")

    if phone.verified:
        return {"message": "Phone already verified", "phone_id": str(phone_id)}

    # Generate 6-digit OTP
    code = f"{secrets.randbelow(1000000):06d}"
    phone.verification_code = code
    phone.verification_expires_at = datetime.now(timezone.utc) + timedelta(minutes=10)
    await db.commit()

    # Build full phone number
    full_number = f"{phone.country_code or ''}{phone.number}".strip()

    # Send via SMS service
    from app.core.sms_service import send_sms
    sent = await send_sms(
        db,
        to=full_number,
        body=f"OpsFlux — Votre code de vérification : {code}",
    )

    if not sent:
        return {
            "message": "SMS provider not configured — code generated for manual verification",
            "phone_id": str(phone_id),
            "debug_code": code,  # Only returned when no SMS provider is configured
        }

    return {"message": "Verification code sent", "phone_id": str(phone_id)}


@router.post("/{phone_id}/verify", status_code=200)
async def verify_phone(
    phone_id: UUID,
    body: dict,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Verify a phone number with the 6-digit OTP code."""
    from datetime import datetime, timezone

    code = body.get("code", "")
    if not code:
        raise HTTPException(status_code=400, detail="Code is required")

    result = await db.execute(select(Phone).where(Phone.id == phone_id))
    phone = result.scalar_one_or_none()
    if not phone:
        raise HTTPException(status_code=404, detail="Phone not found")

    if phone.verified:
        return {"message": "Phone already verified", "phone_id": str(phone_id)}

    # Validate code
    if not phone.verification_code or phone.verification_code != code:
        raise HTTPException(status_code=400, detail="Invalid verification code")

    # Check expiry (10 minutes)
    if phone.verification_expires_at and phone.verification_expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="Verification code expired")

    phone.verified = True
    phone.verified_at = datetime.now(timezone.utc)
    phone.verification_code = None
    phone.verification_expires_at = None
    await db.commit()
    await db.refresh(phone)
    return {"message": "Phone verified", "phone_id": str(phone_id)}
