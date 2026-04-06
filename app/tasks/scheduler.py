"""APScheduler configuration, lifecycle, and execution logging."""

import logging
import os
import socket
import traceback
from datetime import datetime, timezone
from uuid import uuid4

from apscheduler.events import (
    EVENT_JOB_ERROR,
    EVENT_JOB_EXECUTED,
    EVENT_JOB_MISSED,
    EVENT_JOB_SUBMITTED,
    JobExecutionEvent,
)
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger

from app.core.config import settings

logger = logging.getLogger(__name__)

scheduler = AsyncIOScheduler()

# Track job start times for duration calculation
_job_start_times: dict[str, datetime] = {}
_jobs_registered = False
_listeners_registered = False
_scheduler_lock_token: str | None = None
_scheduler_lock_acquired = False


# ── Execution logging listeners ────────────────────────────────────────────

def _on_job_submitted(event) -> None:
    _job_start_times[event.job_id] = datetime.now(timezone.utc)


def _on_job_executed(event: JobExecutionEvent) -> None:
    import asyncio
    asyncio.ensure_future(_log_execution(event, status="success"))


def _on_job_error(event: JobExecutionEvent) -> None:
    import asyncio
    asyncio.ensure_future(_log_execution(event, status="error"))


def _on_job_missed(event: JobExecutionEvent) -> None:
    import asyncio
    asyncio.ensure_future(_log_execution(event, status="missed"))


async def _log_execution(event: JobExecutionEvent, status: str) -> None:
    """Persist job execution record to the database."""
    try:
        from app.core.database import async_session_factory
        from app.models.common import JobExecution

        now = datetime.now(timezone.utc)
        start_time = _job_start_times.pop(event.job_id, now)
        duration_ms = int((now - start_time).total_seconds() * 1000) if status != "missed" else None

        error_msg = None
        error_tb = None
        if hasattr(event, 'exception') and event.exception:
            error_msg = str(event.exception)
            error_tb = "".join(traceback.format_exception(type(event.exception), event.exception, event.exception.__traceback__))

        job = scheduler.get_job(event.job_id)
        job_name = job.name if job else event.job_id

        async with async_session_factory() as db:
            execution = JobExecution(
                job_id=event.job_id,
                job_name=job_name,
                status=status,
                started_at=start_time,
                finished_at=now if status != "missed" else None,
                duration_ms=duration_ms,
                error_message=error_msg,
                error_traceback=error_tb,
                triggered_by="scheduler",
            )
            db.add(execution)
            await db.commit()
    except Exception:
        logger.exception("Failed to log job execution for %s", event.job_id)


async def log_manual_execution(job_id: str, job_name: str, started_at: datetime, finished_at: datetime, status: str = "success", error: Exception | None = None) -> None:
    """Log a manually triggered job execution."""
    try:
        from app.core.database import async_session_factory
        from app.models.common import JobExecution

        duration_ms = int((finished_at - started_at).total_seconds() * 1000)
        error_msg = str(error) if error else None
        error_tb = "".join(traceback.format_exception(type(error), error, error.__traceback__)) if error else None

        async with async_session_factory() as db:
            execution = JobExecution(
                job_id=job_id,
                job_name=job_name,
                status=status,
                started_at=started_at,
                finished_at=finished_at,
                duration_ms=duration_ms,
                error_message=error_msg,
                error_traceback=error_tb,
                triggered_by="manual",
            )
            db.add(execution)
            await db.commit()
    except Exception:
        logger.exception("Failed to log manual execution for %s", job_id)


async def _try_acquire_scheduler_leader_lock() -> bool:
    """Acquire the shared scheduler leader lock in Redis."""
    global _scheduler_lock_token, _scheduler_lock_acquired

    from app.core.redis_client import get_redis

    redis = get_redis()
    token = f"{socket.gethostname()}:{os.getpid()}:{uuid4()}"
    acquired = await redis.set(
        settings.SCHEDULER_LEADER_LOCK_KEY,
        token,
        nx=True,
        ex=settings.SCHEDULER_LEADER_TTL_SECONDS,
    )
    if acquired:
        _scheduler_lock_token = token
        _scheduler_lock_acquired = True
        logger.info("APScheduler: leader lock acquired by %s", token)
        return True

    logger.info("APScheduler: leader lock already held, scheduler disabled in this worker")
    return False


async def _renew_scheduler_leader_lock() -> None:
    """Refresh the Redis TTL for the active scheduler leader."""
    global _scheduler_lock_acquired

    if not _scheduler_lock_acquired or not _scheduler_lock_token:
        return

    from app.core.redis_client import get_redis

    redis = get_redis()
    current = await redis.get(settings.SCHEDULER_LEADER_LOCK_KEY)
    if current != _scheduler_lock_token:
        logger.warning("APScheduler: leader lock lost, stopping scheduler in this worker")
        _scheduler_lock_acquired = False
        if scheduler.running:
            scheduler.shutdown(wait=False)
        return

    await redis.expire(
        settings.SCHEDULER_LEADER_LOCK_KEY,
        settings.SCHEDULER_LEADER_TTL_SECONDS,
    )


async def _release_scheduler_leader_lock() -> None:
    """Release the Redis scheduler leader lock if held by this worker."""
    global _scheduler_lock_token, _scheduler_lock_acquired

    if not _scheduler_lock_acquired or not _scheduler_lock_token:
        return

    from app.core.redis_client import get_redis

    redis = get_redis()
    current = await redis.get(settings.SCHEDULER_LEADER_LOCK_KEY)
    if current == _scheduler_lock_token:
        await redis.delete(settings.SCHEDULER_LEADER_LOCK_KEY)
    _scheduler_lock_token = None
    _scheduler_lock_acquired = False


# ── Job registration ───────────────────────────────────────────────────────

def _register_jobs() -> None:
    """Register all scheduled jobs on the scheduler."""
    global _jobs_registered
    if _jobs_registered:
        return

    from app.tasks.jobs.email_queue import process_email_queue
    from app.tasks.jobs.notification_digest import send_notification_digest
    from app.tasks.jobs.session_cleanup import cleanup_expired_sessions
    from app.tasks.jobs.stale_workflow_check import check_stale_workflows

    scheduler.add_job(process_email_queue, trigger=IntervalTrigger(minutes=2), id="email_queue", name="Process queued emails", replace_existing=True, max_instances=1)
    scheduler.add_job(cleanup_expired_sessions, trigger=CronTrigger(hour=3, minute=0), id="session_cleanup", name="Clean expired sessions and refresh tokens", replace_existing=True, max_instances=1)
    scheduler.add_job(send_notification_digest, trigger=CronTrigger(hour=8, minute=0), id="notification_digest", name="Send daily notification digest", replace_existing=True, max_instances=1)
    scheduler.add_job(check_stale_workflows, trigger=IntervalTrigger(hours=6), id="stale_workflow_check", name="Check for stale workflow instances", replace_existing=True, max_instances=1)

    from app.core.scheduler import refresh_daily_pax_load_job, generate_recurring_activities_job
    scheduler.add_job(refresh_daily_pax_load_job, trigger=IntervalTrigger(minutes=5), id="refresh_daily_pax_load", name="Refresh daily_pax_load materialized view", replace_existing=True, max_instances=1)
    scheduler.add_job(generate_recurring_activities_job, trigger=CronTrigger(hour=2, minute=0), id="generate_recurring_activities", name="Generate recurring planner activities", replace_existing=True, max_instances=1)

    from app.tasks.jobs.compliance_expiry import check_compliance_expiry
    scheduler.add_job(check_compliance_expiry, trigger=CronTrigger(hour=6, minute=0), id="compliance_expiry", name="Vérifier expiration conformité et envoyer rappels", replace_existing=True, max_instances=1)

    from app.tasks.jobs.archived_purge import purge_archived_records
    scheduler.add_job(purge_archived_records, trigger=CronTrigger(hour=4, minute=0, day_of_week="sun"), id="archived_purge", name="Purge archived records past retention period", replace_existing=True, max_instances=1)

    # Asset inspection reminders — daily at 07:00
    from app.tasks.jobs.asset_inspection import check_asset_inspections
    scheduler.add_job(check_asset_inspections, trigger=CronTrigger(hour=7, minute=0), id="asset_inspection", name="Rappels inspections assets", replace_existing=True, max_instances=1)

    from app.tasks.jobs.paxlog_ads_autoclose import process_overdue_ads_closure
    scheduler.add_job(process_overdue_ads_closure, trigger=CronTrigger(hour=1, minute=30), id="paxlog_overdue_ads_closure", name="Alerter et clôturer les AdS en dépassement", replace_existing=True, max_instances=1)

    from app.tasks.jobs.paxlog_requires_review_followup import process_requires_review_followup
    scheduler.add_job(process_requires_review_followup, trigger=CronTrigger(hour=1, minute=45), id="paxlog_requires_review_followup", name="Rappeler les AdS bloquées en nécessite révision", replace_existing=True, max_instances=1)

    from app.tasks.jobs.travelwiz_operational_watch import process_travelwiz_operational_watch
    from app.tasks.jobs.travelwiz_pickup_reminders import process_travelwiz_pickup_reminders
    from app.tasks.jobs.travelwiz_weather_sync import process_travelwiz_weather_sync
    scheduler.add_job(
        process_travelwiz_operational_watch,
        trigger=IntervalTrigger(minutes=30),
        id="travelwiz_operational_watch",
        name="Surveiller les signaux et alertes météo TravelWiz",
        replace_existing=True,
        max_instances=1,
    )
    scheduler.add_job(
        process_travelwiz_pickup_reminders,
        trigger=IntervalTrigger(minutes=1),
        id="travelwiz_pickup_reminders",
        name="Envoyer les rappels SMS de ramassage TravelWiz",
        replace_existing=True,
        max_instances=1,
    )
    scheduler.add_job(
        process_travelwiz_weather_sync,
        trigger=IntervalTrigger(minutes=10),
        id="travelwiz_weather_sync",
        name="Synchroniser la météo TravelWiz depuis le provider connecté",
        replace_existing=True,
        max_instances=1,
    )

    # Planning simulation expiry — every hour, deactivate 4h+ old simulations
    from app.tasks.jobs.simulation_expiry import expire_planning_simulations
    scheduler.add_job(
        expire_planning_simulations,
        trigger=IntervalTrigger(hours=1),
        id="simulation_expiry",
        name="Expirer les simulations de planning > 4h",
        replace_existing=True,
        max_instances=1,
    )

    # Project task deadline reminders — daily at 08:00
    from app.tasks.jobs.project_reminders import run_project_reminders
    scheduler.add_job(
        run_project_reminders,
        trigger=CronTrigger(hour=8, minute=0),
        id="project_reminders",
        name="Rappels échéances tâches projets (J-7 et J-1)",
        replace_existing=True,
        max_instances=1,
    )

    # Gouti auto-sync — runs every 15 min and per-entity throttles via
    # integration.gouti.auto_sync_interval_minutes (default 60). Entities
    # that have not opted in (auto_sync_enabled != truthy) are skipped.
    from app.tasks.jobs.gouti_auto_sync import run_gouti_auto_sync
    scheduler.add_job(
        run_gouti_auto_sync,
        trigger=IntervalTrigger(minutes=15),
        id="gouti_auto_sync",
        name="Auto-sync des projets Gouti importés",
        replace_existing=True,
        max_instances=1,
    )

    # Widget cache cleanup — every 30 min, delete expired WidgetCache rows
    from app.tasks.jobs.widget_cache_cleanup import cleanup_expired_widget_cache
    scheduler.add_job(
        cleanup_expired_widget_cache,
        trigger=IntervalTrigger(minutes=30),
        id="widget_cache_cleanup",
        name="Nettoyer le cache widgets dashboard expiré",
        replace_existing=True,
        max_instances=1,
    )

    scheduler.add_job(
        _renew_scheduler_leader_lock,
        trigger=IntervalTrigger(seconds=max(30, settings.SCHEDULER_LEADER_TTL_SECONDS // 3)),
        id="scheduler_leader_lock_renewal",
        name="Renouveler le verrou leader APScheduler",
        replace_existing=True,
        max_instances=1,
    )

    logger.info("APScheduler: %d jobs registered", len(scheduler.get_jobs()))
    _jobs_registered = True


# ── Lifecycle ──────────────────────────────────────────────────────────────

async def start_scheduler():
    """Register jobs, attach listeners, and start the APScheduler instance."""
    global _listeners_registered
    if scheduler.running:
        logger.info("APScheduler: already running")
        return

    if not await _try_acquire_scheduler_leader_lock():
        return

    try:
        _register_jobs()
        if not _listeners_registered:
            scheduler.add_listener(_on_job_submitted, EVENT_JOB_SUBMITTED)
            scheduler.add_listener(_on_job_executed, EVENT_JOB_EXECUTED)
            scheduler.add_listener(_on_job_error, EVENT_JOB_ERROR)
            scheduler.add_listener(_on_job_missed, EVENT_JOB_MISSED)
            _listeners_registered = True
        scheduler.start()
        logger.info("APScheduler: started with execution logging")
    except Exception:
        await _release_scheduler_leader_lock()
        raise


async def stop_scheduler():
    """Shutdown the APScheduler instance."""
    if scheduler.running:
        scheduler.shutdown(wait=False)
        logger.info("APScheduler: stopped")
    await _release_scheduler_leader_lock()
