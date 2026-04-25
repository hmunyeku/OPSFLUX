"""Add job_executions table for scheduler execution history.

Revision ID: 061
"""

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID
from alembic import op

revision = "061"
down_revision = "060"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "job_executions",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("job_id", sa.String(100), nullable=False),
        sa.Column("job_name", sa.String(200), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("duration_ms", sa.Integer(), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("error_traceback", sa.Text(), nullable=True),
        sa.Column("triggered_by", sa.String(20), server_default="scheduler", nullable=False),
    )
    op.create_index("idx_job_executions_job_id", "job_executions", ["job_id"])
    op.create_index("idx_job_executions_started_at", "job_executions", ["started_at"])


def downgrade() -> None:
    op.drop_table("job_executions")
