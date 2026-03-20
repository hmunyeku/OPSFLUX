"""Add planning_revisions, task_deliverables, task_actions, task_change_logs tables.

Supports:
- Planning revision system (simulation, versioning, active revision)
- Task deliverables (livrables)
- Task actions/checklists
- Task change tracking / historisation

Revision ID: 015_add_planning_revisions_deliverables_actions_changelog
Revises: 014_add_job_position_to_contacts
Create Date: 2026-03-18
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB

revision: str = "015_add_planning_revisions_deliverables_actions_changelog"
down_revision: Union[str, None] = "014_add_job_position_to_contacts"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── planning_revisions ─────────────────────────────────────
    op.create_table(
        "planning_revisions",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("project_id", UUID(as_uuid=True), sa.ForeignKey("projects.id"), nullable=False),
        sa.Column("revision_number", sa.Integer, nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column("is_simulation", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column("snapshot_data", JSONB, nullable=True),
        sa.Column("created_by", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("active", sa.Boolean, nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("idx_planning_revisions_project", "planning_revisions", ["project_id"])

    # ── task_deliverables ──────────────────────────────────────
    op.create_table(
        "task_deliverables",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("task_id", UUID(as_uuid=True), sa.ForeignKey("project_tasks.id"), nullable=False),
        sa.Column("name", sa.String(300), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="pending"),
        sa.Column("due_date", sa.DateTime(timezone=True), nullable=True),
        sa.Column("delivered_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("accepted_by", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("active", sa.Boolean, nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("idx_task_deliverables_task", "task_deliverables", ["task_id"])

    # ── task_actions ───────────────────────────────────────────
    op.create_table(
        "task_actions",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("task_id", UUID(as_uuid=True), sa.ForeignKey("project_tasks.id"), nullable=False),
        sa.Column("title", sa.String(300), nullable=False),
        sa.Column("completed", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_by", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("order", sa.Integer, nullable=False, server_default=sa.text("0")),
        sa.Column("active", sa.Boolean, nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("idx_task_actions_task", "task_actions", ["task_id"])

    # ── task_change_logs ───────────────────────────────────────
    op.create_table(
        "task_change_logs",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("task_id", UUID(as_uuid=True), sa.ForeignKey("project_tasks.id"), nullable=False),
        sa.Column("change_type", sa.String(50), nullable=False),
        sa.Column("field_name", sa.String(50), nullable=False),
        sa.Column("old_value", sa.Text, nullable=True),
        sa.Column("new_value", sa.Text, nullable=True),
        sa.Column("reason", sa.Text, nullable=True),
        sa.Column("changed_by", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("idx_task_change_logs_task", "task_change_logs", ["task_id"])


def downgrade() -> None:
    op.drop_index("idx_task_change_logs_task", table_name="task_change_logs")
    op.drop_table("task_change_logs")

    op.drop_index("idx_task_actions_task", table_name="task_actions")
    op.drop_table("task_actions")

    op.drop_index("idx_task_deliverables_task", table_name="task_deliverables")
    op.drop_table("task_deliverables")

    op.drop_index("idx_planning_revisions_project", table_name="planning_revisions")
    op.drop_table("planning_revisions")
