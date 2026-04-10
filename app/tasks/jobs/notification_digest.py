"""Scheduled job — send daily notification digest.

Runs daily at 08:00. For users with > 5 unread notifications in the last 24h,
sends a digest email summary.
"""

import logging
from datetime import UTC, datetime, timedelta

from sqlalchemy import text

from app.core.email_templates import render_and_send_email
from app.core.config import settings
from app.core.database import async_session_factory

logger = logging.getLogger(__name__)

UNREAD_THRESHOLD = 5


async def send_notification_digest() -> None:
    """Send digest emails to users with many unread notifications."""
    logger.debug("notification_digest: starting run")

    try:
        cutoff = datetime.now(UTC) - timedelta(hours=24)

        async with async_session_factory() as db:
            # Find users with more than UNREAD_THRESHOLD unread notifications
            # in the last 24 hours
            result = await db.execute(
                text(
                    "SELECT n.user_id, u.email, u.first_name, u.language, "
                    "COUNT(*) as unread_count "
                    "FROM notifications n "
                    "JOIN users u ON u.id = n.user_id "
                    "WHERE n.read = false "
                    "AND n.created_at >= :cutoff "
                    "AND n.category != 'email' "
                    "AND u.active = true "
                    "GROUP BY n.user_id, u.email, u.first_name, u.language "
                    "HAVING COUNT(*) > :threshold "
                    "ORDER BY unread_count DESC"
                ),
                {"cutoff": cutoff, "threshold": UNREAD_THRESHOLD},
            )
            rows = result.fetchall()

            if not rows:
                logger.debug("notification_digest: no users qualify for digest")
                return

            logger.info(
                "notification_digest: sending digest to %d users", len(rows)
            )

            for row in rows:
                user_id = row.user_id
                email = row.email
                first_name = row.first_name
                language = row.language or "fr"
                unread_count = row.unread_count

                try:
                    # Fetch the recent unread notifications for the digest
                    notifs_result = await db.execute(
                        text(
                            "SELECT title, body, category, link, created_at "
                            "FROM notifications "
                            "WHERE user_id = :uid AND read = false "
                            "AND created_at >= :cutoff "
                            "AND category != 'email' "
                            "ORDER BY created_at DESC "
                            "LIMIT 20"
                        ),
                        {"uid": str(user_id), "cutoff": cutoff},
                    )
                    notifications = notifs_result.fetchall()

                    notifications_html = _build_digest_notifications_html(
                        notifications=notifications,
                        language=language,
                    )
                    sent = await render_and_send_email(
                        db=db,
                        slug="notification_digest",
                        entity_id=None,
                        language=language,
                        to=email,
                        user_id=user_id,
                        category="core",
                        variables={
                            "user": {"first_name": first_name or ""},
                            "unread_count": unread_count,
                            "notifications_html": notifications_html,
                            "notifications_url": f"{settings.FRONTEND_URL.rstrip('/')}/notifications",
                        },
                    )
                    if not sent:
                        raise RuntimeError("Template email notification_digest indisponible")
                    logger.info(
                        "notification_digest: sent digest to %s (%d unread)",
                        email, unread_count,
                    )

                except Exception:
                    logger.exception(
                        "notification_digest: failed to send digest to %s", email
                    )

    except Exception:
        logger.exception("notification_digest: unhandled error during digest run")


def _build_digest_notifications_html(
    *,
    notifications: list,
    language: str,
) -> str:
    """Build the notification table HTML injected in the central template."""

    is_french = language.startswith("fr")

    # Build notification list HTML
    notif_items = ""
    for n in notifications:
        title = n.title
        body = n.body or ""
        category = n.category
        badge_color = _category_color(category)
        notif_items += (
            f"<tr>"
            f"<td style='padding: 8px 12px; border-bottom: 1px solid #f0f0f0;'>"
            f"<span style='background: {badge_color}; color: white; padding: 2px 8px; "
            f"border-radius: 4px; font-size: 11px;'>{category}</span>"
            f"</td>"
            f"<td style='padding: 8px 12px; border-bottom: 1px solid #f0f0f0;'>"
            f"<strong>{title}</strong>"
            f"{'<br/><span style=\"color: #666; font-size: 13px;\">' + body + '</span>' if body else ''}"
            f"</td>"
            f"</tr>"
        )

    intro = (
        "Vous avez des notifications non lues au cours des dernières 24 heures."
        if is_french
        else "You have unread notifications in the last 24 hours."
    )
    return (
        "<div style='font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;'>"
        f"<p>{intro}</p>"
        "<table style='width: 100%; border-collapse: collapse; margin: 16px 0;'>"
        f"{notif_items}"
        "</table>"
        "</div>"
    )


def _category_color(category: str) -> str:
    """Return a badge color for a notification category."""
    colors = {
        "workflow": "#3b82f6",
        "asset": "#10b981",
        "info": "#6b7280",
        "warning": "#f59e0b",
        "error": "#ef4444",
        "system": "#8b5cf6",
    }
    return colors.get(category, "#6b7280")
