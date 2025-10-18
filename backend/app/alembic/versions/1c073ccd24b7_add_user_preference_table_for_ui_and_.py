"""Add user_preference table for UI and module preferences

Revision ID: 1c073ccd24b7
Revises: de354b4e000e
Create Date: 2025-10-18 20:13:16.185744

"""
from alembic import op
import sqlalchemy as sa
import sqlmodel.sql.sqltypes
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '1c073ccd24b7'
down_revision = 'de354b4e000e'
branch_labels = None
depends_on = None


def upgrade():
    # Create user_preference table
    op.create_table(
        'user_preference',
        sa.Column('id', postgresql.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('user_id', postgresql.UUID(), nullable=False),
        sa.Column('module_id', postgresql.UUID(), nullable=True),
        sa.Column('preference_key', sa.String(length=255), nullable=False),
        sa.Column('preference_value', postgresql.JSONB(), nullable=False),
        sa.Column('preference_type', sa.String(length=50), nullable=False),
        sa.Column('description', sa.String(length=500), nullable=True),
        sa.Column('external_id', sa.String(length=255), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_by_id', postgresql.UUID(), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('updated_by_id', postgresql.UUID(), nullable=True),
        sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('deleted_by_id', postgresql.UUID(), nullable=True),
        sa.ForeignKeyConstraint(['created_by_id'], ['user.id'], ),
        sa.ForeignKeyConstraint(['deleted_by_id'], ['user.id'], ),
        sa.ForeignKeyConstraint(['module_id'], ['module.id'], ),
        sa.ForeignKeyConstraint(['updated_by_id'], ['user.id'], ),
        sa.ForeignKeyConstraint(['user_id'], ['user.id'], ),
        sa.PrimaryKeyConstraint('id')
    )

    # Create indexes
    op.create_index(op.f('ix_user_preference_user_id'), 'user_preference', ['user_id'], unique=False)
    op.create_index(op.f('ix_user_preference_module_id'), 'user_preference', ['module_id'], unique=False)
    op.create_index(op.f('ix_user_preference_preference_key'), 'user_preference', ['preference_key'], unique=False)

    # Create unique constraint for (user_id, module_id, preference_key)
    # Note: PostgreSQL allows multiple NULL values in unique constraints
    op.create_index(
        'uq_user_preference_user_module_key',
        'user_preference',
        ['user_id', 'module_id', 'preference_key'],
        unique=True
    )


def downgrade():
    # Drop indexes
    op.drop_index('uq_user_preference_user_module_key', table_name='user_preference')
    op.drop_index(op.f('ix_user_preference_preference_key'), table_name='user_preference')
    op.drop_index(op.f('ix_user_preference_module_id'), table_name='user_preference')
    op.drop_index(op.f('ix_user_preference_user_id'), table_name='user_preference')

    # Drop table
    op.drop_table('user_preference')
