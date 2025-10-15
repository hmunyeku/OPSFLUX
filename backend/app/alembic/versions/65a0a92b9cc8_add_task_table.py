"""add_task_table

Revision ID: 65a0a92b9cc8
Revises: 046c115fc3bd
Create Date: 2025-10-15 20:50:00.000000

"""
from alembic import op
import sqlalchemy as sa
import sqlmodel.sql.sqltypes

# revision identifiers, used by Alembic.
revision = '65a0a92b9cc8'
down_revision = '046c115fc3bd'
branch_labels = None
depends_on = None


def upgrade():
    # Create task table
    op.create_table('task',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('external_id', sqlmodel.sql.sqltypes.AutoString(length=255), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
        sa.Column('deleted_at', sa.DateTime(), nullable=True),
        sa.Column('created_by_id', sa.UUID(), nullable=True),
        sa.Column('updated_by_id', sa.UUID(), nullable=True),
        sa.Column('deleted_by_id', sa.UUID(), nullable=True),
        sa.Column('title', sqlmodel.sql.sqltypes.AutoString(length=500), nullable=False),
        sa.Column('status', sqlmodel.sql.sqltypes.AutoString(length=50), nullable=False),
        sa.Column('label', sqlmodel.sql.sqltypes.AutoString(length=50), nullable=False),
        sa.Column('priority', sqlmodel.sql.sqltypes.AutoString(length=50), nullable=False),
        sa.Column('due_date', sqlmodel.sql.sqltypes.AutoString(), nullable=True),
        sa.Column('estimated_time', sqlmodel.sql.sqltypes.AutoString(length=50), nullable=True),
        sa.Column('sprint_cycle', sqlmodel.sql.sqltypes.AutoString(length=50), nullable=True),
        sa.Column('user_id', sa.UUID(), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['user.id'], name=op.f('task_user_id_fkey'), ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['created_by_id'], ['user.id'], name=op.f('task_created_by_id_fkey'), ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['updated_by_id'], ['user.id'], name=op.f('task_updated_by_id_fkey'), ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['deleted_by_id'], ['user.id'], name=op.f('task_deleted_by_id_fkey'), ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id', name=op.f('task_pkey')),
        sa.UniqueConstraint('external_id', name=op.f('task_external_id_key'))
    )
    op.create_index(op.f('ix_task_id'), 'task', ['id'], unique=False)
    op.create_index(op.f('ix_task_external_id'), 'task', ['external_id'], unique=True)
    op.create_index(op.f('ix_task_status'), 'task', ['status'], unique=False)
    op.create_index(op.f('ix_task_priority'), 'task', ['priority'], unique=False)
    op.create_index(op.f('ix_task_user_id'), 'task', ['user_id'], unique=False)


def downgrade():
    # Drop task table
    op.drop_index(op.f('ix_task_user_id'), table_name='task')
    op.drop_index(op.f('ix_task_priority'), table_name='task')
    op.drop_index(op.f('ix_task_status'), table_name='task')
    op.drop_index(op.f('ix_task_external_id'), table_name='task')
    op.drop_index(op.f('ix_task_id'), table_name='task')
    op.drop_table('task')
