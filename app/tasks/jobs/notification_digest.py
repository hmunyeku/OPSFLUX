"""Scheduled job — send daily notification digest.

Runs daily at 08:00. For users with > 5 unread notifications in the last 24h,
sends a digest email summary.
"""

import logging
from datetime import UTC, datetime, timedelta

from sqlalchemy import text

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

                    # Build digest email
                    subject, body_html = _build_digest_email(
                        first_name=first_name,
                        unread_count=unread_count,
                        notifications=notifications,
                        language=language,
                    )

                    from app.core.notifications import send_email

                    await send_email(
                        to=email,
                        subject=subject,
                        body_html=body_html,
                        db=db,
                        user_id=user_id,
                        category="core",
                        channel="digest",
                    )
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


def _build_digest_email(
    *,
    first_name: str,
    unread_count: int,
    notifications: list,
    language: str,
) -> tuple[str, str]:
    """Build the digest email subject and HTML body."""
    from app.core.config import settings

    is_french = language.startswith("fr")

    if is_french:
        subject = f"OpsFlux — {unread_count} notifications non lues"
        greeting = f"Bonjour {first_name},"
        intro = (
            f"Vous avez <strong>{unread_count}</strong> notifications non lues "
            f"au cours des dernieres 24 heures."
        )
        cta_text = "Voir toutes les notifications"
        footer = "OpsFlux — Plateforme ERP"
    else:
        subject = f"OpsFlux — {unread_count} unread notifications"
        greeting = f"Hello {first_name},"
        intro = (
            f"You have <strong>{unread_count}</strong> unread notifications "
            f"in the last 24 hours."
        )
        cta_text = "View all notifications"
        footer = "OpsFlux — ERP Platform"

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

    frontend_url = settings.FRONTEND_URL
    body_html = (
        f"<div style='font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;'>"
        f"<h2 style='color: #1a1a2e;'>{greeting}</h2>"
        f"<p>{intro}</p>"
        f"<table style='width: 100%; border-collapse: collapse; margin: 16px 0;'>"
        f"{notif_items}"
        f"</table>"
        f"<p style='text-align: center; margin: 24px 0;'>"
        f"<a href='{frontend_url}/notifications' "
        f"style='background: #1a1a2e; color: white; padding: 10px 24px; "
        f"text-decoration: none; border-radius: 6px;'>{cta_text}</a>"
        f"</p>"
        f"<hr style='border: none; border-top: 1px solid #eee; margin: 20px 0;'/>"
        f"<p style='color: #999; font-size: 12px;'>{footer}</p>"
        f"</div>"
    )

    return subject, body_html


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
