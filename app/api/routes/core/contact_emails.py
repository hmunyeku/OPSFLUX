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
    """Generate a verification token and send verification email via template."""
    import secrets
    from datetime import datetime, timezone, timedelta

    result = await db.execute(select(ContactEmail).where(ContactEmail.id == email_id))
    contact_email = result.scalar_one_or_none()
    if not contact_email:
        raise HTTPException(status_code=404, detail="Contact email not found")

    if contact_email.verified:
        return {"message": "Email already verified", "email_id": str(email_id)}

    # Generate secure token (48-char URL-safe)
    token = secrets.token_urlsafe(36)
    contact_email.verification_token = token
    contact_email.verification_expires_at = datetime.now(timezone.utc) + timedelta(hours=24)
    await db.commit()

    # Build verification URL
    from app.core.config import settings
    verification_url = f"{settings.FRONTEND_URL}/verify-email?token={token}&id={email_id}"

    # Send via email template system
    from app.api.deps import get_current_entity
    from starlette.requests import Request
    entity_id = getattr(current_user, "current_entity_id", None)
    if entity_id:
        from app.core.email_templates import render_and_send_email
        sent = await render_and_send_email(
            db,
            slug="email_verification",
            entity_id=entity_id,
            language="fr",
            to=contact_email.email,
            variables={
                "verification_url": verification_url,
                "user": {
                    "first_name": current_user.first_name or "",
                    "last_name": current_user.last_name or "",
                    "email": current_user.email,
                },
                "entity": {"name": "OpsFlux"},
            },
        )
        if not sent:
            # Template not configured — send raw email as fallback
            from app.core.notifications import send_email
            await send_email(
                to=contact_email.email,
                subject="OpsFlux — Vérification de votre adresse email",
                body_html=(
                    f"<p>Bonjour,</p>"
                    f"<p>Veuillez cliquer sur le lien ci-dessous pour vérifier votre adresse email :</p>"
                    f'<p><a href="{verification_url}">{verification_url}</a></p>'
                    f"<p>Ce lien expire dans 24 heures.</p>"
                    f"<p>Merci,<br/>OpsFlux</p>"
                ),
            )

    return {"message": "Verification email sent", "email_id": str(email_id)}


@router.post("/{email_id}/verify", status_code=200)
async def verify_contact_email(
    email_id: UUID,
    body: dict,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Verify a contact email with the token from the verification link."""
    from datetime import datetime, timezone

    token = body.get("token", "")
    if not token:
        raise HTTPException(status_code=400, detail="Token is required")

    result = await db.execute(select(ContactEmail).where(ContactEmail.id == email_id))
    contact_email = result.scalar_one_or_none()
    if not contact_email:
        raise HTTPException(status_code=404, detail="Contact email not found")

    if contact_email.verified:
        return {"message": "Email already verified", "email_id": str(email_id)}

    # Validate token
    if not contact_email.verification_token or contact_email.verification_token != token:
        raise HTTPException(status_code=400, detail="Invalid verification token")

    # Check expiry
    if contact_email.verification_expires_at and contact_email.verification_expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="Verification token expired")

    contact_email.verified = True
    contact_email.verified_at = datetime.now(timezone.utc)
    contact_email.verification_token = None
    contact_email.verification_expires_at = None
    await db.commit()
    await db.refresh(contact_email)
    return {"message": "Contact email verified", "email_id": str(email_id)}


@router.get("/verify-callback", status_code=200)
async def verify_email_callback(
    token: str = Query(..., description="Verification token"),
    id: UUID = Query(..., description="Contact email ID"),
    db: AsyncSession = Depends(get_db),
):
    """Public callback for email verification links — no auth required."""
    from datetime import datetime, timezone

    result = await db.execute(select(ContactEmail).where(ContactEmail.id == id))
    contact_email = result.scalar_one_or_none()
    if not contact_email:
        raise HTTPException(status_code=404, detail="Contact email not found")

    if contact_email.verified:
        return {"message": "Email already verified", "verified": True}

    if not contact_email.verification_token or contact_email.verification_token != token:
        raise HTTPException(status_code=400, detail="Invalid verification token")

    if contact_email.verification_expires_at and contact_email.verification_expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="Verification token expired")

    contact_email.verified = True
    contact_email.verified_at = datetime.now(timezone.utc)
    contact_email.verification_token = None
    contact_email.verification_expires_at = None
    await db.commit()
    return {"message": "Email verified successfully", "verified": True}
