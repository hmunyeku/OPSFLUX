"""
Routes API pour le Queue Service (Celery).
"""

from typing import Any, Optional, List, Dict
from fastapi import APIRouter, Depends, HTTPException, Body

from app.api.deps import CurrentUser, SessionDep
from app.core.queue_service import queue_service, TaskPriority
from app.core.rbac import require_permission
from app.core.hook_trigger_service import hook_trigger
from app.models import User


router = APIRouter(prefix="/queue", tags=["queue"])


@router.post("/enqueue")
@require_permission("core.queue.enqueue")
async def enqueue_task(
    current_user: CurrentUser,
    session: SessionDep,
    task_name: str = Body(..., description="Nom de la tâche"),
    args: List[Any] = Body(default=[], description="Arguments positionnels"),
    kwargs: Dict[str, Any] = Body(default={}, description="Arguments nommés"),
    priority: TaskPriority = Body(default=TaskPriority.NORMAL, description="Priorité"),
    countdown: Optional[int] = Body(None, description="Délai avant exécution (secondes)"),
    queue: Optional[str] = Body(None, description="Queue spécifique"),
) -> Any:
    """
    Enqueue une tâche pour exécution asynchrone.

    Requiert la permission: core.queue.enqueue
    """
    try:
        task_id = await queue_service.enqueue(
            task_name,
            *args,
            priority=priority,
            countdown=countdown,
            queue=queue,
            **kwargs
        )

        # Trigger hook: queue.task_enqueued
        try:
            await hook_trigger.trigger_event(
                event="queue.task_enqueued",
                context={
                    "user_id": str(current_user.id),
                    "task_id": task_id,
                    "task_name": task_name,
                    "priority": priority.value if priority else "normal",
                    "queue": queue or "default",
                    "countdown": countdown,
                },
                db=session,
            )
        except Exception as e:
            import logging
            logging.getLogger(__name__).warning(f"Failed to trigger queue.task_enqueued hook: {e}")

        return {
            "success": True,
            "task_id": task_id,
            "task_name": task_name,
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to enqueue task: {str(e)}")


@router.get("/status/{task_id}")
@require_permission("core.queue.read")
async def get_task_status(
    task_id: str,
    current_user: CurrentUser,
    session: SessionDep,
) -> Any:
    """
    Récupère le statut d'une tâche.

    Requiert la permission: core.queue.read
    """
    status = await queue_service.get_status(task_id)
    return status


@router.get("/result/{task_id}")
@require_permission("core.queue.read")
async def get_task_result(
    task_id: str,
    current_user: CurrentUser,
    session: SessionDep,
    timeout: int = 30,
) -> Any:
    """
    Attend et récupère le résultat d'une tâche.

    Args:
        task_id: ID de la tâche
        timeout: Timeout en secondes

    Requiert la permission: core.queue.read
    """
    try:
        result = await queue_service.get_result(task_id, timeout=timeout)
        return {
            "task_id": task_id,
            "result": result,
        }

    except TimeoutError:
        raise HTTPException(status_code=408, detail="Task execution timeout")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/cancel/{task_id}")
@require_permission("core.queue.cancel")
async def cancel_task(
    task_id: str,
    current_user: CurrentUser,
    session: SessionDep,
    terminate: bool = Body(default=False, description="Terminer brutalement"),
) -> Any:
    """
    Annule une tâche en cours.

    Requiert la permission: core.queue.cancel
    """
    success = await queue_service.cancel(task_id, terminate=terminate)

    # Trigger hook: queue.task_cancelled
    if success:
        try:
            await hook_trigger.trigger_event(
                event="queue.task_cancelled",
                context={
                    "user_id": str(current_user.id),
                    "task_id": task_id,
                    "terminated": terminate,
                    "cancelled_by": str(current_user.id),
                },
                db=session,
            )
        except Exception as e:
            import logging
            logging.getLogger(__name__).warning(f"Failed to trigger queue.task_cancelled hook: {e}")

    return {
        "success": success,
        "task_id": task_id,
        "terminated": terminate,
    }


@router.get("/stats")
@require_permission("core.queue.read")
async def get_queue_stats(
    current_user: CurrentUser,
    session: SessionDep,
) -> Any:
    """
    Récupère les statistiques des workers et queues.

    Requiert la permission: core.queue.read
    """
    stats = await queue_service.get_stats()
    return stats


@router.post("/purge/{queue_name}")
@require_permission("core.queue.purge")
async def purge_queue(
    queue_name: str,
    current_user: CurrentUser,
    session: SessionDep,
) -> Any:
    """
    Vide une queue.

    ATTENTION: Opération destructive!

    Requiert la permission: core.queue.purge
    """
    count = await queue_service.purge_queue(queue_name)

    # Trigger hook: queue.queue_purged
    try:
        await hook_trigger.trigger_event(
            event="queue.queue_purged",
            context={
                "user_id": str(current_user.id),
                "queue_name": queue_name,
                "tasks_deleted": count,
                "purged_by": str(current_user.id),
            },
            db=session,
        )
    except Exception as e:
        import logging
        logging.getLogger(__name__).warning(f"Failed to trigger queue.queue_purged hook: {e}")

    return {
        "success": True,
        "queue": queue_name,
        "tasks_deleted": count,
    }
