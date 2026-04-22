"""Migrate legacy project_milestones rows into project_tasks.is_milestone.

Revision ID: 146_migrate_legacy_milestones
Revises: 145_project_task_is_milestone

Moves every active row from project_milestones into project_tasks with
is_milestone=true, preserving the due_date as both start_date and
due_date (single point in time). Records stay in project_milestones for
a safety net — a future revision can DROP the table once downstream
code paths are confirmed no longer reading from it.

Mapping (ProjectMilestone → ProjectTask):
  project_id    → project_id
  name          → title
  description   → description
  due_date      → start_date AND due_date
  completed_at  → completed_at (if present); status="done"
  status        → mapped to task status (pending→todo, completed→done,
                  overdue→todo — the "overdue" concept is computed
                  client-side from dates, not stored)
  active=false  → skipped (soft-deleted, leave behind)

Idempotency: checks for an existing task with the same (project_id,
title, is_milestone=true, due_date) before inserting — safe to re-run.
"""

from alembic import op
import sqlalchemy as sa


revision = "146_migrate_legacy_milestones"
down_revision = "145_project_task_is_milestone"
branch_labels = None
depends_on = None


STATUS_MAP = {
    "pending": "todo",
    "completed": "done",
    "overdue": "todo",
}


def upgrade() -> None:
    bind = op.get_bind()
    # Pull every active legacy milestone. Using raw SQL to avoid an ORM
    # round-trip during migration (the models may evolve after this file
    # is written and break re-runs).
    rows = bind.execute(sa.text("""
        SELECT id, project_id, name, description, due_date, completed_at, status
        FROM project_milestones
        WHERE active = true
    """)).fetchall()

    migrated = 0
    for row in rows:
        pid, name, desc, due, completed, status = (
            row.project_id, row.name, row.description,
            row.due_date, row.completed_at, row.status,
        )
        # Skip if a milestone-task with the same title already exists
        # for this project (idempotent re-run).
        exists = bind.execute(sa.text("""
            SELECT 1 FROM project_tasks
            WHERE project_id = :pid AND title = :title
              AND is_milestone = true
              AND (due_date = :due OR (due_date IS NULL AND :due IS NULL))
            LIMIT 1
        """), {"pid": pid, "title": name, "due": due}).first()
        if exists:
            continue

        # Auto-order: append at the end of the task list.
        max_order = bind.execute(sa.text(
            "SELECT COALESCE(MAX(\"order\"), 0) FROM project_tasks WHERE project_id = :pid"
        ), {"pid": pid}).scalar() or 0

        task_status = STATUS_MAP.get(status or "pending", "todo")

        bind.execute(sa.text("""
            INSERT INTO project_tasks (
                id, project_id, title, description,
                status, priority, progress,
                start_date, due_date, completed_at,
                pob_quota, "order", active, is_milestone, created_at, updated_at
            ) VALUES (
                gen_random_uuid(), :pid, :title, :desc,
                :status, 'medium', :progress,
                :start, :due, :completed,
                0, :order, true, true, NOW(), NOW()
            )
        """), {
            "pid": pid,
            "title": name,
            "desc": desc,
            "status": task_status,
            "progress": 100 if task_status == "done" else 0,
            "start": due,  # start == due for a point-in-time milestone
            "due": due,
            "completed": completed,
            "order": max_order + 1,
        })
        migrated += 1

    # Flag the legacy rows as inactive so they don't double-count in
    # any remaining UI surface that still reads from the old table.
    if migrated > 0:
        bind.execute(sa.text(
            "UPDATE project_milestones SET active = false WHERE active = true"
        ))


def downgrade() -> None:
    # Remove every task created by this migration. Conservative: we
    # only delete tasks that have a matching active=false milestone
    # row (the ones we just flagged). This avoids nuking tasks that
    # a user legitimately created as milestones after the migration.
    bind = op.get_bind()
    bind.execute(sa.text("""
        DELETE FROM project_tasks t
        WHERE t.is_milestone = true
          AND EXISTS (
              SELECT 1 FROM project_milestones m
              WHERE m.project_id = t.project_id
                AND m.name = t.title
                AND m.active = false
                AND (m.due_date = t.due_date OR (m.due_date IS NULL AND t.due_date IS NULL))
          )
    """))
    # Restore the legacy rows to active.
    bind.execute(sa.text(
        "UPDATE project_milestones SET active = true WHERE active = false"
    ))
