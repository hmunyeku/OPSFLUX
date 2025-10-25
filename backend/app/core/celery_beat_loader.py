"""
Service de chargement dynamique des schedules Celery Beat depuis la base de données.
"""

from celery.schedules import crontab, schedule as celery_schedule
from sqlmodel import Session, select
from app.core.db import engine
from app.models_scheduled_tasks import ScheduledTask
from app.core.logger_service import LoggerService
from typing import Dict, Any

logger = LoggerService().get_logger(__name__)


def get_schedule_from_task(task: ScheduledTask) -> Any:
    """
    Convertit une tâche planifiée en objet schedule Celery.
    """
    if task.schedule_type == "cron":
        return crontab(
            minute=task.cron_minute or "*",
            hour=task.cron_hour or "*",
            day_of_week=task.cron_day_of_week or "*",
            day_of_month=task.cron_day_of_month or "*",
            month_of_year=task.cron_month_of_year or "*",
        )
    elif task.schedule_type == "interval":
        # Convert interval to seconds
        unit = task.interval_unit or "minutes"
        value = task.interval_value or 1

        seconds_map = {
            "seconds": 1,
            "minutes": 60,
            "hours": 3600,
            "days": 86400,
        }

        total_seconds = value * seconds_map.get(unit, 60)
        return celery_schedule(run_every=total_seconds)

    raise ValueError(f"Unknown schedule type: {task.schedule_type}")


def load_beat_schedule() -> Dict[str, Dict[str, Any]]:
    """
    Charge les tâches planifiées depuis la base de données et
    génère un dictionnaire de configuration Celery Beat.

    Returns:
        Dict de configuration au format Celery Beat schedule
    """
    beat_schedule = {}

    try:
        with Session(engine) as session:
            # Load all active, non-paused tasks
            statement = select(ScheduledTask).where(
                ScheduledTask.deleted_at == None,
                ScheduledTask.is_active == True,
                ScheduledTask.is_paused == False,
            )

            tasks = session.exec(statement).all()

            logger.info(f"📅 Loading {len(tasks)} scheduled tasks from database")

            for task in tasks:
                try:
                    schedule_obj = get_schedule_from_task(task)

                    beat_schedule[task.name] = {
                        "task": task.task_name,
                        "schedule": schedule_obj,
                        "args": task.args,
                        "kwargs": task.kwargs,
                        "options": {
                            "queue": task.queue or "celery",
                        },
                    }

                    logger.debug(f"  ✓ Loaded task: {task.name} -> {task.task_name}")

                except Exception as e:
                    logger.error(f"  ✗ Failed to load task {task.name}: {e}")

    except Exception as e:
        logger.error(f"Failed to load beat schedule from database: {e}")

    return beat_schedule


# Global variable to store the schedule
_beat_schedule_cache = None


def get_beat_schedule() -> Dict[str, Dict[str, Any]]:
    """
    Récupère le schedule Celery Beat (avec cache).
    """
    global _beat_schedule_cache

    if _beat_schedule_cache is None:
        _beat_schedule_cache = load_beat_schedule()

    return _beat_schedule_cache


def reload_beat_schedule():
    """
    Force le rechargement du schedule depuis la base de données.
    """
    global _beat_schedule_cache
    _beat_schedule_cache = None

    # Reload immediately
    schedule = load_beat_schedule()
    _beat_schedule_cache = schedule

    logger.info(f"🔄 Beat schedule reloaded: {len(schedule)} tasks")

    return schedule


def update_task_stats(task_id: str, success: bool, error: str = None):
    """
    Met à jour les statistiques d'une tâche après exécution.

    Args:
        task_id: ID de la tâche planifiée
        success: True si l'exécution a réussi
        error: Message d'erreur si échec
    """
    from datetime import datetime

    try:
        with Session(engine) as session:
            task = session.get(ScheduledTask, task_id)

            if task:
                task.total_run_count += 1
                task.last_run_at = datetime.utcnow()
                task.last_run_success = success
                task.last_run_error = error if not success else None

                session.add(task)
                session.commit()

    except Exception as e:
        logger.error(f"Failed to update task stats for {task_id}: {e}")
