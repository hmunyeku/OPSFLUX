"""Scheduled job — clean expired widget cache entries.

Runs every 30 minutes. Deletes WidgetCache rows where expires_at < now().
Prevents stale cache accumulation in the dashboard widget system.
"""

import logging
from datetime import UTC, datetime

from sqlalchemy import text

from app.core.database import async_session_factory

logger = logging.getLogger(__name__)


async def cleanup_expired_widget_cache() -> None:
    """Delete expired widget cache entries."""
    logger.debug("widget_cache_cleanup: starting run")

    try:
        async with async_session_factory() as db:
            await db.execute(text("SET search_path TO public"))

            result = await db.execute(
                text(
                    "DELETE FROM widget_cache "
                    "WHERE expires_at < :now "
                    "RETURNING id"
                ),
                {"now": datetime.now(UTC)},
            )
            deleted = len(result.fetchall())
            await db.commit()

            if deleted > 0:
                logger.info("widget_cache_cleanup: deleted %d expired entries", deleted)
            else:
                logger.debug("widget_cache_cleanup: no expired entries")

    except Exception:
        logger.exception("widget_cache_cleanup: unhandled error")
