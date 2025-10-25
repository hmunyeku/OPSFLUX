"""
Create default scheduled tasks for OpsFlux system maintenance.

This script creates essential scheduled tasks that should run automatically:
- Cleanup old files (daily at 2 AM)
- Collect statistics (every hour)
- Execute scheduled backups (every minute to check for due backups)
"""

from sqlmodel import Session, select
from app.core.db import engine
from app.models_scheduled_tasks import ScheduledTask
from datetime import datetime


def create_default_scheduled_tasks():
    """Create default system scheduled tasks"""

    default_tasks = [
        {
            "name": "System: Cleanup Old Files",
            "task_name": "app.tasks.cleanup_old_files",
            "description": "Nettoie automatiquement les fichiers temporaires et anciens fichiers (plus de 30 jours)",
            "schedule_type": "cron",
            "cron_minute": "0",
            "cron_hour": "2",
            "cron_day_of_week": "*",
            "cron_day_of_month": "*",
            "cron_month_of_year": "*",
            "args": [30],  # days parameter
            "kwargs": {},
            "queue": "celery",
            "is_active": True,
            "is_paused": False,
        },
        {
            "name": "System: Collect Statistics",
            "task_name": "app.tasks.collect_stats",
            "description": "Collecte les statistiques système toutes les heures pour le monitoring",
            "schedule_type": "cron",
            "cron_minute": "0",
            "cron_hour": "*",
            "cron_day_of_week": "*",
            "cron_day_of_month": "*",
            "cron_month_of_year": "*",
            "args": [],
            "kwargs": {},
            "queue": "celery",
            "is_active": True,
            "is_paused": False,
        },
        {
            "name": "System: Execute Scheduled Backups",
            "task_name": "app.tasks.execute_scheduled_backups",
            "description": "Vérifie et exécute les sauvegardes planifiées dont l'heure est arrivée (toutes les minutes)",
            "schedule_type": "cron",
            "cron_minute": "*",
            "cron_hour": "*",
            "cron_day_of_week": "*",
            "cron_day_of_month": "*",
            "cron_month_of_year": "*",
            "args": [],
            "kwargs": {},
            "queue": "celery",
            "is_active": True,
            "is_paused": False,
        },
    ]

    with Session(engine) as session:
        created_count = 0
        skipped_count = 0

        for task_data in default_tasks:
            # Check if task already exists
            existing = session.exec(
                select(ScheduledTask).where(
                    ScheduledTask.name == task_data["name"],
                    ScheduledTask.deleted_at == None
                )
            ).first()

            if existing:
                print(f"⏭️  Skipped: {task_data['name']} (already exists)")
                skipped_count += 1
                continue

            # Create new task
            task = ScheduledTask(
                **task_data,
                created_at=datetime.utcnow(),
                updated_at=datetime.utcnow(),
            )

            session.add(task)
            created_count += 1
            print(f"✅ Created: {task_data['name']}")
            print(f"   → {task_data['description']}")

        session.commit()

        print("\n" + "="*60)
        print(f"📅 Default Scheduled Tasks Summary:")
        print(f"   ✅ Created: {created_count}")
        print(f"   ⏭️  Skipped: {skipped_count}")
        print("="*60)

        if created_count > 0:
            print("\n⚠️  Important: Restart Celery Beat to load the new schedules:")
            print("   docker compose restart celery-beat")


if __name__ == "__main__":
    print("Creating default scheduled tasks for OpsFlux system...\n")
    create_default_scheduled_tasks()
