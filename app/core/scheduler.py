"""APScheduler integration for periodic Planner tasks.

Job wrapper functions that manage their own DB sessions so they can be
called by the scheduler without an ambient request context.
"""

import logging

from sqlalchemy import text

from app.core.database import async_session_factory

logger = logging.getLogger(__name__)


async def refresh_daily_pax_load_job() -> None:
    """Refresh the daily_pax_load materialized view.

    Scheduled every 5 minutes by APScheduler. Wraps the service function
    with its own async session.
    """
    from app.services.modules.planner_service import refresh_daily_pax_load

    async with async_session_factory() as db:
        await db.execute(text("SET search_path TO public"))
        await refresh_daily_pax_load(db)


async def generate_recurring_activities_job() -> None:
    """Generate upcoming recurring planner activities.

    Scheduled daily at 02:00 by APScheduler. Iterates over all entities
    and generates activities from active recurrence rules.
    """
    from app.services.modules.planner_service import generate_recurring_activities

    async with async_session_factory() as db:
        await db.execute(text("SET search_path TO public"))
        # Fetch all active entity IDs
        result = await db.execute(text("SELECT id FROM entities WHERE active = TRUE"))
        entity_ids = [row[0] for row in result.all()]

        total_generated = 0
        for entity_id in entity_ids:
            count = await generate_recurring_activities(db, entity_id)
            total_generated += count

        if total_generated > 0:
            logger.info(
                "Recurring activities job: generated %d activities across %d entities",
                total_generated,
                len(entity_ids),
            )
