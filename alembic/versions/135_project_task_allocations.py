"""Project task allocations + losses (MS Project parity).

Revision ID: 135_project_task_allocations
Revises: 134_project_resources_pointage
Create Date: 2026-04-25

Two tables:
- project_task_allocations: planned workload per (member, task)
- project_task_losses: time/cost losses tracked for end-of-project reports
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID


revision = "135_project_task_allocations"
down_revision = "134_project_resources_pointage"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "project_task_allocations",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("entity_id", UUID(as_uuid=True), sa.ForeignKey("entities.id"), nullable=False),
        sa.Column("project_id", UUID(as_uuid=True), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("task_id", UUID(as_uuid=True), sa.ForeignKey("project_tasks.id", ondelete="CASCADE"), nullable=False),
        sa.Column("member_id", UUID(as_uuid=True), sa.ForeignKey("project_members.id", ondelete="CASCADE"), nullable=False),
        sa.Column("planned_hours", sa.Float, nullable=False, server_default="0"),
        sa.Column("allocation_pct", sa.Integer, nullable=False, server_default="100"),
        sa.Column("start_date", sa.Date),
        sa.Column("end_date", sa.Date),
        sa.Column("notes", sa.Text),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("idx_pta_task", "project_task_allocations", ["task_id"])
    op.create_index("idx_pta_member", "project_task_allocations", ["member_id"])
    op.create_index("uq_pta_task_member", "project_task_allocations", ["task_id", "member_id"], unique=True)

    # ── Project task losses (pertes / waste) ──
    op.create_table(
        "project_task_losses",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("entity_id", UUID(as_uuid=True), sa.ForeignKey("entities.id"), nullable=False),
        sa.Column("project_id", UUID(as_uuid=True), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("task_id", UUID(as_uuid=True), sa.ForeignKey("project_tasks.id", ondelete="CASCADE")),
        sa.Column("member_id", UUID(as_uuid=True), sa.ForeignKey("project_members.id", ondelete="SET NULL")),
        sa.Column("date", sa.Date, nullable=False),
        sa.Column("category", sa.String(30), nullable=False),
        sa.Column("hours_lost", sa.Float),
        sa.Column("cost_amount", sa.Float),
        sa.Column("currency", sa.String(10)),
        sa.Column("description", sa.Text, nullable=False),
        sa.Column("reported_by", UUID(as_uuid=True), sa.ForeignKey("users.id")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("idx_ptl_task", "project_task_losses", ["task_id"])
    op.create_index("idx_ptl_project", "project_task_losses", ["project_id"])
    op.create_index("idx_ptl_category", "project_task_losses", ["category"])


def downgrade() -> None:
    op.drop_index("idx_ptl_category", table_name="project_task_losses")
    op.drop_index("idx_ptl_project", table_name="project_task_losses")
    op.drop_index("idx_ptl_task", table_name="project_task_losses")
    op.drop_table("project_task_losses")
    op.drop_index("uq_pta_task_member", table_name="project_task_allocations")
    op.drop_index("idx_pta_member", table_name="project_task_allocations")
    op.drop_index("idx_pta_task", table_name="project_task_allocations")
    op.drop_table("project_task_allocations")
