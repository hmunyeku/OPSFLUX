"""add_scheduled_backups_table

Revision ID: s1t2u3v4w5x6
Revises: f1g2h3i4j5k6
Create Date: 2025-10-23 10:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = 's1t2u3v4w5x6'
down_revision = 'f1g2h3i4j5k6'
branch_labels = None
depends_on = None


def upgrade():
    # Create scheduled_backups table
    op.create_table(
        'scheduled_backups',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('description', sa.String(length=1000), nullable=True),
        sa.Column('backup_type', sa.String(length=50), nullable=False),
        sa.Column('includes_database', sa.Boolean(), nullable=False),
        sa.Column('includes_storage', sa.Boolean(), nullable=False),
        sa.Column('includes_config', sa.Boolean(), nullable=False),
        sa.Column('schedule_frequency', sa.String(length=50), nullable=False),
        sa.Column('schedule_time', sa.String(length=10), nullable=False),
        sa.Column('schedule_day', sa.Integer(), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False),
        sa.Column('last_run_at', sa.DateTime(), nullable=True),
        sa.Column('next_run_at', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.Column('created_by_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('total_runs', sa.Integer(), nullable=False),
        sa.Column('successful_runs', sa.Integer(), nullable=False),
        sa.Column('failed_runs', sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(['created_by_id'], ['user.id'], ),
        sa.PrimaryKeyConstraint('id')
    )

    # Create indexes for frequently queried columns
    op.create_index(op.f('ix_scheduled_backups_created_at'), 'scheduled_backups', ['created_at'], unique=False)
    op.create_index(op.f('ix_scheduled_backups_is_active'), 'scheduled_backups', ['is_active'], unique=False)
    op.create_index(op.f('ix_scheduled_backups_next_run_at'), 'scheduled_backups', ['next_run_at'], unique=False)
    op.create_index(op.f('ix_scheduled_backups_schedule_frequency'), 'scheduled_backups', ['schedule_frequency'], unique=False)


def downgrade():
    # Drop indexes
    op.drop_index(op.f('ix_scheduled_backups_schedule_frequency'), table_name='scheduled_backups')
    op.drop_index(op.f('ix_scheduled_backups_next_run_at'), table_name='scheduled_backups')
    op.drop_index(op.f('ix_scheduled_backups_is_active'), table_name='scheduled_backups')
    op.drop_index(op.f('ix_scheduled_backups_created_at'), table_name='scheduled_backups')

    # Drop table
    op.drop_table('scheduled_backups')
