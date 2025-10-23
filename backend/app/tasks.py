"""
Celery tasks for OpsFlux CORE
"""

from datetime import datetime, timedelta
from sqlmodel import Session, select
from app.core.queue_service import task, celery_app
from app.core.logger_service import LoggerService
from app.core.config import settings
from app.core.db import engine

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


@task(name="app.tasks.execute_scheduled_backups", max_retries=1, time_limit=3600)
def execute_scheduled_backups_task():
    """
    Vérifie et exécute les sauvegardes planifiées dont l'heure est arrivée.

    Cette tâche est exécutée toutes les minutes par Celery Beat.
    Elle vérifie toutes les planifications actives dont next_run_at <= maintenant,
    crée un backup pour chacune, met à jour les statistiques et recalcule next_run_at.
    """
    from app.models_backup import ScheduledBackup, Backup, BackupCreate
    from app.core.backup_service import backup_service

    executed_count = 0
    failed_count = 0

    try:
        with Session(engine) as session:
            # Récupérer toutes les planifications actives dont l'heure d'exécution est passée
            now = datetime.utcnow()
            statement = select(ScheduledBackup).where(
                ScheduledBackup.is_active == True,
                ScheduledBackup.next_run_at <= now
            )
            scheduled_backups = session.exec(statement).all()

            logger.info(f"Found {len(scheduled_backups)} scheduled backups to execute")

            for scheduled in scheduled_backups:
                try:
                    logger.info(f"Executing scheduled backup: {scheduled.name} (ID: {scheduled.id})")

                    # Créer le backup
                    backup = Backup(
                        name=f"{scheduled.name} - {now.strftime('%Y-%m-%d %H:%M')}",
                        description=f"Sauvegarde automatique planifiée: {scheduled.description or scheduled.name}",
                        backup_type=scheduled.backup_type,
                        status="pending",
                        created_by_id=scheduled.created_by_id,
                        includes_database=scheduled.includes_database,
                        includes_storage=scheduled.includes_storage,
                        includes_config=scheduled.includes_config,
                    )

                    session.add(backup)
                    session.commit()
                    session.refresh(backup)

                    # Mettre à jour le statut à "in_progress"
                    backup.status = "in_progress"
                    session.add(backup)
                    session.commit()

                    # Créer le backup
                    success, file_path, stats = backup_service.create_backup(
                        backup_id=backup.id,
                        includes_database=scheduled.includes_database,
                        includes_storage=scheduled.includes_storage,
                        includes_config=scheduled.includes_config,
                        db_session=session,
                    )

                    if success and file_path and stats:
                        backup.status = "completed"
                        backup.file_path = file_path
                        backup.file_size = backup_service.get_backup_file_size(backup.id)
                        backup.database_size = stats.get("database_size", 0)
                        backup.storage_size = stats.get("storage_size", 0)
                        backup.config_size = stats.get("config_size", 0)
                        backup.completed_at = datetime.utcnow()

                        # Mettre à jour les statistiques de la planification
                        scheduled.total_runs += 1
                        scheduled.successful_runs += 1
                        scheduled.last_run_at = now

                        executed_count += 1
                        logger.info(f"Scheduled backup completed successfully: {scheduled.name}")
                    else:
                        backup.status = "failed"
                        backup.error_message = "Backup creation failed"

                        scheduled.total_runs += 1
                        scheduled.failed_runs += 1
                        scheduled.last_run_at = now

                        failed_count += 1
                        logger.error(f"Scheduled backup failed: {scheduled.name}")

                    session.add(backup)

                    # Recalculer next_run_at
                    scheduled.next_run_at = _calculate_next_run(
                        scheduled.schedule_frequency,
                        scheduled.schedule_time,
                        scheduled.schedule_day
                    )
                    scheduled.updated_at = now

                    session.add(scheduled)
                    session.commit()

                    logger.info(f"Next run scheduled for: {scheduled.next_run_at}")

                except Exception as e:
                    logger.error(f"Error executing scheduled backup {scheduled.name}: {e}", exc_info=True)

                    # Mettre à jour les stats même en cas d'erreur
                    try:
                        scheduled.total_runs += 1
                        scheduled.failed_runs += 1
                        scheduled.last_run_at = now
                        scheduled.next_run_at = _calculate_next_run(
                            scheduled.schedule_frequency,
                            scheduled.schedule_time,
                            scheduled.schedule_day
                        )
                        session.add(scheduled)
                        session.commit()
                    except Exception as inner_e:
                        logger.error(f"Error updating scheduled backup stats: {inner_e}")
                        session.rollback()

                    failed_count += 1
                    continue

            logger.info(
                f"Scheduled backups execution completed: {executed_count} succeeded, {failed_count} failed"
            )

            return {
                "executed": executed_count,
                "failed": failed_count,
                "timestamp": now.isoformat()
            }

    except Exception as e:
        logger.error(f"Error in execute_scheduled_backups_task: {e}", exc_info=True)
        return {
            "executed": executed_count,
            "failed": failed_count,
            "error": str(e)
        }


def _calculate_next_run(
    schedule_frequency: str,
    schedule_time: str,
    schedule_day: int | None = None
) -> datetime:
    """Calcule la prochaine exécution."""
    now = datetime.utcnow()
    hour, minute = map(int, schedule_time.split(":"))

    if schedule_frequency == "daily":
        next_run = now.replace(hour=hour, minute=minute, second=0, microsecond=0)
        if next_run <= now:
            next_run += timedelta(days=1)

    elif schedule_frequency == "weekly":
        # schedule_day: 0=Dimanche, 1=Lundi, ..., 6=Samedi
        target_day = schedule_day or 1
        days_ahead = target_day - now.weekday()
        if days_ahead <= 0:  # Target day already passed this week
            days_ahead += 7
        next_run = now + timedelta(days=days_ahead)
        next_run = next_run.replace(hour=hour, minute=minute, second=0, microsecond=0)

    elif schedule_frequency == "monthly":
        # schedule_day: 1-31
        target_day = schedule_day or 1
        next_run = now.replace(day=target_day, hour=hour, minute=minute, second=0, microsecond=0)
        if next_run <= now:
            # Passer au mois prochain
            if now.month == 12:
                next_run = next_run.replace(year=now.year + 1, month=1)
            else:
                next_run = next_run.replace(month=now.month + 1)

    else:
        next_run = now

    return next_run
