"""Notification routes — list, mark read, unread count, delete."""

import json
import logging
from datetime import UTC, datetime
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_entity, get_current_user
from app.core.database import get_db
from app.core.pagination import PaginationParams, paginate
from app.core.redis_client import get_redis
from app.models.common import Notification, User
from app.schemas.common import NotificationRead, PaginatedResponse
from app.services.core.delete_service import delete_entity
from app.core.errors import StructuredHTTPException

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/notifications", tags=["notifications"])


@router.get("", response_model=PaginatedResponse[NotificationRead])
async def list_notifications(
    unread_only: bool = False,
    pagination: PaginationParams = Depends(),
    current_user: User = Depends(get_current_user),
    entity_id: UUID = Depends(get_current_entity),
    db: AsyncSession = Depends(get_db),
):
    """List notifications for the current user."""
    query = (
        select(Notification)
        .where(
            Notification.user_id == current_user.id,
            Notification.entity_id == entity_id,
        )
        .order_by(Notification.created_at.desc())
    )
    if unread_only:
        query = query.where(Notification.read == False)
    return await paginate(db, query, pagination)


# ── Push token registration ────────────────────────────────────────────
#
# The mobile app (expo-notifications) registers its push token on login.
# We persist it in Redis keyed by (user_id, platform) so that a future
# Expo Push worker can look up all tokens for a user when it wants to
# deliver an out-of-app notification. Storing in Redis (rather than
# postgres) keeps this hot, avoids a migration, and matches the
# ephemeral nature of a push token (rotated by the OS).
#
# TTL: 90 days — expo tokens typically rotate faster than that; the
# mobile re-registers on every cold start so the TTL is refreshed.


class PushTokenRegistration(BaseModel):
    token: str = Field(..., min_length=10, max_length=500)
    platform: Literal["ios", "android", "web"] = "ios"
    device_name: str | None = Field(None, max_length=200)


@router.post("/push-token", status_code=204)
async def register_push_token(
    body: PushTokenRegistration,
    current_user: User = Depends(get_current_user),
) -> None:
    """Store an Expo push token for the current user.

    Stored in Redis under ``push_tokens:{user_id}`` as a JSON hash of
    token → {platform, device_name, registered_at}. One user can have
    many tokens (phone + tablet + ex-phone not yet rotated).

    This endpoint is intentionally idempotent: re-registering the same
    token is a no-op (just refreshes the TTL).
    """
    try:
        redis = get_redis()
    except RuntimeError:
        # Redis not initialized — silently accept; push won't work but
        # the mobile registration flow completes successfully.
        return None

    key = f"push_tokens:{current_user.id}"
    payload = json.dumps({
        "platform": body.platform,
        "device_name": body.device_name,
        "registered_at": datetime.now(UTC).isoformat(),
    })
    try:
        await redis.hset(key, body.token, payload)
        await redis.expire(key, 60 * 60 * 24 * 90)  # 90 days
    except Exception:
        logger.warning("push-token store failed user=%s", current_user.id, exc_info=True)
    return None


@router.patch("/{notification_id}/read")
async def mark_read(
    notification_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Mark a notification as read."""
    result = await db.execute(
        select(Notification).where(
            Notification.id == notification_id,
            Notification.user_id == current_user.id,
        )
    )
    notif = result.scalar_one_or_none()
    if not notif:
        raise StructuredHTTPException(
            404,
            code="NOTIFICATION_NOT_FOUND",
            message="Notification not found",
        )

    notif.read = True
    notif.read_at = datetime.now(UTC)
    await db.commit()
    return {"detail": "Marked as read"}


@router.get("/unread-count")
async def unread_count(
    current_user: User = Depends(get_current_user),
    entity_id: UUID = Depends(get_current_entity),
    db: AsyncSession = Depends(get_db),
):
    """Get unread notification count for the current user (lightweight endpoint for bell badge)."""
    result = await db.execute(
        select(func.count()).select_from(Notification).where(
            Notification.user_id == current_user.id,
            Notification.entity_id == entity_id,
            Notification.read == False,  # noqa: E712
        )
    )
    count = result.scalar() or 0
    return {"unread_count": count}


@router.post("/mark-all-read")
async def mark_all_read(
    current_user: User = Depends(get_current_user),
    entity_id: UUID = Depends(get_current_entity),
    db: AsyncSession = Depends(get_db),
):
    """Mark all notifications as read."""
    await db.execute(
        update(Notification)
        .where(
            Notification.user_id == current_user.id,
            Notification.entity_id == entity_id,
            Notification.read == False,  # noqa: E712
        )
        .values(read=True, read_at=datetime.now(UTC))
    )
    await db.commit()
    return {"detail": "All marked as read"}


@router.delete("/{notification_id}")
async def delete_notification(
    notification_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a notification (soft: mark as archived)."""
    result = await db.execute(
        select(Notification).where(
            Notification.id == notification_id,
            Notification.user_id == current_user.id,
        )
    )
    notif = result.scalar_one_or_none()
    if not notif:
        raise StructuredHTTPException(
            404,
            code="NOTIFICATION_NOT_FOUND",
            message="Notification not found",
        )

    await delete_entity(notif, db, "notification", entity_id=notification_id, user_id=current_user.id)
    await db.commit()
    return {"detail": "Notification deleted"}
