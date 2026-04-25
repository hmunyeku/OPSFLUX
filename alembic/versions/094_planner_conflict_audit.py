"""planner conflict audit trail table

Revision ID: 094_planner_conflict_audit
Revises: 093_sync_workflow_definition_slugs
Create Date: 2026-04-05
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID


revision = "094_planner_conflict_audit"
down_revision = "093_sync_workflow_definition_slugs"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "planner_conflict_audit",
        sa.Column(
            "id",
            UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "conflict_id",
            UUID(as_uuid=True),
            sa.ForeignKey("planner_conflicts.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("actor_id", UUID(as_uuid=True), nullable=True),
        sa.Column(
            "action",
            sa.String(30),
            nullable=False,
            server_default="resolve",
        ),
        sa.Column("old_status", sa.String(20), nullable=True),
        sa.Column("new_status", sa.String(20), nullable=True),
        sa.Column("old_resolution", sa.String(50), nullable=True),
        sa.Column("new_resolution", sa.String(50), nullable=True),
        sa.Column("resolution_note", sa.Text(), nullable=True),
        sa.Column("context", sa.String(100), nullable=True),
    )
    op.create_index(
        "idx_planner_conflict_audit_conflict",
        "planner_conflict_audit",
        ["conflict_id"],
    )
    op.create_index(
        "idx_planner_conflict_audit_actor",
        "planner_conflict_audit",
        ["actor_id"],
    )


def downgrade() -> None:
    op.drop_index(
        "idx_planner_conflict_audit_actor",
        table_name="planner_conflict_audit",
    )
    op.drop_index(
        "idx_planner_conflict_audit_conflict",
        table_name="planner_conflict_audit",
    )
    op.drop_table("planner_conflict_audit")
