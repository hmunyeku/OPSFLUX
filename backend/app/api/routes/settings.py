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
    import logging
    import traceback

    logger = logging.getLogger(__name__)

    try:
        statement = select(AppSettings).where(AppSettings.deleted_at == None).limit(1)  # noqa: E711
        db_settings = session.exec(statement).first()

        if not db_settings:
            raise HTTPException(
                status_code=404,
                detail="Application settings not found. Please contact administrator.",
            )

        # Update settings with provided values
        # Exclude unset values, but keep None for optional fields (nullable columns)
        settings_data = settings_in.model_dump(exclude_unset=True)

        # Only remove None for fields that have NOT NULL constraints with defaults
        # These fields should use their defaults if not provided, not NULL
        not_null_fields_with_defaults = {
            'redis_db', 'redis_port', 'redis_host', 'redis_default_ttl', 'redis_max_ttl',
            'email_port', 'email_use_tls', 'email_use_ssl', 'auto_save_delay_seconds',
            'twofa_max_attempts', 'twofa_sms_timeout_minutes', 'twofa_sms_rate_limit',
        }

        # Filter out None values only for NOT NULL fields
        settings_data = {
            k: v for k, v in settings_data.items()
            if not (v is None and k in not_null_fields_with_defaults)
        }

        logger.info(f"Updating settings with data keys: {list(settings_data.keys())}")

        db_settings.sqlmodel_update(settings_data)

        session.add(db_settings)
        session.commit()
        session.refresh(db_settings)

        # Invalidate cache
        try:
            await cache_service.clear_namespace("settings")
        except Exception as e:
            # Log the error but don't fail the request
            logger.error(f"Failed to clear cache: {e}")

        return db_settings

    except HTTPException:
        # Re-raise HTTP exceptions as-is
        raise
    except Exception as e:
        # Log any unexpected errors with full traceback
        logger.error(f"❌ ERROR in update_settings: {str(e)}")
        logger.error(f"Traceback: {traceback.format_exc()}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to update settings: {str(e)}"
        )


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
