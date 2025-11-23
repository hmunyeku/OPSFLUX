"""
Project Management Models for OpsFlux.
Provides Project and ProjectTask models for Gantt chart and project management.
"""
import uuid
from datetime import datetime
from typing import List, Optional
from sqlmodel import Field, Relationship, SQLModel

from app.models import AbstractBaseModel, User


# ============================================================================
# PROJECT MODELS
# ============================================================================

class ProjectBase(SQLModel):
    """Base model for projects"""
    name: str = Field(max_length=255)
    code: str = Field(max_length=50, unique=True)
    description: str | None = Field(default=None, max_length=2000)
    status: str = Field(default="planning", max_length=50)  # planning, in_progress, on_hold, completed, cancelled
    priority: str = Field(default="medium", max_length=50)  # low, medium, high, critical
    health: str = Field(default="on_track", max_length=50)  # on_track, at_risk, off_track

    start_date: datetime | None = Field(default=None)
    end_date: datetime | None = Field(default=None)
    actual_start_date: datetime | None = Field(default=None)
    actual_end_date: datetime | None = Field(default=None)

    progress: float = Field(default=0.0)  # 0-100
    budget: float | None = Field(default=None)
    spent: float | None = Field(default=None)
    currency: str = Field(default="EUR", max_length=3)

    manager_id: uuid.UUID | None = Field(default=None, foreign_key="user.id", nullable=True)
    client: str | None = Field(default=None, max_length=255)
    location: str | None = Field(default=None, max_length=255)
    category: str | None = Field(default=None, max_length=100)

    is_favorite: bool = Field(default=False)
    is_archived: bool = Field(default=False)
    color: str | None = Field(default=None, max_length=20)  # Hex color for Gantt


class ProjectCreate(SQLModel):
    """Model for creating projects"""
    name: str = Field(max_length=255)
    code: str = Field(max_length=50)
    description: str | None = None
    status: str = Field(default="planning", max_length=50)
    priority: str = Field(default="medium", max_length=50)
    health: str = Field(default="on_track", max_length=50)

    start_date: datetime | None = None
    end_date: datetime | None = None

    budget: float | None = None
    currency: str = Field(default="EUR", max_length=3)

    manager_id: uuid.UUID | None = None
    client: str | None = None
    location: str | None = None
    category: str | None = None
    color: str | None = None


class ProjectUpdate(SQLModel):
    """Model for updating projects"""
    name: str | None = Field(default=None, max_length=255)
    code: str | None = Field(default=None, max_length=50)
    description: str | None = None
    status: str | None = Field(default=None, max_length=50)
    priority: str | None = Field(default=None, max_length=50)
    health: str | None = Field(default=None, max_length=50)

    start_date: datetime | None = None
    end_date: datetime | None = None
    actual_start_date: datetime | None = None
    actual_end_date: datetime | None = None

    progress: float | None = None
    budget: float | None = None
    spent: float | None = None
    currency: str | None = Field(default=None, max_length=3)

    manager_id: uuid.UUID | None = None
    client: str | None = None
    location: str | None = None
    category: str | None = None

    is_favorite: bool | None = None
    is_archived: bool | None = None
    color: str | None = None


class Project(AbstractBaseModel, ProjectBase, table=True):
    """
    Project model with audit trail and soft delete.
    """
    __tablename__ = "project"

    manager: Optional["User"] = Relationship(
        sa_relationship_kwargs={"foreign_keys": "[Project.manager_id]"}
    )
    tasks: List["ProjectTask"] = Relationship(back_populates="project")


class ProjectPublic(ProjectBase):
    """Public model for projects"""
    id: uuid.UUID
    created_at: datetime | None = None
    updated_at: datetime | None = None
    completed_tasks: int = 0
    total_tasks: int = 0


class ProjectsPublic(SQLModel):
    """Model for list of projects"""
    data: list[ProjectPublic]
    count: int


# ============================================================================
# PROJECT TASK MODELS (Extended tasks for Gantt)
# ============================================================================

class ProjectTaskBase(SQLModel):
    """Base model for project tasks with Gantt-specific fields"""
    title: str = Field(max_length=500)
    description: str | None = Field(default=None, max_length=2000)

    project_id: uuid.UUID = Field(foreign_key="project.id", ondelete="CASCADE")

    status: str = Field(default="todo", max_length=50)  # todo, in_progress, review, done, blocked
    priority: str = Field(default="medium", max_length=50)  # low, medium, high, critical

    start_date: datetime | None = Field(default=None)
    due_date: datetime | None = Field(default=None)
    actual_start_date: datetime | None = Field(default=None)
    actual_end_date: datetime | None = Field(default=None)

    progress: float = Field(default=0.0)  # 0-100
    estimated_hours: float | None = Field(default=None)
    actual_hours: float | None = Field(default=None)

    assignee_id: uuid.UUID | None = Field(default=None, foreign_key="user.id", nullable=True)

    # Gantt-specific fields
    is_milestone: bool = Field(default=False)
    dependencies: str | None = Field(default=None, max_length=1000)  # JSON array of task IDs
    parent_task_id: uuid.UUID | None = Field(default=None, foreign_key="project_task.id", nullable=True)

    # Additional fields
    budget: float | None = Field(default=None)
    pob: int | None = Field(default=None)  # Personnel On Board
    tags: str | None = Field(default=None, max_length=500)  # JSON array

    sort_order: int = Field(default=0)


class ProjectTaskCreate(SQLModel):
    """Model for creating project tasks"""
    title: str = Field(max_length=500)
    description: str | None = None

    project_id: uuid.UUID

    status: str = Field(default="todo", max_length=50)
    priority: str = Field(default="medium", max_length=50)

    start_date: datetime | None = None
    due_date: datetime | None = None

    estimated_hours: float | None = None
    assignee_id: uuid.UUID | None = None

    is_milestone: bool = False
    dependencies: str | None = None
    parent_task_id: uuid.UUID | None = None

    budget: float | None = None
    pob: int | None = None
    tags: str | None = None


class ProjectTaskUpdate(SQLModel):
    """Model for updating project tasks"""
    title: str | None = Field(default=None, max_length=500)
    description: str | None = None

    status: str | None = Field(default=None, max_length=50)
    priority: str | None = Field(default=None, max_length=50)

    start_date: datetime | None = None
    due_date: datetime | None = None
    actual_start_date: datetime | None = None
    actual_end_date: datetime | None = None

    progress: float | None = None
    estimated_hours: float | None = None
    actual_hours: float | None = None

    assignee_id: uuid.UUID | None = None

    is_milestone: bool | None = None
    dependencies: str | None = None
    parent_task_id: uuid.UUID | None = None

    budget: float | None = None
    pob: int | None = None
    tags: str | None = None

    sort_order: int | None = None


class ProjectTask(AbstractBaseModel, ProjectTaskBase, table=True):
    """
    Project Task model with Gantt-specific fields.
    """
    __tablename__ = "project_task"

    project: Optional["Project"] = Relationship(back_populates="tasks")
    assignee: Optional["User"] = Relationship(
        sa_relationship_kwargs={"foreign_keys": "[ProjectTask.assignee_id]"}
    )
    parent_task: Optional["ProjectTask"] = Relationship(
        sa_relationship_kwargs={
            "foreign_keys": "[ProjectTask.parent_task_id]",
            "remote_side": "[ProjectTask.id]"
        }
    )


class ProjectTaskPublic(ProjectTaskBase):
    """Public model for project tasks"""
    id: uuid.UUID
    created_at: datetime | None = None
    updated_at: datetime | None = None
    assignee_name: str | None = None


class ProjectTasksPublic(SQLModel):
    """Model for list of project tasks"""
    data: list[ProjectTaskPublic]
    count: int


# ============================================================================
# PROJECT WITH TASKS (for Gantt view)
# ============================================================================

class ProjectWithTasks(ProjectPublic):
    """Project with all its tasks for Gantt view"""
    tasks: list[ProjectTaskPublic] = []
    manager_name: str | None = None


class GanttData(SQLModel):
    """Complete Gantt data response"""
    projects: list[ProjectWithTasks]
    total_projects: int
    total_tasks: int
