"""Notification preference routes — get and upsert preferences."""

from uuid import UUID

from fastapi import APIRouter, Depends, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models.common import NotificationPreference, User
from app.schemas.common import NotificationPreferenceRead, NotificationPreferenceUpdate

router = APIRouter(prefix="/api/v1/preferences", tags=["preferences"])

# Default values when no preference record exists
_DEFAULTS = {
    "global_level": "participate",
    "notification_email_id": None,
    "notify_own_actions": False,
    "group_overrides": None,
}


@router.get("/notifications", response_model=NotificationPreferenceRead)
async def get_notification_preferences(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get notification preferences for the current user. Returns defaults if none exist."""
    result = await db.execute(
        select(NotificationPreference).where(
            NotificationPreference.user_id == current_user.id
        )
    )
    pref = result.scalar_one_or_none()

    if pref:
        return pref

    # Return defaults if no record exists
    return NotificationPreferenceRead(**_DEFAULTS)


@router.patch("/notifications", response_model=NotificationPreferenceRead)
async def update_notification_preferences(
    body: NotificationPreferenceUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Upsert notification preferences for the current user."""
    result = await db.execute(
        select(NotificationPreference).where(
            NotificationPreference.user_id == current_user.id
        )
    )
    pref = result.scalar_one_or_none()

    update_data = body.model_dump(exclude_unset=True)

    if pref:
        # Update existing
        for field, value in update_data.items():
            setattr(pref, field, value)
    else:
        # Create new with defaults + provided values
        create_data = {**_DEFAULTS, **update_data}
        pref = NotificationPreference(
            user_id=current_user.id,
            **create_data,
        )
        db.add(pref)

    await db.commit()
    await db.refresh(pref)
    return pref
