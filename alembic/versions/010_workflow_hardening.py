"""Workflow engine hardening — index + optimistic lock.

Add missing index on workflow_transitions.instance_id for fast history
queries, and a version column on workflow_instances for optimistic
concurrency control during transitions.

Revision ID: 010_workflow_hardening
Revises: 009_add_workflow_columns
Create Date: 2026-03-16
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "010_workflow_hardening"
down_revision: Union[str, None] = "009_add_workflow_columns"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Index on workflow_transitions.instance_id (history lookups)
    op.create_index(
        "idx_wf_trans_instance",
        "workflow_transitions",
        ["instance_id"],
        if_not_exists=True,
    )

    # 2. Optimistic lock column on workflow_instances
    op.add_column(
        "workflow_instances",
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
    )


def downgrade() -> None:
    op.drop_column("workflow_instances", "version")
    op.drop_index("idx_wf_trans_instance", "workflow_transitions")
