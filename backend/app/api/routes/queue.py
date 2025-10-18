"""
Routes API pour le Queue Service (Celery).
"""

from typing import Any, Optional, List, Dict
from fastapi import APIRouter, Depends, HTTPException, Body

from app.api.deps import CurrentUser, get_current_active_superuser
from app.core.queue_service import queue_service, TaskPriority
from app.models import User


router = APIRouter(prefix="/queue", tags=["queue"])


@router.post("/enqueue")
async def enqueue_task(
    current_user: CurrentUser,
    task_name: str = Body(..., description="Nom de la tâche"),
    args: List[Any] = Body(default=[], description="Arguments positionnels"),
    kwargs: Dict[str, Any] = Body(default={}, description="Arguments nommés"),
    priority: TaskPriority = Body(default=TaskPriority.NORMAL, description="Priorité"),
    countdown: Optional[int] = Body(None, description="Délai avant exécution (secondes)"),
    queue: Optional[str] = Body(None, description="Queue spécifique"),
    _: User = Depends(get_current_active_superuser),
) -> Any:
    """
    Enqueue une tâche pour exécution asynchrone.

    Requiert les privilèges superuser.
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

        return {
            "success": True,
            "task_id": task_id,
            "task_name": task_name,
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to enqueue task: {str(e)}")


@router.get("/status/{task_id}")
async def get_task_status(
    task_id: str,
    current_user: CurrentUser,
    _: User = Depends(get_current_active_superuser),
) -> Any:
    """
    Récupère le statut d'une tâche.

    Requiert les privilèges superuser.
    """
    status = await queue_service.get_status(task_id)
    return status


@router.get("/result/{task_id}")
async def get_task_result(
    task_id: str,
    timeout: int = 30,
    current_user: CurrentUser = None,
    _: User = Depends(get_current_active_superuser),
) -> Any:
    """
    Attend et récupère le résultat d'une tâche.

    Args:
        task_id: ID de la tâche
        timeout: Timeout en secondes

    Requiert les privilèges superuser.
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
async def cancel_task(
    task_id: str,
    terminate: bool = Body(default=False, description="Terminer brutalement"),
    current_user: CurrentUser = None,
    _: User = Depends(get_current_active_superuser),
) -> Any:
    """
    Annule une tâche en cours.

    Requiert les privilèges superuser.
    """
    success = await queue_service.cancel(task_id, terminate=terminate)

    return {
        "success": success,
        "task_id": task_id,
        "terminated": terminate,
    }


@router.get("/stats")
async def get_queue_stats(
    current_user: CurrentUser,
    _: User = Depends(get_current_active_superuser),
) -> Any:
    """
    Récupère les statistiques des workers et queues.

    Requiert les privilèges superuser.
    """
    stats = await queue_service.get_stats()
    return stats


@router.post("/purge/{queue_name}")
async def purge_queue(
    queue_name: str,
    current_user: CurrentUser,
    _: User = Depends(get_current_active_superuser),
) -> Any:
    """
    Vide une queue.

    ATTENTION: Opération destructive!

    Requiert les privilèges superuser.
    """
    count = await queue_service.purge_queue(queue_name)

    return {
        "success": True,
        "queue": queue_name,
        "tasks_deleted": count,
    }
