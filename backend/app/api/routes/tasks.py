import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import func, select

from app.api.deps import CurrentUser, SessionDep
from app.models import Task, TaskCreate, TaskPublic, TasksPublic, TaskUpdate

router = APIRouter(prefix="/tasks", tags=["tasks"])


@router.get("/", response_model=TasksPublic)
def read_tasks(
    session: SessionDep,
    current_user: CurrentUser,
    skip: int = 0,
    limit: int = 100,
) -> Any:
    """
    Retrieve tasks.
    """
    count_statement = select(func.count()).select_from(Task).where(Task.deleted_at.is_(None))
    count = session.exec(count_statement).one()

    statement = (
        select(Task)
        .where(Task.deleted_at.is_(None))
        .offset(skip)
        .limit(limit)
        .order_by(Task.created_at.desc())
    )
    tasks = session.exec(statement).all()

    return TasksPublic(data=tasks, count=count)


@router.post("/", response_model=TaskPublic)
def create_task(
    *, session: SessionDep, current_user: CurrentUser, task_in: TaskCreate
) -> Any:
    """
    Create new task.
    """
    task = Task.model_validate(task_in)
    task.created_by_id = current_user.id
    session.add(task)
    session.commit()
    session.refresh(task)
    return task


@router.get("/{task_id}", response_model=TaskPublic)
def read_task(
    task_id: uuid.UUID, session: SessionDep, current_user: CurrentUser
) -> Any:
    """
    Get task by ID.
    """
    task = session.get(Task, task_id)
    if not task or task.deleted_at is not None:
        raise HTTPException(status_code=404, detail="Task not found")
    return task


@router.patch("/{task_id}", response_model=TaskPublic)
def update_task(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    task_id: uuid.UUID,
    task_in: TaskUpdate,
) -> Any:
    """
    Update a task.
    """
    db_task = session.get(Task, task_id)
    if not db_task or db_task.deleted_at is not None:
        raise HTTPException(status_code=404, detail="Task not found")

    update_dict = task_in.model_dump(exclude_unset=True)
    db_task.sqlmodel_update(update_dict)
    db_task.updated_by_id = current_user.id
    session.add(db_task)
    session.commit()
    session.refresh(db_task)
    return db_task


@router.delete("/{task_id}")
def delete_task(
    session: SessionDep, current_user: CurrentUser, task_id: uuid.UUID
) -> Any:
    """
    Delete a task (soft delete).
    """
    task = session.get(Task, task_id)
    if not task or task.deleted_at is not None:
        raise HTTPException(status_code=404, detail="Task not found")

    # Soft delete
    from datetime import datetime
    task.deleted_at = datetime.now()
    task.deleted_by_id = current_user.id
    session.add(task)
    session.commit()
    return {"message": "Task deleted successfully"}
