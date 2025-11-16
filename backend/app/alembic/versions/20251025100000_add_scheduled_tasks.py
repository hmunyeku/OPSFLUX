"""add scheduled tasks table

Revision ID: 20251025100000
Revises:
Create Date: 2025-10-25 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import sqlmodel
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '20251025100000'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create scheduled_tasks table
    op.create_table(
        'scheduled_tasks',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('name', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column('task_name', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column('description', sqlmodel.sql.sqltypes.AutoString(), nullable=True),
        sa.Column('schedule_type', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column('cron_minute', sqlmodel.sql.sqltypes.AutoString(), nullable=True),
        sa.Column('cron_hour', sqlmodel.sql.sqltypes.AutoString(), nullable=True),
        sa.Column('cron_day_of_week', sqlmodel.sql.sqltypes.AutoString(), nullable=True),
        sa.Column('cron_day_of_month', sqlmodel.sql.sqltypes.AutoString(), nullable=True),
        sa.Column('cron_month_of_year', sqlmodel.sql.sqltypes.AutoString(), nullable=True),
        sa.Column('interval_value', sa.Integer(), nullable=True),
        sa.Column('interval_unit', sqlmodel.sql.sqltypes.AutoString(), nullable=True),
        sa.Column('args', postgresql.JSON(astext_type=sa.Text()), nullable=False),
        sa.Column('kwargs', postgresql.JSON(astext_type=sa.Text()), nullable=False),
        sa.Column('queue', sqlmodel.sql.sqltypes.AutoString(), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False),
        sa.Column('is_paused', sa.Boolean(), nullable=False),
        sa.Column('total_run_count', sa.Integer(), nullable=False),
        sa.Column('last_run_at', sa.DateTime(), nullable=True),
        sa.Column('last_run_success', sa.Boolean(), nullable=True),
        sa.Column('last_run_error', sqlmodel.sql.sqltypes.AutoString(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.Column('deleted_at', sa.DateTime(), nullable=True),
        sa.Column('created_by', sa.UUID(), nullable=True),
        sa.Column('updated_by', sa.UUID(), nullable=True),
        sa.ForeignKeyConstraint(['created_by'], ['user.id'], ),
        sa.ForeignKeyConstraint(['updated_by'], ['user.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_scheduled_tasks_name'), 'scheduled_tasks', ['name'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_scheduled_tasks_name'), table_name='scheduled_tasks')
    op.drop_table('scheduled_tasks')
