"""backend_security_and_improvements

Revision ID: b2c3d4e5f6g7
Revises: a1b2c3d4e5f6
Create Date: 2025-10-23 13:00:00.000000

This migration adds security improvements and audit trail enhancements:
1. Adds deleted_at, deleted_by_id, updated_by_id, external_id to backups and scheduled_backups
2. These tables now inherit from AbstractBaseModel for soft delete and full audit trail

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = 'b2c3d4e5f6g7'
down_revision = 'a1b2c3d4e5f6'
branch_labels = None
depends_on = None


def upgrade():
    # Add AbstractBaseModel fields to backups table
    op.add_column('backups', sa.Column('external_id', sa.String(length=255), nullable=True))
    op.add_column('backups', sa.Column('updated_by_id', postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column('backups', sa.Column('deleted_at', sa.DateTime(), nullable=True))
    op.add_column('backups', sa.Column('deleted_by_id', postgresql.UUID(as_uuid=True), nullable=True))

    # Add indexes for backups
    op.create_index(op.f('ix_backups_external_id'), 'backups', ['external_id'], unique=True)

    # Add AbstractBaseModel fields to scheduled_backups table
    op.add_column('scheduled_backups', sa.Column('external_id', sa.String(length=255), nullable=True))
    op.add_column('scheduled_backups', sa.Column('updated_by_id', postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column('scheduled_backups', sa.Column('deleted_at', sa.DateTime(), nullable=True))
    op.add_column('scheduled_backups', sa.Column('deleted_by_id', postgresql.UUID(as_uuid=True), nullable=True))

    # Add indexes for scheduled_backups
    op.create_index(op.f('ix_scheduled_backups_external_id'), 'scheduled_backups', ['external_id'], unique=True)


def downgrade():
    # Remove indexes from scheduled_backups
    op.drop_index(op.f('ix_scheduled_backups_external_id'), table_name='scheduled_backups')

    # Remove AbstractBaseModel fields from scheduled_backups
    op.drop_column('scheduled_backups', 'deleted_by_id')
    op.drop_column('scheduled_backups', 'deleted_at')
    op.drop_column('scheduled_backups', 'updated_by_id')
    op.drop_column('scheduled_backups', 'external_id')

    # Remove indexes from backups
    op.drop_index(op.f('ix_backups_external_id'), table_name='backups')

    # Remove AbstractBaseModel fields from backups
    op.drop_column('backups', 'deleted_by_id')
    op.drop_column('backups', 'deleted_at')
    op.drop_column('backups', 'updated_by_id')
    op.drop_column('backups', 'external_id')
