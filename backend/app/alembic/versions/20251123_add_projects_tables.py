"""Add projects and project_tasks tables for Gantt

Revision ID: 20251123_projects
Revises:
Create Date: 2025-11-23

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '20251123_projects'
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create project table
    op.create_table(
        'project',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('code', sa.String(50), nullable=False),
        sa.Column('description', sa.String(2000), nullable=True),
        sa.Column('status', sa.String(50), nullable=False, server_default='planning'),
        sa.Column('priority', sa.String(50), nullable=False, server_default='medium'),
        sa.Column('health', sa.String(50), nullable=False, server_default='on_track'),

        sa.Column('start_date', sa.DateTime(), nullable=True),
        sa.Column('end_date', sa.DateTime(), nullable=True),
        sa.Column('actual_start_date', sa.DateTime(), nullable=True),
        sa.Column('actual_end_date', sa.DateTime(), nullable=True),

        sa.Column('progress', sa.Float(), nullable=False, server_default='0'),
        sa.Column('budget', sa.Float(), nullable=True),
        sa.Column('spent', sa.Float(), nullable=True),
        sa.Column('currency', sa.String(3), nullable=False, server_default='EUR'),

        sa.Column('manager_id', sa.UUID(), nullable=True),
        sa.Column('client', sa.String(255), nullable=True),
        sa.Column('location', sa.String(255), nullable=True),
        sa.Column('category', sa.String(100), nullable=True),

        sa.Column('is_favorite', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('is_archived', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('color', sa.String(20), nullable=True),

        # Audit columns
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.Column('deleted_at', sa.DateTime(), nullable=True),
        sa.Column('created_by_id', sa.UUID(), nullable=True),
        sa.Column('updated_by_id', sa.UUID(), nullable=True),
        sa.Column('deleted_by_id', sa.UUID(), nullable=True),

        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['manager_id'], ['user.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['created_by_id'], ['user.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['updated_by_id'], ['user.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['deleted_by_id'], ['user.id'], ondelete='SET NULL'),
    )
    op.create_index('ix_project_code', 'project', ['code'], unique=True)
    op.create_index('ix_project_status', 'project', ['status'])
    op.create_index('ix_project_manager_id', 'project', ['manager_id'])

    # Create project_task table
    op.create_table(
        'project_task',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('title', sa.String(500), nullable=False),
        sa.Column('description', sa.String(2000), nullable=True),

        sa.Column('project_id', sa.UUID(), nullable=False),

        sa.Column('status', sa.String(50), nullable=False, server_default='todo'),
        sa.Column('priority', sa.String(50), nullable=False, server_default='medium'),

        sa.Column('start_date', sa.DateTime(), nullable=True),
        sa.Column('due_date', sa.DateTime(), nullable=True),
        sa.Column('actual_start_date', sa.DateTime(), nullable=True),
        sa.Column('actual_end_date', sa.DateTime(), nullable=True),

        sa.Column('progress', sa.Float(), nullable=False, server_default='0'),
        sa.Column('estimated_hours', sa.Float(), nullable=True),
        sa.Column('actual_hours', sa.Float(), nullable=True),

        sa.Column('assignee_id', sa.UUID(), nullable=True),

        # Gantt-specific fields
        sa.Column('is_milestone', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('dependencies', sa.String(1000), nullable=True),
        sa.Column('parent_task_id', sa.UUID(), nullable=True),

        # Additional fields
        sa.Column('budget', sa.Float(), nullable=True),
        sa.Column('pob', sa.Integer(), nullable=True),
        sa.Column('tags', sa.String(500), nullable=True),

        sa.Column('sort_order', sa.Integer(), nullable=False, server_default='0'),

        # Audit columns
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.Column('deleted_at', sa.DateTime(), nullable=True),
        sa.Column('created_by_id', sa.UUID(), nullable=True),
        sa.Column('updated_by_id', sa.UUID(), nullable=True),
        sa.Column('deleted_by_id', sa.UUID(), nullable=True),

        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['project_id'], ['project.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['assignee_id'], ['user.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['parent_task_id'], ['project_task.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['created_by_id'], ['user.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['updated_by_id'], ['user.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['deleted_by_id'], ['user.id'], ondelete='SET NULL'),
    )
    op.create_index('ix_project_task_project_id', 'project_task', ['project_id'])
    op.create_index('ix_project_task_status', 'project_task', ['status'])
    op.create_index('ix_project_task_assignee_id', 'project_task', ['assignee_id'])


def downgrade() -> None:
    op.drop_table('project_task')
    op.drop_table('project')
