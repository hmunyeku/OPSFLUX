"""Scheduled job — process queued emails.

Runs every 2 minutes. Queries notifications where category='email' and not yet
sent, sends via SMTP, marks as processed, with retry logic (max 3 attempts).
"""

import json
import logging
from datetime import UTC, datetime

from sqlalchemy import text

from app.core.config import settings
from app.core.database import async_session_factory
from app.core.email_templates import render_and_send_email

logger = logging.getLogger(__name__)

MAX_RETRY_ATTEMPTS = 3
BATCH_SIZE = 50


async def process_email_queue() -> None:
    """Fetch unsent email notifications and send them via SMTP."""
    logger.debug("email_queue: starting run")

    try:
        async with async_session_factory() as db:
            # Fetch email notifications that haven't been processed yet.
            # We use a simple pattern: notifications with category='email'
            # that have read=false (used as "sent" flag for email category).
            # We also check a retry-count via a JSONB details column or
            # fall back to attempting all unsent emails up to MAX_RETRY_ATTEMPTS.
            result = await db.execute(
                text(
                    "SELECT id, user_id, entity_id, title, body, link "
                    "FROM notifications "
                    "WHERE category = 'email' AND read = false "
                    "ORDER BY created_at ASC "
                    "LIMIT :limit"
                ),
                {"limit": BATCH_SIZE},
            )
            rows = result.fetchall()

            if not rows:
                logger.debug("email_queue: no emails to process")
                return

            logger.info("email_queue: processing %d queued emails", len(rows))

            for row in rows:
                notification_id = row.id
                user_id = row.user_id
                title = row.title
                body_text = row.body or ""

                try:
                    # Look up the user's email address
                    user_result = await db.execute(
                        text("SELECT email, first_name, language, default_entity_id FROM users WHERE id = :uid"),
                        {"uid": str(user_id)},
                    )
                    user_row = user_result.first()
                    if not user_row:
                        logger.warning(
                            "email_queue: user %s not found, skipping notification %s",
                            user_id, notification_id,
                        )
                        # Mark as read so we don't keep retrying
                        await _mark_email_sent(db, notification_id)
                        continue

                    recipient_email = user_row.email
                    full_link = _build_notification_link(row.link)
                    sent = await render_and_send_email(
                        db=db,
                        slug="queued_notification_email",
                        entity_id=user_row.default_entity_id,
                        language=(user_row.language or "fr"),
                        to=recipient_email,
                        user_id=user_id,
                        category="core",
                        variables={
                            "notification": {
                                "title": title,
                                "body": body_text,
                                "link": full_link,
                            },
                        },
                    )
                    if not sent:
                        raise RuntimeError("Template email queued_notification_email indisponible")

                    # Mark as sent (set read=true, read_at=now)
                    await _mark_email_sent(db, notification_id)
                    logger.info(
                        "email_queue: sent email to %s (notification=%s)",
                        recipient_email, notification_id,
                    )

                except Exception:
                    logger.exception(
                        "email_queue: failed to send notification %s", notification_id
                    )
                    # Increment retry count — if we've exhausted retries, mark as sent
                    # to avoid infinite retry loops
                    retry_count = await _get_retry_count(db, notification_id)
                    if retry_count >= MAX_RETRY_ATTEMPTS - 1:
                        logger.warning(
                            "email_queue: max retries reached for notification %s, marking as sent",
                            notification_id,
                        )
                        await _mark_email_sent(db, notification_id)
                    else:
                        await _increment_retry_count(db, notification_id, retry_count)

            await db.commit()

    except Exception:
        logger.exception("email_queue: unhandled error during email processing run")


async def _mark_email_sent(db, notification_id) -> None:
    """Mark an email notification as sent."""
    await db.execute(
        text(
            "UPDATE notifications SET read = true, read_at = :now "
            "WHERE id = :id"
        ),
        {"now": datetime.now(UTC), "id": str(notification_id)},
    )


async def _get_retry_count(db, notification_id) -> int:
    """Get the retry count for a notification by checking event_store or body prefix."""
    # Use a simple convention: store retry count in a separate tracking table
    # or in the notification body as a prefix.  For simplicity we track via
    # a lightweight query to event_store keyed on notification id.
    try:
        result = await db.execute(
            text(
                "SELECT retry_count FROM event_store "
                "WHERE event_name = 'email_queue.retry' AND payload->>'notification_id' = :nid "
                "ORDER BY emitted_at DESC LIMIT 1"
            ),
            {"nid": str(notification_id)},
        )
        row = result.first()
        return row.retry_count if row else 0
    except Exception:
        return 0


async def _increment_retry_count(db, notification_id, current_count: int) -> None:
    """Record a retry attempt in event_store."""
    try:
        from uuid import uuid4

        await db.execute(
            text(
                "INSERT INTO event_store (id, event_name, payload, emitted_at, retry_count) "
                "VALUES (:id, 'email_queue.retry', :payload, :now, :count)"
            ),
            {
                "id": str(uuid4()),
                "payload": json.dumps({"notification_id": str(notification_id)}),
                "now": datetime.now(UTC),
                "count": current_count + 1,
            },
        )
    except Exception:
        logger.debug("Failed to record retry count for notification %s", notification_id)


def _build_notification_link(link: str | None) -> str | None:
    """Normalize a notification link into an absolute OpsFlux URL."""
    if not link:
        return None
    return f"{settings.FRONTEND_URL.rstrip('/')}{link}" if link.startswith("/") else link
