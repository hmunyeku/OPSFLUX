"""Scheduled job — purge archived records past their retention period.

Runs weekly by default (Sunday 04:00). For each entity type with a
delete_policy of mode=soft_purge, physically deletes records that have
been archived longer than retention_days.
"""

import logging

from sqlalchemy import select, text

from app.core.database import async_session_factory
from app.models.common import Setting
from app.services.core.delete_service import ENTITY_TYPE_REGISTRY, purge_archived

logger = logging.getLogger(__name__)


async def purge_archived_records() -> None:
    """Iterate over all soft_purge policies and purge eligible archived records."""
    logger.debug("archived_purge: starting run")

    try:
        async with async_session_factory() as db:
            await db.execute(text("SET search_path TO public"))

            # Find all delete policies with mode=soft_purge
            result = await db.execute(select(Setting).where(Setting.key.startswith("delete_policy.")))
            policies = result.scalars().all()

            total_purged = 0
            for setting in policies:
                value = setting.value
                if not isinstance(value, dict):
                    continue
                if value.get("mode") != "soft_purge":
                    continue

                entity_type = setting.key.replace("delete_policy.", "")
                retention_days = value.get("retention_days", 90)

                if entity_type not in ENTITY_TYPE_REGISTRY:
                    logger.warning("archived_purge: unknown entity type %s, skipping", entity_type)
                    continue

                if retention_days <= 0:
                    continue

                count = await purge_archived(entity_type, retention_days, db)
                total_purged += count

            if total_purged > 0:
                logger.info("archived_purge: total %d records purged", total_purged)
            else:
                logger.debug("archived_purge: no records to purge")

    except Exception:
        logger.exception("archived_purge: unhandled error during purge run")
