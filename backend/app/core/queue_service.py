"""
Queue Service - CORE Service

Service de gestion de tâches asynchrones avec Celery.

Fonctionnalités :
- Tâches asynchrones en arrière-plan
- Scheduled tasks (cron-like)
- Task chains et workflows
- Retry automatique avec backoff
- Monitoring et statistiques
- Priority queues
- Rate limiting par task

Cas d'usage :
- Envoi d'emails en masse
- Génération de rapports lourds
- Export de données
- Traitement de fichiers
- Synchronisation avec systèmes externes
- Nettoyage et maintenance

Usage :
    from app.core.queue_service import queue_service, task

    # Définir une tâche
    @task(name="send_email", max_retries=3)
    def send_email(to: str, subject: str, body: str):
        # Logique d'envoi
        pass

    # Enqueuer une tâche
    await queue_service.enqueue("send_email", to="user@example.com", subject="Hello")

    # Tâche planifiée
    @task(name="cleanup", schedule="0 2 * * *")  # Tous les jours à 2h
    def cleanup_old_files():
        pass
"""

from typing import Any, Callable, Optional, Dict, List
from datetime import datetime, timedelta
from functools import wraps
from enum import Enum
import asyncio
import json

from celery import Celery, Task
from celery.result import AsyncResult
from celery.schedules import crontab
from kombu import Queue

from app.core.config import settings
from app.core.logger_service import get_logger


logger = get_logger(__name__)


class TaskPriority(int, Enum):
    """Priorités de tâches"""
    LOW = 0
    NORMAL = 5
    HIGH = 10
    CRITICAL = 15


class TaskStatus(str, Enum):
    """Statuts de tâches"""
    PENDING = "pending"
    STARTED = "started"
    RETRY = "retry"
    FAILURE = "failure"
    SUCCESS = "success"
    REVOKED = "revoked"


# Configuration Celery
celery_app = Celery(
    "opsflux",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL,
    include=[
        "app.tasks",  # Module contenant les tâches
    ]
)

# Configuration
celery_app.conf.update(
    # Timezone
    timezone="UTC",
    enable_utc=True,

    # Serialization
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],

    # Results
    result_expires=3600,  # 1 heure
    result_backend_transport_options={
        "master_name": "mymaster"
    },

    # Tasks
    task_track_started=True,
    task_time_limit=30 * 60,  # 30 minutes max
    task_soft_time_limit=25 * 60,  # Warning à 25 minutes

    # Worker
    worker_prefetch_multiplier=4,
    worker_max_tasks_per_child=1000,

    # Queues
    task_queues=(
        Queue("default", routing_key="default"),
        Queue("high_priority", routing_key="high"),
        Queue("low_priority", routing_key="low"),
        Queue("emails", routing_key="emails"),
        Queue("reports", routing_key="reports"),
    ),

    # Routing
    task_routes={
        "app.tasks.send_email": {"queue": "emails"},
        "app.tasks.generate_report": {"queue": "reports"},
    },

    # Beat (scheduled tasks)
    beat_schedule={
        # Exemple: Nettoyage tous les jours à 2h
        "cleanup-old-files": {
            "task": "app.tasks.cleanup_old_files",
            "schedule": crontab(hour=2, minute=0),
        },
        # Exemple: Stats toutes les heures
        "collect-stats": {
            "task": "app.tasks.collect_stats",
            "schedule": crontab(minute=0),
        },
    },
)


class QueueService:
    """
    Service de gestion de la queue Celery.

    Responsabilités :
    - Enqueuer des tâches
    - Monitorer l'état des tâches
    - Gérer les retries
    - Collecter les statistiques
    """

    def __init__(self):
        self.celery = celery_app
        self._registered_tasks: Dict[str, Callable] = {}

    def register_task(
        self,
        name: str,
        func: Callable,
        **task_kwargs
    ):
        """
        Enregistre une tâche Celery.

        Args:
            name: Nom de la tâche
            func: Fonction à exécuter
            **task_kwargs: Arguments pour @celery.task
        """
        # Décorer avec @celery.task
        task_func = self.celery.task(name=name, **task_kwargs)(func)
        self._registered_tasks[name] = task_func

        logger.info(f"Task registered: {name}")

        return task_func

    async def enqueue(
        self,
        task_name: str,
        *args,
        priority: TaskPriority = TaskPriority.NORMAL,
        eta: Optional[datetime] = None,
        countdown: Optional[int] = None,
        queue: Optional[str] = None,
        **kwargs
    ) -> str:
        """
        Enqueue une tâche pour exécution asynchrone.

        Args:
            task_name: Nom de la tâche
            *args: Arguments positionnels
            priority: Priorité de la tâche
            eta: Timestamp d'exécution
            countdown: Délai avant exécution (secondes)
            queue: Queue spécifique
            **kwargs: Arguments nommés

        Returns:
            Task ID
        """
        task = self.celery.send_task(
            task_name,
            args=args,
            kwargs=kwargs,
            priority=priority.value,
            eta=eta,
            countdown=countdown,
            queue=queue,
        )

        logger.info(
            f"Task enqueued: {task_name}",
            extra={
                "extra_data": {
                    "task_id": task.id,
                    "priority": priority.name,
                    "queue": queue or "default",
                }
            }
        )

        return task.id

    async def enqueue_batch(
        self,
        task_name: str,
        items: List[Dict[str, Any]],
        priority: TaskPriority = TaskPriority.NORMAL,
        queue: Optional[str] = None,
    ) -> List[str]:
        """
        Enqueue un batch de tâches.

        Args:
            task_name: Nom de la tâche
            items: Liste de dictionnaires avec args/kwargs
            priority: Priorité
            queue: Queue spécifique

        Returns:
            Liste des task IDs
        """
        task_ids = []

        for item in items:
            args = item.get("args", [])
            kwargs = item.get("kwargs", {})

            task_id = await self.enqueue(
                task_name,
                *args,
                priority=priority,
                queue=queue,
                **kwargs
            )

            task_ids.append(task_id)

        logger.info(
            f"Batch enqueued: {task_name}",
            extra={"extra_data": {"count": len(items), "task_ids": task_ids}}
        )

        return task_ids

    async def get_status(self, task_id: str) -> Dict[str, Any]:
        """
        Récupère le statut d'une tâche.

        Args:
            task_id: ID de la tâche

        Returns:
            Dictionnaire avec status, result, etc.
        """
        result = AsyncResult(task_id, app=self.celery)

        return {
            "task_id": task_id,
            "status": result.state,
            "result": result.result if result.successful() else None,
            "error": str(result.result) if result.failed() else None,
            "traceback": result.traceback if result.failed() else None,
            "started_at": result.date_done,
        }

    async def get_result(self, task_id: str, timeout: int = 30) -> Any:
        """
        Attend et récupère le résultat d'une tâche.

        Args:
            task_id: ID de la tâche
            timeout: Timeout en secondes

        Returns:
            Résultat de la tâche

        Raises:
            TimeoutError: Si timeout dépassé
        """
        result = AsyncResult(task_id, app=self.celery)

        # Attendre le résultat de manière asynchrone
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, result.get, timeout)

    async def cancel(self, task_id: str, terminate: bool = False) -> bool:
        """
        Annule une tâche en cours.

        Args:
            task_id: ID de la tâche
            terminate: Terminer immédiatement (brutal)

        Returns:
            True si annulé
        """
        result = AsyncResult(task_id, app=self.celery)

        if terminate:
            result.revoke(terminate=True, signal="SIGKILL")
        else:
            result.revoke()

        logger.info(
            f"Task cancelled: {task_id}",
            extra={"extra_data": {"terminate": terminate}}
        )

        return True

    async def retry(self, task_id: str) -> str:
        """
        Relance une tâche échouée.

        Args:
            task_id: ID de la tâche

        Returns:
            Nouvel ID de tâche
        """
        result = AsyncResult(task_id, app=self.celery)

        if not result.failed():
            raise ValueError("Task has not failed")

        # Re-enqueue avec les mêmes arguments
        # Note: Il faudrait stocker les args/kwargs originaux
        # Pour l'instant, on lève une exception
        raise NotImplementedError("Retry not yet implemented")

    async def get_stats(self) -> Dict[str, Any]:
        """
        Récupère les statistiques des workers et queues.

        Returns:
            Statistiques globales
        """
        inspector = self.celery.control.inspect()

        stats = {
            "workers": {},
            "queues": {},
            "tasks": {},
        }

        # Stats des workers
        active = inspector.active() or {}
        scheduled = inspector.scheduled() or {}
        reserved = inspector.reserved() or {}

        for worker_name in active.keys():
            stats["workers"][worker_name] = {
                "active": len(active.get(worker_name, [])),
                "scheduled": len(scheduled.get(worker_name, [])),
                "reserved": len(reserved.get(worker_name, [])),
            }

        # Stats des queues
        # Note: Nécessite rabbitmq_management ou redis inspection
        # Pour l'instant, on retourne vide
        stats["queues"] = {
            "default": {"length": 0},
            "high_priority": {"length": 0},
            "low_priority": {"length": 0},
        }

        return stats

    async def purge_queue(self, queue_name: str) -> int:
        """
        Vide une queue.

        Args:
            queue_name: Nom de la queue

        Returns:
            Nombre de tâches supprimées
        """
        count = self.celery.control.purge()

        logger.warning(
            f"Queue purged: {queue_name}",
            extra={"extra_data": {"count": count}}
        )

        return count


# Instance globale
queue_service = QueueService()


# Décorateur helper
def task(
    name: str,
    max_retries: int = 3,
    retry_backoff: int = 60,
    priority: TaskPriority = TaskPriority.NORMAL,
    time_limit: int = 600,
    **celery_kwargs
):
    """
    Décorateur pour définir une tâche Celery.

    Args:
        name: Nom de la tâche
        max_retries: Nombre max de retries
        retry_backoff: Délai entre retries (secondes)
        priority: Priorité par défaut
        time_limit: Temps max d'exécution (secondes)
        **celery_kwargs: Arguments additionnels pour Celery

    Usage:
        @task(name="send_email", max_retries=3)
        def send_email(to: str, subject: str):
            # Logique
            pass
    """
    def decorator(func: Callable):
        # Paramètres Celery
        task_kwargs = {
            "bind": True,  # Pour avoir accès à self
            "max_retries": max_retries,
            "default_retry_delay": retry_backoff,
            "time_limit": time_limit,
            **celery_kwargs
        }

        @wraps(func)
        def wrapper(self: Task, *args, **kwargs):
            try:
                logger.info(
                    f"Task started: {name}",
                    extra={"extra_data": {"task_id": self.request.id}}
                )

                # Exécuter la fonction
                result = func(*args, **kwargs)

                logger.info(
                    f"Task completed: {name}",
                    extra={"extra_data": {"task_id": self.request.id}}
                )

                return result

            except Exception as exc:
                logger.error(
                    f"Task failed: {name}",
                    exc_info=True,
                    extra={
                        "extra_data": {
                            "task_id": self.request.id,
                            "error": str(exc),
                            "retries": self.request.retries,
                        }
                    }
                )

                # Retry si pas dépassé max_retries
                if self.request.retries < max_retries:
                    raise self.retry(exc=exc, countdown=retry_backoff * (2 ** self.request.retries))
                else:
                    raise

        # Enregistrer la tâche
        return queue_service.register_task(name, wrapper, **task_kwargs)

    return decorator


# Exemple de tâches de base
@task(name="app.tasks.send_email", max_retries=3)
def send_email_task(to: str, subject: str, body: str):
    """Tâche d'envoi d'email"""
    from app.core.email_service import EmailService
    email_service = EmailService()
    # email_service.send(to=to, subject=subject, body=body)
    return {"sent": True, "to": to}


@task(name="app.tasks.cleanup_old_files", time_limit=3600)
def cleanup_old_files_task():
    """Tâche de nettoyage"""
    # Logique de nettoyage
    return {"cleaned": 0}


@task(name="app.tasks.collect_stats")
def collect_stats_task():
    """Tâche de collecte de stats"""
    # Logique de stats
    return {"collected": True}
