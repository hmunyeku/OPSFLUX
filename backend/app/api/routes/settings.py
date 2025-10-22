from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr
from sqlmodel import select

from app.api.deps import SessionDep, get_current_active_superuser
from app.core.email_service import email_service
from app.core.cache_service import cache_service
from app.models import AppSettings, AppSettingsPublic, AppSettingsUpdate, Message

router = APIRouter(prefix="/settings", tags=["settings"])


class EmailTestRequest(BaseModel):
    """Request model for email test"""
    email_to: EmailStr


class EmailTestResponse(BaseModel):
    """Response model for email test"""
    success: bool
    message: str


@router.get("/", response_model=AppSettingsPublic)
@cache_service.cached(namespace="settings")
async def read_settings(session: SessionDep) -> Any:
    """
    Get application settings.
    This endpoint is public as it's needed for the login page and other public pages.
    Uses default TTL from settings (redis_default_ttl).
    """
    statement = select(AppSettings).where(AppSettings.deleted_at == None).limit(1)  # noqa: E711
    settings = session.exec(statement).first()

    if not settings:
        raise HTTPException(
            status_code=404,
            detail="Application settings not found. Please contact administrator.",
        )

    return settings


@router.put(
    "/",
    dependencies=[Depends(get_current_active_superuser)],
    response_model=AppSettingsPublic,
)
async def update_settings(
    *, session: SessionDep, settings_in: AppSettingsUpdate
) -> Any:
    """
    Update application settings.
    Only superusers can update settings.
    Invalidates settings cache.
    """
    statement = select(AppSettings).where(AppSettings.deleted_at == None).limit(1)  # noqa: E711
    db_settings = session.exec(statement).first()

    if not db_settings:
        raise HTTPException(
            status_code=404,
            detail="Application settings not found. Please contact administrator.",
        )

    # Update settings with provided values
    settings_data = settings_in.model_dump(exclude_unset=True)
    db_settings.sqlmodel_update(settings_data)

    session.add(db_settings)
    session.commit()
    session.refresh(db_settings)

    # Invalidate cache
    await cache_service.clear_namespace("settings")

    return db_settings


@router.post(
    "/test-email",
    dependencies=[Depends(get_current_active_superuser)],
    response_model=EmailTestResponse,
)
def test_email_configuration(
    *, session: SessionDep, request: EmailTestRequest
) -> Any:
    """
    Test email configuration by sending a test email.
    Only superusers can test email configuration.
    """
    success = email_service.send_test_email(
        email_to=request.email_to,
        db=session,
    )

    if success:
        return EmailTestResponse(
            success=True,
            message=f"Email de test envoyé avec succès à {request.email_to}"
        )
    else:
        return EmailTestResponse(
            success=False,
            message="Échec de l'envoi de l'email. Vérifiez la configuration SMTP."
        )


@router.post(
    "/verify-email-connection",
    dependencies=[Depends(get_current_active_superuser)],
    response_model=EmailTestResponse,
)
def verify_email_connection(*, session: SessionDep) -> Any:
    """
    Verify SMTP server connection without sending an email.
    Only superusers can verify email connection.
    """
    success, message = email_service.verify_connection(db=session)

    return EmailTestResponse(
        success=success,
        message=message
    )
