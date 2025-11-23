"""
Projects API routes for OpsFlux.
Provides CRUD operations for projects and tasks, including Gantt view data.
"""
import uuid
from typing import Any
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import select, func, col, Session

from app.api.deps import get_db, CurrentUser
from app.models_projects import (
    Project, ProjectCreate, ProjectUpdate, ProjectPublic, ProjectsPublic,
    ProjectTask, ProjectTaskCreate, ProjectTaskUpdate, ProjectTaskPublic, ProjectTasksPublic,
    ProjectWithTasks, GanttData
)
from app.models import User

router = APIRouter(prefix="/projects", tags=["Projects"])


# ============================================================================
# PROJECT ROUTES
# ============================================================================

@router.get("/", response_model=ProjectsPublic)
def list_projects(
    db: Session = Depends(get_db),
    current_user: CurrentUser = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    status: str | None = None,
    is_archived: bool = False,
    search: str | None = None,
):
    """List all projects with optional filters."""
    query = select(Project).where(Project.deleted_at.is_(None))

    if not is_archived:
        query = query.where(Project.is_archived == False)

    if status:
        query = query.where(Project.status == status)

    if search:
        query = query.where(
            (col(Project.name).ilike(f"%{search}%")) |
            (col(Project.code).ilike(f"%{search}%"))
        )

    # Count total
    count_query = select(func.count()).select_from(query.subquery())
    total = db.execute(count_query).scalar() or 0

    # Get paginated results
    query = query.offset(skip).limit(limit).order_by(Project.created_at.desc())
    result = db.execute(query)
    projects = result.scalars().all()

    # Enrich with task counts
    project_data = []
    for project in projects:
        # Count tasks
        task_count_query = select(func.count()).where(
            ProjectTask.project_id == project.id,
            ProjectTask.deleted_at.is_(None)
        )
        total_tasks = db.execute(task_count_query).scalar() or 0

        completed_count_query = select(func.count()).where(
            ProjectTask.project_id == project.id,
            ProjectTask.deleted_at.is_(None),
            ProjectTask.status == "done"
        )
        completed_tasks = db.execute(completed_count_query).scalar() or 0

        project_dict = project.model_dump()
        project_dict["total_tasks"] = total_tasks
        project_dict["completed_tasks"] = completed_tasks
        project_data.append(ProjectPublic(**project_dict))

    return ProjectsPublic(data=project_data, count=total)


@router.post("/", response_model=ProjectPublic)
def create_project(
    project_in: ProjectCreate,
    db: Session = Depends(get_db),
    current_user: CurrentUser = None,
):
    """Create a new project."""
    # Check if code already exists
    existing = db.execute(
        select(Project).where(Project.code == project_in.code)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Project code already exists")

    project = Project(
        **project_in.model_dump(),
        created_by_id=current_user.id if current_user else None
    )
    db.add(project)
    db.commit()
    db.refresh(project)

    return ProjectPublic(**project.model_dump(), total_tasks=0, completed_tasks=0)


@router.get("/{project_id}", response_model=ProjectWithTasks)
def get_project(
    project_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: CurrentUser = None,
):
    """Get a project by ID with all its tasks."""
    result = db.execute(
        select(Project).where(Project.id == project_id, Project.deleted_at.is_(None))
    )
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Get tasks
    tasks_result = db.execute(
        select(ProjectTask)
        .where(ProjectTask.project_id == project_id, ProjectTask.deleted_at.is_(None))
        .order_by(ProjectTask.sort_order, ProjectTask.start_date)
    )
    tasks = tasks_result.scalars().all()

    # Enrich tasks with assignee names
    tasks_public = []
    for task in tasks:
        task_dict = task.model_dump()
        if task.assignee_id:
            assignee_result = db.execute(
                select(User).where(User.id == task.assignee_id)
            )
            assignee = assignee_result.scalar_one_or_none()
            task_dict["assignee_name"] = assignee.full_name if assignee else None
        tasks_public.append(ProjectTaskPublic(**task_dict))

    # Get manager name
    manager_name = None
    if project.manager_id:
        manager_result = db.execute(
            select(User).where(User.id == project.manager_id)
        )
        manager = manager_result.scalar_one_or_none()
        manager_name = manager.full_name if manager else None

    # Count tasks
    total_tasks = len(tasks)
    completed_tasks = len([t for t in tasks if t.status == "done"])

    return ProjectWithTasks(
        **project.model_dump(),
        tasks=tasks_public,
        total_tasks=total_tasks,
        completed_tasks=completed_tasks,
        manager_name=manager_name
    )


@router.patch("/{project_id}", response_model=ProjectPublic)
def update_project(
    project_id: uuid.UUID,
    project_in: ProjectUpdate,
    db: Session = Depends(get_db),
    current_user: CurrentUser = None,
):
    """Update a project."""
    result = db.execute(
        select(Project).where(Project.id == project_id, Project.deleted_at.is_(None))
    )
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    update_data = project_in.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(project, field, value)

    project.updated_at = datetime.utcnow()
    project.updated_by_id = current_user.id if current_user else None

    db.commit()
    db.refresh(project)

    return ProjectPublic(**project.model_dump(), total_tasks=0, completed_tasks=0)


@router.delete("/{project_id}")
def delete_project(
    project_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: CurrentUser = None,
):
    """Soft delete a project."""
    result = db.execute(
        select(Project).where(Project.id == project_id, Project.deleted_at.is_(None))
    )
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    project.deleted_at = datetime.utcnow()
    project.deleted_by_id = current_user.id if current_user else None

    db.commit()

    return {"message": "Project deleted successfully"}


# ============================================================================
# GANTT VIEW
# ============================================================================

@router.get("/gantt/data", response_model=GanttData)
def get_gantt_data(
    db: Session = Depends(get_db),
    current_user: CurrentUser = None,
    status: str | None = None,
):
    """Get all projects with their tasks for Gantt chart."""
    query = select(Project).where(
        Project.deleted_at.is_(None),
        Project.is_archived == False
    )

    if status:
        query = query.where(Project.status == status)

    query = query.order_by(Project.start_date, Project.name)
    result = db.execute(query)
    projects = result.scalars().all()

    projects_with_tasks = []
    total_tasks = 0

    for project in projects:
        # Get tasks for this project
        tasks_result = db.execute(
            select(ProjectTask)
            .where(ProjectTask.project_id == project.id, ProjectTask.deleted_at.is_(None))
            .order_by(ProjectTask.sort_order, ProjectTask.start_date)
        )
        tasks = tasks_result.scalars().all()

        # Enrich tasks with assignee names
        tasks_public = []
        for task in tasks:
            task_dict = task.model_dump(exclude={"project", "assignee", "parent_task"})
            if task.assignee_id:
                assignee_result = db.execute(
                    select(User).where(User.id == task.assignee_id)
                )
                assignee = assignee_result.scalar_one_or_none()
                task_dict["assignee_name"] = assignee.full_name if assignee else None
            tasks_public.append(ProjectTaskPublic(**task_dict))

        total_tasks += len(tasks)

        # Get manager name
        manager_name = None
        if project.manager_id:
            manager_result = db.execute(
                select(User).where(User.id == project.manager_id)
            )
            manager = manager_result.scalar_one_or_none()
            manager_name = manager.full_name if manager else None

        completed_tasks = len([t for t in tasks if t.status == "done"])

        project_dict = project.model_dump(exclude={"manager", "tasks"})
        projects_with_tasks.append(ProjectWithTasks(
            **project_dict,
            tasks=tasks_public,
            total_tasks=len(tasks),
            completed_tasks=completed_tasks,
            manager_name=manager_name
        ))

    return GanttData(
        projects=projects_with_tasks,
        total_projects=len(projects),
        total_tasks=total_tasks
    )


# ============================================================================
# PROJECT TASK ROUTES
# ============================================================================

@router.get("/{project_id}/tasks", response_model=ProjectTasksPublic)
def list_project_tasks(
    project_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: CurrentUser = None,
    status: str | None = None,
):
    """List all tasks for a project."""
    # Verify project exists
    project_result = db.execute(
        select(Project).where(Project.id == project_id, Project.deleted_at.is_(None))
    )
    if not project_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Project not found")

    query = select(ProjectTask).where(
        ProjectTask.project_id == project_id,
        ProjectTask.deleted_at.is_(None)
    )

    if status:
        query = query.where(ProjectTask.status == status)

    query = query.order_by(ProjectTask.sort_order, ProjectTask.start_date)
    result = db.execute(query)
    tasks = result.scalars().all()

    # Enrich with assignee names
    tasks_public = []
    for task in tasks:
        task_dict = task.model_dump()
        if task.assignee_id:
            assignee_result = db.execute(
                select(User).where(User.id == task.assignee_id)
            )
            assignee = assignee_result.scalar_one_or_none()
            task_dict["assignee_name"] = assignee.full_name if assignee else None
        tasks_public.append(ProjectTaskPublic(**task_dict))

    return ProjectTasksPublic(data=tasks_public, count=len(tasks))


@router.post("/{project_id}/tasks", response_model=ProjectTaskPublic)
def create_project_task(
    project_id: uuid.UUID,
    task_in: ProjectTaskCreate,
    db: Session = Depends(get_db),
    current_user: CurrentUser = None,
):
    """Create a new task in a project."""
    # Verify project exists
    project_result = db.execute(
        select(Project).where(Project.id == project_id, Project.deleted_at.is_(None))
    )
    if not project_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Project not found")

    # Get max sort_order
    max_order_result = db.execute(
        select(func.max(ProjectTask.sort_order)).where(ProjectTask.project_id == project_id)
    )
    max_order = max_order_result.scalar() or 0

    task = ProjectTask(
        **task_in.model_dump(exclude={"project_id"}),
        project_id=project_id,
        sort_order=max_order + 1,
        created_by_id=current_user.id if current_user else None
    )
    db.add(task)
    db.commit()
    db.refresh(task)

    return ProjectTaskPublic(**task.model_dump())


@router.patch("/tasks/{task_id}", response_model=ProjectTaskPublic)
def update_project_task(
    task_id: uuid.UUID,
    task_in: ProjectTaskUpdate,
    db: Session = Depends(get_db),
    current_user: CurrentUser = None,
):
    """Update a project task."""
    result = db.execute(
        select(ProjectTask).where(ProjectTask.id == task_id, ProjectTask.deleted_at.is_(None))
    )
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    update_data = task_in.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(task, field, value)

    task.updated_at = datetime.utcnow()
    task.updated_by_id = current_user.id if current_user else None

    db.commit()
    db.refresh(task)

    # Get assignee name
    assignee_name = None
    if task.assignee_id:
        assignee_result = db.execute(
            select(User).where(User.id == task.assignee_id)
        )
        assignee = assignee_result.scalar_one_or_none()
        assignee_name = assignee.full_name if assignee else None

    task_dict = task.model_dump()
    task_dict["assignee_name"] = assignee_name
    return ProjectTaskPublic(**task_dict)


@router.delete("/tasks/{task_id}")
def delete_project_task(
    task_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: CurrentUser = None,
):
    """Soft delete a project task."""
    result = db.execute(
        select(ProjectTask).where(ProjectTask.id == task_id, ProjectTask.deleted_at.is_(None))
    )
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    task.deleted_at = datetime.utcnow()
    task.deleted_by_id = current_user.id if current_user else None

    db.commit()

    return {"message": "Task deleted successfully"}
