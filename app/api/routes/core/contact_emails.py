"""ContactEmail routes — polymorphic email addresses linked to any object.

Query by owner_type + owner_id. Supports multiple emails per record
with labels (work, personal, billing, support) and is_default flag.

Distinct from UserEmail (auth-specific). This handles contact emails
for tiers, tier contacts, assets, entities, etc.
"""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models.common import ContactEmail, User
from app.schemas.common import ContactEmailCreate, ContactEmailRead, ContactEmailUpdate
from app.services.core.delete_service import delete_entity

router = APIRouter(prefix="/api/v1/contact-emails", tags=["contact-emails"])


@router.get("", response_model=list[ContactEmailRead])
async def list_contact_emails(
    owner_type: str = Query(..., description="Object type: tier, tier_contact, asset, entity"),
    owner_id: UUID = Query(..., description="UUID of the owning object"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List contact email addresses for a given owner."""
    result = await db.execute(
        select(ContactEmail)
        .where(ContactEmail.owner_type == owner_type, ContactEmail.owner_id == owner_id)
        .order_by(ContactEmail.is_default.desc(), ContactEmail.label, ContactEmail.created_at)
    )
    return result.scalars().all()


@router.post("", response_model=ContactEmailRead, status_code=201)
async def create_contact_email(
    body: ContactEmailCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Add a contact email to any object."""
    if body.is_default:
        existing = await db.execute(
            select(ContactEmail).where(
                ContactEmail.owner_type == body.owner_type,
                ContactEmail.owner_id == body.owner_id,
                ContactEmail.is_default == True,  # noqa: E712
            )
        )
        for e in existing.scalars().all():
            e.is_default = False

    contact_email = ContactEmail(
        owner_type=body.owner_type,
        owner_id=body.owner_id,
        label=body.label,
        email=body.email,
        is_default=body.is_default,
    )
    db.add(contact_email)
    await db.commit()
    await db.refresh(contact_email)
    return contact_email


@router.patch("/{email_id}", response_model=ContactEmailRead)
async def update_contact_email(
    email_id: UUID,
    body: ContactEmailUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update a contact email."""
    result = await db.execute(select(ContactEmail).where(ContactEmail.id == email_id))
    contact_email = result.scalar_one_or_none()
    if not contact_email:
        raise HTTPException(status_code=404, detail="Contact email not found")

    update_data = body.model_dump(exclude_unset=True)
    if not update_data:
        raise HTTPException(status_code=400, detail="No fields to update")

    if update_data.get("is_default"):
        existing = await db.execute(
            select(ContactEmail).where(
                ContactEmail.owner_type == contact_email.owner_type,
                ContactEmail.owner_id == contact_email.owner_id,
                ContactEmail.is_default == True,  # noqa: E712
                ContactEmail.id != email_id,
            )
        )
        for e in existing.scalars().all():
            e.is_default = False

    for field, value in update_data.items():
        setattr(contact_email, field, value)

    await db.commit()
    await db.refresh(contact_email)
    return contact_email


@router.delete("/{email_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_contact_email(
    email_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a contact email."""
    result = await db.execute(select(ContactEmail).where(ContactEmail.id == email_id))
    contact_email = result.scalar_one_or_none()
    if not contact_email:
        raise HTTPException(status_code=404, detail="Contact email not found")

    await delete_entity(contact_email, db, "contact_email", entity_id=email_id, user_id=current_user.id)
    await db.commit()


@router.post("/{email_id}/send-verification", status_code=200)
async def send_email_verification(
    email_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Send verification link for a contact email (stub)."""
    result = await db.execute(select(ContactEmail).where(ContactEmail.id == email_id))
    contact_email = result.scalar_one_or_none()
    if not contact_email:
        raise HTTPException(status_code=404, detail="Contact email not found")
    # Stub: in production, send verification email
    return {"message": "Verification email sent (stub)", "email_id": str(email_id)}


@router.post("/{email_id}/verify", status_code=200)
async def verify_contact_email(
    email_id: UUID,
    body: dict,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Verify a contact email with token (stub)."""
    result = await db.execute(select(ContactEmail).where(ContactEmail.id == email_id))
    contact_email = result.scalar_one_or_none()
    if not contact_email:
        raise HTTPException(status_code=404, detail="Contact email not found")
    # Stub: accept any token for now
    from datetime import datetime, timezone
    contact_email.verified = True
    contact_email.verified_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(contact_email)
    return {"message": "Contact email verified", "email_id": str(email_id)}
