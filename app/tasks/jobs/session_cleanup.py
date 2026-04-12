"""Scheduled job — clean expired sessions and refresh tokens.

Runs daily at 03:00. Deletes expired/revoked sessions from user_sessions
and expired/revoked refresh tokens from refresh_tokens.
"""

import logging
from datetime import UTC, datetime

from sqlalchemy import text

from app.core.database import async_session_factory

logger = logging.getLogger(__name__)


async def cleanup_expired_sessions() -> None:
    """Delete expired and revoked sessions and refresh tokens."""
    logger.debug("session_cleanup: starting run")
    now = datetime.now(UTC)

    try:
        async with async_session_factory() as db:
            # Background jobs run outside request context — use public schema
            await db.execute(text("SET search_path TO public"))

            # 1. Delete revoked user sessions
            # Sessions don't have an explicit expires_at, but revoked sessions
            # and sessions inactive for a long time should be cleaned up.
            # We clean: revoked=true OR last_active_at older than 30 days.
            result_sessions = await db.execute(
                text("DELETE FROM user_sessions WHERE revoked = true OR last_active_at < :cutoff RETURNING id"),
                {"cutoff": now - __import__("datetime").timedelta(days=30)},
            )
            deleted_sessions = len(result_sessions.fetchall())

            # 2. Delete expired or revoked refresh tokens
            result_tokens = await db.execute(
                text("DELETE FROM refresh_tokens WHERE revoked = true OR expires_at < :now RETURNING id"),
                {"now": now},
            )
            deleted_tokens = len(result_tokens.fetchall())

            await db.commit()

            logger.info(
                "session_cleanup: deleted %d expired sessions and %d expired refresh tokens",
                deleted_sessions,
                deleted_tokens,
            )

    except Exception:
        logger.exception("session_cleanup: unhandled error during cleanup run")
