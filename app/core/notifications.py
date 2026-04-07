"""Notification service — in-app, email, SMS, and real-time WebSocket push."""

import logging
from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import select
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

_USER_PREFS_KEY = "user.preferences"


def _normalize_notification_module(category: str | None) -> str | None:
    raw = (category or "").strip().lower()
    if not raw:
        return None
    aliases = {
        "paxlog": "paxlog",
        "ads": "paxlog",
        "travelwiz": "travelwiz",
        "planner": "planner",
        "project": "projects",
        "projets": "projects",
        "projects": "projects",
        "workflow": "workflow",
        "document": "workflow",
        "conformite": "conformite",
        "support": "support",
        "messaging": "messaging",
        "core": "core",
        "info": "core",
    }
    return aliases.get(raw, raw)


async def _is_notification_channel_enabled(
    db: AsyncSession,
    *,
    user_id: UUID,
    category: str | None,
    channel: str,
) -> bool:
    from app.models.common import Setting

    module_key = _normalize_notification_module(category)
    if not module_key:
        return True

    result = await db.execute(
        select(Setting).where(
            Setting.key == _USER_PREFS_KEY,
            Setting.scope == "user",
            Setting.scope_id == str(user_id),
        )
    )
    setting = result.scalar_one_or_none()
    if setting is None or not isinstance(setting.value, dict):
        return True

    matrix = setting.value.get("notifications_matrix")
    if not isinstance(matrix, dict):
        return True

    module_settings = matrix.get(module_key)
    if not isinstance(module_settings, dict):
        return True

    return module_settings.get(channel, True) is not False


async def _is_in_app_notification_enabled(
    db: AsyncSession,
    *,
    user_id: UUID,
    category: str | None,
) -> bool:
    return await _is_notification_channel_enabled(
        db,
        user_id=user_id,
        category=category,
        channel="in_app",
    )


async def _is_email_notification_enabled(
    db: AsyncSession,
    *,
    user_id: UUID,
    category: str | None,
) -> bool:
    return await _is_notification_channel_enabled(
        db,
        user_id=user_id,
        category=category,
        channel="email",
    )


async def _is_digest_notification_enabled(
    db: AsyncSession,
    *,
    user_id: UUID,
    category: str | None,
) -> bool:
    return await _is_notification_channel_enabled(
        db,
        user_id=user_id,
        category=category,
        channel="digest",
    )


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
    if not await _is_in_app_notification_enabled(
        db,
        user_id=user_id,
        category=category,
    ):
        return

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


# Docker-internal SMTP aliases to try when the configured host is unreachable
_SMTP_DOCKER_FALLBACKS = ["mailu-smtp", "mailu-front", "front", "smtp", "mail"]


async def _smtp_send_via(
    host: str, port: int, encryption: str, username: str, password: str,
    message,
) -> None:
    """Connect to a single SMTP host and send the message."""
    import ssl as _ssl
    import aiosmtplib

    if port == 465 and encryption != "none":
        use_tls, start_tls = True, False
    elif port == 587 or encryption == "tls":
        use_tls, start_tls = False, True
    elif encryption == "ssl":
        use_tls, start_tls = True, False
    else:
        use_tls, start_tls = False, False

    tls_context = _ssl.create_default_context()
    tls_context.check_hostname = False
    tls_context.verify_mode = _ssl.CERT_NONE

    logger.info("SMTP connecting to %s:%s (tls=%s, starttls=%s)", host, port, use_tls, start_tls)
    smtp = aiosmtplib.SMTP(
        hostname=host, port=port, timeout=30,
        use_tls=use_tls, tls_context=tls_context if use_tls else None,
    )
    await smtp.connect()
    if start_tls:
        await smtp.starttls(tls_context=tls_context)
    if username and password:
        await smtp.login(username, password)
    await smtp.send_message(message)
    await smtp.quit()


async def send_email(
    *,
    to: str,
    subject: str,
    body_html: str,
    from_name: str | None = None,
    db: AsyncSession | None = None,
    user_id: UUID | None = None,
    category: str | None = None,
    channel: str = "email",
) -> None:
    """Send an email via SMTP. Uses DB integration settings if configured, .env as fallback.

    Automatically falls back to Docker-internal SMTP aliases (mailu-smtp, etc.)
    when the configured host is unreachable (hairpin NAT workaround).
    """
    try:
        if db is not None and user_id is not None:
            channel_allowed = True
            if channel == "digest":
                channel_allowed = await _is_digest_notification_enabled(
                    db,
                    user_id=user_id,
                    category=category,
                )
            else:
                channel_allowed = await _is_email_notification_enabled(
                    db,
                    user_id=user_id,
                    category=category,
                )

            if not channel_allowed:
                logger.info(
                    "Email notification skipped by user preference (user=%s, category=%s, channel=%s)",
                    user_id,
                    category,
                    channel,
                )
                return

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

        # Try the configured host first
        try:
            await _smtp_send_via(host, port, encryption, username, password, message)
            logger.info("Email sent successfully to %s via %s:%s", to, host, port)
            return
        except Exception as primary_err:
            logger.warning("SMTP %s:%s failed (%s) — trying Docker fallbacks", host, port, primary_err)

        # Fallback: try Docker-internal aliases
        for fallback in _SMTP_DOCKER_FALLBACKS:
            if fallback == host:
                continue
            try:
                await _smtp_send_via(fallback, port, encryption, username, password, message)
                logger.info("Email sent to %s via Docker alias '%s:%s'", to, fallback, port)
                return
            except Exception:
                continue

        # All fallbacks failed — raise the original error
        raise primary_err  # noqa: F821

    except Exception:
        logger.exception("Failed to send email to %s — subject: %s", to, subject)
