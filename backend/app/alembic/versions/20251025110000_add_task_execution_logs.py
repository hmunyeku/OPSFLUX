"""add task_execution_logs table

Revision ID: 20251025110000
Revises: 20251025100000
Create Date: 2025-10-25 11:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
import sqlmodel
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '20251025110000'
down_revision = '20251025100000'
branch_labels = None
depends_on = None


def upgrade():
    # Create task_execution_logs table
    op.create_table(
        'task_execution_logs',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('task_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('celery_task_id', sa.String(), nullable=False),
        sa.Column('started_at', sa.DateTime(), nullable=False),
        sa.Column('finished_at', sa.DateTime(), nullable=True),
        sa.Column('status', sa.String(), nullable=False),
        sa.Column('result', sa.Text(), nullable=True),
        sa.Column('error', sa.Text(), nullable=True),
        sa.Column('traceback', sa.Text(), nullable=True),
        sa.Column('duration_seconds', sa.Float(), nullable=True),
        sa.ForeignKeyConstraint(['task_id'], ['scheduled_tasks.id'], ),
        sa.PrimaryKeyConstraint('id')
    )

    # Create indexes for better query performance
    op.create_index('ix_task_execution_logs_task_id', 'task_execution_logs', ['task_id'])
    op.create_index('ix_task_execution_logs_started_at', 'task_execution_logs', ['started_at'])
    op.create_index('ix_task_execution_logs_status', 'task_execution_logs', ['status'])


def downgrade():
    op.drop_index('ix_task_execution_logs_status', table_name='task_execution_logs')
    op.drop_index('ix_task_execution_logs_started_at', table_name='task_execution_logs')
    op.drop_index('ix_task_execution_logs_task_id', table_name='task_execution_logs')
    op.drop_table('task_execution_logs')
