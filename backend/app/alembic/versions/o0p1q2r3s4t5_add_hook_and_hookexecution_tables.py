"""Add Hook and HookExecution tables

Revision ID: o0p1q2r3s4t5
Revises: n9o0p1q2r3s4
Create Date: 2025-10-16 21:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
import sqlmodel
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = 'o0p1q2r3s4t5'
down_revision = 'n9o0p1q2r3s4'
branch_labels = None
depends_on = None


def upgrade():
    # Créer table hook
    op.create_table('hook',
        sa.Column('name', sqlmodel.sql.sqltypes.AutoString(length=255), nullable=False),
        sa.Column('event', sqlmodel.sql.sqltypes.AutoString(length=255), nullable=False),
        sa.Column('is_active', sa.Boolean(), nullable=False),
        sa.Column('priority', sa.Integer(), nullable=False),
        sa.Column('description', sqlmodel.sql.sqltypes.AutoString(length=1000), nullable=True),
        sa.Column('conditions', postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.Column('actions', postgresql.JSON(astext_type=sa.Text()), nullable=False),
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('external_id', sqlmodel.sql.sqltypes.AutoString(length=255), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('created_by_id', sa.Uuid(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.Column('updated_by_id', sa.Uuid(), nullable=True),
        sa.Column('deleted_at', sa.DateTime(), nullable=True),
        sa.Column('deleted_by_id', sa.Uuid(), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_hook_event'), 'hook', ['event'], unique=False)
    op.create_index(op.f('ix_hook_external_id'), 'hook', ['external_id'], unique=True)
    op.create_index(op.f('ix_hook_id'), 'hook', ['id'], unique=False)

    # Créer table hook_execution
    op.create_table('hook_execution',
        sa.Column('hook_id', sa.Uuid(), nullable=False),
        sa.Column('success', sa.Boolean(), nullable=False),
        sa.Column('duration_ms', sa.Integer(), nullable=False),
        sa.Column('error_message', sqlmodel.sql.sqltypes.AutoString(length=2000), nullable=True),
        sa.Column('event_context', postgresql.JSON(astext_type=sa.Text()), nullable=False),
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('external_id', sqlmodel.sql.sqltypes.AutoString(length=255), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('created_by_id', sa.Uuid(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.Column('updated_by_id', sa.Uuid(), nullable=True),
        sa.Column('deleted_at', sa.DateTime(), nullable=True),
        sa.Column('deleted_by_id', sa.Uuid(), nullable=True),
        sa.ForeignKeyConstraint(['hook_id'], ['hook.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_hook_execution_external_id'), 'hook_execution', ['external_id'], unique=True)
    op.create_index(op.f('ix_hook_execution_hook_id'), 'hook_execution', ['hook_id'], unique=False)
    op.create_index(op.f('ix_hook_execution_id'), 'hook_execution', ['id'], unique=False)
    op.create_index(op.f('ix_hook_execution_success'), 'hook_execution', ['success'], unique=False)
    op.create_index(op.f('ix_hook_execution_created_at'), 'hook_execution', ['created_at'], unique=False)


def downgrade():
    # Supprimer tables dans l'ordre inverse
    op.drop_index(op.f('ix_hook_execution_created_at'), table_name='hook_execution')
    op.drop_index(op.f('ix_hook_execution_success'), table_name='hook_execution')
    op.drop_index(op.f('ix_hook_execution_id'), table_name='hook_execution')
    op.drop_index(op.f('ix_hook_execution_hook_id'), table_name='hook_execution')
    op.drop_index(op.f('ix_hook_execution_external_id'), table_name='hook_execution')
    op.drop_table('hook_execution')

    op.drop_index(op.f('ix_hook_id'), table_name='hook')
    op.drop_index(op.f('ix_hook_external_id'), table_name='hook')
    op.drop_index(op.f('ix_hook_event'), table_name='hook')
    op.drop_table('hook')
