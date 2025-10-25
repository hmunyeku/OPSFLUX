"""
Modèles pour la gestion des tâches planifiées (Celery Beat)
"""

from datetime import datetime
from typing import Optional
from sqlmodel import Field, SQLModel, Column, JSON
from uuid import UUID, uuid4


class ScheduledTaskBase(SQLModel):
    """Base model for scheduled tasks"""

    name: str = Field(index=True, description="Nom unique de la tâche")
    task_name: str = Field(description="Nom de la tâche Celery à exécuter (ex: app.tasks.my_task)")
    description: Optional[str] = Field(default=None, description="Description de la tâche")

    # Schedule configuration
    schedule_type: str = Field(description="Type de planification: cron, interval, clocked")

    # Cron configuration (when schedule_type == 'cron')
    cron_minute: Optional[str] = Field(default="*", description="Cron: minutes")
    cron_hour: Optional[str] = Field(default="*", description="Cron: heures")
    cron_day_of_week: Optional[str] = Field(default="*", description="Cron: jour de la semaine")
    cron_day_of_month: Optional[str] = Field(default="*", description="Cron: jour du mois")
    cron_month_of_year: Optional[str] = Field(default="*", description="Cron: mois de l'année")

    # Interval configuration (when schedule_type == 'interval')
    interval_value: Optional[int] = Field(default=None, description="Valeur de l'intervalle")
    interval_unit: Optional[str] = Field(default="minutes", description="Unité: seconds, minutes, hours, days")

    # Arguments for the task
    args: list = Field(default_factory=list, sa_column=Column(JSON), description="Arguments positionnels")
    kwargs: dict = Field(default_factory=dict, sa_column=Column(JSON), description="Arguments nommés")

    # Queue configuration
    queue: Optional[str] = Field(default="celery", description="Queue Celery à utiliser")

    # Status
    is_active: bool = Field(default=True, description="Tâche active ou non")
    is_paused: bool = Field(default=False, description="Tâche en pause")

    # Statistics
    total_run_count: int = Field(default=0, description="Nombre total d'exécutions")
    last_run_at: Optional[datetime] = Field(default=None, description="Dernière exécution")
    last_run_success: Optional[bool] = Field(default=None, description="Dernière exécution réussie")
    last_run_error: Optional[str] = Field(default=None, description="Erreur de la dernière exécution")


class ScheduledTask(ScheduledTaskBase, table=True):
    """Scheduled task model for database"""

    __tablename__ = "scheduled_tasks"

    id: UUID = Field(default_factory=uuid4, primary_key=True)

    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    deleted_at: Optional[datetime] = Field(default=None)

    created_by: Optional[UUID] = Field(default=None, foreign_key="user.id")
    updated_by: Optional[UUID] = Field(default=None, foreign_key="user.id")


class ScheduledTaskCreate(ScheduledTaskBase):
    """Schema for creating a scheduled task"""
    pass


class ScheduledTaskUpdate(SQLModel):
    """Schema for updating a scheduled task"""

    name: Optional[str] = None
    task_name: Optional[str] = None
    description: Optional[str] = None

    schedule_type: Optional[str] = None
    cron_minute: Optional[str] = None
    cron_hour: Optional[str] = None
    cron_day_of_week: Optional[str] = None
    cron_day_of_month: Optional[str] = None
    cron_month_of_year: Optional[str] = None

    interval_value: Optional[int] = None
    interval_unit: Optional[str] = None

    args: Optional[list] = None
    kwargs: Optional[dict] = None

    queue: Optional[str] = None
    is_active: Optional[bool] = None
    is_paused: Optional[bool] = None


class ScheduledTaskPublic(ScheduledTaskBase):
    """Schema for public task representation"""

    id: UUID
    created_at: datetime
    updated_at: datetime

    # Computed fields
    next_run_at: Optional[datetime] = None  # Calculated by Celery Beat

    model_config = {
        "from_attributes": True
    }


class ScheduledTasksResponse(SQLModel):
    """Response model for list of tasks"""

    count: int
    data: list[ScheduledTaskPublic]


# Task Execution Logs

class TaskExecutionLogBase(SQLModel):
    """Base model for task execution logs"""

    task_id: UUID = Field(foreign_key="scheduled_tasks.id", description="ID de la tâche planifiée")
    celery_task_id: str = Field(description="ID de la tâche Celery")

    started_at: datetime = Field(default_factory=datetime.utcnow, description="Heure de début")
    finished_at: Optional[datetime] = Field(default=None, description="Heure de fin")

    status: str = Field(description="success, failure, pending, running")
    result: Optional[str] = Field(default=None, description="Résultat de l'exécution (JSON)")
    error: Optional[str] = Field(default=None, description="Message d'erreur si échec")
    traceback: Optional[str] = Field(default=None, description="Traceback complet si erreur")

    duration_seconds: Optional[float] = Field(default=None, description="Durée d'exécution en secondes")


class TaskExecutionLog(TaskExecutionLogBase, table=True):
    """Task execution log model for database"""

    __tablename__ = "task_execution_logs"

    id: UUID = Field(default_factory=uuid4, primary_key=True)


class TaskExecutionLogPublic(TaskExecutionLogBase):
    """Schema for public log representation"""

    id: UUID

    model_config = {
        "from_attributes": True
    }


class TaskExecutionLogsResponse(SQLModel):
    """Response model for list of logs"""

    count: int
    data: list[TaskExecutionLogPublic]
