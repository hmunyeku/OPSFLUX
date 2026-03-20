"""APScheduler configuration and lifecycle."""

import logging

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger

logger = logging.getLogger(__name__)

scheduler = AsyncIOScheduler()


def _register_jobs() -> None:
    """Register all scheduled jobs on the scheduler."""
    from app.tasks.jobs.email_queue import process_email_queue
    from app.tasks.jobs.notification_digest import send_notification_digest
    from app.tasks.jobs.session_cleanup import cleanup_expired_sessions
    from app.tasks.jobs.stale_workflow_check import check_stale_workflows

    # Process queued emails — every 2 minutes
    scheduler.add_job(
        process_email_queue,
        trigger=IntervalTrigger(minutes=2),
        id="email_queue",
        name="Process queued emails",
        replace_existing=True,
        max_instances=1,
    )

    # Clean expired sessions — daily at 03:00
    scheduler.add_job(
        cleanup_expired_sessions,
        trigger=CronTrigger(hour=3, minute=0),
        id="session_cleanup",
        name="Clean expired sessions and refresh tokens",
        replace_existing=True,
        max_instances=1,
    )

    # Send notification digest — daily at 08:00
    scheduler.add_job(
        send_notification_digest,
        trigger=CronTrigger(hour=8, minute=0),
        id="notification_digest",
        name="Send daily notification digest",
        replace_existing=True,
        max_instances=1,
    )

    # Check stale workflows — every 6 hours
    scheduler.add_job(
        check_stale_workflows,
        trigger=IntervalTrigger(hours=6),
        id="stale_workflow_check",
        name="Check for stale workflow instances",
        replace_existing=True,
        max_instances=1,
    )

    # ── Planner module jobs ──────────────────────────────────────────────
    from app.core.scheduler import (
        refresh_daily_pax_load_job,
        generate_recurring_activities_job,
    )

    # Refresh daily_pax_load materialized view — every 5 minutes
    scheduler.add_job(
        refresh_daily_pax_load_job,
        trigger=IntervalTrigger(minutes=5),
        id="refresh_daily_pax_load",
        name="Refresh daily_pax_load materialized view",
        replace_existing=True,
        max_instances=1,
    )

    # Generate recurring activities — daily at 02:00
    scheduler.add_job(
        generate_recurring_activities_job,
        trigger=CronTrigger(hour=2, minute=0),
        id="generate_recurring_activities",
        name="Generate recurring planner activities",
        replace_existing=True,
        max_instances=1,
    )

    # ── Archived records purge ──────────────────────────────────────────
    from app.tasks.jobs.archived_purge import purge_archived_records

    # Purge archived records past retention — weekly Sunday at 04:00
    scheduler.add_job(
        purge_archived_records,
        trigger=CronTrigger(hour=4, minute=0, day_of_week="sun"),
        id="archived_purge",
        name="Purge archived records past retention period",
        replace_existing=True,
        max_instances=1,
    )

    logger.info("APScheduler: %d jobs registered", len(scheduler.get_jobs()))


async def start_scheduler():
    """Register jobs and start the APScheduler instance."""
    _register_jobs()
    scheduler.start()
    logger.info("APScheduler: started")


async def stop_scheduler():
    """Shutdown the APScheduler instance."""
    scheduler.shutdown(wait=False)
    logger.info("APScheduler: stopped")
