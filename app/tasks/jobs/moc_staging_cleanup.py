"""Scheduled job — purge abandoned MOC staging attachments.

When a user opens the MOC Create panel and uploads images (Tiptap inline
or sloted schemas) but never saves the MOC, the staged attachments are
left orphaned with owner_type='moc_staging'. This job soft-deletes (and
optionally purges files) any staging row older than STAGING_TTL_HOURS.

Runs hourly so storage doesn't fill up from abandoned drafts.
"""

import logging
from datetime import UTC, datetime, timedelta

from sqlalchemy import text

from app.core.database import async_session_factory

logger = logging.getLogger(__name__)

STAGING_TTL_HOURS = 24


async def cleanup_moc_staging_attachments() -> None:
    """Soft-delete moc_staging attachments older than STAGING_TTL_HOURS."""
    logger.debug("moc_staging_cleanup: starting run")
    now = datetime.now(UTC)
    cutoff = now - timedelta(hours=STAGING_TTL_HOURS)

    try:
        async with async_session_factory() as db:
            await db.execute(text("SET search_path TO public"))
            result = await db.execute(
                text(
                    "UPDATE attachments "
                    "SET deleted_at = :now "
                    "WHERE owner_type = 'moc_staging' "
                    "AND created_at < :cutoff "
                    "AND deleted_at IS NULL "
                    "RETURNING id"
                ),
                {"now": now, "cutoff": cutoff},
            )
            purged = len(result.fetchall())
            await db.commit()
            if purged:
                logger.info(
                    "moc_staging_cleanup: soft-deleted %d abandoned staging attachments (>%dh old)",
                    purged, STAGING_TTL_HOURS,
                )
    except Exception:
        logger.exception("moc_staging_cleanup: unhandled error during run")
