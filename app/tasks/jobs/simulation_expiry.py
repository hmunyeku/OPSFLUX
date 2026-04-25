"""Scheduled job: expire planning revision simulations after 4 hours.

Per the CDC spec, simulation revisions have a 4-hour TTL. After expiry
they are deactivated (active=False) so they don't clutter the revision
list. The data is kept for audit — only the active flag is flipped.
"""

import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import select, update

from app.core.database import async_session_factory
from app.models.common import PlanningRevision

logger = logging.getLogger(__name__)

SIMULATION_TTL_HOURS = 4


async def expire_planning_simulations() -> None:
    """Deactivate simulation revisions older than SIMULATION_TTL_HOURS."""
    cutoff = datetime.now(timezone.utc) - timedelta(hours=SIMULATION_TTL_HOURS)

    async with async_session_factory() as db:
        result = await db.execute(
            update(PlanningRevision)
            .where(
                PlanningRevision.is_simulation == True,  # noqa: E712
                PlanningRevision.active == True,  # noqa: E712
                PlanningRevision.created_at < cutoff,
            )
            .values(active=False)
            .returning(PlanningRevision.id)
        )
        expired = result.all()
        if expired:
            await db.commit()
            logger.info(
                "Planning simulation expiry: deactivated %d simulations older than %dh",
                len(expired), SIMULATION_TTL_HOURS,
            )
