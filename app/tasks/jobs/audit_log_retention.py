"""Scheduled job — enforce AUP §7.1 audit-log retention.

The AUP mandates that audit trails be kept for one year, then
deleted. This job runs daily at 03:15 and physically deletes
`audit_log` rows older than the configured horizon.

Retention window is configurable via Setting key
``audit_log.retention_days`` (int, default 365). Values ≤ 0 disable the
purge entirely — useful for self-hosted deployments with indefinite
retention requirements.

Runs in batches of 10 000 rows to avoid holding a single long
transaction on a growing table; reports the total purged to logs so
the nightly run is visible in `scheduled_task_runs`.
"""

from __future__ import annotations

import logging

from sqlalchemy import select, text

from app.core.database import async_session_factory
from app.models.common import Setting

logger = logging.getLogger(__name__)

DEFAULT_RETENTION_DAYS = 365
SETTING_KEY = "audit_log.retention_days"
BATCH_SIZE = 10_000


async def purge_old_audit_logs() -> None:
    """Delete audit_log rows older than the configured retention window."""
    logger.debug("audit_log_retention: starting run")

    try:
        async with async_session_factory() as db:
            await db.execute(text("SET search_path TO public"))

            # Read retention window from Settings. Fallback to default if
            # the key is absent, not an int, or non-positive (disabled).
            setting_row = (
                await db.execute(
                    select(Setting).where(
                        Setting.key == SETTING_KEY,
                        Setting.scope == "tenant",
                    )
                )
            ).scalar_one_or_none()

            retention_days = DEFAULT_RETENTION_DAYS
            if setting_row and setting_row.value is not None:
                try:
                    retention_days = int(setting_row.value)
                except (TypeError, ValueError):
                    logger.warning(
                        "audit_log_retention: invalid setting %s=%r, using default %d",
                        SETTING_KEY, setting_row.value, DEFAULT_RETENTION_DAYS,
                    )

            if retention_days <= 0:
                logger.info(
                    "audit_log_retention: disabled (retention_days=%d)",
                    retention_days,
                )
                return

            # Delete in batches so a huge backlog doesn't blow up the
            # transaction log. PostgreSQL's CTE-delete pattern keeps it
            # atomic per batch.
            total = 0
            while True:
                result = await db.execute(
                    text(
                        """
                        WITH victims AS (
                            SELECT id FROM audit_log
                            WHERE created_at < NOW() - make_interval(days => :days)
                            ORDER BY created_at ASC
                            LIMIT :batch
                        )
                        DELETE FROM audit_log
                        WHERE id IN (SELECT id FROM victims)
                        """
                    ),
                    {"days": retention_days, "batch": BATCH_SIZE},
                )
                # SQLAlchemy returns rowcount from the DELETE.
                deleted = result.rowcount or 0
                await db.commit()
                total += deleted
                if deleted < BATCH_SIZE:
                    break

            if total > 0:
                logger.info(
                    "audit_log_retention: purged %d entries older than %d days",
                    total, retention_days,
                )
            else:
                logger.debug(
                    "audit_log_retention: nothing to purge (retention=%d days)",
                    retention_days,
                )

    except Exception:
        logger.exception("audit_log_retention: unhandled error during purge run")
