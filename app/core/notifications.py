"""Notification service — in-app, email, SMS, and real-time WebSocket push."""

import logging
from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)


async def send_in_app(
    db: AsyncSession,
    *,
    user_id: UUID,
    entity_id: UUID,
    title: str,
    body: str | None = None,
    category: str = "info",
    link: str | None = None,
) -> None:
    """Create an in-app notification and push it to connected WebSockets.

    1. Insert row into the ``notifications`` table.
    2. Publish via Redis pub/sub so every worker with an open WebSocket
       for this user can forward the notification in real-time.
    """
    # Use RETURNING to get the generated id and created_at
    result = await db.execute(
        text(
            "INSERT INTO notifications "
            "(id, entity_id, user_id, title, body, category, link) "
            "VALUES (gen_random_uuid(), :entity_id, :user_id, :title, :body, :category, :link) "
            "RETURNING id, created_at"
        ),
        {
            "entity_id": str(entity_id),
            "user_id": str(user_id),
            "title": title,
            "body": body,
            "category": category,
            "link": link,
        },
    )
    row = result.fetchone()

    # Push real-time notification via Redis pub/sub
    notification_data = {
        "type": "notification",
        "data": {
            "id": str(row[0]) if row else None,
            "user_id": str(user_id),
            "entity_id": str(entity_id),
            "title": title,
            "body": body,
            "category": category,
            "link": link,
            "read": False,
            "created_at": row[1].isoformat() if row and row[1] else datetime.now(UTC).isoformat(),
        },
    }

    try:
        from app.core.notification_manager import notification_manager

        await notification_manager.send_to_user(user_id, notification_data)
    except Exception:
        # Real-time push is best-effort — the notification is already persisted
        logger.warning(
            "Failed to push real-time notification to user %s", user_id, exc_info=True
        )


async def send_in_app_bulk(
    db: AsyncSession,
    *,
    user_ids: list[UUID],
    entity_id: UUID,
    title: str,
    body: str | None = None,
    category: str = "info",
    link: str | None = None,
) -> None:
    """Send the same in-app notification to multiple users (e.g. entity broadcast).

    Each user gets their own DB row and a real-time push.
    """
    for uid in user_ids:
        await send_in_app(
            db,
            user_id=uid,
            entity_id=entity_id,
            title=title,
            body=body,
            category=category,
            link=link,
        )


async def send_email(
    *,
    to: str,
    subject: str,
    body_html: str,
    from_name: str | None = None,
) -> None:
    """Queue an email for sending via SMTP."""
    from app.core.config import settings

    try:
        import aiosmtplib
        from email.mime.text import MIMEText
        from email.mime.multipart import MIMEMultipart

        message = MIMEMultipart("alternative")
        message["From"] = f"{from_name or settings.SMTP_FROM_NAME} <{settings.SMTP_FROM_ADDRESS}>"
        message["To"] = to
        message["Subject"] = subject
        message.attach(MIMEText(body_html, "html"))

        await aiosmtplib.send(
            message,
            hostname=settings.SMTP_HOST,
            port=settings.SMTP_PORT,
            username=settings.SMTP_USERNAME or None,
            password=settings.SMTP_PASSWORD or None,
            use_tls=settings.SMTP_USE_TLS,
        )
    except Exception:
        logger.exception("Failed to send email to %s", to)
