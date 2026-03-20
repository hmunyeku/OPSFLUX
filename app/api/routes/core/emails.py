"""User email routes — list, add, remove, set primary, resend verification.

Email content is driven by the email template system (email_templates slug: 'email_verification').
If no template is configured, falls back to a minimal built-in message.
"""

import logging
import secrets
from datetime import UTC, datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_entity, get_current_user
from app.core.audit import record_audit
from app.core.config import settings
from app.core.database import get_db
from app.core.email_templates import render_and_send_email
from app.core.notifications import send_email
from app.models.common import User, UserEmail
from app.schemas.common import UserEmailCreate, UserEmailRead
from app.services.core.delete_service import delete_entity

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/emails", tags=["emails"])


async def _send_verification_email(
    db: AsyncSession,
    *,
    email_address: str,
    token: str,
    entity_id: UUID,
    user: User,
) -> None:
    """Send a verification email using the template system.

    Falls back to a minimal built-in message if no template is configured.
    """
    verification_url = f"{settings.FRONTEND_URL}/verify-email?token={token}"

    # Try template-based email first
    sent = await render_and_send_email(
        db,
        slug="email_verification",
        entity_id=entity_id,
        language=user.language or "fr",
        to=email_address,
        variables={
            "verification_url": verification_url,
            "user": {
                "first_name": user.first_name,
                "last_name": user.last_name,
                "email": user.email,
            },
            "entity": {"name": "OpsFlux"},
        },
    )

    if not sent:
        # Fallback: minimal built-in email (should never happen once templates are seeded)
        logger.warning("No email template for 'email_verification' — using built-in fallback")
        await send_email(
            to=email_address,
            subject="OpsFlux — Vérification de votre adresse email",
            body_html=(
                f"<p>Bonjour,</p>"
                f"<p>Veuillez cliquer sur le lien ci-dessous pour vérifier votre adresse email :</p>"
                f'<p><a href="{verification_url}">{verification_url}</a></p>'
                f"<p>Merci,<br/>OpsFlux</p>"
            ),
        )


@router.get("", response_model=list[UserEmailRead])
async def list_emails(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List email addresses for the current user."""
    result = await db.execute(
        select(UserEmail)
        .where(UserEmail.user_id == current_user.id)
        .order_by(UserEmail.is_primary.desc(), UserEmail.created_at)
    )
    return result.scalars().all()


@router.post("", response_model=UserEmailRead, status_code=201)
async def add_email(
    body: UserEmailCreate,
    request: Request,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Add a new email address. A verification email will be sent."""
    # Check if email already exists for this user
    existing = await db.execute(
        select(UserEmail).where(
            UserEmail.user_id == current_user.id,
            UserEmail.email == body.email,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email address already exists for this user",
        )

    verification_token = secrets.token_urlsafe(64)

    user_email = UserEmail(
        user_id=current_user.id,
        email=body.email,
        is_primary=False,
        is_notification=False,
        verified=False,
        verification_token=verification_token,
        verification_sent_at=datetime.now(UTC),
    )
    db.add(user_email)
    await db.commit()
    await db.refresh(user_email)

    # Send verification email via template system
    await _send_verification_email(
        db,
        email_address=body.email,
        token=verification_token,
        entity_id=entity_id,
        user=current_user,
    )

    await record_audit(
        db,
        action="add_email",
        resource_type="user_email",
        resource_id=str(user_email.id),
        user_id=current_user.id,
        entity_id=entity_id,
        details={"email": body.email},
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )
    await db.commit()

    return user_email


@router.delete("/{email_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_email(
    email_id: UUID,
    request: Request,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Remove an email address. Cannot delete the primary email."""
    result = await db.execute(
        select(UserEmail).where(
            UserEmail.id == email_id,
            UserEmail.user_id == current_user.id,
        )
    )
    user_email = result.scalar_one_or_none()
    if not user_email:
        raise HTTPException(status_code=404, detail="Email not found")

    if user_email.is_primary:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete primary email address",
        )

    await delete_entity(user_email, db, "user_email", entity_id=email_id, user_id=current_user.id)
    await db.commit()

    await record_audit(
        db,
        action="remove_email",
        resource_type="user_email",
        resource_id=str(email_id),
        user_id=current_user.id,
        entity_id=entity_id,
        details={"email": user_email.email},
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )
    await db.commit()


@router.post("/{email_id}/primary", response_model=UserEmailRead)
async def set_primary_email(
    email_id: UUID,
    request: Request,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Set an email as the primary email. Must be verified."""
    result = await db.execute(
        select(UserEmail).where(
            UserEmail.id == email_id,
            UserEmail.user_id == current_user.id,
        )
    )
    user_email = result.scalar_one_or_none()
    if not user_email:
        raise HTTPException(status_code=404, detail="Email not found")

    if not user_email.verified:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email must be verified before setting as primary",
        )

    # Unset all other primary emails for this user
    await db.execute(
        update(UserEmail)
        .where(UserEmail.user_id == current_user.id)
        .values(is_primary=False)
    )

    user_email.is_primary = True
    await db.commit()
    await db.refresh(user_email)

    await record_audit(
        db,
        action="set_primary_email",
        resource_type="user_email",
        resource_id=str(email_id),
        user_id=current_user.id,
        entity_id=entity_id,
        details={"email": user_email.email},
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )
    await db.commit()

    return user_email


@router.post("/{email_id}/verify")
async def resend_verification(
    email_id: UUID,
    request: Request,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Resend the verification email."""
    result = await db.execute(
        select(UserEmail).where(
            UserEmail.id == email_id,
            UserEmail.user_id == current_user.id,
        )
    )
    user_email = result.scalar_one_or_none()
    if not user_email:
        raise HTTPException(status_code=404, detail="Email not found")

    if user_email.verified:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email is already verified",
        )

    # Generate new verification token
    verification_token = secrets.token_urlsafe(64)
    user_email.verification_token = verification_token
    user_email.verification_sent_at = datetime.now(UTC)
    await db.commit()

    await _send_verification_email(
        db,
        email_address=user_email.email,
        token=verification_token,
        entity_id=entity_id,
        user=current_user,
    )

    return {"message": "Verification email sent"}
