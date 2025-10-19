"""add_backups_table

Revision ID: f1g2h3i4j5k6
Revises: 0a1b2c3d4e5f
Create Date: 2025-10-19 09:59:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = 'f1g2h3i4j5k6'
down_revision = '0a1b2c3d4e5f'
branch_labels = None
depends_on = None


def upgrade():
    # Create backups table
    op.create_table(
        'backups',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('description', sa.String(length=1000), nullable=True),
        sa.Column('backup_type', sa.String(length=50), nullable=False),
        sa.Column('status', sa.String(length=50), nullable=False),
        sa.Column('file_path', sa.String(length=500), nullable=True),
        sa.Column('file_size', sa.Integer(), nullable=True),
        sa.Column('error_message', sa.String(length=2000), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('completed_at', sa.DateTime(), nullable=True),
        sa.Column('created_by_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('includes_database', sa.Boolean(), nullable=False),
        sa.Column('includes_storage', sa.Boolean(), nullable=False),
        sa.Column('includes_config', sa.Boolean(), nullable=False),
        sa.Column('database_size', sa.Integer(), nullable=True),
        sa.Column('storage_size', sa.Integer(), nullable=True),
        sa.Column('config_size', sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(['created_by_id'], ['user.id'], ),
        sa.PrimaryKeyConstraint('id')
    )

    # Create indexes for frequently queried columns
    op.create_index(op.f('ix_backups_created_at'), 'backups', ['created_at'], unique=False)
    op.create_index(op.f('ix_backups_status'), 'backups', ['status'], unique=False)
    op.create_index(op.f('ix_backups_backup_type'), 'backups', ['backup_type'], unique=False)


def downgrade():
    # Drop indexes
    op.drop_index(op.f('ix_backups_backup_type'), table_name='backups')
    op.drop_index(op.f('ix_backups_status'), table_name='backups')
    op.drop_index(op.f('ix_backups_created_at'), table_name='backups')

    # Drop table
    op.drop_table('backups')
