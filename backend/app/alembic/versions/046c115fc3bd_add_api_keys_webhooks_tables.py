"""add api_keys and webhooks tables

Revision ID: l0m1n2o3p4q5
Revises: k9l0m1n2o3p4
Create Date: 2025-10-15 15:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
import uuid


# revision identifiers, used by Alembic.
revision = '046c115fc3bd'
down_revision = 'k9l0m1n2o3p4'
branch_labels = None
depends_on = None


def upgrade():
    # Create api_key table
    op.create_table(
        'api_key',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, default=uuid.uuid4),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('key', sa.String(length=500), nullable=False, index=True),
        sa.Column('environment', sa.String(length=50), nullable=False, server_default='production'),
        sa.Column('key_type', sa.String(length=50), nullable=False, server_default='secret'),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), nullable=False),
        # Audit fields from AbstractBaseModel
        sa.Column('external_id', sa.String(length=255), nullable=True, unique=True, index=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('created_by_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_by_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('deleted_by_id', postgresql.UUID(as_uuid=True), nullable=True),
        # Foreign key constraint
        sa.ForeignKeyConstraint(['user_id'], ['user.id'], ondelete='CASCADE'),
    )

    # Create webhook table
    op.create_table(
        'webhook',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, default=uuid.uuid4),
        sa.Column('url', sa.String(length=500), nullable=False),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('description', sa.String(length=1000), nullable=True),
        sa.Column('auth_type', sa.String(length=50), nullable=False, server_default='none'),
        sa.Column('status', sa.String(length=50), nullable=False, server_default='enabled'),
        sa.Column('events', postgresql.JSON(), nullable=True),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), nullable=False),
        # Audit fields from AbstractBaseModel
        sa.Column('external_id', sa.String(length=255), nullable=True, unique=True, index=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('created_by_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_by_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('deleted_by_id', postgresql.UUID(as_uuid=True), nullable=True),
        # Foreign key constraint
        sa.ForeignKeyConstraint(['user_id'], ['user.id'], ondelete='CASCADE'),
    )

    # Create webhook_log table
    op.create_table(
        'webhook_log',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, default=uuid.uuid4),
        sa.Column('webhook_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('action', sa.String(length=255), nullable=False),
        sa.Column('succeeded', sa.Boolean(), nullable=False),
        sa.Column('status_code', sa.Integer(), nullable=True),
        sa.Column('response_body', sa.String(length=5000), nullable=True),
        sa.Column('error_message', sa.String(length=1000), nullable=True),
        # Audit fields from AbstractBaseModel
        sa.Column('external_id', sa.String(length=255), nullable=True, unique=True, index=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('created_by_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_by_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('deleted_by_id', postgresql.UUID(as_uuid=True), nullable=True),
        # Foreign key constraint
        sa.ForeignKeyConstraint(['webhook_id'], ['webhook.id'], ondelete='CASCADE'),
    )


def downgrade():
    # Drop tables in reverse order (to respect foreign key constraints)
    op.drop_table('webhook_log')
    op.drop_table('webhook')
    op.drop_table('api_key')
