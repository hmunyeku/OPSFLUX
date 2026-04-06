"""Add source_task_id to planner_activities for Projets→Planner link

Revision ID: 098_planner_source_task_id
Revises: 097_merge_heads
Create Date: 2026-04-06
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "098_planner_source_task_id"
down_revision = "097_merge_heads"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("planner_activities", sa.Column(
        "source_task_id", UUID(as_uuid=True),
        sa.ForeignKey("project_tasks.id", ondelete="SET NULL"),
        nullable=True,
    ))
    op.create_index("idx_planner_act_source_task", "planner_activities", ["source_task_id"])


def downgrade() -> None:
    op.drop_index("idx_planner_act_source_task", table_name="planner_activities")
    op.drop_column("planner_activities", "source_task_id")
