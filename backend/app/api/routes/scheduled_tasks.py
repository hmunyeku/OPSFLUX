"""
Routes API pour la gestion des tâches planifiées (Celery Beat)
"""

from typing import Any, List
from uuid import UUID
from fastapi import APIRouter, HTTPException, Depends
from sqlmodel import select, func

from app.api.deps import CurrentUser, SessionDep
from app.models_scheduled_tasks import (
    ScheduledTask,
    ScheduledTaskCreate,
    ScheduledTaskUpdate,
    ScheduledTaskPublic,
    ScheduledTasksResponse,
    TaskExecutionLog,
    TaskExecutionLogPublic,
    TaskExecutionLogsResponse,
)
from app.core.rbac import require_permission
from app.core.hook_trigger_service import hook_trigger
from datetime import datetime

router = APIRouter(prefix="/scheduled-tasks", tags=["scheduled-tasks"])


@router.get("")
@require_permission("core.scheduled_tasks.read")
async def list_scheduled_tasks(
    session: SessionDep,
    current_user: CurrentUser,
    skip: int = 0,
    limit: int = 100,
    include_inactive: bool = False,
) -> ScheduledTasksResponse:
    """
    Liste toutes les tâches planifiées.

    Requiert la permission: core.scheduled_tasks.read
    """
    statement = select(ScheduledTask).where(ScheduledTask.deleted_at == None)

    if not include_inactive:
        statement = statement.where(ScheduledTask.is_active == True)

    statement = statement.offset(skip).limit(limit)

    tasks = session.exec(statement).all()

    # Count total
    count_statement = select(func.count()).select_from(ScheduledTask).where(ScheduledTask.deleted_at == None)
    if not include_inactive:
        count_statement = count_statement.where(ScheduledTask.is_active == True)

    total = session.exec(count_statement).one()

    return ScheduledTasksResponse(
        count=total,
        data=[ScheduledTaskPublic.model_validate(task) for task in tasks]
    )


@router.get("/available-tasks")
@require_permission("core.scheduled_tasks.read")
async def get_available_tasks(
    session: SessionDep,
    current_user: CurrentUser,
) -> List[str]:
    """
    Récupère la liste des tâches Celery disponibles (CORE + modules actifs).

    Requiert la permission: core.scheduled_tasks.read

    Returns:
        Liste des noms de tâches disponibles triée par ordre alphabétique
    """
    from app.core.queue_service import celery_app
    from app.core.module_loader import ModuleLoader
    from app.models_modules import Module, ModuleStatus

    try:
        tasks = []

        # Récupérer les tâches réellement enregistrées dans les workers Celery
        inspector = celery_app.control.inspect()
        registered_tasks_by_worker = inspector.registered()

        if registered_tasks_by_worker:
            # Collecter toutes les tâches de tous les workers
            for worker_tasks in registered_tasks_by_worker.values():
                tasks.extend([
                    name for name in worker_tasks
                    if not name.startswith('celery.')
                ])

        # Si aucun worker n'est disponible, fallback sur les tâches CORE connues
        if not tasks:
            tasks = [
                'app.tasks.send_email',
                'app.tasks.cleanup_old_files',
                'app.tasks.collect_stats',
                'app.tasks.execute_scheduled_backups',
            ]

        # Charger les tâches des modules actifs
        statement = select(Module).where(
            Module.status == ModuleStatus.ACTIVE,
            Module.deleted_at == None
        )
        active_modules = session.exec(statement).all()

        for module in active_modules:
            module_tasks = ModuleLoader.load_module_tasks(module.code)
            tasks.extend(module_tasks)

        return sorted(list(set(tasks)))  # Dédupliquer et trier

    except Exception as e:
        import logging
        logging.getLogger(__name__).error(f"Failed to load available tasks: {e}")
        # Fallback: tâches CORE minimales
        return [
            'app.tasks.send_email',
            'app.tasks.cleanup_old_files',
            'app.tasks.collect_stats',
            'app.tasks.execute_scheduled_backups',
        ]


@router.get("/{task_id}")
@require_permission("core.scheduled_tasks.read")
async def get_scheduled_task(
    task_id: UUID,
    session: SessionDep,
    current_user: CurrentUser,
) -> ScheduledTaskPublic:
    """
    Récupère une tâche planifiée par son ID.

    Requiert la permission: core.scheduled_tasks.read
    """
    task = session.get(ScheduledTask, task_id)

    if not task or task.deleted_at:
        raise HTTPException(status_code=404, detail="Scheduled task not found")

    return ScheduledTaskPublic.model_validate(task)


@router.post("")
@require_permission("core.scheduled_tasks.create")
async def create_scheduled_task(
    task_data: ScheduledTaskCreate,
    session: SessionDep,
    current_user: CurrentUser,
) -> ScheduledTaskPublic:
    """
    Crée une nouvelle tâche planifiée.

    Requiert la permission: core.scheduled_tasks.create
    """
    # Check if name already exists
    existing = session.exec(
        select(ScheduledTask).where(
            ScheduledTask.name == task_data.name,
            ScheduledTask.deleted_at == None
        )
    ).first()

    if existing:
        raise HTTPException(status_code=400, detail="A task with this name already exists")

    # Validate schedule configuration
    if task_data.schedule_type == "interval" and not task_data.interval_value:
        raise HTTPException(status_code=400, detail="interval_value is required for interval schedule")

    task = ScheduledTask.model_validate(
        task_data.model_dump(),
        update={
            "created_by": current_user.id,
            "updated_by": current_user.id,
        }
    )

    session.add(task)
    session.commit()
    session.refresh(task)

    # Trigger hook
    try:
        await hook_trigger.trigger_event(
            event="scheduled_task.created",
            context={
                "task_id": str(task.id),
                "task_name": task.task_name,
                "created_by": str(current_user.id),
            },
            db=session,
        )
    except Exception as e:
        import logging
        logging.getLogger(__name__).warning(f"Failed to trigger scheduled_task.created hook: {e}")

    # Reload Celery Beat schedule
    from app.core.celery_beat_loader import reload_beat_schedule
    reload_beat_schedule()

    return ScheduledTaskPublic.model_validate(task)


@router.patch("/{task_id}")
@require_permission("core.scheduled_tasks.update")
async def update_scheduled_task(
    task_id: UUID,
    task_data: ScheduledTaskUpdate,
    session: SessionDep,
    current_user: CurrentUser,
) -> ScheduledTaskPublic:
    """
    Met à jour une tâche planifiée.

    Requiert la permission: core.scheduled_tasks.update
    """
    task = session.get(ScheduledTask, task_id)

    if not task or task.deleted_at:
        raise HTTPException(status_code=404, detail="Scheduled task not found")

    # Check name uniqueness if changing name
    if task_data.name and task_data.name != task.name:
        existing = session.exec(
            select(ScheduledTask).where(
                ScheduledTask.name == task_data.name,
                ScheduledTask.deleted_at == None,
                ScheduledTask.id != task_id
            )
        ).first()

        if existing:
            raise HTTPException(status_code=400, detail="A task with this name already exists")

    # Update fields
    update_data = task_data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(task, key, value)

    task.updated_at = datetime.utcnow()
    task.updated_by = current_user.id

    session.add(task)
    session.commit()
    session.refresh(task)

    # Trigger hook
    try:
        await hook_trigger.trigger_event(
            event="scheduled_task.updated",
            context={
                "task_id": str(task.id),
                "task_name": task.task_name,
                "updated_by": str(current_user.id),
            },
            db=session,
        )
    except Exception as e:
        import logging
        logging.getLogger(__name__).warning(f"Failed to trigger scheduled_task.updated hook: {e}")

    # Reload Celery Beat schedule
    from app.core.celery_beat_loader import reload_beat_schedule
    reload_beat_schedule()

    return ScheduledTaskPublic.model_validate(task)


@router.delete("/{task_id}")
@require_permission("core.scheduled_tasks.delete")
async def delete_scheduled_task(
    task_id: UUID,
    session: SessionDep,
    current_user: CurrentUser,
) -> dict:
    """
    Supprime (soft delete) une tâche planifiée.

    Requiert la permission: core.scheduled_tasks.delete
    """
    task = session.get(ScheduledTask, task_id)

    if not task or task.deleted_at:
        raise HTTPException(status_code=404, detail="Scheduled task not found")

    task.deleted_at = datetime.utcnow()
    task.is_active = False
    task.updated_by = current_user.id

    session.add(task)
    session.commit()

    # Trigger hook
    try:
        await hook_trigger.trigger_event(
            event="scheduled_task.deleted",
            context={
                "task_id": str(task.id),
                "task_name": task.task_name,
                "deleted_by": str(current_user.id),
            },
            db=session,
        )
    except Exception as e:
        import logging
        logging.getLogger(__name__).warning(f"Failed to trigger scheduled_task.deleted hook: {e}")

    # Reload Celery Beat schedule
    from app.core.celery_beat_loader import reload_beat_schedule
    reload_beat_schedule()

    return {"success": True, "message": "Scheduled task deleted"}


@router.post("/{task_id}/pause")
@require_permission("core.scheduled_tasks.update")
async def pause_scheduled_task(
    task_id: UUID,
    session: SessionDep,
    current_user: CurrentUser,
) -> ScheduledTaskPublic:
    """
    Met en pause une tâche planifiée.

    Requiert la permission: core.scheduled_tasks.update
    """
    task = session.get(ScheduledTask, task_id)

    if not task or task.deleted_at:
        raise HTTPException(status_code=404, detail="Scheduled task not found")

    task.is_paused = True
    task.updated_at = datetime.utcnow()
    task.updated_by = current_user.id

    session.add(task)
    session.commit()
    session.refresh(task)

    # Reload Celery Beat schedule
    from app.core.celery_beat_loader import reload_beat_schedule
    reload_beat_schedule()

    return ScheduledTaskPublic.model_validate(task)


@router.post("/{task_id}/resume")
@require_permission("core.scheduled_tasks.update")
async def resume_scheduled_task(
    task_id: UUID,
    session: SessionDep,
    current_user: CurrentUser,
) -> ScheduledTaskPublic:
    """
    Reprend l'exécution d'une tâche planifiée en pause.

    Requiert la permission: core.scheduled_tasks.update
    """
    task = session.get(ScheduledTask, task_id)

    if not task or task.deleted_at:
        raise HTTPException(status_code=404, detail="Scheduled task not found")

    task.is_paused = False
    task.updated_at = datetime.utcnow()
    task.updated_by = current_user.id

    session.add(task)
    session.commit()
    session.refresh(task)

    # Reload Celery Beat schedule
    from app.core.celery_beat_loader import reload_beat_schedule
    reload_beat_schedule()

    return ScheduledTaskPublic.model_validate(task)


@router.post("/{task_id}/run-now")
@require_permission("core.scheduled_tasks.execute")
async def run_task_now(
    task_id: UUID,
    session: SessionDep,
    current_user: CurrentUser,
) -> dict:
    """
    Exécute immédiatement une tâche planifiée (sans attendre le schedule).

    Requiert la permission: core.scheduled_tasks.execute
    """
    task = session.get(ScheduledTask, task_id)

    if not task or task.deleted_at:
        raise HTTPException(status_code=404, detail="Scheduled task not found")

    if not task.is_active:
        raise HTTPException(status_code=400, detail="Cannot run inactive task")

    # Enqueue the task immediately
    from app.core.queue_service import celery_app

    try:
        result = celery_app.send_task(
            task.task_name,
            args=task.args,
            kwargs=task.kwargs,
            queue=task.queue,
        )

        # Create execution log
        log = TaskExecutionLog(
            task_id=task_id,
            celery_task_id=result.id,
            started_at=datetime.utcnow(),
            status="pending",
        )
        session.add(log)
        session.commit()

        return {
            "success": True,
            "message": "Task enqueued for immediate execution",
            "celery_task_id": result.id,
            "log_id": str(log.id)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to enqueue task: {str(e)}")


@router.get("/{task_id}/logs")
@require_permission("core.scheduled_tasks.read")
async def get_task_logs(
    task_id: UUID,
    session: SessionDep,
    current_user: CurrentUser,
    skip: int = 0,
    limit: int = 50,
) -> TaskExecutionLogsResponse:
    """
    Récupère l'historique d'exécution d'une tâche planifiée.

    Requiert la permission: core.scheduled_tasks.read
    """
    # Verify task exists
    task = session.get(ScheduledTask, task_id)
    if not task or task.deleted_at:
        raise HTTPException(status_code=404, detail="Scheduled task not found")

    # Get logs
    statement = (
        select(TaskExecutionLog)
        .where(TaskExecutionLog.task_id == task_id)
        .order_by(TaskExecutionLog.started_at.desc())
        .offset(skip)
        .limit(limit)
    )
    logs = session.exec(statement).all()

    # Count total
    count_statement = select(func.count()).select_from(TaskExecutionLog).where(
        TaskExecutionLog.task_id == task_id
    )
    total = session.exec(count_statement).one()

    return TaskExecutionLogsResponse(
        count=total,
        data=[TaskExecutionLogPublic.model_validate(log) for log in logs]
    )
