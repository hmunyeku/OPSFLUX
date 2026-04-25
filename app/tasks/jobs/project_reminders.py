"""Scheduled job: project task deadline reminders (J-7 and J-1).

Runs daily at 08:00 via APScheduler. For each active entity, finds tasks
due in 7 days or 1 day and sends in-app notifications + email to assignees.
"""

import logging
from datetime import date, timedelta

from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import async_session_factory
from app.models.common import Entity, ProjectTask, Project, User

logger = logging.getLogger(__name__)


async def run_project_reminders() -> None:
    """Check all active tasks for upcoming deadlines and notify assignees."""
    today = date.today()
    j7 = today + timedelta(days=7)
    j1 = today + timedelta(days=1)

    async with async_session_factory() as db:
        try:
            entities = (await db.execute(
                select(Entity).where(Entity.active == True)  # noqa: E712
            )).scalars().all()
        except Exception:
            logger.exception("Project reminders: failed to list entities")
            return

        for entity in entities:
            try:
                await _process_entity(db, entity.id, today, j7, j1)
            except Exception:
                logger.exception("Project reminders: error for entity %s", entity.id)


async def _process_entity(db: AsyncSession, entity_id, today, j7, j1) -> None:
    from app.core.notifications import send_in_app

    # Find tasks due in exactly 7 days or 1 day (not already done/cancelled)
    for horizon, label in [(j7, "dans 7 jours"), (j1, "demain")]:
        rows = (await db.execute(
            select(ProjectTask, Project.code, Project.name)
            .join(Project, ProjectTask.project_id == Project.id)
            .where(
                Project.entity_id == entity_id,
                Project.archived == False,  # noqa: E712
                ProjectTask.active == True,  # noqa: E712
                ProjectTask.status.in_(["todo", "in_progress", "review"]),
                ProjectTask.due_date.isnot(None),
                # Match tasks due on exactly that horizon date
                and_(
                    ProjectTask.due_date >= f"{horizon}T00:00:00+00:00",
                    ProjectTask.due_date < f"{horizon + timedelta(days=1)}T00:00:00+00:00",
                ),
                ProjectTask.assignee_id.isnot(None),
            )
        )).all()

        for task, project_code, project_name in rows:
            try:
                await send_in_app(
                    db,
                    user_id=task.assignee_id,
                    entity_id=entity_id,
                    title=f"Échéance {label} : {task.title}",
                    body=f"La tâche « {task.title} » du projet {project_code} — {project_name} est due {label}.",
                    category="projets",
                    link=f"/projets",
                )
            except Exception:
                logger.warning("Failed to send reminder for task %s", task.id)

    await db.commit()
