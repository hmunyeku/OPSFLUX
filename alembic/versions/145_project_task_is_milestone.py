"""Add is_milestone flag to project_tasks.

Revision ID: 145_project_task_is_milestone
Revises: 144_password_history

Unifies milestones and tasks: a milestone is now a task with
is_milestone=true rather than a separate row in project_milestones.
The legacy project_milestones table is kept intact for backward
compat — existing rows are not migrated automatically.

Downstream constraints enforced at the service layer (not the DB):
  - is_milestone tasks must have start_date == due_date
  - is_milestone tasks cannot have children (parent_id refs still work
    pointing TO a milestone, but no task may have a milestone as its
    parent_id — that's still a DB-permitted but service-rejected case)
"""

from alembic import op
import sqlalchemy as sa


revision = "145_project_task_is_milestone"
down_revision = "144_password_history"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "project_tasks",
        sa.Column("is_milestone", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )
    op.create_index(
        "idx_project_tasks_milestone",
        "project_tasks",
        ["project_id", "is_milestone"],
    )


def downgrade() -> None:
    op.drop_index("idx_project_tasks_milestone", table_name="project_tasks")
    op.drop_column("project_tasks", "is_milestone")
