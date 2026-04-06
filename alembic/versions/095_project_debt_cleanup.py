"""Projets module technical debt cleanup

Adds:
- projects.project_type (project/workover/drilling/integrity/maintenance/inspection/event)
- projects.department_id FK → departments
- project_task_assignees junction table (multi-assignation)
- project_comments table (threaded comments with @mention)
- project_status_history table (append-only audit trail)

Revision ID: 095_project_debt_cleanup
Revises: 094_planner_conflict_audit
Create Date: 2026-04-06
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB


revision = "095_project_debt_cleanup"
down_revision = "094_planner_conflict_audit"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── Project fields ──────────────────────────────────────────
    op.add_column("projects", sa.Column(
        "project_type", sa.String(30), nullable=False, server_default="project",
    ))
    op.add_column("projects", sa.Column(
        "department_id", UUID(as_uuid=True),
        sa.ForeignKey("departments.id", ondelete="SET NULL"), nullable=True,
    ))
    op.create_index("idx_projects_type", "projects", ["project_type"])
    op.create_index("idx_projects_department", "projects", ["department_id"])

    # ── Task Assignees (multi-assign) ───────────────────────────
    op.create_table(
        "project_task_assignees",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("task_id", UUID(as_uuid=True), sa.ForeignKey("project_tasks.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("role", sa.String(30), nullable=False, server_default="assignee"),
    )
    op.create_index("idx_task_assignees_task", "project_task_assignees", ["task_id"])
    op.create_index("idx_task_assignees_user", "project_task_assignees", ["user_id"])

    # ── Comments ────────────────────────────────────────────────
    op.create_table(
        "project_comments",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("owner_type", sa.String(30), nullable=False),
        sa.Column("owner_id", UUID(as_uuid=True), nullable=False),
        sa.Column("author_id", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("mentions", JSONB, nullable=True),
        sa.Column("parent_id", UUID(as_uuid=True), sa.ForeignKey("project_comments.id", ondelete="CASCADE"), nullable=True),
        sa.Column("edited_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.true()),
    )
    op.create_index("idx_project_comments_owner", "project_comments", ["owner_type", "owner_id"])
    op.create_index("idx_project_comments_author", "project_comments", ["author_id"])

    # ── Status History ──────────────────────────────────────────
    op.create_table(
        "project_status_history",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("project_id", UUID(as_uuid=True), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("from_status", sa.String(20), nullable=True),
        sa.Column("to_status", sa.String(20), nullable=False),
        sa.Column("changed_by", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("changed_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("idx_project_status_history_project", "project_status_history", ["project_id"])


def downgrade() -> None:
    op.drop_index("idx_project_status_history_project", table_name="project_status_history")
    op.drop_table("project_status_history")
    op.drop_index("idx_project_comments_author", table_name="project_comments")
    op.drop_index("idx_project_comments_owner", table_name="project_comments")
    op.drop_table("project_comments")
    op.drop_index("idx_task_assignees_user", table_name="project_task_assignees")
    op.drop_index("idx_task_assignees_task", table_name="project_task_assignees")
    op.drop_table("project_task_assignees")
    op.drop_index("idx_projects_department", table_name="projects")
    op.drop_index("idx_projects_type", table_name="projects")
    op.drop_column("projects", "department_id")
    op.drop_column("projects", "project_type")
