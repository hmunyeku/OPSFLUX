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


async def _get_smtp_config() -> dict[str, str]:
    """Load SMTP config: DB integration settings take priority, .env as fallback."""
    from app.core.config import settings
    from app.core.database import async_session_factory

    # Defaults from .env
    cfg = {
        "host": settings.SMTP_HOST,
        "port": str(settings.SMTP_PORT),
        "encryption": "ssl" if settings.SMTP_USE_TLS else "none",
        "username": settings.SMTP_USERNAME,
        "password": settings.SMTP_PASSWORD,
        "from_name": settings.SMTP_FROM_NAME,
        "from_email": settings.SMTP_FROM_ADDRESS,
    }

    # Override with DB settings if present
    try:
        async with async_session_factory() as db:
            result = await db.execute(
                text("SELECT key, value FROM settings WHERE key LIKE 'integration.smtp.%'")
            )
            for row in result.all():
                field = row[0].replace("integration.smtp.", "")
                val = row[1].get("v", "") if isinstance(row[1], dict) else str(row[1])
                if val and field in cfg:
                    cfg[field] = str(val)
    except Exception:
        logger.debug("Could not load SMTP settings from DB, using .env defaults")

    return cfg


async def send_email(
    *,
    to: str,
    subject: str,
    body_html: str,
    from_name: str | None = None,
) -> None:
    """Send an email via SMTP. Uses DB integration settings if configured, .env as fallback."""
    try:
        import aiosmtplib
        from email.mime.text import MIMEText
        from email.mime.multipart import MIMEMultipart

        cfg = await _get_smtp_config()

        host = cfg["host"]
        port = int(cfg["port"] or "587")
        encryption = cfg.get("encryption", "none")
        username = cfg.get("username", "")
        password = cfg.get("password", "")

        if not host:
            logger.warning("SMTP not configured — skipping email to %s", to)
            return

        message = MIMEMultipart("alternative")
        message["From"] = f"{from_name or cfg.get('from_name', 'OpsFlux')} <{cfg.get('from_email', '')}>"
        message["To"] = to
        message["Subject"] = subject
        message.attach(MIMEText(body_html, "html"))

        use_tls = encryption == "ssl"
        start_tls = encryption == "tls"

        smtp = aiosmtplib.SMTP(hostname=host, port=port, timeout=30)
        await smtp.connect(use_tls=use_tls)
        if start_tls:
            await smtp.starttls()
        if username and password:
            await smtp.login(username, password)
        await smtp.send_message(message)
        await smtp.quit()
    except Exception:
        logger.exception("Failed to send email to %s", to)
