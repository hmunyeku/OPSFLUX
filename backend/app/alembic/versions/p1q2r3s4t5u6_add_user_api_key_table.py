"""Add user_api_key table

Revision ID: p1q2r3s4t5u6
Revises: o0p1q2r3s4t5
Create Date: 2025-10-18 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
import sqlmodel
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = 'p1q2r3s4t5u6'
down_revision = 'c20d9cc7a0da'
branch_labels = None
depends_on = None


def upgrade():
    # Creer table user_api_key
    op.create_table('user_api_key',
        sa.Column('user_id', sa.Uuid(), nullable=False),
        sa.Column('key_hash', sqlmodel.sql.sqltypes.AutoString(length=64), nullable=False),
        sa.Column('key_prefix', sqlmodel.sql.sqltypes.AutoString(length=16), nullable=False),
        sa.Column('name', sqlmodel.sql.sqltypes.AutoString(length=100), nullable=False),
        sa.Column('last_used_at', sa.DateTime(), nullable=True),
        sa.Column('expires_at', sa.DateTime(), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False),
        sa.Column('scopes', sqlmodel.sql.sqltypes.AutoString(length=1000), nullable=True),
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('external_id', sqlmodel.sql.sqltypes.AutoString(length=255), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('created_by_id', sa.Uuid(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.Column('updated_by_id', sa.Uuid(), nullable=True),
        sa.Column('deleted_at', sa.DateTime(), nullable=True),
        sa.Column('deleted_by_id', sa.Uuid(), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['user.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_user_api_key_external_id'), 'user_api_key', ['external_id'], unique=True)
    op.create_index(op.f('ix_user_api_key_id'), 'user_api_key', ['id'], unique=False)
    op.create_index(op.f('ix_user_api_key_key_hash'), 'user_api_key', ['key_hash'], unique=True)
    op.create_index(op.f('ix_user_api_key_user_id'), 'user_api_key', ['user_id'], unique=False)


def downgrade():
    # Supprimer table et indexes
    op.drop_index(op.f('ix_user_api_key_user_id'), table_name='user_api_key')
    op.drop_index(op.f('ix_user_api_key_key_hash'), table_name='user_api_key')
    op.drop_index(op.f('ix_user_api_key_id'), table_name='user_api_key')
    op.drop_index(op.f('ix_user_api_key_external_id'), table_name='user_api_key')
    op.drop_table('user_api_key')
