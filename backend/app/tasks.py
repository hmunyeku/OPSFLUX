"""
Celery tasks for OpsFlux CORE
"""

from app.core.queue_service import task, celery_app
from app.core.logger_service import LoggerService

logger = LoggerService().get_logger(__name__)


@task(name="app.tasks.send_email", max_retries=3)
def send_email_task(to: str, subject: str, body: str):
    """Send email task"""
    logger.info(f"Sending email to {to}: {subject}")
    # Placeholder - will be integrated with EmailService
    return {"sent": True, "to": to, "subject": subject}


@task(name="app.tasks.cleanup_old_files", max_retries=2)
def cleanup_old_files_task(days: int = 30):
    """Clean up old files from storage"""
    logger.info(f"Cleaning up files older than {days} days")
    # Placeholder - will be integrated with StorageService
    return {"cleaned": 0, "days": days}


@task(name="app.tasks.collect_stats", max_retries=1)
def collect_stats_task():
    """Collect system statistics"""
    logger.info("Collecting system statistics")
    # Placeholder - will be integrated with MetricsService
    return {"collected": True, "timestamp": "now"}
