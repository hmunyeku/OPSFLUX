from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import select

from app.api.deps import SessionDep, get_current_active_superuser
from app.models import AppSettings, AppSettingsPublic, AppSettingsUpdate

router = APIRouter(prefix="/settings", tags=["settings"])


@router.get("/", response_model=AppSettingsPublic)
def read_settings(session: SessionDep) -> Any:
    """
    Get application settings.
    This endpoint is public as it's needed for the login page and other public pages.
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
def update_settings(
    *, session: SessionDep, settings_in: AppSettingsUpdate
) -> Any:
    """
    Update application settings.
    Only superusers can update settings.
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

    return db_settings
