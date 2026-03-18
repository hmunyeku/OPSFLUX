"""Notification routes — list, mark read."""

from datetime import UTC, datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_entity, get_current_user
from app.core.database import get_db
from app.core.pagination import PaginationParams, paginate
from app.models.common import Notification, User
from app.schemas.common import NotificationRead, PaginatedResponse

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
        raise HTTPException(status_code=404, detail="Notification not found")

    notif.read = True
    notif.read_at = datetime.now(UTC)
    await db.commit()
    return {"detail": "Marked as read"}


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
            Notification.read == False,
        )
        .values(read=True, read_at=datetime.now(UTC))
    )
    await db.commit()
    return {"detail": "All marked as read"}
